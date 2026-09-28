import assert from "node:assert/strict";
import matter from "gray-matter";
import { findInstagramUrl, findInstagramUrls, isInstagramUrl, normalizeInstagramUrl, shortcodeFromUrl } from "../src/kb/shortcode.ts";
import { metaToPostMeta, resolveUser } from "../src/kb/instagram.ts";
import { dmAction, parseWebhook, validSignature } from "../src/kb/inbox.ts";
import { splitDm } from "../src/meta/messages.ts";
import { createHmac } from "node:crypto";
import {
  AUTO_END, AUTO_START, fichaBaseName, fichaDigest, renderFicha, renderTopic, replaceAutoZone,
  resolveTopicName, safeFileName, safeUrl, topicKey, unwikilink,
} from "../src/kb/markdown.ts";
import { hasControlChars, stripControlChars } from "../src/kb/ai.ts";
import { frameCount } from "../src/kb/media.ts";
import { applyNameFixes, groundToolUrls, validFixes } from "../src/kb/names.ts";
import { chunkFicha, splitText } from "../src/kb/indexer.ts";
import { ftsQuery, parseDateRange, rrfFuse, type Hit } from "../src/kb/search.ts";
import { citedNumbers, groupSources } from "../src/kb/ask.ts";
import { closestTopic, reviewCandidates } from "../src/kb/topics.ts";
import {
  escapeHtml, formatAnswer, formatAnswerText, formatSaved, formatSavedText, handleInText, handleReply, mdToTelegramHtml, noteFromMessage, splitMessage,
} from "../src/kb/telegram.ts";
import { enqueue, finish, pendingCount, requeueInterrupted, takeNext } from "../src/kb/queue.ts";
import { closeDb } from "../src/kb/db.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import type { Ficha } from "../src/kb/types.ts";

/**
 * Smoke tests offline de la base de conocimiento (src/kb): solo funciones puras.
 * Sin red, OpenAI, yt-dlp ni ffmpeg.
 */
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log("✓", name);
  } catch (e) {
    failed++;
    console.error("✗", name, "—", e instanceof Error ? e.message : e);
  }
}

const ficha = (over: Partial<Ficha> = {}): Ficha => ({
  id: "ABC123",
  url: "https://www.instagram.com/reel/ABC123/",
  kind: "reel",
  author: "@usuario",
  publishedAt: "2026-09-20",
  savedAt: "2026-09-26",
  caption: "Cómo resumir tus correos con IA",
  transcript: "Hola, hoy te enseño…",
  notes: ["para el cliente X"],
  partial: false,
  extraction: {
    title: "Resumir Gmail con ChatGPT y Make",
    summary: "Tutorial para resumir correos automáticamente.",
    keyIdeas: ["Filtrar por remitente ahorra créditos"],
    tools: [{ name: "Make", url: null, purpose: "orquestar el flujo" }],
    steps: ["Conectar Gmail", "Agregar módulo de ChatGPT"],
    resources: [],
    imageTexts: [],
    nameFixes: [],
    mainTopic: "Automatización con IA",
    newTopicDescription: null,
    secondaryTopics: [],
    tags: ["automatizacion", "gmail"],
    language: "es",
    confidence: "high",
  },
  ...over,
});

// --- shortcode ---
check("normalizeInstagramUrl quita igsh/utm y unifica reels→reel", () => {
  assert.equal(
    normalizeInstagramUrl("https://www.instagram.com/reels/DAbc-12_x/?igsh=MWx0&utm_source=ig_web"),
    "https://www.instagram.com/reel/DAbc-12_x/",
  );
  assert.equal(normalizeInstagramUrl("https://instagram.com/usuario/p/XyZ/"), "https://www.instagram.com/p/XyZ/");
});

check("shortcodeFromUrl / isInstagramUrl / findInstagramUrl", () => {
  assert.equal(shortcodeFromUrl("https://www.instagram.com/p/C9x_Y-1/?img_index=2"), "C9x_Y-1");
  assert.equal(shortcodeFromUrl("https://www.instagram.com/usuario/"), undefined);
  assert.equal(isInstagramUrl("https://www.instagram.com/tv/abc/"), true);
  assert.equal(isInstagramUrl("https://youtube.com/watch?v=1"), false);
  assert.equal(
    findInstagramUrl("mira esto https://www.instagram.com/p/ABC/?igsh=x genial"),
    "https://www.instagram.com/p/ABC/?igsh=x",
  );
});

// --- yt-dlp ---
// --- temas ---
check("resolveTopicName reutiliza el existente ignorando acentos/mayúsculas", () => {
  const existing = ["Automatización con IA", "Edición de video"];
  assert.deepEqual(resolveTopicName("automatizacion con ia", existing), { name: "Automatización con IA", isNew: false });
  assert.deepEqual(resolveTopicName("diseño: UX/UI", existing), { name: "Diseño UX UI", isNew: true });
  assert.equal(topicKey("  Edición de VIDEO! "), "edicion de video");
  assert.equal(safeFileName("[[a|b]]"), "a b");
});

// --- zonas ---
check("replaceAutoZone conserva lo que está fuera de la zona automática", () => {
  const first = replaceAutoZone(undefined, "v1");
  assert.ok(first.includes(`${AUTO_START}\nv1\n${AUTO_END}`));
  assert.ok(first.includes("## Mis notas"));
  const edited = first.replace("## Mis notas\n\n", "## Mis notas\n\nMi idea importante\n");
  const second = replaceAutoZone(edited, "v2");
  assert.ok(second.includes("v2") && !second.includes("v1"));
  assert.ok(second.includes("Mi idea importante"));
  // Nota creada a mano sin marcadores: se antepone la zona y se conserva el texto.
  const manual = replaceAutoZone("texto mío", "auto");
  assert.ok(manual.startsWith(AUTO_START) && manual.endsWith("texto mío"));
});

// --- ficha ---
check("renderFicha: frontmatter de Obsidian, wikilinks y secciones", () => {
  const out = renderFicha(ficha(), "Automatización con IA", ["Productividad"]);
  const { data, content } = matter(out);
  assert.equal(data.tema, "[[Automatización con IA]]");
  assert.deepEqual(data.temas_secundarios, ["[[Productividad]]"]);
  assert.deepEqual(data.tags, ["kb/fuente", "automatizacion", "gmail"]);
  assert.equal(data.id, "ABC123");
  assert.ok(content.includes("# Resumir Gmail con ChatGPT y Make"));
  assert.ok(content.includes("## Pasos\n\n1. Conectar Gmail"));
  assert.ok(content.includes("> [!quote]- Transcripción"));
  assert.ok(!content.includes("## Recursos")); // sección vacía omitida
});

check("renderFicha sobre una versión previa conserva notas y propiedades del usuario", () => {
  const v1 = renderFicha(ficha(), "Automatización con IA", []);
  const edited = v1.replace("## Mis notas\n\n", "## Mis notas\n\nProbarlo el lunes\n").replace("---\n", "---\nestado: pendiente\n");
  const v2 = renderFicha(ficha({ extraction: { ...ficha().extraction, title: "Título nuevo" } }), "Automatización con IA", [], edited);
  const { data, content } = matter(v2);
  assert.equal(data.estado, "pendiente");
  assert.equal(data.titulo, "Título nuevo");
  assert.ok(content.includes("Probarlo el lunes"));
  assert.ok(!content.includes("Resumir Gmail con ChatGPT y Make"));
});

check("fichaBaseName y unwikilink", () => {
  assert.equal(fichaBaseName({ savedAt: "2026-09-26", author: "@user.name", id: "ABC" }), "2026-09-26-user.name-ABC");
  assert.equal(fichaBaseName({ savedAt: "2026-09-26", id: "manual-1" }), "2026-09-26-manual-1");
  assert.equal(unwikilink("[[Tema|alias]]"), "Tema");
  assert.equal(unwikilink("Tema"), "Tema");
  assert.equal(unwikilink(3), undefined);
});

check("fichaDigest quita caption/transcripción e imágenes", () => {
  const body = matter(renderFicha({ ...ficha(), thumbnail: "_adjuntos/ABC123.webp" }, "T", [])).content;
  const d = fichaDigest(body);
  assert.ok(d.includes("Ideas clave"));
  assert.ok(!d.includes("Transcripción") && !d.includes("Caption original"));
  assert.ok(!d.includes("![["));
});

// --- tema ---
check("renderTopic lista fuentes con wikilinks y conserva Mis notas", () => {
  const s = { description: "Flujos con IA", essentials: ["Empieza simple"], tools: [{ name: "Make", purpose: "orquestar" }], techniques: [] };
  const refs = [{ baseName: "2026-09-26-usuario-ABC123", title: "Resumir Gmail", author: "@usuario", savedAt: "2026-09-26" }];
  const v1 = renderTopic("Automatización con IA", s, refs, "2026-09-26");
  const withNotes = v1.replace("## Mis notas\n\n", "## Mis notas\n\nIdeas propias\n");
  const v2 = renderTopic("Automatización con IA", s, refs, "2026-09-27", withNotes);
  const { data, content } = matter(v2);
  assert.equal(data.fuentes, 1);
  assert.equal(data.actualizado, "2026-09-27");
  assert.ok(content.includes("[[2026-09-26-usuario-ABC123|Resumir Gmail]] — @usuario · 2026-09-26"));
  assert.ok(content.includes("## Fuentes (1)"));
  assert.ok(content.includes("Ideas propias"));
  assert.ok(!content.includes("## Técnicas"));
});

check("renderFicha: texto de las imágenes en un callout plegado, fuera del digest del tema", () => {
  const f = ficha({
    kind: "carrusel",
    extraction: { ...ficha().extraction, imageTexts: [{ image: 1, text: "5 PROMPTS\nque uso a diario\n> comentá GUIA" }, { image: 2, text: "  " }] },
  });
  const body = matter(renderFicha(f, "T", [])).content;
  assert.ok(body.includes("> [!quote]- Texto de las imágenes\n> **Imagen 1**\n> 5 PROMPTS\n> que uso a diario"));
  assert.ok(body.includes("> \\> comentá GUIA"));
  assert.ok(!body.includes("Imagen 2"));
  assert.ok(!fichaDigest(body).includes("5 PROMPTS"));
  const reel = matter(renderFicha(ficha({ extraction: { ...ficha().extraction, imageTexts: [{ image: 3, text: "Paso 1" }] } }), "T", [])).content;
  assert.ok(reel.includes("**Cuadro 3**"));
});

check("frameCount: un cuadro cada ~3 s, entre 5 y el máximo", () => {
  assert.equal(frameCount(8, 12), 5);
  assert.equal(frameCount(30, 12), 10);
  assert.equal(frameCount(90, 12), 12);
  assert.equal(frameCount(undefined, 12), 5);
  assert.equal(frameCount(60, 3), 3);
});

check("applyNameFixes: corrige nombres en toda la ficha y la transcripción, no en el texto de imágenes", () => {
  const ex = {
    ...ficha().extraction,
    title: "Cinco proyectos con Cloud",
    tools: [{ name: "Cloud Banana", url: null, purpose: "imágenes con Cloud" }],
    keyIdeas: ["Cloudflare no se toca", "cloud edita solo"],
    imageTexts: [{ image: 1, text: "Claude Code construye todo" }],
    nameFixes: [{ wrong: "Cloud", right: "Claude" }],
  };
  const { extraction, transcript } = applyNameFixes(ex, "La gente tiene Cloud y no lo usa.", "Comenta CLAUDE\nClaude Code construye todo");
  assert.equal(extraction.title, "Cinco proyectos con Claude");
  assert.equal(extraction.tools[0].name, "Claude Banana");
  assert.equal(extraction.tools[0].purpose, "imágenes con Claude");
  assert.deepEqual(extraction.keyIdeas, ["Cloudflare no se toca", "Claude edita solo"]);
  assert.equal(extraction.imageTexts[0].text, "Claude Code construye todo");
  assert.equal(transcript, "La gente tiene Claude y no lo usa.");
});

check("groundToolUrls: conserva links cuyo dominio aparece en el post y borra los inventados", () => {
  const ex = {
    ...ficha().extraction,
    tools: [
      { name: "Magnifique", url: "https://magnifique.com", purpose: "anuncios" },
      { name: "Higgsfield", url: "https://www.higgsfield.ai/seedance", purpose: "video" },
      { name: "Make", url: null, purpose: "flujos" },
      { name: "Raro", url: "no es url", purpose: "x" },
    ],
  };
  const out = groundToolUrls(ex, "Entra a higgsfield.ai y busca Seedance. Magnifique es genial.");
  assert.deepEqual(out.tools.map((t) => t.url), [null, "https://www.higgsfield.ai/seedance", null, null]);
});

check("validFixes: descarta correcciones sin evidencia o cuando la palabra es legítima", () => {
  const fixes = [{ wrong: "Cloud", right: "Claude" }];
  assert.deepEqual(validFixes(fixes, "Comenta CLAUDE"), fixes);
  assert.deepEqual(validFixes(fixes, "sin el nombre correcto"), []);
  assert.deepEqual(validFixes(fixes, "Claude en Google Cloud"), []);
  assert.deepEqual(validFixes([{ wrong: "IA", right: "AI" }], "AI"), []);
});

check("renderFicha: galería plegada con todas las imágenes, fuera del digest", () => {
  const body = matter(renderFicha({ ...ficha(), gallery: ["_adjuntos/slides/ABC123/01.jpg", "_adjuntos/slides/ABC123/02.jpg"] }, "T", [])).content;
  assert.ok(body.includes("> [!example]- Imágenes (2)\n> ![[_adjuntos/slides/ABC123/01.jpg|240]] ![[_adjuntos/slides/ABC123/02.jpg|240]]"));
  assert.ok(!fichaDigest(body).includes("slides/ABC123"));
  assert.ok(!matter(renderFicha(ficha(), "T", [])).content.includes("[!example]"));
});

check("stripControlChars: limpia tildes corruptas en toda la respuesta, conserva saltos de línea", () => {
  const dirty = { description: "La monetizaci\u0010n", essentials: ["a\nb", "atenci\u0010n"], n: 3 };
  assert.ok(hasControlChars(dirty));
  const clean = stripControlChars(dirty);
  assert.deepEqual(clean, { description: "La monetizacin", essentials: ["a\nb", "atencin"], n: 3 });
  assert.ok(!hasControlChars(clean));
  assert.ok(!hasControlChars({ t: "línea 1\nlínea 2\ttab" }));
});

check("safeUrl: solo links http(s) absolutos", () => {
  assert.equal(safeUrl("https://higgsfield.ai/seedance"), "https://higgsfield.ai/seedance");
  assert.equal(safeUrl("/"), undefined);
  assert.equal(safeUrl("higgsfield.ai"), undefined);
  assert.equal(safeUrl("https://"), undefined);
  assert.equal(safeUrl(null), undefined);
  const body = renderFicha(
    ficha({ extraction: { ...ficha().extraction, tools: [{ name: "Seedance", purpose: "video", url: "/" }, { name: "Make", purpose: "flujos", url: "https://make.com" }] } }),
    "T", [],
  );
  assert.ok(!body.includes("[link](/)"));
  assert.ok(body.includes("[link](https://make.com)"));
});

// --- iteración 2: índice y consultas ---
check("chunkFicha: secciones y callouts de cita, sin Origen ni galería; incluye Mis notas", () => {
  const f = {
    ...ficha(),
    gallery: ["_adjuntos/slides/ABC123/01.jpg"],
    extraction: { ...ficha().extraction, imageTexts: [{ image: 1, text: "5 PROMPTS" }] },
  };
  const body = matter(renderFicha(f, "Automatización con IA", [])).content.replace("## Mis notas\n", "## Mis notas\n\nProbar con el cliente X\n");
  const chunks = chunkFicha(body);
  const sections = chunks.map((c) => c.section);
  assert.ok(sections.includes("Qué es"));
  assert.ok(sections.includes("Ideas clave"));
  assert.ok(sections.includes("Herramientas"));
  assert.ok(sections.includes("Texto de las imágenes"));
  assert.ok(sections.includes("Transcripción"));
  assert.ok(sections.includes("Caption original"));
  assert.ok(!sections.includes("Origen"));
  assert.ok(!sections.some((s) => s.startsWith("Imágenes")));
  assert.equal(chunks.find((c) => c.section === "Mis notas")?.text, "Probar con el cliente X");
  assert.equal(chunks.find((c) => c.section === "Texto de las imágenes")?.text, "**Cuadro 1**\n5 PROMPTS");
  assert.ok(!chunks.some((c) => c.text.includes("> ")));
});

check("splitText: respeta el máximo partiendo por párrafos y líneas", () => {
  const long = Array.from({ length: 30 }, (_, i) => `Párrafo ${i} ${"x".repeat(80)}`).join("\n\n");
  const parts = splitText(long, 400);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 400));
  assert.equal(parts.join("\n\n"), long);
  assert.ok(splitText("y".repeat(1000), 300).every((p) => p.length <= 300));
});

check("parseDateRange: hoy, ayer, esta semana, semana pasada, últimos N días, meses", () => {
  const today = "2026-09-26"; // sábado
  assert.deepEqual(parseDateRange("¿qué guardé hoy?", today), { from: "2026-09-26", to: "2026-09-26", label: "hoy" });
  assert.equal(parseDateRange("lo de ayer", today)?.from, "2026-09-25");
  assert.deepEqual(parseDateRange("qué guardé esta semana", today), { from: "2026-09-21", to: "2026-09-26", label: "esta semana" });
  assert.deepEqual(parseDateRange("la semana pasada", today), { from: "2026-09-14", to: "2026-09-20", label: "la semana pasada" });
  assert.equal(parseDateRange("últimos 10 días", today)?.from, "2026-09-17");
  assert.deepEqual(parseDateRange("el mes pasado", today), { from: "2026-08-01", to: "2026-08-31", label: "el mes pasado" });
  assert.equal(parseDateRange("este mes", today)?.from, "2026-09-01");
  assert.equal(parseDateRange("herramientas para video", today), undefined);
});

check("ftsQuery: palabras relevantes entre comillas; sin stopwords ni símbolos peligrosos", () => {
  assert.equal(ftsQuery("¿Qué herramientas guardé para editar video?"), '"herramientas" OR "editar" OR "video"');
  assert.equal(ftsQuery('prompts "UGC" AND NEAR(x)'), '"prompts" OR "ugc" OR "and" OR "near"');
  assert.equal(ftsQuery("¿qué es?"), undefined);
});

check("rrfFuse: premia lo que aparece arriba en ambas listas", () => {
  const s = rrfFuse([[1, 2, 3], [3, 1, 4]]);
  const order = [...s.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  assert.deepEqual(order.slice(0, 2), [1, 3]);
});

check("groupSources y citedNumbers: fuentes numeradas por ficha y citas usadas", () => {
  const hit = (baseName: string, chunkId: number): Hit => ({
    chunkId, postId: baseName, section: "Qué es", text: `t${chunkId}`, score: 1, title: baseName, path: `${baseName}.md`, baseName,
  });
  const g = groupSources([hit("a", 1), hit("b", 2), hit("a", 3), hit("a", 4), hit("c", 5)], 2, 2);
  assert.deepEqual(g.map((x) => [x.source.n, x.source.baseName, x.chunks.map((c) => c.chunkId)]), [[1, "a", [1, 3]], [2, "b", [2]]]);
  assert.deepEqual(citedNumbers("Usa Make [1] y n8n [2, 3]. Otra vez [1]."), [1, 2, 3]);
  assert.deepEqual(citedNumbers("sin citas"), []);
});

check("closestTopic: reutiliza el tema más parecido solo sobre el umbral", () => {
  const v = (...xs: number[]) => Float32Array.from(xs);
  const existing = [{ name: "Automatización con IA", vector: v(1, 0, 0) }, { name: "Diseño", vector: v(0, 1, 0) }];
  const m = closestTopic(v(0.9, 0.436, 0), existing, 0.8);
  assert.equal(m?.name, "Automatización con IA");
  assert.ok(Math.abs((m?.score ?? 0) - 0.9) < 1e-6);
  assert.equal(closestTopic(v(0.7, 0.714, 0), existing, 0.8), undefined);
  assert.equal(closestTopic(v(1, 0, 0), [], 0.8), undefined);
});

check("reviewCandidates: solo la zona dudosa [piso, umbral), del más al menos parecido", () => {
  const v = (...xs: number[]) => Float32Array.from(xs);
  const existing = [
    { name: "Casi igual", vector: v(0.9, 0.436, 0) },
    { name: "Dudoso alto", vector: v(0.75, 0.661, 0) },
    { name: "Dudoso bajo", vector: v(0.6, 0.8, 0) },
    { name: "Distinto", vector: v(0, 1, 0) },
  ];
  assert.deepEqual(reviewCandidates(v(1, 0, 0), existing, 0.55, 0.8).map((c) => c.name), ["Dudoso alto", "Dudoso bajo"]);
});

// --- iteración 3: bot de Telegram ---
check("findInstagramUrls: todos los posts de un mensaje, sin repetir", () => {
  const text = "mira https://www.instagram.com/reel/AAA111/?igsh=x y https://instagram.com/p/BBB222/ y otra vez https://www.instagram.com/reel/AAA111/";
  assert.deepEqual(findInstagramUrls(text).map((u) => shortcodeFromUrl(u)), ["AAA111", "BBB222"]);
  assert.deepEqual(findInstagramUrls("sin links"), []);
});

check("noteFromMessage: el texto que acompaña al link es la nota", () => {
  const url = "https://www.instagram.com/reel/AAA111/?igsh=x";
  assert.equal(noteFromMessage(`para el cliente X ${url}`, [url]), "para el cliente X");
  assert.equal(noteFromMessage(url, [url]), undefined);
});

check("splitMessage: respeta el límite y no pierde texto", () => {
  const long = Array.from({ length: 200 }, (_, i) => `Línea ${i} ${"x".repeat(40)}`).join("\n");
  const parts = splitMessage(long, 1000);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 1000));
  assert.equal(parts.join("\n").replace(/\s+/g, ""), long.replace(/\s+/g, ""));
  assert.deepEqual(splitMessage("corto"), ["corto"]);
});

check("HTML de Telegram: escapa y convierte negritas; fuentes como links", () => {
  assert.equal(escapeHtml("a < b & c > d"), "a &lt; b &amp; c &gt; d");
  assert.equal(mdToTelegramHtml("Usa **Make** <gratis>"), "Usa <b>Make</b> &lt;gratis&gt;");
  const html = formatAnswer({
    answer: "Usa **Seedance** [1].",
    sources: [{ n: 1, title: "UGC <5 min>", author: "@ai._kid", savedAt: "2026-09-26", url: "https://www.instagram.com/p/X/", baseName: "b" }],
    found: true,
  });
  assert.ok(html.includes("Usa <b>Seedance</b> [1]."));
  assert.ok(html.includes('[1] <a href="https://www.instagram.com/p/X/">UGC &lt;5 min&gt;</a> — @ai._kid · 2026-09-26'));
});

check("formatSaved: ficha resumida con tema, ideas, herramientas y aviso de parcial", () => {
  const f = { ...ficha(), partial: true };
  const html = formatSaved(
    { ficha: f, path: "x.md", created: true, topicsUpdated: ["Automatización con IA"], newTopic: true },
    [{ title: "Otro post", baseName: "o" }],
  );
  assert.ok(html.startsWith("✅ <b>Guardado:</b> Resumir Gmail con ChatGPT y Make"));
  assert.ok(html.includes("🗂 Tema: <b>Automatización con IA</b> (nuevo)"));
  assert.ok(html.includes("🧰 <b>Herramientas:</b> Make"));
  assert.ok(html.includes("🔗 <b>Relacionados</b>\n• Otro post"));
  assert.ok(html.includes("⚠️"));
});

check("cola: FIFO, un trabajo a la vez y se retoma tras un corte", () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-queue-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    enqueue(1, { url: "https://www.instagram.com/p/A/" }, 10);
    enqueue(1, { url: "https://www.instagram.com/p/B/" });
    assert.equal(pendingCount(), 2);
    const a = takeNext();
    assert.equal(a?.payload.url, "https://www.instagram.com/p/A/");
    assert.equal(a?.statusMsgId, 10);
    assert.equal(requeueInterrupted(), 1); // "se cortó la luz" con A corriendo
    assert.equal(takeNext()?.payload.url, "https://www.instagram.com/p/A/");
    finish(a!.id);
    const b = takeNext();
    assert.equal(b?.payload.url, "https://www.instagram.com/p/B/");
    finish(b!.id, "falló");
    assert.equal(takeNext(), undefined);
    assert.equal(pendingCount(), 0);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Meta: lectura de posts (Business Discovery) ---
check("metaToPostMeta: carrusel con slides de foto y de video (portada)", () => {
  const m = metaToPostMeta({
    id: "1", media_type: "CAROUSEL_ALBUM", caption: "cap", timestamp: "2026-09-21T10:00:00+0000",
    permalink: "https://www.instagram.com/p/AAA/",
    children: { data: [
      { media_type: "IMAGE", media_url: "https://cdn/1.jpg" },
      { media_type: "VIDEO", media_url: "https://cdn/2.mp4", thumbnail_url: "https://cdn/2.jpg" },
    ] },
  }, "@ai._kid");
  assert.equal(m.kind, "carrusel");
  assert.equal(m.author, "@ai._kid");
  assert.equal(m.publishedAt, "2026-09-21");
  assert.deepEqual(m.imageUrls, ["https://cdn/1.jpg", "https://cdn/2.jpg"]);
  assert.equal(m.isVideo, false);
  assert.equal(m.hasVideo, true);
  assert.equal(m.videoUrl, undefined);
});

check("metaToPostMeta: reel con video, reel sin media_url y foto", () => {
  const reel = metaToPostMeta({ id: "2", media_type: "VIDEO", media_url: "https://cdn/r.mp4", thumbnail_url: "https://cdn/r.jpg" }, "natgeo");
  assert.equal(reel.kind, "reel");
  assert.equal(reel.videoUrl, "https://cdn/r.mp4");
  assert.deepEqual(reel.imageUrls, ["https://cdn/r.jpg"]);
  const sinVideo = metaToPostMeta({ id: "3", media_type: "VIDEO", thumbnail_url: "https://cdn/t.jpg" }, "natgeo");
  assert.equal(sinVideo.videoUrl, undefined);
  assert.deepEqual(sinVideo.imageUrls, ["https://cdn/t.jpg"]);
  const foto = metaToPostMeta({ id: "4", media_type: "IMAGE", media_url: "https://cdn/f.jpg" }, "natgeo");
  assert.equal(foto.kind, "post");
  assert.deepEqual(foto.imageUrls, ["https://cdn/f.jpg"]);
});

check("resolveUser: --user (con o sin @) gana; si no, el que trae el link", () => {
  assert.equal(resolveUser("https://www.instagram.com/p/AAA/", "@natgeo"), "natgeo");
  assert.equal(resolveUser("https://www.instagram.com/natgeo/p/AAA/"), "natgeo");
  assert.equal(resolveUser("https://www.instagram.com/reel/AAA/?igsh=x"), undefined);
});

check("@usuario en Telegram: mencionado junto al link o como respuesta suelta", () => {
  const url = "https://www.instagram.com/reel/AAA111/?igsh=x";
  assert.equal(handleInText(`@natgeo ${url} para el cliente X`), "natgeo");
  assert.equal(handleInText(`${url} de @ia.punto.es`), "ia.punto.es");
  assert.equal(handleInText("correo@dominio.com"), undefined);
  assert.equal(noteFromMessage(`@natgeo ${url} para el cliente X`, [url], "natgeo"), "para el cliente X");
  assert.equal(handleReply("@natgeo"), "natgeo");
  assert.equal(handleReply(" ai._kid "), "ai._kid");
  assert.equal(handleReply("¿qué guardé sobre video?"), undefined);
});

// --- DMs de Instagram (webhook de Meta) ---
const igWebhook = (messaging: unknown[]) => ({ object: "instagram", entry: [{ id: "17841475604423386", time: 1, messaging }] });

check("validSignature: HMAC-SHA256 del body crudo con el app secret", () => {
  const body = Buffer.from('{"object":"instagram"}');
  const sig = "sha256=" + createHmac("sha256", "secreto").update(body).digest("hex");
  assert.equal(validSignature(body, sig, "secreto"), true);
  assert.equal(validSignature(body, sig, "otro"), false);
  assert.equal(validSignature(Buffer.from('{"object":"x"}'), sig, "secreto"), false);
  assert.equal(validSignature(body, undefined, "secreto"), false);
  assert.equal(validSignature(body, "sha256=corta", "secreto"), false);
});

check("parseWebhook: mensajes con adjuntos; ignora ecos, borrados, lecturas y otros objetos", () => {
  const events = parseWebhook(igWebhook([
    { sender: { id: "111" }, timestamp: 5, message: { mid: "m1", attachments: [{ type: "ig_reel", payload: { url: "https://cdn/v.mp4", title: "caption del reel", reel_video_id: "999" } }] } },
    { sender: { id: "222" }, message: { mid: "m2", text: "respuesta", is_echo: true } },
    { sender: { id: "111" }, message: { mid: "m3", is_deleted: true } },
    { sender: { id: "111" }, read: { mid: "m1" } },
  ]));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    mid: "m1", senderId: "111", timestamp: 5, text: undefined,
    attachments: [{ type: "ig_reel", url: "https://cdn/v.mp4", title: "caption del reel", mediaId: "999" }],
  });
  assert.deepEqual(parseWebhook({ object: "page", entry: [] }), []);
  assert.deepEqual(parseWebhook(null), []);
});

check("dmAction: reel compartido REAL (link + caption, sin cuenta) → link que necesita el @", () => {
  // Forma real de un ig_reel compartido por DM (2026-09, anonimizada).
  const [ev] = parseWebhook(igWebhook([{
    sender: { id: "1064" }, recipient: { id: "1784" }, timestamp: 1790557692001,
    message: { mid: "aWdf", attachments: [{ type: "ig_reel", payload: {
      reel_video_id: "18083118176323939", title: "10 series originales de Netflix…\n\n#series",
      url: "https://www.instagram.com/reel/Ddz6kNTM6Ls/?igsh=abc",
    } }] },
  }]));
  assert.deepEqual(dmAction(ev), {
    kind: "save-link", urls: ["https://www.instagram.com/reel/Ddz6kNTM6Ls/?igsh=abc"], text: "", caption: "10 series originales de Netflix…\n\n#series",
  });
  assert.equal(dmAction({ ...ev, text: "@netflix" }).kind, "save-link");
});

check("dmAction: media directa (CDN), link con @, pregunta y adjunto desconocido", () => {
  const ev = (over: object) => ({ mid: "m", senderId: "111", attachments: [], ...over });
  assert.deepEqual(dmAction(ev({ attachments: [{ type: "ig_reel", url: "https://scontent.cdninstagram.com/v.mp4", title: "cap", mediaId: "999" }] })), {
    kind: "save-media", videoUrl: "https://scontent.cdninstagram.com/v.mp4", mediaUrls: [], caption: "cap", sourceId: "999",
  });
  assert.deepEqual(dmAction(ev({ attachments: [{ type: "share", url: "https://cdn/i.jpg" }] })), {
    kind: "save-media", videoUrl: undefined, mediaUrls: ["https://cdn/i.jpg"], caption: undefined, sourceId: "m",
  });
  assert.equal(dmAction(ev({ text: "@natgeo https://www.instagram.com/p/AAA/" })).kind, "save-link");
  assert.deepEqual(dmAction(ev({ text: "¿qué guardé de video?" })), { kind: "question", text: "¿qué guardé de video?" });
  assert.equal(dmAction(ev({ attachments: [{ type: "audio", url: "https://cdn/a.mp3" }] })).kind, "unsupported");
});

check("splitDm: mensajes ≤ 1000 caracteres sin perder texto", () => {
  const long = Array.from({ length: 60 }, (_, i) => `Línea ${i} ${"y".repeat(40)}`).join("\n");
  const parts = splitDm(long);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 1000));
  assert.equal(parts.join("\n"), long);
});

check("formatos en texto plano para DM: ficha y respuesta sin HTML", () => {
  const txt = formatSavedText({ ficha: ficha(), path: "x.md", created: true, topicsUpdated: ["Automatización con IA"], newTopic: false });
  assert.ok(txt.startsWith("✅ Guardado: Resumir Gmail con ChatGPT y Make"));
  assert.ok(!/<\/?b>/.test(txt));
  const ans = formatAnswerText({ answer: "Usa **Make** [1].", sources: [{ n: 1, title: "T", url: "https://www.instagram.com/p/X/", baseName: "b" }], found: true });
  assert.equal(ans, "Usa Make [1].\n\n📚 Fuentes\n[1] T — https://www.instagram.com/p/X/");
});

console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
