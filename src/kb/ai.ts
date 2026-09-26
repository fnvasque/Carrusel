import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExtractionSchema, TopicSynthesisSchema, type Extraction, type KbComment, type TopicInfo, type TopicSynthesis } from "./types.ts";

/** Tope de imágenes que se adjuntan al modelo (coste/latencia). */
const MAX_IMAGES = 8;

/** Tope de caracteres de transcripción/caption que se envían al modelo. */
const MAX_TEXT_CHARS = 12_000;

let client: OpenAI | null = null;

/** Modelo de extracción y síntesis (multimodal). Configurable por KB_MODEL. */
function model(): string {
  return process.env.KB_MODEL ?? "gpt-4o";
}

/** Cliente OpenAI lazy con guardia de API key (mismo patrón que src/ai/analyze.ts). */
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY. Agrégala a .env para analizar posts.");
  }
  client ??= new OpenAI();
  return client;
}

/** Transcribe un audio (MP3 mono) a texto. Modelo configurable por KB_TRANSCRIBE_MODEL. */
export async function transcribe(path: string): Promise<string> {
  const res = await getClient().audio.transcriptions.create({
    file: createReadStream(path),
    model: process.env.KB_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
  });
  return res.text.trim();
}

const EXTRACT_SYSTEM = `
Eres el bibliotecario de una base de conocimiento personal. El usuario guarda posts de Instagram que le interesan y tú los conviertes en fichas ordenadas y útiles para consultarlas después.
Reglas:
- Escribe SIEMPRE en español, aunque el post esté en otro idioma.
- Sé concreto y fiel al contenido: no inventes herramientas, pasos ni datos que no estén en las imágenes, el caption, la transcripción o los comentarios.
- De los comentarios rescata solo lo que aporta (tips, alternativas, correcciones, precios, links). Nunca incluyas nombres de usuario.
- Temas: reutiliza un tema existente si encaja razonablemente. Crea uno nuevo solo si ninguno sirve; debe ser amplio y reutilizable (ej. "Automatización con IA", no "Automatizar Gmail con Make"). Los temas secundarios SOLO pueden ser existentes.
- Si el contenido es escaso (solo una imagen sin texto), dilo con confidence "low".
`.trim();

export interface ExtractInput {
  kind: string;
  caption: string;
  transcript?: string;
  comments: KbComment[];
  notes: string[];
  images: string[];
  topics: TopicInfo[];
}

/** Analiza un post (imágenes + caption + transcripción + comentarios) y devuelve la ficha estructurada. */
export async function extractFicha(input: ExtractInput): Promise<Extraction> {
  const topicList = input.topics.length
    ? input.topics.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n")
    : "(todavía no hay temas: crea el primero)";
  const comments = input.comments.length
    ? input.comments.map((c) => `- (${c.likes}♥) ${c.text}`).join("\n")
    : "(sin comentarios disponibles)";
  const images = input.images.slice(0, MAX_IMAGES);

  const text =
    `Tipo de pieza: ${input.kind}. ` +
    (images.length > 1 ? `Se adjuntan ${images.length} imágenes en orden (slides o frames del video).\n` : "\n") +
    (input.notes.length ? `Nota del usuario (qué le interesó): ${input.notes.join(" / ")}\n` : "") +
    `\nCaption:\n"""${input.caption.slice(0, MAX_TEXT_CHARS) || "(sin caption)"}"""\n` +
    (input.transcript ? `\nTranscripción del audio:\n"""${input.transcript.slice(0, MAX_TEXT_CHARS)}"""\n` : "") +
    `\nComentarios (más votados primero):\n${comments}\n` +
    `\nTemas existentes en la base:\n${topicList}`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text }];
  for (const url of images) content.push({ type: "image_url", image_url: { url, detail: "auto" } });

  const res = await getClient().beta.chat.completions.parse({
    model: model(),
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content },
    ],
    response_format: zodResponseFormat(ExtractionSchema, "ficha"),
  });
  const parsed = res.choices[0]?.message.parsed;
  if (!parsed) throw new Error("El modelo no devolvió una ficha válida.");
  return parsed;
}

const SYNTH_SYSTEM = `
Mantienes la página de un TEMA en una base de conocimiento personal. Recibes las fichas de todas las fuentes de ese tema y escribes una síntesis que responda "¿qué sé de este tema?".
Reglas: en español; agrupa y deduplica lo que se repite entre fuentes; prioriza lo concreto y accionable; no inventes nada que no esté en las fichas; no cites nombres de usuario.
`.trim();

/** Sintetiza la página de un tema a partir del texto de sus fichas. */
export async function synthesizeTopic(topic: string, fichasText: string[]): Promise<TopicSynthesis> {
  const res = await getClient().beta.chat.completions.parse({
    model: model(),
    messages: [
      { role: "system", content: SYNTH_SYSTEM },
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
}
