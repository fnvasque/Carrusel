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

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const numOk = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

/** Oculta fragmentos con forma de clave de API (`sk-…`) antes de guardar o loguear un texto. */
export function sinClaves(s: string): string {
  return s.replace(/\bsk-[A-Za-z0-9_-]+/g, "sk-…");
}

/** Lee `visual.json` y descarta lo que no tiene la forma esperada; si falta o está corrupto devuelve `{}`. */
export async function leerVisual(semana: string): Promise<VisualJson> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(visualPath(semana), "utf8"));
  } catch {
    return {};
  }
  if (!esObjeto(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "_presupuesto") {
      if (esObjeto(v) && numOk(v.imagenes) && numOk(v.usd)) out[k] = { ...v, imagenes: v.imagenes, usd: v.usd };
      continue;
    }
    if (!esObjeto(v)) continue;
    const pieza: Record<string, unknown> = { ...v };
    if ("fase1" in pieza && !Array.isArray(pieza.fase1)) delete pieza.fase1;
    if ("revisor" in pieza && !(esObjeto(pieza.revisor) && Array.isArray(pieza.revisor.imagenes))) delete pieza.revisor;
    out[k] = pieza;
  }
  return out as VisualJson;
}

/** Lee las respuestas; las líneas que no son JSON o no tienen la forma de `RespuestaVisual` se saltan. */
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
      if (esObjeto(o) && typeof o.id === "string" && typeof o.n === "number" && Number.isInteger(o.n) && o.n >= 1 && (o.respuesta === "si" || o.respuesta === "no") && typeof o.en === "string") {
        out.push(o as unknown as RespuestaVisual);
      }
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

/** Cuántas imágenes puede revisar la pieza sin pasar los topes (0 = sin revisar), y el motivo si se recorta a 0. Falla cerrado ante datos ilegibles. */
export function cupo(pres: PresupuestoSemana | undefined, pedidas: number): { imagenes: number; motivo?: string } {
  if (pres && (!numOk(pres.usd) || !numOk(pres.imagenes))) return { imagenes: 0, motivo: "presupuesto ilegible" };
  if (pres && pres.usd >= TOPES_REVISOR.usdPorSemana) return { imagenes: 0, motivo: `tope semanal de US$${TOPES_REVISOR.usdPorSemana}` };
  const pide = Number.isFinite(pedidas) && pedidas > 0 ? Math.floor(pedidas) : 0;
  const restan = TOPES_REVISOR.imagenesPorSemana - (pres?.imagenes ?? 0);
  const n = Math.max(0, Math.min(pide, TOPES_REVISOR.imagenesPorPieza, restan));
  if (n === 0 && pide > 0) return { imagenes: 0, motivo: `tope semanal de ${TOPES_REVISOR.imagenesPorSemana} imágenes` };
  return { imagenes: n };
}
