import { theme } from "../theme.ts";

/** Ancho útil del lienzo (1080 − 2 × padding). */
export const CONTENT_WIDTH = 1080 - 2 * theme.padding;

/**
 * Ancho aproximado de un carácter de Anton en MAYÚSCULAS, en em (medido en
 * Chromium: letras ~0.48, espacio ~0.2, I/1/signos ~0.3, M/W/% ~0.68).
 */
function antonEm(ch: string): number {
  if (ch === " " || ch === "\u0001") return 0.2;
  if ("IJ1.,:;!'¡|".includes(ch)) return 0.3;
  if ("MW%".includes(ch)) return 0.68;
  return 0.48;
}

/**
 * Ancho estimado (px) de `word` en Anton a `size` px, con 4 % de holgura. Con
 * `tight` (lo usa el reel) se estima más ajustado (−5 %), más cerca del ancho
 * medido: en el 9:16 sobra alto y la holgura del post dejaba bloques chicos.
 */
function wordWidth(word: string, size: number, tight = false): number {
  let em = 0;
  for (const ch of word.toUpperCase()) em += antonEm(ch);
  return em * size * (tight ? 0.95 : 1.04);
}

/** Separador interno de una frase que no se corta (cuenta como un espacio). */
const GLUE = "\u0001";

/**
 * Une con GLUE los espacios de cada frase de `keep` (palabra clave o mark, que
 * se pintan en nowrap) y de la puntuación pegada, para estimarlas como una sola
 * "palabra" que no se parte.
 */
function glue(text: string, keep: (string | undefined)[] = []): string {
  let out = text;
  for (const k of keep) {
    if (!k) continue;
    const i = out.toLowerCase().indexOf(k.toLowerCase());
    if (i === -1) continue;
    out = out.slice(0, i) + out.slice(i, i + k.length).replace(/\s+/g, GLUE) + GLUE + out.slice(i + k.length);
  }
  // GLUE + espacio (o fin) → la frase termina ahí; GLUE + puntuación → pegada.
  return out.replace(new RegExp(GLUE + "(\\s|$)", "g"), "$1");
}

function words(text: string, keep?: (string | undefined)[]): string[] {
  return glue(text.trim(), keep).split(/\s+/).filter(Boolean);
}

/** Nº de líneas que ocupa `text` en Anton a `size` px dentro de `width` (corte por palabras). */
export function estimateLines(text: string, size: number, width: number = CONTENT_WIDTH, tight = false, keep?: (string | undefined)[]): number {
  const ws = words(text, tight ? keep : undefined);
  if (ws.length === 0) return 0;
  const space = wordWidth(" ", size, tight);
  let lines = 1;
  let x = 0;
  for (const w of ws) {
    const ww = wordWidth(w, size, tight);
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
 * Nunca baja de `min`. Con `tight` (reel), las líneas se estiman ajustadas pero
 * la palabra más larga (o frase de `keep`, en nowrap) se mide con la holgura
 * normal más el padding de la caja del mark: una palabra que no cabe se sale.
 */
export function fitDisplaySize(
  text: string,
  max: number = theme.fontSize.display,
  opts: { width?: number; maxLines?: number; min?: number; tight?: boolean; keep?: (string | undefined)[] } = {},
): number {
  const width = opts.width ?? CONTENT_WIDTH;
  const maxLines = opts.maxLines ?? 4;
  const min = opts.min ?? Math.round(max * 0.45);
  const ws = words(text, opts.tight ? opts.keep : undefined);
  for (let size = max; size > min; size -= 2) {
    const longest = Math.max(0, ...ws.map((w) => wordWidth(w, size) + (opts.tight && w.includes(GLUE) ? 0.25 * size : 0)));
    if (longest <= width && estimateLines(text, size, width, opts.tight, opts.keep) <= maxLines) return size;
  }
  return min;
}
