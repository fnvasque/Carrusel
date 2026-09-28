import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_MAX_PAGES, extractShortcode, extractUsername, findMediaViaBusinessDiscovery, type MetaMedia,
} from "../remix/providers/meta.ts";
import { discoverPost } from "./discover.ts";
import type { PostKind, PostMeta } from "./types.ts";

/**
 * Lectura de posts vía la API oficial de Meta (Business Discovery), sin tu
 * sesión de Instagram ni scraping. La API no busca por link: necesita el
 * @usuario dueño del post y recorre su feed hasta dar con el shortcode.
 * Limitación: solo cuentas Business/Creator públicas.
 */

const CACHE_DIR = join(process.cwd(), ".cache", "kb");

/** Falta el @usuario: el link no lo trae y no se indicó. El bot lo pregunta; la CLI pide --user. */
export class NeedsUserError extends Error {
  constructor() {
    super("Para leer el post con la API de Meta necesito saber de qué cuenta es: indica el @usuario (--user=cuenta).");
  }
}

/** Cuenta dueña del post: la indicada (acepta "@") o la que trae el link. */
export function resolveUser(url: string, user?: string): string | undefined {
  return user?.trim().replace(/^@/, "") || extractUsername(url);
}

/** Convierte un post de la API en metadatos de ficha. Función pura (testeable). */
export function metaToPostMeta(m: MetaMedia, username?: string): PostMeta {
  const kind: PostKind = m.media_type === "VIDEO" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carrusel" : "post";
  const children = m.children?.data ?? [];
  const slides = kind === "carrusel" && children.length ? children : [m];
  // Una imagen por slide: la foto, o la portada si la slide es un video.
  const imageUrls = slides
    .map((c) => (c.media_type === "VIDEO" ? c.thumbnail_url : (c.media_url ?? c.thumbnail_url)))
    .filter((u): u is string => !!u);
  return {
    author: username ? `@${username.replace(/^@/, "")}` : undefined,
    publishedAt: m.timestamp?.slice(0, 10),
    kind,
    isVideo: kind === "reel",
    hasVideo: kind === "reel" || children.some((c) => c.media_type === "VIDEO"),
    caption: m.caption,
    imageUrls: [...new Set(imageUrls)],
    videoUrl: kind === "reel" ? m.media_url : undefined,
  };
}

export interface DiscoveryHints {
  /** Caption conocido (p. ej. el que trae un DM compartido): da @menciones y hashtags. */
  caption?: string;
  /** Texto que acompañó al link. */
  text?: string;
  /** Cuentas ya guardadas en la base (candidatas). */
  knownAccounts?: string[];
}

/**
 * Metadatos y medios de un post vía la API de Meta. Con la cuenta, Business
 * Discovery directo; sin ella, se intenta descubrir (menciones, cuentas ya
 * guardadas, hashtags). Lanza NeedsUserError solo si no hubo forma.
 */
export async function fetchPostViaMeta(
  url: string,
  user?: string,
  hints: DiscoveryHints = {},
  log: (msg: string) => void = () => {},
): Promise<PostMeta> {
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new Error("Ese link no es de un post, reel o carrusel de Instagram.");
  const username = resolveUser(url, user);
  if (username) return metaToPostMeta(await findMediaViaBusinessDiscovery(username, shortcode, DEFAULT_MAX_PAGES), username);
  log("buscando de qué cuenta es…");
  const found = await discoverPost(shortcode, hints, log);
  if (!found) throw new NeedsUserError();
  return metaToPostMeta(found.media, found.username);
}

/**
 * Descarga el video de un reel (media_url de la API) a un temporal, para sacar
 * cuadros y audio. Devuelve la ruta y una función para limpiarlo, o null.
 */
export async function downloadVideo(videoUrl: string): Promise<{ path: string; cleanup: () => Promise<void> } | null> {
  const path = join(CACHE_DIR, `video-${createHash("sha256").update(videoUrl).digest("hex").slice(0, 16)}.mp4`);
  const cleanup = () => rm(path, { force: true }).catch(() => {});
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
    return { path, cleanup };
  } catch {
    await cleanup();
    return null;
  }
}
