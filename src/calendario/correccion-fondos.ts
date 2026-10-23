import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { calendarioDir, listarSemanas } from "./plan.ts";
import type { Borrador } from "./draft.ts";
import { leerRespuestasVisuales, leerVisual, resumenVisual, visualPath, type VeredictoImagen } from "./visual.ts";

/** Puerta de la fase 3 (corrección automática de fondos): cuántos avisos respondidos y qué precisión hacen falta. */
export const UMBRAL_CORRECCION = { respondidos: 30, precision: 0.8 } as const;

export interface PuertaCorreccion { activa: boolean; motivo: string; respondidos: number; precision?: number }

/** Número con coma decimal (0.72 → «0,72»). */
const coma = (x: number): string => String(x).replace(".", ",");

/** Pura: decide con el interruptor de `config.json` y el resumen de precisión del revisor. */
export function puertaCorreccion(interruptor: unknown, total: { respondidos: number; precision?: number }): PuertaCorreccion {
  const { respondidos, precision } = total;
  const base = { respondidos, ...(precision !== undefined ? { precision } : {}) };
  if (interruptor !== true) return { ...base, activa: false, motivo: "apagada en config.json" };
  if (respondidos < UMBRAL_CORRECCION.respondidos) {
    return { ...base, activa: false, motivo: `solo ${respondidos} avisos respondidos (faltan ${UMBRAL_CORRECCION.respondidos - respondidos})` };
  }
  if (precision === undefined || !(precision >= UMBRAL_CORRECCION.precision)) {
    const p = precision === undefined ? "sin precisión medida" : `precisión ${coma(precision)}`;
    return { ...base, activa: false, motivo: precision === undefined ? p : `${p} < ${coma(UMBRAL_CORRECCION.precision)}` };
  }
  return { ...base, activa: true, motivo: `activa (precisión ${coma(precision)} con ${respondidos} respondidos)` };
}

/** Lee `config.json → revisionVisual.corregir` y el resumen de todas las semanas con `visual.json`. Nunca lanza. */
export async function leerPuertaCorreccion(): Promise<PuertaCorreccion> {
  try {
    let interruptor: unknown;
    try {
      const cfg = JSON.parse(readFileSync(join(calendarioDir(), "config.json"), "utf8")) as { revisionVisual?: { corregir?: unknown } } | null;
      interruptor = cfg?.revisionVisual?.corregir;
    } catch (err) {
      return { activa: false, respondidos: 0, motivo: `config.json ausente o ilegible: ${err instanceof Error ? err.message : String(err)}` };
    }
    const semanas = [];
    for (const semana of await listarSemanas()) {
      if (!existsSync(visualPath(semana))) continue;
      const [visual, respuestas] = await Promise.all([leerVisual(semana), leerRespuestasVisuales(semana)]);
      semanas.push({ semana, visual, respuestas });
    }
    return puertaCorreccion(interruptor, resumenVisual(semanas).total);
  } catch (err) {
    return { activa: false, respondidos: 0, motivo: `no se pudo leer la puerta: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Pura: índices de slide (ordenados, sin repetir) con aviso (`compite || ajeno`) cuyo borrador tiene
 * `background.ai` y no es `Clip`; excluye los que `fondosIaQuitados` ya quita (`yaQuitadas`).
 * Falla seguro: un veredicto sin `slide` entero ≥ 0 o fuera de rango no corrige nada.
 */
export function slidesACorregir(b: Borrador, imagenes: VeredictoImagen[], yaQuitadas: number[]): number[] {
  const quitadas = new Set(yaQuitadas);
  const out = new Set<number>();
  for (const v of imagenes) {
    if (!v || (!v.compite && !v.ajeno)) continue;
    const i = v.slide;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= b.slides.length) continue;
    if (quitadas.has(i)) continue;
    const s = b.slides[i];
    if (s.template === "Clip") continue;
    const bg = s.background as Record<string, unknown> | undefined | null;
    if (!bg || typeof bg !== "object" || typeof bg.ai !== "string") continue;
    out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}
