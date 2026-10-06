import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { Bot, GrammyError, InlineKeyboard, InputFile, type Api } from "grammy";
import { ask } from "./ask.ts";
import { indexedHead, reindex, setIndexedHead } from "./indexer.ts";
import { topicKey } from "./markdown.ts";
import { addPost, changeTopic, synthesizeStaleTopics } from "./pipeline.ts";
import { costSummary, formatCostSummary } from "./costs.ts";
import { enqueue, finish, pendingCount, requeueInterrupted, takeNext, type Job } from "./queue.ts";
import { NeedsUserError, resolveUser } from "./instagram.ts";
import { findInstagramUrls } from "./shortcode.ts";
import {
  abortStaleRebase, commitPaths, findFichaById, findLastSave, kbDir, kbHead, listFichas, listTopics, pullKb, readIfExists, removeOrphanGalleries, revertSave,
  setSyncErrorHandler, temasDir,
} from "./store.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "../calendario/time.ts";
import { limpiarMedios, manejarMedio } from "../calendario/media-server.ts";
import { estadoEfectivo, leerSemana, listarSemanas, ocultarToken, type MediosRender, type SemanaLeida } from "../calendario/plan.ts";
import { escribirEstado, estadoPath } from "../calendario/registro.ts";
import {
  cargarFilasDb, claveFila, depsReales, esPausado, guardarClaveDb, leerClaveDb, ORDEN_PUBLICAR, ORDEN_SALTAR, tick, type SchedulerDeps,
} from "../calendario/scheduler.ts";
import {
  argsPreview, avisoRenderPendiente, avisosPostPublicacion, callbackSaltar, ETAPAS_RENDER, formatSemana, idDesdeArgumento, leerCallbackSaltar,
  modoCalendario, previewsPendientes, publicadas, recordatorioLunes, semanasConPlan, silencioCalendario, TEXTO_POST_PUBLICACION,
  TEXTO_RECORDATORIO_LUNES,
} from "../calendario/telegram.ts";
import { graphGet } from "../meta/client.ts";
import { guardarCuenta, tomarInstantaneas } from "../insights/snapshots.ts";
import { guardarEstado, leerEstado, resumenDelDomingo, resumenReciente, textoPost } from "../insights/lectura.ts";
import { debeCuenta, debeResumir, formatResumenTelegram } from "../insights/summary.ts";
import { debeEscribirBucle, escribirBucle, marcaBucle } from "../calendario/bucle.ts";
import { markSummaryNotified, newSummaries, registroPath, silenceAlert } from "./research.ts";
import { sendDm } from "../meta/messages.ts";
import { EXPIRY_WARN_DAYS, tokenDaysLeft } from "../meta/check.ts";
import { dmAction, startHttp, webhookRoute, type DmEvent, type HttpRoute } from "./inbox.ts";
import { recoverMissedDms } from "./recover.ts";
import {
  escapeHtml, formatAnswer, formatAnswerText, formatFichaList, formatSaved, formatSavedText, handleInText, handleReply, HELP, HELP_CALENDARIO,
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
/** `auto` | `aviso` | undefined (calendario apagado). Un valor inválido lanza aquí: el bot no arranca. */
const calendarioModo = modoCalendario(process.env.CALENDARIO_MODO);

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

/** Como notifyAdmin, pero dice si el mensaje llegó al menos a un chat. Con `html`, el texto va como HTML de Telegram. */
async function sendToAdmins(text: string, html = false): Promise<boolean> {
  console.log(text);
  let ok = false;
  for (const chatId of allowed) {
    try {
      await bot.api.sendMessage(chatId, text, html ? { parse_mode: "HTML", link_preview_options: { is_disabled: true } } : {});
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

bot.command(["start", "ayuda", "help"], (ctx) => ctx.reply(calendarioModo ? `${HELP}\n\n${HELP_CALENDARIO}` : HELP, { parse_mode: "HTML" }));

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

bot.command("metricas", async (ctx) => {
  await responderMetricas(ctx.api, ctx.chat.id, ctx.match);
});

bot.command("ultimos", async (ctx) => {
  const fichas = (await listFichas()).slice(-10).reverse();
  if (!fichas.length) return void (await ctx.reply("Todavía no guardaste nada."));
  await sendLong(ctx.api, ctx.chat.id, `🕘 <b>Lo último que guardaste</b>\n\n${formatFichaList(fichas)}`);
});

// Calendario (la lógica está en la sección "calendario", más abajo). Van antes del
// manejador de texto, que responde "No conozco ese comando" a todo lo demás.
bot.command("calendario", (ctx) => cmdCalendario(ctx.chat.id));
bot.command("pausar", (ctx) => cmdPausa(ctx.chat.id, true));
bot.command("reanudar", (ctx) => cmdPausa(ctx.chat.id, false));
bot.command("publicar", (ctx) => cmdPublicar(ctx.chat.id, ctx.match));
bot.command("saltar", (ctx) => cmdSaltar(ctx.chat.id, ctx.match));
bot.callbackQuery(/^cal-saltar:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  await botonSaltar(chatId, ctx.callbackQuery.data, () => ctx.editMessageReplyMarkup({ reply_markup: undefined }).then(() => undefined));
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

/**
 * Servidor HTTP (`KB_INBOX_PORT`): el webhook de Instagram si hay META_WEBHOOK_VERIFY_TOKEN
 * y los medios del calendario (`/media/<token>/…`) si hay MEDIA_PUBLIC_TOKEN. Sin
 * ninguno de los dos, no se abre ningún puerto.
 */
function startHttpServer(): void {
  const port = Number(process.env.KB_INBOX_PORT) || 8787;
  const rutas: HttpRoute[] = [];
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (verifyToken) {
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appSecret) throw new Error("El webhook de Instagram necesita META_APP_SECRET para validar la firma de Meta.");
    if (!igAllowed.size) {
      console.warn("⚠️  INBOX_ALLOWED_SENDERS está vacío: ignoraré todos los DMs y registraré el IGSID de quien escriba.");
    }
    rutas.push(webhookRoute({
      port,
      verifyToken,
      appSecret,
      debugPayload: process.argv.includes("--debug-payload"),
      onEvent: (ev) => void onDm(ev),
    }));
    console.log(`📬 Webhook de Instagram en http://localhost:${port}/webhook`);
    // Lo que llegó con el bot caído. Se espera un poco: los reintentos de Meta llegan primero por el webhook.
    setTimeout(() => void recoverDms(), RECOVER_DELAY_MS);
  }
  if (mediaToken) {
    const token = mediaToken;
    rutas.push((req, res) => manejarMedio(req, res, { token, root: MEDIA_ROOT }));
    console.log(`🖼  Medios del calendario en http://localhost:${port}/media/***/… (desde ${MEDIA_ROOT})`);
  }
  if (rutas.length) startHttp(port, rutas);
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
    // Piezas recién renderizadas (previews), render pendiente y silencio del planificador.
    if (calendarioModo) await revisarCalendario();
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

// --- métricas de la cuenta ---
// Instantáneas cada hora, cuenta una vez al día y resumen del domingo 05:30 (hora de Chile).
// Toda la escritura pasa por `serial`; ningún fallo de Meta sale de aquí (se avisa una vez por error distinto).

const METRICAS_PRIMERA_MS = 2 * 60_000;
const METRICAS_CADA_MS = 3_600_000;
const RESUMEN_CADA_MS = 10 * 60_000;

const metricasActivas = (): boolean => Boolean(process.env.META_ACCESS_TOKEN?.trim() && process.env.META_IG_USER_ID?.trim());
const metricasDir = (): string => join(kbDir(), "_metricas");
/** Último error avisado por tick: el mismo error seguido no se repite; un éxito lo limpia. */
const ultimoErrorMetricas = new Map<string, string>();

async function avisarUnaVez(tick: string, err: unknown): Promise<void> {
  const msg = errText(err);
  if (ultimoErrorMetricas.get(tick) === msg) return;
  ultimoErrorMetricas.set(tick, msg);
  await notifyAdmin(`⚠️ Métricas (${tick}): ${msg}`).catch(() => {});
}

/** Guarda en la base los archivos que existan (uno que no se pudo escribir no debe romper el commit). */
async function commitMetricas(rutas: string[], mensaje: string): Promise<void> {
  const existentes = rutas.filter((r) => existsSync(r));
  if (existentes.length) await commitPaths(existentes, mensaje);
}

async function snapshotTick(): Promise<void> {
  try {
    await serial(async () => {
      const now = new Date();
      const dia = localParts(now).dia;
      try {
        const nuevas = await tomarInstantaneas(now);
        if (nuevas.length) console.log(`📈 Instantáneas nuevas: ${nuevas.map((i) => `${i.mediaId} ${i.ventana}`).join(", ")}`);
      } finally {
        // Aunque la toma falle a medias, lo que alcanzó a escribirse se guarda (sin cambios, no hace nada).
        await commitMetricas([join(metricasDir(), "instantaneas", `${dia}.jsonl`), join(metricasDir(), "posts.json")], `métricas: instantáneas ${dia}`);
      }
    });
    ultimoErrorMetricas.delete("instantáneas");
  } catch (err) {
    await avisarUnaVez("instantáneas", err);
  }
}

async function accountTick(): Promise<void> {
  try {
    await serial(async () => {
      const now = new Date();
      if (!debeCuenta(now, leerEstado("cuenta:ultima"))) return;
      await guardarCuenta(now);
      const dia = localParts(now).dia;
      guardarEstado("cuenta:ultima", dia);
      await commitMetricas([join(metricasDir(), "cuenta.json")], `métricas: cuenta ${dia}`);
    });
    ultimoErrorMetricas.delete("cuenta");
  } catch (err) {
    await avisarUnaVez("cuenta", err);
  }
}

async function summaryTick(): Promise<void> {
  try {
    if (!debeResumir(new Date(), leerEstado("resumen:ultimo"))) return;
    const enviado = await serial(async () => {
      const now = new Date();
      // Otra pasada pudo enviarlo mientras esperaba su turno.
      if (!debeResumir(now, leerEstado("resumen:ultimo"))) return true;
      const { domingo, md, html } = resumenDelDomingo(now);
      const ruta = join(metricasDir(), "resumenes", `${domingo}.md`);
      await mkdir(dirname(ruta), { recursive: true });
      await writeFile(ruta, md, "utf8");
      await commitMetricas([ruta], `métricas: resumen ${domingo}`);
      // Se marca solo si llegó: si Telegram falla, se reintenta en la próxima pasada.
      if (!(await sendToAdmins(html, true))) return false;
      guardarEstado("resumen:ultimo", domingo);
      return true;
    });
    if (enviado) ultimoErrorMetricas.delete("resumen");
    else await avisarUnaVez("resumen", new Error("Telegram no aceptó el resumen semanal; sigo reintentando cada 10 min."));
  } catch (err) {
    await avisarUnaVez("resumen", err);
  }
}

/**
 * `_metricas/bucle.json` (Task 12, R30): justo después del resumen del domingo (misma
 * pasada de 10 min, desde las 05:30) y antes del planificador de las 06:00. La marca
 * `bucle:ultimo` (calendario_estado) se guarda solo si la escritura salió bien.
 */
async function bucleTick(): Promise<void> {
  try {
    if (!debeEscribirBucle(new Date(), leerEstado("bucle:ultimo"))) return;
    await serial(async () => {
      const now = new Date();
      // Otra pasada pudo escribirlo mientras esperaba su turno.
      if (!debeEscribirBucle(now, leerEstado("bucle:ultimo"))) return;
      const rutas = await escribirBucle(now);
      await commitMetricas(rutas, `métricas: bucle ${marcaBucle(now)}`);
      guardarEstado("bucle:ultimo", marcaBucle(now));
    });
    ultimoErrorMetricas.delete("bucle");
  } catch (err) {
    await avisarUnaVez("bucle", err);
  }
}

/** Resumen del domingo y, a continuación, el bucle (en ese orden, en la misma pasada). */
async function resumenYBucle(): Promise<void> {
  await summaryTick();
  await bucleTick();
}

/** `/metricas` (últimos 7 días) y `/metricas <link|media_id|piezaId>` (todas las instantáneas de un post). */
async function responderMetricas(api: Api, chatId: number, arg: string): Promise<void> {
  try {
    const now = new Date();
    const html = arg.trim() ? await textoPost(arg, now) : formatResumenTelegram(resumenReciente(now));
    await sendLong(api, chatId, html);
  } catch (err) {
    await api.sendMessage(chatId, `⚠️ No pude leer las métricas: ${errText(err)}`).catch(() => {});
  }
}

function iniciarMetricas(): void {
  if (!metricasActivas()) {
    console.warn("⚠️  Sin META_ACCESS_TOKEN y META_IG_USER_ID: no tomo métricas de Instagram (/metricas muestra lo que ya haya).");
    return;
  }
  setTimeout(() => void snapshotTick(), METRICAS_PRIMERA_MS);
  setInterval(() => void snapshotTick(), METRICAS_CADA_MS);
  // La cuenta se guarda a lo más una vez por día local; la pasada horaria solo revisa si ya toca.
  setTimeout(() => void accountTick(), METRICAS_PRIMERA_MS + 60_000);
  setInterval(() => void accountTick(), METRICAS_CADA_MS);
  setTimeout(() => void resumenYBucle(), METRICAS_PRIMERA_MS + 3 * 60_000);
  setInterval(() => void resumenYBucle(), RESUMEN_CADA_MS);
}

// --- calendario ---
// El scheduler (`tick`, cada minuto, con su propio candado) es el único que publica o
// salta: `/publicar` y `/saltar` solo dejan una orden en `calendario_estado`, responden
// de inmediato y adelantan una pasada sin esperarla (grammY procesa los updates en serie:
// esperar el tick congelaría el bot). El resultado lo avisa el scheduler. El bot escribe
// solo `estado.json` y `registro.jsonl` (vía el scheduler), nunca el plan ni el render.
// Ningún texto lleva el token de medios (`sinToken`) y los previews suben el archivo
// local (R44): la URL pública nunca va a Telegram.

const mediaToken = process.env.MEDIA_PUBLIC_TOKEN?.trim() || undefined;
const MEDIA_ROOT = process.env.MEDIA_DIR?.trim() || "/data/media";
const CALENDARIO_CADA_MS = 60_000;
const LIMPIEZA_MEDIOS_MS = 24 * 3_600_000;
/** Claves de `calendario_estado` de los avisos del bot (una vez cada uno). */
const K_RENDER = "aviso_render:";
const K_SILENCIO = "aviso_silencio:";
const K_POST = "aviso_post:";
const K_LUNES = "recordatorio_lunes";
/** Preview entregado (a lo menos a un chat): sin la marca, se reintenta en la próxima revisión. */
const K_PREVIEW = "preview:";

type PiezaCal = SemanaLeida["plan"]["piezas"][number];

const sinToken = (t: string): string => (mediaToken ? ocultarToken(t, mediaToken) : t);

let ultimoErrorCommit: string | undefined;

/** Dependencias del scheduler, una sola vez (su memoria de proceso va atada a este objeto). */
let calDeps: SchedulerDeps | undefined;
function depsCalendario(): SchedulerDeps {
  if (calDeps) return calDeps;
  const base = depsReales({
    modo: calendarioModo!,
    avisar: async (texto) => {
      if (!(await sendToAdmins(sinToken(texto)))) throw new Error("Telegram no aceptó el aviso");
    },
  });
  calDeps = {
    ...base,
    // El commit entra a la cadena serial (nunca a mitad de un guardado o de un pull) pero
    // sin esperarla: un guardado largo no puede atrasar una publicación.
    commit: (paths, mensaje) => {
      // Un fallo no se pierde: se avisa por Telegram (una vez por error distinto). El push
      // fallido ya lo avisa `setSyncErrorHandler`; lo no commiteado sube con el próximo commit.
      void serial(() => commitPaths(paths, mensaje)).then(
        () => { ultimoErrorCommit = undefined; },
        (e) => {
          const msg = sinToken(errText(e));
          if (msg === ultimoErrorCommit) return;
          ultimoErrorCommit = msg;
          void notifyAdmin(`⚠️ Calendario: no pude commitear ${paths.length} archivo(s) («${mensaje}»): ${msg}`);
        },
      );
      return Promise.resolve();
    },
  };
  return calDeps;
}

function commitCalendario(paths: string[], mensaje: string): void {
  void depsCalendario().commit(paths, mensaje);
}

/** `n` semanas desde el lunes `desde`. Un plan.json inválido se informa y se omite. */
async function semanasCalendario(desde: string, n: number): Promise<{ semanas: SemanaLeida[]; errores: string[] }> {
  const hay = new Set(await listarSemanas());
  const semanas: SemanaLeida[] = [];
  const errores: string[] = [];
  for (let i = 0; i < n; i++) {
    const lunes = addDays(desde, 7 * i);
    if (!hay.has(lunes)) continue;
    try {
      const s = await leerSemana(lunes);
      if (s) semanas.push(s);
    } catch (e) {
      errores.push(`⚠️ Semana ${lunes}: ${sinToken(errText(e))}`);
    }
  }
  return { semanas, errores };
}

/** Semana en curso y la siguiente: /calendario, /saltar y el botón (R43). */
const semanasActivas = () => semanasCalendario(weekMonday(new Date()), 2);
/** Solo la semana en curso: /publicar (R43). */
const semanaEnCurso = () => semanasCalendario(weekMonday(new Date()), 1);

async function calendarioApagado(chatId: number): Promise<void> {
  await bot.api.sendMessage(chatId, "El calendario está apagado en este bot (CALENDARIO_MODO no está definido).");
}

async function cmdCalendario(chatId: number): Promise<void> {
  try {
    const ahora = new Date();
    const { semanas, errores } = await semanasActivas();
    const cab = !calendarioModo
      ? "Calendario apagado (sin CALENDARIO_MODO): solo muestro el plan."
      : `Modo ${calendarioModo}${esPausado(leerClaveDb("pausado")) ? " · ⏸ en pausa (/reanudar)" : ""}`;
    const cuerpo = semanas.map((s) => formatSemana(s, ahora));
    if (!cuerpo.length && !errores.length) cuerpo.push(`No hay plan para la semana del ${weekMonday(ahora)}.`);
    await sendLong(bot.api, chatId, escapeHtml(sinToken([cab, ...cuerpo, ...errores].join("\n\n"))));
  } catch (err) {
    await bot.api.sendMessage(chatId, `⚠️ No pude leer el calendario: ${sinToken(errText(err))}`).catch(() => {});
  }
}

async function cmdPausa(chatId: number, pausar: boolean): Promise<void> {
  if (!calendarioModo) return calendarioApagado(chatId);
  guardarClaveDb("pausado", pausar ? "1" : "0");
  await bot.api.sendMessage(chatId, pausar
    ? "⏸ Calendario en pausa: no publico nada hasta /reanudar. Una pieza cuya hora pase en pausa se salta (no se publica tarde)."
    : "▶️ Calendario reanudado: publico a la hora del plan.");
}

interface PiezaRef { s: SemanaLeida; p: PiezaCal; clave: string }

/**
 * Pieza del argumento entre las semanas dadas. Si no la encuentra, responde (con los
 * plan.json rotos, si los hay, porque explican el "no encontré") y devuelve undefined.
 */
async function piezaDelComando(
  chatId: number, arg: string, uso: string, cargar: () => Promise<{ semanas: SemanaLeida[]; errores: string[] }>, alcance: string,
): Promise<PiezaRef | undefined> {
  const { semanas, errores } = await cargar();
  const ref = idDesdeArgumento(arg, semanas);
  if (!ref) {
    const ids = semanas.flatMap((s) => s.plan.piezas.map((p) => p.id));
    const texto = [
      `Uso: ${uso} <id> (${alcance}).` + (arg.trim() ? " No encontré esa pieza (o hay más de una que empieza así)." : ""),
      ids.length ? `Piezas: ${ids.join(", ")}` : "No hay piezas.",
      ...(errores.length ? ["Puede faltar por un plan.json roto:", ...errores] : []),
    ].join("\n");
    await bot.api.sendMessage(chatId, sinToken(texto));
    return undefined;
  }
  const s = semanas.find((x) => x.semana === ref.semana)!;
  return { s, p: s.plan.piezas.find((x) => x.id === ref.id)!, clave: claveFila(ref.semana, ref.id) };
}

const filaPost = (clave: string) => cargarFilasDb().find((f) => f.piezaId === clave && f.tipo === "post");

/** Adelanta una pasada del scheduler sin esperarla (el handler responde antes). */
function adelantarTick(): void {
  void minutoCalendario();
}

/**
 * `/publicar <id>` (solo la semana en curso, R43): deja la orden, responde al tiro y
 * adelanta una pasada. Solo piezas `programadas` cuya hora no llegó.
 */
async function cmdPublicar(chatId: number, arg: string): Promise<void> {
  if (!calendarioModo) return calendarioApagado(chatId);
  const say = async (t: string): Promise<void> => void (await bot.api.sendMessage(chatId, sinToken(t)));
  try {
    const x = await piezaDelComando(chatId, arg, "/publicar", semanaEnCurso, "solo piezas de esta semana");
    if (!x) return;
    const { s, p, clave } = x;
    if (esPausado(leerClaveDb("pausado"))) return say("⏸ El calendario está en pausa: /reanudar primero.");
    if (zonedToUtc(p.dia, p.hora).getTime() <= Date.now()) {
      return say(`La hora de ${p.id} ya llegó (${p.dia} ${p.hora}): la maneja el scheduler. Mira /calendario.`);
    }
    const f = filaPost(clave);
    if (f) return say(`${p.id} ya está en curso (${f.paso}).`);
    const r = s.render[p.id];
    if (!s.estado[p.id] && r?.estado === "renderizado" && r.medios) {
      // Recién renderizada: se programa aquí (su preview sale en la próxima revisión).
      await escribirEstado(s.semana, p.id, { estado: "programado" });
      s.estado[p.id] = { estado: "programado" };
      commitCalendario([estadoPath(s.semana)], `calendario: programado ${p.id}`);
    }
    const ef = estadoEfectivo(p, r, s.estado[p.id]);
    if (ef !== "programado") return say(`Solo publico piezas programadas: ${p.id} está ${ef}.`);
    guardarClaveDb(ORDEN_PUBLICAR + clave, new Date().toISOString());
    await say(
      `▶️ Publico ${p.id} en el próximo minuto${calendarioModo === "aviso" ? " (modo aviso: sin POST a Meta)" : ""}; te aviso el resultado.\n` +
      `Si empieza y falla, queda fallida o saltada y ya no sale a su hora del plan (${p.dia} ${p.hora}). ` +
      "Si no alcanza a empezar en 15 min (p. ej. token inválido), la orden vence y la pieza sigue a su hora.",
    );
    adelantarTick();
  } catch (err) {
    await say(`❌ /publicar: ${errText(err)}`).catch(() => {});
  }
}

/** Salto pedido por Telegram: deja la orden y adelanta una pasada. `soloAntesDeLaHora` para el botón. */
async function saltar(chatId: number, x: PiezaRef, soloAntesDeLaHora: boolean): Promise<boolean> {
  const { s, p, clave } = x;
  const say = async (t: string): Promise<void> => void (await bot.api.sendMessage(chatId, sinToken(t)));
  const ef = estadoEfectivo(p, s.render[p.id], s.estado[p.id]);
  if (ef === "publicado" || ef === "saltado" || ef === "fallido") {
    await say(`${p.id} ya está ${ef}.`);
    return false;
  }
  if (soloAntesDeLaHora && zonedToUtc(p.dia, p.hora).getTime() <= Date.now()) {
    await say(`Ya pasó la hora de ${p.id}: el botón Saltar ya no vale. Usa /saltar ${p.id} si aún no sale.`);
    return false;
  }
  if (filaPost(clave)?.paso === "publicando") {
    await say(`${p.id} se está publicando: ya no se puede saltar.`);
    return false;
  }
  guardarClaveDb(ORDEN_SALTAR + clave, new Date().toISOString());
  await say(`⏭️ Salto ${p.id} en el próximo minuto; te aviso.`);
  adelantarTick();
  return true;
}

async function cmdSaltar(chatId: number, arg: string): Promise<void> {
  if (!calendarioModo) return calendarioApagado(chatId);
  try {
    const x = await piezaDelComando(chatId, arg, "/saltar", semanasActivas, "esta semana o la siguiente");
    if (x) await saltar(chatId, x, false);
  } catch (err) {
    await bot.api.sendMessage(chatId, `❌ /saltar: ${sinToken(errText(err))}`).catch(() => {});
  }
}

/** Botón Saltar del preview: vale solo hasta la hora de la pieza y si el plan no cambió. */
async function botonSaltar(chatId: number, data: string, quitarBoton: () => Promise<unknown>): Promise<void> {
  if (!calendarioModo) return calendarioApagado(chatId);
  try {
    const { semanas } = await semanasActivas();
    const ref = leerCallbackSaltar(data, semanas);
    if (!ref) {
      await bot.api.sendMessage(chatId,
        "Ese botón ya no vale: la pieza no está en esta semana ni en la siguiente, o el plan cambió. No salté nada; usa /saltar <id>.");
      return;
    }
    const s = semanas.find((y) => y.semana === ref.semana)!;
    const x: PiezaRef = { s, p: s.plan.piezas.find((y) => y.id === ref.id)!, clave: claveFila(ref.semana, ref.id) };
    if (await saltar(chatId, x, true)) await quitarBoton().catch(() => {});
  } catch (err) {
    await bot.api.sendMessage(chatId, `❌ Saltar: ${sinToken(errText(err))}`).catch(() => {});
  }
}

/** Archivo local del preview si existe y su ruta real queda dentro de la raíz de medios (sin symlinks hacia fuera). */
async function archivoLocalSeguro(ruta: string | undefined): Promise<string | undefined> {
  if (!ruta) return undefined;
  try {
    const raiz = await realpath(MEDIA_ROOT);
    const real = await realpath(ruta);
    return real.startsWith(raiz + sep) && (await stat(real)).isFile() ? real : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Preview de una pieza programada: portada SUBIDA desde la raíz de medios (R44) + caption
 * + botón Saltar. Sin archivo local (o si falla la foto), solo texto. Dice si llegó a algún chat.
 */
async function enviarPreview(s: SemanaLeida, p: PiezaCal, medios: MediosRender): Promise<boolean> {
  const { caption, ruta } = argsPreview(MEDIA_ROOT, s.semana, p, medios);
  const local = await archivoLocalSeguro(ruta);
  const reply_markup = new InlineKeyboard().text("⏭️ Saltar", callbackSaltar(s.semana, p.id));
  let llego = false;
  for (const chatId of allowed) {
    try {
      if (!local) throw new Error("sin portada local");
      await bot.api.sendPhoto(chatId, new InputFile(local), { caption, reply_markup });
      llego = true;
    } catch (err) {
      console.warn(`⚠️  Preview de ${p.id} sin foto: ${sinToken(errText(err))}`);
      try {
        await bot.api.sendMessage(chatId, caption, { reply_markup });
        llego = true;
      } catch (e2) {
        console.warn(`⚠️  Preview de ${p.id} no llegó a ${chatId}: ${sinToken(errText(e2))}`);
      }
    }
  }
  return llego;
}

/**
 * Tras cada sincronización (o cada hora si no hay sincronización): renderizadas →
 * `programado` + preview (reintento si no llegó); render pendiente; silencio del planificador.
 */
async function revisarCalendario(): Promise<void> {
  try {
    const ahora = new Date();
    const { semanas } = await semanasActivas();
    for (const x of previewsPendientes(semanas, ahora, (k) => Boolean(leerClaveDb(K_PREVIEW + k)))) {
      const s = semanas.find((y) => y.semana === x.semana)!;
      if (x.nueva) {
        await escribirEstado(x.semana, x.pieza.id, { estado: "programado" });
        s.estado[x.pieza.id] = { estado: "programado" };
        commitCalendario([estadoPath(x.semana)], `calendario: programado ${x.pieza.id}`);
      }
      if (await enviarPreview(s, x.pieza, x.medios)) guardarClaveDb(K_PREVIEW + claveFila(x.semana, x.pieza.id), ahora.toISOString());
      else console.warn(`⚠️  El preview de ${x.pieza.id} no llegó a ningún chat; lo reintento en la próxima revisión.`);
    }
    const ya = semanas.flatMap((s) => ETAPAS_RENDER.map((e) => `${s.semana}:${e}`)).filter((k) => leerClaveDb(K_RENDER + k));
    const render = avisoRenderPendiente(semanas, ahora, ya);
    if (render && (await sendToAdmins(render.texto))) guardarClaveDb(K_RENDER + render.clave, ahora.toISOString());
    const siguiente = addDays(weekMonday(ahora), 7);
    const silencio = silencioCalendario(await semanasConPlan([siguiente], leerSemana), ahora);
    const kSilencio = K_SILENCIO + siguiente;
    if (silencio && !leerClaveDb(kSilencio) && (await sendToAdmins(silencio))) guardarClaveDb(kSilencio, ahora.toISOString());
  } catch (err) {
    console.warn(`⚠️  Calendario (revisión): ${sinToken(errText(err))}`);
  }
}

/** Avisos de cada minuto: post-publicación (a los 2 min, con permalink si ya está) y recordatorio del lunes. */
async function avisosDelMinuto(): Promise<void> {
  const ahora = new Date();
  // Anterior, en curso y siguiente: una pieza forzada de la semana siguiente también avisa.
  const { semanas } = await semanasCalendario(addDays(weekMonday(ahora), -7), 3);
  for (const a of avisosPostPublicacion(semanas, ahora, []).filter((x) => !leerClaveDb(K_POST + x.clave))) {
    let permalink: string | undefined;
    if (calendarioModo === "auto") {
      permalink = await graphGet<{ permalink?: string }>(a.mediaId, { fields: "permalink" })
        .then((r) => (typeof r?.permalink === "string" ? r.permalink : undefined))
        .catch(() => undefined);
    }
    if (await sendToAdmins(`📣 ${a.id} ya está en Instagram${permalink ? `: ${permalink}` : ""}. ${TEXTO_POST_PUBLICACION}`)) {
      guardarClaveDb(K_POST + a.clave, ahora.toISOString());
    }
  }
  if (recordatorioLunes(ahora, leerClaveDb(K_LUNES)) && (await sendToAdmins(TEXTO_RECORDATORIO_LUNES))) {
    guardarClaveDb(K_LUNES, localParts(ahora).dia);
  }
}

let minutoEnCurso = false;
async function minutoCalendario(): Promise<void> {
  if (minutoEnCurso) return;
  minutoEnCurso = true;
  try {
    await tick(depsCalendario()); // nunca lanza; tiene su propio candado
    await avisosDelMinuto();
  } catch (err) {
    console.warn(`⚠️  Calendario: ${sinToken(errText(err))}`);
  } finally {
    minutoEnCurso = false;
  }
}

/** Borra de MEDIA_ROOT los medios publicados hace más de 7 días (Meta ya los copió). */
async function limpiarMediosViejos(): Promise<void> {
  try {
    const ahora = new Date();
    const { semanas } = await semanasCalendario(addDays(weekMonday(ahora), -35), 6);
    const borradas = await limpiarMedios(MEDIA_ROOT, publicadas(semanas), ahora);
    if (borradas.length) console.log(`🧹 Medios borrados (7 días tras publicar): ${borradas.join(", ")}`);
  } catch (err) {
    console.warn(`⚠️  Limpieza de medios: ${sinToken(errText(err))}`);
  }
}

function iniciarCalendario(): void {
  if (!calendarioModo) {
    console.log("📅 Calendario apagado (sin CALENDARIO_MODO): no publico ni aviso nada del calendario.");
    return;
  }
  try {
    depsCalendario();
  } catch (err) {
    throw new Error(`CALENDARIO_MODO=${calendarioModo} necesita la configuración de Meta: ${errText(err)}`);
  }
  if (!mediaToken) console.warn("⚠️  Calendario sin MEDIA_PUBLIC_TOKEN: no sirvo medios y Meta no podrá descargar las piezas.");
  console.log(`📅 Calendario en modo ${calendarioModo}: scheduler cada minuto.`);
  setInterval(() => void minutoCalendario(), CALENDARIO_CADA_MS);
  setTimeout(() => void limpiarMediosViejos(), 5 * 60_000);
  setInterval(() => void limpiarMediosViejos(), LIMPIEZA_MEDIOS_MS);
  // Sin sincronización con GitHub (base local), la revisión corre sola cada hora.
  if (process.env.KB_GIT_PUSH !== "1") {
    setTimeout(() => void revisarCalendario(), SYNC_FIRST_DELAY_MS);
    setInterval(() => void revisarCalendario(), SYNC_INTERVAL_MS);
  }
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
  { command: "metricas", description: "Cómo le fue a tu Instagram esta semana" },
  // Los del calendario, solo si está activo (sin CALENDARIO_MODO el menú queda como antes).
  ...(calendarioModo
    ? [
      { command: "calendario", description: "Piezas de la semana y su estado" },
      { command: "pausar", description: "Pausar el calendario" },
      { command: "reanudar", description: "Reanudar el calendario" },
      { command: "publicar", description: "Publicar ahora una pieza programada de esta semana" },
      { command: "saltar", description: "Saltar una pieza" },
    ]
    : []),
  { command: "ayuda", description: "Cómo usarme" },
]);
console.log(`🤖 Bot en marcha (chats autorizados: ${[...allowed].join(", ")}). Base: ${temasDir().replace(/\/temas$/, "")}`);
if (resumed) console.log(`↻ Retomo ${resumed} guardado(s) que quedaron a medias.`);
iniciarCalendario();
startHttpServer();
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
iniciarMetricas();
void work();
await bot.start({ drop_pending_updates: false });
