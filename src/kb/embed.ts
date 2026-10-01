import { createHash } from "node:crypto";
import OpenAI from "openai";
import { OPENAI_OPTS } from "./types.ts";
import { fromBlob, openDb, toBlob } from "./db.ts";

/**
 * Embeddings (OpenAI) con caché en el índice: el mismo texto nunca se paga dos
 * veces, así que reindexar desde cero es casi gratis.
 */

/** Modelo de embeddings. Configurable por KB_EMBED_MODEL. */
const embedModel = (): string => process.env.KB_EMBED_MODEL ?? "text-embedding-3-small";

/** Textos por request (el límite de la API es mayor; esto acota el tamaño). */
const BATCH = 96;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY. Agrégala a .env.");
  client ??= new OpenAI(OPENAI_OPTS);
  return client;
}

const cacheKey = (text: string): string => createHash("sha256").update(`${embedModel()}\n${text}`).digest("hex");

/** Embeddings normalizados (norma 1) de cada texto, en el mismo orden. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const db = openDb();
  const get = db.prepare("SELECT vector FROM embedding_cache WHERE key = ?");
  const put = db.prepare("INSERT OR REPLACE INTO embedding_cache (key, vector) VALUES (?, ?)");
  const out: (Float32Array | undefined)[] = texts.map((t) => {
    const row = get.get(cacheKey(t)) as { vector: Uint8Array } | undefined;
    return row ? fromBlob(row.vector) : undefined;
  });
  const missing = texts.map((t, i) => ({ t, i })).filter(({ i }) => !out[i]);
  for (let s = 0; s < missing.length; s += BATCH) {
    const batch = missing.slice(s, s + BATCH);
    const res = await getClient().embeddings.create({ model: embedModel(), input: batch.map((m) => m.t) });
    res.data.forEach((d, j) => {
      const v = normalize(Float32Array.from(d.embedding));
      out[batch[j].i] = v;
      put.run(cacheKey(batch[j].t), toBlob(v));
    });
  }
  return out as Float32Array[];
}

export async function embedText(text: string): Promise<Float32Array> {
  return (await embedTexts([text]))[0];
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** Similitud coseno de vectores ya normalizados (= producto punto). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
