import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import matter from "gray-matter";
import { join, relative } from "node:path";
import { fetchImageAsDataUri, localImageToDataUri, probeDuration } from "../remix/ingest.ts";
import { extractFicha, MAX_IMAGES, synthesizeTopic, transcribe } from "./ai.ts";
import { downloadVideo, fetchPostViaMeta, NeedsUserError } from "./instagram.ts";
import { fichaBaseName, fichaDigest, renderFicha, renderTopic, resolveTopicName, unwikilink, wikilink, type SourceRef } from "./markdown.ts";
import { frameCount, toSpeechMp3, videoFrames, writeGallery, writeThumbnail } from "./media.ts";
import { applyNameFixes, groundToolUrls } from "./names.ts";
import { reindex } from "./indexer.ts";
import { resolveTopic } from "./topics.ts";
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
 * Guarda un post en la base: lectura vía la API de Meta (caption, imágenes o
 * video del reel) → cuadros y transcripción → ficha → tema → páginas de tema →
 * commit. Sin tu sesión de Instagram ni scraping. Si Meta no puede leer el post
 * pero hay capturas, guarda la ficha desde ellas.
 */
export async function addPost(input: AddInput): Promise<AddResult> {
  const progress = input.onProgress ?? (() => {});

  if (input.url && !isInstagramUrl(input.url)) {
    throw new Error("Ese link no es de un post, reel o carrusel de Instagram.");
  }
  const url = input.url ? normalizeInstagramUrl(input.url) : undefined;

  // 1) Lectura del post con la API de Meta. El @usuario sale del link original
  //    (la URL normalizada ya no lo trae) o de input.user.
  progress("descargando");
  let meta: PostMeta | null = null;
  if (input.url) {
    try {
      const knownAccounts = [
        ...new Set((await listFichas()).map((f) => f.author?.replace(/^@/, "")).filter((a): a is string => !!a).reverse()),
      ];
      meta = await fetchPostViaMeta(input.url, input.user, { caption: input.caption, text: input.note, knownAccounts }, (msg) =>
        progress("descargando", msg),
      );
    } catch (err) {
      // Sin capturas no hay nada que guardar: el error sube (el bot pregunta el @usuario, etc.).
      if (!input.images?.length || err instanceof NeedsUserError) throw err;
      console.warn(`⚠️  API de Meta: ${err instanceof Error ? err.message : err} Guardo desde las capturas.`);
    }
  }

  let images: string[] = [];
  let video: Awaited<ReturnType<typeof downloadVideo>> = null;
  let directVideo = false;
  // Reel: se baja el video una vez y de ahí salen los cuadros (uno cada ~3 s, hasta
  // MAX_IMAGES) y, más abajo, el audio para transcribir.
  // El video del post; si Meta no lo entrega, el que mandó el usuario (URL o archivo local).
  const videoUrl = meta?.videoUrl ?? input.videoUrl;
  if (videoUrl || input.videoFile) {
    video = videoUrl ? await downloadVideo(videoUrl) : null;
    if (!video && input.videoFile) video = { path: input.videoFile, cleanup: async () => {} };
    if (video) {
      const duration = await probeDuration(video.path);
      images = await videoFrames(video.path, frameCount(duration, MAX_IMAGES), duration);
    }
  }
  // Fotos (o la portada de un reel cuyo video Meta no entrega), o las imágenes de un DM.
  if (!images.length) {
    for (const u of (meta?.imageUrls ?? input.mediaUrls ?? []).slice(0, MAX_IMAGES)) {
      const uri = await fetchImageAsDataUri(u);
      if (uri?.startsWith("data:image/")) images.push(uri);
      else if (uri?.startsWith("data:video/") && !video) {
        // Un "post" que en realidad es video (el DM lo manda como mp4): cuadros + audio, como un reel.
        video = await downloadVideo(u);
        directVideo = !!video;
        if (video) {
          const duration = await probeDuration(video.path);
          images.push(...(await videoFrames(video.path, frameCount(duration, MAX_IMAGES), duration)));
        }
      }
    }
  }
  progress("descargando", `${images.length} imagen(es)`);
  // Las capturas se suman a lo descargado o, si Meta no pudo leer el post, son la fuente.
  for (const p of input.images ?? []) {
    const uri = await localImageToDataUri(p);
    if (uri && !images.includes(uri)) images.push(uri);
  }
  const caption = meta?.caption || input.caption || "";
  if (!caption && !images.length) {
    await video?.cleanup();
    throw new Error("No hay nada que analizar: ni caption ni imágenes. Manda capturas del post.");
  }

  // 2) Transcripción (solo reels con video disponible).
  let transcript: string | undefined;
  if (video) {
    progress("transcribiendo");
    try {
      const mp3 = await toSpeechMp3(video.path);
      if (mp3) transcript = (await transcribe(mp3, caption)) || undefined;
    } catch (err) {
      console.warn(`⚠️  No se pudo transcribir: ${err instanceof Error ? err.message : err}`);
    }
  }
  await video?.cleanup();

  // 3) Identidad del post y ficha previa (re-compartir actualiza, no duplica).
  const id =
    (url && shortcodeFromUrl(url)) ||
    (input.sourceId && `dm-${input.sourceId.replace(/[^\w-]/g, "").slice(-24)}`) ||
    `manual-${createHash("sha256").update(images.join("|") + caption).digest("hex").slice(0, 10)}`;
  const previous = await findFichaById(id);
  const notes = [...(previous?.notes ?? [])];
  if (input.note?.trim() && !notes.includes(input.note.trim())) notes.push(input.note.trim());

  // 4) Extracción con el modelo (incluye asignación de tema).
  progress("analizando");
  const topics = await listTopics();
  const kind: PostKind = url ? (meta?.kind ?? "post") : input.videoUrl || input.videoFile || directVideo ? "reel" : input.mediaUrls?.length ? "post" : "manual";
  const raw = await extractFicha({ kind, caption, transcript, notes, images, topics });
  // Nombres mal transcritos ("Cloud" → "Claude"): se corrigen en toda la ficha y la transcripción.
  const evidence = [caption, ...raw.imageTexts.map((t) => t.text)].join("\n");
  const fixed = applyNameFixes(raw, transcript, evidence);
  transcript = fixed.transcript;
  // Links de herramientas solo si el post los muestra (el modelo inventa dominios "probables").
  const extraction = groundToolUrls(fixed.extraction, `${evidence}\n${transcript ?? ""}`);

  const existingNames = topics.map((t) => t.name);
  // Tema: por nombre equivalente o, si es nuevo, por parecido de significado con los existentes.
  const main = await resolveTopic(extraction.mainTopic, existingNames);
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
    // Parcial: Meta no pudo leer el post (se guardó desde capturas) o faltó contenido.
    partial: (!!url && (!meta || !images.length || (!caption && !transcript))) || (!!input.videoUrl && !transcript && !images.length),
    extraction,
  };
  const baseName = previous?.baseName ?? fichaBaseName(ficha);
  const thumbPath = images[0] ? await writeThumbnail(images[0], join(adjuntosDir(), id)) : undefined;
  const rel = (p: string): string => relative(kbDir(), p).split("\\").join("/");
  if (thumbPath) ficha.thumbnail = rel(thumbPath);
  // Galería completa (fuera de git): todas las slides/cuadros para verlos en Obsidian.
  const gallery = await writeGallery(images, join(adjuntosDir(), "slides", id));
  if (gallery.length) ficha.gallery = gallery.map(rel);
  const fichaPath = previous?.path ?? join(fuentesDir(), `${baseName}.md`);
  await writeNote(fichaPath, renderFicha(ficha, main.name, secondary, previous?.raw));

  // 6) Páginas de tema: se regeneran desde sus fichas (no desde su versión previa).
  progress("temas");
  const affected = new Set([main.name, ...secondary]);
  // Si la ficha cambió de tema, el tema anterior también debe actualizarse.
  if (previous?.topic && previous.topic !== main.name) affected.add(previous.topic);
  const touched = [fichaPath];
  if (thumbPath) touched.push(thumbPath);
  touched.push(
    ...(await refreshTopics(affected, main.isNew && extraction.newTopicDescription ? { [main.name]: extraction.newTopicDescription } : {})),
  );

  // 7) Commit (1 guardado = 1 commit; deshacer = revert).
  let commit: string | undefined;
  if (input.commit !== false) {
    progress("commit");
    commit = await commitPaths(touched, `kb: ${previous ? "actualiza" : "agrega"} "${extraction.title}" (${main.name})`);
  }

  // 8) Índice para consultas (derivado: si falla, `npm run kb:reindex` lo repara).
  progress("indexando");
  try {
    await reindex();
  } catch (err) {
    console.warn(`⚠️  No pude actualizar el índice (corre npm run kb:reindex): ${err instanceof Error ? err.message : err}`);
  }

  return {
    ficha,
    path: fichaPath,
    created: !previous,
    topicsUpdated: [...affected],
    newTopic: main.isNew,
    topicMergedFrom: main.mergedFrom,
    commit,
  };
}

/**
 * Regenera las páginas de los temas indicados desde sus fichas (no desde su
 * versión previa). Si un tema se quedó sin fichas, borra su página. Devuelve las
 * rutas tocadas (escritas o borradas) para el commit.
 */
export async function refreshTopics(topics: Iterable<string>, newDescriptions: Record<string, string> = {}): Promise<string[]> {
  const touched: string[] = [];
  const all = await listFichas();
  for (const topic of topics) {
    const path = topicPath(topic);
    const members = all.filter((f) => f.topic === topic || f.secondary.includes(topic));
    if (!members.length) {
      if (existsSync(path)) {
        await rm(path);
        touched.push(path);
      }
      continue;
    }
    const recent = members.slice(-MAX_TOPIC_SOURCES);
    let synthesis: Awaited<ReturnType<typeof synthesizeTopic>>;
    try {
      synthesis = await synthesizeTopic(topic, recent.map((f) => fichaDigest(f.body)));
    } catch (err) {
      // Un tema que no se pudo resumir no bloquea el guardado: se conserva su página
      // anterior (la ficha ya quedó bien); si no existía, se crea con la lista de fuentes.
      console.warn(`⚠️  No pude resumir el tema "${topic}" (${err instanceof Error ? err.message : err}). Lo reintento en el próximo guardado.`);
      if (existsSync(path)) continue;
      synthesis = { description: newDescriptions[topic] ?? "", essentials: [], tools: [], techniques: [] };
    }
    if (newDescriptions[topic]) synthesis.description ||= newDescriptions[topic];
    const refs: SourceRef[] = members
      .slice()
      .reverse()
      .map((f) => ({ baseName: f.baseName, title: f.title, author: f.author, savedAt: f.savedAt }));
    await writeNote(path, renderTopic(topic, synthesis, refs, today(), await readIfExists(path)));
    touched.push(path);
  }
  return touched;
}

/**
 * Cambia el tema principal de una ficha (botón "Cambiar tema" del bot): reescribe
 * la propiedad `tema` y la línea "Tema:" de la ficha, regenera el tema anterior
 * y el nuevo, commitea y reindexa. El nombre pasa por la misma resolución que al
 * guardar (se une a un tema existente equivalente).
 */
export async function changeTopic(id: string, requested: string): Promise<{ from?: string; to: string; commit?: string }> {
  const f = await findFichaById(id);
  if (!f) throw new Error(`No encontré la ficha ${id}.`);
  const topics = (await listTopics()).map((t) => t.name).filter((t) => t !== f.topic);
  const to = (await resolveTopic(requested, topics)).name;
  if (to === f.topic) return { from: f.topic, to };

  const { data, content } = matter(f.raw);
  data.tema = wikilink(to);
  data.temas_secundarios = (Array.isArray(data.temas_secundarios) ? data.temas_secundarios : []).filter(
    (t: unknown) => unwikilink(t) !== to,
  );
  const body = f.topic ? content.split(`Tema: ${wikilink(f.topic)}`).join(`Tema: ${wikilink(to)}`) : content;
  await writeNote(f.path, matter.stringify(body, data));

  const touched = [f.path, ...(await refreshTopics([to, ...(f.topic ? [f.topic] : [])]))];
  const commit = await commitPaths(touched, `kb: actualiza tema de "${f.title}" (${f.topic ?? "sin tema"} → ${to})`);
  await reindex();
  return { from: f.topic, to, commit };
}
