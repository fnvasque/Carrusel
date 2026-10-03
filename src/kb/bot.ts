import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Bot, GrammyError, InlineKeyboard, type Api } from "grammy";
import { ask } from "./ask.ts";
import { indexedHead, reindex, setIndexedHead } from "./indexer.ts";
import { topicKey } from "./markdown.ts";
import { addPost, changeTopic, synthesizeStaleTopics } from "./pipeline.ts";
import { costSummary, formatCostSummary } from "./costs.ts";
import { enqueue, finish, pendingCount, requeueInterrupted, takeNext, type Job } from "./queue.ts";
import { NeedsUserError, resolveUser } from "./instagram.ts";
import { findInstagramUrls } from "./shortcode.ts";
import {
  abortStaleRebase, findFichaById, findLastSave, kbHead, listFichas, listTopics, pullKb, readIfExists, removeOrphanGalleries, revertSave, setSyncErrorHandler,
  temasDir,
} from "./store.ts";
import { markSummaryNotified, newSummaries, registroPath, silenceAlert } from "./research.ts";
import { sendDm } from "../meta/messages.ts";
import { EXPIRY_WARN_DAYS, tokenDaysLeft } from "../meta/check.ts";
import { dmAction, startInbox, type DmEvent } from "./inbox.ts";
import { recoverMissedDms } from "./recover.ts";
import {
  escapeHtml, formatAnswer, formatAnswerText, formatFichaList, formatSaved, formatSavedText, handleInText, handleReply, HELP,
  noteFromMessage, splitMessage,
} from "./telegram.ts";
import { STAGE_LABEL } from "./types.ts";

/**
 * Bot de Telegram (long polling: no necesita URL pública; corre en el PC o en un servidor, ver deploy/).
 * Es solo otra puerta de entrada: guarda con addPost(), responde con ask() y
 * deshace con git revert, igual que la CLI.
 *
 * Si hay META_WEBHOOK_VERIFY_TOKEN, además recibe los DMs de la cuenta de
 * Instagram (webhook de Meta): un post compartido a @ia.punto.es se guarda igual
 * y la respuesta llega por DM.
 *
 *   npm run kb:bot [-- --debug-payload]
 */

try {
  process.loadEnvFile?.();
} catch {
  // sin .env: se usan las variables del entorno.
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowed = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n !== 0),
);
if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env.");
if (!allowed.size) throw new Error("Falta TELEGRAM_ALLOWED_CHAT_IDS en .env (sin él, cualquiera podría usar el bot).");

/** Ventana en que unas capturas se asocian al último link compartido. */
const LINK_WINDOW_MS = 30 * 60_000;
/** Espera tras la última foto de un álbum antes de encolar (llegan como mensajes sueltos). */
const ALBUM_DEBOUNCE_MS = 2500;
const TG_DIR = join(process.cwd(), ".cache", "kb", "telegram");

const bot = new Bot(token);

// --- estado por chat (en memoria; lo persistente está en la cola) ---
const lastLink = new Map<number, { url: string; user: string; at: number }>();
/** Links que esperan el @usuario (la API de Meta lo necesita y los links compartidos no lo traen). */
const awaitingUser = new Map<number, { urls: string[]; note?: string; options: string[] }>();
const pendingPhotos = new Map<number, { paths: string[]; caption?: string; timer?: NodeJS.Timeout }>();
/** Cambio de tema en curso: la ficha y los temas ofrecidos (por índice, por el límite de 64 bytes del callback). */
const topicChoice = new Map<number, { id: string; options: string[]; awaitingName?: boolean }>();

// --- utilidades ---

/** Serializa todo lo que escribe en la base (guardados, deshacer, cambio de tema). */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function sendLong(api: Api, chatId: number, html: string, extra: Parameters<Api["sendMessage"]>[2] = {}): Promise<void> {
  const parts = splitMessage(html);
  for (const [i, part] of parts.entries()) {
    // Los botones van en el último mensaje.
    await api.sendMessage(chatId, part, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(i === parts.length - 1 ? extra : {}) });
  }
}

async function edit(api: Api, chatId: number, msgId: number | undefined, text: string): Promise<void> {
  if (!msgId) return;
  try {
    await api.editMessageText(chatId, msgId, text, { parse_mode: "HTML" });
  } catch (err) {
    if (!(err instanceof GrammyError && /not modified/.test(err.description))) console.warn(`⚠️  edit: ${err}`);
  }
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Aviso a tus chats de Telegram (problemas del servidor que de otro modo solo quedarían en los logs). */
async function notifyAdmin(text: string): Promise<void> {
  console.warn(text);
  for (const chatId of allowed) await bot.api.sendMessage(chatId, text).catch(() => {});
}

/** Como notifyAdmin, pero dice si el mensaje llegó al menos a un chat. */
async function sendToAdmins(text: string): Promise<boolean> {
  console.log(text);
  let ok = false;
  for (const chatId of allowed) {
    try {
      await bot.api.sendMessage(chatId, text);
      ok = true;
    } catch (err) {
      console.warn(`⚠️  Telegram (${chatId}): ${errText(err)}`);
    }
  }
  return ok;
}

const savedKeyboard = (id: string) => new InlineKeyboard().text("↩️ Deshacer", `undo:${id}`).text("🏷 Cambiar tema", `topic:${id}`);

// --- worker (uno a la vez) ---

let working = false;
async function work(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (let job = takeNext(); job; job = takeNext()) await serial(() => runJob(job!));
  } finally {
    working = false;
  }
}

async function runJob(job: Job): Promise<void> {
  if (job.payload.channel === "instagram") return runDmJob(job);
  const { chatId, payload } = job;
  const api = bot.api;
  try {
    const r = await addPost({
      url: payload.url,
      user: payload.user,
      note: payload.note,
      caption: payload.caption,
      images: payload.images,
      videoFile: payload.videoFile,
      onProgress: (stage, detail) => void edit(api, chatId, job.statusMsgId, `${STAGE_LABEL[stage]}${detail ? ` <i>${escapeHtml(detail)}</i>` : ""}`),
    });
    const topic = r.topicsUpdated[0];
    const related = (await listFichas()).filter((f) => f.topic === topic && f.id !== r.ficha.id).slice(-3).reverse();
    if (job.statusMsgId) await api.deleteMessage(chatId, job.statusMsgId).catch(() => {});
    await sendLong(api, chatId, formatSaved(r, related), { reply_markup: savedKeyboard(r.ficha.id) });
    finish(job.id);
  } catch (err) {
    finish(job.id, errText(err));
    if (err instanceof NeedsUserError && payload.url) {
      // No se pudo descubrir la cuenta: se pregunta (con la respuesta, se reintenta).
      if (job.statusMsgId) await api.deleteMessage(chatId, job.statusMsgId).catch(() => {});
      return void (await askForUser(chatId, [payload.url], payload.note));
    }
    await edit(
      api,
      chatId,
      job.statusMsgId,
      `❌ No pude guardar${payload.url ? " el post" : ""}: ${escapeHtml(errText(err))}\n\n` +
        "Si la cuenta no es Business/Creator o el post es privado, mándame capturas y lo guardo desde ahí. " +
        "Si el @usuario estaba mal, vuelve a mandar el link con el @ correcto.",
    );
  } finally {
    for (const p of [...(payload.images ?? []), ...(payload.videoFile ? [payload.videoFile] : [])]) await rm(p, { force: true }).catch(() => {});
  }
}

/** Guardado pedido por DM de Instagram: sin mensajes de progreso; el resultado vuelve por DM. */
async function runDmJob(job: Job): Promise<void> {
  const p = job.payload;
  const to = p.igSender!;
  const started = Date.now();
  const secs = () => `${Math.round((Date.now() - started) / 1000)} s`;
  try {
    const r = await addPost({
      url: p.url, user: p.user, note: p.note, caption: p.caption, videoUrl: p.videoUrl, mediaUrls: p.mediaUrls, sourceId: p.sourceId,
      onProgress: (stage, detail) => console.log(`   [${secs()}] ${STAGE_LABEL[stage]}${detail ? ` ${detail}` : ""}`),
    });
    finish(job.id);
    console.log(`📬 DM guardado en ${secs()}: ${r.ficha.extraction.title}`);
    await sendDm(to, `${formatSavedText(r)}\n\n↩️ Para deshacer o cambiar el tema, usa Telegram o la terminal.`).catch(dmFailed);
  } catch (err) {
    finish(job.id, errText(err));
    if (err instanceof NeedsUserError && p.url) {
      const hinted = dmLastLink.get(to);
      if (hinted?.url === p.url && hinted.user) return; // mandaste el @ mientras buscaba: ya se encoló con él
      return void (await askDmUser(to, [p.url], p.note, p.caption));
    }
    console.warn(`⚠️  DM no guardado (${secs()}): ${errText(err)}`);
    await sendDm(to, `❌ No pude guardar el post: ${errText(err)}`).catch(dmFailed);
  }
}

/** Pregunta por DM de qué cuenta es el post (con respuestas rápidas de cuentas ya guardadas). */
async function askDmUser(to: string, urls: string[], note?: string, caption?: string): Promise<void> {
  dmAwaitingUser.set(to, { urls, note, caption, at: Date.now() });
  const recent = (await recentAuthors(12)).map((u) => `@${u}`);
  await sendDm(
    to,
    "👤 No pude descubrir de qué cuenta es este post. Respóndeme con el @usuario" + (recent.length ? " o toca una:" : ".") +
      "\n(La API de Meta necesita la cuenta, solo Business/Creator.)",
    recent,
  ).catch(dmFailed);
}

const dmFailed = (err: unknown) => console.warn(`⚠️  No pude responder por DM: ${errText(err)}`);

async function queueSave(chatId: number, payload: Job["payload"], label: string): Promise<void> {
  const ahead = pendingCount();
  const msg = await bot.api.sendMessage(chatId, `📥 ${label}${ahead ? ` <i>(hay ${ahead} antes)</i>` : ""}`, { parse_mode: "HTML" });
  enqueue(chatId, payload, msg.message_id);
  void work();
}

// --- seguridad: solo chats autorizados ---

bot.use(async (ctx, next) => {
  const id = ctx.chat?.id;
  if (id === undefined || !allowed.has(id)) {
    if (id !== undefined) console.warn(`🚫 Mensaje ignorado de chat no autorizado ${id}`);
    return;
  }
  await next();
});

// --- comandos ---

bot.command(["start", "ayuda", "help"], (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

bot.command("temas", async (ctx) => {
  const topics = await listTopics();
  if (!topics.length) return void (await ctx.reply("Todavía no tienes temas. Compárteme un post de Instagram para empezar."));
  const fichas = await listFichas();
  const count = (t: string) => fichas.filter((f) => f.topic === t || f.secondary.includes(t)).length;
  const lines = topics
    .map((t) => ({ ...t, n: count(t.name) }))
    .sort((a, b) => b.n - a.n)
    .map((t) => `• <b>${escapeHtml(t.name)}</b> (${t.n})${t.description ? `\n  <i>${escapeHtml(t.description)}</i>` : ""}`);
  await sendLong(ctx.api, ctx.chat.id, `🗂 <b>Tus temas</b>\n\n${lines.join("\n")}\n\nMira uno con /tema &lt;nombre&gt;`);
});

bot.command("tema", async (ctx) => {
  const query = ctx.match.trim();
  const topics = await listTopics();
  if (!query) return void (await ctx.reply("Uso: /tema <nombre>. Ve tus temas con /temas."));
  const key = topicKey(query);
  const t = topics.find((x) => topicKey(x.name) === key) ?? topics.find((x) => topicKey(x.name).includes(key));
  if (!t) return void (await ctx.reply(`No tengo un tema "${query}". Ve tus temas con /temas.`));
  const fichas = (await listFichas()).filter((f) => f.topic === t.name || f.secondary.includes(t.name)).reverse();
  await sendLong(
    ctx.api,
    ctx.chat.id,
    `🗂 <b>${escapeHtml(t.name)}</b>${t.description ? `\n<i>${escapeHtml(t.description)}</i>` : ""}\n\n${formatFichaList(fichas)}`,
  );
});

bot.command("costos", async (ctx) => {
  await sendLong(ctx.api, ctx.chat.id, escapeHtml(formatCostSummary(costSummary())));
});

bot.command("ultimos", async (ctx) => {
  const fichas = (await listFichas()).slice(-10).reverse();
  if (!fichas.length) return void (await ctx.reply("Todavía no guardaste nada."));
  await sendLong(ctx.api, ctx.chat.id, `🕘 <b>Lo último que guardaste</b>\n\n${formatFichaList(fichas)}`);
});

// --- links y preguntas ---

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  if (text.startsWith("/")) return void (await ctx.reply("No conozco ese comando. /ayuda"));

  // Respuesta a "✏️ Otro tema".
  const choice = topicChoice.get(chatId);
  if (choice?.awaitingName) {
    topicChoice.delete(chatId);
    return void (await applyTopic(chatId, choice.id, text.trim()));
  }

  // Respuesta a "¿de qué cuenta es?".
  const waiting = awaitingUser.get(chatId);
  const reply = waiting ? handleReply(text) : undefined;
  if (waiting && reply) {
    awaitingUser.delete(chatId);
    return void (await saveLinks(chatId, waiting.urls, reply, waiting.note));
  }

  const urls = findInstagramUrls(text);
  if (urls.length) {
    const mentioned = handleInText(text);
    const note = noteFromMessage(text, urls, mentioned);
    // La API de Meta necesita la cuenta: del @ del mensaje o del link; si no, se intenta
    // descubrir al guardar y solo se pregunta si no hubo forma.
    return void (await saveLinks(chatId, urls, mentioned ?? resolveUser(urls[0]), note));
  }

  await ctx.replyWithChatAction("typing");
  try {
    await sendLong(ctx.api, chatId, formatAnswer(await ask(text)));
  } catch (err) {
    await ctx.reply(`❌ No pude responder: ${errText(err)}`);
  }
});

async function saveLinks(chatId: number, urls: string[], user: string | undefined, note?: string): Promise<void> {
  for (const url of urls) {
    if (user) lastLink.set(chatId, { url, user, at: Date.now() });
    await queueSave(chatId, { url, user, note }, user ? `Recibido, lo leo de @${escapeHtml(user)}…` : "Recibido, busco de qué cuenta es…");
  }
}

/** Cuentas de las que ya guardaste posts (las más recientes primero), para ofrecerlas como botones. */
async function recentAuthors(limit = 6): Promise<string[]> {
  const authors = (await listFichas()).map((f) => f.author?.replace(/^@/, "")).filter((a): a is string => !!a).reverse();
  return [...new Set(authors)].slice(0, limit);
}

async function askForUser(chatId: number, urls: string[], note?: string): Promise<void> {
  const options = await recentAuthors();
  awaitingUser.set(chatId, { urls, note, options });
  const kb = new InlineKeyboard();
  options.forEach((u, i) => kb.text(`@${u}`, `user:${i}`).row());
  await bot.api.sendMessage(
    chatId,
    "👤 ¿De qué cuenta es este post? Respóndeme con el <b>@usuario</b>" + (options.length ? " o elige una:" : ".") +
      "\n<i>La API de Meta necesita la cuenta (solo Business/Creator) y el link compartido no la trae. " +
      "Tip: manda el link junto al @, ej. «@natgeo https://…».</i>",
    { parse_mode: "HTML", reply_markup: options.length ? kb : undefined },
  );
}

// --- capturas (sueltas o álbum) ---

async function savePhoto(api: Api, fileId: string): Promise<string> {
  const file = await api.getFile(fileId);
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`Telegram devolvió ${res.status} al bajar la imagen`);
  await mkdir(TG_DIR, { recursive: true });
  const ext = (file.file_path?.split(".").pop() ?? "jpg").toLowerCase();
  const path = join(TG_DIR, `${file.file_unique_id}.${ext}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

async function flushPhotos(chatId: number): Promise<void> {
  const pending = pendingPhotos.get(chatId);
  pendingPhotos.delete(chatId);
  if (!pending?.paths.length) return;
  const link = lastLink.get(chatId);
  const recent = link && Date.now() - link.at < LINK_WINDOW_MS ? link : undefined;
  const n = pending.paths.length;
  if (recent) {
    await queueSave(chatId, { url: recent.url, user: recent.user, images: pending.paths, note: pending.caption }, `Sumo ${n} captura(s) al último post…`);
  } else {
    await queueSave(chatId, { images: pending.paths, caption: pending.caption }, `Guardo ${n} captura(s) como ficha nueva…`);
  }
}

/** Límite de descarga de archivos de la Bot API de Telegram. */
const TG_MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Videos (p. ej. una grabación de pantalla de un reel cuyo video Meta no entrega):
 * se suman al último link de los 30 min (cuadros + transcripción); sin link, ficha nueva.
 */
bot.on(["message:video", "message:video_note", "message:animation"], async (ctx) => {
  const chatId = ctx.chat.id;
  const v = ctx.message.video ?? ctx.message.video_note ?? ctx.message.animation;
  if (!v) return;
  if ((v.file_size ?? 0) > TG_MAX_FILE_BYTES) {
    return void (await ctx.reply("🎬 Ese video pesa más de 20 MB (límite de Telegram para bots). Graba solo la parte importante, o mándalo por DM a @ia.punto.es."));
  }
  const path = await savePhoto(ctx.api, v.file_id);
  const link = lastLink.get(chatId);
  const recent = link && Date.now() - link.at < LINK_WINDOW_MS ? link : undefined;
  const note = ctx.message.caption?.trim() || undefined;
  if (recent) {
    await queueSave(chatId, { url: recent.url, user: recent.user, videoFile: path, note }, "🎬 Sumo el video al último post…");
  } else {
    await queueSave(chatId, { videoFile: path, caption: note }, "🎬 Guardo el video como ficha nueva…");
  }
});

bot.on(["message:photo", "message:document"], async (ctx) => {
  const chatId = ctx.chat.id;
  const photo = ctx.message.photo?.at(-1); // la de mayor resolución
  const doc = ctx.message.document;
  const fileId = photo?.file_id ?? (doc?.mime_type?.startsWith("image/") ? doc.file_id : undefined);
  if (!fileId) return void (await ctx.reply("Solo sé guardar links de Instagram y capturas (imágenes)."));
  const path = await savePhoto(ctx.api, fileId);
  const pending = pendingPhotos.get(chatId) ?? { paths: [] };
  pending.paths.push(path);
  if (ctx.message.caption) {
    const urls = findInstagramUrls(ctx.message.caption);
    const mentioned = handleInText(ctx.message.caption);
    const user = urls[0] ? (mentioned ?? resolveUser(urls[0])) : undefined;
    // Capturas con link: si se sabe la cuenta, se intenta leer el post; si no, la ficha sale de las capturas.
    if (urls[0] && user) lastLink.set(chatId, { url: urls[0], user, at: Date.now() });
    pending.caption = noteFromMessage(ctx.message.caption, urls, mentioned) ?? pending.caption;
  }
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => void flushPhotos(chatId), ALBUM_DEBOUNCE_MS);
  pendingPhotos.set(chatId, pending);
});

// --- botones ---

async function applyTopic(chatId: number, id: string, name: string): Promise<void> {
  try {
    const r = await serial(() => changeTopic(id, name));
    await bot.api.sendMessage(
      chatId,
      r.from === r.to ? `La ficha ya estaba en <b>${escapeHtml(r.to)}</b>.` : `🏷 Tema cambiado: ${escapeHtml(r.from ?? "—")} → <b>${escapeHtml(r.to)}</b>`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    await bot.api.sendMessage(chatId, `❌ No pude cambiar el tema: ${errText(err)}`);
  }
}

bot.on("callback_query:data", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  const [action, id, arg] = ctx.callbackQuery.data.split(":");
  await ctx.answerCallbackQuery();

  if (action === "user") {
    const waiting = awaitingUser.get(chatId);
    const user = waiting?.options[Number(id)];
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    if (!waiting || !user) return void (await ctx.reply("Ese menú expiró; vuelve a mandar el link."));
    awaitingUser.delete(chatId);
    await saveLinks(chatId, waiting.urls, user, waiting.note);
    return;
  }

  if (action === "undo") {
    try {
      const subject = await serial(async () => {
        const ficha = await findFichaById(id);
        if (!ficha) throw new Error("esa ficha ya no existe");
        const save = await findLastSave(ficha.path);
        if (!save) throw new Error("no encontré el guardado en git");
        await revertSave(save);
        await removeOrphanGalleries();
        await reindex();
        return save.subject.replace(/^kb: /, "");
      });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await ctx.reply(`↩️ Deshecho: ${subject}`);
    } catch (err) {
      await ctx.reply(`❌ No pude deshacer: ${errText(err)}`);
    }
    return;
  }

  if (action === "topic") {
    const current = (await findFichaById(id))?.topic;
    const fichas = await listFichas();
    const options = (await listTopics())
      .map((t) => t.name)
      .filter((t) => t !== current)
      .map((t) => ({ t, n: fichas.filter((f) => f.topic === t).length }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map((x) => x.t);
    topicChoice.set(chatId, { id, options });
    const kb = new InlineKeyboard();
    options.forEach((t, i) => kb.text(t, `settopic:${id}:${i}`).row());
    kb.text("✏️ Otro tema", `othertopic:${id}`);
    await ctx.reply(`¿A qué tema la muevo?${current ? ` (ahora: <b>${escapeHtml(current)}</b>)` : ""}`, { parse_mode: "HTML", reply_markup: kb });
    return;
  }

  if (action === "settopic") {
    const name = topicChoice.get(chatId)?.options[Number(arg)];
    topicChoice.delete(chatId);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    if (!name) return void (await ctx.reply("Ese menú expiró; toca 🏷 Cambiar tema otra vez."));
    await applyTopic(chatId, id, name);
    return;
  }

  if (action === "othertopic") {
    topicChoice.set(chatId, { id, options: [], awaitingName: true });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply("Escríbeme el nombre del tema (si se parece a uno existente, uso ese).");
  }
});

bot.catch((err) => console.error(`❌ Bot: ${errText(err.error)}`));

// --- DMs de Instagram (webhook de Meta) ---

/** Remitentes (IGSID) autorizados a guardar por DM. */
const igAllowed = new Set((process.env.INBOX_ALLOWED_SENDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

/** Shares por DM que esperan el @usuario, por remitente (se descartan a los 30 min). */
const dmAwaitingUser = new Map<string, { urls: string[]; note?: string; caption?: string; at: number }>();
/** Último post compartido por DM de cada remitente: un video enviado después se suma a ese post. */
const dmLastLink = new Map<string, { url: string; user?: string; caption?: string; at: number }>();

async function onDm(ev: DmEvent): Promise<void> {
  if (ev.isEcho) return onEcho(ev);
  if (!igAllowed.has(ev.senderId)) {
    console.warn(`🚫 DM de un remitente no autorizado (IGSID ${ev.senderId}). Si eres tú, agrégalo a INBOX_ALLOWED_SENDERS en .env y reinicia.`);
    return;
  }
  const reply = (text: string, quick: string[] = []) => sendDm(ev.senderId, text, quick).catch(dmFailed);
  const enqueueLinks = async (urls: string[], user: string | undefined, note?: string, caption?: string) => {
    for (const url of urls) {
      enqueue(0, { channel: "instagram", igSender: ev.senderId, url, user, note, caption });
      dmLastLink.set(ev.senderId, { url, user, caption, at: Date.now() });
    }
    await reply(
      user
        ? `📥 Recibido, lo leo de @${user} y lo guardo…`
        : "📥 Recibido, busco de qué cuenta es y lo guardo… (si la sabes, mándame el @ y lo acelero)",
    );
    void work();
  };

  // Respuesta a "¿de qué cuenta es?" (texto o botón de respuesta rápida).
  const waiting = dmAwaitingUser.get(ev.senderId);
  const handle = ev.text && !ev.attachments.length ? handleReply(ev.text) : undefined;
  if (waiting && handle && Date.now() - waiting.at < LINK_WINDOW_MS) {
    dmAwaitingUser.delete(ev.senderId);
    return void (await enqueueLinks(waiting.urls, handle, waiting.note, waiting.caption));
  }
  // Un @ enviado mientras se busca la cuenta del último post (antes de que el bot pregunte): se usa ya.
  const searching = dmLastLink.get(ev.senderId);
  if (handle && searching && !searching.user && Date.now() - searching.at < LINK_WINDOW_MS) {
    return void (await enqueueLinks([searching.url], handle, undefined, searching.caption));
  }

  const action = dmAction(ev);
  console.log(`📬 DM recibido: ${action.kind}`);
  const last = dmLastLink.get(ev.senderId);
  if (action.kind === "save-media" && action.videoUrl && !action.mediaUrls.length && last && Date.now() - last.at < LINK_WINDOW_MS) {
    // Un video enviado justo después de compartir un post (p. ej. una grabación de pantalla
    // de un reel cuyo video Meta no entrega): se suma a ese post.
    enqueue(0, { channel: "instagram", igSender: ev.senderId, url: last.url, user: last.user, caption: last.caption, videoUrl: action.videoUrl });
    await reply("🎬 Sumo el video al último post que compartiste…");
    return void work();
  }
  if (action.kind === "save-media") {
    enqueue(0, {
      channel: "instagram", igSender: ev.senderId, videoUrl: action.videoUrl, mediaUrls: action.mediaUrls, caption: action.caption,
      sourceId: action.sourceId,
    });
    await reply("📥 Recibido, lo guardo en tu base…");
    void work();
  } else if (action.kind === "save-link") {
    const mentioned = handleInText(action.text);
    const user = mentioned ?? resolveUser(action.urls[0]);
    const note = action.text ? noteFromMessage(action.text, action.urls, mentioned) : undefined;
    // Sin cuenta, el guardado intenta descubrirla (menciones, cuentas guardadas, hashtags del caption);
    // si no puede, runDmJob la pregunta.
    await enqueueLinks(action.urls, user, note, action.caption);
  } else if (action.kind === "question") {
    try {
      await reply(formatAnswerText(await ask(action.text)));
    } catch (err) {
      await reply(`❌ No pude responder: ${errText(err)}`);
    }
  } else {
    await reply(`🤔 ${action.reason}. Compárteme un post o reel (Compartir → Enviar), o un link con el @cuenta.`);
  }
}

/**
 * Ecos: mensajes enviados por @ia.punto.es (sus respuestas, o lo que escribas tú
 * desde su bandeja). Solo se usa uno: si hay una pregunta "¿de qué cuenta es?"
 * pendiente con esa persona y el eco es exactamente un @usuario, vale como
 * respuesta. Todo lo demás se ignora (así la cuenta nunca se responde a sí misma).
 */
async function onEcho(ev: DmEvent): Promise<void> {
  const to = ev.recipientId;
  const waiting = to ? dmAwaitingUser.get(to) : undefined;
  const handle = waiting && ev.text && !ev.attachments.length ? handleReply(ev.text) : undefined;
  if (!to || !waiting || !handle || !igAllowed.has(to) || Date.now() - waiting.at >= LINK_WINDOW_MS) return;
  dmAwaitingUser.delete(to);
  console.log(`📬 Respuesta desde la bandeja de la cuenta: @${handle}`);
  for (const url of waiting.urls) {
    enqueue(0, { channel: "instagram", igSender: to, url, user: handle, note: waiting.note, caption: waiting.caption });
    dmLastLink.set(to, { url, user: handle, caption: waiting.caption, at: Date.now() });
  }
  void work();
}

function startInstagramInbox(): void {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!verifyToken) return;
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) throw new Error("El webhook de Instagram necesita META_APP_SECRET para validar la firma de Meta.");
  if (!igAllowed.size) {
    console.warn("⚠️  INBOX_ALLOWED_SENDERS está vacío: ignoraré todos los DMs y registraré el IGSID de quien escriba.");
  }
  startInbox({
    port: Number(process.env.KB_INBOX_PORT) || 8787,
    verifyToken,
    appSecret,
    debugPayload: process.argv.includes("--debug-payload"),
    onEvent: (ev) => void onDm(ev),
  });
  // Lo que llegó con el bot caído. Se espera un poco: los reintentos de Meta llegan primero por el webhook.
  setTimeout(() => void recoverDms(), RECOVER_DELAY_MS);
}

const RECOVER_DELAY_MS = 90_000;

async function recoverDms(): Promise<void> {
  try {
    const r = await recoverMissedDms({
      allowed: igAllowed,
      onEvent: (ev) => void onDm(ev),
      onUnreadable: (sender, n) =>
        sendDm(
          sender,
          `⚠️ Estuve desconectado y no alcancé a leer ${n === 1 ? "1 post que me compartiste" : `${n} posts que me compartiste`}. ` +
            "Instagram no me deja recuperarlos: compártemelos de nuevo, por favor.",
        ).catch(dmFailed),
    });
    if (r.texts || r.unreadable) console.log(`↻ DMs perdidos mientras estaba caído: ${r.texts} texto(s), ${r.unreadable} post(s) por reenviar.`);
  } catch (err) {
    console.warn(`⚠️  No pude revisar los DMs perdidos: ${errText(err)}`);
  }
}

/** Avisa por Telegram si el token de Meta está por vencer (se revisa al arrancar y una vez al día). */
async function checkMetaToken(): Promise<void> {
  if (!process.env.META_ACCESS_TOKEN) return;
  try {
    const left = await tokenDaysLeft();
    if (left !== undefined && left < EXPIRY_WARN_DAYS) {
      await notifyAdmin(
        `⚠️ El token de Meta vence en ${left} día(s). Renuévalo (README, "Configuración de Meta") o usa un token de System User, que no vence.`,
      );
    }
  } catch (err) {
    await notifyAdmin(`⚠️ Problema con el token de Meta: ${errText(err)}`);
  }
}

// --- investigación semanal (la escribe un agente en la nube; el bot la trae y la usa) ---

/** Cada cuánto se traen cambios de la base desde GitHub. */
const SYNC_INTERVAL_MS = 3_600_000;
/** Primera sincronización tras arrancar: indexa lo que trajo el pull del entrypoint. */
const SYNC_FIRST_DELAY_MS = 60_000;

let lastSyncError: string | undefined;

/** git pull + reindex (en la cadena serial: nunca a mitad de un guardado) + reenvío de resúmenes. */
async function syncFromRemote(): Promise<void> {
  try {
    await serial(async () => {
      const r = await pullKb();
      if (r.error) {
        if (r.error !== lastSyncError) await notifyAdmin(`⚠️ No pude traer cambios de la base desde GitHub: ${r.error}`);
        lastSyncError = r.error;
        return;
      }
      lastSyncError = undefined;
      // También si el índice quedó atrás de la base (p. ej. lo trajo el pull del arranque).
      const head = await kbHead();
      if (r.changed || (head && head !== indexedHead())) {
        const s = await reindex();
        if (head) setIndexedHead(head);
        console.log(`↓ Base actualizada desde GitHub: ${s.indexed} documento(s) reindexado(s), ${s.removed} quitado(s).`);
      }
    });
    for (const s of await newSummaries()) {
      // Se marca solo si llegó: si Telegram falla, se reintenta en la próxima sincronización.
      if (await sendToAdmins(`🔎 Investigación semanal\n\n${s.text}`)) markSummaryNotified(s.name);
      else console.warn(`⚠️  No pude enviar el resumen ${s.name} por Telegram; reintento en la próxima sincronización.`);
    }
  } catch (err) {
    console.warn(`⚠️  Sincronización con GitHub: ${errText(err)}`);
  }
}

// --- resúmenes de tema (al guardar solo se actualiza la lista de fuentes; ver topicSynthHours) ---

/** Cada cuánto se revisa si hay temas por resumir (cada tema se resume a lo más una vez por KB_TOPIC_SYNTH_HOURS). */
const TOPIC_CHECK_MS = 3_600_000;

/** Resume los temas atrasados, en la cadena serial (nunca a mitad de un guardado). */
async function refreshStaleTopics(): Promise<void> {
  try {
    const r = await serial(() => synthesizeStaleTopics());
    if (r.topics.length) console.log(`🗂 Temas resumidos: ${r.topics.join(", ")} (US$${r.usd.toFixed(3)})`);
  } catch (err) {
    console.warn(`⚠️  Resumen de temas: ${errText(err)}`);
  }
}

let silenceWarnedFor: string | undefined;

/** Avisa una vez si la investigación semanal dejó de correr. */
async function checkResearch(): Promise<void> {
  const alert = silenceAlert(await readIfExists(registroPath()), new Date().toISOString().slice(0, 10));
  if (!alert || alert.since === silenceWarnedFor) return;
  silenceWarnedFor = alert.since;
  await notifyAdmin(alert.text);
}

// --- arranque ---

setSyncErrorHandler((m) => void notifyAdmin(`⚠️ ${m}`));
process.on("unhandledRejection", (err) => void notifyAdmin(`⚠️ Error inesperado en el bot: ${errText(err)}`));

// Antes de que el worker toque la base: un reinicio a mitad de un guardado puede dejar un rebase con conflictos.
if (await abortStaleRebase().catch(() => false)) {
  await notifyAdmin("⚠️ La base tenía un rebase a medias (reinicio durante un guardado): lo aborté. Lo que faltaba subir se sube con el próximo guardado.");
}
const resumed = requeueInterrupted();
await bot.api.setMyCommands([
  { command: "temas", description: "Tus temas" },
  { command: "tema", description: "Qué hay en un tema" },
  { command: "ultimos", description: "Lo último que guardaste" },
  { command: "costos", description: "Cuánto se ha gastado en la API" },
  { command: "ayuda", description: "Cómo usarme" },
]);
console.log(`🤖 Bot en marcha (chats autorizados: ${[...allowed].join(", ")}). Base: ${temasDir().replace(/\/temas$/, "")}`);
if (resumed) console.log(`↻ Retomo ${resumed} guardado(s) que quedaron a medias.`);
startInstagramInbox();
void checkMetaToken();
setInterval(() => void checkMetaToken(), 24 * 3_600_000);
if (process.env.KB_GIT_PUSH === "1") {
  // Solo en el servidor: ahí la base es un clon de ia-es-kb que también escribe el agente de investigación.
  setTimeout(() => void syncFromRemote(), SYNC_FIRST_DELAY_MS);
  setInterval(() => void syncFromRemote(), SYNC_INTERVAL_MS);
}
void checkResearch();
setInterval(() => void checkResearch(), 24 * 3_600_000);
setInterval(() => void refreshStaleTopics(), TOPIC_CHECK_MS);
void work();
await bot.start({ drop_pending_updates: false });
