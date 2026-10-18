import { recordUsage, withCostScope } from "./costs.ts";
import { clientFor, extraFor, withFallback } from "./llm.ts";
import { parseDateRange, search, type DateRange, type Hit } from "./search.ts";

/**
 * Responder preguntas SOLO con la base: búsqueda híbrida → el modelo redacta con
 * citas [n] a las fuentes (fichas guardadas y notas de investigación). Si la base
 * no alcanza, lo dice (no inventa).
 */

/** Fichas distintas que se pasan al modelo como fuentes. */
const MAX_SOURCES = 6;
/** Trozos por ficha. */
const MAX_CHUNKS_PER_SOURCE = 5;
/** Tope de caracteres del contexto total. */
const MAX_CONTEXT_CHARS = 10_000;

/**
 * Modelo de las respuestas (KB_ASK_MODEL; con "/" va por OpenRouter y, si falla, se
 * repite con KB_FALLBACK_MODEL). Independiente de KB_MODEL.
 */
const askModel = (): string => process.env.KB_ASK_MODEL ?? "gpt-4o";


export interface Source {
  n: number;
  title: string;
  author?: string;
  savedAt?: string;
  url?: string;
  baseName: string;
  topic?: string;
  /** Tipo de documento (ver Hit.kind). */
  kind?: string;
}

export interface Answer {
  answer: string;
  /** Fuentes citadas en la respuesta (en orden de número). */
  sources: Source[];
  range?: DateRange;
  found: boolean;
  /** Modelo que redactó la respuesta (si se llamó al modelo), si fue el de respaldo, y el costo (USD). */
  model?: string;
  fallback?: boolean;
  costUsd?: number;
}

/** Agrupa los trozos por ficha, en orden de relevancia. Función pura (testeable). */
export function groupSources(hits: Hit[], maxSources = MAX_SOURCES, maxChunks = MAX_CHUNKS_PER_SOURCE): { source: Source; chunks: Hit[] }[] {
  const groups: { source: Source; chunks: Hit[] }[] = [];
  for (const h of hits) {
    let g = groups.find((x) => x.source.baseName === h.baseName);
    if (!g) {
      if (groups.length >= maxSources) continue;
      g = {
        source: {
          n: groups.length + 1, title: h.title, author: h.author, savedAt: h.savedAt, url: h.url, baseName: h.baseName,
          topic: h.topic, kind: h.kind,
        },
        chunks: [],
      };
      groups.push(g);
    }
    if (g.chunks.length < maxChunks) g.chunks.push(h);
  }
  return groups;
}

/** Números [n] citados en un texto. Función pura. */
export function citedNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(",").map((x) => Number(x.trim()))))];
}

/** ¿La fuente es una nota de investigación (no un post guardado)? */
export const isResearch = (s: { kind?: string }): boolean => s.kind === "referencia" || s.kind === "investigacion";

/**
 * Aviso para el final de la respuesta cuando cita investigación sin decirlo (el
 * modelo no siempre sigue la instrucción): fecha de revisión más reciente. Función pura.
 */
export function researchNote(a: Pick<Answer, "answer" | "sources">): string | undefined {
  const dates = a.sources.filter(isResearch).map((s) => s.savedAt ?? "").sort();
  if (!dates.length || /investigaci[oó]n/i.test(a.answer)) return undefined;
  const last = dates[dates.length - 1];
  return `🔎 Incluye datos de la investigación${last ? ` del ${last}` : ""}.`;
}

/** Encabezado de una fuente en el contexto del modelo. Función pura. */
export function sourceHead(s: Source): string {
  if (isResearch(s)) {
    return `[${s.n}] INVESTIGACIÓN — ${s.title}${s.savedAt ? ` · revisada ${s.savedAt}` : ""}${s.topic ? ` · tema: ${s.topic}` : ""}`;
  }
  return `[${s.n}] ${s.title}${s.author ? ` — ${s.author}` : ""}${s.savedAt ? ` · guardado ${s.savedAt}` : ""}${s.topic ? ` · tema: ${s.topic}` : ""}`;
}

const ASK_SYSTEM = `
Respondes preguntas del usuario sobre SU base de conocimiento personal: posts de Instagram que guardó y resumió, y notas de investigación que un agente preparó a partir de esos posts.
Reglas:
- Usa SOLO la información de las fuentes numeradas. No agregues conocimiento propio.
- Cada trozo indica su sección entre paréntesis: "Texto de las imágenes" es lo que decían las slides o cuadros, "Transcripción" es el audio, "Mis notas" son notas del propio usuario.
- Las fuentes marcadas INVESTIGACIÓN no son posts guardados: son notas investigadas en la web, con su fecha de revisión. Cada vez que uses una, la frase debe empezar con «Según la investigación del <fecha>, …» (la fecha de revisión de esa fuente).
- Cita cada afirmación con el número de su fuente entre corchetes, ej. [1] o [2, 3].
- Si las fuentes no responden la pregunta, dilo claramente ("No encontré eso en tu base") y, si hay algo cercano, menciónalo con su cita.
- Responde en español, directo y concreto: primero la respuesta, después el detalle útil (herramientas, pasos, datos). Sin relleno.
`.trim();

export async function ask(question: string, opts: { today?: string } = {}): Promise<Answer> {
  const { result, usd, models, fallback } = await withCostScope("pregunta", () => answerQuestion(question, opts));
  return { ...result, model: models.consulta, fallback, costUsd: usd };
}

async function answerQuestion(question: string, opts: { today?: string }): Promise<Answer> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const range = parseDateRange(question, today);
  const hits = await search(question, { limit: 24, range });
  const groups = groupSources(hits);
  if (!groups.length) {
    const when = range?.label ? ` guardado ${range.label}` : "";
    return { answer: `No encontré nada${when} en tu base sobre eso.`, sources: [], range, found: false };
  }

  let budget = MAX_CONTEXT_CHARS;
  const context = groups
    .map(({ source: s, chunks }) => {
      const head = sourceHead(s);
      const body = chunks.map((c) => `(${c.section}) ${c.text}`).join("\n");
      const piece = `${head}\n${body}`.slice(0, Math.max(0, budget));
      budget -= piece.length;
      return piece;
    })
    .filter(Boolean)
    .join("\n\n");

  const res = await withFallback(askModel(), async (model) => {
    const r = await clientFor(model).chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: ASK_SYSTEM },
        {
          role: "user",
          content: `${range ? `(La pregunta se refiere a posts guardados ${range.label}: ${range.from} a ${range.to}.)\n` : ""}Pregunta: ${question}\n\nFuentes:\n\n${context}`,
        },
      ],
      ...(extraFor(model) as object),
    });
    recordUsage("consulta", r.model ?? model, r.usage);
    return r;
  }, { what: "la respuesta" });
  const answer = res.choices[0]?.message.content?.trim() || "No pude generar una respuesta.";
  const cited = new Set(citedNumbers(answer));
  const sources = groups.map((g) => g.source).filter((s) => cited.has(s.n));
  return { answer, sources, range, found: sources.length > 0 };
}
