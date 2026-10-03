import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { openDb } from "./db.ts";
import { asDate, unwikilink } from "./markdown.ts";
import { kbDir, temasDir } from "./store.ts";

/**
 * Investigación semanal: un agente de Claude en la nube investiga los temas de la
 * base y escribe notas en referencias/, un bloque kb:research en cada tema y un
 * resumen en _investigacion/resumenes/. El bot solo LEE estas zonas: las indexa
 * para las consultas, reenvía los resúmenes y avisa si la investigación deja de correr.
 */

export const RESEARCH_START = "<!-- kb:research:start -->";
export const RESEARCH_END = "<!-- kb:research:end -->";

export const referenciasDir = (): string => join(kbDir(), "referencias");
export const investigacionDir = (): string => join(kbDir(), "_investigacion");
export const resumenesDir = (): string => join(investigacionDir(), "resumenes");
export const registroPath = (): string => join(investigacionDir(), "registro.md");

/** Días sin investigación antes de avisar. */
export const SILENCE_DAYS = 8;

/** Contenido del bloque kb:research de un tema, o undefined si no hay (o está vacío). Función pura. */
export function researchBlock(body: string): string | undefined {
  const start = body.indexOf(RESEARCH_START);
  const end = body.indexOf(RESEARCH_END);
  if (start === -1 || end <= start) return undefined;
  return body.slice(start + RESEARCH_START.length, end).trim() || undefined;
}

/** Fecha "_Revisado AAAA-MM-DD_" de un bloque de investigación. Función pura. */
export function reviewedDate(block: string): string | undefined {
  return block.match(/_Revisado (\d{4}-\d{2}-\d{2})_/)?.[1];
}

const REGISTRO_LINE = /^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s+·/;

/** Registro de corridas → última fecha de investigación por tema. Función pura. */
export function parseRegistro(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.match(REGISTRO_LINE);
    if (m && (out.get(m[2]) ?? "") < m[1]) out.set(m[2], m[1]);
  }
  return out;
}

/** Aviso si la investigación no corre hace más de SILENCE_DAYS. Sin registro (o vacío): nada. Función pura. */
export function silenceAlert(registroText: string | undefined, today: string): { since: string; text: string } | undefined {
  if (registroText === undefined) return undefined;
  const since = [...parseRegistro(registroText).values()].sort().pop();
  if (!since) return undefined;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000);
  if (days <= SILENCE_DAYS) return undefined;
  return {
    since,
    text: `⚠️ La investigación semanal no corre desde el ${since} (${days} días). Revisa la tarea programada en claude.ai.`,
  };
}

/** Nombre de un resumen: AAAA-MM-DD.md, o AAAA-MM-DD-N.md si ese día hubo otra corrida. */
const SUMMARY_NAME = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/;

/** Orden cronológico de resúmenes (por fecha y luego por número de corrida). */
const summaryKey = (f: string): string => {
  const m = f.match(SUMMARY_NAME)!;
  return `${m[1]}-${(m[2] ?? "1").padStart(4, "0")}`;
};

/** Resúmenes que todavía no se reenviaron, en orden cronológico. Función pura. */
export function pendingSummaries(files: string[], notified: Set<string>): string[] {
  return files
    .filter((f) => SUMMARY_NAME.test(f) && !notified.has(f))
    .sort((a, b) => summaryKey(a).localeCompare(summaryKey(b)));
}

/** Texto de un resumen sin frontmatter; vacío → undefined. Función pura. */
export function summaryText(raw: string): string | undefined {
  return matter(raw).content.trim() || undefined;
}

export interface ReferenceNote {
  path: string;
  baseName: string;
  title: string;
  tipo?: string;
  reviewed?: string;
  topics: string[];
  raw: string;
  body: string;
}

/** Lee una nota de referencia (escrita por el agente o editada en Obsidian). Función pura. */
export function parseReferencia(path: string, raw: string): ReferenceNote {
  const { data, content } = matter(raw);
  const baseName = basename(path, ".md");
  return {
    path,
    baseName,
    title: typeof data.nombre === "string" && data.nombre.trim() ? data.nombre.trim() : baseName,
    tipo: typeof data.tipo === "string" ? data.tipo : undefined,
    reviewed: asDate(data.revisado),
    topics: Array.isArray(data.temas) ? data.temas.map(unwikilink).filter((t): t is string => !!t) : [],
    raw,
    body: content.trim(),
  };
}

async function mdFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
}

export async function listReferencias(): Promise<ReferenceNote[]> {
  const out: ReferenceNote[] = [];
  for (const f of await mdFiles(referenciasDir())) {
    const path = join(referenciasDir(), f);
    out.push(parseReferencia(path, await readFile(path, "utf8")));
  }
  return out;
}

export interface ResearchBlock {
  topic: string;
  path: string;
  reviewed?: string;
  block: string;
}

/** Bloques kb:research de los temas que tienen uno. */
export async function listResearchBlocks(): Promise<ResearchBlock[]> {
  const out: ResearchBlock[] = [];
  for (const f of await mdFiles(temasDir())) {
    const path = join(temasDir(), f);
    const block = researchBlock(matter(await readFile(path, "utf8")).content);
    if (block) out.push({ topic: basename(f, ".md"), path, reviewed: reviewedDate(block), block });
  }
  return out;
}

function notifiedDb(): ReturnType<typeof openDb> {
  const db = openDb();
  db.exec("CREATE TABLE IF NOT EXISTS research_notified (name TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')))");
  return db;
}

/**
 * Resúmenes por reenviar por Telegram. No los marca: el bot marca cada uno con
 * markSummaryNotified recién cuando el envío funcionó (si falla, se reintenta en la
 * próxima sincronización). Con la tabla vacía (índice nuevo o recién borrado) se
 * marcan todos sin devolverlos: no se reenvía el historial. Los vacíos se marcan y se omiten.
 */
export async function newSummaries(): Promise<{ name: string; text: string }[]> {
  const db = notifiedDb();
  const files = await mdFiles(resumenesDir());
  const notified = new Set((db.prepare("SELECT name FROM research_notified").all() as { name: string }[]).map((r) => r.name));
  const firstTime = notified.size === 0;
  const out: { name: string; text: string }[] = [];
  for (const name of pendingSummaries(files, notified)) {
    if (firstTime) {
      markSummaryNotified(name);
      continue;
    }
    const text = summaryText(await readFile(join(resumenesDir(), name), "utf8"));
    if (text) out.push({ name, text });
    else {
      console.warn(`⚠️  Resumen de investigación vacío: ${name}`);
      markSummaryNotified(name);
    }
  }
  // Base sin resúmenes todavía: se deja una marca para que el primero real sí se reenvíe.
  if (firstTime && !files.length) markSummaryNotified("(inicio)");
  return out;
}

export function markSummaryNotified(name: string): void {
  notifiedDb().prepare("INSERT OR IGNORE INTO research_notified (name) VALUES (?)").run(name);
}
