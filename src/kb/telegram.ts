import { costLine } from "./costs.ts";
import { isResearch, researchNote, type Answer } from "./ask.ts";
import type { StoredFicha } from "./store.ts";
import type { AddResult } from "./types.ts";

/**
 * Formato de los mensajes del bot (HTML de Telegram). Funciones puras: se
 * testean sin red ni Telegram.
 */

/** Límite de Telegram por mensaje (4096) con margen para etiquetas HTML. */
export const MAX_MESSAGE_CHARS = 4000;

export const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Markdown simple de las respuestas del modelo → HTML de Telegram (negritas y encabezados). */
export function mdToTelegramHtml(md: string): string {
  return escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
}

/** Parte un texto en mensajes ≤ max: por párrafos, luego por líneas, luego a la fuerza. */
export function splitMessage(text: string, max = MAX_MESSAGE_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  const add = (piece: string, sep: string) => {
    if (cur && cur.length + sep.length + piece.length > max) flush();
    cur = cur ? cur + sep + piece : piece;
  };
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= max) add(para, "\n\n");
    else {
      for (const line of para.split("\n")) {
        if (line.length <= max) add(line, "\n");
        else for (let i = 0; i < line.length; i += max) add(line.slice(i, i + max), "");
      }
    }
  }
  flush();
  return out.length ? out : [""];
}

const bullets = (items: string[], n: number): string => items.slice(0, n).map((i) => `• ${escapeHtml(i)}`).join("\n");

/** Ficha resumida que el bot responde al terminar un guardado. */
export function formatSaved(r: AddResult, related: Pick<StoredFicha, "title" | "baseName">[] = []): string {
  const e = r.ficha.extraction;
  const lines: string[] = [
    `✅ <b>${r.created ? "Guardado" : "Actualizado"}:</b> ${escapeHtml(e.title)}`,
    `🗂 Tema: <b>${escapeHtml(r.topicsUpdated[0] ?? e.mainTopic)}</b>${r.newTopic ? " (nuevo)" : ""}`,
    "",
    escapeHtml(e.summary),
  ];
  if (e.keyIdeas.length) lines.push("", `💡 <b>Ideas clave</b>\n${bullets(e.keyIdeas, 4)}`);
  if (e.tools.length) lines.push("", `🧰 <b>Herramientas:</b> ${e.tools.map((t) => escapeHtml(t.name)).join(" · ")}`);
  if (related.length) lines.push("", `🔗 <b>Relacionados</b>\n${related.slice(0, 3).map((f) => `• ${escapeHtml(f.title)}`).join("\n")}`);
  if (r.ficha.partial) lines.push("", "⚠️ No pude descargar todo el post. Mándame capturas y las sumo a esta ficha.");
  const cost = costLine(r.costUsd, r.model, r.fallback);
  if (cost) lines.push("", `<i>${escapeHtml(cost)}</i>`);
  return lines.join("\n");
}

/** Respuesta a una pregunta, con las fuentes citadas como links. */
export function formatAnswer(a: Answer): string {
  const note = researchNote(a);
  const parts = [mdToTelegramHtml(a.answer), ...(note ? [escapeHtml(note)] : [])];
  if (a.sources.length) {
    const src = a.sources.map((s) => {
      if (isResearch(s)) return `[${s.n}] 🔎 ${escapeHtml(s.title)}${s.savedAt ? ` — investigado ${escapeHtml(s.savedAt)}` : ""}`;
      const title = escapeHtml(s.title);
      const linked = s.url ? `<a href="${escapeHtml(s.url)}">${title}</a>` : title;
      const meta = [s.author, s.savedAt].filter(Boolean).map((x) => escapeHtml(x!)).join(" · ");
      return `[${s.n}] ${linked}${meta ? ` — ${meta}` : ""}`;
    });
    parts.push(`📚 <b>Fuentes</b>\n${src.join("\n")}`);
  }
  const cost = costLine(a.costUsd, a.model, a.fallback);
  if (cost) parts.push(`<i>${escapeHtml(cost)}</i>`);
  return parts.join("\n\n");
}

/** Ficha resumida en texto plano (los DMs de Instagram no admiten HTML). */
export function formatSavedText(r: AddResult): string {
  const e = r.ficha.extraction;
  const lines = [
    `✅ ${r.created ? "Guardado" : "Actualizado"}: ${e.title}`,
    `🗂 Tema: ${r.topicsUpdated[0] ?? e.mainTopic}${r.newTopic ? " (nuevo)" : ""}`,
    "",
    e.summary,
  ];
  if (e.keyIdeas.length) lines.push("", "💡 Ideas clave", ...e.keyIdeas.slice(0, 4).map((i) => `• ${i}`));
  if (e.tools.length) lines.push("", `🧰 Herramientas: ${e.tools.map((t) => t.name).join(" · ")}`);
  if (r.ficha.partial) lines.push("", "⚠️ No pude leer todo el contenido; la ficha quedó parcial.");
  const cost = costLine(r.costUsd, r.model, r.fallback);
  if (cost) lines.push("", cost);
  return lines.join("\n");
}

/** Respuesta a una pregunta en texto plano, con las fuentes y sus links. */
export function formatAnswerText(a: Answer): string {
  const src = a.sources.map((s) =>
    isResearch(s)
      ? `[${s.n}] 🔎 ${s.title}${s.savedAt ? ` — investigado ${s.savedAt}` : ""}`
      : `[${s.n}] ${s.title}${s.url ? ` — ${s.url}` : ""}`,
  );
  return [
    a.answer.replace(/\*\*(.+?)\*\*/g, "$1"),
    researchNote(a) ?? "",
    src.length ? `📚 Fuentes\n${src.join("\n")}` : "",
    costLine(a.costUsd, a.model, a.fallback),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Lista de fichas (para /ultimos y /tema). */
export function formatFichaList(fichas: (Pick<StoredFicha, "title" | "savedAt" | "author"> & { url?: string })[]): string {
  return fichas
    .map((f) => {
      const title = escapeHtml(f.title);
      const linked = f.url ? `<a href="${escapeHtml(f.url)}">${title}</a>` : title;
      const meta = [f.author, f.savedAt].filter(Boolean).map((x) => escapeHtml(x!)).join(" · ");
      return `• ${linked}${meta ? ` <i>(${meta})</i>` : ""}`;
    })
    .join("\n");
}

/** Primer @usuario mencionado en un mensaje (sin la @), o undefined. */
export function handleInText(text: string): string | undefined {
  return text.match(/(?:^|\s)@([\w.]{2,30})\b/)?.[1];
}

/** Si el mensaje es SOLO un @usuario (respuesta a "¿de qué cuenta es?"), lo devuelve sin la @. */
export function handleReply(text: string): string | undefined {
  return text.trim().match(/^@?([\w.]{2,30})$/)?.[1];
}

/** Texto del mensaje de un link compartido sin el link ni el @usuario (se guarda como nota). */
export function noteFromMessage(text: string, urls: string[], user?: string): string | undefined {
  let note = text;
  for (const u of urls) note = note.split(u).join(" ");
  if (user) note = note.split(`@${user}`).join(" ");
  note = note.replace(/\s+/g, " ").trim();
  return note.length >= 3 ? note : undefined;
}

export const HELP = [
  "<b>Knowgram</b> guarda lo que te interesa de Instagram y te lo devuelve cuando lo necesitas.",
  "",
  "📥 <b>Guardar:</b> en Instagram → Compartir → este chat. Si no me dices de qué cuenta es, te pregunto el @usuario " +
    "(también puedes mandarlo junto al link: «@cuenta https://…»). Lo que escribas además queda como nota.",
  "ℹ️ Leo los posts con la API oficial de Meta: solo cuentas Business o Creator.",
  "🖼 <b>Complementar:</b> manda capturas después del link (sueltas o en álbum) y se suman a esa ficha.",
  "❓ <b>Preguntar:</b> escribe cualquier pregunta; respondo solo con tu base y cito las fichas.",
  "",
  "/temas — tus temas",
  "/tema &lt;nombre&gt; — qué hay en un tema",
  "/ultimos — lo último que guardaste",
  "/costos — cuánto se ha gastado en la API",
].join("\n");
