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
/**
 * Margen lateral mínimo del texto pintado (post y reel): la revisión visual marca
 * el texto que se acerca más que esto a un costado del lienzo. El contenido usa
 * `theme.padding` (96 px); los 36 px de diferencia absorben la caja del mark y la
 * tinta que sobresale.
 */
export const MARGEN_LATERAL = 60;
/** Margen vertical del post (arriba y abajo). */
export const POST_PAD_Y = theme.padding - 24;
/** Alto de la cabecera de marca (serie a la izquierda, firma compacta a la derecha en el reel). */
export const HEADER_HEIGHT = 44;
/** Aire entre la cabecera y el contenido. */
export const CONTENT_GAP_TOP = 40;

/**
 * Franja vertical del texto del contenido, en fracciones del alto (valen a
 * cualquier escala). Empieza bajo la cabecera de marca, para que una etiqueta
 * sola no cuente como texto; termina donde empieza la UI de IG (reel) o el
 * margen del post (4:5).
 */
export function franjaSegura(w: number, h: number): [number, number] {
  if (h / w > 1.5) {
    const H = FORMATS.reel.height;
    return [(REEL_SAFE_TOP + HEADER_HEIGHT + CONTENT_GAP_TOP) / H, (H - REEL_SAFE_BOTTOM) / H];
  }
  const H = FORMATS.post.height;
  return [(POST_PAD_Y + HEADER_HEIGHT + CONTENT_GAP_TOP) / H, 1 - (POST_PAD_Y + firmaReserve("post")) / H];
}
/** Círculo de la firma del pie del post (px). */
export const FIRMA_SIZE = 84;
/** Aire entre la firma del pie y lo que va encima (fuente o contenido). */
const FIRMA_GAP = 28;
/**
 * Alto reservado abajo para la firma del post (círculo + aire). En el reel la
 * firma va en la cabecera: no reserva nada.
 */
export function firmaReserve(format: Format = "post"): number {
  return format === "reel" ? 0 : FIRMA_SIZE + FIRMA_GAP;
}
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
  return format === "reel" ? 48 : 40;
}

/**
 * Fracción máxima del alto útil que ocupa el bloque en el reel cuando hay
 * escalas de sobra: el 9:16 es alto y un bloque al tamaño del post deja una
 * franja vacía, así que las escaleras del reel suben más que las del post; este
 * tope deja aire arriba y abajo. En post se llena hasta el 100 %.
 */
export const REEL_FILL = 0.88;

/**
 * Como `pickFit`, pero en el reel prefiere la mayor escala que ocupa a lo sumo
 * `fill` (por defecto `REEL_FILL`) del alto útil, y si ninguna cabe ahí, la
 * mayor que cabe en el alto completo. Una plantilla cuyo estimador sobreestima
 * (Step: tarjeta + viñetas) puede pedir un `fill` mayor.
 */
export function pickFill<T>(candidates: T[], height: (c: T) => number, available: number, format: Format = "post", fill: number = REEL_FILL): T {
  if (format === "reel") {
    const c = candidates.find((x) => height(x) <= available * fill);
    if (c !== undefined) return c;
  }
  return pickFit(candidates, height, available);
}

/**
 * Alto (px) que el subtítulo de la narración ocupa sobre la fuente al pie en el
 * reel (pastilla de ≤ 2 líneas a 44 px + separación): el contenido se centra
 * por encima para no pisarlo. Solo cuando la escena lleva `narracion`.
 */
export const SUBTITULO_RESERVA = 170;

/** Reserva del subtítulo para una escena (0 en post o sin narración). */
export function subtituloReserve(format: Format = "post", narracion?: string): number {
  return format === "reel" && typeof narracion === "string" && narracion.trim() ? SUBTITULO_RESERVA : 0;
}

/** Alto disponible para el bloque de contenido (descontando cabecera, fuente, firma, subtítulo y alza óptica). */
export function contentHeight(format: Format = "post", source?: string, narracion?: string): number {
  const h = FORMATS[format].height;
  const padTop = format === "reel" ? REEL_SAFE_TOP : POST_PAD_Y;
  const padBottom = format === "reel" ? REEL_SAFE_BOTTOM : POST_PAD_Y;
  return h - padTop - padBottom - HEADER_HEIGHT - CONTENT_GAP_TOP - sourceReserve(source) - firmaReserve(format) - subtituloReserve(format, narracion) - opticalLift(format);
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
export function antonHeight(text: string, size: number, lineHeight: number, width: number = CONTENT_WIDTH, tight = false, keep?: (string | undefined)[]): number {
  return estimateLines(text, size, width, tight, keep) * size * lineHeight;
}

/**
 * Recorre `candidates` (de la más grande a la más chica) y devuelve la primera
 * cuyo alto estimado cabe en `available`; si ninguna cabe, la última.
 */
export function pickFit<T>(candidates: T[], height: (c: T) => number, available: number): T {
  for (const c of candidates) if (height(c) <= available) return c;
  return candidates[candidates.length - 1];
}
