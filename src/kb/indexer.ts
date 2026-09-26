import { createHash } from "node:crypto";
import matter from "gray-matter";
import { openDb, toBlob } from "./db.ts";
import { embedTexts } from "./embed.ts";
import { AUTO_END, AUTO_START } from "./markdown.ts";
import { listFichas, type StoredFicha } from "./store.ts";

/**
 * Indexación: cada ficha se parte en trozos por sección (Qué es, Ideas clave,
 * texto de imágenes, transcripción, Mis notas…), que van a FTS5 (búsqueda por
 * palabras) y a embeddings (búsqueda por significado).
 */

/** Tamaño máximo de un trozo (caracteres). */
const MAX_CHUNK_CHARS = 1200;

/** Callouts que no aportan a la búsqueda (metadatos y galería). */
const SKIP_CALLOUTS = new Set(["info", "example", "warning"]);

export interface Chunk {
  section: string;
  text: string;
}

/** Parte un texto largo en trozos ≤ max, respetando párrafos y luego líneas. */
export function splitText(text: string, max = MAX_CHUNK_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const para of text.split(/\n{2,}/)) {
    const pieces = para.length <= max ? [para] : para.split("\n").flatMap((l) => (l.length <= max ? [l] : l.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? []));
    for (const p of pieces) {
      if (cur && cur.length + p.length + 2 > max) push();
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  push();
  return out;
}

/**
 * Trozos de una ficha (cuerpo sin frontmatter). Función pura (testeable): lee
 * las secciones "## …" y los callouts "> [!quote]- …" de la zona automática, y
 * la zona del usuario como "Mis notas".
 */
export function chunkFicha(body: string): Chunk[] {
  const start = body.indexOf(AUTO_START);
  const end = body.indexOf(AUTO_END);
  const auto = start !== -1 && end > start ? body.slice(start + AUTO_START.length, end) : body;
  const user = start !== -1 && end > start ? body.slice(end + AUTO_END.length) : "";

  const sections: Chunk[] = [];
  // Estado del recorrido en un objeto (TS no sigue asignaciones hechas dentro de closures).
  const st: { current: Chunk | null; skipping: boolean; inCallout: boolean } = { current: null, skipping: false, inCallout: false };
  const close = () => {
    if (st.current?.text.trim()) sections.push(st.current);
    st.current = null;
  };
  for (const line of auto.split("\n")) {
    const heading = line.match(/^##\s+(.+)$/);
    const callout = line.match(/^>\s*\[!(\w+)\][-+]?\s*(.*)$/);
    if (st.inCallout && line.trim() && !line.startsWith(">") && !heading) {
      // Terminó el callout sin un encabezado nuevo: el texto que sigue no es parte de él.
      close();
      st.inCallout = false;
    }
    if (heading) {
      close();
      st.inCallout = false;
      st.skipping = false;
      st.current = { section: heading[1].trim(), text: "" };
    } else if (callout) {
      close();
      st.inCallout = true;
      st.skipping = SKIP_CALLOUTS.has(callout[1].toLowerCase());
      if (!st.skipping) st.current = { section: callout[2].trim() || callout[1], text: "" };
    } else if (/^#\s/.test(line) || /^!\[\[/.test(line)) {
      continue;
    } else if (!st.skipping && st.current) {
      st.current.text += `${line.replace(/^>\s?/, "")}\n`;
    }
  }
  close();

  const notes = user.replace(/^\s*##\s+Mis notas\s*$/m, "").trim();
  if (notes) sections.push({ section: "Mis notas", text: notes });

  return sections.flatMap((s) => splitText(s.text.trim()).map((text) => ({ section: s.section, text })));
}

const hashOf = (raw: string): string => createHash("sha256").update(raw).digest("hex");

/** Texto que se indexa/embebe de un trozo: con título y sección para dar contexto. */
const contextual = (title: string, c: Chunk): string => `${title} · ${c.section}\n${c.text}`;

/** Indexa (o reindexa) una ficha. Si no cambió desde la última vez, no hace nada. */
export async function indexFicha(f: StoredFicha, force = false): Promise<boolean> {
  if (!f.id) return false;
  const db = openDb();
  const hash = hashOf(f.raw);
  const prev = db.prepare("SELECT hash FROM posts WHERE id = ?").get(f.id) as { hash: string } | undefined;
  if (!force && prev?.hash === hash) return false;

  const chunks = chunkFicha(f.body);
  const vectors = await embedTexts(chunks.map((c) => contextual(f.title, c)));
  const { data } = matter(f.raw);

  db.exec("BEGIN");
  try {
    removePost(f.id);
    db.prepare(
      `INSERT INTO posts (id, path, base_name, title, author, url, topic, saved_at, published_at, kind, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      f.id, f.path, f.baseName, f.title, f.author ?? null, typeof data.url === "string" ? data.url : null,
      f.topic ?? null, f.savedAt ?? null, typeof data.publicado === "string" ? data.publicado : null,
      typeof data.tipo === "string" ? data.tipo : null, hash,
    );
    const insChunk = db.prepare("INSERT INTO chunks (post_id, section, text, embedding) VALUES (?, ?, ?, ?)");
    const insFts = db.prepare("INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)");
    chunks.forEach((c, i) => {
      const { lastInsertRowid } = insChunk.run(f.id!, c.section, c.text, toBlob(vectors[i]));
      insFts.run(lastInsertRowid, contextual(f.title, c));
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

/** Quita un post del índice (fila, trozos y texto FTS). */
export function removePost(id: string): void {
  const db = openDb();
  const ids = db.prepare("SELECT id FROM chunks WHERE post_id = ?").all(id) as { id: number }[];
  const delFts = db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
  for (const { id: rowid } of ids) delFts.run(rowid);
  db.prepare("DELETE FROM chunks WHERE post_id = ?").run(id);
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
}

/**
 * Sincroniza el índice con el Markdown: indexa fichas nuevas o cambiadas y quita
 * las que ya no existen. Con `full`, reindexa todo (los embeddings salen de caché).
 */
export async function reindex(full = false): Promise<{ indexed: number; removed: number; total: number }> {
  const db = openDb();
  const fichas = (await listFichas()).filter((f) => f.id);
  let indexed = 0;
  for (const f of fichas) if (await indexFicha(f, full)) indexed++;
  const alive = new Set(fichas.map((f) => f.id!));
  const stale = (db.prepare("SELECT id FROM posts").all() as { id: string }[]).filter((r) => !alive.has(r.id));
  for (const r of stale) removePost(r.id);
  return { indexed, removed: stale.length, total: fichas.length };
}
