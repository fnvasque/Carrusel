import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { kbDir } from "../kb/store.ts";
import { fechaValida } from "./time.ts";

/**
 * Tipos y lectura del calendario (`<base>/_calendario/<semana>/`). Un escritor por archivo:
 * `plan.json` solo el agente (inmutable), `render.json` solo el Mac, `estado.json` solo el bot.
 * El estado efectivo de una pieza se deduce con `estadoEfectivo`.
 */

export type Formato = "reel" | "carrusel";
export type Senal = "guardados" | "envios" | "comentarios" | "retencion";
export type Estado = "planificado" | "renderizado" | "programado" | "publicado" | "saltado" | "fallido";

export interface Pieza {
  id: string;
  dia: string;
  hora: string;
  formato: Formato;
  arquetipo: string;
  senal: Senal;
  tema: string;
  pilar: string;
  hook: { categoria: string; texto: string; score: number };
  emocion: string;
  entregable: string;
  fraseAmigo: string;
  lectorFrio: { intentos: number; resultado: string; notas: string };
  origen: { fichas: string[]; referencias: string[] };
  derivadoDe: string | null;
  caption: string;
  borrador: string;
  estado: Estado;
  parametros?: Record<string, unknown>;
}

export interface Plan {
  semana: string;
  zona: string;
  experimento: { variable: string; hipotesis: string; piezas: string[] } | null;
  piezas: Pieza[];
  motivo?: string;
}

export interface Medios {
  urls: string[];
  cover?: string;
  story?: string;
  duracionMs?: number;
}

export interface RenderEntry {
  estado: "renderizado" | "fallido";
  medios?: Medios;
  motivo?: string;
  en: string;
}

export interface EstadoEntry {
  estado: Estado;
  motivo?: string;
  containerId?: string;
  mediaId?: string;
  permalink?: string;
  publicadoEn?: string;
  story?: { estado: Estado; mediaId?: string; motivo?: string };
}

export type SemanaLeida = {
  semana: string;
  plan: Plan;
  render: Record<string, RenderEntry>;
  estado: Record<string, EstadoEntry>;
};

const dia = z.string().refine(fechaValida, "fecha inválida (AAAA-MM-DD)");
const ESTADOS = ["planificado", "renderizado", "programado", "publicado", "saltado", "fallido"] as const;
const estadoEnum = z.enum(ESTADOS);

const PiezaSchema = z.object({
  // El id es nombre de carpeta y segmento de URL (contrato de las tareas 5 y 9).
  id: z.string().regex(/^[a-z0-9-]{3,80}$/, "id inválido (minúsculas, números y -, 3 a 80 caracteres)"),
  dia,
  hora: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, "hora inválida (HH:00 o HH:30)"),
  formato: z.enum(["reel", "carrusel"]),
  arquetipo: z.string(),
  senal: z.enum(["guardados", "envios", "comentarios", "retencion"]),
  tema: z.string(),
  pilar: z.string(),
  hook: z.object({ categoria: z.string(), texto: z.string(), score: z.number() }),
  emocion: z.string(),
  entregable: z.string(),
  fraseAmigo: z.string(),
  lectorFrio: z.object({ intentos: z.number().int(), resultado: z.string(), notas: z.string() }),
  origen: z.object({ fichas: z.array(z.string()), referencias: z.array(z.string()) }),
  derivadoDe: z.string().nullable(),
  caption: z.string(),
  borrador: z.string(),
  estado: estadoEnum,
  parametros: z.record(z.unknown()).optional(),
});

export const PlanSchema: z.ZodType<Plan> = z
  .object({
    semana: dia,
    zona: z.string(),
    experimento: z.object({ variable: z.string(), hipotesis: z.string(), piezas: z.array(z.string()) }).nullable(),
    piezas: z.array(PiezaSchema),
    motivo: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    const vistos = new Set<string>();
    p.piezas.forEach((pz, i) => {
      if (vistos.has(pz.id)) ctx.addIssue({ code: "custom", path: ["piezas", i, "id"], message: `id repetido: ${pz.id}` });
      vistos.add(pz.id);
    });
  });

const rutaDe = (path: (string | number)[]): string => path.join(".") || "(raíz)";

/** Valida el texto de un plan.json. Lanza Error con la ruta del campo inválido. */
export function parsePlan(text: string): Plan {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`plan.json no es JSON válido: ${e instanceof Error ? e.message : e}`);
  }
  const r = PlanSchema.safeParse(raw);
  if (!r.success) {
    throw new Error(`plan.json inválido: ${r.error.issues.map((i) => `${rutaDe(i.path)}: ${i.message}`).join("; ")}`);
  }
  return r.data;
}

/**
 * Estado de una pieza. El plan es inmutable: su `estado` solo cuenta si no hay otra
 * fuente. Gana el bot (`estado.json`), luego el Mac (`render.json`). Función pura.
 */
export function estadoEfectivo(p: Pieza, render?: RenderEntry, estado?: EstadoEntry): Estado {
  if (estado) return estado.estado;
  if (render) return render.estado;
  return p.estado ?? "planificado";
}

export const calendarioDir = (): string => join(kbDir(), "_calendario");

const SEMANA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Carpeta de una semana. Lanza si `semana` no es AAAA-MM-DD (evita salirse de _calendario). */
export function semanaDir(semana: string): string {
  if (!SEMANA_RE.test(semana)) throw new Error(`Semana inválida: ${semana}`);
  return join(calendarioDir(), semana);
}

const MediosSchema = z.object({
  urls: z.array(z.string()),
  cover: z.string().optional(),
  story: z.string().optional(),
  duracionMs: z.number().optional(),
});
const RenderEntrySchema = z.object({
  estado: z.enum(["renderizado", "fallido"]),
  medios: MediosSchema.optional(),
  motivo: z.string().optional(),
  en: z.string(),
});
const EstadoEntrySchema = z.object({
  estado: estadoEnum,
  motivo: z.string().optional(),
  containerId: z.string().optional(),
  mediaId: z.string().optional(),
  permalink: z.string().optional(),
  publicadoEn: z.string().optional(),
  story: z.object({ estado: estadoEnum, mediaId: z.string().optional(), motivo: z.string().optional() }).optional(),
});

/**
 * Lee un mapa `{ [id]: entrada }` opcional. Falta, corrupto o con entradas inválidas →
 * se avisa y se ignora (nunca lanza). El resultado no tiene prototipo: `m["constructor"]`
 * no devuelve nada.
 */
async function leerMapa<T>(archivo: string, schema: z.ZodType<T>): Promise<Record<string, T>> {
  const out: Record<string, T> = Object.create(null);
  let texto: string;
  try {
    texto = await readFile(archivo, "utf8");
  } catch {
    return out;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(texto);
  } catch (e) {
    console.warn(`[calendario] ${archivo} corrupto, se ignora: ${e instanceof Error ? e.message : e}`);
    return out;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    console.warn(`[calendario] ${archivo} no es un objeto, se ignora`);
    return out;
  }
  for (const [id, valor] of Object.entries(raw)) {
    const r = schema.safeParse(valor);
    if (r.success) out[id] = r.data;
    else console.warn(`[calendario] ${archivo}: entrada "${id}" inválida, se ignora`);
  }
  return out;
}

/**
 * Plan + render + estado de una semana. `undefined` si no hay carpeta o `plan.json`
 * (o la semana no es AAAA-MM-DD). Un `plan.json` inválido lanza (el agente debe verlo);
 * `render.json` y `estado.json` faltantes o corruptos se toman como `{}`.
 */
export async function leerSemana(semana: string): Promise<SemanaLeida | undefined> {
  if (!SEMANA_RE.test(semana)) return undefined;
  const dir = semanaDir(semana);
  let texto: string;
  try {
    texto = await readFile(join(dir, "plan.json"), "utf8");
  } catch {
    return undefined;
  }
  const plan = parsePlan(texto);
  const render = await leerMapa(join(dir, "render.json"), RenderEntrySchema);
  const estado = await leerMapa(join(dir, "estado.json"), EstadoEntrySchema);
  return { semana, plan, render, estado };
}

/** Carpetas AAAA-MM-DD de `_calendario/`, ordenadas (la última es la más reciente). */
export async function listarSemanas(): Promise<string[]> {
  try {
    const entries = await readdir(calendarioDir(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && SEMANA_RE.test(e.name)).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

/**
 * URL pública de un archivo de medios: `<base>/media/<token>/<semana>/<id>/<archivo>`.
 * Cada segmento se codifica; el base pierde las barras finales; nunca queda `//`.
 */
export function urlPublica(base: string, token: string, semana: string, id: string, archivo: string): string {
  const segs = [token, semana, id, archivo];
  if (segs.some((s) => s === "")) throw new Error("urlPublica: segmento vacío");
  return `${base.replace(/\/+$/, "")}/media/${segs.map(encodeURIComponent).join("/")}`;
}

/** Reemplaza toda aparición del token (también codificado) por `***`. Sin token no hace nada. */
export function ocultarToken(s: string, token: string): string {
  if (!token) return s;
  let out = s.split(token).join("***");
  const enc = encodeURIComponent(token);
  if (enc !== token) out = out.split(enc).join("***");
  return out;
}
