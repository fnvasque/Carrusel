import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { semanaDir } from "./plan.ts";

/**
 * Registro visual de la semana (`<semana>/visual.json`, lo escribe el Mac) y las
 * respuestas a los botones del bot (`visual-respuestas.jsonl`, solo agrega líneas).
 */

export type TipoHallazgo = "tilde" | "puntuacion" | "transicion" | "numero-solo" | "zona" | "fondo-compite" | "fondo-ajeno";

export interface VeredictoImagen { n: number; que: string; compite: boolean; ajeno: boolean; frase: string }

export interface RevisionPieza {
  en: string;
  modelo: string;
  estado: "revisado" | "sin revisar";
  motivo?: string;
  imagenes: VeredictoImagen[];
  usd: number;
}

export interface VisualPieza {
  revisor?: RevisionPieza;
  fase1?: { tipo: TipoHallazgo; motivo: string; en: string }[];
}

export interface PresupuestoSemana { imagenes: number; usd: number }

export type VisualJson = Record<string, VisualPieza> & { _presupuesto?: PresupuestoSemana };

export interface RespuestaVisual { id: string; n: number; respuesta: "si" | "no"; en: string }

export const TOPES_REVISOR = { imagenesPorPieza: 12, imagenesPorSemana: 120, usdPorSemana: 5 } as const;

export const visualPath = (semana: string): string => join(semanaDir(semana), "visual.json");
export const respuestasVisualesPath = (semana: string): string => join(semanaDir(semana), "visual-respuestas.jsonl");

/** Lee `visual.json`; si falta o está corrupto devuelve `{}`. */
export async function leerVisual(semana: string): Promise<VisualJson> {
  try {
    const raw: unknown = JSON.parse(await readFile(visualPath(semana), "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as VisualJson;
  } catch {
    // falta o corrupto
  }
  return {};
}

/** Lee las respuestas; las líneas que no son JSON de objeto se saltan. */
export async function leerRespuestasVisuales(semana: string): Promise<RespuestaVisual[]> {
  let texto: string;
  try {
    texto = await readFile(respuestasVisualesPath(semana), "utf8");
  } catch {
    return [];
  }
  const out: RespuestaVisual[] = [];
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    try {
      const o: unknown = JSON.parse(linea);
      if (o && typeof o === "object" && !Array.isArray(o)) out.push(o as RespuestaVisual);
    } catch {
      // línea mala
    }
  }
  return out;
}

/** Agrega una línea a `visual-respuestas.jsonl` y devuelve la ruta. */
export async function anotarRespuestaVisual(semana: string, r: RespuestaVisual): Promise<string> {
  const ruta = respuestasVisualesPath(semana);
  await mkdir(dirname(ruta), { recursive: true });
  await appendFile(ruta, `${JSON.stringify(r)}\n`, "utf8");
  return ruta;
}

/** Cuántas imágenes puede revisar la pieza sin pasar los topes (0 = sin revisar), y el motivo si se recorta a 0. */
export function cupo(pres: PresupuestoSemana | undefined, pedidas: number): { imagenes: number; motivo?: string } {
  if (pres && pres.usd >= TOPES_REVISOR.usdPorSemana) return { imagenes: 0, motivo: `tope semanal de US$${TOPES_REVISOR.usdPorSemana}` };
  const restan = TOPES_REVISOR.imagenesPorSemana - (pres?.imagenes ?? 0);
  const n = Math.max(0, Math.min(pedidas, TOPES_REVISOR.imagenesPorPieza, restan));
  if (n === 0 && pedidas > 0) return { imagenes: 0, motivo: `tope semanal de ${TOPES_REVISOR.imagenesPorSemana} imágenes` };
  return { imagenes: n };
}
