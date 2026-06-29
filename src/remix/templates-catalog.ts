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
  Hook: { required: ["title"], optional: ["eyebrow", "highlight", "subtitle", "titleSize", "swipe"] },
  Lead: { required: ["text"], optional: ["kicker", "highlight"] },
  Step: { required: ["heading"], optional: ["step", "highlight", "body", "bullets"] },
  Prompt: { required: ["heading", "prompt"], optional: ["note"] },
  MythReality: { required: ["myth", "reality"], optional: ["mythLabel", "realityLabel"] },
  Cta: { required: ["title"], optional: ["highlight", "reason", "handle", "cta"] },
};

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
