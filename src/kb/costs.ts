import { AsyncLocalStorage } from "node:async_hooks";
import { openDb } from "./db.ts";

/**
 * Registro de lo que cuesta cada llamada a la API (tokens → USD), en el índice
 * SQLite de la base (tabla `costs`, que el cambio de esquema del índice no borra).
 * Si se borra `.index/`, se pierde el historial de costos, no la base.
 */

/** Para qué se usó la llamada. */
export type CostOp = "ficha" | "tema" | "juez" | "consulta" | "embeddings" | "transcripcion";

export const OP_LABEL: Record<CostOp, string> = {
  ficha: "Analizar el post",
  tema: "Resumir temas",
  juez: "Juez de temas",
  consulta: "Preguntas",
  embeddings: "Embeddings",
  transcripcion: "Transcripción",
};

/** USD por millón de tokens: entrada, entrada en caché y salida. */
interface Price {
  in: number;
  cached?: number;
  out: number;
}

/**
 * Precios de lista de OpenAI (USD / 1M tokens). Un modelo que no está aquí se
 * registra con sus tokens y costo desconocido; se puede agregar o corregir un
 * precio con KB_PRICES='{"modelo":{"in":0.2,"out":0.6}}'.
 */
const PRICES: Record<string, Price> = {
  "gpt-4o": { in: 2.5, cached: 1.25, out: 10 },
  "gpt-4o-2024-11-20": { in: 2.5, cached: 1.25, out: 10 },
  "gpt-4o-2024-08-06": { in: 2.5, cached: 1.25, out: 10 },
  "gpt-4o-mini": { in: 0.15, cached: 0.075, out: 0.6 },
  "gpt-4.1": { in: 2, cached: 0.5, out: 8 },
  "gpt-4.1-mini": { in: 0.4, cached: 0.1, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, cached: 0.025, out: 0.4 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
  "text-embedding-3-large": { in: 0.13, out: 0 },
  // Transcripción: audio de entrada a 3 USD/1M (≈ 0,003 USD por minuto).
  "gpt-4o-mini-transcribe": { in: 3, out: 5 },
  "gpt-4o-transcribe": { in: 6, out: 10 },
};

/** USD por minuto cuando la API de transcripción no informa tokens. */
const TRANSCRIBE_PER_MIN: Record<string, number> = { "gpt-4o-mini-transcribe": 0.003, "gpt-4o-transcribe": 0.006, "whisper-1": 0.006 };

function priceOf(model: string): Price | undefined {
  try {
    const extra = JSON.parse(process.env.KB_PRICES || "{}") as Record<string, Price>;
    if (extra[model]) return extra[model];
  } catch {
    // KB_PRICES mal escrito: se usan los de lista.
  }
  // "openai/gpt-4o" (OpenRouter) → "gpt-4o"; "gpt-4o-mini-2024-07-18" (snapshot que devuelve la API) → "gpt-4o-mini".
  const bare = model.replace(/^[^/]+\//, "");
  return PRICES[model] ?? PRICES[bare] ?? PRICES[bare.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
}

export interface Usage {
  input: number;
  cachedInput?: number;
  output: number;
}

/** Costo en USD de un uso de tokens; undefined si no se conoce el precio del modelo. Función pura. */
export function costOf(model: string, u: Usage): number | undefined {
  const p = priceOf(model);
  if (!p) return undefined;
  const cached = Math.min(u.cachedInput ?? 0, u.input);
  return ((u.input - cached) * p.in + cached * (p.cached ?? p.in) + u.output * p.out) / 1_000_000;
}

/** Tokens de un `usage` de chat/embeddings/transcripción de OpenAI (formas distintas). Función pura. */
export function usageOf(raw: unknown): Usage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, any>;
  const input = u.prompt_tokens ?? u.input_tokens;
  if (typeof input !== "number") return undefined;
  return {
    input,
    cachedInput: u.prompt_tokens_details?.cached_tokens ?? u.input_token_details?.cached_tokens ?? 0,
    output: u.completion_tokens ?? u.output_tokens ?? 0,
  };
}

interface Scope {
  ref: string;
  usd: number;
  /** Último modelo usado por operación (p. ej. el que hizo la ficha). */
  models: Partial<Record<CostOp, string>>;
  /** Si alguna llamada tuvo que pasar al modelo de respaldo. */
  fallback: boolean;
  /** Filas ya registradas en este alcance (para corregir su ref). */
  rows: number[];
}

const scope = new AsyncLocalStorage<Scope>();

/**
 * Corre `fn` agrupando sus llamadas bajo `ref` (p. ej. un guardado) y devuelve
 * también lo que costaron en total.
 */
export async function withCostScope<T>(
  ref: string,
  fn: () => Promise<T>,
): Promise<{ result: T; usd: number; models: Partial<Record<CostOp, string>>; fallback: boolean }> {
  const s: Scope = { ref, usd: 0, rows: [], models: {}, fallback: false };
  const result = await scope.run(s, fn);
  return { result, usd: s.usd, models: s.models, fallback: s.fallback };
}

/** Marca que el alcance en curso usó el modelo de respaldo. */
export function markFallback(): void {
  const s = scope.getStore();
  if (s) s.fallback = true;
}

/** Nombre corto de un modelo para mostrar ("deepseek/deepseek-v4.1-flash" → "DeepSeek"). Función pura. */
export function modelLabel(model: string): string {
  const id = model.replace(/^[^/]+\//, "");
  if (/^deepseek/i.test(id)) return "DeepSeek";
  if (/^gpt-4o-mini/.test(id)) return "gpt-4o-mini";
  if (/^gpt-4o/.test(id)) return "gpt-4o";
  return id;
}

/** "💸 US$0,004 · DeepSeek" (con "(respaldo)" si el principal falló). Función pura. */
export function costLine(usdValue: number | undefined, model: string | undefined, fallback = false): string {
  const parts = [usdValue ? usd(usdValue) : "", model ? `${modelLabel(model)}${fallback ? " (respaldo)" : ""}` : ""].filter(Boolean);
  return parts.length ? `💸 ${parts.join(" · ")}` : "";
}

/** Cambia la referencia del guardado en curso, también de lo ya registrado (el id del post se conoce a mitad de camino). */
export function setCostRef(ref: string): void {
  const s = scope.getStore();
  if (!s) return;
  s.ref = ref;
  try {
    const upd = table().prepare("UPDATE costs SET ref = ? WHERE id = ?");
    for (const id of s.rows) upd.run(ref, id);
  } catch {
    // sin registro: nada que corregir.
  }
}

function table(): ReturnType<typeof openDb> {
  const db = openDb();
  db.exec(`CREATE TABLE IF NOT EXISTS costs (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    op TEXT NOT NULL,
    model TEXT NOT NULL,
    ref TEXT,
    input INTEGER NOT NULL,
    cached INTEGER NOT NULL DEFAULT 0,
    output INTEGER NOT NULL,
    usd REAL
  )`);
  return db;
}

/**
 * Registra una llamada. Nunca lanza: si el registro falla, la llamada (ya pagada)
 * sigue su curso. `audioSeconds` estima la transcripción cuando no hay tokens.
 */
export function recordUsage(op: CostOp, model: string, raw: unknown, audioSeconds?: number): void {
  try {
    const parsed = usageOf(raw);
    const u = parsed ?? { input: 0, output: 0 };
    // OpenRouter informa el costo real (usage.cost); si no, se calcula con los precios de lista.
    const reported = (raw as { cost?: unknown } | undefined)?.cost;
    let usd = typeof reported === "number" ? reported : parsed ? costOf(model, u) : undefined;
    if (usd === undefined && audioSeconds && TRANSCRIBE_PER_MIN[model]) usd = (audioSeconds / 60) * TRANSCRIBE_PER_MIN[model];
    const s = scope.getStore();
    if (s && usd) s.usd += usd;
    if (s) s.models[op] = model;
    const row = table()
      .prepare("INSERT INTO costs (op, model, ref, input, cached, output, usd) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(op, model, s?.ref ?? null, u.input, u.cachedInput ?? 0, u.output, usd ?? null);
    s?.rows.push(Number(row.lastInsertRowid));
  } catch (err) {
    console.warn(`⚠️  No pude registrar el costo: ${err instanceof Error ? err.message : err}`);
  }
}

export interface CostSummary {
  /** USD por período. */
  today: number;
  week: number;
  month: number;
  total: number;
  since?: string;
  /** Guardados (refs distintos con op "ficha") de los últimos 30 días y su costo promedio. */
  saves: number;
  perSave: number;
  byOp: { op: CostOp; usd: number; calls: number }[];
  byModel: { model: string; usd: number; calls: number }[];
  /** Llamadas sin precio conocido (sus tokens se registraron igual). */
  unpriced: number;
}

/** Resumen de los últimos 30 días (y el total histórico). */
export function costSummary(): CostSummary {
  const db = table();
  const sum = (where: string): number =>
    (db.prepare(`SELECT COALESCE(SUM(usd), 0) AS s FROM costs WHERE ${where}`).get() as { s: number }).s;
  const month = "at >= datetime('now', '-30 days')";
  const saves = db.prepare(`SELECT COUNT(DISTINCT ref) AS n FROM costs WHERE op = 'ficha' AND ${month}`).get() as { n: number };
  // Costo de los guardados: todo lo agrupado bajo un ref con ficha (incluye juez, transcripción y temas si se hicieron ahí).
  const saveUsd = (
    db
      .prepare(`SELECT COALESCE(SUM(usd), 0) AS s FROM costs WHERE ${month} AND ref IN (SELECT ref FROM costs WHERE op = 'ficha')`)
      .get() as { s: number }
  ).s;
  return {
    today: sum("date(at) = date('now')"),
    week: sum("at >= datetime('now', '-7 days')"),
    month: sum(month),
    total: sum("1"),
    since: (db.prepare("SELECT MIN(date(at)) AS d FROM costs").get() as { d: string | null }).d ?? undefined,
    saves: saves.n,
    perSave: saves.n ? saveUsd / saves.n : 0,
    byOp: db
      .prepare(`SELECT op, COALESCE(SUM(usd), 0) AS usd, COUNT(*) AS calls FROM costs WHERE ${month} GROUP BY op ORDER BY usd DESC`)
      .all() as CostSummary["byOp"],
    byModel: db
      .prepare(`SELECT model, COALESCE(SUM(usd), 0) AS usd, COUNT(*) AS calls FROM costs WHERE ${month} GROUP BY model ORDER BY usd DESC`)
      .all() as CostSummary["byModel"],
    unpriced: (db.prepare(`SELECT COUNT(*) AS n FROM costs WHERE usd IS NULL AND ${month}`).get() as { n: number }).n,
  };
}

/** "US$0,0004" / "US$0,042" / "US$1,20": más decimales cuando el monto es chico. Función pura. */
export function usd(n: number): string {
  const digits = n > 0 && n < 0.001 ? 4 : n > 0 && n < 0.1 ? 3 : 2;
  return `US$${n.toFixed(digits).replace(".", ",")}`;
}

/** Resumen en texto plano (CLI y Telegram). Función pura. */
export function formatCostSummary(s: CostSummary): string {
  if (!s.since) return "Todavía no hay costos registrados (se empiezan a anotar desde ahora).";
  const lines = [
    `💸 Gasto en la API (registrado desde ${s.since})`,
    "",
    `Hoy: ${usd(s.today)} · 7 días: ${usd(s.week)} · 30 días: ${usd(s.month)}`,
    `Total registrado: ${usd(s.total)}`,
  ];
  if (s.saves) lines.push(`Guardados (30 días): ${s.saves} · ${usd(s.perSave)} por post en promedio`);
  if (s.byOp.length) lines.push("", "En qué (30 días):", ...s.byOp.map((o) => `• ${OP_LABEL[o.op] ?? o.op}: ${usd(o.usd)} (${o.calls} llamadas)`));
  if (s.byModel.length) lines.push("", "Modelos:", ...s.byModel.map((m) => `• ${m.model}: ${usd(m.usd)} (${m.calls})`));
  if (s.unpriced) lines.push("", `⚠️ ${s.unpriced} llamada(s) de un modelo sin precio conocido (agrégalo en KB_PRICES).`);
  return lines.join("\n");
}
