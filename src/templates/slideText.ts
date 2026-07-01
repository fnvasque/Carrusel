import type { CarouselSpec, SlideSpec } from "./types.ts";

/**
 * Extracción del TEXTO LEGIBLE de un carrusel: lo que un humano realmente lee en
 * las slides. Lo usan los evaluadores de contenido (valor de audiencia + fact-check)
 * para juzgar "lo que se lee", no la estructura.
 *
 * Nota: es intencionalmente más amplio que el `contentText` privado de
 * `score/virality.ts` (que puntúa palancas de viralidad con un set de claves
 * acotado). Aquí incluimos TODO el copy legible —prompts copiables, resaltados,
 * fuentes citadas, handle— porque todo eso es contenido que la audiencia consume
 * y que el fact-check debe verificar. Se mantienen separados a propósito para no
 * alterar el score de viralidad existente.
 */

/** Props de control visual/estructural que NO son copy legible. */
const SKIP_KEYS = new Set([
  "background",
  "fontFamily",
  "color",
  "accent",
  "pillar",
  "index",
  "total",
  "showLogo",
  "format",
  "titleSize",
  "overlay",
  "brandStyle",
]);

function templateName(slide: SlideSpec): string {
  const t = slide.template as { displayName?: string; name?: string };
  return t.displayName || t.name || "slide";
}

/** Texto legible de un slide: concatena todas las props de copy (string/string[]). */
export function slideText(slide: SlideSpec): string {
  const p = slide.props as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (SKIP_KEYS.has(k)) continue;
    if (typeof v === "string") {
      if (v.trim()) parts.push(v.trim());
    } else if (Array.isArray(v)) {
      parts.push(...v.filter((x): x is string => typeof x === "string" && x.trim().length > 0));
    }
  }
  return parts.join(" · ");
}

export interface PlainSlide {
  index: number;
  template: string;
  text: string;
}

/** Convierte un carrusel en una lista plana {index, template, text} por slide. */
export function specToPlainSlides(spec: CarouselSpec): PlainSlide[] {
  return (spec.slides ?? []).map((s, i) => ({
    index: i + 1,
    template: templateName(s),
    text: slideText(s),
  }));
}

/** Render textual del carrusel completo, una línea por slide, para pasárselo al modelo. */
export function specToReadable(spec: CarouselSpec): string {
  return specToPlainSlides(spec)
    .map((s) => `Slide ${s.index} [${s.template}]: ${s.text}`)
    .join("\n");
}
