import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../_check.ts";
import {
  CATALOGO,
  aUtc,
  EJEMPLO,
  PLANTILLAS,
  contarFondosIA,
  reglasDeTexto,
  segundosEscena,
  validarBorrador,
  validarCaption,
  validarConfig,
  validarPieza,
  validarPlan,
  validarSemana,
} from "../../kb-plantilla/_calendario/validar.mjs";
import { sceneSeconds } from "../../src/reel/timing.ts";
import { zonedToUtc } from "../../src/calendario/time.ts";
import { parsePlan } from "../../src/calendario/plan.ts";
import { TEMPLATE_CATALOG } from "../../src/remix/templates-catalog.ts";

/**
 * Tests del validador del planificador (`kb-plantilla/_calendario/validar.mjs`).
 * Cada caso parte de una pieza y un borrador válidos y rompe una sola cosa.
 */

const DIR = "kb-plantilla/_calendario";
const CONFIG_BASE = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
/** Config con una pista registrada (la instalada trae `audios: []`). */
const config = { ...CONFIG_BASE, audios: ["lima-01.mp3"] };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const has = (errs: string[], re: RegExp) => errs.some((e) => re.test(e));
const assertHas = (errs: string[], re: RegExp) => assert.ok(has(errs, re), `se esperaba un error ${re}; hubo: ${JSON.stringify(errs)}`);
const assertNone = (errs: string[]) => assert.deepEqual(errs, []);

function pieza(over: Record<string, unknown> = {}): any {
  return {
    id: "lun-reel-resumir-pdfs",
    dia: "2026-10-12",
    hora: "14:00",
    formato: "reel",
    arquetipo: "tutorial",
    senal: "guardados",
    tema: "[[Automatización con IA]]",
    pilar: "herramienta",
    hook: { categoria: "curiosidad", texto: "Convierte tus PDFs en un podcast", score: 9 },
    emocion: "alivio",
    entregable: "prompt copiable para resumir varios PDFs en audio",
    fraseAmigo: "hay una herramienta gratis que convierte tus documentos en un podcast",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "ambos entendieron" },
    origen: { fichas: ["fuentes/2026-10-04-dm-1.md"], referencias: ["referencias/notebooklm.md"] },
    derivadoDe: null,
    caption: "Automatización para estudiar: tus PDFs convertidos en un podcast.\n\nGuárdalo para la próxima.\n\n#ia #inteligenciaartificial #herramientasia #notebooklm",
    borrador: "lun-reel-resumir-pdfs.json",
    estado: "planificado",
    ...over,
  };
}

function borrador(): any {
  return {
    name: "lun-reel-resumir-pdfs",
    angle: "de pila de PDFs a un podcast",
    pillar: "herramienta",
    pace: "ensenar",
    audio: "lima-01.mp3",
    slides: [
      { template: "Hook", props: { title: "Convierte 6 PDFs en un podcast de 10 minutos", highlight: "podcast" } },
      { template: "Step", props: { step: "1", heading: "Sube tus PDFs a NotebookLM", body: "Crea un cuaderno y arrastra los archivos." } },
      { template: "Step", props: { step: "2", heading: "Pide el resumen en audio", bullets: ["Toca resumen en audio", "Elige la versión corta"] } },
      { template: "Cta", props: { title: "Guárdalo para tu próxima lectura", highlight: "Guárdalo", source: "Fuente: notebooklm.google.com" } },
    ],
  };
}

const vb = (p = pieza(), b = borrador(), c = config) => validarBorrador(p, b, c);

// --- catálogo y config ---

check("calendario/validar: PLANTILLAS es el catálogo del remix, sin StoryCover", () => {
  assert.deepEqual([...PLANTILLAS].sort(), ["Cta", "Hook", "Lead", "MythReality", "Prompt", "Stat", "Step"]);
  assert.deepEqual(CATALOGO, TEMPLATE_CATALOG);
});

check("calendario/validar: config.json instalado es válido y trae los valores de la spec", () => {
  assertNone(validarConfig(CONFIG_BASE));
  assert.equal(CONFIG_BASE.puerta.tituloMaxPalabras.valor, 12);
  assert.equal(CONFIG_BASE.puerta.logoEnCuadro0.respaldo, "base");
  assert.deepEqual(CONFIG_BASE.audios, []);
  for (const [k, v] of Object.entries(CONFIG_BASE.puerta) as [string, any][]) assert.ok(v.respaldo, `${k} sin respaldo`);
});

check("calendario/validar: config inválido da errores, no excepción", () => {
  assert.ok(validarConfig(null).length > 0);
  assert.ok(validarConfig({ ...CONFIG_BASE, mix: "x" }).length > 0);
  assert.ok(validarConfig({ ...CONFIG_BASE, audios: ["../x.mp3"] }).length > 0);
});

// --- borrador ---

check("calendario/validar: borrador válido → []", () => assertNone(vb()));

check("calendario/validar: 11 slides → error que menciona 10", () => {
  const b = borrador();
  b.slides = [b.slides[0], ...Array.from({ length: 9 }, () => clone(b.slides[1])), b.slides[3]];
  assertHas(vb(pieza({ formato: "carrusel", arquetipo: "lista", dia: "2026-10-13" }), b), /10/);
});

check("calendario/validar: plantilla Quote → error con el nombre", () => {
  const b = borrador();
  b.slides[1] = { template: "Quote", props: { quote: "hola" } };
  assertHas(vb(pieza(), b), /Quote/);
  b.slides[1] = { template: "StoryCover", props: { title: "x" } };
  assertHas(vb(pieza(), b), /StoryCover/);
});

check("calendario/validar: Hook sin highlight o con highlight fuera del título → error", () => {
  const b = borrador();
  delete b.slides[0].props.highlight;
  assertHas(vb(pieza(), b), /highlight/);
  const c = borrador();
  c.slides[0].props.highlight = "audiolibro";
  assertHas(vb(pieza(), c), /highlight/);
  const d = borrador();
  d.slides[0].props.highlight = "Podcast"; // mayúsculas: el motor busca sin distinguir mayúsculas
  assertNone(vb(pieza(), d));
});

for (const campo of ["senal", "emocion", "entregable", "fraseAmigo"]) {
  check(`calendario/validar: pieza sin ${campo} → error`, () => {
    const p = pieza();
    delete p[campo];
    const errs = vb(p);
    assertHas(errs, new RegExp(campo));
    assert.equal(errs.filter((e) => e.includes(campo)).length, 1, JSON.stringify(errs));
  });
}

check("calendario/validar: lectorFrio.resultado distinto de exactamente \"ok\" → error", () => {
  for (const r of ["OK", "ok ", "no", "", undefined]) {
    assertHas(vb(pieza({ lectorFrio: { intentos: 1, resultado: r, notas: "" } })), /lectorFrio/);
  }
  assertHas(vb(pieza({ lectorFrio: undefined })), /lectorFrio/);
});

check("calendario/validar: caption — primera línea sin palabra del tema → error", () => {
  const cap = "Tus PDFs en un podcast.\n\nAutomatización fácil.\n\n#ia #inteligenciaartificial #herramientasia";
  assertHas(validarCaption(cap, config, "[[Automatización con IA]]"), /primera línea/);
  assertNone(validarCaption("AUTOMATIZACION sin tildes también vale\n\n#ia #inteligenciaartificial #herramientasia", config, "[[Automatización con IA]]"));
  assertHas(vb(pieza({ caption: cap })), /primera línea/);
});

check("calendario/validar: caption — 2 o 6 hashtags, contados en todo el caption → error", () => {
  const t = "[[Automatización con IA]]";
  assertHas(validarCaption("Automatización hoy\n\n#ia #inteligenciaartificial", config, t), /hashtags/);
  assertHas(validarCaption("Automatización #a1 #a2\n\n#ia #inteligenciaartificial #herramientasia #b", config, t), /hashtags/);
  assertNone(validarCaption("Automatización hoy\n\n#ia #inteligenciaartificial #herramientasia #a #b", config, t));
});

check("calendario/validar: caption — hashtags pegados, en mayúsculas o con tilde → error", () => {
  const t = "[[Automatización con IA]]";
  assertHas(validarCaption("Automatización\n#ia#claude #inteligenciaartificial #herramientasia", config, t), /hashtag/);
  assertHas(validarCaption("Automatización\n#ia #inteligenciaartificial #herramientasia #ClaudeCode", config, t), /hashtag/);
  assertHas(validarCaption("Automatización\n#ia #inteligenciaartificial #herramientasia #automatización", config, t), /hashtag/);
  assertHas(validarCaption("Automatización\n#ia #inteligenciaartificial #ia #herramientasia", config, t), /repetido/);
  assertHas(validarCaption("Automatización\n#claude #inteligenciaartificial #herramientasia", config, t), /#ia/);
});

check("calendario/validar: caption — \"primer comentario\" → error", () => {
  assertHas(
    validarCaption("Automatización hoy\nLink en el Primer Comentario\n#ia #inteligenciaartificial #herramientasia", config, "[[Automatización con IA]]"),
    /primer comentario/,
  );
});

check("calendario/validar: caption no string → error, sin excepción", () => {
  assert.ok(validarCaption(42 as any, config, "x").length > 0);
  assert.ok(validarCaption(undefined as any, config).length > 0);
});

check("calendario/validar: fondo ai en un Step → error; en Hook ok; brandStyle false → error", () => {
  const b = borrador();
  b.slides[1].background = { ai: "documentos flotando" };
  assertHas(vb(pieza(), b), /ai/);
  const c = borrador();
  c.slides[0].background = { ai: "documentos flotando" };
  assertNone(vb(pieza(), c));
  for (const brandStyle of [false, "false"]) {
    const d = borrador();
    d.slides[0].background = { ai: "documentos flotando", brandStyle };
    assertHas(vb(pieza(), d), /brandStyle/);
  }
});

check("calendario/validar: contarFondosIA cuenta fondos ai de todos los borradores", () => {
  const a = borrador();
  a.slides[0].background = { ai: "x" };
  a.slides[3].background = { ai: "y" };
  const b = borrador();
  b.slides[0].background = { ai: "z" };
  assert.equal(contarFondosIA([a, b, borrador()]), 3);
  assert.equal(contarFondosIA([null, { slides: [null, { background: { ai: "" } }] }] as any), 0);
});

check("calendario/validar: fraseAmigo con API, modelo o token → error", () => {
  for (const f of ["usa la API de una IA", "un modelo nuevo resume todo", "gasta menos tokens al resumir"]) {
    assertHas(vb(pieza({ fraseAmigo: f })), /fraseAmigo/);
  }
});

check("calendario/validar: título del Hook con 13 palabras → error citando tituloMaxPalabras", () => {
  const b = borrador();
  b.slides[0].props.title = "uno dos tres cuatro cinco seis siete ocho nueve diez once doce podcast";
  assertHas(reglasDeTexto(b, config), /tituloMaxPalabras/);
});

check("calendario/validar: bullet con 13 palabras y body con 31 → error", () => {
  const b = borrador();
  b.slides[2].props.bullets = ["uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece"];
  assertHas(reglasDeTexto(b, config), /bulletMaxPalabras/);
  const c = borrador();
  c.slides[1].props.body = Array.from({ length: 31 }, (_, i) => `p${i}`).join(" ");
  assertHas(reglasDeTexto(c, config), /cuerpoMaxPalabras/);
});

check("calendario/validar: siglas — LLM no permitida, GPT sí, I.A. con puntos no", () => {
  const b = borrador();
  b.slides[1].props.body = "Usa un LLM para esto.";
  assertHas(reglasDeTexto(b, config), /LLM/);
  const c = borrador();
  c.slides[1].props.body = "Pídeselo a GPT y listo.";
  assertNone(reglasDeTexto(c, config));
  const d = borrador();
  d.slides[1].props.body = "Pídeselo a la I.A. y listo.";
  assertHas(reglasDeTexto(d, config), /sigla/);
  const e = borrador();
  e.slides[3].props.reason = "Comenta RESUMEN y te lo mando por DM.";
  assertNone(reglasDeTexto(e, config)); // la palabra clave del CTA va en mayúsculas
});

check("calendario/validar: relleno (increíble) en cualquier texto → error", () => {
  const b = borrador();
  b.slides[2].props.bullets = ["Un truco increíble"];
  assertHas(reglasDeTexto(b, config), /relleno/);
  const c = borrador();
  c.slides[1].props.body = "La verdad es que funciona.";
  assertHas(reglasDeTexto(c, config), /relleno/);
  assertHas(validarCaption("Automatización brutal\n#ia #inteligenciaartificial #herramientasia", config, "Automatización"), /relleno/);
  const d = borrador();
  d.slides[1].props.body = "Muy fácil.";
  assertHas(reglasDeTexto(d, config), /relleno/);
  const e = borrador();
  e.slides[1].props.body = "Muyfacil no es relleno: es una sola palabra.";
  assertNone(reglasDeTexto(e, config));
});

check("calendario/validar: 2 términos técnicos en la pieza → error; 1 ok", () => {
  const b = borrador();
  b.slides[1].props.body = "Un agente lee tus archivos.";
  assertNone(reglasDeTexto(b, config));
  b.slides[2].props.bullets = ["Conéctalo por API"];
  assertHas(reglasDeTexto(b, config), /términos técnicos/);
});

check("calendario/validar: emoji en el título → error", () => {
  const b = borrador();
  b.slides[0].props.title = "Convierte 6 PDFs en un podcast 🔥";
  assertHas(reglasDeTexto(b, config), /emoji/);
});

check("calendario/validar: reel — escena con más texto del que da el motor → error", () => {
  const b = borrador();
  // Hook: tope de 5 s; 13 palabras / 2,5 = 5,2 s.
  b.slides[0].props.title = "Convierte 6 PDFs en un podcast";
  b.slides[0].props.subtitle = "uno dos tres cuatro cinco seis siete";
  assertHas(reglasDeTexto(b, config, "reel"), /segundos/);
  // En carrusel no aplica el tiempo de lectura.
  assert.ok(!has(reglasDeTexto(b, config, "carrusel"), /segundos/));
});

check("calendario/validar: segundosEscena coincide con sceneSeconds del motor (20 escenas)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const palabra = () => "abcdefghij".slice(0, 1 + Math.floor(rnd() * 9));
  const frase = (n: number) => Array.from({ length: n }, palabra).join(" ");
  for (let i = 0; i < 20; i++) {
    const props: Record<string, unknown> = { title: frase(1 + Math.floor(rnd() * 14)) };
    if (rnd() < 0.5) props.body = frase(Math.floor(rnd() * 30));
    if (rnd() < 0.5) props.bullets = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => frase(4));
    if (rnd() < 0.3) props.prompt = frase(20);
    const hold = rnd() < 0.4;
    const hook = rnd() < 0.3;
    const pace = rnd() < 0.5 ? "ensenar" : "rapido";
    assert.equal(segundosEscena(props, hold, pace, hook), sceneSeconds(props, hold, pace, hook), JSON.stringify({ props, hold, hook, pace }));
  }
});

check("calendario/validar: carrusel con pace o audio → no es error; reel sin audio → error", () => {
  const p = pieza({ formato: "carrusel", arquetipo: "lista", dia: "2026-10-13" });
  const b = borrador();
  b.audio = "otra-pista.mp3";
  assertNone(vb(p, b));
  const c = borrador();
  delete c.audio;
  assertNone(vb(p, c));
  assertHas(vb(pieza(), c), /audio/);
});

check("calendario/validar: audio de reel fuera de config.audios → error que nombra config.audios", () => {
  const b = borrador();
  b.audio = "otra.mp3";
  assertHas(vb(pieza(), b), /config\.audios/);
  const c = borrador();
  c.audio = "../../secreto.mp3";
  assertHas(vb(pieza(), c), /audio/);
  assertHas(vb(pieza(), b, CONFIG_BASE), /config\.audios/);
});

check("calendario/validar: pace inválido → error", () => {
  const b = borrador();
  b.pace = "lento";
  assertHas(vb(pieza(), b), /pace/);
});

// --- adversarial: entradas raras dan error, nunca excepción ---

check("calendario/validar: entradas hostiles → errores, nunca excepción", () => {
  const casos: [string, () => string[]][] = [
    ["bullets como string", () => { const b = borrador(); b.slides[2].props.bullets = "a, b"; return vb(pieza(), b); }],
    ["slide null", () => { const b = borrador(); b.slides.splice(1, 0, null); return vb(pieza(), b); }],
    ["prop numérica donde va texto", () => { const b = borrador(); b.slides[1].props.heading = 42; return vb(pieza(), b); }],
    ["slides no es arreglo", () => { const b = borrador(); b.slides = "x"; return vb(pieza(), b); }],
    ["borrador null", () => vb(pieza(), null)],
    ["pieza null", () => vb(null, borrador())],
    ["props null", () => { const b = borrador(); b.slides[1].props = null; return vb(pieza(), b); }],
    ["id con mayúsculas", () => vb(pieza({ id: "Lun-Reel" }))],
    ["id con espacios", () => vb(pieza({ id: "lun reel" }))],
    ["id con ../", () => vb(pieza({ id: "../etc" }))],
    ["borrador ../../etc/passwd", () => vb(pieza({ borrador: "../../etc/passwd" }))],
    ["borrador que no es <id>.json", () => vb(pieza({ borrador: "otro.json" }))],
    ["prop desconocida", () => { const b = borrador(); b.slides[1].props.quote = "x"; return vb(pieza(), b); }],
    ["prop de estilo (color)", () => { const b = borrador(); b.slides[1].props.color = "#fff"; return vb(pieza(), b); }],
    ["fondo gradient", () => { const b = borrador(); b.slides[0].background = { gradient: "red" }; return vb(pieza(), b); }],
    ["fondo ai vacío", () => { const b = borrador(); b.slides[0].background = { ai: "" }; return vb(pieza(), b); }],
    ["hook no es la primera slide", () => { const b = borrador(); b.slides.reverse(); return vb(pieza(), b); }],
    ["hook score bajo el umbral", () => vb(pieza({ hook: { categoria: "x", texto: "y", score: 7 } }))],
    ["senal fuera de la lista", () => vb(pieza({ senal: "likes" }))],
    ["pilar distinto en el borrador", () => { const b = borrador(); b.pillar = "noticia"; return vb(pieza(), b); }],
    ["sin source", () => { const b = borrador(); delete b.slides[3].props.source; return vb(pieza(), b); }],
    ["name distinto del id", () => { const b = borrador(); b.name = "otro"; return vb(pieza(), b); }],
    ["highlight con tilde distinta (el motor no lo pintaría)", () => { const b = borrador(); b.slides[3].props.highlight = "Guardalo"; return vb(pieza(), b); }],
    ["highlight vacío", () => { const b = borrador(); b.slides[0].props.highlight = " "; return vb(pieza(), b); }],
    ["logoEnCuadro0 string", () => { const b = borrador(); b.logoEnCuadro0 = "false"; return vb(pieza(), b); }],
    ["__proto__ en props", () => { const b = JSON.parse(JSON.stringify(borrador()).replace('"step":"1"', '"__proto__":{"x":1},"step":"1"')); return vb(pieza(), b); }],
  ];
  for (const [nombre, fn] of casos) {
    let errs: string[] = [];
    assert.doesNotThrow(() => (errs = fn()), nombre);
    assert.ok(Array.isArray(errs) && errs.length > 0, `${nombre}: se esperaba error`);
  }
  assert.doesNotThrow(() => reglasDeTexto(undefined as any, config));
  assert.doesNotThrow(() => validarPlan(undefined as any, config));
  assert.ok(validarPlan("x" as any, config).length > 0);
});

// --- plan ---

function plan(over: Record<string, unknown> = {}): any {
  const piezas = [
    { id: "lun-reel-a", dia: "2026-10-12", hora: "14:00", formato: "reel", arquetipo: "tutorial", tema: "[[Automatización con IA]]" },
    { id: "mar-carrusel-b", dia: "2026-10-13", hora: "14:00", formato: "carrusel", arquetipo: "lista", tema: "[[Automatización de tareas]]" },
    { id: "mie-reel-c", dia: "2026-10-14", hora: "19:30", formato: "reel", arquetipo: "compartible", tema: "[[Automatización del hogar]]" },
  ].map((x) => pieza({ ...x, borrador: `${x.id}.json` }));
  return {
    semana: "2026-10-12",
    zona: "America/Santiago",
    experimento: { variable: "hora", hipotesis: "19:30 rinde más que 14:00 en reels", piezas: ["mie-reel-c"] },
    piezas,
    ...over,
  };
}

check("calendario/validar: plan válido → []", () => assertNone(validarPlan(plan(), config)));

check("calendario/validar: plan — dos piezas a menos de 20 h → error", () => {
  const p = plan();
  p.piezas[1].hora = "08:30"; // lun 14:00 → mar 08:30 = 18,5 h
  assertHas(validarPlan(p, config), /20/);
});

check("calendario/validar: plan — hora fuera de 08:00–23:00 o sin :00/:30 → error", () => {
  for (const h of ["07:30", "23:30", "14:15", "7:30", 1400]) {
    const p = plan();
    p.piezas[0].hora = h;
    assertHas(validarPlan(p, config), /hora/);
  }
});

check("calendario/validar: plan — día fuera de la semana o domingo → error", () => {
  const p = plan();
  p.piezas[0].dia = "2026-10-19";
  assertHas(validarPlan(p, config), /semana/);
  const q = plan();
  q.piezas[0].dia = "2026-10-18";
  assertHas(validarPlan(q, config), /domingo/);
  const r = plan();
  r.piezas[0].dia = "2026-02-30";
  assertHas(validarPlan(r, config), /dia/);
});

check("calendario/validar: plan — semana que no es lunes → error", () => {
  assertHas(validarPlan(plan({ semana: "2026-10-13" }), config), /lunes/);
});

check("calendario/validar: plan — formato o arquetipo que no sigue el mix → error (salvo experimento de arquetipo)", () => {
  const p = plan();
  p.piezas[0].formato = "carrusel";
  assertHas(validarPlan(p, config), /formato/);
  const q = plan();
  q.piezas[2].arquetipo = "demo";
  assertHas(validarPlan(q, config), /arquetipo/);
  q.experimento = { variable: "arquetipo", hipotesis: "demo rinde más el miércoles", piezas: ["mie-reel-c"] };
  assertNone(validarPlan(q, config));
});

check("calendario/validar: plan — experimento con id inexistente o variable no permitida → error", () => {
  const p = plan();
  p.experimento.piezas = ["no-existe"];
  assertHas(validarPlan(p, config), /no-existe/);
  const q = plan();
  q.experimento.variable = "color";
  assertHas(validarPlan(q, config), /variable/);
  assertNone(validarPlan(plan({ experimento: { variable: "tituloMaxPalabras", hipotesis: "8 palabras retienen más", piezas: ["lun-reel-a"] } }), config));
});

check("calendario/validar: plan — piezas: [] sin motivo → error; con motivo ok", () => {
  assertHas(validarPlan(plan({ piezas: [], experimento: null }), config), /motivo/);
  assertNone(validarPlan(plan({ piezas: [], experimento: null, motivo: "ninguna pieza pasó el lector frío" }), config));
});

check("calendario/validar: plan — ids repetidos y dos piezas del mismo tema → error", () => {
  const p = plan();
  p.piezas[1].id = "lun-reel-a";
  assertHas(validarPlan(p, config), /repetido/);
  const q = plan();
  q.piezas[1].tema = "automatizacion con ia"; // mismo tema sin [[ ]] ni tildes
  assertHas(validarPlan(q, config), /tema/);
  q.piezas[1].derivadoDe = "lun-reel-a";
  assert.ok(!has(validarPlan(q, config), /tema/));
});

// --- semana completa (archivos) ---

function semanaTemporal(): { root: string; dir: string; p: any } {
  const root = mkdtempSync(join(tmpdir(), "kb-calendario-"));
  const dir = join(root, "_calendario", "2026-10-12");
  mkdirSync(dir, { recursive: true });
  const p = plan();
  for (const x of p.piezas) {
    const b = borrador();
    b.name = x.id;
    writeFileSync(join(dir, x.borrador), JSON.stringify(b, null, 2));
  }
  writeFileSync(join(dir, "plan.json"), JSON.stringify(p, null, 2));
  return { root, dir, p };
}

check("calendario/validar: validarSemana — válida; score 70 → error \"score 70 < 75\"", () => {
  const { root, dir } = semanaTemporal();
  try {
    assertNone(validarSemana(dir, config, { score: () => 80 }));
    assertHas(validarSemana(dir, config, { score: () => 70 }), /score 70 < 75/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: validarSemana — sin score lo omite con aviso, no error", () => {
  const { root, dir } = semanaTemporal();
  try {
    const avisos: string[] = [];
    assertNone(validarSemana(dir, config, { avisos }));
    assert.ok(avisos.some((a) => /score/.test(a)), JSON.stringify(avisos));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: validarSemana — 4 fondos ai en la semana → error de semana", () => {
  const { root, dir, p } = semanaTemporal();
  try {
    const a = JSON.parse(readFileSync(join(dir, p.piezas[0].borrador), "utf8"));
    a.slides[0].background = { ai: "x" };
    a.slides[3].background = { ai: "y" };
    writeFileSync(join(dir, p.piezas[0].borrador), JSON.stringify(a));
    const b = JSON.parse(readFileSync(join(dir, p.piezas[1].borrador), "utf8"));
    b.slides[0].background = { ai: "z" };
    b.slides[3].background = { ai: "w" };
    writeFileSync(join(dir, p.piezas[1].borrador), JSON.stringify(b));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /fondos ai/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: validarSemana — archivos rotos dan error, nunca excepción", () => {
  const { root, dir, p } = semanaTemporal();
  try {
    writeFileSync(join(dir, p.piezas[0].borrador), "﻿" + readFileSync(join(dir, p.piezas[0].borrador), "utf8"));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /BOM/);
    rmSync(join(dir, p.piezas[1].borrador));
    assertHas(validarSemana(dir, config, { score: () => 90 }), new RegExp(p.piezas[1].id));
    writeFileSync(join(dir, "plan.json"), "﻿" + readFileSync(join(dir, "plan.json"), "utf8"));
    assertHas(validarSemana(dir, config), /BOM/);
    writeFileSync(join(dir, "plan.json"), "{ no es json");
    assertHas(validarSemana(dir, config), /plan\.json/);
    assert.ok(validarSemana(join(root, "no-existe"), config).length > 0);
    assert.doesNotThrow(() => validarSemana(dir, config, { score: () => { throw new Error("boom"); } }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: validarSemana — carpeta distinta de plan.semana → error", () => {
  const { root, dir } = semanaTemporal();
  try {
    const p = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
    p.semana = "2026-10-19";
    writeFileSync(join(dir, "plan.json"), JSON.stringify(p));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /carpeta/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- ejemplo, CLI y manual ---

check("calendario/validar: el ejemplo embebido pasa (con su pista agregada a config.audios)", () => {
  const c = { ...CONFIG_BASE, audios: [EJEMPLO.borrador.audio] };
  assertNone(validarPlan(EJEMPLO.plan, c));
  assertNone(validarBorrador(EJEMPLO.plan.piezas[0], EJEMPLO.borrador, c));
});

check("calendario/validar: INSTRUCCIONES.md trae el ejemplo idéntico al embebido y el catálogo completo", () => {
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  const bloque = (marca: string) => {
    const m = md.match(new RegExp(`<!-- ${marca} -->\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``));
    assert.ok(m, `falta el bloque ${marca}`);
    return JSON.parse(m[1]);
  };
  assert.deepEqual(bloque("ejemplo:pieza"), EJEMPLO.plan.piezas[0]);
  assert.deepEqual(bloque("ejemplo:borrador"), EJEMPLO.borrador);
  for (const [t, { required, optional }] of Object.entries(TEMPLATE_CATALOG)) {
    assert.ok(md.includes(`| \`${t}\``), `falta ${t} en el catálogo`);
    for (const k of [...required, ...optional]) assert.ok(md.includes(`\`${k}\``), `falta la prop ${k} de ${t}`);
  }
  assert.ok(!/TODO/.test(md));
});

check("calendario/validar: lector-frio.md trae perfil, 6 preguntas, formato JSON y prohibiciones", () => {
  const md = readFileSync(join(DIR, "lector-frio.md"), "utf8");
  assert.ok(md.includes("Hispanohablante de 25 a 45 años, curioso de la IA, **no técnico**, viendo esto en el celular, distraído, con el pulgar listo para pasar."));
  assert.ok(/con prisa/.test(md));
  for (const q of ["¿De qué trata, en una frase?", "¿Qué te llevas o qué puedes hacer después de verlo?", "¿Qué palabra o frase no entendiste o te hizo dudar?", "¿Qué sentiste al ver la primera slide?", "¿Qué harías al terminar?", "¿Algo te confundió, se contradijo o prometió algo que no llegó?"]) {
    assert.ok(md.includes(q), `falta: ${q}`);
  }
  assert.ok(md.includes('"6"'));
  assert.ok(!/TODO/.test(md));
});

check("calendario/validar (CLI): --self-test, semana válida → 0, semana inválida → 1 con <id>: motivo", () => {
  const root = mkdtempSync(join(tmpdir(), "kb-calendario-cli-"));
  try {
    const cal = join(root, "_calendario");
    mkdirSync(join(cal, "2026-10-12"), { recursive: true });
    copyFileSync(join(DIR, "validar.mjs"), join(cal, "validar.mjs"));
    writeFileSync(join(cal, "config.json"), JSON.stringify(config));
    const env = { ...process.env, CARRUSEL_DIR: join(root, "nada") };
    execFileSync("node", [join(cal, "validar.mjs"), "--self-test"], { stdio: "pipe", env });
    const p = plan();
    for (const x of p.piezas) {
      const b = borrador();
      b.name = x.id;
      writeFileSync(join(cal, "2026-10-12", x.borrador), JSON.stringify(b));
    }
    writeFileSync(join(cal, "2026-10-12", "plan.json"), JSON.stringify(p));
    const ok = execFileSync("node", [join(cal, "validar.mjs"), "2026-10-12"], { encoding: "utf8", stdio: "pipe", env });
    assert.match(ok, /✓/);
    p.piezas[0].lectorFrio.resultado = "OK";
    writeFileSync(join(cal, "2026-10-12", "plan.json"), JSON.stringify(p));
    try {
      execFileSync("node", [join(cal, "validar.mjs"), "2026-10-12"], { stdio: "pipe", env });
      assert.fail("debió salir con 1");
    } catch (e: any) {
      assert.equal(e.status, 1);
      assert.match(String(e.stderr), /lun-reel-a: .*lectorFrio/);
    }
    for (const arg of ["../..", "x", ""]) {
      try {
        execFileSync("node", [join(cal, "validar.mjs"), arg], { stdio: "pipe", env });
        assert.fail(`debió fallar con ${arg}`);
      } catch (e: any) {
        assert.equal(e.status, 1);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- fix ronda 1 ---

check("calendario/validar: presupuesto de lectura del manual — 12 palabras pasan en cualquier escena; de más fallan", () => {
  const segundos = (b: any) => reglasDeTexto(b, config, "reel").filter((e) => /segundos/.test(e));
  const doce = borrador();
  doce.slides[0].props = { title: "Convierte tus PDFs en un podcast", highlight: "podcast", subtitle: "sin leer una sola página" }; // 6 + 5 = 11
  doce.slides[1].props = { step: "1", heading: "Pide el resumen en audio", body: "Elige la versión corta y escúchala caminando." }; // 5 + 7 = 12
  doce.slides[2].props = { step: "2", heading: "Copia el prompt de abajo", bullets: ["Pégalo antes de generar", "Pide tres ideas clave"] }; // 5 + 8 = 13 (bullets: 1,8 s c/u)
  doce.slides[3].props = { title: "Guárdalo para tu próxima pila de lectura", highlight: "Guárdalo", reason: "Lo vas a usar esta semana.", source: "x" }; // 7 + 6 = 13
  assertNone(segundos(doce));
  const hook = borrador();
  hook.slides[0].props.subtitle = "sin leer una sola página del montón"; // 9 + 7 = 16 > 12 (tope 5 s)
  assert.ok(segundos(hook).some((e) => e.startsWith("slide 1")), JSON.stringify(segundos(hook)));
  const medio = borrador();
  medio.slides[1].props.body = "Crea un cuaderno nuevo, arrastra los archivos que tengas pendientes y espera a que termine de leerlos."; // 5 + 17 = 22 > 20 (tope 8 s)
  assert.ok(segundos(medio).some((e) => e.startsWith("slide 2")), JSON.stringify(segundos(medio)));
});

check("calendario/validar: segundosEscena coincide con sceneSeconds usando todas las props de texto", () => {
  const claves = ["title", "subtitle", "eyebrow", "heading", "body", "text", "kicker", "quote", "reality", "myth", "reason", "note", "value", "label", "context", "prompt", "highlight", "source"];
  claves.forEach((k, i) => {
    const props: Record<string, unknown> = { [k]: "palabra ".repeat(5 + i * 3).trim() };
    for (const hold of [false, true]) {
      for (const pace of ["ensenar", "rapido"] as const) assert.equal(segundosEscena(props, hold, pace, false), sceneSeconds(props, hold, pace, false), k);
    }
  });
});

check("calendario/validar: aUtc coincide con zonedToUtc en ambos cambios de hora (2026 y 2027)", () => {
  for (const dia of ["2026-04-04", "2026-04-05", "2026-09-05", "2026-09-06", "2027-04-03", "2027-04-04", "2027-09-04", "2027-09-05", "2026-10-12"]) {
    for (let m = 0; m < 24 * 60; m += 30) {
      const hora = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      assert.equal(aUtc(dia, hora).toISOString(), zonedToUtc(dia, hora).toISOString(), `${dia} ${hora}`);
    }
  }
});

check("calendario/validar: separación entre piezas medida en tiempo real (UTC de Chile)", () => {
  // Los cambios de hora de Chile caen la noche del sábado al domingo, así que hoy
  // no separan dos piezas consecutivas; se verifica que la cuenta usa instantes
  // reales (aUtc) y reporta horas con decimales.
  const p = plan({ semana: "2026-08-31" });
  p.piezas = [
    pieza({ id: "vie-carrusel-a", dia: "2026-09-04", hora: "23:00", formato: "carrusel", arquetipo: "opinion", borrador: "vie-carrusel-a.json" }),
    pieza({ id: "sab-reel-b", dia: "2026-09-05", hora: "18:30", formato: "reel", arquetipo: "atemporal", tema: "otro tema", borrador: "sab-reel-b.json" }),
  ];
  p.experimento = { variable: "hora", hipotesis: "x", piezas: ["sab-reel-b"] };
  assertHas(validarPlan(p, config), /sab-reel-b: está a 19\.5 h/);
});

check("calendario/validar: la palabra clave en mayúsculas solo vale tras \"Comenta\" en el Cta, y solo una", () => {
  const b = borrador();
  b.slides[1].props.body = "Comenta RESUMEN y te lo mando.";
  assertHas(reglasDeTexto(b, config), /RESUMEN/);
  const c = borrador();
  c.slides[3].props.reason = "Escribe RESUMEN y te lo mando por DM.";
  assertHas(reglasDeTexto(c, config), /RESUMEN/);
  const d = borrador();
  d.slides[3].props.reason = "Comenta RESUMEN LLM y te lo mando.";
  assertHas(reglasDeTexto(d, config), /LLM/);
});

check("calendario/validar: JSON inválido → mensaje con la línea, sin repetir el contenido", () => {
  const { root, dir } = semanaTemporal();
  try {
    writeFileSync(join(dir, "plan.json"), '{\n  "semana": "2026-10-12",\n  TOKEN_SECRETO\n}');
    const errs = validarSemana(dir, config);
    assertHas(errs, /JSON inválido \(línea 3\)/);
    assert.ok(!errs.some((e) => e.includes("TOKEN_SECRETO")), JSON.stringify(errs));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R46 + punto 14: lo que el agente copia de INSTRUCCIONES.md pasa validar.mjs Y plan.ts (bot y Mac).
check("calendario/validar (R46): paridad validar.mjs ↔ plan.ts — EJEMPLO embebido, ejemplo y esqueleto de INSTRUCCIONES.md", () => {
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  const bloque = (marca: string) => {
    const m = md.match(new RegExp(`<!-- ${marca} -->\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``));
    assert.ok(m, `falta el bloque ${marca}`);
    return JSON.parse(m[1]);
  };
  const casos: [string, any][] = [
    ["EJEMPLO embebido", EJEMPLO.plan],
    ["ejemplo de INSTRUCCIONES.md", { ...clone(EJEMPLO.plan), piezas: [bloque("ejemplo:pieza")] }],
    ["esqueleto de INSTRUCCIONES.md (pegable tal cual)", bloque("esqueleto:plan")],
  ];
  for (const [nombre, plan] of casos) {
    assert.deepEqual(validarPlan(plan, config), [], `${nombre}: validarPlan`);
    for (const p of plan.piezas) assert.deepEqual(validarPieza(p, config), [], `${nombre}: ${p.id}`);
    assert.doesNotThrow(() => parsePlan(JSON.stringify(plan)), `${nombre}: parsePlan`);
  }
  // El esqueleto es una semana completa: 6 piezas, temas distintos, experimento sobre una de ellas.
  const esqueleto = bloque("esqueleto:plan");
  assert.equal(esqueleto.piezas.length, 6);
  assert.equal(new Set(esqueleto.piezas.map((p: any) => p.tema)).size, 6);
  assert.ok(esqueleto.experimento.piezas.every((id: string) => esqueleto.piezas.some((p: any) => p.id === id)));
  assert.ok(!JSON.stringify(esqueleto).includes("..."), "sin marcadores para reemplazar");
  // Variantes que validar.mjs acepta: sin estado, sin derivadoDe, emoción en texto, latido sin experimento.
  const variante = clone(EJEMPLO.plan);
  delete variante.piezas[0].estado;
  delete variante.piezas[0].derivadoDe;
  variante.piezas[0].emocion = "curiosidad";
  assert.deepEqual(validarPlan(variante, config), []);
  assert.deepEqual(validarPieza(variante.piezas[0], config), []);
  assert.doesNotThrow(() => parsePlan(JSON.stringify(variante)));
  const latido = { semana: "2026-10-12", zona: "America/Santiago", piezas: [], motivo: "sin piezas publicables" };
  assert.deepEqual(validarPlan(latido, config), []);
  assert.doesNotThrow(() => parsePlan(JSON.stringify(latido)));
});

check("calendario/validar: INSTRUCCIONES.md — mix con los valores exactos, presupuesto de lectura, audios vacíos y esqueleto de plan.json", () => {
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  for (const m of CONFIG_BASE.mix) assert.ok(md.includes(`| \`${m.formato}\` | \`${m.arquetipo}\` |`), `mix: ${m.arquetipo}`);
  assert.ok(/12 palabras/.test(md));
  assert.ok(/`config\.audios` está vacío/.test(md));
  const m = md.match(/<!-- esqueleto:plan -->\s*```json\n([\s\S]*?)\n```/);
  assert.ok(m, "falta el esqueleto de plan.json");
  const esqueleto = JSON.parse(m[1]);
  assert.deepEqual(Object.keys(esqueleto), ["semana", "zona", "experimento", "piezas"]);
  assert.equal(esqueleto.piezas.length, 6);
});
