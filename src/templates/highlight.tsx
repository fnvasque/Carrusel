import type { CSSProperties, ReactNode } from "react";
import { theme } from "../theme.ts";

/** Cómo se resalta la palabra clave de marca. */
export type HighlightTreatment = "slab" | "underline" | "color";

/**
 * Resalta la primera aparición de `highlight` dentro de `text` con el tratamiento
 * elegido (la "palabra clave" de la marca):
 *  - `slab`: marcador cian (fondo cian, texto navy) — firma de marca para titulares.
 *  - `underline`: subrayado grueso cian.
 *  - `color` (default): solo el texto en `color` (comportamiento histórico).
 * Búsqueda case-insensitive. Si no hay `highlight` o no aparece, devuelve el texto tal cual.
 */
export function highlightText(
  text: string,
  highlight: string | undefined,
  color: string,
  treatment: HighlightTreatment = "color",
): ReactNode {
  if (!highlight) return text;
  const i = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (i === -1) return text;
  const before = text.slice(0, i);
  const match = text.slice(i, i + highlight.length);
  const after = text.slice(i + highlight.length);
  return (
    <>
      {before}
      <span style={treatmentStyle(treatment, color)}>{match}</span>
      {after}
    </>
  );
}

function treatmentStyle(treatment: HighlightTreatment, color: string): CSSProperties {
  if (treatment === "slab") {
    // Marcador "highlighter" hecho a mano: swash de color con la tinta encima.
    return {
      backgroundImage: `linear-gradient(100deg, transparent 1%, ${color} 1.6%, ${color} 96%, transparent 97%)`,
      color: theme.colors.text,
      padding: "0 0.08em",
      borderRadius: 4,
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
    };
  }
  if (treatment === "underline") {
    return {
      borderBottom: `0.12em solid ${color}`,
      paddingBottom: "0.02em",
    };
  }
  return { color };
}
