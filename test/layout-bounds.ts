import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { htmlShell } from "../src/render/htmlShell.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { Hook, Lead, Step, Stat, Prompt, MythReality, Cta } from "../src/templates/index.ts";
import { FORMATS, type CarouselSpec, type Format } from "../src/templates/types.ts";
import { REEL_SAFE_BOTTOM } from "../src/templates/layout.ts";
import smoke from "../carousels/_smoke-plantillas.ts";
import estudiar from "../carousels/estudiar-3-ias.ts";
import mentiras from "../carousels/mentiras-ia.ts";
import video3 from "../carousels/video-3-segundos.ts";
import escalera from "../carousels/escalera-dopamina.ts";
import voz from "../carousels/voz-subtitulos-gratis.ts";

/**
 * Límites del layout en Chromium real (sin ffmpeg), en post y reel: ningún
 * texto se sale del lienzo ni de los márgenes laterales, ninguno entra en la
 * zona segura inferior del reel (440 px), el contenido no pisa la fuente al pie
 * ni la cabecera, y nada se desborda (scrollWidth). Incluye casos de estrés
 * (5 viñetas largas, valor de Stat largo no numérico, fuente de 2 líneas,
 * prompt largo, mito largo) y los carruseles de carousels/. En el reel, además,
 * el bloque de contenido de los 3 carruseles de contenido debe quedar centrado
 * (±12 % del alto útil). `LAYOUT_DEBUG=1` imprime centro y relleno por slide.
 * Uso: npm run test:reel
 */

const LONG = "Una viñeta larga de verdad, con bastante texto para ocupar dos líneas";
const SRC2 = "Fuente: un informe con un nombre muy largo, publicado por una organización con un nombre igual de largo, 2026";

const stress: { name: string; template: ComponentType<any>; props: Record<string, unknown> }[] = [
  { name: "step-5-viñetas-largas", template: Step, props: { pillar: "herramienta", index: 3, total: 8, step: "01", heading: "Cinco cosas que revisar antes de publicar", highlight: "revisar", bullets: [LONG, LONG, LONG, LONG, LONG], source: SRC2 } },
  { name: "step-cuerpo-y-viñetas", template: Step, props: { index: 4, total: 8, step: "02", heading: "Cuerpo y lista", body: "Un cuerpo de dos líneas largas que acompaña a la lista de viñetas de abajo, para probar el alto.", bullets: [LONG, LONG, LONG], source: "Fuente: X" } },
  { name: "stat-no-numérico-largo", template: Stat, props: { index: 5, total: 8, value: "1 de cada 3 personas", label: "deja el video antes del segundo 3", context: "Un contexto de una o dos líneas que explica de dónde sale el dato y cómo usarlo.", source: SRC2 } },
  { name: "stat-porcentaje", template: Stat, props: { index: 5, total: 8, value: "47%", label: "del valor llega en los primeros 3 segundos", context: "Contexto breve.", source: "Fuente: Meta / Nielsen" } },
  { name: "prompt-largo", template: Prompt, props: { index: 6, total: 8, heading: "Úsalo de checklist", prompt: "Revisa este guion con la escalera de la dopamina:\n1. ¿Qué estimula en los primeros 2 segundos?\n2. ¿Qué pregunta abre?\n3. ¿Dónde está el pico de anticipación?\n4. ¿Qué respuesta no obvia entrega?\n5. ¿Qué cambia al final?\n[pega tu guion]", note: "Copia y pega. Empieza clavando los 4 primeros niveles.", source: SRC2 } },
  { name: "mito-largo", template: MythReality, props: { index: 7, total: 8, mythLabel: "Ojo Nº1", myth: "La API de Whisper va a estar disponible para siempre y sin cambios", reality: "whisper-1 se apaga en febrero de 2027; el modelo local sigue", source: SRC2 } },
  { name: "lead-largo", template: Lead, props: { kicker: "En una frase", text: "Una frase larga de contexto que explica la promesa del carrusel con bastante detalle para ocupar varias líneas.", highlight: "promesa" } },
  { name: "hook-mark", template: Hook, props: { eyebrow: "Herramientas", title: "Subtitula y narra gratis, sin salir de tu PC", highlight: "gratis", mark: "tu PC", subtitle: "Whisper y Kokoro, en local." } },
  { name: "cta-emoji", template: Cta, props: { title: "Guárdalo antes de editar", highlight: "Guárdalo", reason: "Tu checklist para los primeros 3 segundos.", handle: "ia.punto.es", cta: "Guardar 🔖" } },
];

/** Problemas de límites del slide renderizado en `page`. */
async function problems(page: Page, format: Format): Promise<string[]> {
  return page.evaluate(({ h, reel, safe }) => {
    const out: string[] = [];
    const src = document.querySelector('[data-brand="source"]');
    const srcTop = src ? src.getBoundingClientRect().top : Infinity;
    const header = document.querySelector('[data-brand="label"]')?.parentElement;
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    const limit = reel ? h - safe : h;
    document.querySelectorAll("body *").forEach((el) => {
      const e = el as HTMLElement;
      const hasText = Array.from(e.childNodes).some((c) => c.nodeType === 3 && c.textContent!.trim());
      if (!hasText) return;
      const r = e.getBoundingClientRect();
      const t = (e.textContent ?? "").slice(0, 30);
      const brand = e.closest("[data-brand]");
      if (r.bottom > limit + 1) out.push(`bajo el límite (${Math.round(r.bottom)} > ${limit}): "${t}"`);
      if (r.top < 0 || r.left < 60 || r.right > 1080 - 60) out.push(`fuera de márgenes (${Math.round(r.left)}-${Math.round(r.right)}, top ${Math.round(r.top)}): "${t}"`);
      if (!brand && r.bottom > srcTop + 1) out.push(`pisa la fuente al pie (${Math.round(r.bottom)} > ${Math.round(srcTop)}): "${t}"`);
      if (!brand && r.top < headerBottom - 1) out.push(`pisa la cabecera (${Math.round(r.top)} < ${Math.round(headerBottom)}): "${t}"`);
      if (getComputedStyle(e).display !== "inline" && e.scrollWidth > e.clientWidth + 1) out.push(`desborde horizontal: "${t}"`);
    });
    return out;
  }, { h: FORMATS[format].height, reel: format === "reel", safe: REEL_SAFE_BOTTOM });
}

/** Fondos `ai` → color plano: el layout no depende del fondo y así no se llama a la API. */
function offline(props: Record<string, any>): Record<string, any> {
  return props.background && "ai" in props.background ? { ...props, background: { color: "#06060A" } } : props;
}

const cases: { name: string; template: ComponentType<any>; props: Record<string, unknown> }[] = [...stress];
for (const spec of [smoke, estudiar, mentiras, video3, escalera, voz] as CarouselSpec[]) {
  spec.slides.forEach((s, i) => cases.push({ name: `${spec.name} #${i + 1}`, template: s.template, props: offline({ ...spec.defaults, ...s.props }) }));
}

/**
 * Reel: centro vertical del bloque de contenido (unión de los hijos del
 * contenedor de la plantilla) y del área útil (bajo la cabecera, sobre la
 * fuente al pie o la zona segura). Devuelve el desvío relativo al alto útil.
 */
async function centerOffset(page: Page): Promise<{ offset: number; fill: number }> {
  return page.evaluate((safe) => {
    const root = document.querySelector("[data-content] > div")!;
    const rects = Array.from(root.children).map((c) => c.getBoundingClientRect()).filter((r) => r.height > 0);
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const header = document.querySelector('[data-brand="logo"]')!.parentElement!.getBoundingClientRect().bottom;
    const src = document.querySelector('[data-brand="source"]');
    const floor = src ? src.getBoundingClientRect().top : 1920 - safe;
    const usable = floor - header;
    return { offset: ((top + bottom) / 2 - (header + floor) / 2) / usable, fill: (bottom - top) / usable };
  }, REEL_SAFE_BOTTOM);
}

const browser = await chromium.launch({ executablePath: findChromium() });
const all: string[] = [];
try {
  for (const format of ["post", "reel"] as const) {
    const page = await browser.newPage({ viewport: FORMATS[format] });
    for (const c of cases) {
      await page.setContent(await htmlShell(renderToStaticMarkup(createElement(c.template, { ...c.props, format }))));
      await page.evaluate(() => document.fonts.ready);
      for (const p of await problems(page, format)) all.push(`${format} ${c.name}: ${p}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(all, [], `problemas de límites:\n${all.join("\n")}`);

// Reel: el bloque de contenido queda centrado (±12 % del alto útil) en los 3
// carruseles de contenido. Se informa también cuánto del alto útil ocupa.
const offCenter: string[] = [];
const fills: number[] = [];
const browser2 = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser2.newPage({ viewport: FORMATS.reel });
  for (const spec of [video3, escalera, voz] as CarouselSpec[]) {
    for (const [i, s] of spec.slides.entries()) {
      const props = offline({ ...spec.defaults, ...s.props, format: "reel" });
      await page.setContent(await htmlShell(renderToStaticMarkup(createElement(s.template, props))));
      await page.evaluate(() => document.fonts.ready);
      const { offset, fill } = await centerOffset(page);
      fills.push(fill);
      if (process.env.LAYOUT_DEBUG) console.log(`${spec.name} #${i + 1}: centro ${(offset * 100).toFixed(1)} %, ocupa ${(fill * 100).toFixed(0)} %`);
      if (Math.abs(offset) > 0.12) offCenter.push(`${spec.name} #${i + 1}: centro desviado ${(offset * 100).toFixed(1)} % (ocupa ${(fill * 100).toFixed(0)} %)`);
    }
  }
  await page.close();
} finally {
  await browser2.close();
}
assert.deepEqual(offCenter, [], `bloques descentrados en el reel:\n${offCenter.join("\n")}`);
const avg = fills.reduce((a, b) => a + b, 0) / fills.length;
console.log(`✓ reel: bloque centrado (±12 %) en ${fills.length} slides; ocupa en promedio ${(avg * 100).toFixed(0)} % del alto útil (mín ${(Math.min(...fills) * 100).toFixed(0)} %)`);
console.log(`✓ límites del layout OK (${cases.length} slides × post/reel, incluye 5 viñetas largas y Stat no numérico largo)`);
