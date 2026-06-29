import type { ReactNode } from "react";

/**
 * Resalta la primera aparición de `highlight` dentro de `text` pintándola con
 * `color` (la "palabra clave en cian" de la marca). Búsqueda case-insensitive.
 * Si no hay `highlight` o no aparece en el texto, devuelve el texto tal cual.
 */
export function highlightText(text: string, highlight: string | undefined, color: string): ReactNode {
  if (!highlight) return text;
  const i = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (i === -1) return text;
  const before = text.slice(0, i);
  const match = text.slice(i, i + highlight.length);
  const after = text.slice(i + highlight.length);
  return (
    <>
      {before}
      <span style={{ color }}>{match}</span>
      {after}
    </>
  );
}
