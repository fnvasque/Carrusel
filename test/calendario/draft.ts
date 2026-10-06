import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { parseBorrador, borradorASpec, storySpec, duracionReelMs, type Borrador } from "../../src/calendario/draft.ts";
import { Hook, Step, Cta, StoryCover } from "../../src/templates/index.ts";
import { specTiming } from "../../src/reel/timing.ts";

/**
 * Motor del calendario: borrador JSON (VariationDraft + pace/audio/logo) →
 * CarouselSpec del carrusel/reel y de la story. Puro, sin Chromium.
 */

/** Borrador de base: Hook con fondo `ai`, dos Step y Cta. */
function base(): Borrador {
  return {
    name: "Agentes de Claude Code",
    angle: "tutorial",
    pillar: "herramienta",
    pace: "rapido",
    audio: "pista-1.mp3",
    slides: [
      {
        template: "Hook",
        props: { title: "3 IAs gratis para estudiar", highlight: "gratis" },
        background: { ai: "estudiante con laptop de noche", overlay: 0.55 },
      },
      { template: "Step", props: { step: "01", heading: "Abre NotebookLM", highlight: "NotebookLM", body: "Sube tus apuntes." } },
      { template: "Step", props: { step: "02", heading: "Pide un resumen", highlight: "resumen", body: "Con preguntas de repaso." } },
      { template: "Cta", props: { title: "Guárdalo para tu prueba", highlight: "Guárdalo", reason: "Cada semana, IA útil.", handle: "ia.punto.es" } },
    ],
  };
}

check("borradorASpec conserva el fondo ai del Hook (draftToSpec lo perdía)", () => {
  const spec = borradorASpec(base());
  assert.equal(spec.slides[0].template, Hook);
  assert.deepEqual(spec.slides[0].props.background, { ai: "estudiante con laptop de noche", overlay: 0.55 });
  // Sin overlay explícito: el mismo 0.5 que usa el .ts emitido (emit.ts).
  const b = base();
  b.slides[0].background = { ai: "x" };
  assert.deepEqual(borradorASpec(b).slides[0].props.background, { ai: "x", overlay: 0.5 });
});

check("borradorASpec fuerza el estilo de marca en fondos ai (nunca brandStyle: false)", () => {
  for (const brandStyle of [false, true]) {
    const b = base() as any;
    b.slides[0].background = { ai: "x", overlay: 0.4, brandStyle };
    const bg = borradorASpec(b).slides[0].props.background;
    assert.deepEqual(bg, { ai: "x", overlay: 0.4 }, `brandStyle: ${brandStyle} → se omite y resolveBackground anexa la marca`);
    assert.notEqual((bg as { brandStyle?: boolean }).brandStyle, false);
  }
  // También si llega por parseBorrador (que no es el validador editorial).
  const b = base() as any;
  b.slides[0].background = { ai: "x", brandStyle: false };
  assert.equal("brandStyle" in borradorASpec(parseBorrador(JSON.stringify(b))).slides[0].props.background, false);
});

check("borradorASpec conserva gradiente y color", () => {
  const b = base() as any;
  b.slides[0].background = { ai: "x", overlay: 0.4 };
  b.slides[1].background = { gradient: "linear-gradient(#000,#111)" };
  b.slides[2].background = { color: "#101010" };
  const spec = borradorASpec(b);
  assert.deepEqual(spec.slides[0].props.background, { ai: "x", overlay: 0.4 });
  assert.deepEqual(spec.slides[1].props.background, { gradient: "linear-gradient(#000,#111)", overlay: 0.5 });
  assert.deepEqual(spec.slides[2].props.background, { color: "#101010" });
  assert.equal("background" in spec.slides[3].props, false, "sin fondo declarado no se inventa uno");
});

check("borradorASpec: pace, pilar por defecto, nombre seguro y formato", () => {
  const spec = borradorASpec(base());
  assert.equal(spec.pace, "rapido");
  assert.deepEqual(spec.defaults, { pillar: "herramienta" });
  assert.equal(spec.name, "agentes-de-claude-code", "el nombre es la carpeta de salida: slug sin rutas");
  const sinPace = base();
  delete sinPace.pace;
  assert.equal(borradorASpec(sinPace).pace, undefined, "sin pace manda el ritmo por defecto del motor");
  assert.deepEqual(borradorASpec(base(), { format: "reel" }).defaults, { pillar: "herramienta", format: "reel" });
  const hostil = base();
  hostil.name = "../../etc/passwd";
  assert.equal(borradorASpec(hostil).name, "etc-passwd");
});

check("borradorASpec descarta plantillas desconocidas (validateDraft) y fija index/total", () => {
  const b = base() as any;
  b.slides.splice(2, 0, { template: "Quote", props: { quote: "x" } });
  const spec = borradorASpec(b);
  assert.equal(spec.slides.length, 4);
  assert.deepEqual(spec.slides.map((s) => s.template), [Hook, Step, Step, Cta]);
  assert.equal(spec.slides[1].props.index, 2);
  assert.equal(spec.slides[1].props.total, 4);
});

check("storySpec: 1 slide StoryCover 9:16 con el título y highlight del Hook", () => {
  const story = storySpec(base());
  assert.equal(story.slides.length, 1);
  assert.equal(story.slides[0].template, StoryCover);
  assert.equal(story.slides[0].props.format, "reel");
  assert.equal(story.slides[0].props.title, "3 IAs gratis para estudiar");
  assert.equal(story.slides[0].props.highlight, "gratis");
  assert.equal("background" in story.slides[0].props, false, "la story no hereda el fondo ai del Hook (sería otra imagen IA)");
  assert.equal(story.defaults && "background" in story.defaults, false);
  assert.equal(story.name, "agentes-de-claude-code-story");
  assert.equal(story.defaults?.pillar, "herramienta");
});

check("storySpec nunca usa un fondo ai: ni del Hook ni de otro slide", () => {
  const b = base() as any;
  b.slides[0].background = { ai: "a", brandStyle: true };
  b.slides[1].background = { ai: "b" };
  b.slides[3].background = { ai: "c" };
  const story = storySpec(b);
  const all = JSON.stringify(story.slides.map((s) => s.props)) + JSON.stringify(story.defaults);
  assert.doesNotMatch(all, /"ai"/);
  // Con un fondo de color o gradiente en el Hook tampoco hereda nada: look lima por defecto.
  b.slides[0].background = { gradient: "linear-gradient(#000,#111)" };
  assert.equal("background" in storySpec(b).slides[0].props, false);
});

check("storySpec: sin Hook usa el que garantiza validateDraft", () => {
  const b = base();
  b.slides = b.slides.filter((s) => s.template !== "Hook");
  const story = storySpec(b);
  assert.equal(story.slides.length, 1);
  assert.equal(typeof story.slides[0].props.title, "string");
});

check("duracionReelMs = specTiming(spec).total × 1000, redondeado", () => {
  for (const pace of ["ensenar", "rapido"] as const) {
    const b = base();
    b.pace = pace;
    const spec = borradorASpec(b, { format: "reel" });
    const ms = duracionReelMs(spec);
    assert.equal(ms, Math.round(specTiming(spec).total * 1000));
    assert.ok(Number.isInteger(ms) && ms > 3000, `${pace}: ${ms}`);
  }
});

check("parseBorrador acepta un borrador válido (con BOM) y conserva pace/audio/logo", () => {
  const b = { ...base(), logoEnCuadro0: false };
  const parsed = parseBorrador("﻿" + JSON.stringify(b));
  assert.equal(parsed.name, b.name);
  assert.equal(parsed.pace, "rapido");
  assert.equal(parsed.audio, "pista-1.mp3");
  assert.equal(parsed.logoEnCuadro0, false);
  assert.equal(parsed.slides.length, 4);
  // Campos extra del planificador (senal, emocion, caption…) no estorban.
  const extra = parseBorrador(JSON.stringify({ ...base(), caption: "hola", senal: "guardados" }));
  assert.equal(extra.slides.length, 4);
  // angle es opcional en el JSON.
  const { angle: _a, ...sinAngle } = base();
  assert.equal(parseBorrador(JSON.stringify(sinAngle)).angle, "");
});

check("parseBorrador lanza con mensaje claro ante formas inválidas", () => {
  const bad: [string, RegExp][] = [
    ["{", /JSON/],
    ["[]", /objeto/],
    ["null", /objeto/],
    [JSON.stringify({ ...base(), name: 3 }), /name/],
    [JSON.stringify({ ...base(), name: "  " }), /name/],
    [JSON.stringify({ ...base(), pillar: "otro" }), /pillar/],
    [JSON.stringify({ ...base(), slides: "x" }), /slides/],
    [JSON.stringify({ ...base(), slides: [] }), /slides/],
    [JSON.stringify({ ...base(), slides: [null] }), /slide 1/],
    [JSON.stringify({ ...base(), slides: [{ template: "Hook" }] }), /slide 1.*props/],
    [JSON.stringify({ ...base(), slides: [{ template: 5, props: {} }] }), /slide 1.*template/],
    [JSON.stringify({ ...base(), slides: [{ template: "Hook", props: { title: { x: 1 } } }] }), /slide 1.*title/],
    [JSON.stringify({ ...base(), slides: [{ template: "Hook", props: { title: "t" }, background: "rojo" }] }), /slide 1.*background/],
    [JSON.stringify({ ...base(), slides: [{ template: "Hook", props: { title: "t" }, background: { ai: 3 } }] }), /slide 1.*background/],
    [JSON.stringify({ ...base(), slides: [{ template: "Hook", props: { title: "t" }, background: { ai: "x", brandStyle: "false" } }] }), /brandStyle/],
    [JSON.stringify({ ...base(), pace: "lento" }), /pace|ritmo/],
    [JSON.stringify({ ...base(), audio: 3 }), /audio/],
    [JSON.stringify({ ...base(), logoEnCuadro0: "no" }), /logoEnCuadro0/],
  ];
  for (const [text, re] of bad) {
    assert.throws(() => parseBorrador(text), (e: unknown) => e instanceof Error && re.test(e.message), `debía rechazar: ${text.slice(0, 120)}`);
  }
});
