import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { kbDir } from "./store.ts";

/**
 * Índice SQLite de la base (node:sqlite, sin dependencias nativas). Es DERIVADO:
 * todo se reconstruye desde el Markdown con `npm run kb:reindex`, así que se
 * puede borrar sin perder nada. Vive en `<base>/.index/` (Obsidian ignora las
 * carpetas con punto y la carpeta lleva su propio .gitignore).
 */

/** Versión del esquema: si cambia, el índice se recrea desde cero. */
const SCHEMA_VERSION = 1;

export const indexDir = (): string => join(kbDir(), ".index");

let db: DatabaseSync | null = null;
let openedFor: string | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  base_name TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  url TEXT,
  topic TEXT,
  saved_at TEXT,
  published_at TEXT,
  kind TEXT,
  hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  post_id TEXT NOT NULL,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB
);
CREATE INDEX IF NOT EXISTS chunks_post ON chunks(post_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS embedding_cache (
  key TEXT PRIMARY KEY,
  vector BLOB NOT NULL
);
-- Tablas del calendario: NO son derivables del Markdown, por eso no dependen de
-- SCHEMA_VERSION (subirla borra tablas) y solo se crean si faltan.
CREATE TABLE IF NOT EXISTS insights (
  media_id TEXT NOT NULL, ventana TEXT NOT NULL, tomada_en TEXT NOT NULL,
  reach INTEGER, saved INTEGER, shares INTEGER, likes INTEGER, comments INTEGER, views INTEGER,
  avg_watch_ms INTEGER, total_watch_ms INTEGER,
  PRIMARY KEY (media_id, ventana)
);
CREATE TABLE IF NOT EXISTS publicaciones (
  pieza_id TEXT NOT NULL, tipo TEXT NOT NULL, -- 'post' | 'story'
  paso TEXT NOT NULL, container_id TEXT, children TEXT, media_id TEXT,
  intentos INTEGER NOT NULL DEFAULT 0, actualizado TEXT NOT NULL, error TEXT,
  PRIMARY KEY (pieza_id, tipo)
);
CREATE TABLE IF NOT EXISTS calendario_estado (
  clave TEXT PRIMARY KEY, valor TEXT NOT NULL
);
`;

/** Abre (o crea) el índice de la base actual (KB_DIR). */
export function openDb(): DatabaseSync {
  const dir = indexDir();
  if (db && openedFor === dir) return db;
  db?.close();
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Índice derivado (npm run kb:reindex lo reconstruye).\n*\n", "utf8");
  db = new DatabaseSync(join(dir, "kb.sqlite"));
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version !== SCHEMA_VERSION) {
    db.exec("DROP TABLE IF EXISTS posts; DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS chunks_fts;");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  db.exec(SCHEMA);
  openedFor = dir;
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
  openedFor = null;
}

/** Float32Array ⇄ BLOB. */
export const toBlob = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
export const fromBlob = (b: Uint8Array): Float32Array =>
  new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
