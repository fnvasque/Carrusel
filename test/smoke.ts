import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hook, Lead, Step, MythReality, Cta, Stat, Prompt } from "../src/templates/index.ts";
import { parseStatValue } from "../src/templates/Stat.tsx";
import { fitDisplaySize, estimateLines } from "../src/templates/fit.ts";
import { theme } from "../src/theme.ts";
import { detectType, extractImageUrls, extractVideoUrl } from "../src/remix/ingest.ts";
import { isTemplateName, validPropKeys } from "../src/remix/templates-catalog.ts";
import { slugify, validateDraft, templatesImportBase } from "../src/remix/emit.ts";
import { draftToSpec, scoreDraft } from "../src/remix/registry.ts";
import { THRESHOLD, scoreCarousel } from "../src/score/virality.ts";
import { pillContent } from "../src/templates/Cta.tsx";
import { contentHeight, sourceLines, wrapLines } from "../src/templates/layout.ts";
import { linearFit, projectOutcome, pearson, type CalibrationModel } from "../src/score/calibration.ts";
import type { VariationDraft } from "../src/remix/types.ts";
import { extractShortcode, extractUsername, findByShortcode, hasMorePages, mediaTypeOf } from "../src/remix/providers/meta.ts";
import { appSecretProof, maxUsagePercent, translateGraphError } from "../src/meta/client.ts";
import { daysLeft } from "../src/meta/check.ts";
import { sceneSeconds, specDurations, entranceBudget, entranceScale, reelTiming, FPS, DEFAULT_TRANSITION } from "../src/reel/timing.ts";
import { buildReelPage } from "../src/reel/page.ts";

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

/** Igual que `check`, para casos async (se esperan con `await` en el top-level). */
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
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

// --- Meta: proveedor de ingesta (funciones puras, sin red) ---
check("extractShortcode soporta /p/, /reel/, /reels/, /tv/ y /{usuario}/p/{code}/", () => {
  assert.equal(extractShortcode("https://www.instagram.com/p/DdvB-rtl-UR/"), "DdvB-rtl-UR");
  assert.equal(extractShortcode("https://www.instagram.com/reel/Ddy_O-ORVdh/?igsh=abc"), "Ddy_O-ORVdh");
  assert.equal(extractShortcode("https://instagram.com/reels/AbC123/"), "AbC123");
  assert.equal(extractShortcode("https://www.instagram.com/tv/XyZ/"), "XyZ");
  assert.equal(extractShortcode("https://www.instagram.com/natgeo/p/Code_1/"), "Code_1");
  assert.equal(extractShortcode("https://www.instagram.com/natgeo/"), undefined);
});

check("extractUsername solo devuelve el usuario si la URL lo trae", () => {
  assert.equal(extractUsername("https://www.instagram.com/natgeo/p/Code_1/"), "natgeo");
  assert.equal(extractUsername("https://www.instagram.com/ia.punto.es/reel/AbC/"), "ia.punto.es");
  assert.equal(extractUsername("https://www.instagram.com/p/DdvB-rtl-UR/"), undefined);
  assert.equal(extractUsername("https://www.instagram.com/reel/Ddy_O-ORVdh/"), undefined);
});

check("findByShortcode compara solo el shortcode (/reel/ vs /p/)", () => {
  const list = [
    { id: "1", permalink: "https://www.instagram.com/p/AAA/" },
    { id: "2", permalink: "https://www.instagram.com/reel/BBB/" },
    { id: "3" },
  ];
  assert.equal(findByShortcode(list, "BBB")?.id, "2");
  assert.equal(findByShortcode([{ id: "4", permalink: "https://www.instagram.com/p/CCC/" }], "CCC")?.id, "4");
  assert.equal(findByShortcode(list, "ZZZ"), undefined);
});

check("hasMorePages: sigue con cursor y página llena (la API no trae paging.next)", () => {
  assert.equal(hasMorePages(50, "QVFI"), true);
  assert.equal(hasMorePages(12, "QVFI"), false);
  assert.equal(hasMorePages(50, undefined), false);
});

check("mediaTypeOf mapea media_type de la API", () => {
  assert.equal(mediaTypeOf("VIDEO"), "reel");
  assert.equal(mediaTypeOf("CAROUSEL_ALBUM"), "carousel");
  assert.equal(mediaTypeOf("IMAGE"), "post");
  assert.equal(mediaTypeOf(undefined), "unknown");
});

// --- Meta: cliente (funciones puras) ---
check("translateGraphError: token, permisos, cuota, Business Discovery y secret", () => {
  assert.match(translateGraphError({ code: 190, message: "Error validating access token" }), /venció o es inválido/);
  assert.match(translateGraphError({ code: 10, message: "x" }), /falta un permiso/);
  assert.match(translateGraphError({ code: 200, message: "x" }), /falta un permiso/);
  assert.match(translateGraphError({ code: 100, message: "Unknown field" }), /falta un permiso o el campo no existe/);
  for (const code of [4, 17, 32, 613]) assert.match(translateGraphError({ code, message: "x" }), /límite de uso/);
  assert.match(translateGraphError({ code: 110, error_subcode: 2207013, message: "x" }), /Business o Creator/);
  assert.match(translateGraphError({ code: 100, message: "Invalid appsecret_proof provided" }), /META_APP_SECRET/);
  assert.ok(!translateGraphError({ message: "bad access_token=EAAB123 here" }).includes("EAAB123"));
});

check("maxUsagePercent lee X-App-Usage y X-Business-Use-Case-Usage", () => {
  assert.equal(maxUsagePercent('{"call_count":12,"total_time":85,"total_cputime":3}', null), 85);
  assert.equal(maxUsagePercent(null, '{"123":[{"type":"instagram","call_count":40,"total_time":5,"total_cputime":2}]}'), 40);
  assert.equal(maxUsagePercent(null, null), undefined);
  assert.equal(maxUsagePercent("no json", null), undefined);
});

check("appSecretProof es HMAC-SHA256 hex del token", () => {
  assert.equal(appSecretProof("token", "secret"), "e941110e3d2bfe82621f0e3e1434730d7305d106c5f68c87165d0b27a4611a4a");
  assert.notEqual(appSecretProof("token", "secret"), appSecretProof("token", "otro"));
});

check("daysLeft: días al vencimiento; 0 = no expira", () => {
  const now = Date.UTC(2026, 8, 27);
  assert.equal(daysLeft(now / 1000 + 5 * 86_400, now), 5);
  assert.equal(daysLeft(0, now), Infinity);
  assert.equal(daysLeft(undefined, now), undefined);
});

// --- reel: timing (tiempos puros del reel animado) ---
check("sceneSeconds: más texto → más tiempo, con tope y piso", () => {
  assert.equal(sceneSeconds({ title: "Hola" }, false), 2.4);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, false), 4.8);
  assert.equal(sceneSeconds({ title: "Hola" }, true), 3.1);
  assert.equal(sceneSeconds({ bullets: ["a".repeat(26), "b".repeat(26)] }, false), 3.84);
});

check("specDurations: hold en primera y última; --seconds fija todas", () => {
  const T = () => null;
  const spec = { name: "x", slides: [{ template: T, props: { title: "A" } }, { template: T, props: { title: "B" } }, { template: T, props: { title: "C" } }] };
  assert.deepEqual(specDurations(spec as any), [3.1, 2.4, 3.1]);
  assert.deepEqual(specDurations(spec as any, 2), [2, 2, 2]);
});

check("reelTiming: escenas solapadas por la transición", () => {
  const t = reelTiming([3, 2.5, 4], 0.35);
  assert.deepEqual(t.scenes.map((s) => s.start), [0, 2.65, 4.8]);
  assert.equal(t.total, 8.8);
  assert.equal(t.frames, 264);
  assert.equal(t.fps, FPS);
  assert.equal(t.transition, 0.35);
});

check("reelTiming: 1 sola escena, sin transición", () => {
  const t = reelTiming([3.1]);
  assert.equal(t.total, 3.1);
  assert.equal(t.frames, 93);
  assert.equal(t.scenes[0].start, 0);
  assert.equal(DEFAULT_TRANSITION, 0.35);
});

check("reelTiming: transición demasiado larga → error claro", () => {
  assert.throws(() => reelTiming([0.5, 0.5], 0.35), /transición/);
  assert.throws(() => reelTiming([]), /escena/);
});

check("reelTiming: duraciones y transición inválidas → error claro en español", () => {
  for (const d of [0, -1, NaN, Infinity]) {
    assert.throws(() => reelTiming([3, d]), /--seconds debe ser un número mayor que 0/, `duración ${d}`);
  }
  for (const f of [-0.1, NaN, Infinity]) {
    assert.throws(() => reelTiming([3, 3], f), /--fade debe ser un número mayor o igual a 0/, `transición ${f}`);
  }
  assert.equal(reelTiming([3, 3], 0).total, 6);
});

check("entranceBudget/entranceScale: comprime solo si hace falta", () => {
  assert.equal(entranceBudget(3), 1.2);
  assert.equal(entranceBudget(10), 1.6);
  assert.equal(entranceScale(1.0, 1.2), 1);
  assert.equal(entranceScale(2.4, 1.2), 2);
});

check("plantillas: marcas data-anim en formato reel", () => {
  const hook = renderToStaticMarkup(createElement(Hook, { title: "La IA cambió todo", highlight: "cambió", eyebrow: "Ojo", subtitle: "Sub", format: "reel", background: { color: "#000" } }));
  assert.match(hook, /<h1[^>]*data-anim="words"/);
  assert.match(hook, /data-anim="pop"[^>]*>cambió</);
  assert.match(hook, /data-anim="bg"/);
  assert.equal((hook.match(/data-anim="rise"/g) ?? []).length, 2);
  const step = renderToStaticMarkup(createElement(Step, { heading: "Paso", bullets: ["a", "b"], format: "reel" }));
  assert.match(step, /<ul[^>]*data-anim="stagger"/);
  const myth = renderToStaticMarkup(createElement(MythReality, { myth: "M", reality: "R", format: "reel" }));
  assert.match(myth, /data-anim="strike"/);
});

check("plantillas: sin highlight (o no encontrado) no hay pop", () => {
  const a = renderToStaticMarkup(createElement(Cta, { title: "Suscríbete", format: "reel" }));
  const b = renderToStaticMarkup(createElement(Lead, { text: "Una frase", highlight: "nada", format: "reel" }));
  assert.doesNotMatch(a, /data-anim="pop"/);
  assert.doesNotMatch(b, /data-anim="pop"/);
  assert.match(b, /data-anim="words"/);
});

check("plantillas: Stat marca count con valor numérico y no numérico", () => {
  const num = renderToStaticMarkup(createElement(Stat, { value: "47%", label: "del valor", context: "Contexto", format: "reel" }));
  assert.match(num, /data-anim="count"[^>]*>47%</);
  assert.match(num, /<h2[^>]*data-anim="words"/);
  assert.match(num, /data-meter=""/, "barra del porcentaje");
  assert.match(num, /width:47%/);
  const txt = renderToStaticMarkup(createElement(Stat, { value: "Gratis", label: "para siempre" }));
  assert.match(txt, /data-anim="count"[^>]*>Gratis</);
  assert.doesNotMatch(txt, /data-meter/, "sin barra si no es porcentaje");
});

check("parseStatValue: prefijos, sufijos, miles y no numéricos", () => {
  assert.deepEqual(parseStatValue("47%"), { prefix: "", number: 47, suffix: "%" });
  assert.deepEqual(parseStatValue("$1.200/mes"), { prefix: "$", number: 1200, suffix: "/mes" });
  assert.deepEqual(parseStatValue("8×"), { prefix: "", number: 8, suffix: "×" });
  assert.deepEqual(parseStatValue("3,5 s"), { prefix: "", number: 3.5, suffix: " s" });
  assert.equal(parseStatValue("Gratis"), null);
});

check("plantillas: checklist con un check por viñeta y cursor del Prompt", () => {
  const step = renderToStaticMarkup(createElement(Step, { heading: "Paso", bullets: ["a", "b", "c"], format: "reel" }));
  const lis = step.match(/<li[^>]*>.*?<\/li>/g) ?? [];
  assert.equal(lis.length, 3);
  for (const li of lis) assert.equal((li.match(/data-anim="check"/g) ?? []).length, 1, "un check dentro de cada li");
  const body = renderToStaticMarkup(createElement(Step, { heading: "Paso", body: "Cuerpo" }));
  assert.doesNotMatch(body, /data-anim="check"/);
  const prompt = renderToStaticMarkup(createElement(Prompt, { heading: "H", prompt: "hola", format: "reel" }));
  assert.match(prompt, /data-anim="type"[^>]*>hola<span data-anim="caret"/);
});

check("Frame: grilla data-grid solo en reel, etiqueta NN / PILAR y tokens lima", () => {
  const reel = renderToStaticMarkup(createElement(Step, { heading: "Paso", pillar: "noticia", index: 3, total: 7, format: "reel" }));
  const post = renderToStaticMarkup(createElement(Step, { heading: "Paso", pillar: "noticia", index: 3, total: 7 }));
  assert.match(reel, /data-grid=""/);
  assert.doesNotMatch(post, /data-grid/);
  assert.match(post, /rgba\(198,255,61,0\.07\)/, "grilla lima al 7 %");
  assert.match(post, /background-color:#06060A/);
  assert.match(post, new RegExp(`color:${theme.colors.violet}">03</span>`), "número en color del pilar");
  assert.match(post, />NOTICIA</);
  // Logo, etiqueta y fuente no llevan data-anim.
  const withSrc = renderToStaticMarkup(createElement(Step, { heading: "Paso", source: "Fuente: X", pillar: "noticia", index: 3, format: "reel" }));
  for (const b of withSrc.match(/<[^>]*data-brand="[^"]*"[^>]*>/g) ?? []) assert.doesNotMatch(b, /data-anim/);
});

check("Hook: mark pinta la palabra con caja rosa sin pop", () => {
  const h = renderToStaticMarkup(createElement(Hook, { title: "No encuentras ninguno.", highlight: "encuentras", mark: "ninguno.", format: "reel" }));
  assert.match(h, /data-anim="pop"[^>]*>encuentras</);
  assert.match(h, /data-mark=""[^>]*background-color:#FF3D7F[^>]*>ninguno\.</);
  assert.equal((h.match(/data-anim="pop"/g) ?? []).length, 1);
});

check("fitDisplaySize: cortos al máximo, largos más chicos y dentro de maxLines", () => {
  assert.equal(fitDisplaySize("Hola", 150), 150);
  const long = "Seis niveles para que nadie te haga scroll nunca más";
  const s = fitDisplaySize(long, 150, { maxLines: 4 });
  assert.ok(s < 150 && estimateLines(long, s) <= 4, `tamaño ${s}`);
});

check("remix: Stat en el catálogo (nombre, props) y en draftToSpec", () => {
  assert.equal(isTemplateName("Stat"), true);
  const keys = validPropKeys("Stat");
  for (const k of ["value", "label", "context", "source", "index"]) assert.ok(keys.has(k), k);
  assert.ok(!keys.has("bullets"));
  assert.ok(validPropKeys("Hook").has("mark"));
  assert.ok(validPropKeys("Cta").has("ctaIcon"));
  const v = validateDraft({ name: "s", angle: "x", pillar: "noticia", slides: [{ template: "Stat", props: { label: "del valor" } }] });
  const stat = v.slides.find((x) => x.template === "Stat")!;
  assert.equal(stat.props.value, "…", "value requerido se rellena");
  const spec = draftToSpec(v);
  assert.equal(spec.slides.find((x) => x.template === Stat)?.template, Stat);
});

check("viralidad: Stat cuenta como desarrollo accionable y como slide numerado", () => {
  const hook = { template: Hook, props: { title: "Hook" } };
  const cta = { template: Cta, props: { title: "Fin" } };
  const withStat = scoreCarousel({ name: "a", slides: [hook, { template: Stat, props: { value: "47%", label: "del valor", context: "Usa esa ventana." } }, cta] });
  const withLead = scoreCarousel({ name: "b", slides: [hook, { template: Lead, props: { text: "Usa esa ventana." } }, cta] });
  const dim = (r: typeof withStat, n: string) => r.dimensions.find((d) => d.name === n)!.score;
  assert.equal(dim(withStat, "Retención") - dim(withLead, "Retención"), 7, "Stat con número = slide numerado");
  assert.ok(dim(withStat, "Accionable") > dim(withLead, "Accionable"), "Stat entra en los slides de desarrollo");
  const nonNumeric = scoreCarousel({ name: "c", slides: [hook, { template: Stat, props: { value: "Gratis", label: "x" } }, cta] });
  assert.equal(dim(nonNumeric, "Retención"), dim(withLead, "Retención"), "un Stat sin número no cuenta como numerado");
});

check("mono sin ligaduras: el código se ve como se escribe", () => {
  const p = renderToStaticMarkup(createElement(Prompt, { heading: "H", prompt: "pip install kokoro>=0.9.4" }));
  const typeDiv = p.match(/<div data-anim="type" style="([^"]*)"/)![1];
  assert.match(typeDiv, /font-variant-ligatures:none/);
  assert.match(typeDiv, /font-feature-settings:&quot;liga&quot; 0, &quot;calt&quot; 0/);
  assert.match(p, /kokoro&gt;=0\.9\.4/);
  const step = renderToStaticMarkup(createElement(Step, { heading: "H", pillar: "noticia", index: 2, source: "a->b" }));
  for (const m of step.match(/<span data-brand="(label|source)" style="[^"]*"/g) ?? []) assert.match(m, /font-variant-ligatures:none/);
});

check("Cta: la pastilla quita emoji y usa ícono SVG", () => {
  assert.deepEqual(pillContent("Guardar 🔖"), { text: "Guardar", icon: "bookmark" });
  assert.deepEqual(pillContent("Compartir ↗"), { text: "Compartir", icon: "share" });
  assert.deepEqual(pillContent("Link en bio →"), { text: "Link en bio →", icon: undefined });
  assert.deepEqual(pillContent("Guardar 🔖", "none"), { text: "Guardar", icon: undefined });
  const html = renderToStaticMarkup(createElement(Cta, { title: "T", cta: "Guardar 🔖" }));
  assert.doesNotMatch(html, /🔖/);
  assert.match(html, />Guardar<svg/);
});

check("layout: la fuente al pie reserva su alto real y Step/Stat se ajustan al área", () => {
  const long = "Fuente: un informe con un nombre muy largo, publicado por una organización con un nombre igual de largo, 2026";
  assert.equal(sourceLines("Fuente: X"), 1);
  assert.ok(sourceLines(long) >= 2);
  assert.ok(contentHeight("post", long) < contentHeight("post", "Fuente: X"));
  assert.ok(contentHeight("reel") < 1920 - 440 - 150);
  assert.equal(wrapLines("a\nb c", 10, 1000), 2);
  const big = (html: string) => Number(html.match(/<li[^>]*font-size:(\d+)px/)![1]);
  const few = renderToStaticMarkup(createElement(Step, { heading: "Paso", step: "01", bullets: ["Corta"] }));
  const LONG = "Una viñeta larga de verdad, con bastante texto para ocupar dos líneas";
  const many = renderToStaticMarkup(createElement(Step, { heading: "Paso", step: "01", bullets: [LONG, LONG, LONG, LONG, LONG], source: long, format: "reel" }));
  assert.ok(big(many) <= big(few), "más viñetas → cuerpo igual o menor");
  assert.ok(big(many) >= 36, "nunca bajo 36 px");
  const wrapped = renderToStaticMarkup(createElement(Stat, { value: "1 de cada 3 personas", label: "x" }));
  assert.match(wrapped, /data-anim="count" style="[^"]*white-space:normal/, "valor largo no numérico se parte en líneas");
  const one = renderToStaticMarkup(createElement(Stat, { value: "47%", label: "x" }));
  assert.match(one, /data-anim="count" style="[^"]*white-space:nowrap/);
});

check("highlight: la puntuación pegada no se separa de la palabra clave", () => {
  const h = renderToStaticMarkup(createElement(Hook, { title: "Narra gratis, sin salir", highlight: "gratis" }));
  assert.match(h, /<span style="white-space:nowrap"><span data-anim="pop"[^>]*>gratis<\/span>,<\/span>/);
});

check("plantillas: formato post sin capa bg ni strike", () => {
  const hook = renderToStaticMarkup(createElement(Hook, { title: "T", background: { color: "#000" } }));
  const myth = renderToStaticMarkup(createElement(MythReality, { myth: "M", reality: "R" }));
  assert.doesNotMatch(hook, /data-anim="bg"/);
  assert.doesNotMatch(myth, /data-anim="strike"/);
  assert.match(myth, /text-decoration-line:line-through/, "en post, tachado rosa estático");
});

// --- reel: página única ---
await checkAsync("buildReelPage: una escena por slide, GSAP y tiempos inline", async () => {
  const spec = {
    name: "t",
    slides: [
      { template: Hook, props: { title: "Hola mundo", highlight: "mundo" } },
      { template: Cta, props: { title: "Chao" } },
    ],
  };
  const timing = reelTiming([3, 3]);
  const html = await buildReelPage(spec as any, timing);
  assert.equal((html.match(/data-scene="/g) ?? []).length, 2);
  assert.match(html, /window\.__REEL_TIMING__\s*=\s*\{/);
  assert.match(html, /SplitText/);
  assert.match(html, /__reel\s*=/);
  assert.match(html, /data-anim="pop"/);
});

console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
