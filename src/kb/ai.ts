import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { OPENAI_OPTS } from "./types.ts";
import { recordUsage } from "./costs.ts";
import { clientFor, extraFor, withFallback } from "./llm.ts";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExtractionSchema, TopicSynthesisSchema, type Extraction, type TopicInfo, type TopicSynthesis } from "./types.ts";

/** Tope de imágenes que se descargan y adjuntan al modelo (coste/latencia). Configurable por KB_MAX_IMAGES. */
export const MAX_IMAGES = Math.max(1, Number(process.env.KB_MAX_IMAGES) || 12);

/** Tope de caracteres de transcripción/caption que se envían al modelo. */
const MAX_TEXT_CHARS = 12_000;

let client: OpenAI | null = null;

/**
 * Modelo de extracción y síntesis (multimodal). Configurable por KB_MODEL; un nombre con
 * "/" va por OpenRouter (ver llm.ts) y, si falla, se repite con KB_FALLBACK_MODEL.
 * Snapshot fijo: el alias "gpt-4o" apunta a gpt-4o-2024-08-06, que en salidas estructuradas
 * largas rompe casi siempre el escape de las tildes ("\u0003" en vez de "ó"); medido en
 * síntesis de temas grandes: 4/4 corruptas con 2024-08-06 (y con gpt-4.1), 0/12 con 2024-11-20.
 */
function model(): string {
  return process.env.KB_MODEL ?? "gpt-4o-2024-11-20";
}

/** Modelo de las páginas de tema (KB_SYNTH_MODEL); por defecto el mismo de las fichas. */
const synthModel = (): string => process.env.KB_SYNTH_MODEL ?? model();

/**
 * Caracteres de control (menos \t y \n). gpt-4o a veces rompe el escape JSON de una
 * tilde: emite "\u0003" en vez de "\u00f3" (ó) o "\u000ed" en vez de "\u00ed" (í).
 * La letra original no se puede reconstruir con seguridad, así que hay que repetir la llamada.
 */
export function hasControlChars(value: unknown): boolean {
  if (typeof value === "string") return /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value);
  if (Array.isArray(value)) return value.some(hasControlChars);
  if (value && typeof value === "object") return Object.values(value).some(hasControlChars);
  return false;
}

/** Intentos por llamada estructurada (red de seguridad si el modelo vuelve a corromper tildes). */
const CLEAN_ATTEMPTS = 4;

/**
 * Ejecuta una llamada estructurada al modelo y la repite mientras la respuesta traiga
 * caracteres de control (tildes corruptas). Si ningún intento sale limpio, lanza error:
 * nunca se borran los caracteres, porque eso deja palabras sin tilde ("Automatizacin").
 */
export async function cleanCall<T>(
  call: () => Promise<T>,
  { attempts = CLEAN_ATTEMPTS, log = console }: { attempts?: number; log?: Pick<Console, "warn"> } = {},
): Promise<T> {
  for (let i = 1; ; i++) {
    const res = await call();
    if (!hasControlChars(res)) return res;
    if (i >= attempts) throw new Error(`El modelo devolvió tildes corruptas en ${attempts} intentos seguidos.`);
    log.warn(`⚠️  Respuesta con tildes corruptas (intento ${i}/${attempts}); la repito.`);
  }
}

/** Temperatura baja: fichas consistentes entre corridas (misma entrada → misma ficha). */
const TEMPERATURE = 0.2;

/** Cliente OpenAI lazy con guardia de API key (mismo patrón que src/ai/analyze.ts). */
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY. Agrégala a .env para analizar posts.");
  }
  client ??= new OpenAI(OPENAI_OPTS);
  return client;
}

/** Tope de caracteres del caption que se pasa como pista a la transcripción. */
const MAX_HINT_CHARS = 800;

/**
 * Transcribe un audio (MP3 mono) a texto. Modelo configurable por KB_TRANSCRIBE_MODEL.
 * `hint` (el caption del post) orienta el vocabulario: sin él, nombres propios
 * como "Claude" se transcriben como palabras comunes ("Cloud").
 */
export async function transcribe(path: string, hint?: string, seconds?: number): Promise<string> {
  const prompt = hint?.trim().slice(0, MAX_HINT_CHARS);
  const model = process.env.KB_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
  const res = await getClient().audio.transcriptions.create({
    file: createReadStream(path),
    model,
    ...(prompt ? { prompt } : {}),
  });
  recordUsage("transcripcion", model, (res as { usage?: unknown }).usage, seconds);
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
  /** Detalle con que el modelo mira las imágenes (default "high"). */
  imageDetail?: "low" | "high" | "auto";
}

/** Para probar otro proveedor o modelo (p. ej. OpenRouter) sin tocar la configuración. */
export interface ModelOverride {
  client?: OpenAI;
  model?: string;
  /** Campos extra del request (p. ej. `usage: { include: true }` de OpenRouter). */
  extraBody?: Record<string, unknown>;
  log?: Pick<Console, "warn">;
  /** Recibe la respuesta cruda (uso, costo, modelo) de cada intento. */
  onResponse?: (res: unknown) => void;
}

/** Analiza un post (imágenes + caption + transcripción) y devuelve la ficha estructurada. */
export async function extractFicha(input: ExtractInput, o: ModelOverride = {}): Promise<Extraction> {
  const topicList = input.topics.length
    ? input.topics.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n")
    : "(todavía no hay temas: crea el primero)";
  // Solo imágenes: un data URI de video (p. ej. un post que es video) lo rechaza la API.
  const images = input.images.filter((u) => u.startsWith("data:image/")).slice(0, MAX_IMAGES);

  const text =
    `Tipo de pieza: ${input.kind}. ` +
    (images.length > 1 ? `Se adjuntan ${images.length} imágenes en orden (slides o frames del video).\n` : "\n") +
    (input.notes.length ? `Nota del usuario (qué le interesó): ${input.notes.join(" / ")}\n` : "") +
    `\nCaption:\n"""${input.caption.slice(0, MAX_TEXT_CHARS) || "(sin caption)"}"""\n` +
    (input.transcript ? `\nTranscripción del audio:\n"""${input.transcript.slice(0, MAX_TEXT_CHARS)}"""\n` : "") +
    `\nTemas existentes en la base:\n${topicList}`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text }];
  for (const url of images) content.push({ type: "image_url", image_url: { url, detail: input.imageDetail ?? "high" } });

  const run = (m: string, client: OpenAI, extraBody: Record<string, unknown>) =>
    cleanCall(async () => {
      const res = await client.beta.chat.completions.parse({
        model: m,
        temperature: TEMPERATURE,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content },
        ],
        response_format: zodResponseFormat(ExtractionSchema, "ficha"),
        ...extraBody,
      });
      o.onResponse?.(res);
      if (!o.client) recordUsage("ficha", res.model ?? m, res.usage);
      const parsed = res.choices[0]?.message.parsed;
      if (!parsed) throw new Error("El modelo no devolvió una ficha válida.");
      return parsed;
    }, o.log ? { log: o.log } : {});
  // Con un cliente explícito (comparación de modelos) no hay respaldo: se mide el modelo tal cual.
  if (o.client) return run(o.model ?? model(), o.client, o.extraBody ?? {});
  return withFallback(o.model ?? model(), (m) => run(m, clientFor(m), extraFor(m)), { what: "la ficha" });
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
  // Un reintento pidiendo más brevedad; si vuelve a fallar (o las tildes siguen corruptas),
  // el error sube y refreshTopics conserva la página anterior.
  const attempt = (m: string, brief: boolean) =>
    cleanCall(async () => {
      const res = await clientFor(m).beta.chat.completions.parse({
        model: m,
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
        ...extraFor(m),
      });
      recordUsage("tema", res.model ?? m, res.usage);
      const parsed = res.choices[0]?.message.parsed;
      if (!parsed) throw new Error("El modelo no devolvió una síntesis válida.");
      return parsed;
    });
  const both = async (m: string) => {
    try {
      return await attempt(m, false);
    } catch {
      return attempt(m, true);
    }
  };
  return withFallback(synthModel(), both, { what: `el tema "${topic}"` });
}
