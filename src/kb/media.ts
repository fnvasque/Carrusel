import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
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
export async function writeThumbnail(dataUri: string, outBase: string): Promise<string | undefined> {
  const m = dataUri.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
  if (!m || !(await hasFfmpeg())) return undefined;
  const id = createHash("sha256").update(dataUri).digest("hex").slice(0, 16);
  const tmp = join(CACHE_DIR, `thumb-${id}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await mkdir(dirname(outBase), { recursive: true });
    await writeFile(tmp, Buffer.from(m[2], "base64"));
    const scale = ["-vf", "scale='min(480,iw)':-2"];
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
