import matter from "gray-matter";
import type { Ficha, TopicSynthesis } from "./types.ts";

/**
 * Render y parseo de las notas Markdown de la base (vault de Obsidian).
 *
 * Regla central: el bot solo escribe entre AUTO_START y AUTO_END. Todo lo que
 * está fuera (p. ej. "## Mis notas") es del usuario y se conserva intacto en cada
 * reescritura. En el frontmatter, las claves que el usuario agregue también se
 * conservan; solo se sobrescriben las del bot.
 */

export const AUTO_START = "<!-- kb:auto:start -->";
export const AUTO_END = "<!-- kb:auto:end -->";
const USER_ZONE = "## Mis notas\n\n";

/** Clave de comparación de temas: sin acentos, minúsculas, sin puntuación. */
export function topicKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\d]+/gu, " ")
    .trim();
}

/** Nombre de archivo seguro para Obsidian (sin caracteres que rompen wikilinks o rutas). */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Sin tema";
}

/**
 * Devuelve el nombre canónico del tema: el existente si coincide (ignorando
 * acentos/mayúsculas), o el propuesto limpio y con mayúscula inicial.
 */
export function resolveTopicName(proposed: string, existing: string[]): { name: string; isNew: boolean } {
  const key = topicKey(proposed);
  const match = existing.find((e) => topicKey(e) === key);
  if (match) return { name: match, isNew: false };
  const clean = safeFileName(proposed);
  return { name: clean.charAt(0).toUpperCase() + clean.slice(1), isNew: true };
}

/** Nombre de archivo (sin .md) de una ficha: `AAAA-MM-DD-autor-id`. */
export function fichaBaseName(f: Pick<Ficha, "savedAt" | "author" | "id">): string {
  const author = (f.author ?? "").replace(/^@/, "").replace(/[^\w.-]+/g, "");
  return author ? `${f.savedAt}-${author}-${f.id}` : `${f.savedAt}-${f.id}`;
}

export const wikilink = (target: string, alias?: string): string => (alias ? `[[${target}|${alias}]]` : `[[${target}]]`);

/** Extrae el destino de un wikilink `[[Destino|alias]]` (o devuelve el texto tal cual). */
export function unwikilink(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.match(/^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
  return (m ? m[1] : v).trim() || undefined;
}

/** Convierte un valor de frontmatter a fecha AAAA-MM-DD (YAML puede devolver Date). */
export function asDate(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "string" && v ? v.slice(0, 10) : undefined;
}

/** Reemplaza la zona automática de un cuerpo Markdown, conservando todo lo demás. */
export function replaceAutoZone(body: string | undefined, auto: string): string {
  const block = `${AUTO_START}\n${auto.trim()}\n${AUTO_END}`;
  if (body === undefined || !body.trim()) return `${block}\n\n${USER_ZONE}`;
  const start = body.indexOf(AUTO_START);
  const end = body.indexOf(AUTO_END);
  if (start !== -1 && end > start) {
    return body.slice(0, start) + block + body.slice(end + AUTO_END.length);
  }
  // Nota creada a mano sin zona automática: se antepone y se respeta su contenido.
  return `${block}\n\n${body.replace(/^\n+/, "")}`;
}

/** Contenido de la zona automática (o todo el cuerpo si no tiene marcadores). */
export function autoZone(body: string): string {
  const start = body.indexOf(AUTO_START);
  const end = body.indexOf(AUTO_END);
  return start !== -1 && end > start ? body.slice(start + AUTO_START.length, end).trim() : body.trim();
}

/** Arma el archivo final: frontmatter fusionado (claves del usuario conservadas) + cuerpo. */
function compose(existing: string | undefined, data: Record<string, unknown>, auto: string): string {
  const prev = existing ? matter(existing) : undefined;
  const merged = { ...(prev?.data ?? {}), ...stripUndefined(data) };
  return matter.stringify(replaceAutoZone(prev?.content, auto), merged);
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const bullets = (items: string[]): string => items.map((i) => `- ${i}`).join("\n");
const numbered = (items: string[]): string => items.map((i, n) => `${n + 1}. ${i}`).join("\n");
const callout = (kind: string, title: string, text: string, folded = false): string =>
  `> [!${kind}]${folded ? "-" : ""} ${title}\n` + text.trim().split("\n").map((l) => `> ${l}`).join("\n");

function section(title: string, content: string): string {
  return content.trim() ? `## ${title}\n\n${content.trim()}` : "";
}

/** URL utilizable en un link: solo http(s) absoluta (el modelo a veces devuelve "/" o texto). */
export function safeUrl(url: string | null | undefined): string | undefined {
  const u = url?.trim();
  return u && /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u) ? u : undefined;
}

const KIND_LABEL: Record<Ficha["kind"], string> = { reel: "reel", post: "post", carrusel: "carrusel", manual: "capturas" };

/** Zona automática de una ficha. */
export function renderFichaAuto(f: Ficha, topic: string, secondary: string[]): string {
  const e = f.extraction;
  const origin = [
    f.author,
    KIND_LABEL[f.kind],
    f.publishedAt ? `publicado ${f.publishedAt}` : undefined,
    f.url ? `[ver en Instagram](${f.url})` : undefined,
  ].filter(Boolean).join(" · ");
  const topics = `Tema: ${wikilink(topic)}` + (secondary.length ? ` · También en: ${secondary.map((s) => wikilink(s)).join(", ")}` : "");

  const tools = e.tools
    .map((t) => `- **${t.name}**${t.purpose ? ` — ${t.purpose}` : ""}${safeUrl(t.url) ? ` ([link](${safeUrl(t.url)}))` : ""}`)
    .join("\n");
  const comments = [
    bullets(e.fromComments),
    e.audienceQuestions.length ? `**Preguntas de la audiencia**\n\n${bullets(e.audienceQuestions)}` : "",
  ].filter(Boolean).join("\n\n");

  const label = f.kind === "reel" ? "Cuadro" : "Imagen";
  const imageTexts = (e.imageTexts ?? [])
    .filter((t) => t.text.trim())
    // Un ">" al inicio de línea se escapa para no anidar citas dentro del callout.
    .map((t) => `**${label} ${t.image}**\n${t.text.trim().replace(/^(\s*)>/gm, "$1\\>")}`)
    .join("\n\n");

  return [
    `# ${e.title}`,
    f.thumbnail ? `![[${f.thumbnail}|320]]` : "",
    callout("info", "Origen", `${topics}\n${origin}`),
    f.partial ? callout("warning", "Contenido parcial", "No se pudo descargar todo el post. Complementa con capturas.") : "",
    f.notes.length ? callout("note", "Tu nota", f.notes.join("\n")) : "",
    section("Qué es", e.summary),
    section("Ideas clave", bullets(e.keyIdeas)),
    section("Herramientas", tools),
    section("Pasos", numbered(e.steps)),
    section("Recursos", bullets(e.resources)),
    section("De los comentarios", comments),
    f.gallery?.length
      ? callout("example", `Imágenes (${f.gallery.length})`, f.gallery.map((g) => `![[${g}|240]]`).join(" "), true)
      : "",
    imageTexts ? callout("quote", "Texto de las imágenes", imageTexts, true) : "",
    f.caption.trim() ? callout("quote", "Caption original", f.caption, true) : "",
    f.transcript?.trim() ? callout("quote", "Transcripción", f.transcript, true) : "",
  ].filter(Boolean).join("\n\n");
}

/** Archivo completo de una ficha, fusionado con su versión anterior si existe. */
export function renderFicha(f: Ficha, topic: string, secondary: string[], existing?: string): string {
  const e = f.extraction;
  const data = {
    titulo: e.title,
    tipo: f.kind,
    autor: f.author,
    url: f.url,
    id: f.id,
    publicado: f.publishedAt,
    guardado: f.savedAt,
    tema: wikilink(topic),
    temas_secundarios: secondary.map((s) => wikilink(s)),
    herramientas: e.tools.map((t) => t.name),
    tags: ["kb/fuente", ...e.tags.map((t) => t.replace(/^#/, ""))],
    idioma: e.language,
    confianza: e.confidence,
    parcial: f.partial,
    notas: f.notes.length ? f.notes : undefined,
  };
  return compose(existing, data, renderFichaAuto(f, topic, secondary));
}

/** Resumen de una fuente para la lista "Fuentes" de un tema. */
export interface SourceRef {
  baseName: string;
  title: string;
  author?: string;
  savedAt?: string;
}

/** Archivo completo de una página de tema, fusionado con su versión anterior si existe. */
export function renderTopic(
  name: string,
  s: TopicSynthesis,
  sources: SourceRef[],
  today: string,
  existing?: string,
): string {
  const tools = s.tools.map((t) => `- **${t.name}**${t.purpose ? ` — ${t.purpose}` : ""}`).join("\n");
  const refs = sources
    .map((r) => `- ${wikilink(r.baseName, r.title)}${r.author ? ` — ${r.author}` : ""}${r.savedAt ? ` · ${r.savedAt}` : ""}`)
    .join("\n");
  const auto = [
    `# ${name}`,
    s.description ? `> ${s.description}` : "",
    section("Lo esencial", bullets(s.essentials)),
    section("Herramientas mencionadas", tools),
    section("Técnicas", bullets(s.techniques)),
    section("Preguntas frecuentes", bullets(s.questions)),
    section(`Fuentes (${sources.length})`, refs),
  ].filter(Boolean).join("\n\n");
  const data = { tags: ["kb/tema"], descripcion: s.description, fuentes: sources.length, actualizado: today };
  return compose(existing, data, auto);
}

/**
 * Texto compacto de una ficha para sintetizar su tema: zona automática sin
 * embeds de imagen ni los bloques largos (caption/transcripción), recortado.
 */
export function fichaDigest(body: string, maxChars = 2500): string {
  return autoZone(body)
    .replace(/^!\[\[.*\]\]$/gm, "")
    // Galería de imágenes (callout "example").
    .replace(/^> \[!example\].*(?:\n>.*)*/gm, "")
    // Callouts de cita completos (encabezado + todas sus líneas "> …").
    .replace(/^> \[!quote\].*(?:\n>.*)*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}
