import { validateDraft, slugify } from "../remix/emit.ts";
import { draftToSpec } from "../remix/registry.ts";
import { specTiming, parsePace } from "../reel/timing.ts";
import { StoryCover } from "../templates/StoryCover.tsx";
import type { Background, CarouselSpec, Format, Pace, Pillar } from "../templates/types.ts";
import type { LogicalBackground, LogicalSlide, VariationDraft } from "../remix/types.ts";

/**
 * Motor del calendario: convierte el borrador JSON que escribe el agente
 * planificador (`_calendario/<semana>/<id>.json`) en los CarouselSpec que
 * renderiza el Mac: el carrusel o reel de la pieza y la portada de su story.
 * Todo puro (sin Chromium ni red). Las reglas editoriales (catálogo, tope de
 * fondos IA, caption, puerta) las comprueba `validar.mjs`; aquí solo la forma
 * mínima para no romper el render.
 */

/** Fondo de un slide del borrador: el lógico del remix más `brandStyle` (fondos `ai`). */
export interface BorradorBackground extends LogicalBackground {
  brandStyle?: boolean;
}

/** Borrador = VariationDraft del remix + ritmo, pista de audio y logo en el cuadro 0. */
export interface Borrador extends VariationDraft {
  /** Ritmo del reel (por defecto el del motor, "ensenar"). El carrusel lo ignora. */
  pace?: Pace;
  /** Nombre de una pista de `promo/audio/` (solo reels). */
  audio?: string;
  /** Reel: wordmark desde el cuadro 0 (por defecto true; false = experimento logo tardío). */
  logoEnCuadro0?: boolean;
  slides: (LogicalSlide & { background?: BorradorBackground })[];
}

const PILARES: readonly Pillar[] = ["herramienta", "noticia", "prompt", "curiosidad"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Valor de prop admitido por las plantillas: texto, número, booleano o lista de textos. */
function isPropValue(v: unknown): boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || (Array.isArray(v) && v.every((x) => typeof x === "string"));
}

/** Comprueba la forma de un fondo; devuelve el motivo del rechazo o undefined. */
function backgroundError(bg: unknown): string | undefined {
  if (!isObject(bg)) return "background debe ser un objeto ({ ai | gradient | color, overlay? })";
  const kinds = (["ai", "gradient", "color"] as const).filter((k) => bg[k] !== undefined);
  if (kinds.length !== 1) return "background debe tener exactamente uno de ai, gradient o color";
  if (typeof bg[kinds[0]] !== "string" || !(bg[kinds[0]] as string).trim()) return `background.${kinds[0]} debe ser un texto no vacío`;
  if (bg.overlay !== undefined && (typeof bg.overlay !== "number" || !(bg.overlay >= 0 && bg.overlay <= 1))) return "background.overlay debe ser un número entre 0 y 1";
  if (bg.brandStyle !== undefined && typeof bg.brandStyle !== "boolean") return "background.brandStyle debe ser true o false (no un texto)";
  return undefined;
}

/**
 * Lee un borrador JSON y valida su forma mínima. Lanza un Error en español que
 * dice qué campo falla (y en qué slide). Acepta campos extra del planificador
 * (caption, senal, emocion…) y los conserva tal cual.
 */
export function parseBorrador(text: string): Borrador {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    throw new Error(`El borrador no es JSON válido: ${e instanceof Error ? e.message : e}`);
  }
  if (!isObject(data)) throw new Error("El borrador debe ser un objeto JSON ({ name, pillar, slides, … }).");
  if (typeof data.name !== "string" || !data.name.trim()) throw new Error("El borrador necesita `name` (texto no vacío).");
  if (typeof data.pillar !== "string" || !PILARES.includes(data.pillar as Pillar)) {
    throw new Error(`El campo \`pillar\` (${JSON.stringify(data.pillar)}) debe ser uno de: ${PILARES.join(", ")}.`);
  }
  if (data.angle !== undefined && typeof data.angle !== "string") throw new Error("El campo `angle` debe ser texto.");
  if (!Array.isArray(data.slides) || data.slides.length === 0) throw new Error("El borrador necesita `slides` (una lista con al menos un slide).");
  data.slides.forEach((s: unknown, i: number) => {
    const at = `slide ${i + 1}`;
    if (!isObject(s)) throw new Error(`El ${at} debe ser un objeto { template, props }.`);
    if (typeof s.template !== "string") throw new Error(`El ${at} necesita \`template\` (texto).`);
    if (!isObject(s.props)) throw new Error(`El ${at} (${s.template}) necesita \`props\` (objeto).`);
    for (const [k, v] of Object.entries(s.props)) {
      if (!isPropValue(v)) throw new Error(`El ${at} (${s.template}): la prop \`${k}\` debe ser texto, número, booleano o lista de textos.`);
    }
    if (s.pillar !== undefined && !PILARES.includes(s.pillar as Pillar)) throw new Error(`El ${at}: \`pillar\` debe ser uno de: ${PILARES.join(", ")}.`);
    if (s.background !== undefined) {
      const err = backgroundError(s.background);
      if (err) throw new Error(`El ${at} (${s.template}): ${err}.`);
    }
  });
  if (data.pace !== undefined) parsePace(data.pace, "el campo `pace` del borrador");
  if (data.audio !== undefined && (typeof data.audio !== "string" || !data.audio.trim())) throw new Error("El campo `audio` debe ser el nombre de una pista (texto).");
  if (data.logoEnCuadro0 !== undefined && typeof data.logoEnCuadro0 !== "boolean") throw new Error("El campo `logoEnCuadro0` debe ser true o false.");
  return { ...data, angle: typeof data.angle === "string" ? data.angle : "" } as unknown as Borrador;
}

/**
 * Fondo del borrador → `Background` del motor, con el mismo overlay por defecto
 * (0.5 en ai/gradient) que el .ts que emite el remix (`serializeBackground`).
 * `brandStyle` se conserva solo si viene declarado.
 */
function toBackground(bg?: BorradorBackground): Background | undefined {
  if (!bg) return undefined;
  const overlay = typeof bg.overlay === "number" ? bg.overlay : 0.5;
  if (bg.ai) return { ai: bg.ai, overlay, ...(typeof bg.brandStyle === "boolean" ? { brandStyle: bg.brandStyle } : {}) };
  if (bg.gradient) return { gradient: bg.gradient, overlay };
  if (bg.color) return { color: bg.color };
  return undefined;
}

/**
 * Borrador → CarouselSpec del carrusel (o del reel, con `format: "reel"`).
 * Pasa por `validateDraft` (descarta plantillas desconocidas, garantiza Hook y
 * Cta, fija index/total) y por `draftToSpec` (el mismo que puntúa `scoreDraft`),
 * y además conserva lo que `draftToSpec` pierde: los fondos (ai + brandStyle) y
 * el ritmo. El nombre (carpeta de salida) va en slug: nunca una ruta.
 */
export function borradorASpec(b: Borrador, opts: { format?: Format } = {}): CarouselSpec {
  const validated = validateDraft(b) as Borrador;
  const spec = draftToSpec(validated);
  const slides = spec.slides.map((s, i) => {
    const background = toBackground(validated.slides[i].background);
    return background ? { ...s, props: { ...s.props, background } } : s;
  });
  return {
    name: slugify(validated.name),
    ...(b.pace !== undefined ? { pace: b.pace } : {}),
    defaults: { ...spec.defaults, ...(opts.format ? { format: opts.format } : {}) },
    slides,
  };
}

/**
 * Spec de la story de la pieza: un solo slide `StoryCover` 9:16 con el titular,
 * la palabra clave y el fondo del Hook (el que garantiza `validateDraft`).
 */
export function storySpec(b: Borrador): CarouselSpec {
  const validated = validateDraft(b) as Borrador;
  const hook = validated.slides.find((s) => s.template === "Hook") ?? validated.slides[0];
  const title = String(hook.props.title ?? validated.name);
  const highlight = typeof hook.props.highlight === "string" ? hook.props.highlight : undefined;
  const background = toBackground(hook.background);
  return {
    name: `${slugify(validated.name)}-story`,
    defaults: { pillar: validated.pillar },
    slides: [
      {
        template: StoryCover,
        props: {
          title,
          ...(highlight ? { highlight } : {}),
          ...(hook.pillar ? { pillar: hook.pillar } : {}),
          ...(background ? { background } : {}),
          format: "reel",
        },
      },
    ],
  };
}

/** Duración del reel de un spec en ms (la misma que dará el motor, sin overrides). */
export function duracionReelMs(spec: CarouselSpec): number {
  return Math.round(specTiming(spec).total * 1000);
}
