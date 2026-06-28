import { theme } from "../theme.ts";

/**
 * Devuelve un tamaño de fuente para un titular en Anton (display) que decrece
 * según la longitud del texto, para que los titulares cortos se vean enormes y
 * los largos quepan sin recortarse en el ancho útil del lienzo (~840px).
 * Heurística por nº de caracteres, calibrada para Anton (condensada). Nunca
 * excede `max`.
 */
export function fitDisplaySize(text: string, max = theme.fontSize.display): number {
  const n = text.trim().length;
  let size: number;
  if (n <= 16) size = 132;
  else if (n <= 26) size = 116;
  else if (n <= 40) size = 96;
  else if (n <= 56) size = 78;
  else size = 64;
  return Math.min(size, max);
}
