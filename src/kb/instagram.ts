import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
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
  thumbnail?: string;
  thumbnails?: { url?: string; width?: number; preference?: number }[];
  comments?: YtDlpComment[];
  entries?: YtDlpInfo[];
}

/**
 * Limpia y ordena comentarios: sin autor (privacidad), sin vacíos ni duplicados,
 * recortados y ordenados por likes (los más votados primero).
 */
export function cleanComments(raw: YtDlpComment[] | undefined): KbComment[] {
  const seen = new Set<string>();
  const out: KbComment[] = [];
  for (const c of raw ?? []) {
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
  const isVideo = !isPlaylist && (typeof info.duration === "number" || (!!info.vcodec && info.vcodec !== "none"));
  const kind: PostKind = isPlaylist ? "carrusel" : isVideo ? "reel" : "post";
  const handle = info.channel ?? first?.channel;
  const ts = info.timestamp ?? first?.timestamp;
  const comments = cleanComments(info.comments?.length ? info.comments : first?.comments);
  // Una imagen por slide (en un carrusel de fotos yt-dlp no descarga nada, pero sí trae sus URLs).
  const slides = isPlaylist ? (info.entries ?? []) : [info];
  const imageUrls = [...new Set(slides.map(bestImage).filter((u): u is string => !!u))];
  return {
    author: handle ? `@${handle.replace(/^@/, "")}` : undefined,
    publishedAt: typeof ts === "number" ? new Date(ts * 1000).toISOString().slice(0, 10) : undefined,
    kind,
    isVideo,
    caption: info.description ?? first?.description ?? undefined,
    comments,
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
  const res = await runYtDlp([
    "-J",
    "--write-comments",
    "--ignore-no-formats-error",
    "--no-warnings",
    ...resolveCookies(cookies),
    url,
  ]);
  if (res.code !== 0 || !res.stdout) return null;
  try {
    return parseYtDlpInfo(JSON.parse(res.stdout) as YtDlpInfo);
  } catch {
    return null;
  }
}

/**
 * Descarga solo el audio de un reel a un archivo temporal (para transcribir).
 * Devuelve la ruta y una función para limpiarlo, o null si no se pudo.
 */
export async function downloadAudio(
  url: string,
  cookies: { cookies?: string; cookiesFromBrowser?: string },
): Promise<{ path: string; cleanup: () => Promise<void> } | null> {
  if (!(await ytDlpAvailable())) return null;
  const id = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const dir = join(CACHE_DIR, `audio-${id}`);
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  const res = await runYtDlp([
    "-f", "ba/b",
    "-o", join(dir, "audio.%(ext)s"),
    "--no-playlist",
    "--no-warnings",
    ...resolveCookies(cookies),
    url,
  ]);
  const files = await readdir(dir).catch(() => [] as string[]);
  if (res.code !== 0 || !files.length) {
    await cleanup();
    return null;
  }
  return { path: join(dir, files[0]), cleanup };
}
