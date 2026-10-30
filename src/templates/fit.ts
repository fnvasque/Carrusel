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
 * `tight` (lo usa el reel) la holgura baja a 3 %: medido en Chromium contra el
 * corte real de 17 titulares a 72–180 px (2026-10-29), la tabla de `displayEm`
 * acierta en promedio (real/estimado 1,01, ±7 % por palabra) y con −5 % (el
 * valor de cuando el titular era Anton) el reel subestimaba 15 de 102 casos en
 * una línea; con +3 %, ninguno. El espacio entre palabras con `tight` se toma
 * con su ancho medido, `DISPLAY_ESPACIO_EM`, sin holgura.
 */
function wordWidth(word: string, size: number, tight = false): number {
  let em = 0;
  for (const ch of word) em += displayEm(ch);
  return em * size * (tight ? 1.03 : 1.04);
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
  // caber (corpus 2026-10-23, «POR QUÉ LOS»).
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
 * Interlineado de los titulares Inter 700 (look papel). Medido en Chromium
 * (headless shell 1248) con Inter-700.woff2 e InstrumentSerif-400-italic.woff2,
 * en em: la tilde de una mayúscula (Á É Í Ó Ú Ü Ñ) sube 0,949 sobre la línea
 * base y la de una minúscula 0,767; bajan de la línea base g 0,216, p q j 0,204,
 * y 0,208, @ 0,209, la coma y el punto y coma 0,193 y el paréntesis 0,136. La
 * frase en serif cursiva (×1,13) baja hasta 0,216 × 1,13 = 0,244 (g, Q, y).
 *
 * - Minúscula con tilde bajo un descendente de la serif: 0,767 + 0,244 = 1,011,
 *   así que con tildes el interlineado no baja de `INTER_LH_ACENTO` (1,03).
 * - Mayúscula con tilde bajo un descendente: 0,949 + 0,216 = 1,165 →
 *   `INTER_LH_ACENTO_MAYUS` (1,18) deja ~0,015 em de aire. Solo cuenta si la
 *   mayúscula no va en la primera palabra (la primera palabra siempre está en la
 *   primera línea: no tiene nada encima) y si el texto tiene algo que baje.
 */
export const INTER_LH_ACENTO = 1.03;
export const INTER_LH_ACENTO_MAYUS = 1.18;
/** Lo que baja de la línea base en Inter 700 (y en la serif cursiva) lo bastante para tocar una tilde mayúscula. */
export const INTER_DESCENDENTE = /[gjpqyQ,;(@ç]/;

/** ¿Lleva `text` tilde, diéresis o Ñ? */
export function tieneAcento(text: string): boolean {
  return /[ÁÉÍÓÚÜÑáéíóúüñ]/.test(text);
}

/**
 * Interlineado de un titular Inter 700: `base`, o más si el texto lleva tildes
 * (ver `INTER_LH_ACENTO` e `INTER_LH_ACENTO_MAYUS`). Con `mayusculas` (titular
 * con text-transform: uppercase) toda tilde cuenta como de mayúscula. Estilo y
 * estimador de alto deben usar el mismo valor.
 */
export function displayLineHeight(text: string, base: number, mayusculas = false): number {
  if (!tieneAcento(text)) return base;
  const t = mayusculas ? text.toLocaleUpperCase("es") : text;
  // Sin la primera palabra (y la puntuación que la abre): esa va siempre en la primera línea.
  const resto = t.trim().replace(/^\S+/, "");
  if (/[ÁÉÍÓÚÜÑ]/.test(resto) && INTER_DESCENDENTE.test(t)) return Math.max(base, INTER_LH_ACENTO_MAYUS);
  return Math.max(base, INTER_LH_ACENTO);
}
