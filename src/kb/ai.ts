import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExtractionSchema, TopicSynthesisSchema, type Extraction, type TopicInfo, type TopicSynthesis } from "./types.ts";

/** Tope de imágenes que se descargan y adjuntan al modelo (coste/latencia). Configurable por KB_MAX_IMAGES. */
export const MAX_IMAGES = Math.max(1, Number(process.env.KB_MAX_IMAGES) || 12);

/** Tope de caracteres de transcripción/caption que se envían al modelo. */
const MAX_TEXT_CHARS = 12_000;

let client: OpenAI | null = null;

/** Modelo de extracción y síntesis (multimodal). Configurable por KB_MODEL. */
function model(): string {
  return process.env.KB_MODEL ?? "gpt-4o";
}

/** Caracteres de control (menos \t y \n). El modelo a veces los emite en lugar de una tilde ("monetizaci\x10n"). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export function hasControlChars(value: unknown): boolean {
  if (typeof value === "string") return /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value);
  if (Array.isArray(value)) return value.some(hasControlChars);
  if (value && typeof value === "object") return Object.values(value).some(hasControlChars);
  return false;
}

/** Quita caracteres de control de todos los strings de una respuesta. Función pura (testeable). */
export function stripControlChars<T>(value: T): T {
  if (typeof value === "string") return value.replace(CONTROL_CHARS, "") as T;
  if (Array.isArray(value)) return value.map(stripControlChars) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripControlChars(v)])) as T;
  }
  return value;
}

/**
 * Ejecuta una llamada al modelo y, si la respuesta trae caracteres de control
 * (tildes corruptas), la repite una vez; si persisten, los elimina.
 */
async function cleanCall<T>(call: () => Promise<T>): Promise<T> {
  const first = await call();
  if (!hasControlChars(first)) return first;
  const second = await call();
  return hasControlChars(second) ? stripControlChars(second) : second;
}

/** Temperatura baja: fichas consistentes entre corridas (misma entrada → misma ficha). */
const TEMPERATURE = 0.2;

/** Cliente OpenAI lazy con guardia de API key (mismo patrón que src/ai/analyze.ts). */
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY. Agrégala a .env para analizar posts.");
  }
  client ??= new OpenAI();
  return client;
}

/** Tope de caracteres del caption que se pasa como pista a la transcripción. */
const MAX_HINT_CHARS = 800;

/**
 * Transcribe un audio (MP3 mono) a texto. Modelo configurable por KB_TRANSCRIBE_MODEL.
 * `hint` (el caption del post) orienta el vocabulario: sin él, nombres propios
 * como "Claude" se transcriben como palabras comunes ("Cloud").
 */
export async function transcribe(path: string, hint?: string): Promise<string> {
  const prompt = hint?.trim().slice(0, MAX_HINT_CHARS);
  const res = await getClient().audio.transcriptions.create({
    file: createReadStream(path),
    model: process.env.KB_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
    ...(prompt ? { prompt } : {}),
  });
  return res.text.trim();
}

const EXTRACT_SYSTEM = `
Eres el bibliotecario de una base de conocimiento personal. El usuario guarda posts de Instagram que le interesan y tú los conviertes en fichas ordenadas y útiles para consultarlas después.
Reglas:
- Escribe SIEMPRE en español, aunque el post esté en otro idioma.
- Sé concreto y fiel al contenido: no inventes herramientas, pasos ni datos que no estén en las imágenes, el caption o la transcripción.
- Temas: reutiliza un tema existente si encaja razonablemente. Crea uno nuevo solo si ninguno sirve; debe ser amplio y reutilizable (ej. "Automatización con IA", no "Automatizar Gmail con Make"). Los temas secundarios SOLO pueden ser existentes.
- La transcripción es automática y puede confundir nombres propios (ej. "Cloud" en vez de "Claude", "Meik" en vez de "Make"). Corrige esos nombres usando el caption y el texto de las imágenes, escribe siempre el nombre correcto de herramientas y marcas, y lista cada corrección en nameFixes.
- Transcribe en imageTexts el texto de cada imagen tal cual aparece (títulos, listas, prompts, código, datos), sin resumir ni traducir. Es para poder buscarlo después.
- Si el contenido es escaso (solo una imagen sin texto), dilo con confidence "low".
`.trim();

export interface ExtractInput {
  kind: string;
  caption: string;
  transcript?: string;
  notes: string[];
  images: string[];
  topics: TopicInfo[];
}

/** Analiza un post (imágenes + caption + transcripción) y devuelve la ficha estructurada. */
export async function extractFicha(input: ExtractInput): Promise<Extraction> {
  const topicList = input.topics.length
    ? input.topics.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n")
    : "(todavía no hay temas: crea el primero)";
  const images = input.images.slice(0, MAX_IMAGES);

  const text =
    `Tipo de pieza: ${input.kind}. ` +
    (images.length > 1 ? `Se adjuntan ${images.length} imágenes en orden (slides o frames del video).\n` : "\n") +
    (input.notes.length ? `Nota del usuario (qué le interesó): ${input.notes.join(" / ")}\n` : "") +
    `\nCaption:\n"""${input.caption.slice(0, MAX_TEXT_CHARS) || "(sin caption)"}"""\n` +
    (input.transcript ? `\nTranscripción del audio:\n"""${input.transcript.slice(0, MAX_TEXT_CHARS)}"""\n` : "") +
    `\nTemas existentes en la base:\n${topicList}`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text }];
  for (const url of images) content.push({ type: "image_url", image_url: { url, detail: "high" } });

  return cleanCall(async () => {
    const res = await getClient().beta.chat.completions.parse({
      model: model(),
      temperature: TEMPERATURE,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content },
      ],
      response_format: zodResponseFormat(ExtractionSchema, "ficha"),
    });
    const parsed = res.choices[0]?.message.parsed;
    if (!parsed) throw new Error("El modelo no devolvió una ficha válida.");
    return parsed;
  });
}

/** Tope de tokens de salida de la síntesis de un tema. */
const MAX_SYNTH_TOKENS = 3000;

const SYNTH_SYSTEM = `
Mantienes la página de un TEMA en una base de conocimiento personal. Recibes las fichas de todas las fuentes de ese tema y escribes una síntesis que responda "¿qué sé de este tema?".
Reglas: en español; agrupa y deduplica lo que se repite entre fuentes; prioriza lo concreto y accionable; no inventes nada que no esté en las fichas; no cites nombres de usuario.
`.trim();

/** Sintetiza la página de un tema a partir del texto de sus fichas. */
export async function synthesizeTopic(topic: string, fichasText: string[]): Promise<TopicSynthesis> {
  // Tope de salida: si el modelo entra en bucle, falla rápido en vez de gastar tokens.
  // Un reintento pidiendo más brevedad; si vuelve a fallar, el error sube (refreshTopics lo maneja).
  const attempt = (brief: boolean) =>
    cleanCall(async () => {
      const res = await getClient().beta.chat.completions.parse({
        model: model(),
        temperature: TEMPERATURE,
        max_tokens: MAX_SYNTH_TOKENS,
        messages: [
          { role: "system", content: brief ? `${SYNTH_SYSTEM}\nSé muy breve: máximo 6 ítems por lista, una frase cada uno.` : SYNTH_SYSTEM },
          {
            role: "user",
            content: `Tema: ${topic}\n\nFichas (${fichasText.length}):\n\n${fichasText.map((f, i) => `### Fuente ${i + 1}\n${f}`).join("\n\n")}`,
          },
        ],
        response_format: zodResponseFormat(TopicSynthesisSchema, "tema"),
      });
      const parsed = res.choices[0]?.message.parsed;
      if (!parsed) throw new Error("El modelo no devolvió una síntesis válida.");
      return parsed;
    });
  try {
    return await attempt(false);
  } catch {
    return attempt(true);
  }
}
