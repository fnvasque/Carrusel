import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fetchImageAsDataUri } from "../remix/ingest.ts";

/**
 * Videos de YouTube como fuente de la base: el usuario manda el link al bot (igual
 * que un post de Instagram) y de aquí salen título, canal, descripción, miniatura y
 * la transcripción. Primero los subtítulos del video (manuales o automáticos: gratis
 * y en segundos); si no hay, se baja solo el audio y el pipeline lo transcribe como
 * un reel. Todo con yt-dlp, sin sesión de Google.
 */

const CACHE_DIR = join(process.cwd(), ".cache", "kb");

/** Timeout por invocación de yt-dlp (ms). El audio de un video largo puede tardar. */
const YTDLP_TIMEOUT_MS = 180_000;

/** Tope del audio que se baja (MB): el pipeline transcribe a lo más 20 min igual. */
const MAX_AUDIO_MB = 60;

/** watch?v=, youtu.be/, shorts/, live/, embed/ … el id tiene 11 caracteres [A-Za-z0-9_-]. */
const YT_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/|embed\/|v\/))([\w-]{11})(?![\w-])/i;

/** Id del video (`Ut3LOjKNJaE`) desde cualquier forma del link, o undefined. */
export function youtubeIdFromUrl(url: string): string | undefined {
  return url.match(YT_ID)?.[1];
}

export function isYouTubeUrl(url: string): boolean {
  return YT_ID.test(url);
}

/** URL canónica sin parámetros de rastreo (`si=`, `t=`, `feature=`). */
export function normalizeYouTubeUrl(url: string): string {
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url.trim();
}

/** Todos los links de videos de YouTube de un texto, sin repetir el mismo video. */
export function findYouTubeUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"]+/gi)) {
    const id = youtubeIdFromUrl(m[0]);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(m[0]);
    }
  }
  return out;
}

/**
 * Texto plano de un archivo VTT: sin cabecera, números de cue, tiempos ni etiquetas
 * (`<c>`, `<00:00:01.000>`). Los subtítulos automáticos de YouTube repiten cada
 * línea en el cue siguiente (efecto "scroll"): se quitan las repeticiones
 * consecutivas. Función pura.
 */
const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

export function vttToText(vtt: string): string {
  const lines: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, "").replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e] ?? "").trim();
    if (!line) continue;
    if (/^WEBVTT/.test(line) || /^(Kind|Language|NOTE|STYLE|REGION)\b/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^\d{2}:\d{2}(:\d{2})?\.\d{3}\s+-->/.test(line)) continue;
    if (lines[lines.length - 1] === line) continue;
    lines.push(line);
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** Prioridad de idioma: español (cualquier variante), luego inglés, luego lo que haya. */
const LANG_PRIORITY = [/^es\b/i, /^en\b/i];

/**
 * Qué subtítulo bajar, UNO solo (pedir varios a la vez da 429 en YouTube):
 * manual antes que automático; en los automáticos, primero la pista original del
 * video (`xx-orig`: las traducidas automáticas suelen responder 429); luego español,
 * inglés o lo que haya. `manual`/`auto` son las claves que yt-dlp lista en
 * `subtitles` y `automatic_captions`. Devuelve undefined si no hay nada usable.
 */
export function pickSubtitle(manual: string[], auto: string[], videoLanguage?: string): { lang: string; auto: boolean } | undefined {
  // Claves de idioma (`es`, `es-419`, `es-US-orig`); fuera `live_chat` y similares.
  const usable = (langs: string[]) => langs.filter((l) => /^[a-z]{2,3}(-\w+)*$/i.test(l));
  const byPriority = (list: string[]): string | undefined => {
    for (const re of LANG_PRIORITY) {
      const hit = list.find((l) => re.test(l));
      if (hit) return hit;
    }
    return list[0];
  };
  const m = usable(manual);
  if (m.length) return { lang: byPriority(m)!, auto: false };
  const a = usable(auto);
  // Un video con doblaje automático trae una pista `-orig` por idioma de audio: la del
  // idioma del video es la hablada de verdad; si no se sabe, español, inglés o la primera.
  const origs = a.filter((l) => /-orig$/i.test(l));
  if (origs.length) {
    const spoken = videoLanguage && origs.find((l) => l.toLowerCase().startsWith(videoLanguage.toLowerCase()));
    return { lang: spoken || byPriority(origs)!, auto: true };
  }
  return a.length ? { lang: byPriority(a)!, auto: true } : undefined;
}

function runYtDlp(args: string[], timeoutMs = YTDLP_TIMEOUT_MS): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const proc = spawn("yt-dlp", ["--no-warnings", "--no-playlist", ...args]);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolveP({ code: -1, stdout, stderr: stderr + "\n[timeout]" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => { clearTimeout(timer); resolveP({ code: -1, stdout, stderr: `${stderr}\n${err.message}` }); });
    proc.on("close", (code) => { clearTimeout(timer); resolveP({ code: code ?? -1, stdout, stderr }); });
  });
}

/** Lo que yt-dlp devuelve con `-J` (solo lo que usamos). */
interface YtJson {
  id?: string;
  title?: string;
  description?: string;
  channel?: string;
  uploader?: string;
  uploader_id?: string;
  upload_date?: string;
  duration?: number;
  thumbnail?: string;
  /** Idioma hablado (ISO), cuando YouTube lo informa. */
  language?: string;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}

export interface YouTubeVideo {
  id: string;
  url: string;
  title: string;
  /** `@handle` del canal si lo hay; si no, el nombre del canal. */
  author?: string;
  /** AAAA-MM-DD. */
  publishedAt?: string;
  durationSeconds?: number;
  description: string;
  /** Miniatura como data URI (para la ficha y el modelo). */
  thumbnail?: string;
  /** Texto de los subtítulos, si el video los tiene. */
  transcript?: string;
  /** Audio descargado (solo si no hubo subtítulos), para transcribirlo. */
  audioPath?: string;
  cleanup: () => Promise<void>;
}

const errLine = (stderr: string): string =>
  stderr.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("ERROR")).pop()?.replace(/^ERROR:\s*/, "") ||
  stderr.trim().split("\n").pop() || "yt-dlp falló";

/**
 * Lee un video de YouTube: metadatos, miniatura y subtítulos; sin subtítulos, baja el
 * audio para transcribirlo después. Lanza con un mensaje legible si yt-dlp no está
 * o YouTube no entrega el video. Llama a `cleanup()` al terminar.
 */
export async function fetchYouTube(url: string, onProgress?: (msg: string) => void): Promise<YouTubeVideo> {
  const id = youtubeIdFromUrl(url);
  if (!id) throw new Error("Ese link no es de un video de YouTube.");
  const canonical = normalizeYouTubeUrl(url);
  const tmp = join(CACHE_DIR, `yt-${id}`);
  const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => {});
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  await mkdir(tmp, { recursive: true });

  try {
    // 1) Metadatos (sin descargar nada).
    onProgress?.("leyendo YouTube");
    const meta = await runYtDlp(["-J", "--skip-download", canonical]);
    if (meta.code !== 0 || !meta.stdout.trim()) {
      if (/ENOENT|spawn/.test(meta.stderr)) throw new Error("No tengo yt-dlp instalado para leer YouTube.");
      throw new Error(`YouTube no entregó el video: ${errLine(meta.stderr)}`);
    }
    let json: YtJson;
    try {
      json = JSON.parse(meta.stdout) as YtJson;
    } catch {
      throw new Error("yt-dlp devolvió metadatos ilegibles.");
    }
    const handle = json.uploader_id?.startsWith("@") ? json.uploader_id : undefined;
    const video: YouTubeVideo = {
      id,
      url: canonical,
      title: json.title?.trim() || `Video ${id}`,
      author: handle ?? json.channel ?? json.uploader,
      publishedAt: json.upload_date && /^\d{8}$/.test(json.upload_date)
        ? `${json.upload_date.slice(0, 4)}-${json.upload_date.slice(4, 6)}-${json.upload_date.slice(6, 8)}`
        : undefined,
      durationSeconds: typeof json.duration === "number" && json.duration > 0 ? json.duration : undefined,
      description: json.description?.trim() ?? "",
      cleanup,
    };
    if (json.thumbnail) video.thumbnail = (await fetchImageAsDataUri(json.thumbnail).catch(() => undefined)) || undefined;

    // 2) Subtítulos: uno solo, el mejor disponible.
    const pick = pickSubtitle(Object.keys(json.subtitles ?? {}), Object.keys(json.automatic_captions ?? {}), json.language);
    if (pick) {
      onProgress?.(`subtítulos ${pick.auto ? "automáticos" : ""} (${pick.lang})`.replace(/\s+/g, " "));
      const r = await runYtDlp([
        "--skip-download", pick.auto ? "--write-auto-subs" : "--write-subs", "--sub-langs", pick.lang, "--sub-format", "vtt",
        "-o", join(tmp, "sub"), canonical,
      ]);
      const vtt = (await readdir(tmp).catch(() => [] as string[])).find((f) => f.endsWith(".vtt"));
      if (vtt) {
        const text = vttToText(await readFile(join(tmp, vtt), "utf8"));
        if (text) video.transcript = text;
      } else if (r.code !== 0) {
        console.warn(`⚠️  Subtítulos de YouTube: ${errLine(r.stderr)}`);
      }
    }

    // 3) Sin subtítulos: solo el audio, para transcribirlo como un reel.
    if (!video.transcript) {
      onProgress?.("bajando el audio");
      const r = await runYtDlp([
        "-f", "bestaudio/best", "--max-filesize", `${MAX_AUDIO_MB}M`, "-o", join(tmp, "audio.%(ext)s"), canonical,
      ]);
      const audio = (await readdir(tmp).catch(() => [] as string[])).find((f) => f.startsWith("audio."));
      if (audio) video.audioPath = join(tmp, audio);
      else console.warn(`⚠️  Audio de YouTube: ${r.code === 0 ? "el video pesa más del tope" : errLine(r.stderr)}`);
    }
    return video;
  } catch (err) {
    await cleanup();
    throw err;
  }
}
