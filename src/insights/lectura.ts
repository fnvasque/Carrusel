import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localParts } from "../calendario/time.ts";
import { calendarioDir } from "../calendario/plan.ts";
import { openDb } from "../kb/db.ts";
import { kbDir } from "../kb/store.ts";
import { fetchOwnMedia } from "./client.ts";
import { derivar } from "./derive.ts";
import type { Instantanea } from "./snapshots.ts";
import {
  domingoDeResumen, formatPost, formatResumen, formatResumenTelegram, parsearReferencia, resumirSemana, type Referencia, type ResumenSemana,
} from "./summary.ts";

/**
 * Lectura de lo que ya guardó `snapshots.ts` (SQLite, `cuenta.json`, `registro.jsonl`)
 * para armar resúmenes. Compartido por el bot y la CLI; la lógica de texto y de
 * decisión vive en `summary.ts` (pura).
 */

const DIA_MS = 86_400_000;
const UMBRAL_POR_DEFECTO = 50;

/** Estado clave/valor (`calendario_estado`): lectura y escritura tolerantes. */
export function leerEstado(clave: string): string | undefined {
  const fila = openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get(clave) as { valor: string } | undefined;
  return fila?.valor;
}
export function guardarEstado(clave: string, valor: string): void {
  openDb().prepare("INSERT OR REPLACE INTO calendario_estado (clave, valor) VALUES (?, ?)").run(clave, valor);
}

/** `umbralAlcanceTasas` de `_calendario/config.json` (la escribe el usuario); 50 si falta o es raro. */
export function leerUmbral(): number {
  try {
    const v = (JSON.parse(readFileSync(join(calendarioDir(), "config.json"), "utf8")) as { umbralAlcanceTasas?: unknown }).umbralAlcanceTasas;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  } catch {
    // sin config o ilegible: se usa el valor por defecto.
  }
  return UMBRAL_POR_DEFECTO;
}

export function leerCuenta(): unknown {
  try {
    return JSON.parse(readFileSync(join(kbDir(), "_metricas", "cuenta.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/** Líneas `tipo: "publicado"` de `registro.jsonl` (las rotas se ignoran). */
export function leerRegistroPublicados(): Record<string, unknown>[] {
  let t: string;
  try {
    t = readFileSync(join(calendarioDir(), "registro.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const l of t.split("\n")) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l) as Record<string, unknown>;
      if (r && r.tipo === "publicado") out.push(r);
    } catch {
      // línea corrupta: se ignora.
    }
  }
  return out;
}

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/** Instantáneas guardadas (SQLite), opcionalmente solo las tomadas desde `desdeIso`. */
export function leerInstantaneas(registro: Record<string, unknown>[], desdeIso?: string, mediaId?: string): Instantanea[] {
  const filas = openDb().prepare(
    `SELECT media_id, ventana, tomada_en, reach, saved, shares, likes, comments, views, avg_watch_ms, total_watch_ms
     FROM insights WHERE tomada_en >= ? AND (? IS NULL OR media_id = ?) ORDER BY tomada_en ASC`,
  ).all(desdeIso ?? "", mediaId ?? null, mediaId ?? null) as Record<string, string | number | null>[];
  const porMedia = new Map(registro.map((r) => [String(r.mediaId), r]));
  return filas.map((f) => {
    const r = porMedia.get(String(f.media_id));
    const m = {
      reach: num(f.reach), saved: num(f.saved), shares: num(f.shares), likes: num(f.likes), comments: num(f.comments),
      views: num(f.views), avg_watch_ms: num(f.avg_watch_ms), total_watch_ms: num(f.total_watch_ms), descartadas: [] as string[],
    };
    return {
      ...m, mediaId: String(f.media_id), ventana: f.ventana as Instantanea["ventana"], tomadaEn: String(f.tomada_en),
      piezaId: typeof r?.piezaId === "string" ? r.piezaId : undefined, origen: r ? "motor" : "manual",
      derivadas: derivar(m, num(r?.duracionMs)),
    } satisfies Instantanea;
  });
}

/** Resumen de la semana que termina en `hasta` (AAAA-MM-DD local), con lo guardado hasta ahora. */
export function resumenDeLaSemana(hasta: string): ResumenSemana {
  const registro = leerRegistroPublicados();
  // Margen de 10 días hacia atrás: sobra para cubrir (hasta − 7 d, hasta] en cualquier zona horaria.
  const desdeIso = new Date(new Date(`${hasta}T00:00:00Z`).getTime() - 10 * DIA_MS).toISOString();
  return resumirSemana(leerInstantaneas(registro, desdeIso), leerCuenta(), registro, hasta, leerUmbral());
}

/** Resumen de los últimos 7 días contados hasta hoy (hora de Chile). */
export function resumenReciente(now: Date): ResumenSemana {
  return resumenDeLaSemana(localParts(now).dia);
}

/** Texto del resumen del domingo vigente, para guardarlo en `_metricas/resumenes/<domingo>.md` y enviarlo. */
export function resumenDelDomingo(now: Date): { domingo: string; md: string; html: string } {
  const domingo = domingoDeResumen(now);
  const r = resumenDeLaSemana(domingo);
  return { domingo, md: formatResumen(r), html: formatResumenTelegram(r) };
}

/**
 * Resuelve `/metricas <id|url|piezaId>` a un `media_id` y su fecha de publicación.
 * El permalink se busca primero en el registro y, si no está, en el listado reciente
 * de Meta (un error de red se propaga: quien llama decide el mensaje).
 */
export async function resolverPost(ref: Referencia, registro: Record<string, unknown>[], now: Date, listar: typeof fetchOwnMedia = fetchOwnMedia): Promise<{ mediaId: string; publicadoEn?: string } | undefined> {
  const reg = (r: Record<string, unknown>): { mediaId: string; publicadoEn?: string } => ({ mediaId: String(r.mediaId), publicadoEn: typeof r.publicadoEn === "string" ? r.publicadoEn : undefined });
  if (ref.tipo === "pieza") {
    const r = registro.find((x) => x.piezaId === ref.valor && typeof x.mediaId === "string");
    return r ? reg(r) : undefined;
  }
  if (ref.tipo === "id") {
    const r = registro.find((x) => x.mediaId === ref.valor);
    return r ? reg(r) : { mediaId: ref.valor };
  }
  const code = (u: unknown): string | undefined => (typeof u === "string" ? parsearReferencia(u)?.valor : undefined);
  const r = registro.find((x) => typeof x.mediaId === "string" && code(x.permalink) === ref.valor);
  if (r) return reg(r);
  const media = await listar(new Date(now.getTime() - 35 * DIA_MS));
  const m = media.find((x) => code(x.permalink) === ref.valor);
  return m ? { mediaId: m.id, publicadoEn: m.timestamp } : undefined;
}

/** Texto HTML de `/metricas <ref>` (todas las instantáneas del post). */
export async function textoPost(entrada: string, now: Date): Promise<string> {
  const ref = parsearReferencia(entrada);
  if (!ref) return "No entendí eso. Usa /metricas, o /metricas seguido de un link de Instagram, un media_id o el id de la pieza.";
  const registro = leerRegistroPublicados();
  const post = await resolverPost(ref, registro, now);
  if (!post) return "No encontré ese post entre los últimos 35 días ni en el registro.";
  return formatPost(leerInstantaneas(registro, undefined, post.mediaId), post.publicadoEn);
}
