import type { CSSProperties } from "react";
import { interHeight } from "./layout.ts";

/**
 * Párrafos de un texto de cuerpo (Step `body`, Stat `context`, Prompt `note`).
 * Carrusel del martes 2026-10-27: el ejemplo entre «» y su explicación salían
 * pegados en un solo bloque. Dos reglas:
 *
 * - un "\n" explícito parte el párrafo;
 * - si un párrafo empieza con una cita «…» que cierra una frase (punto, signo o
 *   puntos suspensivos dentro o justo después de »), y sigue texto que empieza
 *   una frase nueva, la cita va en su propio párrafo. Una lista de citas
 *   («más corto», «más cercano» o…) no se parte.
 *
 * No cambia el texto (la lectura del reel cuenta las palabras de las props).
 */
export function parrafos(text: string): string[] {
  const out: string[] = [];
  for (const linea of text.split("\n")) {
    const t = linea.trim();
    if (!t) continue;
    const m = t.match(/^(«[^»]*»[.!?…]*)\s+(\S[\s\S]*)$/);
    const cierraFrase = m && (/[.!?…]»/.test(m[1]) || /»[.!?…]+$/.test(m[1]));
    if (m && cierraFrase && /^[¿¡«"A-ZÁÉÍÓÚÑ0-9]/.test(m[2])) out.push(m[1], m[2]);
    else out.push(t);
  }
  return out;
}

/** Separación entre párrafos, en em del tamaño del texto. */
export const PARRAFO_GAP_EM = 0.6;

/** Alto (px) de un texto Inter partido en `parrafos`, con su separación. */
export function parrafosHeight(text: string, size: number, width: number, lineHeight: number, em?: number): number {
  const ps = parrafos(text);
  if (ps.length === 0) return 0;
  const gap = Math.round(PARRAFO_GAP_EM * size);
  return ps.reduce((h, p) => h + interHeight(p, size, width, lineHeight, em), 0) + gap * (ps.length - 1);
}

/**
 * Cuerpo en párrafos: con uno solo, un `<p>` como siempre; con varios, un `<div>`
 * con el estilo (fuente, color, bordes) y un `<p>` por párrafo, separados por
 * `PARRAFO_GAP_EM`.
 */
export function Parrafos({ text, size, style, anim }: { text: string; size: number; style?: CSSProperties; anim?: string }) {
  const ps = parrafos(text);
  const a = anim ? { "data-anim": anim } : {};
  if (ps.length <= 1) {
    return (
      <p {...a} style={{ margin: 0, fontSize: size, ...style }}>
        {text}
      </p>
    );
  }
  return (
    <div {...a} data-parrafos={ps.length} style={{ margin: 0, fontSize: size, ...style, display: "flex", flexDirection: "column", gap: Math.round(PARRAFO_GAP_EM * size) }}>
      {ps.map((p, i) => (
        <p key={i} style={{ margin: 0 }}>
          {p}
        </p>
      ))}
    </div>
  );
}
