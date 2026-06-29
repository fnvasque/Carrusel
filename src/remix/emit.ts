import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LogicalBackground, LogicalSlide, SpanishVariant, TemplateName, VariationDraft } from "./types.ts";
import { TEMPLATE_CATALOG, isTemplateName, validPropKeys } from "./templates-catalog.ts";

/**
 * Valida un VariationDraft contra el catálogo de plantillas y lo normaliza para
 * que el .ts emitido siempre compile y respete las palancas de marca:
 * - descarta slides con plantilla desconocida,
 * - elimina props fuera del catálogo,
 * - garantiza que cada slide tenga sus props requeridas (rellena con placeholder),
 * - garantiza un Hook al inicio y un Cta al final,
 * - recalcula index/total en los slides de desarrollo.
 */
export function validateDraft(draft: VariationDraft): VariationDraft {
  let slides: LogicalSlide[] = draft.slides.filter((s) => isTemplateName(s.template));

  // Limpiar props no permitidas y asegurar requeridas.
  slides = slides.map((s) => {
    const allowed = validPropKeys(s.template);
    const props: LogicalSlide["props"] = {};
    for (const [k, v] of Object.entries(s.props)) {
      if (allowed.has(k)) props[k] = v;
    }
    for (const req of TEMPLATE_CATALOG[s.template].required) {
      if (props[req] === undefined || props[req] === "") props[req] = "…";
    }
    return { ...s, props };
  });

  // Garantizar Hook inicial.
  if (!slides.length || slides[0].template !== "Hook") {
    const firstHook = slides.findIndex((s) => s.template === "Hook");
    if (firstHook > 0) {
      const [hook] = slides.splice(firstHook, 1);
      slides.unshift(hook);
    } else if (firstHook === -1) {
      slides.unshift({
        template: "Hook",
        props: { title: draft.name || "Lo que nadie te cuenta", highlight: "nadie", swipe: true },
      });
    }
  }

  // Garantizar Cta final.
  if (!slides.some((s) => s.template === "Cta")) {
    slides.push({
      template: "Cta",
      props: {
        title: "Guárdalo para después",
        highlight: "Guárdalo",
        reason: "Y recibe lo que importa en IA, cada semana en tu correo.",
        handle: "ia.punto.es",
      },
    });
  } else {
    // mover el primer Cta al final
    const idx = slides.findIndex((s) => s.template === "Cta");
    if (idx !== slides.length - 1) {
      const [cta] = slides.splice(idx, 1);
      slides.push(cta);
    }
  }

  // Recalcular index/total en slides de desarrollo (entre Hook y Cta).
  const total = slides.length;
  slides = slides.map((s, i) => {
    if (s.template === "Hook" || s.template === "Cta") return s;
    return { ...s, props: { ...s.props, index: i + 1, total } };
  });

  return { ...draft, slides };
}

/** kebab-case ascii a partir de un nombre libre. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50) || "remix";
}

/** Serializa un fondo lógico a un literal de objeto Background. */
function serializeBackground(bg?: LogicalBackground): string | undefined {
  if (!bg) return undefined;
  const overlay = typeof bg.overlay === "number" ? bg.overlay : 0.5;
  if (bg.ai) return `{ ai: ${JSON.stringify(bg.ai)}, overlay: ${overlay} }`;
  if (bg.gradient) return `{ gradient: ${JSON.stringify(bg.gradient)}, overlay: ${overlay} }`;
  if (bg.color) return `{ color: ${JSON.stringify(bg.color)} }`;
  return undefined;
}

/** Serializa el valor de una prop a TS (strings/arrays vía JSON, números/bool crudos). */
function serializeValue(v: string | string[] | number | boolean): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Serializa un slide lógico a `{ template: X, props: {...} }`. */
function serializeSlide(slide: LogicalSlide): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(slide.props)) {
    lines.push(`        ${k}: ${serializeValue(v)},`);
  }
  if (slide.pillar) lines.push(`        pillar: ${JSON.stringify(slide.pillar)},`);
  const bg = serializeBackground(slide.background);
  if (bg) lines.push(`        background: ${bg},`);
  return `    {\n      template: ${slide.template},\n      props: {\n${lines.join("\n")}\n      },\n    },`;
}

/** Plantillas distintas usadas en el draft (para el import). */
function usedTemplates(draft: VariationDraft): TemplateName[] {
  return [...new Set(draft.slides.map((s) => s.template))];
}

/**
 * Emite un VariationDraft validado como un archivo .ts en `outDir` que exporta un
 * CarouselSpec compilable. Devuelve la ruta escrita.
 */
export async function emitCarouselFile(draft: VariationDraft, es: SpanishVariant, outDir: string): Promise<string> {
  const validated = validateDraft(draft);
  const slug = slugify(validated.name);
  const imports = usedTemplates(validated).join(", ");
  const slidesSrc = validated.slides.map(serializeSlide).join("\n");

  const content = `import { ${imports} } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Generado por \`npm run remix\` (remix de Instagram).
 * Ángulo: ${validated.angle || "—"}
 * Idioma: ${es === "cl" ? "español chileno" : "español neutro"}
 * Revisa y ajusta el copy antes de publicar.
 */
const carousel: CarouselSpec = {
  name: ${JSON.stringify(slug)},
  defaults: { pillar: ${JSON.stringify(validated.pillar)} },
  slides: [
${slidesSrc}
  ],
};

export default carousel;
`;

  const path = join(outDir, `${slug}.ts`);
  await writeFile(path, content, "utf8");
  return path;
}
