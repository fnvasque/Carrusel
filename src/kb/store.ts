import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { asDate, unwikilink } from "./markdown.ts";
import type { TopicInfo } from "./types.ts";

/**
 * Acceso a la base en disco (vault de Obsidian). El Markdown es la fuente de
 * verdad: todo lo que el sistema necesita saber se lee de aquí.
 */

/** Carpeta raíz de la base. Configurable por KB_DIR (default: ./knowledge). */
export function kbDir(): string {
  return resolve(process.env.KB_DIR ?? join(process.cwd(), "knowledge"));
}

export const fuentesDir = (): string => join(kbDir(), "fuentes");
export const temasDir = (): string => join(kbDir(), "temas");
export const adjuntosDir = (): string => join(kbDir(), "_adjuntos");

/** Una ficha tal como está en disco. */
export interface StoredFicha {
  path: string;
  baseName: string;
  id?: string;
  title: string;
  author?: string;
  savedAt?: string;
  topic?: string;
  secondary: string[];
  notes: string[];
  raw: string;
  body: string;
}

async function listMd(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f));
}

/** Lee todas las fichas (orden cronológico por nombre de archivo). */
export async function listFichas(): Promise<StoredFicha[]> {
  const out: StoredFicha[] = [];
  for (const path of await listMd(fuentesDir())) {
    const raw = await readFile(path, "utf8");
    const { data, content } = matter(raw);
    const baseName = basename(path, ".md");
    out.push({
      path,
      baseName,
      id: typeof data.id === "string" ? data.id : undefined,
      title: typeof data.titulo === "string" ? data.titulo : baseName,
      author: typeof data.autor === "string" ? data.autor : undefined,
      savedAt: asDate(data.guardado),
      topic: unwikilink(data.tema),
      secondary: Array.isArray(data.temas_secundarios)
        ? data.temas_secundarios.map(unwikilink).filter((t): t is string => !!t)
        : [],
      notes: Array.isArray(data.notas) ? data.notas.filter((n): n is string => typeof n === "string") : [],
      raw,
      body: content,
    });
  }
  return out;
}

export async function findFichaById(id: string): Promise<StoredFicha | undefined> {
  return (await listFichas()).find((f) => f.id === id);
}

/** Temas existentes (nombre = nombre de archivo) con su descripción. */
export async function listTopics(): Promise<TopicInfo[]> {
  const out: TopicInfo[] = [];
  for (const path of await listMd(temasDir())) {
    const { data } = matter(await readFile(path, "utf8"));
    out.push({ name: basename(path, ".md"), description: typeof data.descripcion === "string" ? data.descripcion : "" });
  }
  return out;
}

export const topicPath = (name: string): string => join(temasDir(), `${name}.md`);

export async function readIfExists(path: string): Promise<string | undefined> {
  return existsSync(path) ? readFile(path, "utf8") : undefined;
}

export async function writeNote(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

// --- git ---

/** Ruta real (resuelve enlaces como /var → /private/var en macOS), para compararla con la raíz que da git. */
const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

function git(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolveP) => {
    const proc = spawn("git", args, { cwd });
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { out += d.toString(); });
    proc.on("error", () => resolveP({ code: -1, out }));
    proc.on("close", (code) => resolveP({ code: code ?? -1, out }));
  });
}

/**
 * Commitea SOLO los archivos indicados (no arrastra otros cambios del repo).
 * Devuelve el hash corto, o undefined si la base no está en un repo git o no
 * había cambios. Desactivable con KB_GIT=0.
 */
export async function commitPaths(paths: string[], message: string): Promise<string | undefined> {
  if (process.env.KB_GIT === "0" || !paths.length) return undefined;
  const cwd = kbDir();
  const top = await git(["rev-parse", "--show-toplevel"], cwd);
  if (top.code !== 0) return undefined;
  const root = top.out.trim();
  const rel = paths.map((p) => relative(root, existsSync(p) ? real(p) : join(real(join(p, "..")), basename(p))));
  if ((await git(["add", "--", ...rel], root)).code !== 0) return undefined;
  const commit = await git(["commit", "-m", message, "--", ...rel], root);
  if (commit.code !== 0) return undefined;
  const head = await git(["rev-parse", "--short", "HEAD"], root);
  if (process.env.KB_GIT_PUSH === "1") await git(["push"], root);
  return head.code === 0 ? head.out.trim() : undefined;
}

// --- deshacer ---

export interface KbCommit {
  sha: string;
  subject: string;
}

/**
 * Último guardado del sistema ("kb: agrega/actualiza …") que todavía no fue
 * deshecho. Con `path`, el último que tocó esa ficha.
 */
export async function findLastSave(path?: string): Promise<KbCommit | undefined> {
  const cwd = kbDir();
  const top = await git(["rev-parse", "--show-toplevel"], cwd);
  if (top.code !== 0) return undefined;
  const root = top.out.trim();
  const log = await git(["log", "-n", "200", "--format=%H%x1f%s%x1f%b%x1e", "--", relative(root, real(path ?? cwd)) || "."], root);
  if (log.code !== 0) return undefined;
  const entries = log.out.split("\x1e").map((e) => e.trim()).filter(Boolean).map((e) => {
    const [sha, subject, body = ""] = e.split("\x1f");
    return { sha, subject, body };
  });
  // Commits ya revertidos: los "Revert" traen "This reverts commit <sha>".
  const reverted = new Set(entries.flatMap((e) => [...e.body.matchAll(/This reverts commit ([0-9a-f]{7,40})/g)].map((m) => m[1])));
  return entries
    .filter((e) => /^kb: (agrega|actualiza) /.test(e.subject) && ![...reverted].some((r) => e.sha.startsWith(r)))
    .map(({ sha, subject }) => ({ sha, subject }))[0];
}

/** Revierte un guardado. Si choca con cambios posteriores, aborta y lanza un error claro. */
export async function revertSave(c: KbCommit): Promise<string> {
  const root = (await git(["rev-parse", "--show-toplevel"], kbDir())).out.trim();
  const res = await git(["revert", "--no-edit", c.sha], root);
  if (res.code !== 0) {
    await git(["revert", "--abort"], root);
    throw new Error(
      `No pude deshacer "${c.subject}" automáticamente: cambios posteriores tocaron los mismos archivos. ` +
      `Deshaz primero los guardados más nuevos, o revierte a mano con git revert ${c.sha.slice(0, 7)}.`,
    );
  }
  return (await git(["rev-parse", "--short", "HEAD"], root)).out.trim();
}

/** Borra galerías (_adjuntos/slides/<id>) de posts que ya no tienen ficha. Devuelve cuántas. */
export async function removeOrphanGalleries(): Promise<number> {
  const dir = join(adjuntosDir(), "slides");
  if (!existsSync(dir)) return 0;
  const ids = new Set((await listFichas()).map((f) => f.id).filter(Boolean));
  let removed = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !ids.has(entry.name)) {
      await rm(join(dir, entry.name), { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}
