import { openDb } from "./db.ts";

/**
 * Cola de guardados del bot, persistida en el índice SQLite: si el bot se
 * reinicia, los trabajos pendientes (y el que estaba corriendo) se retoman.
 * Un solo worker: los commits y las páginas de tema nunca se pisan.
 */

export interface JobPayload {
  /** Origen: Telegram (default) o un DM de Instagram, que se responde por DM a `igSender`. */
  channel?: "telegram" | "instagram";
  igSender?: string;
  /** Medios que llegaron dentro de un DM (sin link): video de un reel e imágenes. */
  videoUrl?: string;
  /** Video local (p. ej. grabación de pantalla enviada por Telegram). */
  videoFile?: string;
  mediaUrls?: string[];
  sourceId?: string;
  url?: string;
  /** Cuenta dueña del post (Business Discovery). */
  user?: string;
  note?: string;
  caption?: string;
  /** Rutas locales de capturas enviadas por Telegram. */
  images?: string[];
}

export interface Job {
  id: number;
  chatId: number;
  payload: JobPayload;
  statusMsgId?: number;
}

function init(): ReturnType<typeof openDb> {
  const db = openDb();
  db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    status_msg_id INTEGER,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

export function enqueue(chatId: number, payload: JobPayload, statusMsgId?: number): number {
  const r = init()
    .prepare("INSERT INTO jobs (chat_id, payload, status_msg_id) VALUES (?, ?, ?)")
    .run(chatId, JSON.stringify(payload), statusMsgId ?? null);
  return Number(r.lastInsertRowid);
}

/** Toma el siguiente trabajo en cola y lo marca como corriendo. */
export function takeNext(): Job | undefined {
  const db = init();
  const row = db.prepare("SELECT id, chat_id, payload, status_msg_id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1").get() as
    | { id: number; chat_id: number; payload: string; status_msg_id: number | null }
    | undefined;
  if (!row) return undefined;
  db.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(row.id);
  return { id: row.id, chatId: row.chat_id, payload: JSON.parse(row.payload) as JobPayload, statusMsgId: row.status_msg_id ?? undefined };
}

export function finish(id: number, error?: string): void {
  init().prepare("UPDATE jobs SET status = ?, error = ? WHERE id = ?").run(error ? "failed" : "done", error ?? null, id);
}

/** Trabajos en cola delante de uno nuevo (para "hay N antes que este"). */
export function pendingCount(): number {
  return (init().prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued', 'running')").get() as { n: number }).n;
}

/** Al arrancar: lo que quedó "corriendo" por un corte vuelve a la cola. Devuelve cuántos. */
export function requeueInterrupted(): number {
  return Number(init().prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running'").run().changes);
}
