import type { CarouselSpec } from "../templates/types.ts";

/**
 * Matemática de tiempos del reel animado, en funciones puras: cuánto dura cada
 * escena según su texto, dónde empieza cada una (se solapan durante la
 * transición), duración total, cuadros y presupuesto de las entradas.
 */

/** Cuadros por segundo de salida. */
export const FPS = 30;
/** Duración (s) del empuje vertical entre escenas. */
export const DEFAULT_TRANSITION = 0.35;

const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note"];

/** Segundos que se muestra una escena, según cuánto texto tiene (legibilidad). */
export function sceneSeconds(props: Record<string, unknown>, hold: boolean): number {
  let chars = 0;
  for (const k of TEXT_KEYS) {
    const v = props[k];
    if (typeof v === "string") chars += v.length;
    else if (Array.isArray(v)) chars += v.filter((x) => typeof x === "string").join(" ").length;
  }
  const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
  return +(s + (hold ? 0.7 : 0)).toFixed(2);
}

/** Duración de cada escena del carrusel; `seconds` la fija para todas. */
export function specDurations(spec: CarouselSpec, seconds?: number): number[] {
  const last = spec.slides.length - 1;
  return spec.slides.map((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    return seconds ?? sceneSeconds(props, i === 0 || i === last);
  });
}

/** Tiempo máximo (s) que pueden ocupar las entradas de una escena. */
export function entranceBudget(dur: number): number {
  return +Math.min(0.4 * dur, 1.6).toFixed(3);
}

/** timeScale a aplicar a las entradas: >1 solo si no caben en el presupuesto. */
export function entranceScale(natural: number, budget: number): number {
  return natural > budget ? natural / budget : 1;
}

export interface SceneTiming {
  /** Segundo en que empieza la escena (incluye su transición de entrada). */
  start: number;
  /** Duración de la escena (s). */
  dur: number;
  /** Presupuesto (s) para sus entradas. */
  budget: number;
}

export interface ReelTiming {
  fps: number;
  transition: number;
  total: number;
  frames: number;
  scenes: SceneTiming[];
}

/**
 * Tiempos del reel: la escena i empieza en Σ dur[j<i] − i·transition, de modo
 * que cada par consecutivo se solapa `transition` segundos.
 */
export function reelTiming(durations: number[], transition = DEFAULT_TRANSITION, fps = FPS): ReelTiming {
  if (durations.length === 0) throw new Error("El reel necesita al menos una escena.");
  if (durations.length > 1 && transition * 2 >= Math.min(...durations)) {
    throw new Error(
      `La transición (${transition}s) es demasiado larga para escenas de ${Math.min(...durations)}s: debe durar menos de la mitad de la escena más corta.`,
    );
  }
  let cursor = 0;
  const scenes = durations.map((dur) => {
    const scene = { start: +cursor.toFixed(3), dur, budget: entranceBudget(dur) };
    cursor += dur - transition;
    return scene;
  });
  const sum = durations.reduce((a, b) => a + b, 0);
  const total = +(sum - (durations.length - 1) * transition).toFixed(3);
  return { fps, transition, total, frames: Math.round(total * fps), scenes };
}
