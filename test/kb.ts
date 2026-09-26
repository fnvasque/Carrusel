import assert from "node:assert/strict";
import matter from "gray-matter";
import { findInstagramUrl, isInstagramUrl, normalizeInstagramUrl, shortcodeFromUrl } from "../src/kb/shortcode.ts";
import { cleanComments, parseJsonOutput, parseYtDlpInfo, pythonForYtDlp } from "../src/kb/instagram.ts";
import {
  AUTO_END, AUTO_START, fichaBaseName, fichaDigest, renderFicha, renderTopic, replaceAutoZone,
  resolveTopicName, safeFileName, safeUrl, topicKey, unwikilink,
} from "../src/kb/markdown.ts";
import { frameCount } from "../src/kb/media.ts";
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
    fromComments: ["n8n es una alternativa gratis"],
    audienceQuestions: ["¿Cuánto cuesta?"],
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
check("cleanComments: sin vacíos/menciones/duplicados, ordenados por likes", () => {
  const out = cleanComments([
    { text: "@amigo", like_count: 50 },
    { text: "  Usa n8n,   es gratis ", like_count: 3 },
    { text: "usa n8n, es gratis", like_count: 1 },
    { text: "🔥🔥", like_count: 9 },
    { text: "¿Cuánto cuesta Make?", like_count: 10 },
    { text: 42 },
  ]);
  assert.deepEqual(out, [
    { text: "¿Cuánto cuesta Make?", likes: 10 },
    { text: "Usa n8n, es gratis", likes: 3 },
  ]);
});

check("parseYtDlpInfo distingue reel / carrusel / post y arma autor y fecha", () => {
  const reel = parseYtDlpInfo({ channel: "usuario", timestamp: 1_758_844_800, duration: 30, description: "cap", comments: [{ text: "buenísimo dato", like_count: 2 }] });
  assert.equal(reel.kind, "reel");
  assert.equal(reel.isVideo, true);
  assert.equal(reel.author, "@usuario");
  assert.equal(reel.publishedAt, "2025-09-26");
  assert.equal(reel.comments.length, 1);
  const carrusel = parseYtDlpInfo({
    _type: "playlist",
    entries: [
      { channel: "otra", description: "x", thumbnails: [{ url: "https://cdn/1-small.jpg", width: 320 }, { url: "https://cdn/1.jpg", width: 1080 }] },
      { thumbnail: "https://cdn/2.jpg" },
      { thumbnail: "https://cdn/2.jpg" },
    ],
  });
  assert.equal(carrusel.kind, "carrusel");
  assert.equal(carrusel.author, "@otra");
  assert.deepEqual(carrusel.imageUrls, ["https://cdn/1.jpg", "https://cdn/2.jpg"]);
  assert.equal(parseYtDlpInfo({ description: "foto" }).kind, "post");
});

check("parseJsonOutput toma el JSON aunque haya ruido antes, y null si no hay", () => {
  assert.equal(parseJsonOutput('WARNING: x\n{"_type":"playlist","id":"A"}\n')?.["_type"], "playlist");
  assert.equal(parseJsonOutput("null\n"), null);
  assert.equal(parseJsonOutput('{"roto": '), null);
});

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
  const s = { description: "Flujos con IA", essentials: ["Empieza simple"], tools: [{ name: "Make", purpose: "orquestar" }], techniques: [], questions: [] };
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

check("carrusel: comentarios como generador sin evaluar → vacíos, pero con comment_count", () => {
  const gen = "<generator object InstagramBaseIE._get_comments at 0x109d83ac0>";
  assert.deepEqual(cleanComments(gen), []);
  const meta = parseYtDlpInfo({
    _type: "playlist",
    channel: "usuario",
    comment_count: 205,
    entries: [
      { thumbnails: [{ url: "https://x/1.jpg", width: 1080 }], comments: gen },
      { thumbnails: [{ url: "https://x/2.jpg", width: 1080 }], comments: gen },
    ],
  });
  assert.deepEqual(meta.comments, []);
  assert.equal(meta.commentCount, 205);
  assert.equal(meta.hasVideo, false);
});

check("parseYtDlpInfo: hasVideo detecta slides de video en un carrusel mixto", () => {
  const mixto = parseYtDlpInfo({ _type: "playlist", entries: [{ thumbnail: "https://x/1.jpg" }, { duration: 12, vcodec: "h264" }] });
  assert.equal(mixto.isVideo, false);
  assert.equal(mixto.hasVideo, true);
  assert.equal(parseYtDlpInfo({ duration: 30 }).hasVideo, true);
});

check("pythonForYtDlp: usa el intérprete del shebang, o python3 + PYTHONPATH (zipapp)", () => {
  assert.deepEqual(pythonForYtDlp("/opt/homebrew/bin/yt-dlp", "#!/opt/homebrew/Cellar/yt-dlp/x/libexec/bin/python"), {
    cmd: "/opt/homebrew/Cellar/yt-dlp/x/libexec/bin/python", args: [],
  });
  assert.deepEqual(pythonForYtDlp("/usr/bin/yt-dlp", "#!/usr/bin/env python3"), { cmd: "/usr/bin/env", args: ["python3"] });
  assert.deepEqual(pythonForYtDlp("/usr/local/bin/yt-dlp", "PK\u0003\u0004"), {
    cmd: "python3", args: [], env: { PYTHONPATH: "/usr/local/bin/yt-dlp" },
  });
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

console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
