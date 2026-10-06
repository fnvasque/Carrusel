import type { Senal } from "../calendario/plan.ts";
import type { MediaInsights } from "./client.ts";

/**
 * Ventanas de medición y métricas derivadas. Todo puro: sin red, sin disco, sin
 * reloj propio. Las ventanas se cuentan en horas absolutas desde la publicación,
 * así que un cambio de hora de Chile no las mueve.
 */

export type Ventana = "24h" | "72h" | "7d" | "14d" | "21d" | "28d";

export const VENTANAS: { ventana: Ventana; horas: number }[] = [
  { ventana: "24h", horas: 24 },
  { ventana: "72h", horas: 72 },
  { ventana: "7d", horas: 168 },
  { ventana: "14d", horas: 336 },
  { ventana: "21d", horas: 504 },
  { ventana: "28d", horas: 672 },
];

/** Tolerancia de las ventanas: ± 1 h. */
export const TOLERANCIA_MS = 3_600_000;
/** Desvío máximo para que una instantánea de 7 d entre a la comparación entre piezas. */
export const DESVIO_COMPARABLE_7D_MS = 6 * 3_600_000;

const HORA_MS = 3_600_000;

/** Milisegundos de desvío de `tomada` respecto de la hora nominal de la ventana (negativo = antes). */
export function desvioVentana(publicado: Date, ventana: Ventana, tomada: Date): number {
  const horas = VENTANAS.find((v) => v.ventana === ventana)!.horas;
  return tomada.getTime() - (publicado.getTime() + horas * HORA_MS);
}

/**
 * Qué ventana toca tomar ahora, si toca alguna.
 *
 * Regla de la ventana atrasada: se devuelve la ventana VENCIDA MÁS RECIENTE
 * (`ahora ≥ publicado + horas − 1 h`) que no se haya tomado; las anteriores a ella
 * se saltan (si el bot estuvo caído, medir "24 h" a los 5 días no sirve). Si esa
 * más reciente ya se tomó, no hay nada que tomar. Nada después de 28 d + 1 h.
 * Si se toma con más de 1 h de desvío, `tomadaEn` refleja la hora real y el
 * resumen la marca "(tardía)". La comparación entre piezas usa solo `7d` con
 * desvío ≤ 6 h (`DESVIO_COMPARABLE_7D_MS`).
 */
export function ventanaDebida(publicado: Date, ahora: Date, tomadas: Set<Ventana>): Ventana | undefined {
  const pub = publicado.getTime();
  const now = ahora.getTime();
  if (!Number.isFinite(pub) || !Number.isFinite(now)) return undefined;
  const ultima = VENTANAS[VENTANAS.length - 1]!;
  if (now > pub + ultima.horas * HORA_MS + TOLERANCIA_MS) return undefined;
  let masReciente: Ventana | undefined;
  for (const v of VENTANAS) if (now >= pub + v.horas * HORA_MS - TOLERANCIA_MS) masReciente = v.ventana;
  if (!masReciente || tomadas.has(masReciente)) return undefined;
  return masReciente;
}

export interface Derivadas {
  saved_por_alcance?: number;
  shares_por_alcance?: number;
  comments_por_alcance?: number;
  views_por_alcance?: number;
  retencion?: number;
}

const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Tasas por alcance y retención. Sin alcance positivo no hay tasas (nunca NaN ni
 * Infinity); la retención solo necesita el tiempo medio y una duración conocida.
 */
export function derivar(m: MediaInsights, duracionMs?: number): Derivadas {
  const d: Derivadas = {};
  if (esNum(m.reach) && m.reach > 0) {
    if (esNum(m.saved)) d.saved_por_alcance = m.saved / m.reach;
    if (esNum(m.shares)) d.shares_por_alcance = m.shares / m.reach;
    if (esNum(m.comments)) d.comments_por_alcance = m.comments / m.reach;
    if (esNum(m.views)) d.views_por_alcance = m.views / m.reach;
  }
  if (esNum(m.avg_watch_ms) && esNum(duracionMs) && duracionMs > 0) d.retencion = m.avg_watch_ms / duracionMs;
  return d;
}

/** Con `reach < umbral` (o sin alcance) se comparan conteos absolutos; con más, tasas. */
export function modoComparacion(reach: number | undefined, umbral: number): "absoluto" | "tasa" {
  return esNum(reach) && reach > 0 && reach >= umbral ? "tasa" : "absoluto";
}

/** Valor de la señal objetivo de una pieza: conteo o tasa según el alcance. La retención siempre es razón. */
export function valorSenal(senal: Senal, m: MediaInsights, d: Derivadas, umbralAlcance: number): number | undefined {
  if (senal === "retencion") return d.retencion;
  const tasa = modoComparacion(m.reach, umbralAlcance) === "tasa";
  switch (senal) {
    case "guardados": return tasa ? d.saved_por_alcance : m.saved;
    case "envios": return tasa ? d.shares_por_alcance : m.shares;
    case "comentarios": return tasa ? d.comments_por_alcance : m.comments;
  }
}
