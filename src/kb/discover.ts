import { GraphError, graphGet } from "../meta/client.ts";
import { metaConfig } from "../meta/env.ts";
import { extractShortcode, findMediaViaBusinessDiscovery, type MetaMedia } from "../remix/providers/meta.ts";
import { openDb } from "./db.ts";

/**
 * Encontrar un post sin saber de qué cuenta es (los links y los DMs compartidos
 * no la traen), solo con la API oficial:
 *   1. @menciones del caption/mensaje y cuentas ya guardadas → Business Discovery
 *      (se verifica que el post esté en su feed: nunca se atribuye mal).
 *   2. Hashtags del caption → Hashtag Search (posts recientes, 24 h): trae el
 *      video/imagen aunque no se sepa la cuenta.
 * Hashtag Search tiene un cupo de 30 hashtags distintos por semana por cuenta:
 * se lleva la cuenta en el índice y se priorizan los ya usados (no gastan cupo).
 */

/** Cupo de Meta: hashtags distintos consultables en 7 días. Se deja margen. */
const HASHTAG_WEEKLY_LIMIT = 28;
/** Hashtags que se prueban por post. */
const MAX_TAGS_PER_POST = 3;
/** Cuentas ya guardadas que se revisan (su página más reciente de 50 posts). */
const MAX_KNOWN_ACCOUNTS = 10;
/**
 * Rondas de la búsqueda, cada una sobre todos los hashtags. Medido: cada página
 * tarda ~17 s; un reel reciente suele estar en la primera página de recientes
 * (24 h) de un hashtag de nicho, y uno popular en la primera de destacados.
 */
const ROUNDS = [
  { edge: "recent_media", page: 0 },
  { edge: "recent_media", page: 1 },
  { edge: "top_media", page: 0 },
] as const;
/** Tope de tiempo de toda la búsqueda por hashtags (ms) y de cada página. */
const TAG_SEARCH_BUDGET_MS = 120_000;
const TAG_PAGE_TIMEOUT_MS = 30_000;
/** Tamaños de página a probar: Meta a veces responde "reduce the amount of data" (código 1). */
const PAGE_SIZES = [50, 25];
/**
 * Campos al recorrer un hashtag: solo lo necesario para reconocer el post y usar su
 * video/imagen. Pedir caption o slides (children) en páginas de 50 hace que Meta
 * responda "reduce the amount of data" (el caption ya viene en el DM).
 */
const HASHTAG_FIELDS = "id,media_type,media_url,permalink,timestamp";

/** Hashtags tan masivos que buscar un post ahí es inútil. */
const GENERIC_TAGS = new Set(
  ("reels reel viral fyp foryou foryoupage explore explorepage instagram instagood trending love tiktok video ai ia " +
    "tech tv series cinema netflix music art photography fashion fitness food travel motivation business marketing")
    .split(" "),
);

export interface Discovered {
  media: MetaMedia;
  /** Cuenta dueña si se pudo verificar (por Hashtag Search queda sin cuenta). */
  username?: string;
  via: "mención" | "cuenta guardada" | "hashtag";
}

/** @usuarios mencionados en un texto, sin repetir. Función pura. */
export function mentionsIn(text: string | undefined): string[] {
  return [...new Set([...(text ?? "").matchAll(/(?:^|[^\w@])@([\w.]{2,30})\b/g)].map((m) => m[1].replace(/\.$/, "")))];
}

/** Hashtags de un caption en minúsculas, sin repetir. Función pura. */
export function hashtagsIn(caption: string | undefined): string[] {
  return [...new Set([...(caption ?? "").matchAll(/#([\p{L}\d_]{2,})/gu)].map((m) => m[1].toLowerCase()))];
}

/**
 * Qué hashtags consultar. Función pura (testeable): fuera los genéricos; primero
 * los ya usados esta semana (gratis) y luego los más largos (más específicos),
 * sin pasar del cupo restante.
 */
export function pickHashtags(tags: string[], usedThisWeek: Set<string>, max = MAX_TAGS_PER_POST, limit = HASHTAG_WEEKLY_LIMIT): string[] {
  const useful = [...new Set(tags)].filter((t) => !GENERIC_TAGS.has(t) && t.length >= 4);
  const free = useful.filter((t) => usedThisWeek.has(t));
  let budget = Math.max(0, limit - usedThisWeek.size);
  const fresh = useful.filter((t) => !usedThisWeek.has(t)).sort((a, b) => b.length - a.length).filter(() => budget-- > 0);
  return [...free, ...fresh].slice(0, max);
}

function hashtagLog(): ReturnType<typeof openDb> {
  const db = openDb();
  db.exec("CREATE TABLE IF NOT EXISTS hashtag_usage (tag TEXT PRIMARY KEY, first_used TEXT NOT NULL)");
  db.exec("DELETE FROM hashtag_usage WHERE first_used < datetime('now', '-7 days')");
  return db;
}

const usedHashtags = (): Set<string> =>
  new Set((hashtagLog().prepare("SELECT tag FROM hashtag_usage").all() as { tag: string }[]).map((r) => r.tag));

type TagPage = { data?: MetaMedia[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Una página de un listado de un hashtag; si Meta pide menos datos (código 1), con páginas más chicas. */
async function tagPage(hashtagId: string, edge: string, igUserId: string, after: string | undefined): Promise<TagPage> {
  let last: unknown;
  for (const limit of PAGE_SIZES) {
    try {
      return await graphGet<TagPage>(
        `${hashtagId}/${edge}`,
        { user_id: igUserId, fields: HASHTAG_FIELDS, limit, after },
        { timeoutMs: TAG_PAGE_TIMEOUT_MS, attempts: 1 },
      );
    } catch (err) {
      if (!(err instanceof GraphError && err.code === 1)) throw err;
      last = err;
    }
  }
  throw last;
}

/** Id de un hashtag (cuenta para el cupo semanal la primera vez en 7 días). */
async function hashtagId(tag: string, igUserId: string): Promise<string | undefined> {
  const h = await graphGet<{ data?: { id: string }[] }>("ig_hashtag_search", { user_id: igUserId, q: tag });
  hashtagLog().prepare("INSERT OR IGNORE INTO hashtag_usage (tag, first_used) VALUES (?, datetime('now'))").run(tag);
  return h.data?.[0]?.id;
}

/**
 * Busca el post en varios hashtags, a lo ancho (ROUNDS): primero la página 1 de
 * recientes de cada uno, después la 2, después los destacados. Así gana el
 * hashtag de nicho sin importar el orden. En secuencia: Meta frena las consultas
 * de hashtags simultáneas.
 */
async function searchHashtags(
  tags: string[],
  shortcode: string,
  log: (msg: string) => void,
): Promise<{ media: MetaMedia; tag: string } | undefined> {
  const { igUserId } = metaConfig();
  const deadline = Date.now() + TAG_SEARCH_BUDGET_MS;
  const ids = new Map<string, string | undefined>();
  // Cursor por hashtag y listado; "done" cuando no hay más páginas o hubo error.
  const cursors = new Map<string, { after?: string; done?: boolean }>();
  for (const { edge, page } of ROUNDS) {
    for (const tag of tags) {
      if (Date.now() >= deadline) return undefined;
      const key = `${tag}/${edge}`;
      const cur = cursors.get(key) ?? {};
      if (cur.done || (page > 0 && !cur.after)) continue;
      try {
        if (!ids.has(tag)) ids.set(tag, await hashtagId(tag, igUserId));
        const id = ids.get(tag);
        if (!id) continue;
        const r = await tagPage(id, edge, igUserId, cur.after);
        const hit = r.data?.find((m) => m.permalink && extractShortcode(m.permalink) === shortcode);
        if (hit) return { media: hit, tag };
        cursors.set(key, { after: r.paging?.cursors?.after, done: !r.paging?.cursors?.after || !r.paging?.next });
      } catch (err) {
        log(`#${tag} (${edge}): ${err instanceof Error ? err.message : err}`);
        cursors.set(key, { done: true });
      }
    }
  }
  return undefined;
}

/**
 * Intenta encontrar el post sin que el usuario diga la cuenta. Devuelve undefined
 * si no hubo forma (entonces se pregunta). Nunca lanza por un candidato fallido.
 */
export async function discoverPost(
  shortcode: string,
  hints: { caption?: string; text?: string; knownAccounts?: string[] } = {},
  log: (msg: string) => void = () => {},
): Promise<Discovered | undefined> {
  // 1) Cuentas candidatas verificadas con Business Discovery (sin cupo semanal).
  const mentioned = [...mentionsIn(hints.text), ...mentionsIn(hints.caption)];
  const known = (hints.knownAccounts ?? []).slice(0, MAX_KNOWN_ACCOUNTS).filter((u) => !mentioned.includes(u));
  for (const [username, via] of [...mentioned.map((u) => [u, "mención"] as const), ...known.map((u) => [u, "cuenta guardada"] as const)]) {
    try {
      const media = await findMediaViaBusinessDiscovery(username, shortcode, via === "mención" ? 3 : 1);
      log(`cuenta encontrada: @${username} (${via})`);
      return { media, username, via };
    } catch {
      // no está en esa cuenta (o no es Business/Creator): siguiente candidato.
    }
  }
  // 2) Hashtags del caption (Hashtag Search): trae el post aunque no se sepa la cuenta.
  const tags = pickHashtags(hashtagsIn(hints.caption), usedHashtags());
  if (!tags.length) return undefined;
  log(`buscando en los hashtags ${tags.map((t) => `#${t}`).join(" ")}…`);
  const found = await searchHashtags(tags, shortcode, log);
  if (!found) return undefined;
  log(`post encontrado por #${found.tag} (sin cuenta)`);
  return { media: found.media, via: "hashtag" };
}
