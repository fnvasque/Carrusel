import { graphGet } from "../../meta/client.ts";
import { metaConfig } from "../../meta/env.ts";
import { extractReelFrames, fetchImageAsDataUri, MAX_INGEST_IMAGES } from "../ingest.ts";
import type { MediaType, RemixOptions } from "../types.ts";

/**
 * Proveedor de ingesta vía la API oficial de Meta (Business Discovery): lee un
 * post público de una cuenta Business/Creator sin tu sesión ni scraping. La API no
 * busca por URL, así que se recorre el feed de la cuenta hasta dar con el
 * shortcode del link.
 */

/** Páginas de 50 posts que se recorren por defecto (cuida la cuota). */
export const DEFAULT_MAX_PAGES = 10;

const PAGE_SIZE = 50;
const MEDIA_FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,children{media_type,media_url,thumbnail_url}";

/** Segmentos de ruta de Instagram que no son un @usuario. */
const RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);

export interface MetaChild {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
}

export interface MetaMedia extends MetaChild {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  children?: { data?: MetaChild[] };
}

/** Shortcode de un link de post/reel: `/p/`, `/reel/`, `/reels/`, `/tv/`, también `/{usuario}/p/{code}/`. */
export function extractShortcode(url: string): string | undefined {
  return url.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/i)?.[1];
}

/** @usuario del link, solo si la URL lo trae (`instagram.com/{usuario}/p/{code}/`). */
export function extractUsername(url: string): string | undefined {
  const m = url.match(/instagram\.com\/([\w.]+)\/(?:p|reels?|tv)\/[\w-]+/i);
  return m && !RESERVED.has(m[1].toLowerCase()) ? m[1] : undefined;
}

/** Busca el post por shortcode (un reel puede tener permalink `/reel/` o `/p/`: se compara solo el código). */
export function findByShortcode<T extends { permalink?: string }>(mediaList: T[], shortcode: string): T | undefined {
  return mediaList.find((m) => m.permalink && extractShortcode(m.permalink) === shortcode);
}

/** Tipo de pieza a partir de `media_type` de la API. */
export function mediaTypeOf(metaType: string | undefined): MediaType {
  if (metaType === "VIDEO") return "reel";
  if (metaType === "CAROUSEL_ALBUM") return "carousel";
  if (metaType === "IMAGE") return "post";
  return "unknown";
}

interface DiscoveryPage {
  business_discovery?: {
    media?: { data?: MetaMedia[]; paging?: { cursors?: { after?: string } } };
  };
}

/** ¿Quedan más páginas? (Business Discovery solo trae el cursor, sin `paging.next`). Función pura. */
export function hasMorePages(pageLength: number, after: string | undefined, pageSize = PAGE_SIZE): boolean {
  return !!after && pageLength >= pageSize;
}

/** Recorre el feed de @username (páginas de 50) hasta encontrar el shortcode. */
export async function findMediaViaBusinessDiscovery(
  username: string,
  shortcode: string,
  maxPages = DEFAULT_MAX_PAGES,
): Promise<MetaMedia> {
  const { igUserId } = metaConfig();
  let after: string | undefined;
  let seen = 0;
  for (let page = 1; page <= maxPages; page++) {
    const media = after ? `media.after(${after}).limit(${PAGE_SIZE})` : `media.limit(${PAGE_SIZE})`;
    const res = await graphGet<DiscoveryPage>(igUserId, {
      fields: `business_discovery.username(${username}){${media}{${MEDIA_FIELDS}}}`,
    });
    const data = res.business_discovery?.media?.data ?? [];
    seen += data.length;
    const hit = findByShortcode(data, shortcode);
    if (hit) return hit;
    after = res.business_discovery?.media?.paging?.cursors?.after;
    // Business Discovery no devuelve `paging.next`: hay más si vino un cursor y la página llegó llena.
    if (!hasMorePages(data.length, after)) {
      throw new Error(`No encontré el post ${shortcode} en los ${seen} posts de @${username}. ¿Es de otra cuenta? Revisa --user.`);
    }
  }
  throw new Error(
    `No encontré el post ${shortcode} en los primeros ${seen} posts de @${username} (tope --max-pages=${maxPages}). ` +
      "Si es más antiguo, sube --max-pages.",
  );
}

/** Descarga una imagen (media_url o, si falta, thumbnail_url) como data URI. */
async function imageOf(m: MetaChild): Promise<string | undefined> {
  for (const u of [m.media_url, m.thumbnail_url]) {
    if (!u) continue;
    const uri = await fetchImageAsDataUri(u);
    if (uri) return uri;
  }
  return undefined;
}

/**
 * Convierte un post de la API a data URIs: slides de un carrusel, la imagen de un
 * post, o frames de un reel (con respaldo en su thumbnail si no hay media_url,
 * p. ej. por audio con copyright, o si no hay ffmpeg).
 */
export async function mediaToDataUris(m: MetaMedia, frames = 5): Promise<string[]> {
  const out: string[] = [];
  if (m.media_type === "VIDEO") {
    if (m.media_url) out.push(...(await extractReelFrames(m.media_url, frames)));
    if (!out.length && m.thumbnail_url) {
      const thumb = await fetchImageAsDataUri(m.thumbnail_url);
      if (thumb) out.push(thumb);
    }
  } else if (m.media_type === "CAROUSEL_ALBUM" && m.children?.data?.length) {
    for (const child of m.children.data) {
      if (out.length >= MAX_INGEST_IMAGES) break;
      // En un carrusel, cada video aporta su portada (thumbnail_url) como slide.
      const uri = await imageOf(child.media_type === "VIDEO" ? { thumbnail_url: child.thumbnail_url } : child);
      if (uri) out.push(uri);
    }
  } else {
    const uri = await imageOf(m);
    if (uri) out.push(uri);
  }
  return out.slice(0, MAX_INGEST_IMAGES);
}

/**
 * Ingesta de un link vía Business Discovery. Lanza con un mensaje claro si no se
 * puede (sin config de Meta, sin @usuario, cuenta no Business/Creator, post no
 * encontrado); `ingest()` lo reporta y pasa al siguiente nivel.
 */
export async function ingestViaMeta(
  url: string,
  opts: Pick<RemixOptions, "user" | "maxPages" | "frames">,
): Promise<{ caption: string; mediaDataUris: string[]; type: MediaType }> {
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new Error("el link no parece un post, reel o carrusel de Instagram.");
  const username = opts.user?.replace(/^@/, "").trim() || extractUsername(url);
  if (!username) {
    throw new Error("la API de Meta necesita saber de qué cuenta es el post: agrega --user=cuenta (el link no trae el @usuario).");
  }
  const media = await findMediaViaBusinessDiscovery(username, shortcode, opts.maxPages ?? DEFAULT_MAX_PAGES);
  const mediaDataUris = await mediaToDataUris(media, opts.frames ?? 5);
  return { caption: media.caption ?? "", mediaDataUris, type: mediaTypeOf(media.media_type) };
}
