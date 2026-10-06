import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DESVIO_COMPARABLE_7D_MS, modoComparacion, valorSenal } from "../insights/derive.ts";
import type { Instantanea } from "../insights/snapshots.ts";
import { domingoDeResumen } from "../insights/summary.ts";
import { topicKey } from "../kb/markdown.ts";
import { kbDir } from "../kb/store.ts";
import { calendarioDir, estadoEfectivo, leerSemana, listarSemanas, type SemanaLeida, type Senal } from "./plan.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "./time.ts";

/**
 * Bucle de feedback: con las instantáneas de 7 d ya medidas calcula pesos por
 * tema/arquetipo/hook (con encogimiento), ganadores, derivados pendientes, horas
 * desde `online_followers`, seguidores por pieza, comparaciones de parámetros de
 * la puerta, experimentos y el diagnóstico mensual. Todo es puro salvo
 * `escribirBucle`, que lee la base y escribe `_metricas/bucle.json`; el agente
 * planificador lo lee el domingo en vez de recalcular estadística en la nube.
 *
 * Solo entran piezas del motor con instantánea `7d` tomada a ≤ 6 h de su hora
 * nominal (`DESVIO_COMPARABLE_7D_MS`). Los posts manuales y las piezas del modo
 * de prueba (`mediaId` que empieza con `aviso-`) nunca entran.
 */

export interface Medicion {
  piezaId: string;
  mediaId?: string;
  tema: string;
  arquetipo: string;
  hookCategoria: string;
  senal: Senal;
  /** Valor de la señal objetivo a 7 d (`valorSenal`): conteo o tasa según `modo`. Siempre finito. */
  valor: number;
  /** Con qué escala se midió `valor` (la retención siempre es razón: "tasa"). */
  modo: "absoluto" | "tasa";
  /** Lunes de la semana del plan (AAAA-MM-DD). */
  semana: string;
  /** Valores con que se produjo la pieza (`plan.json → parametros`); sin ellos no cuenta para parámetros. */
  parametros?: Record<string, unknown>;
  retencion?: number;
  reach?: number;
  saved?: number;
  shares?: number;
  publicadoEn?: string;
}

const SENALES: Senal[] = ["guardados", "envios", "comentarios", "retencion"];
/** Variables de experimento fijas (R15); se suman las claves de `config.json → puerta`. */
export const VARIABLES_FIJAS = ["tema", "arquetipo", "hora", "duracion", "hook"];
const K_ENCOGIMIENTO = 3;
const MIN_PIEZAS_PESO = 3;
const MIN_PIEZAS_GANADOR = 5;
const FRACCION_GANADORES = 0.2;
const SEMANAS_DERIVADO = 2;
const MAX_DERIVADOS = 2;
const SEMANAS_EXPERIMENTO = 4;
const MIN_SEMANAS_PARAMETRO = 4;
const MIN_PIEZAS_POR_VALOR = 6;
const SEGUIDORES_PARA_HORAS = 100;
const RETENCION_MIN = 0.3;
const SEGUIDORES_POR_ALCANCE_MIN = 0.01;
/** Subida mínima (10 %) de guardados/envíos por alcance para no considerarlos "planos". */
const SUBIDA_MINIMA = 1.1;
const HORA_MS = 3_600_000;

const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const media = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Redondeo a 4 decimales para el JSON (sin `-0`). */
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4 + 0;
const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
/** Nombre de tema sin `[[ ]]` de Obsidian. */
const sinCorchetes = (s: string): string => s.replace(/\[\[|\]\]/g, "").trim();

// --- pesos ---

/**
 * Media encogida hacia la media global: `(n·media + k·global) / (n + k)`. Con menos
 * de 3 valores no hay peso (1 vez = ruido). Valores no finitos se descartan antes de contar.
 */
export function pesoEncogido(valores: number[], mediaGlobal: number, k = K_ENCOGIMIENTO): number | undefined {
  const v = valores.filter(esNum);
  if (v.length < MIN_PIEZAS_PESO || !esNum(mediaGlobal) || !esNum(k) || k < 0) return undefined;
  return (v.length * media(v) + k * mediaGlobal) / (v.length + k);
}

/**
 * Mediciones que se pueden comparar entre sí, con su índice relativo (`rel`): el valor
 * dividido por la media de su grupo (señal y escala). Así un tema con retención y otro
 * con guardados se ponen en la misma unidad (1 = la media de la cuenta en esa señal).
 *
 * Mezclar conteos absolutos y tasas en un mismo peso está prohibido: un conteo de la
 * época de alcance bajo y una tasa de después no miden lo mismo. Si la cuenta ya cruzó
 * el umbral (hay alguna pieza medida en modo `tasa` fuera de la retención, que siempre
 * es razón), solo cuentan las piezas medidas en modo `tasa`.
 */
function indices(m: Medicion[]): { m: Medicion; rel: number }[] {
  const validas = m.filter((x) => x && esNum(x.valor) && SENALES.includes(x.senal));
  const cruzo = validas.some((x) => x.senal !== "retencion" && x.modo === "tasa");
  const usadas = validas.filter((x) => x.senal === "retencion" || !cruzo || x.modo === "tasa");
  const grupos = new Map<string, number[]>();
  const g = (x: Medicion): string => `${x.senal}:${x.modo}`;
  for (const x of usadas) grupos.set(g(x), [...(grupos.get(g(x)) ?? []), x.valor]);
  return usadas.map((x) => {
    const mg = media(grupos.get(g(x))!);
    // Todo el grupo en 0: nadie se distingue, todos quedan en la media.
    return { m: x, rel: mg > 0 ? x.valor / mg : 1 };
  });
}

/**
 * Peso por tema, arquetipo o categoría de hook: media encogida del índice relativo
 * (1 = la media de la cuenta). Los nombres se agrupan con `topicKey` (sin tildes, sin
 * mayúsculas, sin `[[ ]]`); la clave que se muestra es el nombre más reciente sin corchetes.
 */
export function pesos(m: Medicion[], clave: "tema" | "arquetipo" | "hookCategoria"): Record<string, { n: number; peso?: number }> {
  const idx = indices(m);
  if (!idx.length) return {};
  const global = media(idx.map((x) => x.rel));
  const grupos = new Map<string, { nombre: string; semana: string; rels: number[] }>();
  for (const { m: x, rel } of idx) {
    const nombre = sinCorchetes(texto(x[clave]));
    const k = topicKey(nombre);
    if (!k) continue;
    const g = grupos.get(k);
    if (!g) grupos.set(k, { nombre, semana: x.semana, rels: [rel] });
    else {
      g.rels.push(rel);
      if (x.semana >= g.semana) Object.assign(g, { nombre, semana: x.semana });
    }
  }
  const out: Record<string, { n: number; peso?: number }> = {};
  for (const g of [...grupos.values()].sort((a, b) => b.rels.length - a.rels.length || a.nombre.localeCompare(b.nombre))) {
    const p = pesoEncogido(g.rels, global);
    out[g.nombre] = p === undefined ? { n: g.rels.length } : { n: g.rels.length, peso: r4(p) };
  }
  return out;
}

// --- ganadores y derivados ---

/**
 * Ganadores: el 20 % superior dentro de cada señal (y escala), con la instantánea de
 * 7 d. Solo con ≥ 5 piezas de esa señal (mínimo 1 ganador). Los empatados en el corte
 * entran todos; si el corte no supera al peor del grupo (todos iguales, todos en 0),
 * nadie se distingue y no hay ganador.
 */
export function ganadores(m: Medicion[]): string[] {
  const grupos = new Map<string, Medicion[]>();
  for (const { m: x } of indices(m)) {
    const g = `${x.senal}:${x.modo}`;
    grupos.set(g, [...(grupos.get(g) ?? []), x]);
  }
  const out: string[] = [];
  for (const xs of grupos.values()) {
    if (xs.length < MIN_PIEZAS_GANADOR) continue;
    const orden = xs.map((x) => x.valor).sort((a, b) => b - a);
    const corte = orden[Math.max(1, Math.floor(xs.length * FRACCION_GANADORES)) - 1]!;
    if (corte <= orden[orden.length - 1]!) continue;
    for (const x of xs) if (x.valor >= corte) out.push(x.piezaId);
  }
  return out;
}

/**
 * Derivados pendientes: cada ganador de la semana W pide 1-2 derivados (mismo tema,
 * otro ángulo) hasta el lunes W + 14 d inclusive. Ya no se piden si el ganador tiene
 * 2 derivados planificados o publicados, o si la semana que se planifica pasó ese límite.
 */
export function derivadosPendientes(
  m: Medicion[],
  publicadas: { derivadoDe: string | null; semana: string }[],
  semanaActual: string,
): { de: string; tema: string; hasta: string }[] {
  const porId = new Map(m.map((x) => [x.piezaId, x]));
  const out: { de: string; tema: string; hasta: string }[] = [];
  for (const id of ganadores(m)) {
    const g = porId.get(id)!;
    const hasta = addDays(g.semana, 7 * SEMANAS_DERIVADO);
    if (semanaActual > hasta) continue;
    const hechos = publicadas.filter((p) => p && p.derivadoDe === id).length;
    if (hechos >= MAX_DERIVADOS) continue;
    out.push({ de: id, tema: g.tema, hasta });
  }
  return out;
}

// --- horas ---

const aMinutos = (h: string): number => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * Aplica la separación mínima entre piezas: el primer día toma su mejor hora; cada
 * día siguiente toma la mejor de su ranking que quede a ≥ `separacionH` de la pieza
 * anterior. Si ninguna cumple, ese día queda fuera (el agente usa la tabla).
 */
export function aplicarSeparacion(entradas: { dia: number; ranking: { hora: string; n: number }[] }[], separacionH: number): Record<string, string> {
  const out: Record<string, string> = {};
  let prev: { dia: number; hora: string } | undefined;
  for (const e of [...entradas].sort((a, b) => a.dia - b.dia)) {
    const ok = e.ranking.find((r) => !prev || (e.dia - prev.dia) * 1440 + aMinutos(r.hora) - aMinutos(prev.hora) >= separacionH * 60);
    if (!ok) continue;
    out[String(e.dia)] = ok.hora;
    prev = { dia: e.dia, hora: ok.hora };
  }
  return out;
}

/** Redondea "HH:MM" a :00 o :30. */
function redondear(hora: string): string {
  const total = Math.round(aMinutos(hora) / 30) * 30;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Hora de publicación por día (`"1"` = lunes … `"6"` = sábado) desde `online_followers`.
 *
 * Suposición documentada: Meta entrega un perfil de 24 claves `"0".."23"` y no fija
 * su zona con claridad; se asume **UTC** (`zonaOrigen`). Cada hora se convierte con
 * `zonedToUtc` a la hora de Chile del día concreto de la semana (así el cambio de hora
 * de Chile se respeta). Se elige la hora con más seguidores en línea dentro de
 * `ventana`, redondeada a :00/:30, con `separacionH` entre días seguidos. Horas
 * faltantes, no numéricas o en 0 se ignoran; sin datos útiles → `undefined`.
 */
export function horasDesdeOnline(
  online: Record<string, number> | undefined,
  ventana: [string, string],
  separacionH: number,
  dias: number[],
  semana: string,
  zonaOrigen = "UTC",
): Record<string, string> | undefined {
  if (!esObj(online)) return undefined;
  const horas: { h: number; n: number }[] = [];
  for (const [k, v] of Object.entries(online)) {
    const h = Number(k);
    if (!/^\d{1,2}$/.test(k) || h > 23 || !esNum(v) || v <= 0) continue;
    horas.push({ h, n: v });
  }
  if (!horas.length) return undefined;
  const entradas = dias.map((d) => {
    const dia = addDays(semana, d - 1);
    const porHora = new Map<string, number>();
    for (const { h, n } of horas) {
      const local = redondear(localParts(zonedToUtc(dia, `${String(h).padStart(2, "0")}:00`, zonaOrigen)).hora);
      if (local < ventana[0] || local > ventana[1]) continue;
      porHora.set(local, Math.max(porHora.get(local) ?? 0, n));
    }
    const ranking = [...porHora].map(([hora, n]) => ({ hora, n })).sort((a, b) => b.n - a.n || a.hora.localeCompare(b.hora));
    return { dia: d, ranking };
  });
  const out = aplicarSeparacion(entradas, separacionH);
  return Object.keys(out).length ? out : undefined;
}

// --- seguidores por pieza ---

/**
 * Seguidores que trajo cada pieza: el `follower_count` del día siguiente a su publicación
 * (`porDia` de `cuenta.json`, que guarda los seguidores nuevos de cada día). Sin dato no aparece.
 */
export function seguidoresPorPieza(porDia: Record<string, number>, publicadas: { piezaId: string; dia: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!esObj(porDia)) return out;
  for (const p of publicadas) {
    const v = porDia[addDays(p.dia, 1)];
    if (esNum(v)) out[p.piezaId] = v;
  }
  return out;
}

// --- diagnóstico ---

export interface CuentaDiagnostico {
  seguidoresNuevos28d?: number;
  alcance28d?: number;
  /** Seguidores nuevos de los 28 días anteriores, para saber si el crecimiento está plano. */
  seguidoresNuevosPrevios28d?: number;
}

/**
 * Diagnóstico mensual (árbol del skill). Se evalúa sobre las 4 semanas más recientes
 * con datos y solo si hay ≥ 4 semanas (las decisiones se toman en ciclos de 4 semanas):
 * 1. seguidores nuevos / alcance < 1 % → perfil (bio, CTA), no contenido;
 * 2. retención media de los reels de un arquetipo < 0,3 → cambiar su categoría de hook;
 * 3. retención bien pero guardados/alcance y envíos/alcance planos → falta entregable o destinatario;
 * 4. nada de lo anterior y crecimiento plano → volumen o distribución.
 */
export function diagnostico(m: Medicion[], cuenta: CuentaDiagnostico): string[] {
  const semanas = [...new Set(m.filter((x) => x && typeof x.semana === "string").map((x) => x.semana))].sort();
  if (semanas.length < SEMANAS_EXPERIMENTO) return [];
  const ultimas = semanas.slice(-SEMANAS_EXPERIMENTO);
  const mes = m.filter((x) => ultimas.includes(x.semana));
  const out: string[] = [];

  const { seguidoresNuevos28d: nuevos, alcance28d: alcance, seguidoresNuevosPrevios28d: previos } = cuenta ?? {};
  if (esNum(nuevos) && esNum(alcance) && alcance > 0 && nuevos / alcance < SEGUIDORES_POR_ALCANCE_MIN) {
    out.push(`Seguidores nuevos / alcance = ${pct(nuevos / alcance)} en 28 días (< 1 %): problema de perfil (bio, CTA), no de contenido.`);
  }

  const porArq = new Map<string, { ret: number[]; hooks: Set<string> }>();
  for (const x of mes) {
    if (!esNum(x.retencion)) continue;
    const a = sinCorchetes(texto(x.arquetipo)) || "sin arquetipo";
    const g = porArq.get(a) ?? { ret: [], hooks: new Set<string>() };
    g.ret.push(x.retencion);
    if (texto(x.hookCategoria).trim()) g.hooks.add(x.hookCategoria.trim());
    porArq.set(a, g);
  }
  let retencionMala = false;
  for (const [a, g] of [...porArq].sort(([x], [y]) => x.localeCompare(y))) {
    const r = media(g.ret);
    if (r >= RETENCION_MIN) continue;
    retencionMala = true;
    const hooks = g.hooks.size ? ` (hoy: ${[...g.hooks].join(", ")})` : "";
    out.push(`Retención media de los reels de ${a} = ${pct(r)} (< 30 %, ${g.ret.length} piezas): cambiar la categoría de hook de ${a}${hooks} la semana siguiente.`);
  }

  let planos = false;
  if (!retencionMala) {
    const tasa = (xs: Medicion[], k: "saved" | "shares"): number | undefined => {
      const v = xs.filter((x) => esNum(x.reach) && x.reach > 0 && esNum(x[k])).map((x) => x[k]! / x.reach!);
      return v.length ? media(v) : undefined;
    };
    const antes = mes.filter((x) => x.semana < ultimas[2]!);
    const despues = mes.filter((x) => x.semana >= ultimas[2]!);
    const [ga, gd, ea, ed] = [tasa(antes, "saved"), tasa(despues, "saved"), tasa(antes, "shares"), tasa(despues, "shares")];
    if (ga !== undefined && gd !== undefined && ea !== undefined && ed !== undefined && gd <= ga * SUBIDA_MINIMA && ed <= ea * SUBIDA_MINIMA) {
      planos = true;
      out.push(
        `Retención bien pero guardados/alcance (${pct(ga)} → ${pct(gd)}) y envíos/alcance (${pct(ea)} → ${pct(ed)}) planos: ` +
          "falta entregable o destinatario explícito; revisa la recompensa de cada pieza.",
      );
    }
  }

  if (!out.length && !planos && esNum(nuevos) && esNum(previos) && nuevos <= previos) {
    out.push(
      `Todo bien pero el crecimiento está plano (${nuevos} seguidores nuevos en 28 días vs. ${previos} en los 28 anteriores): ` +
        "volumen o distribución; considerar 3 carruseles por semana o trial reels (desde 1.000 seguidores).",
    );
  }
  return out;
}

// --- parámetros de la puerta ---

const valorTexto = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v) ?? String(v));

/**
 * Comparación de un parámetro de la puerta (o variable de experimento) por valor:
 * media del índice relativo (1 = media de la cuenta) de las piezas producidas con
 * cada valor. Solo con ≥ 4 semanas de piezas con ese parámetro y ≥ 6 piezas por valor;
 * los valores con menos piezas no se muestran y con menos de 2 valores no hay comparación.
 */
export function compararParametro(m: Medicion[], parametro: string): { valor: string; n: number; media: number }[] | undefined {
  const con = indices(m).filter(({ m: x }) => esObj(x.parametros) && Object.hasOwn(x.parametros, parametro) && x.parametros[parametro] !== undefined);
  if (new Set(con.map(({ m: x }) => x.semana)).size < MIN_SEMANAS_PARAMETRO) return undefined;
  const grupos = new Map<string, number[]>();
  for (const { m: x, rel } of con) {
    const v = valorTexto(x.parametros![parametro]);
    grupos.set(v, [...(grupos.get(v) ?? []), rel]);
  }
  const out = [...grupos]
    .filter(([, rels]) => rels.length >= MIN_PIEZAS_POR_VALOR)
    .map(([valor, rels]) => ({ valor, n: rels.length, media: r4(media(rels)) }))
    .sort((a, b) => b.media - a.media || a.valor.localeCompare(b.valor));
  return out.length >= 2 ? out : undefined;
}

// --- mediciones desde lo guardado ---

/**
 * Mediciones comparables: instantáneas `7d` de piezas del motor (con línea `publicado`
 * en el registro), tomadas a ≤ 6 h de su hora nominal, con señal válida y valor finito.
 * Los `parametros` salen del `plan.json` de la pieza; sin ellos la pieza no cuenta para
 * parámetros. Una instantánea por `mediaId`.
 */
export function medicionesDe(inst: Instantanea[], registro: Record<string, unknown>[], semanas: SemanaLeida[], umbral: number): Medicion[] {
  const reg = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(registro) ? registro : []) {
    if (esObj(r) && r.tipo === "publicado" && typeof r.mediaId === "string" && !r.mediaId.startsWith("aviso-")) reg.set(r.mediaId, r);
  }
  const params = new Map<string, Record<string, unknown>>();
  for (const s of semanas) for (const p of s.plan?.piezas ?? []) if (esObj(p?.parametros)) params.set(p.id, p.parametros);

  const out: Medicion[] = [];
  const vistos = new Set<string>();
  for (const i of Array.isArray(inst) ? inst : []) {
    if (!i || i.ventana !== "7d" || i.origen !== "motor" || typeof i.mediaId !== "string" || i.mediaId.startsWith("aviso-") || vistos.has(i.mediaId)) continue;
    const r = reg.get(i.mediaId);
    if (!r) continue;
    const senal = SENALES.find((s) => s === r.senal);
    const piezaId = texto(r.piezaId) || texto(i.piezaId);
    const pub = new Date(texto(r.publicadoEn)).getTime();
    const tomada = new Date(i.tomadaEn).getTime();
    if (!senal || !piezaId || !Number.isFinite(pub) || !Number.isFinite(tomada)) continue;
    if (Math.abs(tomada - (pub + 168 * HORA_MS)) > DESVIO_COMPARABLE_7D_MS) continue;
    const d = i.derivadas ?? {};
    const valor = valorSenal(senal, i, d, umbral);
    if (!esNum(valor)) continue;
    vistos.add(i.mediaId);
    const semana = /^\d{4}-\d{2}-\d{2}$/.test(texto(r.semana)) ? texto(r.semana) : weekMonday(new Date(pub));
    const m: Medicion = {
      piezaId, mediaId: i.mediaId, tema: texto(r.tema), arquetipo: texto(r.arquetipo), hookCategoria: texto(r.hookCategoria),
      senal, valor, modo: senal === "retencion" ? "tasa" : modoComparacion(i.reach, umbral), semana, publicadoEn: new Date(pub).toISOString(),
    };
    const p = params.get(piezaId);
    if (p) m.parametros = p;
    if (esNum(d.retencion)) m.retencion = d.retencion;
    if (esNum(i.reach)) m.reach = i.reach;
    if (esNum(i.saved)) m.saved = i.saved;
    if (esNum(i.shares)) m.shares = i.shares;
    out.push(m);
  }
  return out;
}

// --- bucle completo ---

export interface EntradasBucle {
  ahora: Date;
  instantaneas: Instantanea[];
  /** Líneas `tipo: "publicado"` de `_calendario/registro.jsonl`. */
  registro: Record<string, unknown>[];
  /** Semanas leídas (`leerSemana`), para `parametros`, `derivadoDe` y experimentos. */
  semanas: SemanaLeida[];
  /** `_metricas/cuenta.json` tal cual. */
  cuenta: unknown;
  /** `_calendario/config.json` tal cual. */
  config: unknown;
  /** Avisos de la lectura (plan.json ilegible…), se copian al JSON. */
  avisos?: string[];
}

export interface Experimento {
  semana: string;
  variable: string;
  /** La variable es una de R15 (`tema`, `arquetipo`, `hora`, `duracion`, `hook` o una clave de `puerta`). */
  variableValida: boolean;
  hipotesis: string;
  piezas: string[];
  evaluarDesde: string;
  evaluable: boolean;
  experimento: { n: number; media?: number };
  control: { n: number; media?: number };
}

export interface BucleJson {
  generado: string;
  /** Lunes de la semana que se va a planificar. */
  semana: string;
  umbralAlcanceTasas: number;
  /** Escala de comparación vigente: "tasa" si la cuenta ya cruzó el umbral. */
  escala: "absoluto" | "tasa";
  medidas: number;
  pesos: Record<"tema" | "arquetipo" | "hookCategoria", Record<string, { n: number; peso?: number }>>;
  ganadores: { piezaId: string; senal: Senal; valor: number; modo: "absoluto" | "tasa"; semana: string; tema: string }[];
  derivados: { de: string; tema: string; hasta: string }[];
  horas?: Record<string, string>;
  seguidoresPorPieza: Record<string, number>;
  cuenta: CuentaDiagnostico;
  diagnostico: string[];
  parametros: Record<string, { valor: string; n: number; media: number }[]>;
  experimentos: Experimento[];
  avisos: string[];
}

const UMBRAL_POR_DEFECTO = 50;

function umbralDe(config: unknown): number {
  const v = esObj(config) ? config.umbralAlcanceTasas : undefined;
  return esNum(v) && v > 0 ? v : UMBRAL_POR_DEFECTO;
}

/** Lunes de la semana que se planifica: el de mañana si hoy es domingo; si no, el próximo lunes. */
export function semanaAPlanificar(now: Date): string {
  const l = localParts(now);
  return l.weekday === 0 ? addDays(l.dia, 1) : addDays(weekMonday(now), 7);
}

/** Seguidores nuevos (28 d y los 28 anteriores) y alcance aproximado de 28 d. */
export function cuentaDiagnostico(ahora: Date, inst: Instantanea[], cuenta: unknown): CuentaDiagnostico {
  const hoy = localParts(ahora).dia;
  const out: CuentaDiagnostico = {};
  const porDia = esObj(cuenta) && esObj(cuenta.porDia) ? cuenta.porDia : undefined;
  const suma = (desde: string, hasta: string): number | undefined => {
    let s: number | undefined;
    for (const [dia, v] of Object.entries(porDia ?? {})) if (dia >= desde && dia <= hasta && esNum(v)) s = (s ?? 0) + v;
    return s;
  };
  const nuevos = suma(addDays(hoy, -27), hoy);
  const previos = suma(addDays(hoy, -55), addDays(hoy, -28));
  if (nuevos !== undefined) out.seguidoresNuevos28d = nuevos;
  if (previos !== undefined) out.seguidoresNuevosPrevios28d = previos;
  // Aproximación: suma del alcance a 7 d de todos los posts (motor y manuales) medidos en los últimos 28 días.
  let alcance: number | undefined;
  const vistos = new Set<string>();
  for (const i of Array.isArray(inst) ? inst : []) {
    if (!i || i.ventana !== "7d" || typeof i.mediaId !== "string" || i.mediaId.startsWith("aviso-") || vistos.has(i.mediaId) || !esNum(i.reach)) continue;
    const t = new Date(i.tomadaEn);
    if (Number.isNaN(t.getTime())) continue;
    const dia = localParts(t).dia;
    if (dia < addDays(hoy, -27) || dia > hoy) continue;
    vistos.add(i.mediaId);
    alcance = (alcance ?? 0) + i.reach;
  }
  if (alcance !== undefined) out.alcance28d = alcance;
  return out;
}

/** Diagnóstico mensual a partir de lo guardado (lo usa también el resumen del domingo). */
export function diagnosticoDeDatos(ahora: Date, inst: Instantanea[], registro: Record<string, unknown>[], cuenta: unknown, umbral: number): string[] {
  return diagnostico(medicionesDe(inst, registro, [], umbral), cuentaDiagnostico(ahora, inst, cuenta));
}

/** Arma `bucle.json` con todo lo anterior. Puro: no lee disco ni reloj. */
export function construirBucle(e: EntradasBucle): BucleJson {
  const umbral = umbralDe(e.config);
  const semanas = Array.isArray(e.semanas) ? e.semanas : [];
  const m = medicionesDe(e.instantaneas, e.registro, semanas, umbral);
  const semana = semanaAPlanificar(e.ahora);
  const avisos = [...(e.avisos ?? [])];

  const idx = indices(m);
  const porId = new Map(m.map((x) => [x.piezaId, x]));
  const ids = ganadores(m);

  // Piezas planificadas que siguen vivas (un derivado saltado o fallido no cuenta).
  const planificadas = semanas.flatMap((s) =>
    (s.plan?.piezas ?? [])
      .filter((p) => !["saltado", "fallido"].includes(estadoEfectivo(p, s.render?.[p.id], s.estado?.[p.id])))
      .map((p) => ({ derivadoDe: p.derivadoDe ?? null, semana: s.semana })),
  );

  const config = esObj(e.config) ? e.config : {};
  const cuenta = esObj(e.cuenta) ? e.cuenta : {};
  const dias = Array.isArray(config.mix) ? config.mix.map((x) => (esObj(x) ? x.dia : undefined)).filter((d): d is number => esNum(d) && d >= 1 && d <= 7) : [];
  const vh = config.ventanaHoras;
  const ventana: [string, string] =
    Array.isArray(vh) && vh.length === 2 && vh.every((h) => typeof h === "string" && /^\d{2}:\d{2}$/.test(h)) ? [vh[0], vh[1]] : ["08:00", "23:00"];
  const sep = esNum(config.separacionMinHoras) && config.separacionMinHoras >= 0 ? config.separacionMinHoras : 20;
  // `online_followers` solo existe desde 100 seguidores; bajo eso manda la tabla de config.json.
  const seguidores = esNum(cuenta.seguidores) ? cuenta.seguidores : undefined;
  const horas =
    seguidores === undefined || seguidores >= SEGUIDORES_PARA_HORAS
      ? horasDesdeOnline(esObj(cuenta.onlineFollowers) ? (cuenta.onlineFollowers as Record<string, number>) : undefined, ventana, sep, dias.length ? dias : [1, 2, 3, 4, 5, 6], semana)
      : undefined;

  const publicadas: { piezaId: string; dia: string }[] = [];
  for (const r of Array.isArray(e.registro) ? e.registro : []) {
    if (!esObj(r) || r.tipo !== "publicado" || typeof r.mediaId !== "string" || r.mediaId.startsWith("aviso-") || !texto(r.piezaId)) continue;
    const t = new Date(texto(r.publicadoEn));
    if (!Number.isNaN(t.getTime())) publicadas.push({ piezaId: texto(r.piezaId), dia: localParts(t).dia });
  }

  const cuentaDiag = cuentaDiagnostico(e.ahora, e.instantaneas, e.cuenta);

  const claves = [...new Set(m.flatMap((x) => (esObj(x.parametros) ? Object.keys(x.parametros) : [])))].sort();
  const parametros: BucleJson["parametros"] = {};
  for (const k of claves) {
    const c = compararParametro(m, k);
    if (c) parametros[k] = c;
  }

  const variables = [...VARIABLES_FIJAS, ...(esObj(config.puerta) ? Object.keys(config.puerta) : [])];
  const relPorId = new Map(idx.map(({ m: x, rel }) => [x.piezaId, rel]));
  const resumen = (xs: string[]): { n: number; media?: number } => {
    const rels = xs.map((id) => relPorId.get(id)).filter(esNum);
    return rels.length ? { n: rels.length, media: r4(media(rels)) } : { n: 0 };
  };
  const experimentos: Experimento[] = [];
  for (const s of semanas) {
    const x = s.plan?.experimento;
    if (!esObj(x) || typeof x.variable !== "string") continue;
    const piezas = Array.isArray(x.piezas) ? x.piezas.filter((p): p is string => typeof p === "string") : [];
    const deLaSemana = (s.plan.piezas ?? []).map((p) => p.id);
    const evaluarDesde = addDays(s.semana, 7 * SEMANAS_EXPERIMENTO);
    experimentos.push({
      semana: s.semana, variable: x.variable, variableValida: variables.includes(x.variable), hipotesis: texto(x.hipotesis), piezas,
      evaluarDesde, evaluable: semana >= evaluarDesde,
      experimento: resumen(piezas), control: resumen(deLaSemana.filter((id) => !piezas.includes(id))),
    });
  }

  return {
    generado: e.ahora.toISOString(),
    semana,
    umbralAlcanceTasas: umbral,
    escala: m.some((x) => x.senal !== "retencion" && x.modo === "tasa") ? "tasa" : "absoluto",
    medidas: m.length,
    pesos: { tema: pesos(m, "tema"), arquetipo: pesos(m, "arquetipo"), hookCategoria: pesos(m, "hookCategoria") },
    ganadores: ids.map((id) => {
      const g = porId.get(id)!;
      return { piezaId: id, senal: g.senal, valor: r4(g.valor), modo: g.modo, semana: g.semana, tema: g.tema };
    }),
    derivados: derivadosPendientes(m, planificadas, semana),
    ...(horas ? { horas } : {}),
    seguidoresPorPieza: seguidoresPorPieza(esObj(cuenta.porDia) ? (cuenta.porDia as Record<string, number>) : {}, publicadas),
    cuenta: cuentaDiag,
    diagnostico: diagnostico(m, cuentaDiag),
    parametros,
    experimentos,
    avisos,
  };
}

// --- disco y cuándo ---

/**
 * ¿Toca escribir `bucle.json`? Desde el domingo 05:30 local (después del resumen y
 * antes del planificador de las 06:00), una vez por semana, recuperable hasta el lunes
 * 23:59 si el bot estuvo caído. `ultimo` es la marca guardada: el domingo
 * (`marcaBucle(now)`) del último bucle escrito.
 */
export function debeEscribirBucle(now: Date, ultimo?: string): boolean {
  const domingo = domingoDeResumen(now);
  if (localParts(now).dia > addDays(domingo, 1)) return false;
  return !(typeof ultimo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ultimo) && ultimo >= domingo);
}

/** Marca que se guarda tras escribir el bucle (el domingo vigente). */
export const marcaBucle = (now: Date): string => domingoDeResumen(now);

export interface DepsBucle {
  /** Lectura de las entradas (por defecto, la base: SQLite, registro, planes, cuenta y config). */
  leer?: (now: Date) => Promise<Omit<EntradasBucle, "ahora">>;
  /** Ruta de salida (por defecto `<base>/_metricas/bucle.json`). */
  ruta?: string;
}

/** Semanas de historia que se leen (4 de experimentos + margen). */
const SEMANAS_LEIDAS = 12;

async function leerBase(): Promise<Omit<EntradasBucle, "ahora">> {
  // Import dinámico: lectura.ts usa `diagnosticoDeDatos` de este módulo y no debe formar un ciclo estático.
  const { leerCuenta, leerInstantaneas, leerRegistroPublicados } = await import("../insights/lectura.ts");
  const avisos: string[] = [];
  const registro = leerRegistroPublicados();
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(join(calendarioDir(), "config.json"), "utf8"));
  } catch {
    avisos.push("config.json ausente o ilegible: uso los valores por defecto.");
  }
  const semanas: SemanaLeida[] = [];
  for (const s of (await listarSemanas()).slice(-SEMANAS_LEIDAS)) {
    try {
      const l = await leerSemana(s);
      if (l) semanas.push(l);
    } catch (err) {
      avisos.push(`plan.json de ${s} ilegible, se ignora: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { instantaneas: leerInstantaneas(registro), registro, semanas, cuenta: leerCuenta(), config, avisos };
}

/**
 * Lee las entradas, construye el bucle y lo escribe en `_metricas/bucle.json` (archivo
 * temporal + rename: un corte no deja un JSON a medias). Devuelve las rutas escritas,
 * para que el bot las commitee.
 */
export async function escribirBucle(now: Date, deps: DepsBucle = {}): Promise<string[]> {
  const entradas = await (deps.leer ?? leerBase)(now);
  const bucle = construirBucle({ ...entradas, ahora: now });
  const ruta = deps.ruta ?? join(kbDir(), "_metricas", "bucle.json");
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(bucle, null, 2) + "\n", "utf8");
  renameSync(tmp, ruta);
  return [ruta];
}
