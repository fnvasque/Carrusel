import type { TemplateName } from "./types.ts";

/**
 * Catálogo whitelist de plantillas de marca soportadas por el remix, con sus
 * props válidas (derivadas de los `*Props` en src/templates). Es la fuente única
 * para validar la salida del modelo y para emitir .ts que compile: si una
 * plantilla o prop no está aquí, el remix la descarta.
 *
 * Debe mantenerse alineado con src/templates/index.ts.
 */
export const TEMPLATE_CATALOG: Record<TemplateName, { required: string[]; optional: string[] }> = {
  Hook: { required: ["title"], optional: ["eyebrow", "highlight", "cursiva", "mark", "subtitle", "titleSize", "swipe", "resultado", "app", "modo"] },
  Lead: { required: ["text"], optional: ["kicker", "highlight", "cursiva"] },
  Step: { required: ["heading"], optional: ["step", "highlight", "cursiva", "body", "bullets"] },
  Prompt: { required: ["heading", "prompt"], optional: ["note"] },
  Screen: { required: ["app", "prompt", "respuesta"], optional: ["heading", "nota"] },
  MythReality: { required: ["myth", "reality"], optional: ["highlight", "mythLabel", "realityLabel"] },
  Stat: { required: ["value", "label"], optional: ["context"] },
  Clip: { required: ["title", "archivo"], optional: ["highlight", "label"] },
  Cta: { required: ["title"], optional: ["highlight", "cursiva", "reason", "handle", "cta", "ctaIcon"] },
};

/** Plantillas que solo usa el calendario (necesitan un archivo en la caché del Mac): el remix no las ofrece al modelo. */
export const SOLO_CALENDARIO: readonly TemplateName[] = ["Clip"];

/** Catálogo que ve el modelo del remix: todo menos las plantillas de `SOLO_CALENDARIO`. */
export function catalogoRemix(): Partial<Record<TemplateName, { required: string[]; optional: string[] }>> {
  return Object.fromEntries(Object.entries(TEMPLATE_CATALOG).filter(([n]) => !(SOLO_CALENDARIO as readonly string[]).includes(n)));
}

/** Props comunes a todas las plantillas (BaseSlideProps), siempre permitidas. */
export const BASE_PROP_KEYS = [
  "background",
  "pillar",
  "index",
  "total",
  "source",
  "showLogo",
  "accent",
  "color",
  "fontFamily",
  "format",
] as const;

/** Type guard: ¿es `name` una plantilla soportada? */
export function isTemplateName(name: string): name is TemplateName {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_CATALOG, name);
}

/** Conjunto de props válidas (required + optional + base) para una plantilla. */
export function validPropKeys(t: TemplateName): Set<string> {
  const spec = TEMPLATE_CATALOG[t];
  return new Set<string>([...spec.required, ...spec.optional, ...BASE_PROP_KEYS]);
}
