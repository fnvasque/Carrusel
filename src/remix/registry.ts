import type { ComponentType } from "react";
import { Hook, Lead, Step, Prompt, MythReality, Cta } from "../templates/index.ts";
import { scoreCarousel, type ViralityResult } from "../score/virality.ts";
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
  MythReality,
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

/**
 * Puntúa un draft con el MISMO `scoreCarousel` que usa `generate`, tras validarlo
 * (para que el score coincida con el .ts que se emitiría).
 */
export function scoreDraft(draft: VariationDraft): ViralityResult {
  return scoreCarousel(draftToSpec(validateDraft(draft)));
}
