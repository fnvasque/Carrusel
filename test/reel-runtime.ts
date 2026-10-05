import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildReelPage } from "../src/reel/page.ts";
import { reelTiming, specDurations } from "../src/reel/timing.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { FORMATS } from "../src/templates/types.ts";
import spec from "../carousels/_smoke-plantillas.ts";

/**
 * Prueba el runtime del reel en Chromium real (sin ffmpeg): duración, movimiento
 * desde el cuadro 0 y tiempos del hook (titular completo a 1.2 s, palabra clave
 * en acento a 1.5 s). Uso: npm run test:reel
 */
const timing = reelTiming(specDurations(spec));
const html = await buildReelPage(spec, timing);
const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({ viewport: FORMATS.reel });
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => (window as any).__reelReady === true);
  const errors = await page.evaluate(() => (window as any).__reelErrors as string[]);
  assert.deepEqual(errors, [], "errores del runtime");
  assert.deepEqual(consoleErrors, [], "errores de consola");

  const duration = await page.evaluate(() => (window as any).__reel.duration as number);
  assert.ok(Math.abs(duration - timing.total) <= 1 / timing.fps, `duración ${duration} vs ${timing.total}`);

  const wordOpacities = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      return Array.from(document.querySelectorAll('[data-scene="0"] h1 .reel-word')).map((w) => Number(getComputedStyle(w).opacity));
    }, t);
  const at0 = await wordOpacities(0);
  assert.ok(at0.length > 0, "el titular se dividió en palabras");
  assert.ok(at0.some((o) => o < 1), "hay movimiento en el cuadro 0");
  const at12 = await wordOpacities(1.2);
  assert.ok(at12.every((o) => o === 1), `titular completo a 1.2 s: ${at12}`);

  const pop = await page.evaluate(() => {
    (window as any).__reel.seek(1.5);
    const el = document.querySelector('[data-scene="0"] [data-anim="pop"]') as HTMLElement;
    const probe = document.createElement("span");
    probe.style.color = el.dataset.accent!;
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return { now: getComputedStyle(el).color, accent };
  });
  assert.equal(pop.now, pop.accent, "palabra clave en acento a 1.5 s");

  // Al final, la última escena visible y la primera oculta.
  const vis = await page.evaluate((t) => {
    (window as any).__reel.seek(t);
    const s = Array.from(document.querySelectorAll("[data-scene]")) as HTMLElement[];
    return s.map((el) => getComputedStyle(el).visibility);
  }, timing.total);
  assert.equal(vis[vis.length - 1], "visible");
  assert.equal(vis[0], "hidden");

  // Volviendo atrás (tras haber visto el final): justo antes de que entre la
  // escena 1, la escena está oculta y sus entradas en estado inicial; ya en su
  // transición, las entradas aún no muestran su estado final.
  const s1 = timing.scenes[1];
  const scene1 = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      const scene = document.querySelector('[data-scene="1"]') as HTMLElement;
      const anims = Array.from(scene.querySelectorAll('[data-anim="rise"], .reel-word')) as HTMLElement[];
      return { visibility: getComputedStyle(scene).visibility, opacities: anims.map((a) => Number(getComputedStyle(a).opacity)) };
    }, t);
  const before = await scene1(s1.start - 0.05);
  assert.equal(before.visibility, "hidden", "escena 1 oculta antes de su entrada");
  assert.ok(before.opacities.length > 0 && before.opacities.every((o) => o === 0), `entradas de la escena 1 en 0 antes de empezar: ${before.opacities}`);
  const entering = await scene1(s1.start + timing.transition / 2);
  assert.ok(entering.opacities.every((o) => o === 0), `entradas de la escena 1 aún en 0 al empezar: ${entering.opacities}`);
  const settled = await scene1(s1.start + timing.transition / 2 + s1.budget + 0.05);
  assert.ok(settled.opacities.every((o) => o === 1), `entradas de la escena 1 completas dentro del presupuesto: ${settled.opacities}`);

  // El prompt (type) conserva su salto de línea y corta entre palabras.
  const typed = await page.evaluate((t) => {
    (window as any).__reel.seek(t);
    const el = document.querySelector('[data-anim="type"]') as HTMLElement;
    return { br: el.querySelectorAll("br").length, wordsWrapped: el.querySelectorAll("div > div").length > 0 };
  }, timing.total);
  assert.ok(typed.br > 0, "el salto de línea del prompt se conserva como <br>");
  assert.ok(typed.wordsWrapped, "el prompt se divide en palabras y caracteres");
  console.log(`✓ runtime del reel OK (${timing.scenes.length} escenas, ${timing.total}s)`);
} finally {
  await browser.close();
}
