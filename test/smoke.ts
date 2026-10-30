import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hook, Lead, Step, MythReality, Cta, Stat, Prompt, StoryCover, Clip, Screen } from "../src/templates/index.ts";
import { parseStatValue } from "../src/templates/Stat.tsx";
import { fitDisplaySize, estimateLines } from "../src/templates/fit.ts";
import { theme, serieLabel } from "../src/theme.ts";
import { detectType, extractImageUrls, extractVideoUrl } from "../src/remix/ingest.ts";
import { isTemplateName, validPropKeys, TEMPLATE_CATALOG, catalogoRemix } from "../src/remix/templates-catalog.ts";
import { slugify, validateDraft, templatesImportBase } from "../src/remix/emit.ts";
import { draftToSpec, scoreDraft, esReelNarrado } from "../src/remix/registry.ts";
import { THRESHOLD, scoreCarousel, scoreReel } from "../src/score/virality.ts";
import { readFileSync } from "node:fs";
import { pillContent } from "../src/templates/Cta.tsx";
import { frasesNowrap } from "../src/templates/highlight.tsx";
import { parrafos, parrafosHeight } from "../src/templates/parrafos.tsx";
import { contentHeight, sourceLines, wrapLines, firmaReserve } from "../src/templates/layout.ts";
import { linearFit, projectOutcome, pearson, type CalibrationModel } from "../src/score/calibration.ts";
import type { VariationDraft } from "../src/remix/types.ts";
import { extractShortcode, extractUsername, findByShortcode, hasMorePages, mediaTypeOf } from "../src/remix/providers/meta.ts";
import { appSecretProof, maxUsagePercent, translateGraphError } from "../src/meta/client.ts";
import { daysLeft } from "../src/meta/check.ts";
import { sceneSeconds, sceneDurations, conNarracion, CLIP_MIN_SECONDS, esEscenaClip, HOOK_MAX_SECONDS, HOOK_MAX_SECONDS_GANCHO, GANCHO, PACE_NAMES, maxSecondsError, specDurations, entranceBudget, entranceScale, reelTiming, specTiming, parsePace, PACES, DEFAULT_PACE, FPS, DEFAULT_TRANSITION } from "../src/reel/timing.ts";
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

// --- registry: scoreDraft elige la rúbrica de reel narrado (pivote 2026-10-17) ---
check("scoreReel: un reel del manual (resultado, voz, Screen, gancho) pasa el umbral y uno mudo de texto no", () => {
  // Pieza real de la semana 2026-10-19 que el scorer de carrusel marcó fallida (57 < 75).
  const pieza = JSON.parse(readFileSync(new URL("./calendario/fixtures/reel-narrado-pivote.json", import.meta.url), "utf8")) as VariationDraft & { pace?: string };
  assert.ok(esReelNarrado(pieza), "una slide con narracion lo marca como reel narrado");
  const r = scoreDraft(pieza);
  assert.equal(r.dimensions.map((d) => d.name).join(","), "Hook,Narración,Pantalla,Estructura,CTA,Marca");
  assert.ok(r.total >= THRESHOLD, `reel del manual (${r.total}) debe alcanzar el umbral ${THRESHOLD}`);
  // Con el formato explícito da lo mismo que detectado.
  assert.equal(scoreDraft(pieza, { format: "reel" }).total, r.total);
  // Forzado a carrusel usa la rúbrica vieja (sin dimensión Pantalla).
  assert.ok(!scoreDraft(pieza, { format: "carrusel" }).dimensions.some((d) => d.name === "Pantalla"));

  // Reel de texto mudo con voz pegada: sin resultado en el cuadro 0, sin Screen, ritmo enseñar, 8 escenas.
  type ConVoz = VariationDraft & { pace?: string; slides: (VariationDraft["slides"][number] & { narracion?: string })[] };
  const mudo: ConVoz = {
    name: "mudo", angle: "x", pillar: "herramienta", pace: "ensenar",
    slides: [
      { template: "Hook", props: { title: "¿Por qué tu texto se olvida? El truco que nadie usa", highlight: "truco" }, narracion: "¿Por qué tu texto se olvida? El truco que nadie usa" },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ template: "Step" as const, props: { step: String(i), heading: `Paso ${i}` }, narracion: `Este es el paso ${i} de la lista.` })),
      { template: "Cta", props: { title: "Sígueme para más", highlight: "Sígueme", handle: "ia.punto.es" }, narracion: "Sígueme para más." },
    ],
  };
  const m = scoreDraft(mudo);
  assert.ok(m.total < THRESHOLD, `reel mudo (${m.total}) debe quedar bajo el umbral`);
  assert.ok(m.total < r.total);
  assert.ok(m.suggestions.some((x) => /resultado/.test(x)) && m.suggestions.some((x) => /Screen/.test(x)));
  // Un reel sin narración en ninguna slide sigue puntuándose como carrusel (los reels mudos de antes del pivote).
  assert.ok(!esReelNarrado({ ...mudo, slides: mudo.slides.map((s): VariationDraft["slides"][number] => ({ template: s.template, props: s.props })) }));
  // scoreReel directo: sin Screen pero con fuente (pieza de evidencia) recibe la mitad de Pantalla.
  const evidencia = scoreReel({ pace: "gancho", slides: [{ template: "Hook", props: {} }, { template: "Lead", props: { source: "Fuente: METR 2025" } }] });
  assert.equal(evidencia.dimensions.find((d) => d.name === "Pantalla")?.score, 10);
});

check("validateDraft: Clip primero conserva el orden, sin Hook sintético ni index en la portada", () => {
  const d = validateDraft({ name: "x", angle: "a", pillar: "herramienta", slides: [
    { template: "Clip", props: { title: "Tu idea en video con 1 frase", archivo: "a.mp4" } },
    { template: "Step", props: { heading: "Escribe la frase" } },
    { template: "Hook", props: { title: "Un hook tardío" } },
    { template: "Cta", props: { title: "Guárdalo" } },
  ] });
  assert.deepEqual(d.slides.map((s) => s.template), ["Clip", "Step", "Hook", "Cta"]);
  assert.equal(d.slides[0].props.index, undefined);
  assert.equal(d.slides[1].props.index, 2);
});

// --- templates: Clip (video generado a pantalla completa) ---
check("Clip: está en el catálogo y se renderiza con título, label y marca del archivo", () => {
  assert.ok(isTemplateName("Clip"));
  assert.deepEqual(TEMPLATE_CATALOG.Clip, { required: ["title", "archivo"], optional: ["highlight", "label"] });
  const html = renderToStaticMarkup(createElement(Clip, { title: "Tu idea en video con 1 frase", highlight: "1 frase", label: "Seedance 2.0 · 18 créditos", archivo: "idea-1.mp4", format: "reel" }));
  assert.ok(html.includes('data-clip="idea-1.mp4"'));
  assert.ok(html.includes("Seedance 2.0 · 18 créditos"));
  assert.ok(html.includes("Tu idea en video con"));
  assert.ok(html.includes('data-anim="words"'));
});

check("scoreReel: un reel con Clip de portada y Clip de desarrollo pasa el umbral; sin label ni source baja", () => {
  const pieza = JSON.parse(readFileSync(new URL("./calendario/fixtures/reel-clip.json", import.meta.url), "utf8"));
  const r = scoreDraft(pieza, { format: "reel" });
  assert.ok(r.total >= THRESHOLD, `${r.total}: ${r.suggestions.join(" | ")}`);
  assert.equal(r.dimensions.find((d) => d.name === "Hook")!.score, 25);
  assert.equal(r.dimensions.find((d) => d.name === "Pantalla")!.score, 20);
  const pobre = { ...pieza, slides: pieza.slides.map((s: any) => ({ ...s, props: { ...s.props, label: undefined, source: undefined } })) };
  assert.ok(scoreDraft(pobre, { format: "reel" }).total < r.total);
});

check("catalogoRemix: el remix (LLM) no ve la plantilla Clip, que solo usa el calendario", () => {
  const nombres = Object.keys(catalogoRemix());
  assert.ok(!nombres.includes("Clip"));
  assert.deepEqual(nombres, Object.keys(TEMPLATE_CATALOG).filter((n) => n !== "Clip"));
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
// Ritmo rápido: exactamente los valores del motor original.
check("sceneSeconds (rapido): más texto → más tiempo, con tope y piso", () => {
  assert.equal(sceneSeconds({ title: "Hola" }, false, "rapido"), 2.4);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, false, "rapido"), 4.8);
  assert.equal(sceneSeconds({ title: "Hola" }, true, "rapido"), 3.1);
  assert.equal(sceneSeconds({ bullets: ["a".repeat(26), "b".repeat(26)] }, false, "rapido"), 3.84);
});

check("specDurations (rapido): hold en primera y última; --seconds fija todas", () => {
  const T = () => null;
  const spec = { name: "x", pace: "rapido", slides: [{ template: T, props: { title: "A" } }, { template: T, props: { title: "B" } }, { template: T, props: { title: "C" } }] };
  assert.deepEqual(specDurations(spec as any), [3.1, 2.4, 3.1]);
  assert.deepEqual(specDurations(spec as any, 2), [2, 2, 2]);
  // --pace sobrescribe el ritmo del carrusel.
  assert.deepEqual(specDurations({ ...spec, pace: "ensenar" } as any, undefined, "rapido"), [3.1, 2.4, 3.1]);
});

check("reelTiming (rapido): escenas solapadas por la transición", () => {
  const t = reelTiming([3, 2.5, 4], 0.35, "rapido");
  assert.deepEqual(t.scenes.map((s) => s.start), [0, 2.65, 4.8]);
  assert.equal(t.total, 8.8);
  assert.equal(t.frames, 264);
  assert.equal(t.fps, FPS);
  assert.equal(t.transition, 0.35);
  assert.deepEqual([t.pace, t.entranceSlow, t.stagger], ["rapido", 1, 0.12]);
});

check("reelTiming (rapido): 1 sola escena, sin transición", () => {
  const t = reelTiming([3.1], undefined, "rapido");
  assert.equal(t.total, 3.1);
  assert.equal(t.frames, 93);
  assert.equal(t.scenes[0].start, 0);
  assert.equal(t.transition, 0.35);
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

check("entranceBudget/entranceScale (rapido): comprime solo si hace falta", () => {
  assert.equal(entranceBudget(3, "rapido"), 1.2);
  assert.equal(entranceBudget(10, "rapido"), 1.6);
  assert.equal(entranceScale(1.0, 1.2), 1);
  assert.equal(entranceScale(2.4, 1.2), 2);
});

// Ritmo gancho (experimento de retención 2026-10-19): hook ≤ 3 s, arranque rápido, frena pasado el 20 %, cierre lento.
check("pace gancho: válido en parsePace y PACES; valores de la curva", () => {
  assert.equal(parsePace("gancho"), "gancho");
  assert.deepEqual([...PACE_NAMES], ["ensenar", "rapido", "gancho"]);
  assert.deepEqual(PACES.gancho, { transition: 0.3, entranceSlow: 1, stagger: 0.45, budgetRatio: 0.45, budgetMax: 1.6 });
  assert.equal(HOOK_MAX_SECONDS_GANCHO, 3);
  assert.deepEqual(GANCHO, { arranque: 0.2, factorArranque: 0.85, factorMedio: 1.2, factorCierre: 1.5, minSeconds: 1.6, bulletLead: 0.6, bulletTail: 1.2 });
  // El carrusel puede fijarlo y --pace lo sobrescribe.
  const T = () => null;
  const spec = { name: "g", pace: "gancho", slides: [{ template: T, props: { title: "A" } }, { template: T, props: { title: "B" } }] };
  assert.equal(specTiming(spec as any).pace, "gancho");
  assert.equal(specTiming(spec as any, { pace: "rapido" }).pace, "rapido");
});

check("sceneSeconds (gancho): base clamp(1.6 + chars/28, 2.0, 4.5), sin respiro por hold; hook con tope 3 s", () => {
  assert.equal(sceneSeconds({ title: "Hola" }, false, "gancho"), 2);
  assert.equal(sceneSeconds({ title: "Hola" }, true, "gancho"), 2, "hold no suma en gancho (la curva alarga el cierre)");
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, false, "gancho"), 4.5);
  assert.equal(sceneSeconds({ body: "x".repeat(56) }, false, "gancho"), 3.6);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, true, "gancho", true), 3, "hook: tope 3 s");
  assert.equal(sceneSeconds({ title: "x".repeat(28) }, true, "gancho", true), 2.6);
  // En gancho los bullets no alargan la base (lo hace sceneDurations).
  assert.equal(sceneSeconds({ bullets: ["a", "b", "c", "d", "e"] }, false, "gancho"), 2);
});

check("timing: una escena Clip dura al menos 3 s en todos los ritmos y la narración la alarga igual", () => {
  const clip = { title: "Tu idea en video", archivo: "a.mp4" };
  assert.ok(esEscenaClip(clip) && !esEscenaClip({ title: "x" }));
  assert.equal(CLIP_MIN_SECONDS, 3.0);
  for (const pace of ["ensenar", "rapido", "gancho"] as const) {
    const d = sceneDurations([clip, { heading: "x" }, clip, { title: "Guárdalo" }], pace);
    assert.ok(d[0] >= 3.0 && d[2] >= 3.0, `${pace}: ${d}`);
  }
  // En gancho, sin el piso la escena 0 de 16 caracteres daría 2.17 s.
  assert.equal(sceneDurations([clip, { heading: "x" }], "gancho")[0], 3.0);
  assert.deepEqual(conNarracion([3.0], [4.1]), [4.85]);
});

check("sceneDurations (gancho): hook intacto, arranque × 0.85 antes del 20 %, medio × 1.2, cierre × 1.5, piso de bullets", () => {
  // Bases: 3 (hook, tope), 2, 2, 2, 2 → total 11; el 20 % son 2.2 s: solo la escena 1 empieza antes (en 3? no: empieza en 3 ≥ 2.2).
  const corto = { title: "Hola" };
  const hook = { body: "x".repeat(500) };
  assert.deepEqual(sceneDurations([hook, corto, corto, corto, corto], "gancho"), [3, 2.4, 2.4, 2.4, 3]);
  // Hook breve (base 2): la escena 1 empieza en 2 < 0.2 × 10 = 2 → no; con hook de 1.6… el piso es 2.0, así que el arranque
  // aplica cuando el hook es corto respecto del total: bases 2, 2, 4.5, 4.5, 4.5 → total 17.5; 20 % = 3.5: la escena 1 (empieza en 2) va × 0.85.
  const largo = { body: "x".repeat(500) };
  assert.deepEqual(sceneDurations([corto, corto, largo, largo, largo], "gancho"), [2, 1.7, 5.4, 5.4, 6.75]);
  // Piso: nunca menos de 1.6 s ni de lo que piden los bullets (0.6 + 0.45 × (n − 1) + 1.2).
  assert.deepEqual(sceneDurations([corto, { bullets: ["a", "b", "c", "d"] }, largo, largo, largo], "gancho"), [2, 3.15, 5.4, 5.4, 6.75]);
  // Una sola escena: es hook y última a la vez; manda el hook.
  assert.deepEqual(sceneDurations([largo], "gancho"), [3]);
  // En ensenar y rapido es sceneSeconds escena a escena.
  assert.deepEqual(sceneDurations([corto, corto, corto], "rapido"), [3.1, 2.4, 3.1]);
  assert.deepEqual(sceneDurations([corto, corto, corto], "ensenar"), [4.5, 3.5, 4.5]);
  const T = () => null;
  const spec = { name: "g", pace: "gancho", slides: [corto, corto, largo, largo, largo].map((props) => ({ template: T, props })) };
  assert.deepEqual(specDurations(spec as any), [2, 1.7, 5.4, 5.4, 6.75]);
  const t = specTiming(spec as any);
  assert.equal(t.transition, 0.3);
  assert.equal(t.total, +(2 + 1.7 + 5.4 + 5.4 + 6.75 - 4 * 0.3).toFixed(3));
  assert.deepEqual([t.entranceSlow, t.stagger, t.bulletTail], [1, 0.45, 0]);
  // Las escenas del arranque caben con la transición (0.3 × 2 < 1.6).
  assert.ok(GANCHO.minSeconds > 2 * PACES.gancho.transition);
});

check("maxSecondsError: sin tope no dice nada; tope inválido o superado → mensaje claro", () => {
  assert.equal(maxSecondsError(30, undefined), undefined);
  assert.equal(maxSecondsError(20, 20), undefined);
  assert.equal(maxSecondsError(19.999999999, 20), undefined);
  assert.match(maxSecondsError(24.5, 20)!, /dura 24\.5 s y el tope es 20 s \(duracionMaxSegundos\)/);
  for (const m of [0, -1, NaN, Infinity]) assert.match(maxSecondsError(10, m)!, /tope de duración .* no es válido/, `tope ${m}`);
});

// Ritmo enseñar (por defecto): valores de la spec "Reel: estilo y ritmo".
check("pace: ensenar por defecto; valores inválidos → error claro en español", () => {
  assert.equal(DEFAULT_PACE, "ensenar");
  assert.equal(parsePace("rapido"), "rapido");
  assert.equal(parsePace("ensenar"), "ensenar");
  for (const v of ["lento", "", "Ensenar", undefined]) {
    assert.throws(() => parsePace(v), /--pace debe ser "ensenar", "rapido" o "gancho"/, `pace ${v}`);
  }
  const T = () => null;
  assert.throws(() => specDurations({ name: "x", pace: "turbo", slides: [{ template: T, props: {} }] } as any), /pace de "x" debe ser "ensenar", "rapido" o "gancho"/);
  assert.deepEqual(PACES.ensenar, { transition: 0.5, entranceSlow: 1.3, stagger: 1.8, budgetRatio: 0.45, budgetMax: 2.4 });
});

check("sceneSeconds (ensenar): clamp(2.4 + chars/16, 3.5, 8) + 1.0 en primera y última", () => {
  assert.equal(sceneSeconds({ title: "Hola" }, false), 3.5);
  assert.equal(sceneSeconds({ title: "Hola" }, true), 4.5);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, false, "ensenar"), 8);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, true, "ensenar"), 9);
  // Escena 0 (hook): tope de 5 s en ensenar, también si mandan los bullets; rapido sin tope nuevo.
  assert.equal(HOOK_MAX_SECONDS, 5);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, true, "ensenar", true), 5);
  assert.equal(sceneSeconds({ title: "Hola" }, true, "ensenar", true), 4.5);
  assert.equal(sceneSeconds({ bullets: ["a", "b", "c", "d"] }, true, "ensenar", true), 5);
  assert.equal(sceneSeconds({ body: "x".repeat(500) }, true, "rapido", true), 5.5);
  assert.equal(sceneSeconds({ body: "x".repeat(40) }, false, "ensenar"), 4.9);
  // El texto de Stat (valor, etiqueta, contexto) y del prompt cuenta en ambos ritmos.
  const stat = { value: "47%", label: "x".repeat(37), context: "y".repeat(40) };
  assert.equal(sceneSeconds(stat, false, "ensenar"), 7.4);
  assert.equal(sceneSeconds(stat, false, "rapido"), 4.8);
  assert.equal(sceneSeconds({ heading: "x".repeat(8), prompt: "p".repeat(40) }, false, "rapido"), 3.65);
  assert.equal(sceneSeconds({ heading: "x".repeat(8), prompt: "p".repeat(40) }, false, "ensenar"), 5.4);
});

check("sceneSeconds (ensenar): con bullets, al menos 1.0 + 1.8 × (bullets − 1) + 2.5", () => {
  // Poco texto: manda la fórmula de bullets.
  assert.equal(sceneSeconds({ bullets: ["a", "b", "c"] }, false, "ensenar"), 7.1);
  assert.equal(sceneSeconds({ bullets: ["a", "b", "c", "d", "e"] }, false, "ensenar"), 10.7);
  assert.equal(sceneSeconds({ bullets: ["a"] }, false, "ensenar"), 3.5);
  // Mucho texto: manda el texto.
  assert.equal(sceneSeconds({ body: "x".repeat(200), bullets: ["a", "b"] }, false, "ensenar"), 8);
  // En rapido los bullets no alargan la escena más allá del texto.
  assert.equal(sceneSeconds({ bullets: ["a", "b", "c", "d", "e"] }, false, "rapido"), 2.4);
});

check("reelTiming/specTiming (ensenar): transición 0.5, presupuesto min(0.45 × dur, 2.4), lentitud 1.3, bullets cada 1.8 s", () => {
  const t = reelTiming([4.5, 3.5, 8, 4.5]);
  assert.deepEqual([t.pace, t.transition, t.entranceSlow, t.stagger, t.bulletTail], ["ensenar", 0.5, 1.3, 1.8, 2.5]);
  assert.equal(reelTiming([3], undefined, "rapido").bulletTail, 0);
  assert.deepEqual(t.scenes.map((s) => s.start), [0, 4, 7, 14.5]);
  assert.equal(t.total, 19);
  assert.deepEqual(t.scenes.map((s) => s.budget), [2.025, 1.575, 2.4, 2.025]);
  assert.equal(entranceBudget(4), 1.8);
  assert.equal(entranceBudget(10, "ensenar"), 2.4);
  // Entradas 1.3× más lentas; solo se comprimen si así no caben.
  assert.ok(Math.abs(entranceScale(1.0, 2.0, 1.3) - 1 / 1.3) < 1e-9);
  assert.equal(entranceScale(2.0, 1.6, 1.3), 1.25);
  const T = () => null;
  const spec = { name: "x", slides: [{ template: T, props: { title: "A" } }, { template: T, props: { bullets: ["a", "b", "c"] } }, { template: T, props: { title: "C" } }] };
  const st = specTiming(spec as any);
  assert.deepEqual(st.scenes.map((s) => s.dur), [4.5, 7.1, 4.5]);
  assert.equal(st.pace, "ensenar");
  // --pace, --seconds y --fade sobrescriben.
  const fast = specTiming({ ...spec, pace: "ensenar" } as any, { pace: "rapido" });
  assert.deepEqual([fast.pace, fast.transition, fast.scenes.map((s) => s.dur)], ["rapido", 0.35, [3.1, 2.4, 3.1]]);
  // Hook largo: specDurations pasa la escena 0 como hook (tope 5 s); --seconds sigue mandando.
  const longHook = { name: "h", slides: [{ template: T, props: { title: "x".repeat(200) } }, { template: T, props: { title: "x".repeat(200) } }, { template: T, props: { title: "C" } }] };
  assert.deepEqual(specDurations(longHook as any), [5, 8, 4.5]);
  assert.deepEqual(specDurations(longHook as any, 7), [7, 7, 7]);
  const fixed = specTiming(spec as any, { seconds: 3, fade: 0.2 });
  assert.deepEqual([fixed.transition, fixed.scenes.map((s) => s.dur), fixed.stagger], [0.2, [3, 3, 3], 1.8]);
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

check("Frame: papel liso, sin grilla, viñeta ni wordmark; la marca no lleva data-anim", () => {
  const reel = renderToStaticMarkup(createElement(Step, { heading: "Paso", pillar: "noticia", index: 3, total: 7, format: "reel" }));
  const post = renderToStaticMarkup(createElement(Step, { heading: "Paso", pillar: "noticia", index: 3, total: 7 }));
  for (const h of [reel, post]) {
    assert.doesNotMatch(h, /data-grid|rgba\(198,255,61,0\.07\)|radial-gradient|data-brand="logo"|data-brand="label"|NOTICIA/);
    assert.match(h, /background-color:#ECECEA/);
  }
  // Firma y fuente no llevan data-anim.
  const withSrc = renderToStaticMarkup(createElement(Step, { heading: "Paso", source: "Fuente: X", serie: "lo-que-construi", index: 3, total: 7, format: "reel" }));
  for (const b of withSrc.match(/<[^>]*data-brand="[^"]*"[^>]*>/g) ?? []) assert.doesNotMatch(b, /data-anim/);
});

check("theme: serieLabel traduce la serie al rótulo de cabecera", () => {
  assert.equal(serieLabel("por-donde-partir"), "Por dónde partir");
  assert.equal(serieLabel("lo-que-construi"), "Lo que construí");
  assert.equal(serieLabel(undefined), undefined);
  assert.equal(serieLabel("otra-cosa"), undefined);
});

check("Frame (post): serie en la cabecera, firma y n/total en el pie", () => {
  const h = renderToStaticMarkup(createElement(Step, { heading: "Paso", serie: "por-donde-partir", index: 2, total: 6, source: "Fuente: X", pillar: "noticia" }));
  assert.match(h, /data-brand="serie"[^>]*>Por dónde partir</);
  assert.match(h, /data-brand="firma"/);
  assert.match(h, /Felipe Vásquez/);
  assert.match(h, /data-brand="pagina"[^>]*>2\/6</);
  assert.match(h, />FV</);
  assert.doesNotMatch(h, /NOTICIA|data-brand="logo"|data-brand="label"|data-grid|undefined/);
  // La firma no lleva la línea salvo que se pida.
  assert.doesNotMatch(h, /Te ayudo a partir/);
  const conLinea = renderToStaticMarkup(createElement(Step, { heading: "Paso", index: 1, total: 6, firmaLinea: true }));
  assert.match(conLinea, /Te ayudo a partir con la IA en tu trabajo/);
});

check("Frame: sin serie la cabecera izquierda queda vacía (ni pilar ni undefined)", () => {
  const h = renderToStaticMarkup(createElement(Step, { heading: "Paso", pillar: "herramienta", index: 2, total: 6 }));
  assert.doesNotMatch(h, /data-brand="serie"|HERRAMIENTA|undefined/);
  const desconocida = renderToStaticMarkup(createElement(Step, { heading: "Paso", serie: "otra-cosa", index: 2, total: 6 }));
  assert.doesNotMatch(desconocida, /data-brand="serie"|undefined/);
});

check("Frame (reel): firma compacta en la cabecera y nada en el pie", () => {
  const h = renderToStaticMarkup(createElement(Step, { heading: "Paso", serie: "lo-que-construi", index: 2, total: 6, format: "reel", source: "Fuente: X" }));
  assert.match(h, /data-brand="serie"[^>]*>Lo que construí</);
  assert.match(h, /data-brand="firma"/);
  assert.doesNotMatch(h, /data-brand="pagina"/);
  // La firma va antes que el contenido (cabecera), no después (pie).
  assert.ok(h.indexOf('data-brand="firma"') < h.indexOf("data-content"), "firma del reel en la cabecera");
  const post = renderToStaticMarkup(createElement(Step, { heading: "Paso", index: 2, total: 6 }));
  assert.ok(post.indexOf('data-brand="firma"') > post.indexOf("data-content"), "firma del post en el pie");
});

check("layout: firmaReserve reserva el pie solo en el post", () => {
  assert.ok(firmaReserve("post") > 0);
  assert.equal(firmaReserve("reel"), 0);
  assert.equal(contentHeight("post"), 1350 - 2 * 72 - 44 - 40 - 40 - firmaReserve("post"), "el contenido descuenta la firma");
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

check("remix: Stat.value numérico se coacciona a string y ctaIcon desconocido se descarta", () => {
  const v = validateDraft({
    name: "s", angle: "x", pillar: "noticia",
    slides: [
      { template: "Stat", props: { value: 47 as any, label: "del valor" } },
      { template: "Cta", props: { title: "Fin", ctaIcon: "estrella" as any } },
    ],
  });
  assert.strictEqual(v.slides.find((x) => x.template === "Stat")!.props.value, "47");
  assert.equal("ctaIcon" in v.slides.find((x) => x.template === "Cta")!.props, false);
  const ok = validateDraft({ name: "s", angle: "x", pillar: "noticia", slides: [{ template: "Cta", props: { title: "Fin", ctaIcon: "arrow" } }] });
  assert.equal(ok.slides.find((x) => x.template === "Cta")!.props.ctaIcon, "arrow");
  // Defensa en la plantilla: un value numérico no rompe parseStatValue.
  assert.doesNotThrow(() => Stat({ value: 47 as any, label: "x" }));
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

check("viralidad: el Cta del carrusel que pide «Escríbeme PARTIR» suma el gesto, igual que «Guárdalo»", () => {
  const hook = { template: Hook, props: { title: "Hook" } };
  const ctaDim = (props: Record<string, unknown>) =>
    scoreCarousel({ name: "x", slides: [hook, { template: Cta, props: { handle: "ia.punto.es", ...props } }] }).dimensions.find((d) => d.name === "CTA")!.score;
  assert.equal(ctaDim({ title: "Guárdalo para tu próxima reunión" }), 10);
  assert.equal(ctaDim({ title: "Escríbeme PARTIR y te cuento por dónde empezar en tu caso" }), 10);
  assert.equal(ctaDim({ title: "Te cuento por dónde empezar", cta: "Escríbeme PARTIR" }), 10, "la pastilla también cuenta");
  assert.equal(ctaDim({ title: "Escribeme PARTIR" }), 10, "sin tilde");
  assert.equal(ctaDim({ title: "Fin" }), 4, "sin gesto: solo el handle");
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

// Carrusel del martes 2026-10-27: el highlight de varias palabras iba entero en un nowrap y
// «¿ESTO LO ESCRIBIÓ LA IA?» se salía por la derecha (se leía «¿ESTO LO ESCRIBIÓ»).
check("highlight: varias palabras → un pop por palabra, sin nowrap de la frase entera", () => {
  const h = renderToStaticMarkup(createElement(Hook, { title: "¿Esto lo escribió la IA? Que tu equipo no lo piense", highlight: "¿Esto lo escribió la IA?" }));
  const pops = [...h.matchAll(/<span data-anim="pop"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(pops, ["¿Esto", "lo", "escribió", "la", "IA?"]);
  // Ningún span nowrap contiene un espacio (la línea puede partirse entre palabras).
  for (const m of h.matchAll(/<span[^>]*white-space:nowrap[^>]*>(.*?)<\/span>/g)) assert.doesNotMatch(m[1].replace(/<[^>]*>/g, ""), /\s/, m[0]);
  for (const format of ["post", "reel"] as const) {
    const r = renderToStaticMarkup(createElement(Hook, { title: "¿Esto lo escribió la IA? Que tu equipo no lo piense", highlight: "¿Esto lo escribió la IA?", format }));
    assert.equal((r.match(/data-anim="pop"/g) ?? []).length, 5, format);
  }
});
check("highlight: varias palabras con puntuación pegada → la puntuación va con la última", () => {
  const h = renderToStaticMarkup(createElement(Hook, { title: "Narra y subtitula gratis, sin salir", highlight: "subtitula gratis" }));
  assert.match(h, /<span data-anim="pop"[^>]*>subtitula<\/span> <span style="white-space:nowrap"><span data-anim="pop"[^>]*>gratis<\/span>,<\/span>/);
});
check("frasesNowrap: el resaltado solo cuenta como bloque si es una palabra; el mark siempre", () => {
  assert.deepEqual(frasesNowrap("gratis", "tu PC"), ["gratis", "tu PC"]);
  assert.deepEqual(frasesNowrap("¿Esto lo escribió la IA?", undefined), [undefined, undefined]);
  // Con la frase pegada, el titular del reel se achicaba como si no pudiera partirse.
  const t = "¿Esto lo escribió la IA? Que tu equipo no lo piense";
  assert.ok(fitDisplaySize(t, 220, { maxLines: 6, tight: true, keep: frasesNowrap("¿Esto lo escribió la IA?") }) >= fitDisplaySize(t, 220, { maxLines: 6, tight: true, keep: ["¿Esto lo escribió la IA?"] }));
});

// Carrusel del martes 2026-10-27 (slides 3 a 5): el ejemplo entre «» y su explicación salían
// pegados en un bloque; un \n explícito tampoco partía el párrafo.
check("parrafos: cita «…» inicial en su propio párrafo y \\n parte el párrafo", () => {
  assert.deepEqual(parrafos("«Soy jefa de operaciones; el correo va a mis 12 supervisores.» La IA no conoce tu equipo: sin esto escribe para cualquiera."), [
    "«Soy jefa de operaciones; el correo va a mis 12 supervisores.»",
    "La IA no conoce tu equipo: sin esto escribe para cualquiera.",
  ]);
  assert.deepEqual(parrafos("«Directo y cercano, máximo 120 palabras». Si tienes un correo anterior, pégalo."), ["«Directo y cercano, máximo 120 palabras».", "Si tienes un correo anterior, pégalo."]);
  assert.deepEqual(parrafos("Uno.\nDos."), ["Uno.", "Dos."]);
  // Una lista de citas o una cita que sigue la frase no se parten.
  assert.deepEqual(parrafos("«Más corto», «más cercano» o «agrega la fecha» en vez de empezar de cero."), ["«Más corto», «más cercano» o «agrega la fecha» en vez de empezar de cero."]);
  assert.deepEqual(parrafos("«Hola» dice la IA cuando la abres."), ["«Hola» dice la IA cuando la abres."]);
  assert.deepEqual(parrafos("Pega un correo tuyo y pide «escríbelo con este estilo»."), ["Pega un correo tuyo y pide «escríbelo con este estilo»."]);
});
check("Step: el body con cita inicial o \\n sale en párrafos separados (post y reel); sin ellos, un solo <p>", () => {
  const body = "«Soy jefa de operaciones; el correo va a mis 12 supervisores.» La IA no conoce tu equipo: sin esto escribe para cualquiera.";
  for (const format of ["post", "reel"] as const) {
    const h = renderToStaticMarkup(createElement(Step, { step: "1", heading: "Quién eres y quién lo lee", body, format }));
    assert.match(h, /data-parrafos="2"[^>]*gap:\d+px/, format);
    assert.match(h, /<p style="margin:0">«Soy jefa de operaciones; el correo va a mis 12 supervisores\.»<\/p><p style="margin:0">La IA no conoce/, format);
    const n = renderToStaticMarkup(createElement(Step, { heading: "H", body: "Primera línea.\nSegunda línea.", format }));
    assert.match(n, /<p style="margin:0">Primera línea\.<\/p><p style="margin:0">Segunda línea\.<\/p>/, format);
  }
  const uno = renderToStaticMarkup(createElement(Step, { heading: "H", body: "Un cuerpo sin cita." }));
  assert.doesNotMatch(uno, /data-parrafos/);
  assert.match(uno, /<p style="[^"]*">Un cuerpo sin cita\.<\/p>/);
});
check("Stat y Prompt: context y note con cita inicial salen en párrafos", () => {
  const st = renderToStaticMarkup(createElement(Stat, { value: "47%", label: "x", context: "«Lo dijo un estudio.» Y es lo que importa." }));
  assert.match(st, /data-parrafos="2"/);
  const pr = renderToStaticMarkup(createElement(Prompt, { heading: "H", prompt: "p", note: "«Cópialo tal cual.» Después ajústalo." }));
  assert.match(pr, /data-parrafos="2"/);
});
check("Screen: respuesta y prompt respetan los \\n (pre-wrap) en post y reel", () => {
  for (const format of ["post", "reel"] as const) {
    const h = renderToStaticMarkup(createElement(Screen, { app: "Claude", prompt: "Uno\nDos", respuesta: "Asunto: Rotación de turnos\n\nHola, equipo:\nDesde el lunes.\n\nGracias,\nPaula", format }));
    assert.match(h, /data-anim="words" style="[^"]*white-space:pre-wrap[^"]*">Asunto: Rotación de turnos\n\nHola, equipo:\nDesde el lunes\.\n\nGracias,\nPaula/, format);
    assert.match(h, /data-anim="type" style="[^"]*white-space:pre-wrap[^"]*">Uno\nDos/, format);
  }
});
check("parrafosHeight: dos párrafos ocupan más que el mismo texto corrido (el estimador cuenta la separación)", () => {
  const t = "«Soy jefa de operaciones; el correo va a mis 12 supervisores.» La IA no conoce tu equipo: sin esto escribe para cualquiera.";
  assert.ok(parrafosHeight(t, 40, 800, 1.4) > parrafosHeight(t.replace(/[«»]/g, ""), 40, 800, 1.4));
});

check("plantillas: formato post sin capa bg ni strike", () => {
  const hook = renderToStaticMarkup(createElement(Hook, { title: "T", background: { color: "#000" } }));
  const myth = renderToStaticMarkup(createElement(MythReality, { myth: "M", reality: "R" }));
  assert.doesNotMatch(hook, /data-anim="bg"/);
  assert.doesNotMatch(myth, /data-anim="strike"/);
  assert.match(myth, /text-decoration-line:line-through/, "en post, tachado rosa estático");
});

// --- StoryCover y logo tardío ---
check("StoryCover: rótulo \"Nuevo en el feed\", wordmark y titular con palabra clave", () => {
  const h = renderToStaticMarkup(createElement(StoryCover, { title: "3 IAs gratis", highlight: "gratis", format: "reel" }));
  assert.match(h, /Nuevo en el feed ↑/);
  assert.doesNotMatch(h, /data-brand="logo"/, "el wordmark ya no se pinta");
  assert.match(h, /<h1[^>]*>.*data-anim="pop"[^>]*>gratis<\/span>/);
  assert.match(h, /width:1080px;height:1920px/, "lienzo 9:16");
  const otro = renderToStaticMarkup(createElement(StoryCover, { title: "Hola", rotulo: "Ya en el feed", format: "reel" }));
  assert.match(otro, /Ya en el feed/);
  assert.doesNotMatch(otro, /Nuevo en el feed/);
});

check("Frame: logoEnCuadro0 y showLogo se aceptan sin efecto (ya no hay wordmark)", () => {
  for (const format of ["post", "reel"] as const) {
    const props = { title: "La IA cambió todo", highlight: "cambió", format };
    const def = renderToStaticMarkup(createElement(Hook, props));
    for (const extra of [{ logoEnCuadro0: true }, { logoEnCuadro0: false }, { showLogo: false }]) {
      assert.equal(renderToStaticMarkup(createElement(Hook, { ...props, ...extra })), def, `${format}: ${JSON.stringify(extra)} no cambia el markup`);
    }
    assert.doesNotMatch(def, /data-anim="late"|data-brand="logo"/);
  }
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
