import { conNarracion, DEFAULT_PACE, PACE_NAMES, PACES, sceneDurations } from "../reel/timing.ts";
import type { Pace } from "../templates/types.ts";

/**
 * Diagnóstico escena por escena de un reel medido (`bucle.json → piezas[].abandono`):
 * con los tiempos de escena del motor (`sceneDurations` + narración) y la duración real del
 * mp4 (`render.json → medios.duracionMs`), ubica el segundo `avgWatchMs` en una escena.
 * Así el planificador ve dónde se va el espectador promedio (en el Hook, en el paso 2…).
 *
 * La voz real (Kokoro, medida en el Mac) no está en el borrador: se estima como
 * `validar.mjs → segundosNarracion` y después todo se escala a la duración real, así que el
 * error de la estimación se reparte entre las escenas en vez de correr el final.
 */

/** Palabras por segundo de la narración estimada (copia de `NARRACION_PPS` en validar.mjs). */
const NARRACION_PPS = 2.9;
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const r2 = (x: number): number => Math.round(x * 100) / 100 + 0;

/** Segundos de voz estimados de un texto (como `segundosNarracion` de validar.mjs). */
export function segundosNarracion(texto: unknown): number | undefined {
  if (typeof texto !== "string" || !texto.trim()) return undefined;
  return +Math.max(1.0, texto.split(/\s+/).filter(Boolean).length / NARRACION_PPS + 0.3).toFixed(2);
}

export interface Escena {
  /** 1 = el Hook. */
  escena: number;
  plantilla: string;
  /** Segundos desde el inicio del reel (ya escalados a la duración real si se conoce). */
  inicio: number;
  fin: number;
  /** Título visible de la escena (title, heading o text), para leer el diagnóstico sin abrir el borrador. */
  titulo?: string;
}

/**
 * Escenas de un borrador de reel con su inicio y fin. Cada escena empieza cuando termina la
 * transición de la anterior (como `reelTiming`): inicio_i = Σ (dur_j − transición). Con
 * `duracionMs` (> 0) se escala a esa duración. Borrador raro → `[]`.
 */
export function escenasDeReel(borrador: unknown, duracionMs?: number): Escena[] {
  if (!esObj(borrador) || !Array.isArray(borrador.slides) || !borrador.slides.length) return [];
  const slides = borrador.slides.map((s) => (esObj(s) ? s : {}));
  const pace: Pace = PACE_NAMES.includes(borrador.pace as Pace) ? (borrador.pace as Pace) : DEFAULT_PACE;
  const defaults = esObj(borrador.defaults) ? borrador.defaults : {};
  let durs: number[];
  try {
    durs = conNarracion(
      sceneDurations(slides.map((s) => ({ ...defaults, ...(esObj(s.props) ? s.props : {}) })), pace),
      slides.map((s) => segundosNarracion(s.narracion)),
    );
  } catch {
    return [];
  }
  if (durs.some((d) => !Number.isFinite(d) || d <= 0)) return [];
  const fade = PACES[pace].transition;
  const total = durs.reduce((a, b) => a + b, 0) - (durs.length - 1) * fade;
  const k = typeof duracionMs === "number" && Number.isFinite(duracionMs) && duracionMs > 0 && total > 0 ? duracionMs / 1000 / total : 1;
  let cursor = 0;
  return slides.map((s, i) => {
    const inicio = cursor;
    // La escena se ve hasta que empieza la siguiente (la última, hasta el final).
    cursor += durs[i]! - (i < durs.length - 1 ? fade : 0);
    const props = esObj(s.props) ? s.props : {};
    const titulo = [props.title, props.heading, props.text].find((t): t is string => typeof t === "string" && t.trim() !== "");
    return { escena: i + 1, plantilla: typeof s.template === "string" ? s.template : "?", inicio: r2(inicio * k), fin: r2(cursor * k), ...(titulo ? { titulo: titulo.trim() } : {}) };
  });
}

export interface Abandono extends Escena {
  /** Segundo del visionado medio (`avgWatchMs` / 1000). */
  segundo: number;
  /** Escenas del reel. */
  de: number;
}

/**
 * Escena en la que está el segundo `avgWatchMs` (el espectador promedio se va ahí). Un
 * visionado medio más largo que el reel (repeticiones) cae en la última. Sin escenas o sin
 * `avgWatchMs` válido → `undefined`.
 */
export function escenaDeAbandono(escenas: Escena[], avgWatchMs: unknown): Abandono | undefined {
  if (!escenas.length || typeof avgWatchMs !== "number" || !Number.isFinite(avgWatchMs) || avgWatchMs < 0) return undefined;
  const t = avgWatchMs / 1000;
  const e = escenas.find((x) => t < x.fin) ?? escenas[escenas.length - 1]!;
  return { ...e, segundo: r2(t), de: escenas.length };
}
