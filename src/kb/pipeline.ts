import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fetchImageAsDataUri, ingest, localImageToDataUri, probeDuration } from "../remix/ingest.ts";
import { extractFicha, MAX_IMAGES, synthesizeTopic, transcribe } from "./ai.ts";
import { downloadAudio, downloadVideo, fetchPostMeta } from "./instagram.ts";
import { fichaBaseName, fichaDigest, renderFicha, renderTopic, resolveTopicName, type SourceRef } from "./markdown.ts";
import { frameCount, toSpeechMp3, videoFrames, writeThumbnail } from "./media.ts";
import { isInstagramUrl, normalizeInstagramUrl, shortcodeFromUrl } from "./shortcode.ts";
import {
  adjuntosDir, commitPaths, findFichaById, fuentesDir, kbDir, listFichas, listTopics,
  readIfExists, topicPath, writeNote,
} from "./store.ts";
import type { AddInput, AddResult, Ficha, PostKind, PostMeta } from "./types.ts";

/** Tope de fuentes que se envían al sintetizar un tema (las más recientes). */
const MAX_TOPIC_SOURCES = 40;

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Guarda un post en la base: descarga (imágenes/frames, caption, comentarios,
 * audio) → transcripción → ficha → tema → páginas de tema → commit.
 * Nunca se cae por una descarga parcial: guarda lo que obtuvo y lo marca.
 */
export async function addPost(input: AddInput): Promise<AddResult> {
  const progress = input.onProgress ?? (() => {});
  const cookies = { cookies: input.cookies, cookiesFromBrowser: input.cookiesFromBrowser };

  if (input.url && !isInstagramUrl(input.url)) {
    throw new Error("Ese link no es de un post, reel o carrusel de Instagram.");
  }
  const url = input.url ? normalizeInstagramUrl(input.url) : undefined;

  // 1) Descarga: metadatos + comentarios (yt-dlp) y medios (imágenes, cuadros del reel).
  progress("descargando");
  const meta: PostMeta | null = url ? await fetchPostMeta(url, cookies) : null;
  let source: { type: string; caption: string; mediaDataUris: string[] } = { type: "unknown", caption: "", mediaDataUris: [] };
  let images: string[] = [];
  // Carrusel o post solo de fotos: yt-dlp no descarga las imágenes, pero trae sus URLs.
  // Se bajan directo desde ahí (la ingesta del remix no aportaría nada y solo
  // avisaría de un "login wall" que en realidad ya se venció con yt-dlp).
  if (meta && !meta.hasVideo && meta.imageUrls.length) {
    for (const u of meta.imageUrls.slice(0, MAX_IMAGES)) {
      const uri = await fetchImageAsDataUri(u);
      if (uri) images.push(uri);
    }
  }
  // Reel: se baja el video una vez y de ahí salen los cuadros (uno cada ~3 s, hasta
  // MAX_IMAGES) y, más abajo, el audio para transcribir.
  let video: Awaited<ReturnType<typeof downloadVideo>> = null;
  if (url && meta?.isVideo) {
    video = await downloadVideo(url, cookies);
    if (video) {
      const duration = await probeDuration(video.path);
      images = await videoFrames(video.path, frameCount(duration, MAX_IMAGES), duration);
    }
  }
  // Si lo anterior no alcanzó: cadena de ingesta del remix.
  if (!images.length) {
    try {
      source = await ingest({
        url,
        caption: input.caption,
        image: input.images?.length ? input.images : undefined,
        es: "neutro",
        outDir: "",
        ...cookies,
      });
    } catch (err) {
      // Sin medios ni caption desde la ingesta: se sigue si yt-dlp o las capturas aportaron algo.
      if (!meta?.caption && !input.images?.length) {
        await video?.cleanup();
        throw err;
      }
    }
    images = [...source.mediaDataUris];
  }
  progress("descargando", `${images.length} imagen(es)`);
  // Las capturas se suman a lo descargado (p. ej. capturas de comentarios).
  if (url && input.images?.length) {
    for (const p of input.images) {
      const uri = await localImageToDataUri(p);
      if (uri && !images.includes(uri)) images.push(uri);
    }
  }
  const caption = meta?.caption || source.caption || input.caption || "";
  const comments = meta?.comments ?? [];
  progress("comentarios", comments.length ? `${comments.length} comentarios` : "sin comentarios");

  // 2) Transcripción (solo videos).
  let transcript: string | undefined;
  const isVideo = meta?.isVideo ?? source.type === "reel";
  if (url && isVideo) {
    progress("transcribiendo");
    const audio = video ?? (await downloadAudio(url, cookies));
    if (audio) {
      try {
        const mp3 = await toSpeechMp3(audio.path);
        if (mp3) transcript = (await transcribe(mp3, caption)) || undefined;
      } catch (err) {
        console.warn(`⚠️  No se pudo transcribir: ${err instanceof Error ? err.message : err}`);
      } finally {
        await audio.cleanup();
      }
    }
  }
  await video?.cleanup();

  // 3) Identidad del post y ficha previa (re-compartir actualiza, no duplica).
  const id = (url && shortcodeFromUrl(url)) || `manual-${createHash("sha256").update(images.join("|") + caption).digest("hex").slice(0, 10)}`;
  const previous = await findFichaById(id);
  const notes = [...(previous?.notes ?? [])];
  if (input.note?.trim() && !notes.includes(input.note.trim())) notes.push(input.note.trim());

  // 4) Extracción con el modelo (incluye asignación de tema).
  progress("analizando");
  const topics = await listTopics();
  const kind: PostKind = url ? (meta?.kind ?? (source.type === "reel" ? "reel" : "post")) : "manual";
  const extraction = await extractFicha({ kind, caption, transcript, comments, notes, images, topics });

  const existingNames = topics.map((t) => t.name);
  const main = resolveTopicName(extraction.mainTopic, existingNames);
  const secondary = extraction.secondaryTopics
    .map((s) => resolveTopicName(s, existingNames))
    .filter((s) => !s.isNew && s.name !== main.name)
    .map((s) => s.name)
    .slice(0, 2);

  // 5) Ficha en disco (+ miniatura).
  progress("guardando");
  const ficha: Ficha = {
    id,
    url,
    kind,
    author: meta?.author ?? previous?.author,
    publishedAt: meta?.publishedAt,
    savedAt: previous?.savedAt ?? today(),
    caption,
    transcript,
    notes,
    partial: !!url && (!images.length || (!caption && !transcript)),
    extraction,
  };
  const baseName = previous?.baseName ?? fichaBaseName(ficha);
  const thumbPath = images[0] ? await writeThumbnail(images[0], join(adjuntosDir(), id)) : undefined;
  if (thumbPath) ficha.thumbnail = relative(kbDir(), thumbPath).split("\\").join("/");
  const fichaPath = previous?.path ?? join(fuentesDir(), `${baseName}.md`);
  await writeNote(fichaPath, renderFicha(ficha, main.name, secondary, previous?.raw));

  // 6) Páginas de tema: se regeneran desde sus fichas (no desde su versión previa).
  progress("temas");
  const affected = new Set([main.name, ...secondary]);
  // Si la ficha cambió de tema, el tema anterior también debe actualizarse.
  if (previous?.topic && previous.topic !== main.name) affected.add(previous.topic);
  const touched = [fichaPath];
  if (thumbPath) touched.push(thumbPath);
  const all = await listFichas();
  for (const topic of affected) {
    const members = all.filter((f) => f.topic === topic || f.secondary.includes(topic));
    if (!members.length) continue;
    const recent = members.slice(-MAX_TOPIC_SOURCES);
    const synthesis = await synthesizeTopic(topic, recent.map((f) => fichaDigest(f.body)));
    if (topic === main.name && main.isNew && extraction.newTopicDescription) {
      synthesis.description ||= extraction.newTopicDescription;
    }
    const refs: SourceRef[] = members
      .slice()
      .reverse()
      .map((f) => ({ baseName: f.baseName, title: f.title, author: f.author, savedAt: f.savedAt }));
    const path = topicPath(topic);
    await writeNote(path, renderTopic(topic, synthesis, refs, today(), await readIfExists(path)));
    touched.push(path);
  }

  // 7) Commit (1 guardado = 1 commit; deshacer = revert).
  let commit: string | undefined;
  if (input.commit !== false) {
    progress("commit");
    commit = await commitPaths(touched, `kb: ${previous ? "actualiza" : "agrega"} "${extraction.title}" (${main.name})`);
  }

  return {
    ficha,
    path: fichaPath,
    created: !previous,
    topicsUpdated: [...affected],
    newTopic: main.isNew,
    commit,
  };
}
