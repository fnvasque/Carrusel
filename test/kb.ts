import assert from "node:assert/strict";
import matter from "gray-matter";
import { findInstagramUrl, findInstagramUrls, isInstagramUrl, normalizeInstagramUrl, shortcodeFromUrl } from "../src/kb/shortcode.ts";
import { metaToPostMeta, resolveUser } from "../src/kb/instagram.ts";
import { hashtagsIn, mentionsIn, pickHashtags } from "../src/kb/discover.ts";
import { dmAction, parseWebhook, validSignature } from "../src/kb/inbox.ts";
import { splitDm } from "../src/meta/messages.ts";
import { missedMessages, type ConvMessage } from "../src/kb/recover.ts";
import { createHmac } from "node:crypto";
import {
  AUTO_END, AUTO_START, fichaBaseName, fichaDigest, renderFicha, renderTopic, replaceAutoZone,
  resolveTopicName, safeFileName, safeUrl, topicKey, unwikilink,
} from "../src/kb/markdown.ts";
import { cleanCall, hasControlChars } from "../src/kb/ai.ts";
import { frameCount } from "../src/kb/media.ts";
import { applyNameFixes, groundToolUrls, validFixes } from "../src/kb/names.ts";
import { chunkFicha, fichaDoc, indexedHead, referenciaDoc, researchDoc, setIndexedHead, splitText } from "../src/kb/indexer.ts";
import { ftsQuery, parseDateRange, rangeFilter, rrfFuse, type Hit } from "../src/kb/search.ts";
import { citedNumbers, groupSources, isResearch, researchNote, sourceHead } from "../src/kb/ask.ts";
import { closestTopic, reviewCandidates } from "../src/kb/topics.ts";
import {
  escapeHtml, formatAnswer, formatAnswerText, formatSaved, formatSavedText, handleInText, handleReply, mdToTelegramHtml, noteFromMessage, splitMessage,
} from "../src/kb/telegram.ts";
import { enqueue, finish, pendingCount, requeueInterrupted, takeNext } from "../src/kb/queue.ts";
import { closeDb } from "../src/kb/db.ts";
import {
  autoZoneOf, outsideAgentZones, parseFrontmatter, parseNameStatus, validateReferencia, validateResumen, validateTopicBlock,
  zoneErrors,
} from "../kb-plantilla/_investigacion/validar.mjs";
import { abortStaleRebase, kbHead, pullKb } from "../src/kb/store.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import {
  listReferencias, listResearchBlocks, parseReferencia, parseRegistro, pendingSummaries, researchBlock, reviewedDate,
  markSummaryNotified, newSummaries, RESEARCH_END, RESEARCH_START, silenceAlert, summaryText,
} from "../src/kb/research.ts";
import { costLine, costOf, costSummary, formatCostSummary, recordUsage, setCostRef, usageOf, usd, withCostScope } from "../src/kb/costs.ts";
import { renderTopicSources, tagSlug } from "../src/kb/markdown.ts";
import { viaOpenRouter, withFallback } from "../src/kb/llm.ts";
import { staleTopics, synthesisHash } from "../src/kb/pipeline.ts";
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

/** Pruebas async: en serie y después de las sincrónicas (algunas cambian KB_DIR). */
let asyncChain: Promise<void> = Promise.resolve();
function checkAsync(name: string, fn: () => Promise<void>): void {
  asyncChain = asyncChain.then(() =>
    fn().then(
      () => {
        passed++;
        console.log("✓", name);
      },
      (e) => {
        failed++;
        console.error("✗", name, "—", e instanceof Error ? e.message : e);
      },
    ),
  );
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

check("hasControlChars: detecta tildes corruptas en toda la respuesta, ignora saltos de línea y tabs", () => {
  assert.ok(hasControlChars({ description: "ok", essentials: ["a\nb", "atenci\u0003n"], n: 3 }));
  assert.ok(hasControlChars({ tools: [{ name: "x", purpose: "espec\u000edficas" }] }));
  assert.ok(!hasControlChars({ t: "línea 1\nlínea 2\ttab", n: 3 }));
});

// cleanCall: gpt-4o a veces emite "\u0003" en vez de "\u00f3" (ó). Nunca se debe borrar la letra:
// se reintenta hasta tener una respuesta limpia y, si nunca llega, se lanza error.
{
  const seq = (...outs: string[]) => {
    let i = 0;
    const call = async () => ({ description: outs[Math.min(i++, outs.length - 1)] });
    return { call, calls: () => i };
  };
  const quiet = { warn: () => {} };

  const a = seq("Automatizaci\u0003n", "Automatizaci\u0003n", "Automatización");
  assert.deepEqual(await cleanCall(a.call, { attempts: 4, log: quiet }), { description: "Automatización" });
  assert.equal(a.calls(), 3);

  const b = seq("Automatización");
  assert.deepEqual(await cleanCall(b.call, { attempts: 4, log: quiet }), { description: "Automatización" });
  assert.equal(b.calls(), 1);

  const c = seq("Automatizaci\u0003n");
  await assert.rejects(cleanCall(c.call, { attempts: 3, log: quiet }), /tildes corruptas/);
  assert.equal(c.calls(), 3);
  passed++;
  console.log("✓ cleanCall: reintenta hasta respuesta limpia; si no llega, falla (nunca borra la tilde)");
}

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

check("parseWebhook: mensajes con adjuntos; ecos marcados; ignora borrados, lecturas y otros objetos", () => {
  const events = parseWebhook(igWebhook([
    { sender: { id: "111" }, timestamp: 5, message: { mid: "m1", attachments: [{ type: "ig_reel", payload: { url: "https://cdn/v.mp4", title: "caption del reel", reel_video_id: "999" } }] } },
    { sender: { id: "222" }, message: { mid: "m2", text: "respuesta", is_echo: true } },
    { sender: { id: "111" }, message: { mid: "m3", is_deleted: true } },
    { sender: { id: "111" }, read: { mid: "m1" } },
  ]));
  assert.equal(events.length, 2);
  assert.equal(events[1].isEcho, true);
  assert.equal(events[1].text, "respuesta");
  assert.deepEqual(events[0], {
    mid: "m1", senderId: "111", recipientId: undefined, isEcho: undefined, timestamp: 5, text: undefined,
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

// --- descubrir la cuenta de un post compartido ---
check("mentionsIn / hashtagsIn: menciones y hashtags del caption", () => {
  assert.deepEqual(mentionsIn("Colab con @ia.punto.es y @natgeo. Escríbeme a hola@mail.com"), ["ia.punto.es", "natgeo"]);
  assert.deepEqual(mentionsIn(undefined), []);
  assert.deepEqual(hashtagsIn("#AIWebsite #webdesign #aiwebsite #UIDesign"), ["aiwebsite", "webdesign", "uidesign"]);
});

check("pickHashtags: sin genéricos, primero los ya usados (gratis) y respeta el cupo semanal", () => {
  const tags = ["reels", "creativecoding", "ai", "webdesign", "aiwebsite", "uidesign"];
  // A igual largo se conserva el orden del caption (webdesign antes que aiwebsite).
  assert.deepEqual(pickHashtags(tags, new Set()), ["creativecoding", "webdesign", "aiwebsite"]);
  assert.deepEqual(pickHashtags(tags, new Set(["uidesign"])), ["uidesign", "creativecoding", "webdesign"]);
  const full = new Set(Array.from({ length: 28 }, (_, i) => `t${i}`));
  assert.deepEqual(pickHashtags(tags, full), []);
  assert.deepEqual(pickHashtags(["uidesign", ...tags], new Set([...full, "uidesign"])), ["uidesign"]);
});

// --- DMs perdidos con el bot caído ---
check("missedMessages: textos para procesar y posts ilegibles por remitente, solo autorizados y no vistos", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const msg = (id: string, from: string, hoursAgo: number, over: Partial<ConvMessage> = {}): ConvMessage => ({
    id, from: { id: from }, created_time: new Date(now - hoursAgo * 3_600_000).toISOString(), message: "", ...over,
  });
  const msgs = [
    msg("m4", "yo", 1, { message: "@cuenta https://www.instagram.com/p/ABC/" }),
    msg("m1", "yo", 3, { is_unsupported: true }),
    msg("m2", "yo", 2, { message: "¿qué guardé de video?" }),
    msg("m3", "cuenta", 1, { message: "📥 Recibido…" }), // eco de la propia cuenta
    msg("m5", "extraño", 1, { message: "hola" }),
    msg("m6", "yo", 30, { message: "viejo" }), // fuera de la ventana de 24 h
    msg("m7", "yo", 1, { is_unsupported: true }),
    msg("m8", "yo", 1, { message: "ya visto" }),
  ];
  const r = missedMessages(msgs, { allowed: new Set(["yo"]), seen: (mid) => mid === "m8", now });
  assert.deepEqual(r.events.map((e) => [e.mid, e.text]), [["m2", "¿qué guardé de video?"], ["m4", "@cuenta https://www.instagram.com/p/ABC/"]]);
  assert.deepEqual(r.unreadable, { yo: 2 });
  assert.equal(r.events[0].senderId, "yo");
});

// --- investigación semanal ---
const BLOCK = `${RESEARCH_START}\n## Investigación\n_Revisado 2026-10-12_\n\nEstado.\n\n### Referencias\n- [[n8n]] — flujos\n${RESEARCH_END}`;

check("researchBlock: contenido entre marcadores; sin marcadores o vacío → undefined", () => {
  assert.equal(researchBlock(`antes\n${BLOCK}\ndespués`), BLOCK.slice(RESEARCH_START.length, -RESEARCH_END.length).trim());
  assert.equal(researchBlock("sin bloque"), undefined);
  assert.equal(researchBlock(`${RESEARCH_START}\n \n${RESEARCH_END}`), undefined);
  assert.equal(researchBlock(`${RESEARCH_END} al revés ${RESEARCH_START}`), undefined);
  assert.equal(reviewedDate(BLOCK), "2026-10-12");
  assert.equal(reviewedDate("sin fecha"), undefined);
});

check("renderTopic conserva el bloque kb:research al regenerar el tema", () => {
  const s = { description: "d", essentials: ["e"], tools: [], techniques: [] };
  const first = renderTopic("Tema", s, [], "2026-10-01");
  const withBlock = first.replace("## Mis notas", `${BLOCK}\n\n## Mis notas`);
  const again = renderTopic("Tema", { ...s, essentials: ["otra"] }, [], "2026-10-02", withBlock);
  assert.ok(again.includes(BLOCK));
  assert.ok(again.includes("- otra"));
});

check("parseRegistro: última fecha por tema; ignora líneas ajenas", () => {
  const r = parseRegistro(
    "# Registro\n\n- 2026-10-05 · Cocina · 2 referencias (2 nuevas)\n- 2026-10-12 · Cocina · 3 referencias (1 nuevas)\n" +
      "- 2026-10-12 · Automatización con IA · 4 referencias (0 nuevas)\nbasura\n",
  );
  assert.equal(r.get("Cocina"), "2026-10-12");
  assert.equal(r.get("Automatización con IA"), "2026-10-12");
  assert.equal(r.size, 2);
});

check("silenceAlert: sin registro o reciente → nada; > 8 días → aviso con la fecha", () => {
  const reg = "- 2026-10-01 · Cocina · 1 referencias (1 nuevas)\n";
  assert.equal(silenceAlert(undefined, "2026-10-20"), undefined);
  assert.equal(silenceAlert("# Registro\n", "2026-10-20"), undefined);
  assert.equal(silenceAlert(reg, "2026-10-09"), undefined);
  const a = silenceAlert(reg, "2026-10-10");
  assert.equal(a?.since, "2026-10-01");
  assert.ok(a?.text.includes("2026-10-01") && a.text.includes("9 días"));
});

check("pendingSummaries: solo AAAA-MM-DD.md no notificados, en orden", () => {
  assert.deepEqual(
    pendingSummaries(["2026-10-12.md", "notas.md", "2026-10-05.md", "2026-10-19.md"], new Set(["2026-10-05.md"])),
    ["2026-10-12.md", "2026-10-19.md"],
  );
});

check("summaryText: quita frontmatter; vacío → undefined", () => {
  assert.equal(summaryText("---\nfecha: 2026-10-12\n---\n\n🔎 Tres novedades\n"), "🔎 Tres novedades");
  assert.equal(summaryText("---\na: 1\n---\n  \n"), undefined);
});

check("parseReferencia: frontmatter en bloque (Obsidian) y fecha sin comillas", () => {
  const raw = "---\ntipo: software\nnombre: n8n\ntemas:\n  - '[[Automatización con IA]]'\nrevisado: 2026-10-12\nfuentes:\n  - https://n8n.io\n---\n## Qué es\nX [1]\n";
  const r = parseReferencia("/kb/referencias/n8n.md", raw);
  assert.equal(r.baseName, "n8n");
  assert.equal(r.title, "n8n");
  assert.equal(r.tipo, "software");
  assert.equal(r.reviewed, "2026-10-12");
  assert.deepEqual(r.topics, ["Automatización con IA"]);
  assert.ok(r.body.startsWith("## Qué es"));
});

check("documentos del índice: referencia y bloque de investigación", () => {
  const ref = parseReferencia(
    "/kb/referencias/n8n.md",
    "---\ntipo: software\nnombre: n8n\ntemas: ['[[Automatización con IA]]']\nrevisado: 2026-10-12\nfuentes: [https://n8n.io]\n---\n## Qué es\nFlujos [1]\n\n## Mis notas\nlo uso\n",
  );
  const d = referenciaDoc(ref);
  assert.equal(d.id, "ref:n8n");
  assert.equal(d.kind, "referencia");
  assert.equal(d.savedAt, "2026-10-12");
  assert.equal(d.topic, "Automatización con IA");
  assert.deepEqual(chunkFicha(d.body).map((c) => c.section), ["Qué es", "Mis notas"]);

  const r = researchDoc({ topic: "Cocina", path: "/kb/temas/Cocina.md", reviewed: "2026-10-12", block: researchBlock(BLOCK)! });
  assert.equal(r.id, "tema:Cocina");
  assert.equal(r.kind, "investigacion");
  assert.equal(r.title, "Investigación: Cocina");
  assert.deepEqual(chunkFicha(r.body).map((c) => c.section), ["Investigación"]);
});

check("fichaDoc: sin id no se indexa; con id conserva tipo y publicado", () => {
  const base = { path: "/kb/fuentes/a.md", baseName: "a", title: "A", secondary: [], notes: [], body: "x" };
  assert.equal(fichaDoc({ ...base, raw: "---\n---\nx" }), undefined);
  const d = fichaDoc({ ...base, id: "ig:1", raw: "---\nid: ig:1\ntipo: reel\npublicado: '2026-09-01'\n---\nx" });
  assert.equal(d?.kind, "reel");
  assert.equal(d?.publishedAt, "2026-09-01");
});

check("ask: fuentes de investigación rotuladas en el contexto", () => {
  const hit = (over: Partial<Hit>): Hit => ({
    chunkId: 1, postId: "p", section: "s", text: "t", score: 1, title: "T", path: "x", baseName: "b", ...over,
  });
  const groups = groupSources([
    hit({ baseName: "n8n", title: "n8n", kind: "referencia", savedAt: "2026-10-12", topic: "Automatización con IA" }),
    hit({ chunkId: 2, baseName: "f1", title: "Post", author: "@a", savedAt: "2026-09-01", kind: "reel" }),
  ]);
  assert.equal(groups[0].source.kind, "referencia");
  assert.ok(isResearch(groups[0].source));
  assert.ok(!isResearch(groups[1].source));
  assert.equal(sourceHead(groups[0].source), "[1] INVESTIGACIÓN — n8n · revisada 2026-10-12 · tema: Automatización con IA");
  assert.equal(sourceHead(groups[1].source), "[2] Post — @a · guardado 2026-09-01");
});

check("formatAnswer / formatAnswerText: fuentes investigadas con 🔎", () => {
  const a = {
    answer: "Tiene plan gratis [1] y lo guardaste [2].",
    sources: [
      { n: 1, title: "n8n", savedAt: "2026-10-12", baseName: "n8n", kind: "referencia" },
      { n: 2, title: "Post", author: "@a", savedAt: "2026-09-01", url: "https://www.instagram.com/p/X/", baseName: "f1" },
    ],
    found: true,
  };
  const html = formatAnswer(a);
  assert.ok(html.includes("[1] 🔎 n8n — investigado 2026-10-12"));
  assert.ok(html.includes('[2] <a href="https://www.instagram.com/p/X/">Post</a> — @a · 2026-09-01'));
  const text = formatAnswerText(a);
  assert.ok(text.includes("[1] 🔎 n8n — investigado 2026-10-12"));
  assert.ok(text.includes("[2] Post — https://www.instagram.com/p/X/"));
});

checkAsync("listReferencias / listResearchBlocks / newSummaries sobre una base temporal", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-research-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    mkdirSync(joinPath(dir, "referencias"), { recursive: true });
    mkdirSync(joinPath(dir, "temas"), { recursive: true });
    mkdirSync(joinPath(dir, "_investigacion", "resumenes"), { recursive: true });
    writeFileSync(joinPath(dir, "referencias", "n8n.md"), "---\ntipo: software\nnombre: n8n\nrevisado: 2026-10-12\nfuentes: [https://n8n.io]\n---\n## Qué es\nX [1]\n");
    writeFileSync(joinPath(dir, "temas", "Cocina.md"), `---\ntags: [kb/tema]\n---\n<!-- kb:auto:start -->\n# Cocina\n<!-- kb:auto:end -->\n\n${BLOCK}\n`);
    writeFileSync(joinPath(dir, "temas", "Viajes.md"), "---\ntags: [kb/tema]\n---\nsin bloque\n");
    assert.deepEqual((await listReferencias()).map((r) => r.baseName), ["n8n"]);
    const blocks = await listResearchBlocks();
    assert.deepEqual(blocks.map((b) => [b.topic, b.reviewed]), [["Cocina", "2026-10-12"]]);

    // Índice nuevo con un resumen viejo: se marca sin reenviarlo.
    writeFileSync(joinPath(dir, "_investigacion", "resumenes", "2026-10-05.md"), "viejo");
    assert.deepEqual(await newSummaries(), []);
    writeFileSync(joinPath(dir, "_investigacion", "resumenes", "2026-10-12.md"), "nuevo");
    assert.deepEqual(await newSummaries(), [{ name: "2026-10-12.md", text: "nuevo" }]);
    // Sigue pendiente hasta que se marque como enviado (si Telegram falla, se reintenta en la próxima sincronización).
    assert.deepEqual(await newSummaries(), [{ name: "2026-10-12.md", text: "nuevo" }]);
    markSummaryNotified("2026-10-12.md");
    assert.deepEqual(await newSummaries(), []);
    // Un resumen vacío no se envía ni queda pendiente para siempre.
    writeFileSync(joinPath(dir, "_investigacion", "resumenes", "2026-10-19.md"), "  ");
    assert.deepEqual(await newSummaries(), []);
    assert.deepEqual(await newSummaries(), []);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

checkAsync("pullKb: trae cambios del remoto; sin cambios → changed false; conflicto → error y base intacta", async () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-pull-"));
  const g = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString();
  const prev = process.env.KB_DIR;
  try {
    g(root, "init", "-q", "--bare", "-b", "main", "remote.git");
    g(root, "clone", "-q", "remote.git", "bot");
    g(root, "clone", "-q", "remote.git", "agente");
    const bot = joinPath(root, "bot");
    const agente = joinPath(root, "agente");
    writeFileSync(joinPath(agente, "a.md"), "uno\n");
    g(agente, "add", ".");
    g(agente, "commit", "-q", "-m", "1");
    g(agente, "push", "-q", "origin", "main");
    g(bot, "pull", "-q", "origin", "main");
    g(bot, "branch", "-q", "--set-upstream-to=origin/main", "main");
    process.env.KB_DIR = bot;

    assert.deepEqual(await pullKb(), { changed: false });

    writeFileSync(joinPath(agente, "b.md"), "dos\n");
    g(agente, "add", ".");
    g(agente, "commit", "-q", "-m", "2");
    g(agente, "push", "-q", "origin", "main");
    assert.deepEqual(await pullKb(), { changed: true });

    // Conflicto: ambos editan a.md.
    writeFileSync(joinPath(agente, "a.md"), "agente\n");
    g(agente, "commit", "-q", "-am", "3");
    g(agente, "push", "-q", "origin", "main");
    writeFileSync(joinPath(bot, "a.md"), "bot\n");
    g(bot, "commit", "-q", "-am", "local");
    const head = g(bot, "rev-parse", "HEAD");
    const r = await pullKb();
    assert.equal(r.changed, false);
    assert.ok(r.error);
    assert.equal(g(bot, "rev-parse", "HEAD"), head);
    assert.equal(g(bot, "status", "--porcelain"), "");
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

// I1 / R49: `pull --rebase --autostash` sale 0 aunque el autostash choque (índice UU, nota con
// marcas y un stash nuevo). pullKb debe devolver error y no tocar nada más.
checkAsync("pullKb (R49): autostash que choca (UU) → error claro con el archivo; la nota y el stash quedan; la siguiente pull no toca nada", async () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-pull-autostash-"));
  const g = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString();
  const prev = process.env.KB_DIR;
  const prevGit = process.env.KB_GIT;
  try {
    g(root, "init", "-q", "--bare", "-b", "main", "remote.git");
    g(root, "clone", "-q", "remote.git", "mac");
    g(root, "clone", "-q", "remote.git", "bot");
    const mac = joinPath(root, "mac");
    const bot = joinPath(root, "bot");
    mkdirSync(joinPath(bot, "temas"), { recursive: true });
    writeFileSync(joinPath(bot, "temas", "x.md"), "uno\ndos\n");
    g(bot, "add", ".");
    g(bot, "commit", "-q", "-m", "1");
    g(bot, "push", "-q", "origin", "main");
    g(mac, "pull", "-q", "origin", "main");
    g(mac, "branch", "-q", "--set-upstream-to=origin/main", "main");
    // El servidor re-sintetiza el tema y lo sube; el usuario edita la misma línea sin commit.
    writeFileSync(joinPath(bot, "temas", "x.md"), "servidor\ndos\n");
    g(bot, "commit", "-q", "-am", "kb: tema");
    g(bot, "push", "-q", "origin", "main");
    writeFileSync(joinPath(mac, "temas", "x.md"), "usuario\ndos\n");
    process.env.KB_DIR = mac;
    delete process.env.KB_GIT;

    const r = await pullKb();
    assert.ok(r.error, "debe devolver error");
    assert.match(r.error!, /conflicto al reaplicar cambios locales en temas\/x\.md/);
    assert.match(r.error!, /git stash/);
    // Los cambios del usuario no se pierden: en el archivo (con marcas) y en el stash.
    assert.match(readFileSync(joinPath(mac, "temas", "x.md"), "utf8"), /usuario/);
    assert.match(g(mac, "stash", "list"), /autostash/);
    const head = g(mac, "rev-parse", "HEAD");
    const stash = g(mac, "stash", "list");

    // La pull siguiente no toca nada (ni HEAD, ni el stash, ni el archivo) y repite el error.
    const r2 = await pullKb();
    assert.match(r2.error ?? "", /conflicto al reaplicar cambios locales en temas\/x\.md/);
    assert.equal(r2.changed, false);
    assert.equal(g(mac, "rev-parse", "HEAD"), head);
    assert.equal(g(mac, "stash", "list"), stash);
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    if (prevGit === undefined) delete process.env.KB_GIT;
    else process.env.KB_GIT = prevGit;
    rmSync(root, { recursive: true, force: true });
  }
});

// --- validador del agente de investigación ---
const REF_OK =
  "---\ntipo: software\nnombre: n8n\ntemas: [\"[[Automatización con IA]]\"]\nrevisado: 2026-10-12\nfuentes:\n  - https://n8n.io/pricing\n  - https://docs.n8n.io\ntags: [kb/referencia]\n---\n\n## Qué es\nAutomatiza flujos [1].\n\n## Datos clave\n- Tiene API REST [2].\n\n## Mis notas\n";

check("validar: referencia válida (listas en bloque e inline)", () => {
  assert.deepEqual(validateReferencia(REF_OK), []);
  const fm = parseFrontmatter(REF_OK);
  assert.ok(!("error" in fm));
  if (!("error" in fm)) {
    assert.deepEqual(fm.data.fuentes, ["https://n8n.io/pricing", "https://docs.n8n.io"]);
    assert.deepEqual(fm.data.temas, ["[[Automatización con IA]]"]);
  }
});

check("validar: referencias inválidas", () => {
  const errs = (t: string) => validateReferencia(t).join(" | ");
  assert.match(errs("sin frontmatter"), /frontmatter/);
  assert.match(errs(REF_OK.replace("tipo: software", "tipo: app")), /tipo inválido/);
  assert.match(errs(REF_OK.replace("revisado: 2026-10-12", "revisado: 2026-13-40")), /revisado inválido/);
  assert.match(errs(REF_OK.replace(/fuentes:\n {2}- \S+\n {2}- \S+\n/, "fuentes: []\n")), /fuentes/);
  assert.match(errs(REF_OK.replace("https://docs.n8n.io", "docs.n8n.io")), /no es una URL/);
  assert.match(errs(REF_OK.replace("[2]", "[3]")), /\[3\] no tiene fuente/);
  assert.match(errs(REF_OK.replace("## Datos clave", "## Datos")), /Datos clave/);
  assert.match(errs(REF_OK.replace(/\s\[\d\]/g, "")), /ninguna afirmación/);
  // [[wikilinks]] y links markdown no cuentan como citas.
  assert.deepEqual(validateReferencia(REF_OK.replace("flujos [1].", "flujos [1]. Ver [[Make]] y [doc](https://x.y).")), []);
});

check("validar: bloque kb:research del tema", () => {
  const ok = `<!-- kb:auto:start -->\n# T\n<!-- kb:auto:end -->\n\n<!-- kb:research:start -->\n## Investigación\n_Revisado 2026-10-12_\n\nx\n<!-- kb:research:end -->\n`;
  assert.deepEqual(validateTopicBlock(ok), []);
  assert.deepEqual(validateTopicBlock("tema sin bloque"), []);
  assert.match(validateTopicBlock(ok.replace("<!-- kb:research:end -->", "")).join(), /cerrado/);
  assert.match(validateTopicBlock(ok.replace("## Investigación", "## Otra")).join(), /## Investigación/);
  assert.match(validateTopicBlock(ok.replace("_Revisado 2026-10-12_", "")).join(), /_Revisado/);
});

check("validar: resumen", () => {
  assert.deepEqual(validateResumen("🔎 Tres novedades"), []);
  assert.match(validateResumen("  ").join(), /vacío/);
  assert.match(validateResumen("x".repeat(1001)).join(), /1000/);
});

check("validar: zonas del agente", () => {
  assert.deepEqual(
    outsideAgentZones(["referencias/n8n.md", "_investigacion/registro.md", "CLAUDE.md", "temas/T.md", "fuentes/x.md", "_adjuntos/a.png"]),
    ["fuentes/x.md", "_adjuntos/a.png"],
  );
  assert.equal(autoZoneOf("a<!-- kb:auto:start -->\nZ\n<!-- kb:auto:end -->b"), "Z");
  assert.equal(autoZoneOf("sin zona"), undefined);
});

check("validar (CLI): corre aunque la ruta pase por un enlace simbólico y falla con notas inválidas", () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-validar-"));
  try {
    const real = joinPath(root, "real");
    mkdirSync(joinPath(real, "_investigacion"), { recursive: true });
    mkdirSync(joinPath(real, "referencias"), { recursive: true });
    writeFileSync(joinPath(real, "_investigacion", "validar.mjs"), readFileSync("kb-plantilla/_investigacion/validar.mjs"));
    writeFileSync(joinPath(real, "referencias", "x.md"), "---\ntipo: app\n---\n");
    symlinkSync(real, joinPath(root, "enlace"));
    let code = 0;
    let err = "";
    try {
      execFileSync("node", [joinPath(root, "enlace", "_investigacion", "validar.mjs")], { stdio: "pipe" });
    } catch (e) {
      code = (e as { status: number }).status;
      err = String((e as { stderr: Buffer }).stderr);
    }
    assert.equal(code, 1);
    assert.match(err, /referencias\/x\.md: tipo inválido/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("validar: frontmatter editado en Obsidian (clave con tilde, lista en columna 0, comentario, texto plegado)", () => {
  const edited = REF_OK
    .replace("tipo: software", "tipo: software\ncategoría: automatización\nnota: >\n  texto largo\n  en dos líneas")
    .replace("fuentes:\n  - https://n8n.io/pricing\n  - https://docs.n8n.io", "fuentes:\n- https://n8n.io/pricing\n- https://docs.n8n.io")
    .replace("revisado: 2026-10-12", "revisado: 2026-10-12 # lo revisé yo");
  assert.deepEqual(validateReferencia(edited), []);
  const fm = parseFrontmatter(edited);
  assert.ok(!("error" in fm));
  if (!("error" in fm)) {
    assert.equal(fm.data["categoría"], "automatización");
    assert.equal(fm.data.revisado, "2026-10-12");
    assert.deepEqual(fm.data.fuentes, ["https://n8n.io/pricing", "https://docs.n8n.io"]);
  }
});

check("validar: zonas con renombres y borrados (git diff --name-status --no-renames)", () => {
  const ch = parseNameStatus("M\treferencias/n8n.md\nD\tfuentes/a.md\nA\t_investigacion/a.md\nD\ttemas/T.md\nA\ttemas/Nuevo.md\nM\ttemas/U.md\n");
  assert.deepEqual(ch[1], { status: "D", path: "fuentes/a.md" });
  const errs = zoneErrors(ch).join(" | ");
  assert.match(errs, /fuentes\/a\.md: el agente no puede modificar/);
  assert.match(errs, /temas\/T\.md: el agente no puede borrar temas/);
  assert.match(errs, /temas\/Nuevo\.md: el agente no puede crear temas nuevos/);
  assert.equal(zoneErrors(ch).length, 3);
});

check("validar (CLI): tras un pull --rebase con commits del bot, --desde INICIO valida solo lo del agente", () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-validar-rebase-"));
  const g = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString().trim();
  try {
    g(root, "init", "-q", "--bare", "-b", "main", "remote.git");
    g(root, "clone", "-q", "remote.git", "bot");
    const bot = joinPath(root, "bot");
    mkdirSync(joinPath(bot, "temas"));
    mkdirSync(joinPath(bot, "referencias"));
    mkdirSync(joinPath(bot, "_investigacion"));
    writeFileSync(joinPath(bot, "_investigacion", "validar.mjs"), readFileSync("kb-plantilla/_investigacion/validar.mjs"));
    writeFileSync(joinPath(bot, "temas", "T.md"), "<!-- kb:auto:start -->\nA\n<!-- kb:auto:end -->\n");
    // Nota editada por el usuario que el validador estricto rechazaría: no la toca el agente.
    writeFileSync(joinPath(bot, "referencias", "vieja.md"), "---\ntipo: app\n---\n");
    g(bot, "add", ".");
    g(bot, "commit", "-q", "-m", "base");
    g(bot, "push", "-q", "-u", "origin", "main");
    g(root, "clone", "-q", "remote.git", "agente");
    const agente = joinPath(root, "agente");
    const inicio = g(agente, "rev-parse", "HEAD");

    // El agente investiga…
    writeFileSync(joinPath(agente, "referencias", "n8n.md"), REF_OK);
    writeFileSync(joinPath(agente, "temas", "T.md"), "<!-- kb:auto:start -->\nA\n<!-- kb:auto:end -->\n\n<!-- kb:research:start -->\n## Investigación\n_Revisado 2026-10-12_\n<!-- kb:research:end -->\n");
    g(agente, "add", ".");
    g(agente, "commit", "-q", "-m", "investigación: T");
    // …mientras el bot guarda una ficha y regenera la zona automática del tema.
    mkdirSync(joinPath(bot, "fuentes"));
    writeFileSync(joinPath(bot, "fuentes", "f.md"), "ficha\n");
    writeFileSync(joinPath(bot, "temas", "T.md"), "<!-- kb:auto:start -->\nB\n<!-- kb:auto:end -->\n");
    g(bot, "add", ".");
    g(bot, "commit", "-q", "-m", "kb: agrega f");
    g(bot, "push", "-q");
    // El push del agente choca; trae con rebase (el tema se resuelve conservando la zona del bot).
    try {
      g(agente, "pull", "-q", "--rebase");
    } catch {
      writeFileSync(joinPath(agente, "temas", "T.md"), "<!-- kb:auto:start -->\nB\n<!-- kb:auto:end -->\n\n<!-- kb:research:start -->\n## Investigación\n_Revisado 2026-10-12_\n<!-- kb:research:end -->\n");
      g(agente, "add", "temas/T.md");
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.editor=true", "rebase", "--continue"], { cwd: agente, stdio: "pipe" });
    }
    const out = execFileSync("node", ["_investigacion/validar.mjs", "--desde", inicio], { cwd: agente, stdio: "pipe" }).toString();
    assert.match(out, /Investigación válida/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("rangeFilter: con fechas, solo posts guardados (sin investigación); sin fechas, nada", () => {
  assert.deepEqual(rangeFilter(undefined), { sql: "", args: [] });
  const f = rangeFilter({ from: "2026-10-05", to: "2026-10-11", label: "esta semana" });
  assert.equal(f.sql, "AND p.saved_at BETWEEN ? AND ? AND (p.kind IS NULL OR p.kind NOT IN ('referencia', 'investigacion'))");
  assert.deepEqual(f.args, ["2026-10-05", "2026-10-11"]);
  assert.deepEqual(rangeFilter({ label: "x" }).args, ["0000-00-00", "9999-99-99"]);
});

check("silenceAlert: una semana sin temas elegibles deja un latido que evita la falsa alarma", () => {
  const reg = "- 2026-10-01 · Cocina · 1 referencias (1 nuevas)\n- 2026-10-08 · (sin temas elegibles) · 0 referencias (0 nuevas)\n";
  assert.equal(silenceAlert(reg, "2026-10-15"), undefined);
});

checkAsync("pullKb: un rebase que quedó a medias (reinicio durante un guardado) se aborta y la base queda sin marcas", async () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-pull-colgado-"));
  const g = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString();
  const prev = process.env.KB_DIR;
  try {
    g(root, "init", "-q", "--bare", "-b", "main", "remote.git");
    g(root, "clone", "-q", "remote.git", "bot");
    g(root, "clone", "-q", "remote.git", "mac");
    const bot = joinPath(root, "bot");
    const mac = joinPath(root, "mac");
    writeFileSync(joinPath(mac, "tema.md"), "uno\n");
    g(mac, "add", ".");
    g(mac, "commit", "-q", "-m", "1");
    g(mac, "push", "-q", "origin", "main");
    g(bot, "pull", "-q", "origin", "main");
    g(bot, "branch", "-q", "--set-upstream-to=origin/main", "main");
    // Obsidian sube una edición del tema; el bot guarda otra versión del mismo tema.
    writeFileSync(joinPath(mac, "tema.md"), "mac\n");
    g(mac, "commit", "-q", "-am", "vault backup");
    g(mac, "push", "-q", "origin", "main");
    writeFileSync(joinPath(bot, "tema.md"), "bot\n");
    g(bot, "commit", "-q", "-am", "kb: agrega");
    // El proceso muere en medio del pull --rebase (antes del rebase --abort).
    try {
      g(bot, "pull", "-q", "--rebase");
    } catch {
      /* conflicto: queda el rebase a medias */
    }
    assert.ok(existsSync(joinPath(bot, ".git", "rebase-merge")) || existsSync(joinPath(bot, ".git", "rebase-apply")));
    process.env.KB_DIR = bot;

    const r = await pullKb();
    assert.ok(r.error);
    assert.ok(!existsSync(joinPath(bot, ".git", "rebase-merge")) && !existsSync(joinPath(bot, ".git", "rebase-apply")));
    assert.equal(readFileSync(joinPath(bot, "tema.md"), "utf8"), "bot\n");
    assert.equal(g(bot, "status", "--porcelain"), "");
    assert.equal(g(bot, "rev-parse", "--abbrev-ref", "HEAD").trim(), "main");
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

checkAsync("abortStaleRebase: al arrancar, aborta un rebase a medias (y sin rebase no hace nada)", async () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-rebase-arranque-"));
  const g = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString();
  const prev = process.env.KB_DIR;
  try {
    g(root, "init", "-q", "--bare", "-b", "main", "remote.git");
    g(root, "clone", "-q", "remote.git", "bot");
    g(root, "clone", "-q", "remote.git", "mac");
    const bot = joinPath(root, "bot");
    const mac = joinPath(root, "mac");
    writeFileSync(joinPath(mac, "tema.md"), "uno\n");
    g(mac, "add", ".");
    g(mac, "commit", "-q", "-m", "1");
    g(mac, "push", "-q", "origin", "main");
    g(bot, "pull", "-q", "origin", "main");
    g(bot, "branch", "-q", "--set-upstream-to=origin/main", "main");
    process.env.KB_DIR = bot;
    assert.equal(await abortStaleRebase(), false);

    writeFileSync(joinPath(mac, "tema.md"), "mac\n");
    g(mac, "commit", "-q", "-am", "vault backup");
    g(mac, "push", "-q", "origin", "main");
    writeFileSync(joinPath(bot, "tema.md"), "bot\n");
    g(bot, "commit", "-q", "-am", "kb: agrega");
    try {
      g(bot, "pull", "-q", "--rebase");
    } catch {
      /* conflicto: queda el rebase a medias */
    }
    assert.match(readFileSync(joinPath(bot, "tema.md"), "utf8"), /^<<<<<<< /m);

    assert.equal(await abortStaleRebase(), true);
    assert.equal(readFileSync(joinPath(bot, "tema.md"), "utf8"), "bot\n");
    assert.equal(g(bot, "status", "--porcelain"), "");
    assert.equal(g(bot, "rev-parse", "--abbrev-ref", "HEAD").trim(), "main");
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

// --- costos ---
check("costOf: precio de lista, caché, snapshot con fecha y prefijo de OpenRouter", () => {
  assert.equal(costOf("gpt-4o-2024-11-20", { input: 1_000_000, output: 100_000 }), 3.5);
  assert.equal(costOf("gpt-4o", { input: 1_000_000, cachedInput: 1_000_000, output: 0 }), 1.25);
  assert.equal(costOf("gpt-4o-mini-2024-07-18", { input: 1_000_000, output: 0 }), 0.15);
  assert.equal(costOf("openai/gpt-4o-mini", { input: 1_000_000, output: 0 }), 0.15);
  assert.equal(costOf("qwen/qwen-vl-max", { input: 10, output: 10 }), undefined);
  process.env.KB_PRICES = '{"qwen/qwen-vl-max":{"in":0.8,"out":3.2}}';
  try {
    assert.equal(costOf("qwen/qwen-vl-max", { input: 1_000_000, output: 1_000_000 }), 4);
  } finally {
    delete process.env.KB_PRICES;
  }
});

check("usageOf: chat, transcripción y vacío", () => {
  assert.deepEqual(usageOf({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } }), {
    input: 10, cachedInput: 4, output: 5,
  });
  assert.deepEqual(usageOf({ input_tokens: 7, output_tokens: 3 }), { input: 7, cachedInput: 0, output: 3 });
  assert.equal(usageOf(undefined), undefined);
  assert.equal(usd(0.0421), "US$0,042");
  assert.equal(usd(1.2), "US$1,20");
  assert.equal(usd(0.00042), "US$0,0004");
});

checkAsync("registro de costos: suma por guardado y resumen", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-costs-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    assert.match(formatCostSummary(costSummary()), /Todavía no hay costos/);
    const { usd: spent } = await withCostScope("https://www.instagram.com/p/A/", async () => {
      recordUsage("transcripcion", "gpt-4o-mini-transcribe", undefined, 60);
      setCostRef("A");
      recordUsage("ficha", "gpt-4o-2024-11-20", { prompt_tokens: 10_000, completion_tokens: 1_000 });
      recordUsage("tema", "modelo-raro", { prompt_tokens: 10, completion_tokens: 10 });
    });
    assert.ok(Math.abs(spent - 0.038) < 1e-9);
    recordUsage("consulta", "gpt-4o", { prompt_tokens: 1000, completion_tokens: 0 });
    const s = costSummary();
    assert.ok(Math.abs(s.total - 0.0405) < 1e-9);
    assert.equal(s.saves, 1);
    assert.ok(Math.abs(s.perSave - 0.038) < 1e-9); // incluye la transcripción, registrada antes de conocer el id
    assert.equal(s.unpriced, 1);
    assert.equal(s.byOp[0].op, "ficha");
    assert.match(formatCostSummary(s), /Analizar el post: US\$0,035/);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

check("costLine: costo y modelo, con aviso de respaldo", () => {
  assert.equal(costLine(0.0042, "deepseek/deepseek-v4.1-flash"), "💸 US$0,004 · DeepSeek");
  assert.equal(costLine(0.012, "gpt-4o-2024-11-20", true), "💸 US$0,012 · gpt-4o (respaldo)");
  assert.equal(costLine(undefined, undefined), "");
});

checkAsync("withCostScope: modelo por operación y respaldo", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-scope-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    const r = await withCostScope("x", () =>
      withFallback("a/b", async (m) => {
        if (m === "a/b") throw new Error("caído");
        recordUsage("ficha", m, { prompt_tokens: 1, completion_tokens: 1 });
        return m;
      }, { fallback: "gpt-4o", log: { warn: () => {} } }),
    );
    assert.equal(r.models.ficha, "gpt-4o");
    assert.equal(r.fallback, true);
    const ok = await withCostScope("y", async () => recordUsage("consulta", "deepseek/deepseek-v4.1-flash", undefined));
    assert.equal(ok.fallback, false);
    assert.equal(ok.models.consulta, "deepseek/deepseek-v4.1-flash");
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

check("tagSlug: kebab-case válido para Obsidian", () => {
  assert.equal(tagSlug("Menú de restaurante"), "menú-de-restaurante");
  assert.equal(tagSlug("#ChatGPT"), "chatgpt");
  assert.equal(tagSlug("IA / Video, 3D!"), "ia-/-video-3d");
  assert.equal(tagSlug("ya-en-kebab"), "ya-en-kebab");
});

checkAsync("withFallback: usa el respaldo solo si el principal falla", async () => {
  const quiet = { warn: () => {} };
  assert.equal(viaOpenRouter("deepseek/deepseek-v4.1-flash"), true);
  assert.equal(viaOpenRouter("gpt-4o-2024-11-20"), false);
  const calls: string[] = [];
  const ok = await withFallback("a/b", async (m) => (calls.push(m), m), { fallback: "gpt-4o", log: quiet });
  assert.equal(ok, "a/b");
  const fb = await withFallback("a/b", async (m) => {
    calls.push(m);
    if (m === "a/b") throw new Error("caído");
    return m;
  }, { fallback: "gpt-4o", log: quiet });
  assert.equal(fb, "gpt-4o");
  assert.deepEqual(calls, ["a/b", "a/b", "gpt-4o"]);
  await assert.rejects(withFallback("a/b", async () => { throw new Error("x"); }, { fallback: undefined, log: quiet }), /x/);
});

checkAsync("recordUsage usa el costo real que informa OpenRouter", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-orcost-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    recordUsage("ficha", "deepseek/deepseek-v4.1-flash", { prompt_tokens: 10_000, completion_tokens: 1_000, cost: 0.0036 });
    const s = costSummary();
    assert.ok(Math.abs(s.total - 0.0036) < 1e-12);
    assert.equal(s.unpriced, 0);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- temas sin volver a resumir ---
check("renderTopicSources conserva la síntesis y actualiza solo las fuentes", () => {
  const s = { description: "Flujos con IA", essentials: ["Empieza simple"], tools: [], techniques: [] };
  const a = { baseName: "a", title: "A", savedAt: "2026-09-26" };
  const b = { baseName: "b", title: "B", savedAt: "2026-09-27" };
  const v1 = renderTopic("T", s, [a], "2026-09-26", undefined, { sintesis: "abc" }).replace("## Mis notas\n\n", "## Mis notas\n\nmías\n");
  const v2 = renderTopicSources("T", [b, a], "2026-09-27", v1);
  const { data, content } = matter(v2);
  assert.equal(data.sintesis, "abc");
  assert.equal(data.fuentes, 2);
  assert.equal(data.descripcion, "Flujos con IA");
  assert.ok(content.includes("- Empieza simple"));
  assert.ok(content.includes("## Fuentes (2)") && content.includes("[[b|B]]"));
  assert.ok(content.includes("mías"));
  // Tema nuevo: solo descripción y fuentes.
  const fresh = renderTopicSources("Nuevo", [a], "2026-09-27", undefined, "Recién creado");
  assert.equal(matter(fresh).data.descripcion, "Recién creado");
  assert.ok(fresh.includes("## Fuentes (1)") && !fresh.includes("Lo esencial"));
});

checkAsync("staleTopics: resume solo si cambiaron las fichas y pasó la espera", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-stale-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    mkdirSync(joinPath(dir, "fuentes"));
    mkdirSync(joinPath(dir, "temas"));
    const raw = renderFicha(ficha(), "T", []);
    writeFileSync(joinPath(dir, "fuentes", "f.md"), raw);
    const ref = [{ baseName: "f", title: "F" }];
    const page = (meta: Record<string, unknown>) =>
      writeFileSync(joinPath(dir, "temas", "T.md"), renderTopic("T", { description: "", essentials: [], tools: [], techniques: [] }, ref, "2026-10-01", undefined, meta));
    page({});
    assert.deepEqual(await staleTopics(24), ["T"]); // nunca resumido
    const hash = synthesisHash([fichaDigest(matter(raw).content)]);
    page({ sintesis: hash, sintetizado: new Date().toISOString() });
    assert.deepEqual(await staleTopics(24), []); // al día
    page({ sintesis: "otra", sintetizado: new Date().toISOString() });
    assert.deepEqual(await staleTopics(24), []); // cambió, pero se resumió hace poco
    assert.deepEqual(await staleTopics(0), ["T"]);
    page({ sintesis: "otra", sintetizado: new Date(Date.now() - 25 * 3_600_000).toISOString() });
    assert.deepEqual(await staleTopics(24), ["T"]);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

check("validar (CLI): temas con tildes (git escapa las rutas no ASCII)", () => {
  const root = mkdtempSync(joinPath(tmpdir(), "kb-validar-tildes-"));
  const g = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, stdio: "pipe" }).toString().trim();
  try {
    g("init", "-q", "-b", "main");
    mkdirSync(joinPath(root, "temas"));
    mkdirSync(joinPath(root, "_investigacion"));
    writeFileSync(joinPath(root, "_investigacion", "validar.mjs"), readFileSync("kb-plantilla/_investigacion/validar.mjs"));
    const tema = joinPath(root, "temas", "Automatización con IA.md");
    writeFileSync(tema, "<!-- kb:auto:start -->\nA\n<!-- kb:auto:end -->\n");
    g("add", ".");
    g("commit", "-q", "-m", "base");
    const inicio = g("rev-parse", "HEAD");
    writeFileSync(tema, "<!-- kb:auto:start -->\nA\n<!-- kb:auto:end -->\n\n<!-- kb:research:start -->\n## Investigación\n_Revisado 2026-10-03_\n<!-- kb:research:end -->\n");
    mkdirSync(joinPath(root, "referencias"));
    writeFileSync(joinPath(root, "referencias", "orquestación.md"), REF_OK);
    const out = execFileSync("node", ["_investigacion/validar.mjs", "--desde", inicio], { cwd: root, stdio: "pipe" }).toString();
    assert.match(out, /Investigación válida/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("validar: el agente no puede modificar el validador ni el manual", () => {
  const errs = zoneErrors([
    { status: "M", path: "_investigacion/validar.mjs" },
    { status: "M", path: "_investigacion/INSTRUCCIONES.md" },
    { status: "M", path: "_investigacion/registro.md" },
  ]);
  assert.equal(errs.length, 2);
  assert.match(errs.join(), /validar\.mjs: el agente no puede modificar el validador ni el manual/);
});

check("researchNote: avisa si la respuesta usa investigación sin decirlo; si ya lo dice o no la usa, nada", () => {
  const ref = { n: 1, title: "Composio", savedAt: "2026-10-03", baseName: "composio", kind: "referencia" };
  const blk = { n: 2, title: "Investigación: X", savedAt: "2026-10-10", baseName: "X", kind: "investigacion" };
  const post = { n: 3, title: "Post", savedAt: "2026-09-01", baseName: "p" };
  const a = (answer: string, sources: typeof post[]) => ({ answer, sources, found: true });
  assert.equal(researchNote(a("Tiene plan gratis [1, 2].", [ref, blk])), "🔎 Incluye datos de la investigación del 2026-10-10.");
  assert.equal(researchNote(a("Según la investigación del 2026-10-03, sí [1].", [ref])), undefined);
  assert.equal(researchNote(a("Lo guardaste [3].", [post])), undefined);
  assert.ok(formatAnswerText(a("Sí [1].", [ref])).includes("🔎 Incluye datos de la investigación del 2026-10-03."));
  assert.ok(formatAnswer(a("Sí [1].", [ref])).includes("🔎 Incluye datos de la investigación del 2026-10-03."));
});

checkAsync("kbHead / indexedHead: el bot sabe si el índice corresponde a la base actual", async () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "kb-head-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    assert.equal(await kbHead(), undefined); // sin repo git
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    writeFileSync(joinPath(dir, "a.md"), "x");
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "."], { cwd: dir });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "1"], { cwd: dir });
    const head = await kbHead();
    assert.match(head ?? "", /^[0-9a-f]{40}$/);
    assert.equal(indexedHead(), undefined);
    setIndexedHead(head!);
    assert.equal(indexedHead(), head);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

check("pendingSummaries: corridas del mismo día (AAAA-MM-DD-2.md) en orden cronológico", () => {
  assert.deepEqual(
    pendingSummaries(["2026-10-03-2.md", "2026-10-10.md", "2026-10-03.md", "2026-10-03-10.md", "2026-10-03-x.md"], new Set()),
    ["2026-10-03.md", "2026-10-03-2.md", "2026-10-03-10.md", "2026-10-10.md"],
  );
});

check("validar: el agente no sobrescribe un resumen ya publicado", () => {
  const errs = zoneErrors([
    { status: "M", path: "_investigacion/resumenes/2026-10-03.md" },
    { status: "A", path: "_investigacion/resumenes/2026-10-03-2.md" },
  ]);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /2026-10-03\.md: no sobrescribas un resumen ya publicado/);
});

await asyncChain;
console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
