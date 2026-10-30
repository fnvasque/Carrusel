import { theme } from "../theme.ts";

/** Ancho útil del lienzo (1080 − 2 × padding). */
export const CONTENT_WIDTH = 1080 - 2 * theme.padding;

/**
 * Ancho aproximado de un carácter del titular, en em: Inter 700 tal como se
 * escribe (minúsculas y mayúsculas), con letter-spacing −0,04 em ya incluido.
 * Medido una vez en Chromium (headless shell 1248) con Inter-700.woff2 a 1000 px:
 * minúsculas ~0,55 (i l j 0,23 · t f r 0,33 · m 0,87 · w 0,81), tildes 0,51,
 * mayúsculas ~0,66 (I 0,24 · J 0,54 · M 0,89 · W 1,00), dígitos 0,58 (el 1 0,39),
 * espacio 0,20, signos . , : ; ! ' ¡ | 0,30, paréntesis 0,34, guion 0,43,
 * ? ¿ 0,52, % y @ 0,98. La frase de prueba completa promedió 0,445 em por carácter.
 */
function displayEm(ch: string): number {
  if (ch === " " || ch === "\u0001") return DISPLAY_ESPACIO_EM;
  if ("ilj".includes(ch) || ch === "I") return 0.24;
  if (".,:;!'¡|()".includes(ch)) return 0.32;
  if ("tfr".includes(ch)) return 0.33;
  if (ch === "1") return 0.39;
  if (ch === "-") return 0.43;
  if ("?¿".includes(ch)) return 0.52;
  if (ch === "J") return 0.54;
  if (ch === "m") return 0.87;
  if (ch === "w") return 0.81;
  if ("MW".includes(ch)) return 0.95;
  if ("%@".includes(ch)) return 0.98;
  if (/[0-9]/.test(ch)) return 0.58;
  if (/[A-ZÁÉÍÓÚÜÑ]/.test(ch)) return 0.66;
  return 0.55;
}

/**
 * Ancho estimado (px) de `word` en Inter 700 a `size` px, con 4 % de holgura. Con
 * `tight` (lo usa el reel) se estima más ajustado (−5 %), más cerca del ancho
 * medido: en el 9:16 sobra alto y la holgura del post dejaba bloques chicos.
 * Excepción: entre palabras, `estimateLines` con `tight` no usa este −5 % para el
 * espacio sino su ancho medido, `DISPLAY_ESPACIO_EM`.
 */
function wordWidth(word: string, size: number, tight = false): number {
  let em = 0;
  for (const ch of word) em += displayEm(ch);
  return em * size * (tight ? 0.95 : 1.04);
}

/** Ancho medido (em) del espacio de Inter 700 con −0,04 em, para la estimación ajustada del reel. */
export const DISPLAY_ESPACIO_EM = 0.2;

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

/** Nº de líneas que ocupa `text` en Inter 700 a `size` px dentro de `width` (corte por palabras). */
export function estimateLines(text: string, size: number, width: number = CONTENT_WIDTH, tight = false, keep?: (string | undefined)[]): number {
  const ws = words(text, tight ? keep : undefined);
  if (ws.length === 0) return 0;
  // El espacio se usa con su ancho medido (no −5 %): con «tight» una línea que no cabía parecía
  // caber (corpus 2026-10-23, «POR QUÉ LOS», cuando el titular aún era Anton).
  const space = tight ? DISPLAY_ESPACIO_EM * size : wordWidth(" ", size);
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
 * Tamaño de fuente para un titular Inter 700: el mayor tamaño ≤ `max` con el que
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

/**
 * Interlineado mínimo de un titular Anton con tildes (Á É Í Ó Ú Ü Ñ). Medido en
 * Chromium: la tilde sube 1,101 em sobre la línea base; con 0,04 em de aire
 * no pisa la línea de arriba.
 */
export const ANTON_LH_ACENTO = 1.14;

/**
 * Con una Q en el texto, su cola baja ~0,09 em bajo la línea base y puede tocar
 * la tilde de la línea siguiente («QUE TÚ…»). Medido: a 1,18 aún se tocan, a
 * 1,19 no; 1,20 deja 0,01 em de aire.
 */
export const ANTON_LH_ACENTO_Q = 1.2;

/**
 * Puntuación que baja de la línea base en Anton (medido en Chromium, en em): la coma
 * 0,115, los paréntesis 0,092 y la @ 0,077. El punto y coma no baja (0), así que no
 * cuenta. Una coma justo encima de una tilde la toca hasta 1,21 (1,101 + 0,115 =
 * 1,216); `ANTON_LH_ACENTO_COLA` deja ~0,02 em de aire con el peor caso, la coma.
 */
export const ANTON_COLA_PUNTUACION = /[,()@]/;
export const ANTON_LH_ACENTO_COLA = 1.24;

/** ¿Lleva `text` tilde, diéresis o Ñ (lo que sube sobre la caja de la línea en Anton)? */
export function tieneAcento(text: string): boolean {
  return /[ÁÉÍÓÚÜÑáéíóúüñ]/.test(text);
}

/**
 * Interlineado de un texto Anton: `base`, o `ANTON_LH_ACENTO` si el texto lleva
 * tilde/diéresis/Ñ. Si además lleva algo que baja de la línea base y puede caer
 * justo encima de la tilde, sube más: `ANTON_LH_ACENTO_COLA` con coma, paréntesis
 * o @; `ANTON_LH_ACENTO_Q` con Q. Estilo y estimador de alto deben usar el mismo valor.
 */
export function displayLineHeight(text: string, base: number): number {
  if (!tieneAcento(text)) return base;
  if (ANTON_COLA_PUNTUACION.test(text)) return Math.max(base, ANTON_LH_ACENTO_COLA);
  return Math.max(base, /q/i.test(text) ? ANTON_LH_ACENTO_Q : ANTON_LH_ACENTO);
}
