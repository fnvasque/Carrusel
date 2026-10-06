import { addDays, localParts } from "../calendario/time.ts";
import type { Senal } from "../calendario/plan.ts";
import { escapeHtml } from "../kb/telegram.ts";
import { shortcodeFromUrl } from "../kb/shortcode.ts";
import { DESVIO_COMPARABLE_7D_MS, TOLERANCIA_MS, VENTANAS, modoComparacion, valorSenal } from "./derive.ts";
import type { Instantanea } from "./snapshots.ts";

/**
 * Resumen semanal y vistas de métricas. Todo puro: recibe los datos ya leídos
 * (instantáneas, `cuenta.json`, líneas de `registro.jsonl`) y devuelve texto o
 * decisiones. Datos raros (campos ausentes, tipos equivocados) nunca lanzan.
 */

export interface FilaPieza {
  piezaId?: string;
  mediaId: string;
  permalink?: string;
  senal?: Senal;
  valor?: number;
  modo: "absoluto" | "tasa";
  /** La instantánea de 7 d se tomó con más de 1 h de desvío. */
  tardia?: boolean;
}

export interface ResumenSemana {
  desde: string;
  hasta: string;
  mejor?: FilaPieza;
  peor?: FilaPieza;
  /** Posts publicados a mano: se muestran aparte, no compiten. */
  manuales: FilaPieza[];
  /** Piezas del motor con 7 d comparable (las que compiten). */
  medidas: number;
  seguidoresGanados?: number;
  horaTop?: string;
  noSeguidores?: number;
  avisos: string[];
}

const HORA_MS = 3_600_000;
const SENALES: Senal[] = ["guardados", "envios", "comentarios", "retencion"];
const TABLA_POR_DEFECTO = "tabla por defecto (menos de 100 seguidores)";

const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

interface DatosRegistro {
  piezaId?: string;
  permalink?: string;
  senal?: Senal;
  publicadoEn?: string;
}

/** Líneas `tipo: "publicado"` del registro, por `mediaId`. Lo que no sea un objeto válido se ignora. */
function indexarRegistro(registro: unknown[]): Map<string, DatosRegistro> {
  const out = new Map<string, DatosRegistro>();
  if (!Array.isArray(registro)) return out;
  for (const r of registro) {
    if (!esObj(r) || r.tipo !== "publicado") continue;
    const mediaId = texto(r.mediaId);
    if (!mediaId) continue;
    out.set(mediaId, {
      piezaId: texto(r.piezaId),
      permalink: texto(r.permalink),
      senal: SENALES.find((s) => s === r.senal),
      publicadoEn: texto(r.publicadoEn),
    });
  }
  return out;
}

/** Horas de desvío de la toma de una ventana de 7 d (null si no se conoce la publicación). */
function desvioMs(i: Instantanea, publicadoEn: string | undefined): number | undefined {
  const pub = new Date(publicadoEn ?? (i as { publicado?: string }).publicado ?? "").getTime();
  const tomada = new Date(i.tomadaEn).getTime();
  if (!Number.isFinite(pub) || !Number.isFinite(tomada)) return undefined;
  return tomada - (pub + 168 * HORA_MS);
}

/** Etiqueta de un valor: tasas en % con un decimal, conteos enteros. */
function fmtValor(f: FilaPieza): string {
  if (!esNum(f.valor)) return "sin dato";
  if (f.modo === "tasa" || f.senal === "retencion") return `${(f.valor * 100).toFixed(1)} %`;
  return String(Math.round(f.valor));
}

/** Hora con más audiencia de `onlineFollowers` ("0".."23"), o la tabla por defecto si no hay datos útiles. */
function horaTop(c: Record<string, unknown>): string {
  const of = c.onlineFollowers;
  if (esObj(of)) {
    let mejor: { h: number; v: number } | undefined;
    for (const [k, v] of Object.entries(of)) {
      const h = Number(k);
      if (!Number.isInteger(h) || h < 0 || h > 23 || !esNum(v) || v <= 0) continue;
      if (!mejor || v > mejor.v) mejor = { h, v };
    }
    if (mejor) return `${String(mejor.h).padStart(2, "0")}:00`;
  }
  return TABLA_POR_DEFECTO;
}

/**
 * Resumen de la semana `(hasta − 7 d, hasta]`: mejor y peor pieza del motor por su
 * señal objetivo con la instantánea de 7 d (solo las tomadas con desvío ≤ 6 h),
 * seguidores ganados, hora con más audiencia y alcance de no seguidores. Cada
 * señal se compara contra su propio grupo (nunca retención contra guardados, ni
 * conteos contra tasas): se ordena por valor relativo a la media del grupo.
 */
export function resumirSemana(inst: Instantanea[], cuenta: unknown, registro: unknown[], hasta: string, umbral: number): ResumenSemana {
  const desde = addDays(hasta, -7);
  const reg = indexarRegistro(registro);
  const c = esObj(cuenta) ? cuenta : {};
  const avisos: string[] = [];
  const candidatas: (FilaPieza & { rel: number })[] = [];
  const manuales: FilaPieza[] = [];
  const grupos = new Map<string, number[]>();
  const vistas = new Set<string>();

  for (const i of Array.isArray(inst) ? inst : []) {
    if (!i || i.ventana !== "7d" || typeof i.mediaId !== "string" || vistas.has(i.mediaId)) continue;
    const t = new Date(i.tomadaEn);
    if (Number.isNaN(t.getTime())) continue;
    const dia = localParts(t).dia;
    if (dia <= desde || dia > hasta) continue;
    vistas.add(i.mediaId);

    const r = reg.get(i.mediaId);
    const esMotor = i.origen === "motor";
    const senal = esMotor ? (r?.senal ?? "guardados") : "guardados";
    const valor = valorSenal(senal, i, i.derivadas ?? {}, umbral);
    const desvio = desvioMs(i, r?.publicadoEn);
    const fila: FilaPieza = {
      piezaId: i.piezaId ?? r?.piezaId, mediaId: i.mediaId, permalink: r?.permalink, senal, valor,
      modo: senal === "retencion" ? "tasa" : modoComparacion(i.reach, umbral),
      tardia: desvio !== undefined && Math.abs(desvio) > TOLERANCIA_MS ? true : undefined,
    };
    if (!esMotor) {
      manuales.push(fila);
      continue;
    }
    if (desvio === undefined || Math.abs(desvio) > DESVIO_COMPARABLE_7D_MS) {
      avisos.push(`${fila.piezaId ?? i.mediaId}: la instantánea de 7 d ${desvio === undefined ? "no tiene fecha de publicación" : "se tomó tarde"}; no entra en la comparación.`);
      continue;
    }
    if (!esNum(valor)) {
      avisos.push(`${fila.piezaId ?? i.mediaId}: sin dato de ${senal}; no entra en la comparación.`);
      continue;
    }
    const g = `${senal}:${fila.modo}`;
    grupos.set(g, [...(grupos.get(g) ?? []), valor]);
    candidatas.push({ ...fila, rel: 0 });
  }

  for (const f of candidatas) {
    const vals = grupos.get(`${f.senal}:${f.modo}`)!;
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    f.rel = media > 0 ? f.valor! / media : 1;
  }
  candidatas.sort((a, b) => b.rel - a.rel);
  const limpiar = ({ rel: _rel, ...f }: FilaPieza & { rel: number }): FilaPieza => f;

  const porDia = esObj(c.porDia) ? c.porDia : undefined;
  let ganados: number | undefined;
  if (porDia) {
    for (const [dia, v] of Object.entries(porDia)) {
      if (dia > desde && dia <= hasta && esNum(v)) ganados = (ganados ?? 0) + v;
    }
  }

  return {
    desde, hasta, manuales, medidas: candidatas.length,
    mejor: candidatas[0] ? limpiar(candidatas[0]) : undefined,
    peor: candidatas.length > 1 ? limpiar(candidatas[candidatas.length - 1]!) : undefined,
    seguidoresGanados: ganados,
    horaTop: horaTop(c),
    noSeguidores: esNum(c.reachNoSeguidores7d) ? c.reachNoSeguidores7d : undefined,
    avisos,
  };
}

type Estilo = { b: (s: string) => string; esc: (s: string) => string };
const MD: Estilo = { b: (s) => `**${s}**`, esc: (s) => s };
const HTML: Estilo = { b: (s) => `<b>${s}</b>`, esc: escapeHtml };

const nombre = (f: FilaPieza): string => f.piezaId ?? f.mediaId;

function lineaFila(rotulo: string, f: FilaPieza, e: Estilo): string {
  const link = f.permalink ? ` — ${e.esc(f.permalink)}` : "";
  const tarde = f.tardia ? " (tardía)" : "";
  return `${rotulo}: ${e.esc(nombre(f))} · ${e.esc(f.senal ?? "guardados")} ${fmtValor(f)}${tarde}${link}`;
}

function cuerpo(r: ResumenSemana, e: Estilo): string {
  const out: string[] = [e.b(`Métricas ${r.desde} → ${r.hasta}`), ""];
  if (r.mejor) {
    out.push(lineaFila("Mejor", r.mejor, e));
    if (r.peor) out.push(lineaFila("Peor", r.peor, e));
  } else if (!r.manuales.length) {
    out.push("Sin datos todavía: ninguna pieza cumplió 7 días de publicada en esta semana.");
  } else {
    out.push("Sin piezas del motor con 7 días cumplidos esta semana.");
  }
  if (r.manuales.length) {
    out.push("", e.b("Posts manuales (no compiten)"));
    for (const m of r.manuales) out.push(`• ${e.esc(nombre(m))} · ${fmtValor(m)}${m.tardia ? " (tardía)" : ""}${m.permalink ? ` — ${e.esc(m.permalink)}` : ""}`);
  }
  out.push("");
  if (r.seguidoresGanados !== undefined) out.push(`Seguidores ganados: ${r.seguidoresGanados >= 0 ? "+" : ""}${r.seguidoresGanados}`);
  if (r.horaTop) out.push(`Hora con más audiencia: ${e.esc(r.horaTop)}`);
  if (r.noSeguidores !== undefined) out.push(`Alcance a no seguidores (7 d): ${r.noSeguidores}`);
  if (r.avisos.length) out.push("", ...r.avisos.map((a) => `⚠️ ${e.esc(a)}`));
  return out.join("\n").trimEnd() + "\n";
}

/** Markdown corto para `_metricas/resumenes/<domingo>.md`. */
export function formatResumen(r: ResumenSemana): string {
  return cuerpo(r, MD);
}

/** Mismo contenido en HTML de Telegram (todo dato externo escapado). */
export function formatResumenTelegram(r: ResumenSemana): string {
  return cuerpo(r, HTML);
}

/** Todas las instantáneas de un post, por orden de ventana (`/metricas <id|url>`). HTML de Telegram. */
export function formatPost(inst: Instantanea[], publicadoEn?: string): string {
  if (!Array.isArray(inst) || !inst.length) return "Sin instantáneas todavía para ese post. Se toman a las 24 h, 72 h, 7, 14, 21 y 28 días de publicado.";
  const orden = (v: string): number => VENTANAS.findIndex((x) => x.ventana === v);
  const ordenadas = [...inst].sort((a, b) => orden(a.ventana) - orden(b.ventana));
  const primera = ordenadas[0]!;
  const lineas = [`<b>${escapeHtml(primera.piezaId ?? primera.mediaId)}</b>${primera.origen === "manual" ? " (manual)" : ""}`];
  const num = (v: unknown): string => (esNum(v) ? String(Math.round(v)) : "–");
  const pct = (v: unknown): string => (esNum(v) ? `${(v * 100).toFixed(1)} %` : "–");
  for (const i of ordenadas) {
    const pub = new Date(publicadoEn ?? (i as { publicado?: string }).publicado ?? "").getTime();
    const horas = VENTANAS.find((v) => v.ventana === i.ventana)?.horas;
    const tarde = Number.isFinite(pub) && horas !== undefined && Math.abs(new Date(i.tomadaEn).getTime() - (pub + horas * HORA_MS)) > TOLERANCIA_MS ? " (tardía)" : "";
    const d = i.derivadas ?? {};
    lineas.push(
      `${escapeHtml(i.ventana)}${tarde}: alcance ${num(i.reach)} · guardados ${num(i.saved)} (${pct(d.saved_por_alcance)}) · envíos ${num(i.shares)} (${pct(d.shares_por_alcance)}) · ` +
        `comentarios ${num(i.comments)} · likes ${num(i.likes)} · vistas ${num(i.views)}` + (esNum(d.retencion) ? ` · retención ${pct(d.retencion)}` : ""),
    );
  }
  return lineas.join("\n");
}

/**
 * Domingo (AAAA-MM-DD local) del resumen vigente: el domingo más reciente cuyo
 * 05:30 ya pasó. Es la fecha que se guarda en `resumen:ultimo`.
 */
export function domingoDeResumen(now: Date): string {
  const l = localParts(now);
  if (l.weekday === 0) return l.hora >= "05:30" ? l.dia : addDays(l.dia, -7);
  return addDays(l.dia, -l.weekday);
}

/**
 * ¿Toca el resumen? Sí si el domingo vigente (≥ 05:30 local) todavía no se hizo;
 * `ultimo` es el domingo del último resumen enviado. Si el bot estuvo caído, el
 * lunes (o cualquier día de esa semana) todavía lo envía. Un `ultimo` ilegible no bloquea.
 */
export function debeResumir(now: Date, ultimo?: string): boolean {
  const domingo = domingoDeResumen(now);
  return !(typeof ultimo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ultimo) && ultimo >= domingo);
}

/** ¿Toca guardar la cuenta? Una vez por día local; `ultimo` es la fecha del último guardado. */
export function debeCuenta(now: Date, ultimo?: string): boolean {
  return !(typeof ultimo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ultimo) && ultimo >= localParts(now).dia);
}

export type Referencia = { tipo: "shortcode" | "id" | "pieza"; valor: string };

/** Qué es lo que escribió el usuario en `/metricas <…>`: permalink de Instagram, `media_id` numérico o `piezaId`. */
export function parsearReferencia(entrada: string): Referencia | undefined {
  const s = entrada.trim();
  if (!s) return undefined;
  if (/instagram\.com/i.test(s)) {
    const code = shortcodeFromUrl(s);
    return code ? { tipo: "shortcode", valor: code } : undefined;
  }
  if (/^\d{6,}$/.test(s)) return { tipo: "id", valor: s };
  return { tipo: "pieza", valor: s };
}
