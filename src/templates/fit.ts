import { theme } from "../theme.ts";

/**
 * Devuelve un tamaño de fuente para un titular que decrece según la longitud del
 * texto, para que los titulares cortos se vean enormes y los largos quepan sin
 * recortarse en el ancho útil del lienzo (~840px). Aplica un factor de reducción
 * por nº de caracteres sobre `max`, así sirve a varias escalas (Hook→display,
 * Cta→title, Step→heading). Con `max = display` (132) reproduce 132/116/96/78/64.
 */
export function fitDisplaySize(text: string, max: number = theme.fontSize.display): number {
  const n = text.trim().length;
  const factor = n <= 16 ? 1 : n <= 26 ? 0.88 : n <= 40 ? 0.727 : n <= 56 ? 0.591 : 0.485;
  return Math.round(max * factor);
}
