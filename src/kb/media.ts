import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { hasFfmpeg } from "../remix/ingest.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "kb");

/** Tope de duración a transcribir (s): cubre reels y videos largos sin pasar el límite de 25 MB. */
const MAX_AUDIO_SECONDS = 20 * 60;

function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolveP) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    proc.on("error", () => resolveP(false));
    proc.on("close", (code) => resolveP(code === 0));
  });
}

/**
 * Convierte el audio/video descargado a MP3 mono 16 kHz (liviano, ideal para
 * transcripción). Devuelve la ruta o undefined si no hay ffmpeg o falla.
 */
export async function toSpeechMp3(input: string): Promise<string | undefined> {
  if (!(await hasFfmpeg())) return undefined;
  const out = join(dirname(input), "speech.mp3");
  const ok = await runFfmpeg([
    "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-t", String(MAX_AUDIO_SECONDS), "-y", out,
  ]);
  if (!ok) return undefined;
  const s = await stat(out).catch(() => undefined);
  return s && s.size > 0 ? out : undefined;
}

/**
 * Guarda una miniatura (ancho 480) a partir de un data URI, para mostrarla en la
 * ficha de Obsidian sin inflar el repo. Prefiere WebP; si el ffmpeg instalado no
 * trae el encoder de WebP (p. ej. el de Homebrew), cae a JPG. `outBase` va sin
 * extensión. Devuelve la ruta escrita, o undefined si no se pudo.
 */
export async function writeThumbnail(dataUri: string, outBase: string, width = 480): Promise<string | undefined> {
  const m = dataUri.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
  if (!m || !(await hasFfmpeg())) return undefined;
  const id = createHash("sha256").update(dataUri).digest("hex").slice(0, 16);
  const tmp = join(CACHE_DIR, `thumb-${id}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await mkdir(dirname(outBase), { recursive: true });
    await writeFile(tmp, Buffer.from(m[2], "base64"));
    const scale = ["-vf", `scale='min(${width},iw)':-2`];
    const attempts: [string, string[]][] = [
      [".webp", ["-q:v", "70"]],
      [".jpg", ["-q:v", "5"]],
    ];
    for (const [ext, quality] of attempts) {
      const out = outBase + ext;
      if (await runFfmpeg(["-i", tmp, ...scale, ...quality, "-frames:v", "1", "-y", out])) return out;
      await rm(out, { force: true }).catch(() => {});
    }
    return undefined;
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}

/** Un cuadro cada tantos segundos de video (reels). */
const FRAME_EVERY_SECONDS = 3;
/** Mínimo de cuadros por video (reels muy cortos o sin duración conocida). */
const MIN_FRAMES = 5;

/**
 * Cuántos cuadros sacar de un video: uno cada ~3 s, entre 5 y `max`.
 * Función pura (testeable).
 */
export function frameCount(durationSeconds: number | undefined, max: number): number {
  const wanted = durationSeconds && durationSeconds > 0 ? Math.ceil(durationSeconds / FRAME_EVERY_SECONDS) : MIN_FRAMES;
  return Math.max(1, Math.min(max, Math.max(MIN_FRAMES, wanted)));
}

/**
 * Cuadros equiespaciados de un video local como data URIs JPEG de 768 px de
 * ancho: es la resolución que el modelo usa en detail "high", y pesa ~10x menos
 * que un PNG a tamaño completo. Devuelve [] si no hay ffmpeg o falla.
 */
export async function videoFrames(path: string, n: number, durationSeconds?: number): Promise<string[]> {
  if (n <= 0 || !(await hasFfmpeg())) return [];
  const dir = join(CACHE_DIR, `frames-${createHash("sha256").update(path).digest("hex").slice(0, 16)}`);
  try {
    await mkdir(dir, { recursive: true });
    // fps tal que salgan n cuadros repartidos en todo el video; sin duración, 1 por segundo.
    const fps = durationSeconds && durationSeconds > 0 ? (n / durationSeconds).toFixed(4) : "1";
    const ok = await runFfmpeg([
      "-i", path, "-vf", `fps=${fps},scale='min(768,iw)':-2`, "-frames:v", String(n), "-q:v", "4", "-y",
      join(dir, "frame-%02d.jpg"),
    ]);
    if (!ok) return [];
    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort().slice(0, n);
    const out: string[] = [];
    for (const f of files) out.push(`data:image/jpeg;base64,${(await readFile(join(dir, f))).toString("base64")}`);
    return out;
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Ancho de las imágenes de la galería (legibles en Obsidian, livianas en disco). */
const GALLERY_WIDTH = 720;

/**
 * Guarda TODAS las imágenes del post en `dir` (01.jpg, 02.jpg…), reemplazando las
 * de un guardado anterior. La carpeta lleva su propio .gitignore: las imágenes se
 * ven en Obsidian pero no entran al repo (lo mantiene liviano). Devuelve las rutas.
 */
export async function writeGallery(images: string[], dir: string): Promise<string[]> {
  if (!images.length) return [];
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (const [i, uri] of images.entries()) {
    const path = await writeThumbnail(uri, join(dir, String(i + 1).padStart(2, "0")), GALLERY_WIDTH);
    if (path) out.push(path);
  }
  await writeFile(join(dirname(dir), ".gitignore"), "# Galerías de cada post: se ven en Obsidian, no van a git.\n*\n", "utf8");
  return out;
}
