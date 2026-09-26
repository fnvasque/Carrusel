import { z } from "zod";

/**
 * Tipos de la base de conocimiento (kb): lo que el modelo extrae de un post y lo
 * que se persiste como ficha/tema en Markdown. Los esquemas zod se usan como
 * `response_format` (structured outputs), así que todos los campos son
 * obligatorios; lo opcional se expresa como `nullable`.
 */

export const ToolSchema = z.object({
  name: z.string().describe("Nombre de la herramienta, app o servicio"),
  url: z.string().nullable().describe("URL si aparece explícitamente; si no, null"),
  purpose: z.string().describe("Para qué se usa en este post, en una frase"),
});

export const ExtractionSchema = z.object({
  title: z.string().describe("Título corto y descriptivo en español (máx. 80 caracteres), sin emojis"),
  summary: z.string().describe("Qué es el post, en 1-3 frases"),
  keyIdeas: z.array(z.string()).describe("Ideas clave, accionables y concretas (3-7)"),
  tools: z.array(ToolSchema).describe("TODAS las herramientas, apps, proyectos, kits, plantillas o servicios que el post nombra o muestra, uno por ítem (no los agrupes bajo la plataforma que usan)"),
  steps: z.array(z.string()).describe("Pasos si el post enseña un proceso; si no, []"),
  resources: z.array(z.string()).describe("Links, prompts, libros, cuentas o recursos citados"),
  imageTexts: z
    .array(z.object({
      image: z.number().int().describe("Número de la imagen adjunta (1 = la primera)"),
      text: z.string().describe("Texto visible en esa imagen, transcrito literal y completo, en su idioma original"),
    }))
    .describe("Texto de cada imagen que tenga texto legible, en orden; omite las que no tengan texto"),
  nameFixes: z
    .array(z.object({
      wrong: z.string().describe("Palabra mal transcrita tal como aparece en la transcripción (ej. Cloud)"),
      right: z.string().describe("Nombre correcto según el caption o las imágenes (ej. Claude)"),
    }))
    .describe("Nombres propios que la transcripción escribió mal; [] si no hay"),
  fromComments: z.array(z.string()).describe("Aportes útiles de los comentarios: tips, alternativas, correcciones, datos"),
  audienceQuestions: z.array(z.string()).describe("Preguntas o dudas que se repiten en los comentarios"),
  mainTopic: z.string().describe("Tema principal: uno existente si encaja, o uno nuevo, amplio y reutilizable"),
  newTopicDescription: z.string().nullable().describe("Si mainTopic es nuevo, descripción de 1 frase; si existe, null"),
  secondaryTopics: z.array(z.string()).describe("0-2 temas EXISTENTES relacionados (nunca nuevos)"),
  tags: z.array(z.string()).describe("3-6 tags en kebab-case sin #, en español"),
  language: z.string().describe("Idioma original del post (código ISO, ej. es, en)"),
  confidence: z.enum(["low", "medium", "high"]).describe("Confianza según cuánto contenido había"),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const TopicSynthesisSchema = z.object({
  description: z.string().describe("Descripción del tema en 1 frase"),
  essentials: z.array(z.string()).describe("Lo esencial que se sabe del tema, sintetizado de todas las fuentes"),
  tools: z.array(z.object({ name: z.string(), purpose: z.string() })).describe("Herramientas mencionadas en las fuentes"),
  techniques: z.array(z.string()).describe("Técnicas, trucos o procesos concretos"),
  questions: z.array(z.string()).describe("Preguntas frecuentes de la audiencia"),
});

export type TopicSynthesis = z.infer<typeof TopicSynthesisSchema>;

/** Tipo de pieza guardada. */
export type PostKind = "reel" | "post" | "carrusel" | "manual";

/** Comentario ya limpio (sin autor: no se guardan datos personales). */
export interface KbComment {
  text: string;
  likes: number;
}

/** Metadatos del post obtenidos de yt-dlp (todo opcional: puede fallar). */
export interface PostMeta {
  author?: string;
  publishedAt?: string;
  kind?: PostKind;
  isVideo: boolean;
  /** ¿Algún medio del post es video? (en un carrusel mixto, alguna slide). */
  hasVideo: boolean;
  caption?: string;
  comments: KbComment[];
  /** Comentarios que declara Instagram (aunque yt-dlp no los haya traído). */
  commentCount?: number;
  /** URLs de las imágenes del post (una por slide), para carruseles de fotos que yt-dlp no descarga. */
  imageUrls: string[];
}

/** Ficha lista para renderizar: extracción + metadatos del post. */
export interface Ficha {
  id: string;
  url?: string;
  kind: PostKind;
  author?: string;
  publishedAt?: string;
  savedAt: string;
  caption: string;
  transcript?: string;
  notes: string[];
  partial: boolean;
  thumbnail?: string;
  /** Todas las imágenes del post (fuera de git), rutas relativas a la base. */
  gallery?: string[];
  extraction: Extraction;
}

/** Un tema existente en la base. */
export interface TopicInfo {
  name: string;
  description: string;
}

/** Etapas del pipeline, para reportar progreso (CLI hoy, Telegram después). */
export type Stage = "descargando" | "comentarios" | "transcribiendo" | "analizando" | "guardando" | "temas" | "commit" | "indexando";

/** Texto de cada etapa del guardado (CLI y mensajes de progreso del bot). */
export const STAGE_LABEL: Record<Stage, string> = {
  descargando: "📥 Descargando el post…",
  comentarios: "💬 Comentarios",
  transcribiendo: "🎙 Transcribiendo el audio…",
  analizando: "🧠 Analizando…",
  guardando: "💾 Guardando la ficha…",
  temas: "🗂 Actualizando temas…",
  commit: "📌 Commit…",
  indexando: "🔎 Indexando para consultas…",
};

export interface AddInput {
  url?: string;
  note?: string;
  images?: string[];
  caption?: string;
  cookies?: string;
  cookiesFromBrowser?: string;
  commit?: boolean;
  onProgress?: (stage: Stage, detail?: string) => void;
}

export interface AddResult {
  ficha: Ficha;
  path: string;
  created: boolean;
  topicsUpdated: string[];
  newTopic: boolean;
  /** Si el modelo propuso un tema nuevo pero se unió a uno existente parecido, el nombre propuesto. */
  topicMergedFrom?: string;
  commit?: string;
}
