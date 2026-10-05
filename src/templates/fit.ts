import { theme } from "../theme.ts";

/** Ancho útil del lienzo (1080 − 2 × padding). */
export const CONTENT_WIDTH = 1080 - 2 * theme.padding;

/**
 * Ancho aproximado de un carácter de Anton en MAYÚSCULAS, en em (medido en
 * Chromium: letras ~0.48, espacio ~0.2, I/1/signos ~0.3, M/W/% ~0.68).
 */
function antonEm(ch: string): number {
  if (ch === " ") return 0.2;
  if ("IJ1.,:;!'¡|".includes(ch)) return 0.3;
  if ("MW%".includes(ch)) return 0.68;
  return 0.48;
}

/** Ancho estimado (px) de `word` en Anton a `size` px, con 4 % de holgura. */
function wordWidth(word: string, size: number): number {
  let em = 0;
  for (const ch of word.toUpperCase()) em += antonEm(ch);
  return em * size * 1.04;
}

/** Nº de líneas que ocupa `text` en Anton a `size` px dentro de `width` (corte por palabras). */
export function estimateLines(text: string, size: number, width: number = CONTENT_WIDTH): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const space = wordWidth(" ", size);
  let lines = 1;
  let x = 0;
  for (const w of words) {
    const ww = wordWidth(w, size);
    if (x === 0) x = ww;
    else if (x + space + ww <= width) x += space + ww;
    else {
      lines++;
      x = ww;
    }
  }
  return lines;
}

/**
 * Tamaño de fuente para un titular Anton: el mayor tamaño ≤ `max` con el que
 * el texto cabe en `maxLines` líneas del ancho útil y ninguna palabra se sale
 * del ancho. Así los titulares cortos se ven enormes y los largos no se cortan.
 * Nunca baja de `min`.
 */
export function fitDisplaySize(
  text: string,
  max: number = theme.fontSize.display,
  opts: { width?: number; maxLines?: number; min?: number } = {},
): number {
  const width = opts.width ?? CONTENT_WIDTH;
  const maxLines = opts.maxLines ?? 4;
  const min = opts.min ?? Math.round(max * 0.45);
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let size = max; size > min; size -= 2) {
    const longest = Math.max(0, ...words.map((w) => wordWidth(w, size)));
    if (longest <= width && estimateLines(text, size, width) <= maxLines) return size;
  }
  return min;
}
