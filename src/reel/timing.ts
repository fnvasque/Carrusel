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
  /**
   * Experimento de retención (referencias/hook-de-video.md, escalera-de-la-dopamina.md):
   * entradas rápidas, bullets casi seguidos y transición corta; la curva de
   * tempo (GANCHO) la aplica `sceneDurations`.
   */
  gancho: {
    transition: 0.3,
    entranceSlow: 1,
    stagger: 0.45,
    budgetRatio: 0.45,
    budgetMax: 1.6,
  },
} as const satisfies Record<Pace, unknown>;

/** Los ritmos válidos, en el orden en que los nombran los mensajes de error. */
export const PACE_NAMES = ["ensenar", "rapido", "gancho"] as const satisfies readonly Pace[];

/** Ritmo por defecto (si ni el carrusel ni `--pace` lo fijan). */
export const DEFAULT_PACE: Pace = "ensenar";

/** Transición del ritmo rápido (compatibilidad con el motor original). */
export const DEFAULT_TRANSITION = PACES.rapido.transition;

/** En `ensenar`: segundos hasta el primer bullet y de lectura tras el último. */
export const BULLET_LEAD = 1.0;
export const BULLET_TAIL = 2.5;

/**
 * Curva de tempo del ritmo `gancho`, sobre la duración base de cada escena
 * (`sceneSeconds`): el hook queda como está (≤ HOOK_MAX_SECONDS_GANCHO), las
 * escenas que empiezan antes del `arranque` del reel se acortan
 * (`factorArranque`), las del medio se alargan (`factorMedio`: el ritmo frena
 * pasado el 20 %) y la última se alarga más (`factorCierre`: cierre lento).
 * Ninguna baja de `minSeconds` ni de lo que piden sus bullets
 * (bulletLead + stagger × (n − 1) + bulletTail).
 */
export const GANCHO = {
  arranque: 0.2,
  factorArranque: 0.85,
  factorMedio: 1.2,
  factorCierre: 1.5,
  minSeconds: 1.6,
  bulletLead: 0.6,
  bulletTail: 1.2,
} as const;

/** Tope (s) de la escena 0 en `gancho`: la promesa completa antes de los 3 s (hook-de-video.md). */
export const HOOK_MAX_SECONDS_GANCHO = 3.0;

/**
 * Piso (s) de una escena `Clip` (video generado a pantalla completa, `props.archivo`):
 * menos de 3 s no deja ver el clip. La narración la alarga igual que a las demás.
 */
export const CLIP_MIN_SECONDS = 3.0;

/** ¿La escena es un `Clip`? (trae `archivo`, el nombre del clip en la caché). */
export function esEscenaClip(props: Record<string, unknown>): boolean {
  return typeof props.archivo === "string" && props.archivo.trim() !== "";
}

/** Valida un ritmo (del carrusel o de `--pace`); lanza un error claro en español. */
export function parsePace(value: unknown, origin = "--pace"): Pace {
  if ((PACE_NAMES as readonly unknown[]).includes(value)) return value as Pace;
  throw new Error(`El ritmo ${JSON.stringify(value)} no es válido: ${origin} debe ser "ensenar", "rapido" o "gancho".`);
}

/**
 * Props cuyo texto hay que leer (en ambos ritmos): títulos, cuerpo, bullets,
 * citas, mito/realidad, el dato de Stat (valor, etiqueta, contexto) y el
 * prompt copiable.
 */
const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note", "value", "label", "context", "prompt", "respuesta", "nota"];

/**
 * Tope (s) de la escena 0 (hook) en `ensenar`: la promesa llega en 3 s y se
 * sostiene hasta ~6 s (referencias/hook-de-video.md).
 */
export const HOOK_MAX_SECONDS = 5.0;

/** Caracteres de texto visibles de una escena (los que hay que leer). */
function textChars(props: Record<string, unknown>): number {
  let chars = 0;
  for (const k of TEXT_KEYS) {
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
 *    tiempo para leer el último). Si `hook` (escena 0), tope HOOK_MAX_SECONDS
 *    (también cuando manda la fórmula de bullets: el runtime los acerca).
 *  - gancho: base clamp(1.6 + chars/28, 2.0, 4.5), sin respiro por `hold` (la
 *    curva GANCHO alarga el cierre); si `hook`, tope HOOK_MAX_SECONDS_GANCHO.
 *    Es la duración base: la definitiva la da `sceneDurations`.
 *  - Escena `Clip` (`props.archivo`): nunca menos de CLIP_MIN_SECONDS (3 s).
 */
export function sceneSeconds(props: Record<string, unknown>, hold: boolean, pace: Pace = DEFAULT_PACE, hook = false): number {
  const s = sceneSecondsTexto(props, hold, pace, hook);
  return esEscenaClip(props) ? Math.max(CLIP_MIN_SECONDS, s) : s;
}

/** `sceneSeconds` sin el piso de `Clip`. */
function sceneSecondsTexto(props: Record<string, unknown>, hold: boolean, pace: Pace, hook: boolean): number {
  const chars = textChars(props);
  if (pace === "rapido") {
    const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
    return +(s + (hold ? 0.7 : 0)).toFixed(2);
  }
  if (pace === "gancho") {
    const s = Math.min(4.5, Math.max(2.0, 1.6 + chars / 28));
    return +(hook ? Math.min(HOOK_MAX_SECONDS_GANCHO, s) : s).toFixed(2);
  }
  const text = Math.min(8, Math.max(3.5, 2.4 + chars / 16)) + (hold ? 1.0 : 0);
  const bullets = Array.isArray(props.bullets) ? props.bullets.filter((x) => typeof x === "string").length : 0;
  const forBullets = bullets > 0 ? BULLET_LEAD + PACES.ensenar.stagger * (bullets - 1) + BULLET_TAIL : 0;
  const s = Math.max(text, forBullets);
  return +(hook ? Math.min(HOOK_MAX_SECONDS, s) : s).toFixed(2);
}

/** Ritmo efectivo: `pace` explícito (p. ej. `--pace`) > el del carrusel > DEFAULT_PACE. */
export function specPace(spec: CarouselSpec, pace?: Pace): Pace {
  if (pace !== undefined) return parsePace(pace);
  return spec.pace === undefined ? DEFAULT_PACE : parsePace(spec.pace, `el campo pace de "${spec.name}"`);
}

/** Bullets (textos) de una escena. */
function bulletCount(props: Record<string, unknown>): number {
  return Array.isArray(props.bullets) ? props.bullets.filter((x) => typeof x === "string").length : 0;
}

/**
 * Duración de cada escena a partir de las props de todas (ya con `defaults`).
 * En `ensenar` y `rapido` es `sceneSeconds` escena a escena (respiro en la
 * primera y la última, tope del hook en la 0). En `gancho` aplica la curva
 * GANCHO sobre las bases: la escena i empieza (en bases) en Σ base[j<i]; si
 * eso cae antes de `arranque` × Σ base va rápida, si no, frena; la última
 * cierra lenta; el hook no se toca. validar.mjs lleva una copia
 * (`segundosEscenas`).
 */
export function sceneDurations(propsList: Record<string, unknown>[], pace: Pace = DEFAULT_PACE): number[] {
  const last = propsList.length - 1;
  if (pace !== "gancho") return propsList.map((props, i) => sceneSeconds(props, i === 0 || i === last, pace, i === 0));
  const base = propsList.map((props, i) => sceneSeconds(props, false, "gancho", i === 0));
  const total = base.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return base.map((b, i) => {
    const start = cursor;
    cursor += b;
    let d = b;
    if (i === 0) d = b;
    else if (i === last) d = b * GANCHO.factorCierre;
    else if (start < total * GANCHO.arranque) d = b * GANCHO.factorArranque;
    else d = b * GANCHO.factorMedio;
    const n = bulletCount(propsList[i]);
    const forBullets = n > 0 ? GANCHO.bulletLead + PACES.gancho.stagger * (n - 1) + GANCHO.bulletTail : 0;
    const piso = esEscenaClip(propsList[i]) ? CLIP_MIN_SECONDS : 0;
    return +Math.max(GANCHO.minSeconds, forBullets, piso, d).toFixed(2);
  });
}

/** Duración de cada escena del carrusel; `seconds` la fija para todas. */
export function specDurations(spec: CarouselSpec, seconds?: number, pace?: Pace): number[] {
  const p = specPace(spec, pace);
  if (seconds !== undefined) return spec.slides.map(() => seconds);
  return sceneDurations(spec.slides.map((slide) => ({ ...spec.defaults, ...slide.props }) as Record<string, unknown>), p);
}

/**
 * Motivo (en español) por el que un reel de `total` s se pasa del tope `max`
 * (s), o undefined si cabe. Lo usan el calendario (`duracionMaxSegundos` de la
 * puerta o de `parametros`) y `--max-seconds` del CLI.
 */
export function maxSecondsError(total: number, max: number | undefined): string | undefined {
  if (max === undefined) return undefined;
  if (!Number.isFinite(max) || max <= 0) return `El tope de duración (${max}) no es válido: debe ser un número de segundos mayor que 0.`;
  if (total <= max + 1e-9) return undefined;
  return `El reel dura ${total} s y el tope es ${max} s (duracionMaxSegundos): quita escenas o acorta el texto.`;
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
  /**
   * Solo `ensenar`: segundos de lectura que quedan tras el último bullet hasta
   * el fin de la escena (BULLET_TAIL); 0 en `rapido` (sin garantía).
   */
  bulletTail: number;
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
  return { fps, pace, transition: fade, entranceSlow: p.entranceSlow, stagger: p.stagger, bulletTail: pace === "ensenar" ? BULLET_TAIL : 0, total, frames: Math.round(total * fps), scenes };
}

export interface SpecTimingOptions {
  /** Duración uniforme por escena (s), `--seconds`. */
  seconds?: number;
  /** Transición (s), `--fade`. */
  fade?: number;
  /** Ritmo, `--pace` (sobrescribe el del carrusel). */
  pace?: Pace;
  /**
   * Duración (s) de la narración de cada escena (`undefined` donde no hay voz):
   * la escena dura al menos lo que se tarda en decirla (`conNarracion`).
   */
  narracion?: (number | undefined)[];
}

/** Segundos que se suman a una narración (entrada de la escena + silencio final) para fijar su escena. */
export const NARRACION_MARGEN = 0.75;

/**
 * Alarga cada escena con narración hasta que quepa su voz: max(duración por
 * texto, narración + NARRACION_MARGEN). Ninguna se acorta y el tope del hook
 * no aplica (la voz no se corta). Las escenas sin narración no cambian.
 */
export function conNarracion(durations: number[], narracion?: (number | undefined)[]): number[] {
  if (!narracion) return durations;
  return durations.map((d, i) => {
    const n = narracion[i];
    if (n === undefined) return d;
    if (!Number.isFinite(n) || n <= 0) throw new Error(`La narración de la escena ${i + 1} dura ${n} s: debe ser un número mayor que 0.`);
    return +Math.max(d, n + NARRACION_MARGEN).toFixed(2);
  });
}

/** Tiempos del reel de un carrusel: resuelve el ritmo y aplica los overrides. */
export function specTiming(spec: CarouselSpec, opts: SpecTimingOptions = {}): ReelTiming {
  const pace = specPace(spec, opts.pace);
  return reelTiming(conNarracion(specDurations(spec, opts.seconds, pace), opts.narracion), opts.fade, pace);
}
