import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { ytDlpAvailable, ingestViaYtDlp } from "./ytdlp.ts";
import type { InstagramSource, MediaType, RemixOptions } from "./types.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "remix");

/** Tope de imágenes que se descargan/analizan de un post. */
export const MAX_INGEST_IMAGES = 10;

/** User-Agent de navegador para mejorar las chances de que IG sirva el HTML público. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Detecta el tipo de pieza por el patrón de la URL de Instagram.
 * `/reel/`, `/reels/`, `/tv/` → reel; `/p/` → post (carrusel se trata como post).
 */
export function detectType(url: string): MediaType {
  if (/instagram\.com/i.test(url)) {
    if (/\/(reels?|tv)\//i.test(url)) return "reel";
    if (/\/p\//i.test(url)) return "post";
    return "unknown";
  }
  return "unknown";
}

/** Extrae el contenido de un <meta property="og:..." content="..."> tolerante a orden de atributos. */
function ogContent(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

/** Intenta sacar el caption del primer bloque JSON-LD si og: no lo trae. */
function jsonLdCaption(html: string): string | undefined {
  const m = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return undefined;
  try {
    const data = JSON.parse(m[1]);
    const node = Array.isArray(data) ? data[0] : data;
    const cap = node?.caption ?? node?.articleBody ?? node?.description;
    return typeof cap === "string" ? decodeEntities(cap) : undefined;
  } catch {
    return undefined;
  }
}

/** Decodifica las entidades HTML más comunes presentes en og:description. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x?[0-9a-f]+;/gi, "");
}

/** Normaliza una URL embebida en JSON (unescape de \/ y &amp;). */
function unescapeUrl(u: string): string {
  return u.replace(/\\\//g, "/").replace(/\\u0026/gi, "&").replace(/&amp;/g, "&");
}

/**
 * Junta todas las URLs de imagen candidatas del HTML: og:image + todas las
 * `"display_url":"..."` del JSON embebido (cada slide de un carrusel). Filtra por
 * host de contenido de IG/FB y deduplica.
 */
export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const og = ogContent(html, "og:image");
  if (og) urls.push(og);
  for (const m of html.matchAll(/"display_url":"([^"]+)"/g)) {
    urls.push(unescapeUrl(m[1]));
  }
  // Solo CDNs de contenido (evita avatares de perfil y assets de UI).
  const filtered = urls
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u) && /(cdninstagram|fbcdn)/i.test(u));
  return [...new Set(filtered)].slice(0, MAX_INGEST_IMAGES);
}

/** Extrae la URL del video de un reel (og:video o "video_url" del JSON embebido). */
export function extractVideoUrl(html: string): string | undefined {
  const og = ogContent(html, "og:video") ?? ogContent(html, "og:video:secure_url");
  if (og) return og;
  const m = html.match(/"video_url":"([^"]+)"/);
  return m ? unescapeUrl(m[1]) : undefined;
}

/** Descarga una imagen remota y la devuelve como data URI. */
async function fetchImageAsDataUri(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Carga una imagen local a data URI (para el modo manual --image o medios de yt-dlp). */
export async function localImageToDataUri(path: string): Promise<string | undefined> {
  try {
    const buf = await readFile(path);
    const ext = extname(path).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** ¿Hay ffmpeg en el PATH? (best-effort). */
export async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolveP) => {
    const proc = spawn("ffmpeg", ["-version"]);
    proc.on("error", () => resolveP(false));
    proc.on("close", (code) => resolveP(code === 0));
  });
}

/** Duración del video en segundos, parseada del stderr de ffmpeg. */
function probeDuration(path: string): Promise<number | undefined> {
  return new Promise((resolveP) => {
    const proc = spawn("ffmpeg", ["-i", path]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", () => resolveP(undefined));
    proc.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolveP(undefined);
      const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      resolveP(Number.isFinite(secs) && secs > 0 ? secs : undefined);
    });
  });
}

/** Ejecuta ffmpeg con args y resuelve true si el código de salida es 0. */
function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolveP) => {
    const proc = spawn("ffmpeg", args);
    proc.on("error", () => resolveP(false));
    proc.on("close", (code) => resolveP(code === 0));
  });
}

/**
 * Muestrea `n` frames equiespaciados de un archivo de video LOCAL con ffmpeg,
 * devolviéndolos como data URIs. Reutilizable por el path URL (extractReelFrames)
 * y por el proveedor yt-dlp. Si ffmpeg falta o algo falla, devuelve []. Limpia el
 * directorio temporal de frames.
 */
export async function framesFromLocalVideo(path: string, n: number): Promise<string[]> {
  if (!(await hasFfmpeg())) {
    console.warn("⚠️  ffmpeg no está en el PATH: no puedo extraer frames del video (uso el thumbnail).");
    return [];
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const id = createHash("sha256").update(path).digest("hex").slice(0, 16);
  const framesDir = join(CACHE_DIR, `frames-${id}`);
  try {
    await mkdir(framesDir, { recursive: true });
    const dur = await probeDuration(path);
    // fps tal que salgan ~n frames a lo largo del video; fallback: 1 fps.
    const fps = dur && dur > 0 ? (n / dur).toFixed(4) : "1";
    const ok = await runFfmpeg([
      "-i", path,
      "-vf", `fps=${fps}`,
      "-frames:v", String(n),
      "-y",
      join(framesDir, "frame-%02d.png"),
    ]);
    if (!ok) return [];

    const files = (await readdir(framesDir)).filter((f) => f.endsWith(".png")).sort();
    const uris: string[] = [];
    for (const f of files.slice(0, n)) {
      const buf = await readFile(join(framesDir, f));
      uris.push(`data:image/png;base64,${buf.toString("base64")}`);
    }
    return uris;
  } catch {
    return [];
  } finally {
    await rm(framesDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Descarga el MP4 de un reel por URL y muestrea `n` frames equiespaciados con
 * ffmpeg (delega en framesFromLocalVideo). Si no hay video/ffmpeg o algo falla,
 * devuelve []. Limpia el video temporal.
 */
export async function extractReelFrames(videoUrl: string, n: number): Promise<string[]> {
  await mkdir(CACHE_DIR, { recursive: true });
  const id = createHash("sha256").update(videoUrl).digest("hex").slice(0, 16);
  const tmpVideo = join(CACHE_DIR, `tmp-${id}.mp4`);
  try {
    const res = await fetch(videoUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    await writeFile(tmpVideo, Buffer.from(await res.arrayBuffer()));
    return await framesFromLocalVideo(tmpVideo, n);
  } catch {
    return [];
  } finally {
    await rm(tmpVideo, { force: true }).catch(() => {});
  }
}

/** Saca los hashtags del caption. */
function extractHashtags(caption: string): string[] {
  return [...caption.matchAll(/#[\p{L}\d_]+/gu)].map((m) => m[0]);
}

interface FetchResult {
  caption: string;
  imageUrls: string[];
  videoUrl?: string;
}

/** Fetch del HTML público de IG + extracción de caption/imágenes/video. Lanza si no sirve. */
async function fetchPublic(url: string): Promise<FetchResult> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "es,en;q=0.8" },
  });
  if (!res.ok) throw new Error(`Instagram respondió ${res.status}`);
  const html = await res.text();

  const caption = ogContent(html, "og:description") ?? jsonLdCaption(html) ?? ogContent(html, "og:title") ?? "";
  const imageUrls = extractImageUrls(html);
  const videoUrl = extractVideoUrl(html);

  if (!caption && !imageUrls.length && !videoUrl) {
    throw new Error("El HTML público no trae caption, imágenes ni video (probable login wall).");
  }
  return { caption, imageUrls, videoUrl };
}

function cachePath(url: string): string {
  const key = createHash("sha256").update(url).digest("hex");
  return join(CACHE_DIR, `${key}.json`);
}

/**
 * Convierte la URL (o el input manual) en un `InstagramSource` normalizado con
 * TODAS las imágenes posibles: todas las slides de un carrusel, o varios frames de
 * un reel. Nunca se cae por un fallo de red: degrada a thumbnail/manual. Solo
 * aborta si, al final, no hay ni imágenes ni caption.
 */
export async function ingest(opts: RemixOptions): Promise<InstagramSource> {
  const type: MediaType = opts.url ? detectType(opts.url) : "unknown";

  // Caché por URL para no re-fetchear.
  if (opts.url && existsSync(cachePath(opts.url))) {
    try {
      const cached = JSON.parse(await readFile(cachePath(opts.url), "utf8")) as InstagramSource;
      if (cached.mediaDataUris?.length || cached.caption) {
        console.log("✓ Ingesta recuperada de caché.");
        return cached;
      }
    } catch {
      // caché corrupta o de un formato viejo: re-ingerir.
    }
  }

  let caption = "";
  let mediaDataUris: string[] = [];
  let mode: InstagramSource["source"] = "manual";

  // Fuente preferente: yt-dlp (más confiable; vence login wall con cookies).
  if (opts.url && (await ytDlpAvailable())) {
    try {
      const r = await ingestViaYtDlp(opts.url, opts);
      if (r && (r.mediaDataUris.length || r.caption)) {
        caption = r.caption;
        mediaDataUris = r.mediaDataUris;
        mode = "fetch";
        console.log(`✓ yt-dlp: ${mediaDataUris.length} medio(s).`);
      }
    } catch {
      console.warn("⚠️  yt-dlp falló; sigo con scraping público.");
    }
  }

  // Degradación 1: scraping público (si yt-dlp no aportó media).
  if (opts.url && !mediaDataUris.length) {
    try {
      const fetched = await fetchPublic(opts.url);
      caption = caption || fetched.caption;
      mode = "fetch";

      if (type === "reel" && fetched.videoUrl) {
        // Reel: preferir frames del video para el análisis slide-por-slide.
        mediaDataUris = await extractReelFrames(fetched.videoUrl, opts.frames ?? 5);
      }
      if (!mediaDataUris.length && fetched.imageUrls.length) {
        // Carrusel/post (o reel sin frames): descargar todas las imágenes.
        for (const u of fetched.imageUrls) {
          const uri = await fetchImageAsDataUri(u);
          if (uri) mediaDataUris.push(uri);
        }
      }
      console.log(`✓ Contenido público de Instagram obtenido (${mediaDataUris.length} imagen/es).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  No se pudo leer Instagram (${msg}). Uso el input manual si lo diste.`);
    }
  }

  // Fallback / complemento manual: cargar TODAS las --image.
  if (opts.caption) caption = caption || opts.caption;
  const imagePaths = opts.image ?? [];
  if (!mediaDataUris.length && imagePaths.length) {
    for (const p of imagePaths) {
      const uri = await localImageToDataUri(p);
      if (uri) mediaDataUris.push(uri);
    }
  }

  mediaDataUris = [...new Set(mediaDataUris)].slice(0, MAX_INGEST_IMAGES);

  if (!caption && !mediaDataUris.length) {
    throw new Error(
      "No hay nada que analizar. Pasa un link público accesible, o usa --caption \"...\" y/o --image ruta.png",
    );
  }

  const source: InstagramSource = {
    url: opts.url,
    type,
    caption,
    hashtags: extractHashtags(caption),
    mediaDataUris,
    thumbnailDataUri: mediaDataUris[0],
    imagePaths: imagePaths.length ? imagePaths : undefined,
    source: mode,
    partial: mediaDataUris.length <= 1 && !caption,
  };

  if (opts.url) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath(opts.url), JSON.stringify(source), "utf8");
  }

  return source;
}
