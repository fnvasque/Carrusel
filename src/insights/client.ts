import { graphGet, GraphError } from "../meta/client.ts";
import { metaConfig } from "../meta/env.ts";

/**
 * Cliente de insights de Instagram (solo lectura, sobre `graphGet`): lista los
 * posts propios, pide sus métricas y las de la cuenta. Meta cambia la lista de
 * métricas cada pocos meses, así que ante una métrica rechazada se reintenta sin
 * ella en vez de fallar la instantánea completa. Los tests inyectan un `get`
 * falso: nada de esto toca la red por sí solo.
 */

export type GraphGetFn = <T>(path: string, params?: Record<string, string | number | undefined>) => Promise<T>;

export interface OwnMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

export interface MediaInsights {
  reach?: number;
  saved?: number;
  shares?: number;
  likes?: number;
  comments?: number;
  views?: number;
  total_interactions?: number;
  avg_watch_ms?: number;
  total_watch_ms?: number;
  /** Métricas que Meta rechazó y se pidieron de nuevo sin ellas. */
  descartadas: string[];
}

export interface AccountInsights {
  followers?: number;
  /** Seguidores ganados por día (últimos 30 d, el máximo que da Meta). */
  followerCount: { dia: string; valor: number }[];
  /** Seguidores en línea por hora ("0".."23"). Meta lo exige con ≥ 100 seguidores. */
  onlineFollowers?: Record<string, number>;
  reach7d?: number;
  engaged7d?: number;
  reachNoSeguidores7d?: number;
  /** Consultas que fallaron (la instantánea sigue con lo demás). */
  errores: string[];
}

export const POST_METRICS: string[] = ["reach", "saved", "shares", "likes", "comments", "views", "total_interactions"];
export const REEL_METRICS: string[] = [...POST_METRICS, "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];

/** Tope de páginas al listar posts: una cuenta sin fin de páginas no debe colgar el proceso. */
const MAX_PAGES = 20;
/** Códigos de Graph que nunca significan "métrica inválida": token, cuota, permisos. */
const NOT_A_METRIC_ERROR = new Set([4, 10, 17, 32, 190, 200, 613]);

const defaultGet: GraphGetFn = (path, params) => graphGet(path, params);
const defaultIgUserId = (): string => metaConfig().igUserId;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Aplana una respuesta `/insights` a `{ métrica: número }`. Acepta `values[0].value`
 * y `total_value.value`; ignora lo que no sea un número (null, "12", ausente) y,
 * si una métrica viene repetida, conserva la primera. Función pura.
 */
export function parseInsights(body: unknown): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  const data = isObj(body) && Array.isArray(body.data) ? body.data : [];
  for (const entry of data) {
    if (!isObj(entry) || typeof entry.name !== "string" || entry.name in out) continue;
    const first = Array.isArray(entry.values) ? entry.values[0] : undefined;
    const fromValues = isObj(first) ? first.value : undefined;
    const fromTotal = isObj(entry.total_value) ? entry.total_value.value : undefined;
    const v = isNum(fromValues) ? fromValues : fromTotal;
    if (isNum(v)) out[entry.name] = v;
  }
  return out;
}

/** Métrica que Meta dice no soportar en este error, si es una de las pedidas. Función pura. */
export function unsupportedMetric(err: unknown, pedidas: string[]): string | undefined {
  // Cuota, token o permisos: reintentar con menos métricas no arregla nada.
  const code = err instanceof GraphError ? err.code : undefined;
  if (code !== undefined && NOT_A_METRIC_ERROR.has(code)) return undefined;
  const msg = err instanceof Error ? err.message : String(err);
  // La posición `metric[N]` manda: el mismo mensaje lista las métricas válidas y
  // no debe confundirse con la inválida.
  const idx = msg.match(/metric\[(\d+)\]/)?.[1];
  if (idx !== undefined) return pedidas[Number(idx)];
  const named = pedidas.find((m) => new RegExp(`\\b${escapeRe(m)}\\b`).test(msg));
  return named && /not support|no longer supported|invalid|must be one of|deprecated/i.test(msg) ? named : undefined;
}

/**
 * Posts propios publicados desde `since`, del más nuevo al más viejo. Pagina con
 * el cursor `after` y se detiene al ver una fecha anterior a `since`, una página
 * vacía, un cursor repetido o a las 20 páginas. Un error de red se propaga: una
 * lista parcial haría pasar posts por "sin medir".
 */
export async function fetchOwnMedia(since: Date, get: GraphGetFn = defaultGet, igUserId: string = defaultIgUserId()): Promise<OwnMedia[]> {
  const out: OwnMedia[] = [];
  const vistos = new Set<string>();
  const cursores = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await get<unknown>(`${igUserId}/media`, {
      fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
      limit: 50,
      after,
    });
    const data = isObj(body) && Array.isArray(body.data) ? body.data : [];
    if (data.length === 0) break;
    let pasoElLimite = false;
    for (const m of data) {
      if (!isObj(m) || typeof m.id !== "string" || typeof m.timestamp !== "string") continue;
      const t = Date.parse(m.timestamp);
      if (!Number.isNaN(t) && t < since.getTime()) {
        pasoElLimite = true;
        continue;
      }
      if (vistos.has(m.id)) continue;
      vistos.add(m.id);
      out.push(m as unknown as OwnMedia);
    }
    if (pasoElLimite) break;
    const paging = isObj(body) && isObj(body.paging) ? body.paging : undefined;
    const next = isObj(paging?.cursors) && typeof paging.cursors.after === "string" ? paging.cursors.after : undefined;
    if (!paging?.next || !next || cursores.has(next)) break;
    cursores.add(next);
    after = next;
  }
  return out;
}

/**
 * Métricas de un post o reel. Pide la lista completa y, si Meta rechaza una
 * métrica, la descarta y reintenta (una vuelta por métrica como máximo).
 */
export async function fetchMediaInsights(id: string, productType: string, get: GraphGetFn = defaultGet): Promise<MediaInsights> {
  let metrics = productType === "REELS" ? [...REEL_METRICS] : [...POST_METRICS];
  const descartadas: string[] = [];
  // Cada fallo quita una métrica y con una sola se relanza: el bucle termina solo
  // (como mucho métricas + 1 llamadas) y nunca devuelve un resultado vacío.
  for (;;) {
    try {
      const raw = parseInsights(await get(`${id}/insights`, { metric: metrics.join(",") }));
      return {
        reach: raw.reach, saved: raw.saved, shares: raw.shares, likes: raw.likes, comments: raw.comments,
        views: raw.views, total_interactions: raw.total_interactions,
        avg_watch_ms: raw.ig_reels_avg_watch_time, total_watch_ms: raw.ig_reels_video_view_total_time, descartadas,
      };
    } catch (err) {
      const bad = unsupportedMetric(err, metrics);
      if (!bad || metrics.length === 1) throw err;
      descartadas.push(bad);
      metrics = metrics.filter((m) => m !== bad);
      console.warn(`⚠️  Meta ya no da la métrica ${bad} para ${productType}: la descarto.`);
    }
  }
}

const DAY_S = 86400;

/** Valor de la dimensión NON_FOLLOWER en `reach` con `breakdown=follow_type`. */
function nonFollowerReach(body: unknown): number | undefined {
  const data = isObj(body) && Array.isArray(body.data) ? body.data : [];
  for (const entry of data) {
    const tv = isObj(entry) ? entry.total_value : undefined;
    const breakdowns = isObj(tv) && Array.isArray(tv.breakdowns) ? tv.breakdowns : [];
    const results = isObj(breakdowns[0]) && Array.isArray(breakdowns[0].results) ? breakdowns[0].results : [];
    for (const r of results) {
      if (isObj(r) && Array.isArray(r.dimension_values) && r.dimension_values[0] === "NON_FOLLOWER" && isNum(r.value)) return r.value;
    }
  }
  return undefined;
}

const msgOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Métricas de la cuenta. Cada consulta va en su propio `try`: si una falla (p. ej.
 * `online_followers` con menos de 100 seguidores) se anota en `errores` y las demás siguen.
 */
export async function fetchAccountInsights(now: Date, get: GraphGetFn = defaultGet, igUserId: string = defaultIgUserId()): Promise<AccountInsights> {
  const res: AccountInsights = { followerCount: [], errores: [] };
  const hasta = Math.floor(now.getTime() / 1000);
  const insights = `${igUserId}/insights`;

  try {
    const u = await get<unknown>(igUserId, { fields: "followers_count" });
    if (isObj(u) && isNum(u.followers_count)) res.followers = u.followers_count;
  } catch (err) {
    res.errores.push(`followers_count: ${msgOf(err)}`);
  }

  try {
    // Meta limita follower_count a 30 días por consulta.
    const body = await get<unknown>(insights, { metric: "follower_count", period: "day", since: hasta - 30 * DAY_S, until: hasta });
    const entry = isObj(body) && Array.isArray(body.data) ? body.data[0] : undefined;
    const values = isObj(entry) && Array.isArray(entry.values) ? entry.values : [];
    for (const v of values) {
      if (isObj(v) && isNum(v.value) && typeof v.end_time === "string") res.followerCount.push({ dia: v.end_time.slice(0, 10), valor: v.value });
    }
  } catch (err) {
    res.errores.push(`follower_count: ${msgOf(err)}`);
  }

  try {
    const body = await get<unknown>(insights, { metric: "online_followers", period: "lifetime" });
    const entry = isObj(body) && Array.isArray(body.data) ? body.data[0] : undefined;
    const values = isObj(entry) && Array.isArray(entry.values) ? entry.values : [];
    const last = values[values.length - 1];
    const horas: Record<string, number> = {};
    if (isObj(last) && isObj(last.value)) for (const [h, n] of Object.entries(last.value)) if (isNum(n)) horas[h] = n;
    if (Object.keys(horas).length) res.onlineFollowers = horas;
  } catch (err) {
    res.errores.push(`online_followers no disponible (Meta lo da solo con 100 seguidores o más): ${msgOf(err)}`);
  }

  const ventana = { period: "day", metric_type: "total_value", since: hasta - 7 * DAY_S, until: hasta };
  try {
    const raw = parseInsights(await get(insights, { ...ventana, metric: "reach,accounts_engaged" }));
    res.reach7d = raw.reach;
    res.engaged7d = raw.accounts_engaged;
  } catch (err) {
    res.errores.push(`reach/accounts_engaged: ${msgOf(err)}`);
  }

  try {
    res.reachNoSeguidores7d = nonFollowerReach(await get(insights, { ...ventana, metric: "reach", breakdown: "follow_type" }));
  } catch (err) {
    res.errores.push(`reach por tipo de seguidor: ${msgOf(err)}`);
  }

  return res;
}
