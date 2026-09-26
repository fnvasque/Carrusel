import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { createHash } from "node:crypto";
import { resolveCookies, runYtDlp, ytDlpAvailable } from "../remix/ytdlp.ts";
import type { KbComment, PostKind, PostMeta } from "./types.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "kb");

/** Tope de comentarios que se guardan/analizan (los más votados). */
export const MAX_COMMENTS = 60;

/** Tope de caracteres por comentario (evita pegar textos larguísimos al modelo). */
const MAX_COMMENT_CHARS = 400;

interface YtDlpComment {
  text?: unknown;
  like_count?: unknown;
}

interface YtDlpInfo {
  _type?: string;
  channel?: string;
  uploader_id?: string;
  uploader?: string;
  timestamp?: number;
  description?: string;
  title?: string;
  duration?: number;
  vcodec?: string;
  comment_count?: number;
  thumbnail?: string;
  thumbnails?: { url?: string; width?: number; preference?: number }[];
  /** Lista de comentarios; en carruseles yt-dlp deja aquí el texto de un generador de Python sin evaluar. */
  comments?: YtDlpComment[] | string;
  entries?: YtDlpInfo[];
}

/**
 * Limpia y ordena comentarios: sin autor (privacidad), sin vacíos ni duplicados,
 * recortados y ordenados por likes (los más votados primero).
 */
export function cleanComments(raw: YtDlpComment[] | string | undefined): KbComment[] {
  const seen = new Set<string>();
  const out: KbComment[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    if (typeof c?.text !== "string") continue;
    const text = c.text.replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT_CHARS);
    // Descarta vacíos y comentarios que son solo menciones/emojis.
    if (!text || !/[\p{L}\d]{2,}/u.test(text.replace(/@[\w.]+/g, ""))) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, likes: typeof c.like_count === "number" ? c.like_count : 0 });
  }
  return out.sort((a, b) => b.likes - a.likes).slice(0, MAX_COMMENTS);
}

/** Mejor imagen de una entrada: la miniatura más ancha, o `thumbnail` si no hay lista. */
function bestImage(info: YtDlpInfo): string | undefined {
  const thumbs = (info.thumbnails ?? []).filter((t) => typeof t.url === "string");
  if (thumbs.length) {
    return thumbs.reduce((a, b) => ((b.width ?? b.preference ?? 0) >= (a.width ?? a.preference ?? 0) ? b : a)).url;
  }
  return info.thumbnail;
}

/** Convierte el JSON de `yt-dlp -J` en metadatos del post. Función pura (testeable). */
export function parseYtDlpInfo(info: YtDlpInfo): PostMeta {
  const first = info.entries?.[0];
  const isPlaylist = info._type === "playlist";
  const videoLike = (i: YtDlpInfo): boolean => typeof i.duration === "number" || (!!i.vcodec && i.vcodec !== "none");
  const isVideo = !isPlaylist && videoLike(info);
  const kind: PostKind = isPlaylist ? "carrusel" : isVideo ? "reel" : "post";
  const handle = info.channel ?? first?.channel;
  const ts = info.timestamp ?? first?.timestamp;
  const comments = cleanComments(Array.isArray(info.comments) && info.comments.length ? info.comments : first?.comments);
  const commentCount = info.comment_count ?? first?.comment_count;
  // Una imagen por slide (en un carrusel de fotos yt-dlp no descarga nada, pero sí trae sus URLs).
  const slides = isPlaylist ? (info.entries ?? []) : [info];
  const imageUrls = [...new Set(slides.map(bestImage).filter((u): u is string => !!u))];
  return {
    author: handle ? `@${handle.replace(/^@/, "")}` : undefined,
    publishedAt: typeof ts === "number" ? new Date(ts * 1000).toISOString().slice(0, 10) : undefined,
    kind,
    isVideo,
    hasVideo: isPlaylist ? (info.entries ?? []).some(videoLike) : isVideo,
    caption: info.description ?? first?.description ?? undefined,
    comments,
    commentCount: typeof commentCount === "number" ? commentCount : undefined,
    imageUrls,
  };
}

/**
 * Metadatos + comentarios del post vía `yt-dlp -J --write-comments`. Best-effort:
 * si yt-dlp no está o falla (login wall, post de solo imágenes sin metadata),
 * devuelve null y el pipeline sigue con lo que obtenga la ingesta del remix.
 */
export async function fetchPostMeta(
  url: string,
  cookies: { cookies?: string; cookiesFromBrowser?: string },
): Promise<PostMeta | null> {
  if (!(await ytDlpAvailable())) return null;
  // Primero con comentarios; si falla (a veces la API de comentarios es lo que se
  // cae), se reintenta sin ellos para no perder caption, autor e imágenes.
  for (const withComments of [true, false]) {
    const res = await runYtDlp([
      "-J",
      ...(withComments ? ["--write-comments"] : []),
      "--ignore-no-formats-error",
      "--no-warnings",
      ...resolveCookies(cookies),
      url,
    ]);
    // En carruseles de fotos yt-dlp puede terminar con código ≠ 0 aunque imprima
    // el JSON completo: se usa la salida si es parseable, sin mirar el código.
    const info = parseJsonOutput(res.stdout);
    if (info) {
      const meta = parseYtDlpInfo(info);
      // Carruseles: yt-dlp no evalúa el generador de comentarios al volcar el JSON
      // (bug del extractor de Instagram). Se piden aparte vía su API de Python.
      if (withComments && !meta.comments.length && (meta.commentCount ?? 0) > 0) {
        meta.comments = cleanComments(await fetchCommentsViaPython(url, cookies));
      }
      return meta;
    }
    const reason = res.stderr.trim().split("\n").filter(Boolean).pop() ?? `código ${res.code}`;
    console.warn(`⚠️  yt-dlp no devolvió metadatos${withComments ? " (con comentarios)" : ""}: ${reason}`);
  }
  return null;
}

/**
 * Script Python que usa el módulo yt_dlp para extraer el post SIN procesarlo y
 * materializar el generador de comentarios. Recibe las mismas opciones que el
 * CLI (cookies) y la URL al final; imprime una lista JSON [{text, like_count}].
 */
const COMMENTS_PY = `
import json, sys, types
import yt_dlp
opts = yt_dlp.parse_options(sys.argv[1:]).ydl_opts
opts.update(quiet=True, no_warnings=True, skip_download=True, getcomments=True, ignore_no_formats_error=True)
with yt_dlp.YoutubeDL(opts) as ydl:
    info = ydl.extract_info(sys.argv[-1], download=False, process=False)
    comments = info.get("comments")
    for e in info.get("entries") or []:
        if comments is None and e.get("comments") is not None:
            comments = e["comments"]
    if isinstance(comments, types.GeneratorType):
        comments = list(comments)
    print(json.dumps([{"text": c.get("text"), "like_count": c.get("like_count")} for c in comments or []]))
`;

/** Ruta del ejecutable yt-dlp en el PATH (o undefined). */
function findYtDlp(): string | undefined {
  const names = process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n);
  }
  return undefined;
}

/**
 * Intérprete Python capaz de importar yt_dlp: el del shebang del ejecutable
 * (instalación con pip/Homebrew) o python3 con el binario en PYTHONPATH (el
 * yt-dlp "standalone" es un zipapp importable). Función pura (testeable).
 */
export function pythonForYtDlp(ytDlpPath: string, firstLine: string): { cmd: string; args: string[]; env?: Record<string, string> } {
  const shebang = firstLine.startsWith("#!") ? firstLine.slice(2).trim().split(/\s+/) : [];
  if (shebang.length && /python/i.test(shebang.join(" "))) {
    return { cmd: shebang[0], args: shebang.slice(1) };
  }
  return { cmd: "python3", args: [], env: { PYTHONPATH: ytDlpPath } };
}

/**
 * Comentarios de un post vía la API de Python de yt-dlp. Best-effort: si no hay
 * Python o falla, devuelve [] (los comentarios son un extra, no bloquean).
 */
export async function fetchCommentsViaPython(
  url: string,
  cookies: { cookies?: string; cookiesFromBrowser?: string },
  timeoutMs = 120_000,
): Promise<YtDlpComment[]> {
  const bin = findYtDlp();
  if (!bin) return [];
  const firstLine = (await readFile(bin).then((b) => b.subarray(0, 300).toString("latin1")).catch(() => "")).split("\n")[0];
  const py = pythonForYtDlp(bin, firstLine);
  return new Promise((resolveP) => {
    const proc = spawn(py.cmd, [...py.args, "-c", COMMENTS_PY, ...resolveCookies(cookies), url], {
      env: { ...process.env, ...py.env },
    });
    let stdout = "";
    const timer = setTimeout(() => { proc.kill("SIGKILL"); resolveP([]); }, timeoutMs);
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.on("error", () => { clearTimeout(timer); resolveP([]); });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed: unknown = JSON.parse(stdout.trim().split("\n").pop() ?? "");
        resolveP(Array.isArray(parsed) ? (parsed as YtDlpComment[]) : []);
      } catch {
        resolveP([]);
      }
    });
  });
}

/** Parsea la salida de `yt-dlp -J` (el JSON es la última línea no vacía). */
export function parseJsonOutput(stdout: string): YtDlpInfo | null {
  const line = stdout.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
  if (!line) return null;
  try {
    return JSON.parse(line) as YtDlpInfo;
  } catch {
    return null;
  }
}

/**
 * Descarga el audio (para transcribir) o el video completo (cuadros + audio) de
 * un reel a un temporal. Devuelve la ruta y una función para limpiarlo, o null.
 */
async function downloadMedia(
  url: string,
  cookies: { cookies?: string; cookiesFromBrowser?: string },
  what: "audio" | "video",
): Promise<{ path: string; cleanup: () => Promise<void> } | null> {
  if (!(await ytDlpAvailable())) return null;
  const id = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const dir = join(CACHE_DIR, `${what}-${id}`);
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  const res = await runYtDlp([
    // Video: el mejor formato con audio incluido; si no hay, video + audio unidos (ffmpeg).
    "-f", what === "audio" ? "ba/b" : "b/bv*+ba",
    "-o", join(dir, `${what}.%(ext)s`),
    "--no-playlist",
    "--no-warnings",
    ...resolveCookies(cookies),
    url,
  ]);
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => !f.endsWith(".part"));
  if (res.code !== 0 || !files.length) {
    await cleanup();
    return null;
  }
  return { path: join(dir, files[0]), cleanup };
}

/** Solo el audio de un reel (para transcribir). */
export const downloadAudio = (url: string, cookies: { cookies?: string; cookiesFromBrowser?: string }) =>
  downloadMedia(url, cookies, "audio");

/** El video completo de un reel (para sacar cuadros y audio de un mismo archivo). */
export const downloadVideo = (url: string, cookies: { cookies?: string; cookiesFromBrowser?: string }) =>
  downloadMedia(url, cookies, "video");
