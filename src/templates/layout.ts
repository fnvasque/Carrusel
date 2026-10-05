import type { Format } from "./types.ts";
import { FORMATS } from "./types.ts";
import { theme } from "../theme.ts";
import { estimateLines, CONTENT_WIDTH } from "./fit.ts";

/**
 * Geometría compartida entre `Frame` y las plantillas, y estimadores de alto de
 * texto. Las plantillas los usan para elegir, de mayor a menor, la escala que
 * llena el área útil sin desbordarla (SSR: no hay medición real en el render).
 */

/** Margen inferior reservado en Reels: la UI de IG tapa los últimos ~420px. */
export const REEL_SAFE_BOTTOM = 440;
/** Margen superior en Reels (la cabecera de IG tapa el borde de arriba). */
export const REEL_SAFE_TOP = 150;
/** Margen vertical del post (arriba y abajo). */
export const POST_PAD_Y = theme.padding - 24;
/** Alto de la cabecera de marca (etiqueta + wordmark). */
export const HEADER_HEIGHT = 44;
/** Aire entre la cabecera y el contenido. */
export const CONTENT_GAP_TOP = 40;
/** Fuente al pie: mono 24 px, interlineado 1.35. */
export const SOURCE_SIZE = 24;
const SOURCE_LINE = Math.round(SOURCE_SIZE * 1.35);
/** Aire entre el contenido y la fuente al pie. */
const SOURCE_GAP = 32;

/** Ancho medio de un carácter, en em (medido en Chromium). */
export const CHAR_EM = { inter: 0.48, interSemibold: 0.53, mono: 0.6 } as const;

/** Nº de líneas de la fuente al pie (mono, ancho útil completo). */
export function sourceLines(source?: string): number {
  if (!source) return 0;
  return wrapLines(source, SOURCE_SIZE * CHAR_EM.mono, CONTENT_WIDTH);
}

/** Alto reservado abajo para la fuente al pie (0 si no hay). */
export function sourceReserve(source?: string): number {
  const n = sourceLines(source);
  return n ? n * SOURCE_LINE + SOURCE_GAP : 0;
}

/**
 * "Centro óptico": el bloque de contenido se centra entre cabecera y pie, pero
 * levantado unos px (el ojo percibe el centro geométrico como bajo).
 */
export function opticalLift(format: Format = "post"): number {
  return format === "reel" ? 56 : 40;
}

/** Alto disponible para el bloque de contenido (descontando cabecera, pie y alza óptica). */
export function contentHeight(format: Format = "post", source?: string): number {
  const h = FORMATS[format].height;
  const padTop = format === "reel" ? REEL_SAFE_TOP : POST_PAD_Y;
  const padBottom = format === "reel" ? REEL_SAFE_BOTTOM : POST_PAD_Y;
  return h - padTop - padBottom - HEADER_HEIGHT - CONTENT_GAP_TOP - sourceReserve(source) - opticalLift(format);
}

/**
 * Nº de líneas de `text` con corte por palabras, dado el ancho medio de un
 * carácter (px) y el ancho de caja. Respeta los "\n" explícitos (pre-wrap).
 */
export function wrapLines(text: string, charPx: number, width: number): number {
  let total = 0;
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      total++;
      continue;
    }
    let lines = 1;
    let x = 0;
    for (const w of words) {
      const ww = w.length * charPx;
      if (x === 0) x = ww;
      else if (x + charPx + ww <= width) x += charPx + ww;
      else {
        lines++;
        // Una palabra más ancha que la caja se parte en varias líneas.
        lines += Math.max(0, Math.ceil(ww / width) - 1);
        x = ww % width || ww;
      }
    }
    total += lines;
  }
  return total;
}

/** Alto (px) de un texto Inter a `size` con `lineHeight`, en `width`. */
export function interHeight(text: string, size: number, width: number, lineHeight: number, em: number = CHAR_EM.inter): number {
  return wrapLines(text, size * em, width) * size * lineHeight;
}

/** Alto (px) de un titular Anton a `size` con `lineHeight`, en `width`. */
export function antonHeight(text: string, size: number, lineHeight: number, width: number = CONTENT_WIDTH): number {
  return estimateLines(text, size, width) * size * lineHeight;
}

/**
 * Recorre `candidates` (de la más grande a la más chica) y devuelve la primera
 * cuyo alto estimado cabe en `available`; si ninguna cabe, la última.
 */
export function pickFit<T>(candidates: T[], height: (c: T) => number, available: number): T {
  for (const c of candidates) if (height(c) <= available) return c;
  return candidates[candidates.length - 1];
}
