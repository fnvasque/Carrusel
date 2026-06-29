import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { InstagramSource, MediaType, RemixOptions } from "./types.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "remix");

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

/** Carga una imagen local a data URI (para el modo manual --image). */
async function localImageToDataUri(path: string): Promise<string | undefined> {
  try {
    const buf = await readFile(path);
    const ext = extname(path).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Saca los hashtags del caption. */
function extractHashtags(caption: string): string[] {
  return [...caption.matchAll(/#[\p{L}\d_]+/gu)].map((m) => m[0]);
}

interface FetchResult {
  caption: string;
  thumbnailDataUri?: string;
}

/** Fetch del HTML público de IG + extracción de caption/thumbnail. Lanza si no sirve. */
async function fetchPublic(url: string): Promise<FetchResult> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "es,en;q=0.8" },
  });
  if (!res.ok) throw new Error(`Instagram respondió ${res.status}`);
  const html = await res.text();

  const caption = ogContent(html, "og:description") ?? jsonLdCaption(html) ?? ogContent(html, "og:title") ?? "";
  const imageUrl = ogContent(html, "og:image");
  const thumbnailDataUri = imageUrl ? await fetchImageAsDataUri(imageUrl) : undefined;

  if (!caption && !thumbnailDataUri) {
    throw new Error("El HTML público no trae caption ni imagen (probable login wall).");
  }
  return { caption, thumbnailDataUri };
}

function cachePath(url: string): string {
  const key = createHash("sha256").update(url).digest("hex");
  return join(CACHE_DIR, `${key}.json`);
}

/**
 * Convierte la URL (o el input manual) en un `InstagramSource` normalizado.
 * Nunca se cae por un fallo de red: degrada a modo manual. Solo aborta si, al
 * final, no hay ni caption ni imagen para analizar.
 */
export async function ingest(opts: RemixOptions): Promise<InstagramSource> {
  const type: MediaType = opts.url ? detectType(opts.url) : "unknown";

  // Caché por URL para no re-fetchear.
  if (opts.url && existsSync(cachePath(opts.url))) {
    try {
      const cached = JSON.parse(await readFile(cachePath(opts.url), "utf8")) as InstagramSource;
      console.log("✓ Ingesta recuperada de caché.");
      return cached;
    } catch {
      // caché corrupta: seguir adelante.
    }
  }

  let caption = "";
  let thumbnailDataUri: string | undefined;
  let mode: InstagramSource["source"] = "manual";

  if (opts.url) {
    try {
      const fetched = await fetchPublic(opts.url);
      caption = fetched.caption;
      thumbnailDataUri = fetched.thumbnailDataUri;
      mode = "fetch";
      console.log("✓ Contenido público de Instagram obtenido.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  No se pudo leer Instagram (${msg}). Uso el input manual si lo diste.`);
    }
  }

  // Fallback / complemento manual.
  if (opts.caption) caption = caption || opts.caption;
  const imagePaths = opts.image ?? [];
  if (!thumbnailDataUri && imagePaths.length) {
    thumbnailDataUri = await localImageToDataUri(imagePaths[0]);
  }

  if (!caption && !thumbnailDataUri) {
    throw new Error(
      "No hay nada que analizar. Pasa un link público accesible, o usa --caption \"...\" y/o --image ruta.png",
    );
  }

  const source: InstagramSource = {
    url: opts.url,
    type,
    caption,
    hashtags: extractHashtags(caption),
    thumbnailDataUri,
    imagePaths: imagePaths.length ? imagePaths : undefined,
    source: mode,
    partial: type === "reel" || !caption,
  };

  if (opts.url) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath(opts.url), JSON.stringify(source), "utf8");
  }

  return source;
}
