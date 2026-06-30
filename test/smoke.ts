import assert from "node:assert/strict";
import { detectType, extractImageUrls, extractVideoUrl } from "../src/remix/ingest.ts";
import { isTemplateName, validPropKeys } from "../src/remix/templates-catalog.ts";
import { slugify, validateDraft, templatesImportBase } from "../src/remix/emit.ts";
import { draftToSpec, scoreDraft } from "../src/remix/registry.ts";
import { THRESHOLD } from "../src/score/virality.ts";
import { fitDisplaySize, MIN_DISPLAY } from "../src/templates/fit.ts";
import { highlightText } from "../src/templates/highlight.tsx";
import { digitsOf } from "../src/templates/GhostNumber.tsx";
import { theme } from "../src/theme.ts";
import { linearFit, projectOutcome, pearson, type CalibrationModel } from "../src/score/calibration.ts";
import type { VariationDraft } from "../src/remix/types.ts";

/**
 * Smoke tests offline del pipeline de remix: solo funciones puras (parsing de
 * ingesta, catálogo, validación y scoring en memoria). Sin red/OpenAI/ffmpeg/yt-dlp.
 * Falla con exit≠0 si algún caso se rompe → sirve de quality gate junto al typecheck.
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

// --- ingest: detectType ---
check("detectType reconoce reel/reels/tv/post/unknown", () => {
  assert.equal(detectType("https://www.instagram.com/reel/AbC/"), "reel");
  assert.equal(detectType("https://www.instagram.com/reels/AbC/"), "reel");
  assert.equal(detectType("https://www.instagram.com/tv/AbC/"), "reel");
  assert.equal(detectType("https://www.instagram.com/p/AbC/"), "post");
  assert.equal(detectType("https://example.com/foo"), "unknown");
});

// --- ingest: extractImageUrls ---
check("extractImageUrls deduplica, unescapea y filtra por CDN", () => {
  const html = `
    <meta property="og:image" content="https://scontent.cdninstagram.com/v/cover.jpg?a=1&amp;b=2" />
    <script>{"edge_sidecar_to_children":{"edges":[
      {"node":{"display_url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/slide1.jpg?c=1&3"}},
      {"node":{"display_url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/slide2.jpg"}}
    ]}}</script>
    <img src="https://static.cdninstagram.com/rsrc.php/icon.png" />
    <meta property="og:image" content="https://scontent.cdninstagram.com/v/cover.jpg?a=1&amp;b=2" />
  `;
  const imgs = extractImageUrls(html);
  assert.equal(imgs.length, 3, `esperaba 3, obtuve ${imgs.length}`);
  // og:image deduplicado y con & decodificado
  assert.equal(imgs.filter((u) => u.includes("cover.jpg")).length, 1);
  assert.ok(imgs[0].includes("cover.jpg") && imgs[0].includes("&b=2") && !imgs[0].includes("&amp;"));
  // display_url unescapeadas (sin \/)
  assert.ok(imgs.some((u) => u === "https://scontent.cdninstagram.com/v/slide1.jpg?c=1&3"));
  assert.ok(imgs.some((u) => u === "https://scontent.cdninstagram.com/v/slide2.jpg"));
  // el ícono de UI (rsrc.php) no se incluye
  assert.ok(!imgs.some((u) => u.includes("rsrc.php")));
});

// --- ingest: extractVideoUrl ---
check("extractVideoUrl lee og:video y video_url, y devuelve undefined si no hay", () => {
  assert.equal(
    extractVideoUrl(`<meta property="og:video" content="https://scontent.cdninstagram.com/v/video.mp4?x=1" />`),
    "https://scontent.cdninstagram.com/v/video.mp4?x=1",
  );
  assert.equal(
    extractVideoUrl(`<script>{"video_url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/reel.mp4"}</script>`),
    "https://scontent.cdninstagram.com/v/reel.mp4",
  );
  assert.equal(extractVideoUrl(`<html><body>sin video</body></html>`), undefined);
});

// --- catalog: isTemplateName / validPropKeys ---
check("isTemplateName valida nombres del catálogo", () => {
  assert.equal(isTemplateName("Hook"), true);
  assert.equal(isTemplateName("Cta"), true);
  assert.equal(isTemplateName("Foo"), false);
});

check("validPropKeys incluye props de plantilla + base y excluye ajenas", () => {
  const keys = validPropKeys("Hook");
  assert.ok(keys.has("title"));
  assert.ok(keys.has("highlight"));
  assert.ok(keys.has("background"));
  assert.ok(keys.has("pillar"));
  assert.ok(!keys.has("myth")); // prop de MythReality, no de Hook
});

// --- emit: slugify ---
check("slugify normaliza acentos/símbolos a kebab ascii y default", () => {
  assert.equal(slugify("Á remix Ñoño 2024!"), "a-remix-nono-2024");
  assert.equal(slugify(""), "remix");
});

// --- emit: validateDraft ---
check("validateDraft garantiza Hook inicial + Cta final, limpia props y recalcula index/total", () => {
  const draft: VariationDraft = {
    name: "prueba",
    angle: "x",
    pillar: "curiosidad",
    slides: [
      { template: "Step", props: { heading: "Paso", body: "algo", bogus: "x" as unknown as string } },
      { template: "MythReality", props: { myth: "m", reality: "r" } },
    ],
  };
  const v = validateDraft(draft);
  assert.equal(v.slides[0].template, "Hook");
  assert.equal(v.slides[v.slides.length - 1].template, "Cta");
  const step = v.slides.find((s) => s.template === "Step");
  assert.ok(step && step.props.bogus === undefined, "la prop bogus debe eliminarse");
  // slides de desarrollo con index/total numéricos y total = nº de slides
  const dev = v.slides.filter((s) => s.template !== "Hook" && s.template !== "Cta");
  for (const s of dev) {
    assert.equal(typeof s.props.index, "number");
    assert.equal(s.props.total, v.slides.length);
  }
});

check("validateDraft conserva orden si ya empieza con Hook y termina con Cta", () => {
  const draft: VariationDraft = {
    name: "ok",
    angle: "x",
    pillar: "curiosidad",
    slides: [
      { template: "Hook", props: { title: "Titular con 3 cosas", highlight: "3" } },
      { template: "Step", props: { heading: "Paso" } },
      { template: "Cta", props: { title: "Guárdalo", handle: "ia.punto.es" } },
    ],
  };
  const v = validateDraft(draft);
  assert.equal(v.slides[0].template, "Hook");
  assert.equal(v.slides[v.slides.length - 1].template, "Cta");
});

// --- registry: draftToSpec ---
check("draftToSpec mapea a componentes y conserva pillar en defaults", () => {
  const draft: VariationDraft = {
    name: "spec",
    angle: "x",
    pillar: "noticia",
    slides: [
      { template: "Hook", props: { title: "Algo" } },
      { template: "Cta", props: { title: "Guárdalo" } },
    ],
  };
  const valid = validateDraft(draft);
  const spec = draftToSpec(valid);
  assert.equal(spec.slides.length, valid.slides.length);
  assert.equal(typeof spec.slides[0].template, "function");
  assert.equal(spec.defaults?.pillar, "noticia");
});

// --- registry: scoreDraft ---
check("scoreDraft: weak < strong y strong supera el umbral", () => {
  const weak: VariationDraft = {
    name: "debil",
    angle: "x",
    pillar: "curiosidad",
    slides: [{ template: "Lead", props: { text: "La IA es interesante" } }],
  };
  const strong: VariationDraft = {
    name: "fuerte",
    angle: "errores",
    pillar: "curiosidad",
    slides: [
      { template: "Hook", props: { title: "3 errores que NO debes cometer con la IA", highlight: "errores", subtitle: "El #2 te cuesta plata." } },
      { template: "MythReality", props: { mythLabel: "Mito Nº1", myth: "La IA siempre acierta.", reality: "Inventa: tú revisas." } },
      { template: "MythReality", props: { mythLabel: "Mito Nº2", myth: "Necesitas saber de tecnología.", reality: "Si usas WhatsApp, sabes usarla." } },
      { template: "Step", props: { step: "03", heading: "Prueba esto hoy", body: "Pídele un resumen de 3 puntos." } },
      { template: "Cta", props: { title: "Guárdalo y mándaselo a alguien", highlight: "Guárdalo", reason: "Lo que importa en IA, cada semana.", handle: "ia.punto.es" } },
    ],
  };
  const ws = scoreDraft(weak).total;
  const ss = scoreDraft(strong).total;
  assert.ok(ws < ss, `weak(${ws}) debe ser < strong(${ss})`);
  assert.ok(ss >= THRESHOLD, `strong(${ss}) debe alcanzar el umbral ${THRESHOLD}`);
});

// --- emit: templatesImportBase (ruta de import relativa a la carpeta de salida) ---
check("templatesImportBase calcula la ruta relativa según la profundidad del out", () => {
  assert.equal(templatesImportBase("carousels"), "../src/templates");
  assert.equal(templatesImportBase("carousels/_live"), "../../src/templates");
  assert.equal(templatesImportBase("carousels/a/b"), "../../../src/templates");
});

// --- calibration: linearFit ---
check("linearFit ajusta una recta exacta y devuelve null en varianza 0", () => {
  const fit = linearFit([0, 1, 2], [1, 3, 5]);
  assert.ok(fit, "esperaba un fit");
  assert.ok(Math.abs(fit.slope - 2) < 1e-9, `slope ${fit.slope}`);
  assert.ok(Math.abs(fit.intercept - 1) < 1e-9, `intercept ${fit.intercept}`);
  assert.equal(linearFit([1, 1, 1], [1, 2, 3]), null);
});

// --- calibration: projectOutcome ---
check("projectOutcome aplica las rectas y clampa a 0", () => {
  const model: CalibrationModel = {
    n: 3,
    rSaves: 1,
    rShares: 1,
    saves: { slope: 2, intercept: 1 },
    shares: { slope: 0, intercept: 0.5 },
    updatedAt: "",
  };
  const p = projectOutcome(model, 10);
  assert.equal(p.savesPerK, 21);
  assert.equal(p.sharesPerK, 0.5);
  const neg: CalibrationModel = { ...model, saves: { slope: -5, intercept: 1 } };
  assert.equal(projectOutcome(neg, 10).savesPerK, 0); // clamp
});

// --- calibration: pearson ---
check("pearson da 1 en correlación perfecta y null con <3 puntos", () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1, 2], [1, 2]), null);
});

// --- fit: piso type-as-hero ---
check("fitDisplaySize aplica piso a titulares grandes, no a escalas chicas", () => {
  // titular largo con max=display → no baja del piso
  const largo = "Un titular muy largo que antes encogía hasta volverse ilegible en la portada";
  assert.ok(fitDisplaySize(largo, theme.fontSize.display) >= MIN_DISPLAY, "display debe respetar el piso");
  // con max chico (heading) NO se infla al piso (sigue siendo proporcional)
  assert.ok(fitDisplaySize(largo, theme.fontSize.heading) < MIN_DISPLAY, "heading no debe inflarse al piso");
  // titular corto se mantiene grande
  assert.equal(fitDisplaySize("Corto", theme.fontSize.display), theme.fontSize.display);
});

// --- highlight: tratamientos ---
check("highlightText soporta slab/underline/color sin romper y default compatible", () => {
  // default (color) sigue devolviendo un nodo cuando hay match
  assert.notEqual(highlightText("hola mundo", "mundo", "#22D3EE"), "hola mundo");
  // sin highlight devuelve el texto crudo
  assert.equal(highlightText("hola", undefined, "#22D3EE"), "hola");
  // slab/underline no lanzan y devuelven un nodo (no string) cuando hay match
  const slab = highlightText("5 TIPS", "TIPS", "#22D3EE", "slab");
  const under = highlightText("5 TIPS", "TIPS", "#22D3EE", "underline");
  assert.equal(typeof slab, "object");
  assert.equal(typeof under, "object");
});

// --- GhostNumber: digitsOf ---
check("digitsOf extrae 1-2 dígitos del label o devuelve vacío", () => {
  assert.equal(digitsOf("Nº1"), "1");
  assert.equal(digitsOf("01"), "01");
  assert.equal(digitsOf("Mentira Nº3"), "3");
  assert.equal(digitsOf("sin número"), "");
  assert.equal(digitsOf(undefined), "");
});

console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
