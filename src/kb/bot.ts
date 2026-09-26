import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Bot, GrammyError, InlineKeyboard, type Api } from "grammy";
import { ask } from "./ask.ts";
import { reindex } from "./indexer.ts";
import { topicKey } from "./markdown.ts";
import { addPost, changeTopic } from "./pipeline.ts";
import { enqueue, finish, pendingCount, requeueInterrupted, takeNext, type Job } from "./queue.ts";
import { findInstagramUrls } from "./shortcode.ts";
import { findFichaById, findLastSave, listFichas, listTopics, removeOrphanGalleries, revertSave, temasDir } from "./store.ts";
import { escapeHtml, formatAnswer, formatFichaList, formatSaved, HELP, noteFromMessage, splitMessage } from "./telegram.ts";
import { STAGE_LABEL } from "./types.ts";

/**
 * Bot de Telegram (long polling: no necesita URL pública, corre en el PC de casa).
 * Es solo otra puerta de entrada: guarda con addPost(), responde con ask() y
 * deshace con git revert, igual que la CLI.
 *
 *   npm run kb:bot
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
const lastLink = new Map<number, { url: string; at: number }>();
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
  const { chatId, payload } = job;
  const api = bot.api;
  try {
    const r = await addPost({
      url: payload.url,
      note: payload.note,
      caption: payload.caption,
      images: payload.images,
      onProgress: (stage, detail) => void edit(api, chatId, job.statusMsgId, `${STAGE_LABEL[stage]}${detail ? ` <i>${escapeHtml(detail)}</i>` : ""}`),
    });
    const topic = r.topicsUpdated[0];
    const related = (await listFichas()).filter((f) => f.topic === topic && f.id !== r.ficha.id).slice(-3).reverse();
    if (job.statusMsgId) await api.deleteMessage(chatId, job.statusMsgId).catch(() => {});
    await sendLong(api, chatId, formatSaved(r, related), { reply_markup: savedKeyboard(r.ficha.id) });
    finish(job.id);
  } catch (err) {
    finish(job.id, errText(err));
    await edit(api, chatId, job.statusMsgId, `❌ No pude guardar${payload.url ? " el post" : ""}: ${escapeHtml(errText(err))}\n\nSi es un post privado o Instagram lo bloqueó, mándame capturas y lo guardo desde ahí.`);
  } finally {
    for (const p of payload.images ?? []) await rm(p, { force: true }).catch(() => {});
  }
}

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

  const urls = findInstagramUrls(text);
  if (urls.length) {
    const note = noteFromMessage(text, urls);
    for (const url of urls) {
      lastLink.set(chatId, { url, at: Date.now() });
      await queueSave(chatId, { url, note }, "Recibido, lo guardo…");
    }
    return;
  }

  await ctx.replyWithChatAction("typing");
  try {
    await sendLong(ctx.api, chatId, formatAnswer(await ask(text)));
  } catch (err) {
    await ctx.reply(`❌ No pude responder: ${errText(err)}`);
  }
});

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
  const recent = link && Date.now() - link.at < LINK_WINDOW_MS ? link.url : undefined;
  const n = pending.paths.length;
  if (recent) {
    await queueSave(chatId, { url: recent, images: pending.paths, note: pending.caption }, `Sumo ${n} captura(s) al último post…`);
  } else {
    await queueSave(chatId, { images: pending.paths, caption: pending.caption }, `Guardo ${n} captura(s) como ficha nueva…`);
  }
}

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
    if (urls[0]) lastLink.set(chatId, { url: urls[0], at: Date.now() });
    pending.caption = noteFromMessage(ctx.message.caption, urls) ?? pending.caption;
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

// --- arranque ---

const resumed = requeueInterrupted();
await bot.api.setMyCommands([
  { command: "temas", description: "Tus temas" },
  { command: "tema", description: "Qué hay en un tema" },
  { command: "ultimos", description: "Lo último que guardaste" },
  { command: "ayuda", description: "Cómo usarme" },
]);
console.log(`🤖 Bot en marcha (chats autorizados: ${[...allowed].join(", ")}). Base: ${temasDir().replace(/\/temas$/, "")}`);
if (resumed) console.log(`↻ Retomo ${resumed} guardado(s) que quedaron a medias.`);
void work();
await bot.start({ drop_pending_updates: false });
