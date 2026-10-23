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

export interface ResumenVisual {
  porSemana: { semana: string; avisos: number; respondidos: number; aciertos: number; precision?: number }[];
  /** tipo → semana → casos. */
  porTipo: Record<string, Record<string, number>>;
  total: { avisos: number; respondidos: number; aciertos: number; precision?: number };
  alertas: string[];
  propuestas: string[];
}

const r2 = (x: number): number => Math.round(x * 100) / 100;
const conPrecision = (avisos: number, respondidos: number, aciertos: number) => ({ avisos, respondidos, aciertos, ...(respondidos > 0 ? { precision: r2(aciertos / respondidos) } : {}) });

/**
 * Precisión del revisor visual («Tenía razón» entre los avisos respondidos), hallazgos por tipo y semana,
 * alertas (un tipo de fase 1 reaparece desde `desdeFase1`) y propuestas (tipo `fondo-*` repetido).
 */
export function resumenVisual(semanas: { semana: string; visual: VisualJson; respuestas: RespuestaVisual[] }[], desdeFase1?: string): ResumenVisual {
  const porTipo: Record<string, Record<string, number>> = {};
  const sumar = (tipo: string, semana: string): void => {
    const t = (porTipo[tipo] ??= {});
    t[semana] = (t[semana] ?? 0) + 1;
  };
  const alertasPorTipo: Record<string, number> = {};
  const porSemana: ResumenVisual["porSemana"] = [];
  for (const { semana, visual, respuestas } of semanas) {
    const ultima = new Map<string, RespuestaVisual>();
    for (const r of respuestas) {
      const k = `${r.id}#${r.n}`;
      const previa = ultima.get(k);
      if (!previa || r.en >= previa.en) ultima.set(k, r);
    }
    let avisos = 0, respondidos = 0, aciertos = 0;
    for (const [id, pieza] of Object.entries(visual)) {
      if (id === "_presupuesto" || !pieza || typeof pieza !== "object") continue;
      const p = pieza as VisualPieza;
      if (p.revisor?.estado === "revisado") {
        for (const img of p.revisor.imagenes) {
          if (!img.compite && !img.ajeno) continue;
          avisos++;
          sumar(img.compite ? "fondo-compite" : "fondo-ajeno", semana);
          const r = ultima.get(`${id}#${img.n}`);
          if (r) {
            respondidos++;
            if (r.respuesta === "si") aciertos++;
          }
        }
      }
      for (const h of p.fase1 ?? []) {
        sumar(h.tipo, semana);
        if (desdeFase1 && h.en.slice(0, 10) >= desdeFase1) alertasPorTipo[h.tipo] = (alertasPorTipo[h.tipo] ?? 0) + 1;
      }
    }
    porSemana.push({ semana, ...conPrecision(avisos, respondidos, aciertos) });
  }
  const suma = (k: "avisos" | "respondidos" | "aciertos"): number => porSemana.reduce((a, s) => a + s[k], 0);
  const alertas = Object.entries(alertasPorTipo).map(([tipo, n]) => `el motor volvió a fallar en ${tipo} (${n} casos desde ${desdeFase1}): revisar el código`);
  const propuestas: string[] = [];
  for (const [tipo, sem] of Object.entries(porTipo)) {
    if (!tipo.startsWith("fondo-")) continue;
    const n = Object.values(sem).reduce((a, b) => a + b, 0);
    const k = Object.keys(sem).length;
    if (n >= 3 && k >= 2) propuestas.push(`proponer regla en aprendizajes.md: ${tipo} (${n} casos en ${k} semanas)`);
  }
  return { porSemana, porTipo, total: conPrecision(suma("avisos"), suma("respondidos"), suma("aciertos")), alertas, propuestas };
}
