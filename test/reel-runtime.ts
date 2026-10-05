import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { buildReelPage } from "../src/reel/page.ts";
import { reelTiming, specDurations } from "../src/reel/timing.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { FORMATS, type CarouselSpec } from "../src/templates/types.ts";
import spec from "../carousels/_smoke-plantillas.ts";
import estudiar from "../carousels/estudiar-3-ias.ts";
import mentiras from "../carousels/mentiras-ia.ts";

/**
 * Prueba el runtime del reel en Chromium real (sin ffmpeg): duración, contenido
 * y movimiento desde el cuadro 0, tiempos del hook (titular completo a 1.2 s,
 * palabra clave en acento a 1.5 s, escala que solo crece), barra de progreso,
 * tachado por línea y que SplitText no cambie el corte de líneas.
 * Uso: npm run test:reel
 */

/** Fondos `ai` → color plano: el layout no depende del fondo y así no se llama a la API. */
function offline(s: CarouselSpec): CarouselSpec {
  const flat = (p: Record<string, any> = {}) => ("background" in p && p.background && "ai" in p.background ? { ...p, background: { color: "#0B1020" } } : p);
  return { ...s, defaults: flat(s.defaults as any), slides: s.slides.map((sl) => ({ ...sl, props: flat(sl.props as any) })) } as CarouselSpec;
}

/** Abre la página del reel de `s` y espera al runtime sin errores. */
async function open(browser: Browser, s: CarouselSpec): Promise<{ page: Page; timing: ReturnType<typeof reelTiming> }> {
  const timing = reelTiming(specDurations(s));
  const html = await buildReelPage(offline(s), timing);
  const page = await browser.newPage({ viewport: FORMATS.reel });
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => (window as any).__reelReady === true);
  const errors = await page.evaluate(() => (window as any).__reelErrors as string[]);
  assert.deepEqual(errors, [], `errores del runtime (${s.name})`);
  assert.deepEqual(consoleErrors, [], `errores de consola (${s.name})`);
  return { page, timing };
}

/**
 * Tras dividir con SplitText, cada bloque `words` mantiene la altura del post
 * (mismo corte de líneas) o cayó al respaldo sin dividir. Devuelve cuántos.
 */
async function checkSplitHeights(page: Page, total: number, name: string): Promise<{ split: number; fallback: number }> {
  const rows = await page.evaluate((t) => {
    (window as any).__reel.seek(t);
    return Array.from(document.querySelectorAll('[data-anim="words"]')).map((el) => ({
      h0: Number((el as HTMLElement).dataset.reelH0),
      h: el.getBoundingClientRect().height,
      fallback: (el as HTMLElement).dataset.reelSplitFallback === "1",
      split: el.querySelectorAll(".reel-word").length > 0,
      text: (el.textContent ?? "").slice(0, 40),
    }));
  }, total);
  assert.ok(rows.length > 0, `${name}: hay bloques words`);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.h0), `${name}: altura previa registrada ("${r.text}")`);
    if (r.fallback) assert.equal(r.split, false, `${name}: el respaldo deshace el split ("${r.text}")`);
    else assert.ok(r.split && Math.abs(r.h - r.h0) <= 1, `${name}: el split no cambia la altura (${r.h0} → ${r.h}, "${r.text}")`);
  }
  return { split: rows.filter((r) => !r.fallback).length, fallback: rows.filter((r) => r.fallback).length };
}

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const { page, timing } = await open(browser, spec);

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
  // Miniatura: el cuadro 0 no sale vacío (el hook arranca adelantado).
  const visible0 = await page.evaluate(() => {
    (window as any).__reel.seek(0);
    return Array.from(document.querySelectorAll('[data-scene="0"] [data-anim="rise"], [data-scene="0"] .reel-word'))
      .map((el) => Number(getComputedStyle(el).opacity))
      .filter((o) => o > 0).length;
  });
  assert.ok(visible0 > 0, "el cuadro 0 muestra al menos un elemento (miniatura no vacía)");
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

  // La escala de la palabra clave nunca decrece de 0 a 1.6 s (sin saltos),
  // también tras haber visto el final (seek hacia atrás).
  await page.evaluate((t) => (window as any).__reel.seek(t), timing.total);
  const scales: number[] = [];
  for (let k = 0; k <= Math.round(1.6 * timing.fps); k++) {
    scales.push(await page.evaluate((x) => {
      (window as any).__reel.seek(x);
      const w = document.querySelector('[data-scene="0"] [data-anim="pop"] .reel-word') as HTMLElement;
      return new DOMMatrix(getComputedStyle(w).transform).a;
    }, k / timing.fps));
  }
  assert.ok(Math.abs(scales[0] - 0.9) < 1e-3, `palabra clave a 0.9 en el cuadro 0: ${scales[0]}`);
  assert.ok(Math.abs(scales[scales.length - 1] - 1) < 1e-3, `palabra clave a 1 a 1.6 s: ${scales[scales.length - 1]}`);
  scales.forEach((v, k) => { if (k > 0) assert.ok(v >= scales[k - 1] - 1e-6, `escala de la palabra clave decrece en el cuadro ${k}: ${scales[k - 1]} → ${v}`); });

  // Barra de progreso: lineal de 0 a 100% del ancho en todo el reel.
  const progress = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      const r = document.querySelector("[data-reel-progress]")!.getBoundingClientRect();
      return { w: r.width, top: r.top, h: r.height };
    }, t);
  const p0 = await progress(0);
  const pMid = await progress(timing.total / 2);
  const pEnd = await progress(timing.total);
  assert.equal(p0.w, 0, "barra de progreso vacía en el cuadro 0");
  assert.ok(Math.abs(pMid.w - FORMATS.reel.width / 2) <= 1, `barra a la mitad a mitad del reel: ${pMid.w}`);
  assert.ok(Math.abs(pEnd.w - FORMATS.reel.width) <= 1, `barra completa al final: ${pEnd.w}`);
  assert.deepEqual([pEnd.top, pEnd.h], [0, 8], "barra de 8 px en el borde superior");

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
  const smokeSplit = await checkSplitHeights(page, timing.total, spec.name);
  await page.close();
  console.log(`✓ runtime del reel OK (${timing.scenes.length} escenas, ${timing.total}s)`);

  // SplitText no cambia el corte de líneas (o el bloque cae al respaldo).
  const splits = [`${spec.name}: ${smokeSplit.split} divididos, ${smokeSplit.fallback} respaldo`];
  for (const s of [estudiar, mentiras]) {
    const { page: p, timing: t } = await open(browser, s);
    const r = await checkSplitHeights(p, t.total, s.name);
    splits.push(`${s.name}: ${r.split} divididos, ${r.fallback} respaldo`);

    // Tachado: una barra por línea del mito, centrada en la línea y de su ancho.
    const strikes = await p.evaluate((x) => {
      (window as any).__reel.seek(x);
      return Array.from(document.querySelectorAll('[data-anim="strike"]')).map((m) => {
        const wrap = m.parentElement!;
        const range = document.createRange();
        range.selectNodeContents(wrap.querySelector("p")!);
        const lines = Array.from(range.getClientRects()).map((r) => ({ mid: (r.top + r.bottom) / 2, left: r.left, width: r.width }));
        const bars = Array.from(wrap.querySelectorAll("[data-reel-strike]")).map((b) => {
          const r = b.getBoundingClientRect();
          return { mid: (r.top + r.bottom) / 2, left: r.left, width: r.width };
        });
        return { markerHidden: getComputedStyle(m).display === "none", lines, bars };
      });
    }, t.total);
    for (const st of strikes) {
      assert.ok(st.markerHidden, `${s.name}: el marcador strike queda oculto`);
      assert.equal(st.bars.length, st.lines.length, `${s.name}: una barra por línea (${st.lines.length})`);
      st.bars.forEach((b, j) => {
        const l = st.lines[j];
        assert.ok(Math.abs(b.mid - l.mid) <= 2 && Math.abs(b.left - l.left) <= 2 && Math.abs(b.width - l.width) <= 2, `${s.name}: barra ${j} sobre su línea`);
      });
    }
    if (s === mentiras) assert.ok(strikes.some((st) => st.lines.length >= 2), "mentiras-ia tiene un mito de 2+ líneas");
    await p.close();
  }
  console.log(`✓ SplitText respeta el corte de líneas (${splits.join("; ")})`);
  console.log("✓ tachado: una barra por línea del mito");
} finally {
  await browser.close();
}
