import type { ComponentType } from "react";
import { Hook, Lead, Step, Prompt, Screen, MythReality, Stat, Cta } from "../templates/index.ts";
import { scoreCarousel, scoreReel, type ReelDraftLike, type ViralityResult } from "../score/virality.ts";
import { validateDraft } from "./emit.ts";
import type { CarouselSpec } from "../templates/types.ts";
import type { TemplateName, VariationDraft } from "./types.ts";

/**
 * Mapa nombre de plantilla → componente React. Permite puntuar un VariationDraft
 * en memoria (sin escribir el .ts a disco) reconstruyendo un CarouselSpec real.
 * El tipo Record<TemplateName, …> obliga a cubrir TODO el catálogo (lo verifica tsc).
 */
export const TEMPLATE_COMPONENTS: Record<TemplateName, ComponentType<any>> = {
  Hook,
  Lead,
  Step,
  Prompt,
  Screen,
  MythReality,
  Stat,
  Cta,
};

/**
 * Convierte un VariationDraft en un CarouselSpec en memoria para puntuarlo.
 * No resuelve fondos `ai` (el background no afecta al score de viralidad).
 */
export function draftToSpec(draft: VariationDraft): CarouselSpec {
  const slides = draft.slides.map((s) => ({
    template: TEMPLATE_COMPONENTS[s.template],
    props: { ...s.props, ...(s.pillar ? { pillar: s.pillar } : {}) },
  }));
  return {
    name: draft.name || "remix",
    defaults: { pillar: draft.pillar },
    slides,
  };
}

/** Formato de la pieza para elegir la rúbrica del score. */
export type ScoreFormat = "reel" | "carrusel";

/**
 * ¿El borrador es un reel narrado? Lo es si alguna slide trae `narracion`
 * (obligatoria en reels desde 2026-10-19). Los reels mudos anteriores se
 * puntúan como carrusel, igual que antes del pivote.
 */
export function esReelNarrado(draft: VariationDraft): boolean {
  return (draft.slides as { narracion?: unknown }[]).some((s) => typeof s.narracion === "string" && s.narracion.trim() !== "");
}

/**
 * Puntúa un draft tras validarlo (para que el score coincida con el .ts que se
 * emitiría). Carrusel: el MISMO `scoreCarousel` que usa `generate`. Reel narrado
 * (`format: "reel"`, o detectado por `narracion`): `scoreReel`, la rúbrica del
 * pivote 2026-10-17. `validateDraft` conserva `narracion` y el borrador
 * conserva `pace`, que la rúbrica de reel necesita.
 */
export function scoreDraft(draft: VariationDraft, opts: { format?: ScoreFormat } = {}): ViralityResult {
  const validated = validateDraft(draft);
  const reel = opts.format === "reel" || (opts.format === undefined && esReelNarrado(draft));
  if (reel) return scoreReel({ pace: (draft as { pace?: string }).pace, slides: validated.slides as ReelDraftLike["slides"] });
  return scoreCarousel(draftToSpec(validated));
}
