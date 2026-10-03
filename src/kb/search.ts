import { cosine, embedText } from "./embed.ts";
import { fromBlob, openDb } from "./db.ts";

/**
 * Búsqueda híbrida sobre el índice: FTS5 (palabras exactas, sin tildes) +
 * embeddings (significado), fusionadas por ranking recíproco (RRF). Filtros de
 * fecha simples ("esta semana", "ayer", "últimos 10 días") sobre la fecha en que
 * se guardó el post (o se revisó la investigación).
 */

export interface Hit {
  chunkId: number;
  postId: string;
  section: string;
  text: string;
  score: number;
  title: string;
  author?: string;
  url?: string;
  path: string;
  baseName: string;
  topic?: string;
  savedAt?: string;
  /** Tipo de documento: el de la ficha (reel, post…) o "referencia" / "investigacion". */
  kind?: string;
}

export interface DateRange {
  from?: string;
  to?: string;
  label?: string;
}

/** Candidatos por cada vía antes de fusionar. */
const CANDIDATES = 40;
/** Constante de RRF (estándar). */
const RRF_K = 60;

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

/**
 * Detecta un rango de fechas en la pregunta. Función pura (testeable): `today`
 * es la fecha de referencia (AAAA-MM-DD).
 */
export function parseDateRange(question: string, today: string): DateRange | undefined {
  const q = question.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const t = new Date(`${today}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // lunes = 0
  const n = (re: RegExp): number | undefined => {
    const m = q.match(re);
    return m ? Number(m[1]) : undefined;
  };
  if (/\bhoy\b/.test(q)) return { from: today, to: today, label: "hoy" };
  if (/\bayer\b/.test(q)) return { from: iso(addDays(t, -1)), to: iso(addDays(t, -1)), label: "ayer" };
  const days = n(/ultimos?\s+(\d+)\s+dias/);
  if (days) return { from: iso(addDays(t, -(days - 1))), to: today, label: `últimos ${days} días` };
  const weeks = n(/ultimas?\s+(\d+)\s+semanas/);
  if (weeks) return { from: iso(addDays(t, -(weeks * 7 - 1))), to: today, label: `últimas ${weeks} semanas` };
  if (/semana pasada/.test(q)) return { from: iso(addDays(t, -dow - 7)), to: iso(addDays(t, -dow - 1)), label: "la semana pasada" };
  if (/esta semana/.test(q)) return { from: iso(addDays(t, -dow)), to: today, label: "esta semana" };
  if (/mes pasado/.test(q)) {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
    return { from: iso(first), to: iso(last), label: "el mes pasado" };
  }
  if (/este mes/.test(q)) return { from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), to: today, label: "este mes" };
  return undefined;
}

const STOPWORDS = new Set(
  ("que qué cual cuál cuales como cómo donde dónde cuando cuándo para por con sin sobre entre desde hasta los las unos unas del " +
    "una uno este esta estos estas ese esa eso esto hay tengo tiene tienen guarde guardé guardado guardados guardadas mis " +
    "mi me te se le lo la el en de y o a al es son fue era mas más muy ya algo alguna algun algún post posts reel reels " +
    "carrusel dime muestrame muéstrame busca encuentra sabes sé semana hoy ayer mes dias días ultimos últimos pasada pasado")
    .split(" "),
);

/** Consulta FTS5 segura: palabras relevantes entre comillas, unidas por OR. Función pura. */
export function ftsQuery(question: string): string | undefined {
  const words = question
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const unique = [...new Set(words)];
  return unique.length ? unique.map((w) => `"${w}"`).join(" OR ") : undefined;
}

/** Fusión por ranking recíproco. Función pura (testeable). */
export function rrfFuse(rankings: number[][], k = RRF_K): Map<number, number> {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return scores;
}

interface Row {
  id: number;
  post_id: string;
  section: string;
  text: string;
  embedding: Uint8Array | null;
}

/** Busca en la base. Devuelve los trozos más relevantes (máx. `limit`), ya con datos del post. */
export async function search(question: string, opts: { limit?: number; range?: DateRange } = {}): Promise<Hit[]> {
  const db = openDb();
  const limit = opts.limit ?? 12;
  const where = opts.range ? "AND p.saved_at BETWEEN ? AND ?" : "";
  const rangeArgs = opts.range ? [opts.range.from ?? "0000-00-00", opts.range.to ?? "9999-99-99"] : [];

  // 1) Palabras (bm25: menor = mejor).
  let byText: number[] = [];
  const fts = ftsQuery(question);
  if (fts) {
    byText = (
      db.prepare(
        `SELECT c.id FROM chunks_fts f JOIN chunks c ON c.id = f.rowid JOIN posts p ON p.id = c.post_id
         WHERE chunks_fts MATCH ? ${where} ORDER BY bm25(chunks_fts) LIMIT ${CANDIDATES}`,
      ).all(fts, ...rangeArgs) as { id: number }[]
    ).map((r) => r.id);
  }

  // 2) Significado (coseno en memoria: viable hasta decenas de miles de trozos).
  const rows = db.prepare(
    `SELECT c.id, c.post_id, c.section, c.text, c.embedding FROM chunks c JOIN posts p ON p.id = c.post_id WHERE 1=1 ${where}`,
  ).all(...rangeArgs) as unknown as Row[];
  let byMeaning: number[] = [];
  if (rows.length) {
    const q = await embedText(question);
    byMeaning = rows
      .filter((r) => r.embedding)
      .map((r) => ({ id: r.id, s: cosine(q, fromBlob(r.embedding!)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, CANDIDATES)
      .map((r) => r.id);
  }

  const fused = [...rrfFuse([byText, byMeaning]).entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const post = db.prepare("SELECT title, author, url, path, base_name, topic, saved_at, kind FROM posts WHERE id = ?");
  return fused.flatMap(([id, score]) => {
    const r = byId.get(id);
    if (!r) return [];
    const p = post.get(r.post_id) as {
      title: string; author: string | null; url: string | null; path: string; base_name: string; topic: string | null;
      saved_at: string | null; kind: string | null;
    };
    return [{
      chunkId: id, postId: r.post_id, section: r.section, text: r.text, score,
      title: p.title, author: p.author ?? undefined, url: p.url ?? undefined, path: p.path, baseName: p.base_name,
      topic: p.topic ?? undefined, savedAt: p.saved_at ?? undefined, kind: p.kind ?? undefined,
    }];
  });
}
