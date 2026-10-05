import type { CarouselSpec, Pace } from "../templates/types.ts";

/**
 * Matemática de tiempos del reel animado, en funciones puras: cuánto dura cada
 * escena según su texto y el ritmo (`pace`), dónde empieza cada una (se
 * solapan durante la transición), duración total, cuadros y presupuesto de las
 * entradas.
 */

/** Cuadros por segundo de salida. */
export const FPS = 30;

/**
 * Parámetros de cada ritmo. `rapido` son los valores del motor original;
 * `ensenar` (por defecto) deja leer: escenas más largas, entradas 1.3× más
 * lentas (salvo la escena 0) y bullets de a uno cada 1.8 s.
 */
export const PACES = {
  rapido: {
    /** Duración (s) del empuje vertical entre escenas. */
    transition: 0.35,
    /** Factor de lentitud de las entradas (1 = como están escritas en el runtime). */
    entranceSlow: 1,
    /** Separación (s) entre bullets de un `stagger` (y sus ✓). */
    stagger: 0.12,
    /** Presupuesto de entradas: min(ratio × dur, max). */
    budgetRatio: 0.4,
    budgetMax: 1.6,
  },
  ensenar: {
    transition: 0.5,
    entranceSlow: 1.3,
    stagger: 1.8,
    budgetRatio: 0.45,
    budgetMax: 2.4,
  },
} as const satisfies Record<Pace, unknown>;

/** Ritmo por defecto (si ni el carrusel ni `--pace` lo fijan). */
export const DEFAULT_PACE: Pace = "ensenar";

/** Transición del ritmo rápido (compatibilidad con el motor original). */
export const DEFAULT_TRANSITION = PACES.rapido.transition;

/** En `ensenar`: segundos hasta el primer bullet y de lectura tras el último. */
export const BULLET_LEAD = 1.0;
export const BULLET_TAIL = 2.5;

/** Valida un ritmo (del carrusel o de `--pace`); lanza un error claro en español. */
export function parsePace(value: unknown, origin = "--pace"): Pace {
  if (value === "ensenar" || value === "rapido") return value;
  throw new Error(`El ritmo ${JSON.stringify(value)} no es válido: ${origin} debe ser "ensenar" o "rapido".`);
}

const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note"];
/**
 * En `ensenar` también se lee el texto de Stat (valor, etiqueta, contexto) y el
 * prompt copiable. `rapido` conserva la lista original para reproducir
 * exactamente los tiempos del motor anterior.
 */
const ENSENAR_TEXT_KEYS = [...TEXT_KEYS, "value", "label", "context", "prompt"];

/** Caracteres de texto visibles de una escena (los que hay que leer). */
function textChars(props: Record<string, unknown>, keys: string[]): number {
  let chars = 0;
  for (const k of keys) {
    const v = props[k];
    if (typeof v === "string") chars += v.length;
    else if (Array.isArray(v)) chars += v.filter((x) => typeof x === "string").join(" ").length;
  }
  return chars;
}

/**
 * Segundos que se muestra una escena según su texto y el ritmo (legibilidad);
 * `hold` (primera y última) suma un respiro.
 *  - rapido:  clamp(1.8 + chars/26, 2.4, 4.8) + 0.7 si hold.
 *  - ensenar: clamp(2.4 + chars/16, 3.5, 8) + 1.0 si hold; con bullets, al menos
 *    BULLET_LEAD + stagger × (bullets − 1) + BULLET_TAIL (uno cada 1.8 s y
 *    tiempo para leer el último).
 */
export function sceneSeconds(props: Record<string, unknown>, hold: boolean, pace: Pace = DEFAULT_PACE): number {
  const chars = textChars(props, pace === "rapido" ? TEXT_KEYS : ENSENAR_TEXT_KEYS);
  if (pace === "rapido") {
    const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
    return +(s + (hold ? 0.7 : 0)).toFixed(2);
  }
  const text = Math.min(8, Math.max(3.5, 2.4 + chars / 16)) + (hold ? 1.0 : 0);
  const bullets = Array.isArray(props.bullets) ? props.bullets.filter((x) => typeof x === "string").length : 0;
  const forBullets = bullets > 0 ? BULLET_LEAD + PACES.ensenar.stagger * (bullets - 1) + BULLET_TAIL : 0;
  return +Math.max(text, forBullets).toFixed(2);
}

/** Ritmo efectivo: `pace` explícito (p. ej. `--pace`) > el del carrusel > DEFAULT_PACE. */
export function specPace(spec: CarouselSpec, pace?: Pace): Pace {
  if (pace !== undefined) return parsePace(pace);
  return spec.pace === undefined ? DEFAULT_PACE : parsePace(spec.pace, `el campo pace de "${spec.name}"`);
}

/** Duración de cada escena del carrusel; `seconds` la fija para todas. */
export function specDurations(spec: CarouselSpec, seconds?: number, pace?: Pace): number[] {
  const p = specPace(spec, pace);
  const last = spec.slides.length - 1;
  return spec.slides.map((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    return seconds ?? sceneSeconds(props, i === 0 || i === last, p);
  });
}

/** Tiempo máximo (s) que pueden ocupar las entradas de una escena. */
export function entranceBudget(dur: number, pace: Pace = DEFAULT_PACE): number {
  const p = PACES[pace];
  return +Math.min(p.budgetRatio * dur, p.budgetMax).toFixed(3);
}

/**
 * timeScale a aplicar a las entradas (duración natural `natural` a velocidad
 * 1): `slow` las hace más lentas (timeScale 1/slow) y solo se comprimen (>1)
 * si a esa velocidad no caben en el presupuesto. Es la misma regla que aplica
 * el runtime.
 */
export function entranceScale(natural: number, budget: number, slow = 1): number {
  return natural * slow > budget ? natural / budget : 1 / slow;
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
  /** Ritmo del reel. */
  pace: Pace;
  transition: number;
  /** Factor de lentitud de las entradas (no se aplica a la escena 0). */
  entranceSlow: number;
  /** Separación (s) entre bullets de un `stagger`; en `ensenar` no se comprime. */
  stagger: number;
  total: number;
  frames: number;
  scenes: SceneTiming[];
}

/**
 * Tiempos del reel: la escena i empieza en Σ dur[j<i] − i·transition, de modo
 * que cada par consecutivo se solapa `transition` segundos (por defecto, la
 * del ritmo).
 */
export function reelTiming(durations: number[], transition?: number, pace: Pace = DEFAULT_PACE, fps = FPS): ReelTiming {
  const p = PACES[parsePace(pace)];
  const fade = transition ?? p.transition;
  if (durations.length === 0) throw new Error("El reel necesita al menos una escena.");
  const bad = durations.findIndex((d) => !Number.isFinite(d) || d <= 0);
  if (bad !== -1) {
    throw new Error(`La duración de la escena ${bad + 1} (${durations[bad]}) no es válida: --seconds debe ser un número mayor que 0.`);
  }
  if (!Number.isFinite(fade) || fade < 0) {
    throw new Error(`La transición (${fade}) no es válida: --fade debe ser un número mayor o igual a 0.`);
  }
  if (durations.length > 1 && fade * 2 >= Math.min(...durations)) {
    throw new Error(
      `La transición (${fade}s) es demasiado larga para escenas de ${Math.min(...durations)}s: debe durar menos de la mitad de la escena más corta.`,
    );
  }
  let cursor = 0;
  const scenes = durations.map((dur) => {
    const scene = { start: +cursor.toFixed(3), dur, budget: entranceBudget(dur, pace) };
    cursor += dur - fade;
    return scene;
  });
  const sum = durations.reduce((a, b) => a + b, 0);
  const total = +(sum - (durations.length - 1) * fade).toFixed(3);
  return { fps, pace, transition: fade, entranceSlow: p.entranceSlow, stagger: p.stagger, total, frames: Math.round(total * fps), scenes };
}

export interface SpecTimingOptions {
  /** Duración uniforme por escena (s), `--seconds`. */
  seconds?: number;
  /** Transición (s), `--fade`. */
  fade?: number;
  /** Ritmo, `--pace` (sobrescribe el del carrusel). */
  pace?: Pace;
}

/** Tiempos del reel de un carrusel: resuelve el ritmo y aplica los overrides. */
export function specTiming(spec: CarouselSpec, opts: SpecTimingOptions = {}): ReelTiming {
  const pace = specPace(spec, opts.pace);
  return reelTiming(specDurations(spec, opts.seconds, pace), opts.fade, pace);
}
