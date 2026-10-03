import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { cleanCall } from "./ai.ts";
import { cosine, embedTexts } from "./embed.ts";
import { resolveTopicName } from "./markdown.ts";
import { OPENAI_OPTS } from "./types.ts";

/**
 * Freno a la proliferación de temas: si el modelo propone un tema nuevo cuyo
 * nombre es casi igual en significado a uno existente, se reutiliza el existente.
 */

/**
 * Similitud mínima (coseno, text-embedding-3-small) para considerar dos temas el
 * mismo. Calibrado con pares reales: los casos claros quedan ≥ 0,80
 * ("Automatización de creación de contenido" ≈ "Producción de contenido
 * automatizado": 0,83) y temas distintos del mismo rubro quedan por debajo
 * ("Emprendimiento con IA" vs "Automatización con IA": 0,75). Configurable por
 * KB_TOPIC_SIMILARITY.
 */
export const topicThreshold = (): number => Number(process.env.KB_TOPIC_SIMILARITY) || 0.8;

/**
 * Zona dudosa: por debajo del umbral pero con parecido suficiente como para que
 * pueda ser el mismo tema ("Monetización con IA" vs "Generación de ingresos con
 * IA": 0,76; "Ganar dinero con IA": 0,59). Ahí decide un modelo barato. Configurable
 * por KB_TOPIC_REVIEW.
 */
export const topicReviewFloor = (): number => Number(process.env.KB_TOPIC_REVIEW) || 0.55;

/** Candidatos que se muestran al modelo juez. */
const MAX_REVIEW_CANDIDATES = 3;

/** Temas existentes en la zona dudosa [piso, umbral), del más al menos parecido. Función pura. */
export function reviewCandidates(
  proposed: Float32Array,
  existing: { name: string; vector: Float32Array }[],
  floor: number,
  threshold: number,
): { name: string; score: number }[] {
  return existing
    .map((e) => ({ name: e.name, score: cosine(proposed, e.vector) }))
    .filter((c) => c.score >= floor && c.score < threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_REVIEW_CANDIDATES);
}

const JudgeSchema = z.object({
  same: z.string().nullable().describe("Nombre EXACTO del tema existente que cubre lo mismo, o null si es un tema distinto"),
});

/** Pregunta a un modelo barato si el tema propuesto es uno de los candidatos. */
async function judgeSameTopic(proposed: string, candidates: string[]): Promise<string | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;
  // Con tildes corruptas el nombre no calzaría con ningún candidato y se crearía un tema duplicado.
  const res = await cleanCall(() => new OpenAI(OPENAI_OPTS).beta.chat.completions.parse({
    model: process.env.KB_JUDGE_MODEL ?? "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Ordenas una base de conocimiento por temas amplios. Decide si el tema propuesto es EL MISMO tema que alguno existente " +
          "(sinónimos o misma área, ej. \"Monetización con IA\" = \"Ganar dinero con IA\"), o uno distinto aunque relacionado " +
          "(ej. \"Emprendimiento con IA\" ≠ \"Automatización con IA\"). Ante la duda, es distinto.",
      },
      { role: "user", content: `Tema propuesto: ${proposed}\nTemas existentes:\n${candidates.map((c) => `- ${c}`).join("\n")}` },
    ],
    response_format: zodResponseFormat(JudgeSchema, "juicio"),
  }).then((r) => r.choices[0]?.message.parsed ?? null));
  const same = res?.same ?? undefined;
  return same && candidates.includes(same) ? same : undefined;
}

/** Tema existente más parecido a `proposed` si supera el umbral. Función pura (testeable). */
export function closestTopic(
  proposed: Float32Array,
  existing: { name: string; vector: Float32Array }[],
  threshold: number,
): { name: string; score: number } | undefined {
  let best: { name: string; score: number } | undefined;
  for (const e of existing) {
    const score = cosine(proposed, e.vector);
    if (!best || score > best.score) best = { name: e.name, score };
  }
  return best && best.score >= threshold ? best : undefined;
}

/**
 * Resuelve el tema propuesto: nombre equivalente (sin tildes/mayúsculas) →
 * tema existente; si no, el existente más parecido en significado; si ninguno
 * se parece (o, en la zona dudosa, un modelo juez dice que es distinto), tema nuevo. Si los embeddings fallan, se queda con la comparación
 * por nombre (nunca bloquea un guardado).
 */
export async function resolveTopic(
  proposed: string,
  existing: string[],
): Promise<{ name: string; isNew: boolean; mergedFrom?: string }> {
  const byName = resolveTopicName(proposed, existing);
  if (!byName.isNew || !existing.length) return byName;
  try {
    const [p, ...vs] = await embedTexts([byName.name, ...existing]);
    const vectors = existing.map((name, i) => ({ name, vector: vs[i] }));
    const match = closestTopic(p, vectors, topicThreshold());
    if (match) return { name: match.name, isNew: false, mergedFrom: byName.name };
    const doubtful = reviewCandidates(p, vectors, topicReviewFloor(), topicThreshold());
    if (doubtful.length) {
      const same = await judgeSameTopic(byName.name, doubtful.map((c) => c.name));
      if (same) return { name: same, isNew: false, mergedFrom: byName.name };
    }
  } catch (err) {
    console.warn(`⚠️  No pude comparar temas por significado: ${err instanceof Error ? err.message : err}`);
  }
  return byName;
}
