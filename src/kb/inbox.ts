import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { openDb } from "./db.ts";
import { findInstagramUrls } from "./shortcode.ts";

/**
 * Receptor de webhooks de Meta para los DMs de la cuenta de Instagram: cuando
 * alguien autorizado le comparte un post a @ia.punto.es, se encola un guardado
 * en la base (el mismo worker del bot de Telegram lo procesa y responde por DM).
 *
 *   GET  /webhook  → verificación (hub.challenge) al configurar el webhook en Meta.
 *   POST /webhook  → valida X-Hub-Signature-256, responde 200 al instante y encola.
 */

/** Adjunto de un DM, normalizado (los nombres de tipo varían entre versiones de la API). */
export interface DmAttachment {
  type: string;
  url?: string;
  title?: string;
  /** Id del reel/media compartido, si viene (sirve de id estable de la ficha). */
  mediaId?: string;
}

export interface DmEvent {
  mid: string;
  senderId: string;
  timestamp?: number;
  text?: string;
  attachments: DmAttachment[];
}

/** Qué hacer con un DM. */
export type DmAction =
  | { kind: "save-media"; videoUrl?: string; mediaUrls: string[]; caption?: string; sourceId: string }
  | { kind: "save-link"; urls: string[]; text: string; caption?: string }
  | { kind: "question"; text: string }
  | { kind: "unsupported"; reason: string };

/** Firma de Meta: "sha256=" + HMAC-SHA256 del body CRUDO con el app secret. Comparación en tiempo constante. */
export function validSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const got = Buffer.from(header.slice("sha256=".length));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * Eventos de mensaje de un webhook `object: "instagram"`. Función pura (testeable).
 * Ignora ecos (mensajes que envía la propia cuenta, incluidas sus respuestas),
 * lecturas, reacciones y eventos sin `mid`.
 */
export function parseWebhook(body: unknown): DmEvent[] {
  const b = body as { object?: string; entry?: { messaging?: unknown[] }[] };
  if (b?.object !== "instagram") return [];
  const out: DmEvent[] = [];
  for (const entry of b.entry ?? []) {
    for (const raw of entry.messaging ?? []) {
      const ev = raw as {
        sender?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: unknown[] };
      };
      const m = ev.message;
      if (!m?.mid || m.is_echo || m.is_deleted || !ev.sender?.id) continue;
      const attachments = (m.attachments ?? []).map((a) => {
        const at = a as { type?: string; payload?: Record<string, unknown> };
        const p = at.payload ?? {};
        return {
          type: at.type ?? "unknown",
          url: str(p.url),
          title: str(p.title),
          mediaId: str(p.reel_video_id) ?? str(p.ig_post_media_id) ?? str(p.media_id) ?? str(p.id),
        };
      });
      out.push({ mid: m.mid, senderId: ev.sender.id, timestamp: ev.timestamp, text: str(m.text), attachments });
    }
  }
  return out;
}

const VIDEO_TYPES = new Set(["ig_reel", "reel", "video", "clip"]);
const IMAGE_TYPES = new Set(["share", "ig_post", "image", "media_share", "post"]);

/**
 * Decide qué hacer con un DM. Función pura (testeable).
 * Formato real (verificado con un reel compartido, 2026-09): el adjunto `ig_reel`
 * trae en `url` el LINK del post (instagram.com/reel/…), su caption en `title` y
 * `reel_video_id`, pero no la cuenta dueña ni el video: se trata como un link
 * (Business Discovery, que necesita el @). Si algún adjunto trae la media directa
 * (URL de CDN), se usa tal cual.
 */
export function dmAction(ev: DmEvent): DmAction {
  const permalinks = ev.attachments.filter((a) => a.url && findInstagramUrls(a.url).length);
  if (permalinks.length) {
    return {
      kind: "save-link",
      urls: permalinks.map((a) => findInstagramUrls(a.url!)[0]),
      text: ev.text ?? "",
      caption: permalinks.map((a) => a.title).find(Boolean),
    };
  }
  const shared = ev.attachments.filter((a) => a.url && (VIDEO_TYPES.has(a.type) || IMAGE_TYPES.has(a.type)));
  if (shared.length) {
    const video = shared.find((a) => VIDEO_TYPES.has(a.type));
    const images = shared.filter((a) => IMAGE_TYPES.has(a.type)).map((a) => a.url!);
    const caption = shared.map((a) => a.title).find(Boolean) ?? ev.text;
    const sourceId = shared.map((a) => a.mediaId).find(Boolean) ?? ev.mid;
    return { kind: "save-media", videoUrl: video?.url, mediaUrls: images, caption, sourceId };
  }
  if (ev.text) {
    const urls = findInstagramUrls(ev.text);
    return urls.length ? { kind: "save-link", urls, text: ev.text } : { kind: "question", text: ev.text };
  }
  const types = ev.attachments.map((a) => a.type).join(", ") || "sin adjuntos";
  return { kind: "unsupported", reason: `no sé leer ese tipo de mensaje (${types})` };
}

/** ¿Ya se procesó este mensaje? (Meta reintenta webhooks: idempotencia por mid). Lo marca si no. */
export function firstTime(mid: string): boolean {
  const db = openDb();
  db.exec("CREATE TABLE IF NOT EXISTS inbox_seen (mid TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')))");
  return Number(db.prepare("INSERT OR IGNORE INTO inbox_seen (mid) VALUES (?)").run(mid).changes) === 1;
}

const RAW_DIR = join(process.cwd(), ".cache", "kb", "inbox-raw");
/** Payloads crudos que se conservan con --debug-payload (para ajustar el lector a los reales). */
const MAX_RAW = 50;

async function saveRaw(raw: Buffer): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(join(RAW_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`), raw);
  const files = (await readdir(RAW_DIR)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - MAX_RAW))) await rm(join(RAW_DIR, f), { force: true });
}

export interface InboxOptions {
  port: number;
  verifyToken: string;
  appSecret: string;
  /** Guardar cada payload crudo en .cache/kb/inbox-raw/ (spike). */
  debugPayload?: boolean;
  onEvent: (ev: DmEvent) => void;
}

/** Levanta el servidor HTTP del webhook (node:http, sin dependencias). */
export function startInbox(opts: InboxOptions): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/webhook") {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "GET") {
      // Verificación al suscribir el webhook en el panel de Meta.
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === opts.verifyToken;
      if (ok) console.log("✓ Webhook verificado por Meta.");
      res.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" }).end(ok ? (url.searchParams.get("hub.challenge") ?? "") : "");
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      if (!validSignature(raw, req.headers["x-hub-signature-256"] as string | undefined, opts.appSecret)) {
        console.warn("🚫 Webhook con firma inválida: ignorado.");
        res.writeHead(401).end();
        return;
      }
      // Meta exige respuesta rápida: el trabajo pesado va a la cola.
      res.writeHead(200).end("ok");
      if (opts.debugPayload) void saveRaw(raw).catch(() => {});
      try {
        for (const ev of parseWebhook(JSON.parse(raw.toString("utf8")))) {
          if (firstTime(ev.mid)) opts.onEvent(ev);
        }
      } catch (err) {
        console.warn(`⚠️  Webhook ilegible: ${err instanceof Error ? err.message : err}`);
      }
    });
  });
  server.listen(opts.port, () => console.log(`📬 Webhook de Instagram escuchando en http://localhost:${opts.port}/webhook`));
  return server;
}
