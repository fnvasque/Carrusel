import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  segundosEscenas,
  duracionReel,
  erroresDeRetencion,
  DESDE_PALANCAS_RETENCION,
  textoPastilla,
  textosLector,
  validarBorrador,
  validarCaption,
  validarConfig,
  validarPieza,
  validarPlan,
  validarSemana,
  probarRegla,
  ganadorasDeBucle,
  informePrueba,
  confusoresDelExperimento,
  DESDE_CONFUSORES,
  validarCandidatos,
  motivoReferenciaNoLista,
  DESDE_CALIDAD,
  PATRONES_HOOK,
  erroresDeHookJuez,
  mensajeJuez,
} from "../../kb-plantilla/_calendario/validar.mjs";
import { sceneSeconds, sceneDurations, specTiming } from "../../src/reel/timing.ts";
import { zonedToUtc } from "../../src/calendario/time.ts";
import { parsePlan } from "../../src/calendario/plan.ts";
import { TEMPLATE_CATALOG } from "../../src/remix/templates-catalog.ts";
import { Cta, Hook, Lead, MythReality, Prompt, Stat, Step } from "../../src/templates/index.ts";
import { pillContent } from "../../src/templates/Cta.tsx";

/**
 * Tests del validador del planificador (`kb-plantilla/_calendario/validar.mjs`).
 * Cada caso parte de una pieza y un borrador válidos y rompe una sola cosa.
 */

const DIR = "kb-plantilla/_calendario";
const CONFIG_PLANTILLA = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
/**
 * La plantilla trae las palancas de retención vigentes (gancho, 20 s); los casos
 * parten de borradores en ritmo enseñar de 4 escenas, así que la fixture fija
 * ensenar y 60 s. Los casos de gancho y de tope las cambian explícitamente.
 */
const CONFIG_BASE = {
  ...CONFIG_PLANTILLA,
  puerta: { ...CONFIG_PLANTILLA.puerta, ritmoReel: { valor: "ensenar", respaldo: "base" }, duracionMaxSegundos: { valor: 60, respaldo: "supuesto" } },
};
/** Config con una pista registrada (la instalada trae `audios: []`). */
const config = { ...CONFIG_BASE, audios: ["lima-01.mp3"] };
/** Mix del sprint de 2 reels al día (2026-10-15 → 2026-10-18): varias entradas por día, con hora. Prueba el emparejamiento por entrada. */
const MIX_SPRINT = [
  { dia: 1, formato: "reel", arquetipo: "tutorial", hora: "09:00" }, { dia: 1, formato: "reel", arquetipo: "compartible", hora: "19:00" },
  { dia: 2, formato: "carrusel", arquetipo: "lista", hora: "14:00" }, { dia: 2, formato: "reel", arquetipo: "demo", hora: "09:00" }, { dia: 2, formato: "reel", arquetipo: "atemporal", hora: "19:00" },
  { dia: 3, formato: "reel", arquetipo: "compartible", hora: "09:00" }, { dia: 3, formato: "reel", arquetipo: "tutorial", hora: "19:00" },
  { dia: 4, formato: "reel", arquetipo: "demo", hora: "09:00" }, { dia: 4, formato: "reel", arquetipo: "compartible", hora: "19:00" },
  { dia: 5, formato: "carrusel", arquetipo: "opinion", hora: "14:00" }, { dia: 5, formato: "reel", arquetipo: "atemporal", hora: "09:00" }, { dia: 5, formato: "reel", arquetipo: "demo", hora: "19:00" },
  { dia: 6, formato: "reel", arquetipo: "atemporal", hora: "09:00" }, { dia: 6, formato: "reel", arquetipo: "tutorial", hora: "19:00" },
  { dia: 0, formato: "reel", arquetipo: "compartible", hora: "09:00" }, { dia: 0, formato: "reel", arquetipo: "demo", hora: "19:00" },
];
const configSprint = { ...config, mix: MIX_SPRINT, separacionMinHoras: 4 };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** `parametros` completo (R52): cada clave de config.puerta con el valor usado. */
const PARAMETROS = Object.fromEntries(Object.entries(CONFIG_BASE.puerta).map(([k, v]) => [k, (v as { valor: unknown }).valor]));
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
    parametros: clone(PARAMETROS),
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
      { template: "Cta", props: { title: "Guárdalo para tu próxima lectura", highlight: "Guárdalo", cta: "Guárdalo", source: "Fuente: notebooklm.google.com" } },
    ],
  };
}

const vb = (p = pieza(), b = borrador(), c = config) => validarBorrador(p, b, c);

// --- catálogo y config ---

check("calendario/validar: PLANTILLAS es el catálogo del remix, sin StoryCover", () => {
  assert.deepEqual([...PLANTILLAS].sort(), ["Clip", "Cta", "Hook", "Lead", "MythReality", "Prompt", "Screen", "Stat", "Step"]);
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

// --- palancas de retención (ritmoReel y duracionMaxSegundos; en la puerta desde el 2026-10-14) ---

check("calendario/validar: config.json trae ritmoReel (gancho, base) y duracionMaxSegundos (20) con respaldo", () => {
  assertNone(validarConfig(CONFIG_PLANTILLA));
  assert.equal(CONFIG_PLANTILLA.puerta.ritmoReel.valor, "gancho");
  assert.equal(CONFIG_PLANTILLA.puerta.ritmoReel.respaldo, "base");
  assert.equal(CONFIG_PLANTILLA.puerta.duracionMaxSegundos.valor, 20);
  assert.equal(CONFIG_PLANTILLA.puerta.duracionMaxSegundos.respaldo, "base");
  assert.equal(DESDE_PALANCAS_RETENCION, "2026-10-19");
  // Un ritmo desconocido en la puerta es error de config; un tope no numérico también.
  assertHas(validarConfig({ ...CONFIG_BASE, puerta: { ...CONFIG_BASE.puerta, ritmoReel: { valor: "turbo", respaldo: "base" } } }), /puerta\.ritmoReel/);
  assertHas(validarConfig({ ...CONFIG_BASE, puerta: { ...CONFIG_BASE.puerta, duracionMaxSegundos: { valor: "20", respaldo: "base" } } }), /duracionMaxSegundos/);
});

check("calendario/validar: pace gancho es válido y segundosEscenas coincide con sceneDurations del motor (20 reels, 3 ritmos)", () => {
  const b = borrador();
  b.pace = "gancho";
  assert.ok(!has(vb(pieza({ parametros: { ...PARAMETROS, ritmoReel: "gancho" } }), b), /pace/));
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const palabra = () => "abcdefghij".slice(0, 1 + Math.floor(rnd() * 9));
  const frase = (n: number) => Array.from({ length: n }, palabra).join(" ");
  for (let i = 0; i < 20; i++) {
    const slides = Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => {
      const props: Record<string, unknown> = { title: frase(1 + Math.floor(rnd() * 14)) };
      if (rnd() < 0.5) props.body = frase(Math.floor(rnd() * 30));
      if (rnd() < 0.4) props.bullets = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => frase(4));
      return { template: "Step", props };
    });
    for (const pace of ["ensenar", "rapido", "gancho"] as const) {
      const motor = sceneDurations(slides.map((x) => x.props), pace);
      assert.deepEqual(segundosEscenas(slides, pace), motor, JSON.stringify({ pace, slides }));
      const T = () => null;
      const t = specTiming({ name: "x", pace, slides: slides.map((x) => ({ template: T, props: x.props })) } as any);
      assert.equal(duracionReel({ pace, slides }), t.total, `duracionReel ${pace}`);
    }
  }
  // Sin pace válido el borrador va en ensenar (como el motor).
  assert.equal(duracionReel({ slides: borrador().slides }), duracionReel({ pace: "ensenar", slides: borrador().slides }));
  assert.equal(duracionReel({ pace: "x", slides: [] }), 0);
});

check("calendario/validar: ritmoReel — el pace del borrador debe coincidir con parametros.ritmoReel (solo reels)", () => {
  const p = pieza({ parametros: { ...PARAMETROS, ritmoReel: "gancho" } });
  assertHas(vb(p, borrador()), /pace "ensenar" del borrador no coincide con parametros\.ritmoReel "gancho"/);
  const b = borrador();
  b.pace = "gancho";
  assert.ok(!has(vb(p, b), /ritmoReel/), "con el mismo ritmo en los dos no hay error de ritmoReel");
  // Sin pace en el borrador cuenta como ensenar.
  const sin = borrador();
  delete sin.pace;
  assertNone(vb(pieza(), sin));
  assertHas(vb(p, sin), /ritmoReel/);
  // En carrusel no se mira.
  assertNone(vb(pieza({ formato: "carrusel", arquetipo: "lista", dia: "2026-10-13", parametros: { ...PARAMETROS, ritmoReel: "gancho" } }), borrador()));
  // parametros.ritmoReel debe ser un ritmo conocido; un texto cualquiera no.
  assertHas(validarPieza(pieza({ parametros: { ...PARAMETROS, ritmoReel: "turbo" } }), config), /parametros\.ritmoReel "turbo" inválido/);
  assertHas(validarPieza(pieza({ parametros: { ...PARAMETROS, ritmoReel: 1 } }), config), /parametros\.ritmoReel debe ser un texto/);
});

check("calendario/validar: duracionMaxSegundos — el reel que se pasa del tope (puerta o parametros) es error con la duración", () => {
  const b = borrador();
  const total = duracionReel(b);
  assert.ok(total > 10 && total < 60, `duración del borrador de prueba: ${total}`);
  assertNone(vb(pieza(), b));
  // Tope de la pieza (experimento): 20 s → el borrador de ~16-18 s pasa; 10 s no.
  const e = vb(pieza({ parametros: { ...PARAMETROS, duracionMaxSegundos: 10 } }), b);
  assertHas(e, new RegExp(`el reel dura ${String(total).replace(".", "\\.")} s \\(ritmo ensenar\\) y el tope es 10 s \\(parametros\\.duracionMaxSegundos\\)`));
  // Tope de la puerta cuando la pieza no trae uno propio.
  const c = { ...config, puerta: { ...config.puerta, duracionMaxSegundos: { valor: 10, respaldo: "supuesto" } } };
  const sinTope = clone(PARAMETROS);
  delete sinTope.duracionMaxSegundos;
  assertHas(validarBorrador(pieza({ dia: "2026-10-12", parametros: sinTope }), b, c), /puerta\.duracionMaxSegundos/);
  // parametros manda sobre la puerta (aunque sea mayor).
  assertNone(validarBorrador(pieza({ parametros: { ...PARAMETROS, duracionMaxSegundos: 60 } }), b, c));
  // Tope inválido en parametros → error de pieza.
  assertHas(validarPieza(pieza({ parametros: { ...PARAMETROS, duracionMaxSegundos: 0 } }), config), /duracionMaxSegundos debe ser mayor que 0/);
  // En carrusel no hay tope de tiempo.
  assertNone(vb(pieza({ formato: "carrusel", arquetipo: "lista", dia: "2026-10-13", parametros: { ...PARAMETROS, duracionMaxSegundos: 1 } }), borrador()));
  // erroresDeRetencion con entradas raras no lanza.
  for (const x of [null, 1, "x", [], { slides: "no" }, { slides: [1, 2] }]) assert.ok(Array.isArray(erroresDeRetencion(x, pieza(), config)));
});

check("calendario/validar: 20 s de tope — un reel gancho de 6 escenas cortas cabe; el borrador ensenar de 4 escenas también", () => {
  const corto = {
    name: "lun-reel-resumir-pdfs",
    angle: "a",
    pillar: "herramienta",
    pace: "gancho",
    audio: "lima-01.mp3",
    slides: [
      { template: "Hook", props: { title: "Convierte tus PDFs en un podcast", highlight: "podcast", app: "NotebookLM", resultado: "Podcast listo: 10 minutos." }, narracion: "NotebookLM convierte tus PDFs en podcast." },
      { template: "Lead", props: { text: "Sin leer una página.", highlight: "Sin leer" }, narracion: "Sin leer ni una página." },
      { template: "Step", props: { step: "1", heading: "Sube tus PDFs", body: "Crea un cuaderno y arrastra." }, narracion: "Creas un cuaderno y arrastras los PDFs." },
      { template: "Step", props: { step: "2", heading: "Pide el resumen en audio", body: "Elige la versión corta." }, narracion: "Pides el resumen en audio, versión corta." },
      { template: "Step", props: { step: "3", heading: "Escúchalo caminando", body: "Diez minutos y listo." }, narracion: "Lo escuchas caminando, diez minutos." },
      { template: "Cta", props: { title: "Guárdalo para tu próxima lectura", highlight: "Guárdalo", cta: "Guárdalo", source: "Fuente: notebooklm.google.com" }, narracion: "Guárdalo para tu próxima lectura." },
    ],
  };
  // Semana con narración obligatoria (≥ DESDE_NARRACION): narraciones cortas que caben en 20 s.
  const p = pieza({ dia: "2026-10-25", parametros: { ...PARAMETROS, ritmoReel: "gancho", duracionMaxSegundos: 20 } });
  assertNone(vb(p, corto));
  assert.ok(duracionReel(corto) <= 20, `gancho 6 escenas: ${duracionReel(corto)} s`);
  // En ensenar, el borrador de prueba (un Step con 2 bullets, ~12 palabras por escena) se pasa: ~22 s.
  const ens = borrador();
  assert.ok(duracionReel(ens) > 20, `ensenar con bullets: ${duracionReel(ens)} s`);
  ens.slides.forEach((x: any) => (x.narracion = "Sube tus apuntes y pide el audio."));
  Object.assign(ens.slides[0].props, { app: "NotebookLM", resultado: "Podcast listo." });
  assertHas(vb(pieza({ dia: "2026-10-25", parametros: { ...PARAMETROS, duracionMaxSegundos: 20 } }), ens), /tope es 20 s/);
  // Cabe con 4 escenas de ≤ 6 palabras y sin bullets (lo que dice el manual).
  ens.slides[0].props = { title: "Convierte tus PDFs en un podcast", highlight: "podcast", app: "NotebookLM", resultado: "Podcast listo." };
  ens.slides[1].props = { step: "1", heading: "Sube tus PDFs", body: "Arrastra los archivos." };
  ens.slides[2].props = { step: "2", heading: "Pide el resumen en audio", body: "Versión corta." };
  ens.slides[3].props = { title: "Guárdalo para tu próxima lectura", highlight: "Guárdalo", cta: "Guárdalo", source: "x" };
  assert.ok(duracionReel(ens) <= 20 && duracionReel(ens) >= 15, `ensenar 4 escenas cortas: ${duracionReel(ens)} s`);
  assertNone(vb(pieza({ dia: "2026-10-25", parametros: { ...PARAMETROS, duracionMaxSegundos: 20 } }), ens));
});

check("calendario/validar: presupuesto de lectura en gancho — 7 palabras en el Hook, 5 en el arranque y 10 en el medio pasan; de más fallan", () => {
  const segundos = (b: any) => reglasDeTexto(b, config, "reel").filter((e) => /segundos/.test(e));
  const g = borrador();
  g.pace = "gancho";
  g.slides[0].props = { title: "Convierte tus PDFs en un podcast gratis", highlight: "podcast" }; // 7
  g.slides[1].props = { step: "1", heading: "Sube tus PDFs aquí", body: "" }; // 4 (arranque)
  g.slides[2].props = { step: "2", heading: "Pide el resumen en audio", body: "Elige la versión corta y listo." }; // 5 + 6 = 11? no: 5 + 6 = 11 → se prueba con 10
  g.slides[2].props.body = "Elige la versión corta ya."; // 5 + 5 = 10
  g.slides[3].props = { title: "Guárdalo para tu próxima pila de lectura", highlight: "Guárdalo", reason: "Lo usas hoy.", source: "x" }; // 7 + 3 = 10
  assertNone(segundos(g));
  const hook = clone(g);
  hook.slides[0].props.subtitle = "sin leer una sola página"; // 7 + 5 = 12 > 7 (tope 3 s)
  assert.ok(segundos(hook).some((e: string) => e.startsWith("slide 1")), JSON.stringify(segundos(hook)));
  const medio = clone(g);
  medio.slides[2].props.body = "Crea un cuaderno nuevo, arrastra los archivos pendientes y espera a que termine."; // 5 + 13 = 18
  assert.ok(segundos(medio).some((e: string) => e.startsWith("slide 3")), JSON.stringify(segundos(medio)));
  // INSTRUCCIONES.md documenta la curva, los topes de palabras y las semanas de cada experimento.
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  for (const re of [/tope de 3 s/, /≤ 7 palabras en el Hook/, /Semana 2026-10-19 → `hook`/, /puerta trae `ritmoReel: "gancho"` y `duracionMaxSegundos: 20`/, /solo\*\* prueba variables que\n  mueven la retención/, /### Tope de duración del reel/, /`ritmoReel`: ritmo del reel/, /`duracionMaxSegundos`: tope de duración/]) {
    assert.match(md, re);
  }
});

check("calendario/validar: parametros — ritmoReel y duracionMaxSegundos solo se exigen desde 2026-10-19", () => {
  const sin = clone(PARAMETROS);
  delete sin.ritmoReel;
  delete sin.duracionMaxSegundos;
  assertNone(validarPieza(pieza({ dia: "2026-10-12", parametros: sin }), config));
  const e = validarPieza(pieza({ dia: "2026-10-19", parametros: sin }), config);
  assertHas(e, /falta parametros\.ritmoReel/);
  assertHas(e, /falta parametros\.duracionMaxSegundos/);
  // Las demás claves se exigen siempre.
  const sinHook = clone(sin);
  delete sinHook.hookUmbral;
  assertHas(validarPieza(pieza({ dia: "2026-10-12", parametros: sinHook }), config), /falta parametros\.hookUmbral/);
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

check("calendario/validar: plan.caidas (piezas que no pasaron el lector frío) se valida y lo lee plan.ts", () => {
  const caidas = [{ id: "sab-reel-dots", intentos: 3, notas: "v1: el completo no entendió «Dots»" }];
  assertNone(validarPlan(plan({ caidas }), config));
  assert.deepEqual(parsePlan(JSON.stringify(plan({ caidas }))).caidas, caidas);
  assertHas(validarPlan(plan({ caidas: "x" }), config), /caidas debe ser una lista/);
  assertHas(validarPlan(plan({ caidas: [{ notas: "x" }] }), config), /caidas\[0\] necesita id/);
  assertHas(validarPlan(plan({ caidas: [{ id: "a", intentos: 0 }] }), config), /intentos debe ser un entero/);
  assertHas(validarPlan(plan({ caidas: [{ id: "a", notas: 3 }] }), config), /notas debe ser texto/);
});

check("calendario/validar: plan — dos piezas a menos de separacionMinHoras → error", () => {
  const p = plan();
  p.piezas[1].hora = "08:30"; // lun 14:00 → mar 08:30 = 18,5 h
  assertHas(validarPlan(p, { ...configSprint, separacionMinHoras: 20 }), /20/);
  assert.deepEqual(validarPlan(p, configSprint).filter((e: string) => /separacionMinHoras/.test(e)), [], "con 4 h de separación pasa");
  const q = plan();
  q.piezas[1] = pieza({ id: "lun-pm-reel-x", dia: "2026-10-12", hora: "17:00", arquetipo: "compartible", tema: "[[Otro tema]]", borrador: "lun-pm-reel-x.json" });
  assertHas(validarPlan(q, configSprint), /está a 3 h de lun-reel-a \(mínimo 4 h/);
});

check("calendario/validar: plan — varias piezas por día toman entradas distintas del mix (por hora, formato y arquetipo)", () => {
  const dos = plan();
  dos.piezas.push(pieza({ id: "lun-pm-reel-x", dia: "2026-10-12", hora: "19:00", arquetipo: "compartible", tema: "[[Otro tema]]", borrador: "lun-pm-reel-x.json" }));
  assertNone(validarPlan(dos, configSprint));
  // Una tercera pieza el lunes: el mix solo tiene 2 entradas ese día.
  const tres = clone(dos);
  tres.piezas.push(pieza({ id: "lun-reel-y", dia: "2026-10-12", hora: "23:00", arquetipo: "tutorial", tema: "[[Tercer tema]]", borrador: "lun-reel-y.json" }));
  assertHas(validarPlan(tres, configSprint), /config\.mix solo tiene 2 entrada\(s\) para ese día/);
  // Dos tutoriales el lunes: el segundo no calza con la entrada libre (compartible, 19:00).
  const rep2 = clone(dos);
  rep2.piezas[3].arquetipo = "tutorial";
  assertHas(validarPlan(rep2, configSprint), /lun-pm-reel-x: arquetipo "tutorial" no sigue el mix \(ese día va compartible \(19:00\)\)/);
  // Martes: carrusel 14:00 + 2 reels (09:00 demo, 19:00 atemporal) → 3 piezas válidas.
  const martes = plan();
  martes.piezas = [
    pieza({ id: "mar-am-reel-a", dia: "2026-10-13", hora: "09:00", arquetipo: "demo", senal: "retencion", tema: "[[Tema A]]", borrador: "mar-am-reel-a.json" }),
    pieza({ id: "mar-carrusel-b", dia: "2026-10-13", hora: "14:00", formato: "carrusel", arquetipo: "lista", tema: "[[Tema B]]", borrador: "mar-carrusel-b.json" }),
    pieza({ id: "mar-pm-reel-c", dia: "2026-10-13", hora: "19:00", arquetipo: "atemporal", senal: "retencion", tema: "[[Tema C]]", borrador: "mar-pm-reel-c.json" }),
  ];
  martes.experimento = null;
  assertNone(validarPlan(martes, configSprint).filter((e: string) => !/experimento/.test(e)));
});

check("calendario/validar: plan — un tema sale a lo más 2 veces en la semana y nunca el mismo día (derivados aparte)", () => {
  const p = plan();
  p.piezas[2].tema = p.piezas[0].tema; // lunes y miércoles: permitido
  assertNone(validarPlan(p, configSprint));
  const mismoDia = plan();
  mismoDia.piezas.push(pieza({ id: "lun-pm-reel-x", dia: "2026-10-12", hora: "19:00", arquetipo: "compartible", tema: mismoDia.piezas[0].tema, borrador: "lun-pm-reel-x.json" }));
  assertHas(validarPlan(mismoDia, configSprint), /tema repetido el mismo día/);
  const tres = plan();
  tres.piezas[1].tema = tres.piezas[0].tema;
  tres.piezas[2].tema = tres.piezas[0].tema;
  assertHas(validarPlan(tres, configSprint), /un tema sale a lo más 2 veces/);
  tres.piezas[2].derivadoDe = "lun-reel-a";
  assertNone(validarPlan(tres, configSprint));
});

check("calendario/validar: config — mix con varias entradas por día: hasta 3, cada una con hora distinta", () => {
  // Instalado (pivote 2026-10-17): 4 reels + 2 carruseles, uno por día, 20 h de separación, voz em_alex.
  assert.equal(CONFIG_BASE.mix.length, 6);
  assert.equal(CONFIG_BASE.separacionMinHoras, 20);
  assert.equal(CONFIG_BASE.voz, "em_alex");
  assert.deepEqual(CONFIG_BASE.mix.map((m: { dia: number }) => m.dia), [1, 2, 3, 4, 5, 6]);
  const SPRINT = { ...CONFIG_BASE, mix: MIX_SPRINT, separacionMinHoras: 4 };
  assertNone(validarConfig(SPRINT));
  const lun = SPRINT.mix.filter((m: { dia: number }) => m.dia === 1);
  const cuatro = { ...SPRINT, mix: [...SPRINT.mix, ...lun.map((m: object, i: number) => ({ ...m, hora: `2${i}:00` }))] };
  assertHas(validarConfig(cuatro), /día 1 tiene más de 3 entradas/);
  const sinHora = { ...SPRINT, mix: SPRINT.mix.map((m: { dia: number; hora?: string }) => (m.dia === 1 ? { ...m, hora: undefined } : m)) };
  assertHas(validarConfig(sinHora), /día 1 tiene 2 entradas y alguna sin hora/);
  const repetida = { ...SPRINT, mix: SPRINT.mix.map((m: { dia: number }) => (m.dia === 1 ? { ...m, hora: "09:00" } : m)) };
  assertHas(validarConfig(repetida), /día 1 repite la hora 09:00/);
  assertHas(validarConfig({ ...SPRINT, mix: SPRINT.mix.map((m: object) => ({ ...m, hora: "9:00" })) }), /hora "9:00" inválida/);
  // Un mix de una pieza por día sin horas sigue siendo válido.
  const unoPorDia = { ...SPRINT, mix: [1, 2, 3, 4, 5, 6, 0].map((dia) => ({ dia, formato: "reel", arquetipo: "tutorial" })) };
  assertNone(validarConfig(unoPorDia));
});

check("calendario/validar: plan — hora fuera de 08:00–23:00 o sin :00/:30 → error", () => {
  for (const h of ["07:30", "23:30", "14:15", "7:30", 1400]) {
    const p = plan();
    p.piezas[0].hora = h;
    assertHas(validarPlan(p, config), /hora/);
  }
});

check("calendario/validar: plan — día fuera de la semana → error; el domingo sigue su entrada del mix", () => {
  const p = plan();
  p.piezas[0].dia = "2026-10-19";
  assertHas(validarPlan(p, config), /semana/);
  const q = plan();
  q.piezas[0].dia = "2026-10-18";
  q.piezas[0].formato = "carrusel";
  assertHas(validarPlan(q, configSprint), /no sigue el mix \(ese día va reel \(09:00\)\)/);
  const ok = plan();
  Object.assign(ok.piezas[0], { dia: "2026-10-18", arquetipo: "compartible" });
  assert.deepEqual(validarPlan(ok, configSprint).filter((e: string) => /mix|domingo|semana/.test(e)), []);
  // El mix instalado no publica el domingo.
  const sinDomingo = { ...configSprint, mix: configSprint.mix.filter((m: { dia: number }) => m.dia !== 0) };
  assert.deepEqual(validarConfig(sinDomingo), []);
  assert.deepEqual(validarConfig(config), []);
  const d = plan();
  d.piezas[0].dia = "2026-10-18";
  assertHas(validarPlan(d, sinDomingo), /config\.mix no tiene entrada para ese día/);
  assertHas(validarPlan(d, config), /config\.mix no tiene entrada para ese día/);
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
  q.piezas[1].tema = "automatizacion con ia"; // mismo tema sin [[ ]] ni tildes: 2.ª vez, otro día → permitido
  q.piezas[2].tema = "Automatización con IA"; // 3.ª vez → error
  assertHas(validarPlan(q, config), /tema/);
  q.piezas[2].derivadoDe = "lun-reel-a";
  assert.ok(!has(validarPlan(q, config), /tema/));
});

// --- semana completa (archivos) ---

/** Crea en `root` (la raíz de la base) las fichas y referencias que citan las piezas en `origen`. */
/** Referencia lista (Paso 3 del manual): de esos temas, revisada hace poco y con `## Para la audiencia`. */
function referenciaLista(temas: string[], revisado = "2026-10-09", audiencia = "- **Por qué importa:** x [1]\n- **Qué se puede hacer:** x [1]\n- **Para quién:** x\n- **Límites:** x [1]\n"): string {
  return `---\ntipo: software\nnombre: X\ntemas: [${temas.map((t) => JSON.stringify(t)).join(", ")}]\nrevisado: ${revisado}\nfuentes:\n  - https://x.y\n---\n## Qué es\nX [1]\n\n## Para la audiencia\n${audiencia}\n## Mis notas\n`;
}

/** Fichas y referencias que citan las piezas (las referencias, listas para su tema) y un candidatos.json vigente. */
function crearOrigen(root: string, piezas: any[]): void {
  const temasPorRef = new Map<string, string[]>();
  for (const x of piezas) {
    for (const r of x.origen.fichas) {
      mkdirSync(join(root, r, ".."), { recursive: true });
      writeFileSync(join(root, r), "# ficha\n");
    }
    for (const r of x.origen.referencias) temasPorRef.set(r, [...(temasPorRef.get(r) ?? []), x.tema]);
  }
  for (const [r, temas] of temasPorRef) {
    mkdirSync(join(root, r, ".."), { recursive: true });
    writeFileSync(join(root, r), referenciaLista(temas));
  }
  mkdirSync(join(root, "_calendario"), { recursive: true });
  writeFileSync(
    join(root, "_calendario", "candidatos.json"),
    JSON.stringify({ generado: "2026-10-12", temas: [{ tema: "[[Automatización con IA]]", motivo: "proxima-semana", detalle: "x" }] }),
  );
}

function semanaTemporal(): { root: string; dir: string; p: any } {
  const root = mkdtempSync(join(tmpdir(), "kb-calendario-"));
  const dir = join(root, "_calendario", "2026-10-12");
  mkdirSync(dir, { recursive: true });
  const p = plan();
  crearOrigen(root, p.piezas);
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

check("calendario/validar: probarRegla — solo cuentan los errores nuevos, con publicadas y ganadoras marcadas", () => {
  const { root, dir, p } = semanaTemporal();
  try {
    const [a, b] = p.piezas.map((x: any) => x.id);
    writeFileSync(join(dir, "estado.json"), JSON.stringify({ [a]: { estado: "publicado" }, [b]: { estado: "programado" } }));
    const cal = join(root, "_calendario");
    const igual = probarRegla(cal, config, config);
    assert.deepEqual(igual.semanas, ["2026-10-12"]);
    assert.equal(igual.publicadas, 1);
    assert.deepEqual(igual.rechazadas, []);
    assert.deepEqual(igual.liberadas, []);
    const estricta = { ...config, puerta: { ...config.puerta, tituloMaxPalabras: { valor: 1, respaldo: "supuesto" } } };
    const r = probarRegla(cal, config, estricta, { ganadoras: [`2026-10-12/${a}`] });
    assert.equal(r.ganadoras, 1);
    const fa = r.rechazadas.find((x) => x.id === a)!;
    assert.ok(fa.publicada && fa.ganadora, JSON.stringify(fa));
    assert.ok(fa.errores.every((e) => /tituloMaxPalabras/.test(e)), JSON.stringify(fa.errores));
    assert.match(informePrueba(r), /GANADORA/);
    assert.match(informePrueba(r).split("\n").at(-1)!, /^Para la Propuesta: probada sobre 1 semanas .*rechazaría 1 de 1 publicadas y 1 de 1 ganadoras/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: probarRegla — un validar.mjs candidato (regla de código) y lo que dejaría pasar", () => {
  const { root, dir, p } = semanaTemporal();
  try {
    const cal = join(root, "_calendario");
    const id = p.piezas[0].id;
    const regla = (d: string, c: unknown, o?: object) => [...validarSemana(d, c, o as any), `${id}: regla nueva`];
    const r = probarRegla(cal, config, config, { validarCandidato: regla });
    assert.deepEqual(r.rechazadas.map((x) => [x.id, x.errores]), [[id, [`${id}: regla nueva`]]]);
    // Hoy falla (borrador roto); la candidata que no mira nada lo dejaría pasar.
    writeFileSync(join(dir, `${id}.json`), "{");
    const libre = probarRegla(cal, config, config, { validarCandidato: () => [] });
    assert.ok(libre.liberadas.some((x) => x.id === id), JSON.stringify(libre.liberadas));
    assert.match(informePrueba(libre), /Dejaría pasar/);
    const lanza = probarRegla(cal, config, config, { validarCandidato: () => { throw new Error("boom"); } });
    assert.ok(lanza.rechazadas.some((x) => x.errores.some((e) => /boom/.test(e))));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: probarRegla — config candidata inválida, carpeta inexistente y score solo si cambia scoreMin", () => {
  assert.match(probarRegla("/no/existe", config, { zona: 3 }).errores[0]!, /config candidata/);
  assert.match(probarRegla("/no/existe", config, config).errores[0]!, /no se pudo leer/);
  const { root, p } = semanaTemporal();
  try {
    let llamadas = 0;
    const score = () => (llamadas++, 80);
    probarRegla(join(root, "_calendario"), config, config, { score });
    assert.equal(llamadas, 0, "sin cambio de scoreMin no se calcula");
    const r = probarRegla(join(root, "_calendario"), config, { ...config, scoreMin: 85 }, { score });
    assert.equal(llamadas, p.piezas.length, "una vez por borrador, no una por lado");
    assert.ok(r.rechazadas.some((x) => x.errores.some((e) => /score 80 < 85/.test(e))));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: ganadorasDeBucle — ganadores y ganadoresVistos, sin basura", () => {
  assert.deepEqual(ganadorasDeBucle({ ganadores: [{ semana: "2026-10-05", piezaId: "a" }, { x: 1 }], ganadoresVistos: { "2026-10-12/b": "2026-10-19" } }), ["2026-10-05/a", "2026-10-12/b"]);
  assert.deepEqual(ganadorasDeBucle(null), []);
});

check("calendario/validar: CLI --probar imprime el informe y sale 0 aunque rechace", () => {
  const { root } = semanaTemporal();
  try {
    const cal = join(root, "_calendario");
    copyFileSync(join(import.meta.dirname, "../../kb-plantilla/_calendario/validar.mjs"), join(cal, "validar.mjs"));
    writeFileSync(join(cal, "config.json"), JSON.stringify(config));
    const cand = join(root, "cand.json");
    writeFileSync(cand, JSON.stringify({ ...config, puerta: { ...config.puerta, tituloMaxPalabras: { valor: 1, respaldo: "supuesto" } } }));
    const out = execFileSync("node", [join(cal, "validar.mjs"), "--probar", cand], { encoding: "utf8", env: { ...process.env, CARRUSEL_DIR: "/no/existe" } });
    assert.match(out, /Para la Propuesta: probada sobre 1 semanas/);
    assert.match(out, /tituloMaxPalabras/);
    assert.throws(() => execFileSync("node", [join(cal, "validar.mjs"), "--probar"], { encoding: "utf8", stdio: "pipe" }), /uso/);
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

// --- confusores del experimento ---

check("calendario/validar: confusores — solo la variable cambia → ninguno; otra palanca, hora o Clip → confusor", () => {
  const p = plan();
  assert.deepEqual(confusoresDelExperimento(p), { confusores: [], sinControl: false, sinContraste: false });
  // tituloPalabras describe la pieza: no es confusor.
  p.piezas[2].parametros = { ...p.piezas[2].parametros, tituloPalabras: 5, logoEnCuadro0: false };
  const r = confusoresDelExperimento(p);
  assert.deepEqual(r.confusores.map((c) => c.clave), ["logoEnCuadro0"]);
  assert.deepEqual(r.confusores[0], { clave: "logoEnCuadro0", experimento: ["false"], control: ["true"] });
  // El carrusel no es control de un reel; con borradores, un Clip solo en el experimento es confusor.
  const conClip = borrador();
  conClip.slides = [...conClip.slides, { template: "Clip", props: { archivo: "x.mp4" } }];
  const b = new Map<string, unknown>([["lun-reel-a", borrador()], ["mar-carrusel-b", conClip], ["mie-reel-c", conClip]]);
  assert.deepEqual(confusoresDelExperimento(plan(), b).confusores.map((c) => c.clave), ["clip"]);
});

check("calendario/validar: confusores — sin control del mismo formato o variable sin contraste se informan", () => {
  const todos = plan({ experimento: { variable: "hook", hipotesis: "h", piezas: ["lun-reel-a", "mie-reel-c"] } });
  assert.equal(confusoresDelExperimento(todos).sinControl, true);
  const igual = plan();
  igual.piezas[2].hora = "14:00";
  assert.equal(confusoresDelExperimento(igual).sinContraste, true);
  for (const raro of [undefined, "x", plan({ experimento: null }), plan({ experimento: { variable: "hora", piezas: "x" } })]) {
    assert.deepEqual(confusoresDelExperimento(raro).confusores, []);
  }
  assertHas(validarPlan(plan({ experimento: { variable: "hora", hipotesis: "h", piezas: ["mie-reel-c"], confusores: "hora" } }), config), /confusores/);
});

check(`calendario/validar: validarSemana — confusor no declarado: aviso antes de ${DESDE_CONFUSORES}, error desde ahí salvo en experimento.confusores`, () => {
  const { root, dir, p } = semanaTemporal();
  try {
    p.piezas[2].parametros = { ...p.piezas[2].parametros, logoEnCuadro0: false };
    writeFileSync(join(dir, "plan.json"), JSON.stringify(p));
    const avisos: string[] = [];
    assert.deepEqual(validarSemana(dir, config, { avisos, score: () => 90 }).filter((e) => /mezcla/.test(e)), []);
    assert.ok(avisos.some((a) => /experimento "hora" mezcla logoEnCuadro0 \(experimento false; control true\)/.test(a)), JSON.stringify(avisos));
    // Desde DESDE_CONFUSORES (solo se mira la semana declarada; el resto de errores de fechas no importa aquí).
    writeFileSync(join(dir, "plan.json"), JSON.stringify({ ...p, semana: DESDE_CONFUSORES }));
    assertHas(validarSemana(dir, config, { avisos: [], score: () => 90 }), /mezcla logoEnCuadro0/);
    writeFileSync(join(dir, "plan.json"), JSON.stringify({ ...p, semana: DESDE_CONFUSORES, experimento: { ...p.experimento, confusores: ["logoEnCuadro0"] } }));
    assert.deepEqual(validarSemana(dir, config, { avisos: [], score: () => 90 }).filter((e) => /mezcla|confusores/.test(e)), []);
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
    crearOrigen(root, p.piezas);
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
  assertHas(validarPlan(p, { ...config, separacionMinHoras: 20 }), /sab-reel-b: está a 19\.5 h/);
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

// R52: sin `parametros` el bucle no puede comparar los parámetros de la puerta.
check("calendario/validar (R52): parametros obligatorio con TODAS las claves de config.puerta y el tipo de su valor", () => {
  assertNone(validarPieza(pieza(), config));
  assertHas(validarPieza(pieza({ parametros: undefined }), config), /falta parametros/);
  const sinClave = clone(PARAMETROS);
  delete sinClave.hookUmbral;
  delete sinClave.relleno;
  const e = validarPieza(pieza({ parametros: sinClave }), config);
  assertHas(e, /parametros\.hookUmbral/);
  assertHas(e, /parametros\.relleno/);
  assertHas(validarPieza(pieza({ parametros: { ...PARAMETROS, tituloMaxPalabras: "12" } }), config), /parametros\.tituloMaxPalabras.*número/);
  assertHas(validarPieza(pieza({ parametros: { ...PARAMETROS, logoEnCuadro0: "sí" } }), config), /parametros\.logoEnCuadro0.*true o false/);
  assertHas(validarPieza(pieza({ parametros: { ...PARAMETROS, siglasPermitidas: "GPT" } }), config), /parametros\.siglasPermitidas.*lista/);
  assertHas(validarPieza(pieza({ parametros: [] }), config), /parametros debe ser un objeto/);
  // Claves extra (p. ej. la variable del experimento o tituloPalabras) se permiten.
  assertNone(validarPieza(pieza({ parametros: { ...PARAMETROS, tituloPalabras: 7, hook: "curiosidad" } }), config));
  // INSTRUCCIONES.md lo explica.
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  assert.match(md, /`parametros` es obligatorio/);
});

// R47: en la nube el score léxico suele no correr; el Mac lo revalida y bajo 75 la pieza queda en hueco vacío.
check("calendario/validar (R47): INSTRUCCIONES.md advierte que el score ≥ 75 se revalida en el Mac y lista las palancas de virality.ts", () => {
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  const sec = md.slice(md.indexOf("### Score léxico"), md.indexOf("###", md.indexOf("### Score léxico") + 5));
  assert.ok(sec.length > 100, "falta la sección «Score léxico»");
  assert.match(sec, /se revalida en el Mac/);
  assert.match(sec, /hueco vacío/);
  for (const palanca of [/número/, /CTA/, /acción/, /hype/, /jerga/, /highlight/, /6 a 8 slides/, /fuente/i]) assert.match(sec, palanca);
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

// --- lector frío (2026-10-07): texto exacto por código y origen verificado ---

/** Borrador con un mito y un dato para probar las etiquetas y el valor del Stat. */
function borradorConMito(): any {
  const b = clone(EJEMPLO.borrador) as any;
  b.slides.splice(5, 0,
    { template: "MythReality", props: { myth: "Necesitas pagar para tener un podcast", reality: "NotebookLM lo hace gratis" } },
    { template: "MythReality", props: { myth: "Hay que saber editar audio", reality: "Lo arma solo", mythLabel: "Lo que crees", realityLabel: "Lo que pasa" } },
    { template: "Stat", props: { value: "10 min", label: "dura el resumen", context: "en la versión corta" } },
  );
  return b;
}

check("calendario/validar (lector): con prisa ve el prompt completo y las etiquetas del mito", () => {
  const { conPrisa, completo } = textosLector(borradorConMito());
  const prompt = EJEMPLO.borrador.slides[4].props.prompt as string;
  assert.ok(conPrisa.includes(prompt), conPrisa);
  assert.ok(completo.includes(prompt));
  for (const t of [conPrisa, completo]) {
    assert.ok(t.includes("El mito: Necesitas pagar para tener un podcast"), t);
    assert.ok(t.includes("La realidad: NotebookLM lo hace gratis"), t);
    assert.ok(t.includes("Lo que crees: Hay que saber editar audio"), t);
    assert.ok(t.includes("Lo que pasa: Lo arma solo"), t);
    assert.ok(/10 min\ndura el resumen/.test(t), t);
  }
  // El cuerpo y el contexto solo los ve el lector completo.
  assert.ok(!conPrisa.includes("arrastra los archivos"));
  assert.ok(completo.includes("arrastra los archivos"));
  assert.ok(!conPrisa.includes("en la versión corta") && completo.includes("en la versión corta"));
  assert.ok(!conPrisa.includes("El truco es el prompt") && completo.includes("El truco es el prompt"));
  // En orden: slide por slide.
  assert.ok(conPrisa.indexOf("Slide 1:") < conPrisa.indexOf("Slide 5:") && conPrisa.indexOf("Slide 5:") < conPrisa.indexOf(prompt));
});

check("calendario/validar (lector): source no entra en ningún lector; el número de paso sí (también numérico)", () => {
  const source = EJEMPLO.borrador.slides[5].props.source as string;
  const { conPrisa, completo } = textosLector(EJEMPLO.borrador);
  for (const t of [conPrisa, completo]) {
    assert.ok(!t.includes(source), t);
    assert.ok(/^1\n.*Sube tus PDFs a NotebookLM/m.test(t), t);
    assert.ok(/^2\n.*Pide el resumen en audio/m.test(t), t);
  }
  const b = clone(EJEMPLO.borrador) as any;
  b.slides[2].props.step = 1;
  for (const t of Object.values(textosLector(b))) assert.ok(/^1\n.*Sube tus PDFs a NotebookLM/m.test(t), t);
});

check("calendario/validar (lector): el completo ve eyebrow, kicker, subtitle, note, reason, pastilla, @handle, ventana del prompt y Desliza (solo carrusel)", () => {
  const b = clone(EJEMPLO.borrador) as any;
  b.slides[0].props.eyebrow = "Truco de estudio";
  b.slides[1].props.kicker = "Sin pantalla";
  b.slides[4].props.note = "Funciona también en inglés";
  b.slides[5].props.reason = "Cada semana un truco nuevo";
  b.slides[5].props.handle = "ia.punto.es";
  b.slides[5].props.cta = "Guárdalo 🔖";
  const { completo, conPrisa } = textosLector(b, "carrusel");
  for (const x of ["Truco de estudio", "Sin pantalla", "El truco es el prompt", "Funciona también en inglés", "Cada semana un truco nuevo", "\nGuárdalo\n", "@ia.punto.es", "Copia este prompt", "Copiar", "Desliza →"]) {
    assert.ok(completo.includes(x), `falta ${JSON.stringify(x)} en:\n${completo}`);
  }
  assert.ok(!completo.includes("🔖"));
  for (const x of ["Truco de estudio", "Sin pantalla", "Funciona también", "Cada semana", "@ia.punto.es", "Desliza", "Copia este prompt"]) assert.ok(!conPrisa.includes(x), x);
  assert.ok(!textosLector(b, "reel").completo.includes("Desliza"), "en reel no hay Desliza");
  b.slides[0].props.swipe = false;
  assert.ok(!textosLector(b, "carrusel").completo.includes("Desliza"));
  delete b.slides[5].props.cta;
  assert.ok(textosLector(b).completo.includes("Link en bio →"), "pastilla por defecto");
});

check("calendario/validar (lector): textoPastilla es copia de pillContent (Cta.tsx)", () => {
  for (const c of [undefined, "", "Guárdalo 🔖", "Envíaselo ↗", "Comenta RESUMEN  ✍️ ya", "👨‍👩‍👧 familia", "Link en bio →", "  espacios   raros  "]) {
    assert.equal(textoPastilla(c), pillContent(c).text, JSON.stringify(c));
  }
});

/** Texto visible de un componente renderizado (sin etiquetas HTML). */
const textoRender = (el: any) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

check("calendario/validar (lector): etiquetas por defecto de MythReality leídas del componente; mythLabel \"\" da etiqueta vacía", () => {
  const html = textoRender(createElement(MythReality, { myth: "MITO_X", reality: "REAL_Y" }));
  const etiquetas = html.split("\n").map((x) => x.trim()).filter((x) => x && x !== "MITO_X" && x !== "REAL_Y");
  const { completo } = textosLector({ slides: [{ template: "MythReality", props: { myth: "MITO_X", reality: "REAL_Y" } }] });
  const [lm, lr] = [completo.match(/^(.*): MITO_X$/m)?.[1], completo.match(/^(.*): REAL_Y$/m)?.[1]];
  assert.ok(lm && etiquetas.includes(lm), `etiqueta del mito ${lm} no está en el componente: ${JSON.stringify(etiquetas)}`);
  assert.ok(lr && etiquetas.includes(lr), `etiqueta de la realidad ${lr} no está en el componente: ${JSON.stringify(etiquetas)}`);
  const vacia = textosLector({ slides: [{ template: "MythReality", props: { myth: "MITO_X", reality: "REAL_Y", mythLabel: "" } }] });
  assert.ok(/^MITO_X$/m.test(vacia.completo) && /^MITO_X$/m.test(vacia.conPrisa), vacia.completo);
  assert.ok(!textoRender(createElement(MythReality, { myth: "MITO_X", reality: "REAL_Y", mythLabel: "" })).includes(lm!));
});

check("calendario/validar (lector): cada línea del lector completo está en lo que dibuja el componente", () => {
  const casos: [string, any, Record<string, unknown>][] = [
    ["Hook", Hook, { eyebrow: "Truco de estudio", title: "Convierte 6 PDFs en un podcast", highlight: "podcast", subtitle: "El truco es el prompt" }],
    ["Lead", Lead, { kicker: "Sin pantalla", text: "6 archivos y cero horas", highlight: "cero horas" }],
    ["Step", Step, { step: "1", heading: "Sube tus PDFs", highlight: "PDFs", body: "Arrastra los archivos.", bullets: ["Uno", "Dos"] }],
    ["Prompt", Prompt, { heading: "Pega esto", prompt: "Resume las 3 ideas clave.", note: "Funciona en inglés" }],
    ["MythReality", MythReality, { myth: "Hay que pagar", reality: "Es gratis", mythLabel: "Lo que crees" }],
    ["Stat", Stat, { value: "10", label: "minutos dura", context: "en la versión corta" }],
    ["Cta", Cta, { title: "Guárdalo para después", highlight: "Guárdalo", reason: "Cada semana", handle: "ia.punto.es", cta: "Guárdalo 🔖" }],
  ];
  for (const [t, C, props] of casos) {
    for (const formato of ["post", "reel"] as const) {
      const html = textoRender(createElement(C, { ...props, format: formato }));
      const plano = html.replace(/\s+/g, " ");
      const { completo } = textosLector({ slides: [{ template: t, props }] }, formato === "reel" ? "reel" : "carrusel");
      for (const linea of completo.split("\n").slice(1)) {
        const partes = linea.replace(/\*\*/g, "").replace(/^- /, "").split(/: (?=.)/);
        for (const x of t === "MythReality" ? partes : [partes.join(": ")]) {
          assert.ok(plano.includes(x.replace(/\s+/g, " ")), `${t} (${formato}): ${JSON.stringify(x)} no lo dibuja el componente`);
        }
      }
    }
  }
});

check("calendario/validar (lector): entradas raras no lanzan", () => {
  assert.doesNotThrow(() => textosLector(null));
  assert.doesNotThrow(() => textosLector({ slides: [null, { template: "X" }, { template: "Hook", props: 3 }] }));
});

/** Base temporal con `_calendario/config.json`, validar.mjs, lector-frio.md y la semana del ejemplo. */
function baseConEjemplo(): { root: string; cal: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), "kb-calendario-lector-"));
  const cal = join(root, "_calendario");
  const dir = join(cal, EJEMPLO.plan.semana);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(DIR, "validar.mjs"), join(cal, "validar.mjs"));
  copyFileSync(join(DIR, "lector-frio.md"), join(cal, "lector-frio.md"));
  writeFileSync(join(cal, "config.json"), JSON.stringify({ ...CONFIG_BASE, audios: [EJEMPLO.borrador.audio] }));
  writeFileSync(join(dir, "plan.json"), JSON.stringify(EJEMPLO.plan));
  writeFileSync(join(dir, `${EJEMPLO.plan.piezas[0].id}.json`), JSON.stringify(EJEMPLO.borrador));
  crearOrigen(root, EJEMPLO.plan.piezas);
  return { root, cal, env: { ...process.env, CARRUSEL_DIR: join(root, "nada") } };
}

check("calendario/validar (CLI): --lector imprime los dos textos y el mensaje con lector-frio.md copiado, sin su ruta", () => {
  const { root, cal, env } = baseConEjemplo();
  try {
    const out = execFileSync("node", [join(cal, "validar.mjs"), "--lector", EJEMPLO.plan.semana, EJEMPLO.plan.piezas[0].id], { encoding: "utf8", stdio: "pipe", env });
    const { completo, conPrisa } = textosLector(EJEMPLO.borrador, EJEMPLO.plan.piezas[0].formato);
    assert.ok(out.includes(completo) && out.includes(conPrisa), out);
    assert.ok(out.includes("¿De qué trata, en una frase?"), "lleva el cuestionario copiado");
    assert.ok(!out.includes("lector-frio.md"), "nunca la ruta del archivo");
    assert.ok(!out.includes("plan.json"), "nada del plan");
    assert.ok(!out.includes(EJEMPLO.plan.piezas[0].entregable));
    assert.equal((out.match(/=== MENSAJE/g) ?? []).length, 2, out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar (CLI): --lector con id inexistente da un error claro y sale con 1", () => {
  const { root, cal, env } = baseConEjemplo();
  try {
    for (const args of [[EJEMPLO.plan.semana, "no-existe"], [EJEMPLO.plan.semana], ["x", "lun-reel-pdfs-a-podcast"], ["2026-10-19", "lun-reel-pdfs-a-podcast"]]) {
      try {
        execFileSync("node", [join(cal, "validar.mjs"), "--lector", ...args], { stdio: "pipe", env });
        assert.fail(`debió fallar: ${args.join(" ")}`);
      } catch (e: any) {
        assert.equal(e.status, 1, String(e.stderr));
        if (args[1] === "no-existe") assert.match(String(e.stderr), /no hay ninguna pieza con id "no-existe".*lun-reel-pdfs-a-podcast/s);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: referencia lista — tema, revisado ≤ 60 d y Para la audiencia (o error por pieza)", () => {
  const T = "[[Automatización con IA]]";
  assert.equal(motivoReferenciaNoLista(referenciaLista([T]), T, "2026-10-12"), undefined);
  assert.equal(motivoReferenciaNoLista(referenciaLista(["[[Automatizacion con ia]]"]), T, "2026-10-12"), undefined, "sin tildes ni mayúsculas");
  assert.match(motivoReferenciaNoLista(referenciaLista(["[[Otro]]"]), T, "2026-10-12")!, /no es del tema/);
  assert.match(motivoReferenciaNoLista(referenciaLista([T], "2026-08-01"), T, "2026-10-12")!, /más de 60 días/);
  assert.match(motivoReferenciaNoLista(referenciaLista([T], "2026-10-09", "No aplica a la cuenta: es un lugar.\n"), T, "2026-10-12")!, /no aplica/);
  assert.match(motivoReferenciaNoLista("---\ntemas: [\"[[Automatización con IA]]\"]\nrevisado: 2026-10-09\n---\n## Qué es\nx\n", T, "2026-10-12")!, /Para la audiencia/);
  const lista = "---\ntemas:\n  - '[[Automatización con IA]]'\nrevisado: '2026-10-09'\n---\n## Para la audiencia\n- **Por qué importa:** x [1]\n";
  assert.equal(motivoReferenciaNoLista(lista, T, "2026-10-12"), undefined, "temas en columna y fecha entre comillas");

  const { root, dir, p } = semanaTemporal();
  try {
    assertNone(validarSemana(dir, config, { score: () => 90 }));
    writeFileSync(join(root, p.piezas[0].origen.referencias[0]), referenciaLista(["[[Otro]]"]));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /lun-reel-a: ninguna referencia lista en origen\.referencias \(referencias\/notebooklm\.md: no es del tema/);
    p.piezas[0].origen.referencias = [];
    writeFileSync(join(dir, "plan.json"), JSON.stringify(p));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /lun-reel-a: origen\.referencias vacío/);
    // Antes de 2026-10-12 no se exige (la semana 2026-10-05 ya publicada sigue válida).
    const vieja = join(root, "_calendario", "2026-10-05");
    mkdirSync(vieja);
    const pv = JSON.parse(JSON.stringify(p));
    pv.semana = "2026-10-05";
    pv.piezas.forEach((x: any, i: number) => { x.dia = `2026-10-0${5 + i}`; });
    for (const x of pv.piezas) copyFileSync(join(dir, x.borrador), join(vieja, x.borrador));
    writeFileSync(join(vieja, "plan.json"), JSON.stringify(pv));
    assert.ok(!validarSemana(vieja, config, { score: () => 90 }).some((e: string) => /referencia|candidatos/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: alcance.json — tema fuera de dentro/despues da error; sin alcance.json no se mira", () => {
  const { root, dir } = semanaTemporal();
  try {
    mkdirSync(join(root, "_investigacion"));
    const temas = ["Automatización con IA", "Automatización de tareas", "Automatización del hogar"];
    writeFileSync(join(root, "_investigacion", "alcance.json"), JSON.stringify({ dentro: temas.slice(0, 2), despues: [temas[2]], fuera: [] }));
    assertNone(validarSemana(dir, config, { score: () => 90 }));
    writeFileSync(join(root, "_investigacion", "alcance.json"), JSON.stringify({ dentro: temas.slice(0, 2), despues: [], fuera: [temas[2]] }));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /mie-reel-c: tema \[\[Automatización del hogar\]\] no está en "dentro" ni "despues"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: noticias — a lo más 1 por semana desde 2026-10-12", () => {
  const p = plan();
  p.piezas[0].pilar = "noticia";
  assertNone(validarPlan(p, config));
  p.piezas[1].pilar = "noticia";
  assertHas(validarPlan(p, config), /2 piezas con pilar "noticia"/);
});

check("calendario/validar: candidatos.json — obligatorio desde 2026-10-12, forma, motivos y generado vigente", () => {
  const ok = { generado: "2026-10-12", temas: [{ tema: "[[A]]", motivo: "sin-referencia", detalle: "x" }] };
  assertNone(validarCandidatos(ok, "2026-10-12"));
  assertNone(validarCandidatos({ ...ok, generado: "2026-10-19" }, "2026-10-12"), );
  assertHas(validarCandidatos({ ...ok, generado: "2026-10-05" }, "2026-10-12"), /semana anterior/);
  assertHas(validarCandidatos({ ...ok, temas: [] }, "2026-10-12"), /al menos un tema/);
  assertHas(validarCandidatos({ ...ok, temas: [{ tema: "A", motivo: "otro", detalle: "" }] }, "2026-10-12"), /"\[\[<Tema>\]\]"/);
  assertHas(validarCandidatos({ ...ok, temas: [{ tema: "[[A]]", motivo: "otro", detalle: "x" }] }, "2026-10-12"), /motivo "otro" inválido/);
  assertHas(validarCandidatos({ ...ok, temas: [ok.temas[0], { ...ok.temas[0], tema: "[[á]]" }] }, "2026-10-12"), /repetido/);
  assertHas(validarCandidatos({ ...ok, temas: Array.from({ length: 9 }, (_, i) => ({ tema: `[[T${i}]]`, motivo: "derivado", detalle: "x" })) }, "2026-10-12"), /máximo 8/);
  const { root, dir } = semanaTemporal();
  try {
    rmSync(join(root, "_calendario", "candidatos.json"));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /semana: _calendario\/candidatos\.json no existe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: origen — ruta inexistente, traversal, symlink afuera, carpeta y \".\" dan error; sin base (self-test) no se mira", () => {
  const { root, dir, p } = semanaTemporal();
  const afuera = mkdtempSync(join(tmpdir(), "kb-calendario-afuera-"));
  try {
    assertNone(validarSemana(dir, config, { score: () => 90 }));
    rmSync(join(root, p.piezas[0].origen.referencias[0]));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /lun-reel-a: origen\.referencias: "referencias\/notebooklm\.md" no existe en la base/);
    // Un archivo real fuera de la base y un enlace simbólico dentro que apunta a él.
    writeFileSync(join(afuera, "secreto.md"), "fuera\n");
    symlinkSync(join(afuera, "secreto.md"), join(root, "fuentes", "enlace.md"));
    symlinkSync(afuera, join(root, "fuentes", "carpeta-afuera"));
    const casos: [string, RegExp][] = [
      ["../fuera.md", /fuera de la base/],
      ["/etc/passwd", /fuera de la base/],
      ["fuentes/../../x.md", /fuera de la base/],
      ["fuentes/enlace.md", /fuera de la base/],
      ["fuentes/carpeta-afuera/secreto.md", /fuera de la base/],
      ["fuentes", /no es un archivo/],
      ["./", /no es un archivo/],
      [".", /no es un archivo/],
    ];
    for (const [mala, re] of casos) {
      const q = clone(p);
      crearOrigen(root, q.piezas);
      q.piezas[1].origen.fichas = [mala];
      writeFileSync(join(dir, "plan.json"), JSON.stringify(q));
      const errs = validarSemana(dir, config, { score: () => 90 }).filter((e: string) => e.startsWith("mar-carrusel-b: origen"));
      assert.equal(errs.length, 1, `${mala}: ${JSON.stringify(errs)}`);
      assert.match(errs[0], re, mala);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(afuera, { recursive: true, force: true });
  }
  // validarBorrador (lo que usa --self-test) no depende de que exista la base.
  assertNone(validarBorrador(EJEMPLO.plan.piezas[0], EJEMPLO.borrador, { ...CONFIG_BASE, audios: [EJEMPLO.borrador.audio] }));
});

check("calendario/validar: lector-frio.md e INSTRUCCIONES.md — criterio nuevo del lector con prisa y uso de --lector", () => {
  const lf = readFileSync(join(DIR, "lector-frio.md"), "utf8");
  const ins = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  assert.ok(lf.includes("--lector") && ins.includes("node _calendario/validar.mjs --lector"));
  assert.ok(/no bloquean/.test(lf) && /no bloquean/.test(ins));
  assert.ok(!lf.includes("Lee `lector-frio.md`"), "el mensaje ya no lleva la ruta");
});

check("calendario/validar: handle con @ inicial → error \"sin @: el motor la agrega\"", () => {
  const b = borrador();
  b.slides[3].props.handle = "@ia.punto.es";
  assertHas(vb(pieza(), b), /handle "@ia\.punto\.es" sin @: el motor la agrega/);
  b.slides[3].props.handle = "ia.punto.es";
  assertNone(vb(pieza(), b));
  assert.equal(EJEMPLO.borrador.slides[5].props.handle, "ia.punto.es");
});

check("calendario/validar: el Cta exige cta explícito y coherente con la señal", () => {
  const b = borrador();
  delete b.slides[3].props.cta;
  assertHas(vb(pieza(), b), /falta cta.*Link en bio/);
  const casos: [string, string, boolean][] = [
    ["guardados", "Guárdalo", true],
    ["guardados", "Guarda este post 🔖", true],
    ["guardados", "Envíaselo a alguien", false],
    ["envios", "Envíaselo a alguien", true],
    ["envios", "Mándaselo a tu jefe", true],
    ["envios", "Compártelo", true],
    ["envios", "Guárdalo", false],
    ["comentarios", "Comenta RESUMEN", true],
    ["comentarios", "Guárdalo", false],
    ["retencion", "Guárdalo", true],
    ["retencion", "Envíaselo a alguien", true],
    ["retencion", "Comenta RESUMEN", false],
    ["guardados", "Link en bio →", false],
    ["envios", "Reenvíaselo a alguien", true],
    ["envios", "Pásaselo a quien lo necesite", true],
    ["envios", "Dile a alguien", true],
    ["envios", "Etiqueta a un amigo", true],
    ["comentarios", "Escribe PALABRA", true],
    ["comentarios", "Responde PALABRA", true],
    ["retencion", "Reenvíaselo a alguien", true],
    ...["guardados", "envios", "comentarios", "retencion"].map((x): [string, string, boolean] => [x, "Link en bio →", false]),
  ];
  for (const [senal, cta, ok] of casos) {
    const c = borrador();
    c.slides[3].props.cta = cta;
    const errs = vb(pieza({ senal }), c).filter((e: string) => /pastilla/.test(e));
    assert.equal(errs.length === 0, ok, `${senal} + ${JSON.stringify(cta)}: ${JSON.stringify(errs)}`);
  }
});

check("calendario/validar: INSTRUCCIONES.md trae los textos sugeridos de la pastilla por señal", () => {
  const md = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  for (const x of ['"Guárdalo"', '"Envíaselo a alguien"', '"Comenta PALABRA"', "sin @: el motor la agrega"]) assert.ok(md.includes(x), x);
});

// --- 2026-10-07 (2): ventana del Prompt legible y notas NB del lector frío ---

check("calendario/validar (lector): la ventana del Prompt dice \"Copia este prompt\" (no un nombre de archivo con guiones)", () => {
  for (const format of ["post", "reel"] as const) {
    const html = textoRender(createElement(Prompt, { heading: "Pega esto", prompt: "Resume esto.", format }));
    assert.ok(html.includes("Copia este prompt"), format);
    assert.ok(!html.includes("copia-este-prompt"), format);
  }
  const { completo } = textosLector(EJEMPLO.borrador);
  assert.ok(completo.includes("Copia este prompt") && !completo.includes("copia-este-prompt"), completo);
});

check("calendario/validar: lectorFrio.notas — cada duda no bloqueante en formato NB: «cita» → regla", () => {
  const conNotas = (notas: unknown) => validarPieza(pieza({ lectorFrio: { intentos: 2, resultado: "ok", notas } }), config).filter((e: string) => /notas/.test(e));
  for (const ok of [
    "ambos entendieron a la primera",
    "NB: «no sé qué es un cuaderno» → completo P3: explicado en el Step 1",
    "v1: no vio el prompt; se movió al título.\nNB: «¿qué es NotebookLM?» → completo P3: explicado en la slide 3\nNB: «me faltó saber cuánto dura» → con prisa P6: no bloquea",
    "NB: «quería más ejemplos» → completo P6: no es contradicción, promesa incumplida ni paso imposible; NB: «ChatGPT» → completo P3: uso común",
  ]) assert.deepEqual(conNotas(ok), [], ok);
  for (const malo of [
    "NB: no sé qué es un cuaderno → completo P3: explicado",
    "NB: «no sé qué es un cuaderno» →",
    "NB: «no sé qué es un cuaderno» completo P3",
    "NB: «» → completo P3: uso común",
    "el completo dudó de «cuaderno» (no bloquea)",
    "duda no bloqueante: cuaderno",
  ]) assert.ok(conNotas(malo).some((e: string) => /NB: «cita» → regla/.test(e)), `${malo}: ${JSON.stringify(conNotas(malo))}`);
  assert.ok(conNotas(3).length > 0, "notas debe ser texto");
  assertNone(validarPieza(EJEMPLO.plan.piezas[0], { ...CONFIG_BASE, audios: [EJEMPLO.borrador.audio] }));
  assert.match(EJEMPLO.plan.piezas[0].lectorFrio.notas, /NB: «[^«»]+» → \S/);
});

check("calendario/validar: lector-frio.md e INSTRUCCIONES.md — criterio nuevo de las preguntas 3 y 6 del lector completo, con cita textual", () => {
  const lf = readFileSync(join(DIR, "lector-frio.md"), "utf8");
  const ins = readFileSync(join(DIR, "INSTRUCCIONES.md"), "utf8");
  for (const md of [lf, ins]) {
    assert.ok(md.includes("NB: «cita» → regla"), "formato NB");
    assert.ok(/textual/.test(md), "cita textual");
    assert.ok(/que la pieza no explica/.test(md), "regla de la 3");
    assert.ok(/contradicción/.test(md) && /promesa/.test(md), "regla de la 6");
  }
  assert.ok(!lf.includes("copia-este-prompt"));
});

// --- Hook con video IA (hookVideo) ---

// --- Clip: video generado como contenido (solo reels) ---

const CLIP_FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/reel-clip.json", import.meta.url), "utf8"));
/** Pieza de la semana 2026-10-19 (narración obligatoria) en ritmo gancho, como las 3 piezas extra. */
const piezaClip = (over: Record<string, unknown> = {}) =>
  pieza({ id: CLIP_FIXTURE.name, borrador: `${CLIP_FIXTURE.name}.json`, dia: "2026-10-22", hora: "19:00", arquetipo: "demo", parametros: { ...PARAMETROS, ritmoReel: "gancho" }, ...over });
const borradorClip = (): any => clone(CLIP_FIXTURE);
const configClip = { ...config, clipsMaxSemana: 3 };

check("calendario/validar: Clip — la fixture es válida; en carrusel, archivo con ruta, 4 Clips, logo en cuadro 0, Hook extra o hookVideo → error", () => {
  assertNone(validarBorrador(piezaClip(), borradorClip(), configClip));
  assertHas(validarBorrador(piezaClip({ formato: "carrusel", id: "jue-carrusel-x", borrador: "jue-carrusel-x.json" }), { ...borradorClip(), name: "jue-carrusel-x" }, configClip), /Clip solo va en reels/);
  const ruta = borradorClip();
  ruta.slides[0].props.archivo = "../a.mp4";
  assertHas(validarBorrador(piezaClip(), ruta, configClip), /archivo/);
  const cuatro = borradorClip();
  cuatro.slides.splice(1, 0, clone(cuatro.slides[0]), clone(cuatro.slides[0]));
  assertHas(validarBorrador(piezaClip(), cuatro, configClip), /máximo 3/);
  assertHas(validarBorrador(piezaClip(), { ...borradorClip(), logoEnCuadro0: true }, configClip), /logoEnCuadro0/);
  const conHook = borradorClip();
  conHook.slides.splice(2, 0, { template: "Hook", props: { title: "Un hook tardío con 1 dato", highlight: "dato", resultado: "listo", app: "Kling" }, narracion: "Esto es un hook tardío." });
  assertHas(validarBorrador(piezaClip(), conHook, configClip), /sin Hook/);
  assertHas(validarBorrador(piezaClip(), { ...borradorClip(), hookVideo: { prompt: "Cinematic slow dolly-in on a Chilean street market in Santiago at golden hour.", segundos: 5 } }, configClip), /hookVideo/);
});

check("calendario/validar: Clip — segundosEscenas coincide con el motor y la portada dura ≥ 3 s; el lector ve [video] y el label solo en el texto completo", () => {
  const slides = borradorClip().slides;
  const motor = sceneDurations(slides.map((x: any) => x.props), "gancho");
  assert.deepEqual(segundosEscenas(slides.map((x: any) => ({ template: x.template, props: x.props })), "gancho"), motor);
  assert.ok(motor[0] >= 3.0 && segundosEscenas(slides, "gancho")[0] >= 3.0);
  const { completo, conPrisa } = textosLector(borradorClip(), "reel");
  assert.ok(completo.includes("[video]") && conPrisa.includes("[video]"));
  assert.ok(completo.includes("Kling 3.0 · 9 créditos") && !conPrisa.includes("Kling 3.0 · 9 créditos"));
});

check("calendario/validar: validarSemana — 1 reel con Clip sin config.clipsMaxSemana → error; con 3 pasa; clipsMaxSemana inválido → error", () => {
  const { root, dir, p } = semanaTemporal();
  try {
    const x = p.piezas.find((x: any) => x.formato === "reel");
    writeFileSync(join(dir, x.borrador), JSON.stringify({ ...borradorClip(), name: x.id, pace: "ensenar" }));
    assertHas(validarSemana(dir, config, { score: () => 90 }), /1 reels con Clip \(máximo 0, config.clipsMaxSemana\)/);
    assertNone(validarSemana(dir, configClip, { score: () => 90 }).filter((e) => /Clip/.test(e)));
    assertHas(validarConfig({ ...config, clipsMaxSemana: -1 }), /clipsMaxSemana/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const HOOK_VIDEO = { prompt: "Cinematic slow dolly-in on a team of Chilean coworkers in silence at a meeting in Santiago.", segundos: 5 };

check("calendario/validar: hookVideo válido en un reel pasa; en carrusel, mal formado o con fondo en el Hook → error", () => {
  const b = { ...borrador(), hookVideo: HOOK_VIDEO };
  assertNone(validarBorrador(pieza(), b, config).filter((e) => /hookVideo/.test(e)));
  assertHas(validarBorrador(pieza({ formato: "carrusel" }), b, config), /hookVideo solo va en reels/);
  assertHas(validarBorrador(pieza(), { ...borrador(), hookVideo: { prompt: "corto" } }, config), /hookVideo\.prompt/);
  assertHas(validarBorrador(pieza(), { ...borrador(), hookVideo: { ...HOOK_VIDEO, segundos: 9 } }, config), /hookVideo\.segundos/);
  assertHas(validarBorrador(pieza(), { ...borrador(), hookVideo: { ...HOOK_VIDEO, url: "x" } }, config), /campo desconocido "url"/);
  const conFondo = { ...borrador(), hookVideo: HOOK_VIDEO };
  conFondo.slides[0].background = { ai: "oficina" };
  assertHas(validarBorrador(pieza(), conFondo, config), /el Hook no lleva background/);
});

check("calendario/validar: validarSemana — 2 reels con hookVideo → error (máximo 1 por defecto); config.hookVideoMaxSemana inválido → error", () => {
  const { root, dir, p } = semanaTemporal();
  try {
    for (const x of p.piezas.filter((x: any) => x.formato === "reel").slice(0, 2)) {
      const b = JSON.parse(readFileSync(join(dir, x.borrador), "utf8"));
      writeFileSync(join(dir, x.borrador), JSON.stringify({ ...b, hookVideo: HOOK_VIDEO }));
    }
    const sinClave = { ...config };
    delete sinClave.hookVideoMaxSemana;
    assertHas(validarSemana(dir, sinClave, { score: () => 90 }), /2 reels con hookVideo \(máximo 1/);
    assertNone(validarSemana(dir, { ...config, hookVideoMaxSemana: 2 }, { score: () => 90 }).filter((e) => /hookVideo/.test(e)));
    assertHas(validarConfig({ ...config, hookVideoMaxSemana: -1 }), /hookVideoMaxSemana/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("calendario/validar: ventanaMedicion y semanasExperimento son opcionales y se validan si vienen", () => {
  // La plantilla trae la fase de alcance bajo (72 h, 2 semanas); 7d y 4 también valen.
  assert.deepEqual(CONFIG_BASE.ventanaMedicion.valor, "72h");
  assert.equal(CONFIG_BASE.semanasExperimento.valor, 2);
  assertNone(validarConfig({ ...CONFIG_BASE, ventanaMedicion: "7d", semanasExperimento: 4 }));
  assertNone(validarConfig({ ...CONFIG_BASE, ventanaMedicion: { valor: "72h", respaldo: "base" }, semanasExperimento: { valor: 2, respaldo: "supuesto" } }));
  assertHas(validarConfig({ ...CONFIG_BASE, ventanaMedicion: "3d" }), /ventanaMedicion/);
  assertHas(validarConfig({ ...CONFIG_BASE, semanasExperimento: 0 }), /semanasExperimento/);
  assertHas(validarConfig({ ...CONFIG_BASE, semanasExperimento: { valor: 2.5 } }), /semanasExperimento/);
});

// --- pivote 2026-10-17: narración, Screen, voz y series ---

check("calendario/validar: narracion — obligatoria en cada escena del reel desde 2026-10-19, 3–24 palabras, nunca en carrusel", () => {
  const antes = vb(); // semana 2026-10-12: aún no se exige
  assertNone(antes);
  const p19 = pieza({ dia: "2026-10-19" });
  const faltan = vb(p19, borrador());
  assert.equal(faltan.filter((e: string) => /falta narracion/.test(e)).length, 4, "una por slide");
  const b = borrador();
  b.slides.forEach((s: any) => (s.narracion = "Esto lo hace NotebookLM solo, con tus apuntes."));
  assertHas(vb(p19, b), /slide 1 \(Hook\): falta resultado/);
  Object.assign(b.slides[0].props, { app: "NotebookLM", modo: "respuesta", resultado: "Resumen en audio listo: 10 minutos." });
  assertNone(vb(p19, b));
  const corta = clone(b);
  corta.slides[1].narracion = "Sube todo";
  assertHas(vb(p19, corta), /slide 2 \(Step\): narracion tiene 2 palabras/);
  const larga = clone(b);
  larga.slides[2].narracion = Array.from({ length: 25 }, (_, i) => `palabra${i}`).join(" ");
  assertHas(vb(p19, larga), /narracion tiene 25 palabras/);
  const nfd = clone(b);
  nfd.slides[0].narracion = "Sube tus apuntes y la IA te explica cada página".normalize("NFD");
  assertHas(vb(p19, nfd), /narracion no está en Unicode NFC/);
  const vacia = clone(b);
  vacia.slides[0].narracion = "   ";
  assertHas(vb(p19, vacia), /narracion debe ser un texto no vacío/);
  // Carrusel: narracion es error aunque sea válida.
  const carrusel = pieza({ formato: "carrusel", arquetipo: "lista", dia: "2026-10-20", id: "mar-carrusel-x", borrador: "mar-carrusel-x.json" });
  const bc = clone(b);
  bc.name = "mar-carrusel-x";
  delete bc.pace;
  delete bc.audio;
  assertHas(vb(carrusel, bc), /narracion solo va en reels/);
});

check("calendario/validar: narracion alarga la escena como el motor (voz + margen) y cuenta para el tope de duración", () => {
  const b = borrador();
  const base = segundosEscenas(b.slides, "ensenar");
  b.slides[1].narracion = Array.from({ length: 24 }, () => "palabra").join(" "); // 24 / 2,9 + 0,3 = 8,58 s + 0,75
  const con = segundosEscenas(b.slides, "ensenar");
  assert.equal(con[0], base[0]);
  assert.equal(con[1], +(Math.max(base[1], 24 / 2.9 + 0.3 + 0.75)).toFixed(2));
  assert.ok(con[1] > base[1]);
  assert.equal(con[2], base[2]);
  // Coincide con el motor: specTiming con esas narraciones.
  const spec = { name: "x", pace: "ensenar" as const, slides: b.slides.map((s: any) => ({ template: Step, props: s.props })) };
  const motor = specTiming(spec, { narracion: [undefined, 24 / 2.9 + 0.3, undefined, undefined] }).scenes.map((s) => s.dur);
  assert.deepEqual(con.map((x: number) => +x.toFixed(1)), motor.map((x) => +x.toFixed(1)));
  // Tope: con narraciones largas en gancho el reel de 20 s no cabe.
  const p = pieza({ dia: "2026-10-19", parametros: { ...clone(PARAMETROS), ritmoReel: "gancho", duracionMaxSegundos: 20 } });
  const g = borrador();
  g.pace = "gancho";
  Object.assign(g.slides[0].props, { app: "NotebookLM", resultado: "Resumen en audio listo." });
  g.slides.forEach((s: any) => (s.narracion = Array.from({ length: 24 }, () => "palabra").join(" ")));
  assertHas(vb(p, g), /el reel dura .* y el tope es 20 s/);
});

check("calendario/validar: Screen — plantilla del catálogo con app, prompt y respuesta; el lector frío ve Tú/IA y oye la voz", () => {
  assert.deepEqual(CATALOGO.Screen, { required: ["app", "prompt", "respuesta"], optional: ["heading", "nota"] });
  const p19 = pieza({ dia: "2026-10-19" });
  const b = borrador();
  b.slides.splice(2, 0, {
    template: "Screen",
    props: { app: "NotebookLM", prompt: "Resume estos 6 PDFs en un podcast corto", respuesta: "Listo: resumen en audio de 10 minutos con las ideas clave." },
  });
  b.slides.forEach((s: any) => (s.narracion = "Le escribes esto y te contesta con el audio listo."));
  Object.assign(b.slides[0].props, { app: "NotebookLM", resultado: "Resumen en audio listo." });
  assertNone(vb(p19, b));
  const sinApp = clone(b);
  delete sinApp.slides[2].props.app;
  assertHas(vb(p19, sinApp), /slide 3 \(Screen\): falta app/);
  const t = textosLector(b, "reel");
  assert.ok(t.completo.includes("Tú: Resume estos 6 PDFs en un podcast corto"));
  assert.ok(t.completo.includes("NotebookLM: Listo: resumen en audio"));
  assert.ok(t.conPrisa.includes("Tú: Resume estos 6 PDFs"), "con prisa también ve el prompt");
  assert.ok(t.completo.includes("Voz: «Le escribes esto y te contesta con el audio listo.»"));
  assert.ok(t.conPrisa.includes("Voz: «"), "con prisa también oye la voz");
  assert.ok(!textosLector(b, "carrusel").completo.includes("Voz:"), "el carrusel no tiene voz");
});

check("calendario/validar: config.voz es una voz de Kokoro o false; serie de la pieza es un slug", () => {
  assertNone(validarConfig({ ...CONFIG_BASE, voz: "ef_dora" }));
  assertNone(validarConfig({ ...CONFIG_BASE, voz: false }));
  assertHas(validarConfig({ ...CONFIG_BASE, voz: "onyx" }), /voz "onyx" inválida/);
  assertHas(validarConfig({ ...CONFIG_BASE, voz: true }), /voz/);
  assertNone(validarPieza(pieza({ serie: "hazlo-con-ia" }), config));
  assertNone(validarPieza(pieza({ serie: null }), config));
  assertHas(validarPieza(pieza({ serie: "Hazlo con IA" }), config), /serie debe ser un slug/);
});

check("calendario/validar: Hook — resultado en el primer cuadro: obligatorio en reels desde 2026-10-19, con app, ≤ 20 palabras, modo aviso|respuesta; el lector lo ve", () => {
  const p19 = pieza({ dia: "2026-10-19" });
  const b = borrador();
  b.slides.forEach((s: any) => (s.narracion = "Esto lo hace NotebookLM solo, con tus apuntes."));
  const sinApp = clone(b);
  sinApp.slides[0].props.resultado = "Podcast listo.";
  assertHas(vb(p19, sinApp), /con resultado va app/);
  const largo = clone(b);
  Object.assign(largo.slides[0].props, { app: "NotebookLM", resultado: Array.from({ length: 21 }, () => "x").join(" ") });
  assertHas(vb(p19, largo), /resultado tiene 21 palabras/);
  const modo = clone(b);
  Object.assign(modo.slides[0].props, { app: "NotebookLM", resultado: "Listo.", modo: "ventana" });
  assertHas(vb(p19, modo), /modo "ventana" inválido/);
  // Antes del 2026-10-19 y en carrusel no se exige, pero si viene se valida.
  assertNone(vb());
  const carrusel = pieza({ formato: "carrusel", arquetipo: "lista", dia: "2026-10-20", id: "mar-carrusel-x", borrador: "mar-carrusel-x.json" });
  const bc = borrador();
  bc.name = "mar-carrusel-x";
  delete bc.pace;
  delete bc.audio;
  assert.deepEqual(vb(carrusel, bc).filter((e: string) => /resultado/.test(e)), []);
  Object.assign(bc.slides[0].props, { app: "NotebookLM", resultado: "Podcast listo: 10 minutos.", modo: "aviso" });
  assertNone(vb(carrusel, bc));
  const t = textosLector(bc, "carrusel");
  assert.ok(t.conPrisa.includes("NotebookLM (aviso, ahora): Podcast listo: 10 minutos."), "con prisa ve la tarjeta de resultado");
});

// --- hook con candidatos y juez (desde DESDE_CALIDAD) ---

const PAT = ["en-juego", "error-comun", "dato-contrario", "antes-despues"];
function candidatos(n: number, patrones = PAT): any[] {
  return Array.from({ length: n }, (_, i) => ({ patron: patrones[i % patrones.length], title: `Candidato número ${i + 1} del hook`, subtitle: `Subtítulo ${i + 1}` }));
}
function piezaJuez(over: Record<string, unknown> = {}, hookOver: Record<string, unknown> = {}): any {
  const cands = candidatos(8);
  return pieza({
    dia: "2026-10-27",
    hook: { categoria: "en-juego", texto: cands[2].title, score: 9, candidatos: cands, juez: { elegido: 3, nota: 9, respuestas: "{}" }, ...hookOver },
    ...over,
  });
}
const soloHook = (errs: string[]) => errs.filter((e) => /hook|candidat|juez/i.test(e));

check("hook-juez: DESDE_CALIDAD y PATRONES_HOOK son los de la spec", () => {
  assert.equal(DESDE_CALIDAD, "2026-10-26");
  assert.deepEqual(PATRONES_HOOK, ["en-juego", "error-comun", "dato-contrario", "antes-despues", "pregunta-del-jefe", "resultado"]);
});

check("hook-juez: una pieza con 8 candidatos de 4 patrones y juez coherente no da errores de hook", () => {
  assertNone(soloHook(validarPieza(piezaJuez(), config)));
  assertNone(erroresDeHookJuez(piezaJuez()));
});

check("hook-juez: 7 candidatos → error de 8 a 10", () => {
  const p = piezaJuez();
  p.hook.candidatos = candidatos(7);
  p.hook.texto = p.hook.candidatos[2].title;
  assertHas(validarPieza(p, config), /8 a 10 candidatos/);
  p.hook.candidatos = candidatos(11);
  assertHas(validarPieza(p, config), /8 a 10 candidatos/);
});

check("hook-juez: 9 candidatos de 2 patrones → al menos 3 patrones", () => {
  const p = piezaJuez();
  p.hook.candidatos = candidatos(9, ["en-juego", "resultado"]);
  p.hook.texto = p.hook.candidatos[2].title;
  assertHas(validarPieza(p, config), /al menos 3 patrones/);
});

check("hook-juez: patrón fuera de PATRONES_HOOK → error con la lista", () => {
  const p = piezaJuez();
  p.hook.candidatos[0].patron = "gancho";
  assertHas(validarPieza(p, config), /PATRONES_HOOK|en-juego, error-comun/);
});

check("hook-juez: hook.score debe ser la nota del juez", () => {
  const p = piezaJuez({}, { score: 8, juez: { elegido: 3, nota: 9, respuestas: "{}" } });
  assertHas(validarPieza(p, config), /hook\.score debe ser la nota del juez/);
});

check("hook-juez: elegido inválido o hook.texto distinto del candidato elegido → error", () => {
  const a = piezaJuez();
  a.hook.juez.elegido = 12;
  assertHas(validarPieza(a, config), /elegido/);
  const b = piezaJuez();
  b.hook.texto = "Otro texto cualquiera";
  assertHas(validarPieza(b, config), /hook\.texto/);
});

check("hook-juez: faltan candidatos o juez → error", () => {
  const p = piezaJuez();
  delete p.hook.candidatos;
  assertHas(validarPieza(p, config), /candidatos/);
  const q2 = piezaJuez();
  delete q2.hook.juez;
  assertHas(validarPieza(q2, config), /juez/);
});

check("hook-juez: el Hook del borrador debe coincidir con el candidato elegido (title, subtitle, resultado)", () => {
  const p = piezaJuez();
  const b = borrador();
  b.slides[0].props = { title: p.hook.candidatos[2].title, subtitle: "Subtítulo 3", highlight: "hook", app: "NotebookLM", resultado: "Listo.", modo: "aviso" };
  assert.deepEqual(soloHook(vb(p, b)).filter((e) => /candidato elegido/.test(e)), []);
  b.slides[0].props.title = "Convierte 6 PDFs en un podcast";
  const e1 = vb(p, b).filter((e) => /candidato elegido/.test(e));
  assert.ok(e1.some((e) => e.includes("Convierte 6 PDFs en un podcast") && e.includes(p.hook.candidatos[2].title)), JSON.stringify(e1));
  b.slides[0].props.title = p.hook.candidatos[2].title;
  b.slides[0].props.subtitle = "Otro subtítulo";
  const e2 = vb(p, b).filter((e) => /candidato elegido/.test(e));
  assert.ok(e2.some((e) => e.includes("Otro subtítulo") && e.includes("Subtítulo 3")), JSON.stringify(e2));
  delete b.slides[0].props.subtitle;
  assert.ok(vb(p, b).some((e) => /candidato elegido/.test(e)), "falta subtitle del candidato");
  // resultado del candidato
  p.hook.candidatos[2].resultado = "Podcast listo.";
  b.slides[0].props.subtitle = "Subtítulo 3";
  assert.ok(vb(p, b).some((e) => /candidato elegido.*resultado|resultado.*candidato elegido/.test(e)));
});

check("hook-juez: antes de DESDE_CALIDAD el hook se valida como siempre (sin candidatos ni juez)", () => {
  const p = pieza({ dia: "2026-10-20" });
  assertNone(soloHook(validarPieza(p, config)));
  assert.deepEqual(vb(p).filter((e) => /candidato|juez/.test(e)), []);
});

check("hook-juez: mensajeJuez enumera los candidatos sin patrón", () => {
  const cands = [
    { patron: "en-juego", title: "Tu equipo ya usa IA mejor que tú", subtitle: "Y no lo dice", resultado: "Informe listo." },
    { patron: "error-comun", title: "El error que cuesta horas" },
  ];
  const m = mensajeJuez("## Para el juez\nPerfil.", cands);
  assert.ok(m.includes("1. ") && m.includes("2. "));
  for (const c of cands) assert.ok(m.includes(c.title));
  assert.ok(m.includes("Y no lo dice") && m.includes("Informe listo."));
  assert.ok(!/patron/i.test(m) && !m.includes("en-juego") && !m.includes("error-comun"));
});

check("hook-juez: elegido es 1-based (0 → error; N → ok; N+1 → error)", () => {
  const p = piezaJuez();
  const n = p.hook.candidatos.length;
  p.hook.juez.elegido = 0;
  assertHas(validarPieza(p, config), /elegido/);
  p.hook.juez.elegido = n;
  p.hook.texto = p.hook.candidatos[n - 1].title;
  assertNone(soloHook(validarPieza(p, config)));
  p.hook.juez.elegido = n + 1;
  assertHas(validarPieza(p, config), /elegido/);
});

check("hook-juez: borde de fecha — 2026-10-26 exige candidatos y juez; 2026-10-25 no", () => {
  const sin = (dia: string) => { const p = pieza({ dia }); return soloHook(validarPieza(p, config)); };
  assertHas(sin("2026-10-26"), /candidatos/);
  assertNone(sin("2026-10-25"));
});
