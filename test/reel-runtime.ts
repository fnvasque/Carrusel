import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { buildReelPage } from "../src/reel/page.ts";
import { createElement } from "react";
import { specTiming, BULLET_LEAD, HOOK_MAX_SECONDS, type ReelTiming } from "../src/reel/timing.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { FORMATS, type CarouselSpec, type Pace } from "../src/templates/types.ts";
import { forceCaretsOn } from "../src/reel/capture.ts";
import { Stat, Step, Hook } from "../src/templates/index.ts";
import { parseStatValue } from "../src/templates/Stat.tsx";
import spec from "../carousels/_smoke-plantillas.ts";
import estudiar from "../carousels/estudiar-3-ias.ts";
import mentiras from "../carousels/mentiras-ia.ts";

/**
 * Prueba el runtime del reel en Chromium real (sin ffmpeg): duración, hook
 * legible desde el cuadro 0 (acercamiento 1.04 → 1 y palabra clave en acento
 * antes de 0.6 s), deriva de la grilla, barra de progreso, count / check /
 * caret, tachado por línea y que SplitText no cambie el corte de líneas; todo
 * determinista con seek hacia adelante y atrás. Los tiempos del motor original
 * se prueban con pace "rapido" explícito; el ritmo "ensenar" (por defecto) se
 * prueba aparte (hook, bullets cada 1.8 s, ✓ en sincronía, entradas más lentas).
 * Uso: npm run test:reel
 */

/** Fondos `ai` → color plano: el layout no depende del fondo y así no se llama a la API. */
function offline(s: CarouselSpec): CarouselSpec {
  const flat = (p: Record<string, any> = {}) => ("background" in p && p.background && "ai" in p.background ? { ...p, background: { color: "#0B1020" } } : p);
  return { ...s, defaults: flat(s.defaults as any), slides: s.slides.map((sl) => ({ ...sl, props: flat(sl.props as any) })) } as CarouselSpec;
}

/** Abre la página del reel de `s` (con `pace` / `seconds` si se dan) y espera al runtime sin errores. */
async function open(browser: Browser, s: CarouselSpec, pace?: Pace, seconds?: number): Promise<{ page: Page; timing: ReelTiming }> {
  const timing = specTiming(s, { pace, seconds });
  const html = await buildReelPage(offline(s), timing);
  const page = await browser.newPage({ viewport: FORMATS.reel });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
    if (m.type() === "warning" && /desconocido/.test(m.text())) consoleErrors.push(m.text());
  });
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
      hook: (el as HTMLElement).dataset.reelHook === "1",
      split: el.querySelectorAll(".reel-word").length > 0,
      text: (el.textContent ?? "").slice(0, 40),
    }));
  }, total);
  assert.ok(rows.length > 0, `${name}: hay bloques words`);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.h0), `${name}: altura previa registrada ("${r.text}")`);
    // El titular del hook (escena 0) no se divide: entra completo.
    if (r.hook) assert.ok(!r.split && Math.abs(r.h - r.h0) <= 1, `${name}: el hook no se divide ("${r.text}")`);
    else if (r.fallback) assert.equal(r.split, false, `${name}: el respaldo deshace el split ("${r.text}")`);
    else assert.ok(r.split && Math.abs(r.h - r.h0) <= 1, `${name}: el split no cambia la altura (${r.h0} → ${r.h}, "${r.text}")`);
  }
  return { split: rows.filter((r) => !r.fallback && !r.hook).length, fallback: rows.filter((r) => r.fallback).length };
}

/** Estado del titular del hook (escena 0) en el segundo `t`. */
function hookState(page: Page, t: number) {
  return page.evaluate((x) => {
    (window as any).__reel.seek(x);
    const h1 = document.querySelector('[data-scene="0"] h1') as HTMLElement;
    const pop = h1.querySelector('[data-anim="pop"]') as HTMLElement;
    const probe = document.createElement("span");
    probe.style.color = pop.dataset.accent!;
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      split: h1.querySelectorAll(".reel-word").length,
      opacity: Number(getComputedStyle(h1).opacity),
      visibility: getComputedStyle(h1).visibility,
      scale: new DOMMatrix(getComputedStyle(h1).transform).a,
      pop: getComputedStyle(pop).color,
      accent,
      parent: getComputedStyle(h1).color,
    };
  }, t);
}

/**
 * Metas del hook (en ambos ritmos): titular completo y legible en el cuadro 0
 * (sin dividir en palabras) con el acercamiento ya en 1.04, cuadro 0 no vacío
 * y palabra clave en acento antes de 0.6 s.
 */
async function hookGoals(page: Page, label: string): Promise<void> {
  const h0 = await hookState(page, 0);
  assert.equal(h0.split, 0, `${label}: el titular del hook no se divide en palabras`);
  assert.deepEqual([h0.opacity, h0.visibility], [1, "visible"], `${label}: titular completo y visible en el cuadro 0`);
  assert.ok(Math.abs(h0.scale - 1.04) < 1e-3, `${label}: titular a 1.04 en el cuadro 0: ${h0.scale}`);
  assert.equal(h0.pop, h0.parent, `${label}: palabra clave aún en el color del titular en el cuadro 0`);
  // Miniatura: el cuadro 0 no sale vacío.
  const visible0 = await page.evaluate(() => {
    (window as any).__reel.seek(0);
    return Array.from(document.querySelectorAll('[data-scene="0"] [data-anim]'))
      .filter((el) => getComputedStyle(el).visibility === "visible" && Number(getComputedStyle(el).opacity) > 0 && el.getBoundingClientRect().height > 0).length;
  });
  assert.ok(visible0 > 0, `${label}: el cuadro 0 muestra al menos un elemento (miniatura no vacía)`);
  const h06 = await hookState(page, 0.59);
  assert.equal(h06.pop, h06.accent, `${label}: palabra clave en acento antes de 0.6 s`);
}

/**
 * Bullets de un checklist (escena `scene`): segundo del primer cuadro en que
 * cada bullet y su ✓ empiezan a verse, recorriendo la escena cuadro a cuadro.
 */
async function bulletStarts(page: Page, timing: ReelTiming, scene: number): Promise<{ li: number; check: number }[]> {
  const sc = timing.scenes[scene];
  const starts: { li: number; check: number }[] = [];
  for (let k = Math.floor(sc.start * timing.fps); k / timing.fps <= sc.start + sc.dur; k++) {
    const t = k / timing.fps;
    const rows = await page.evaluate(
      ([x, i]) => {
        (window as any).__reel.seek(x);
        return Array.from(document.querySelectorAll(`[data-scene="${i}"] li`)).map((li) => ({
          li: Number(getComputedStyle(li).opacity),
          check: new DOMMatrix(getComputedStyle(li.querySelector('[data-anim="check"]')!).transform).a,
        }));
      },
      [t, scene] as const,
    );
    rows.forEach((r, j) => {
      starts[j] ??= { li: NaN, check: NaN };
      if (Number.isNaN(starts[j].li) && r.li > 0) starts[j].li = t;
      if (Number.isNaN(starts[j].check) && r.check > 0) starts[j].check = t;
    });
  }
  return starts;
}

/** Cada ✓ empieza con su bullet: después de él y a lo sumo CHECK_DELAY (× lentitud) + 1 cuadro. */
function assertChecksInSync(starts: { li: number; check: number }[], slow: number, fps: number, label: string): void {
  assert.ok(starts.length >= 2, `${label}: hay bullets`);
  starts.forEach((st, j) => {
    assert.ok(Number.isFinite(st.li) && Number.isFinite(st.check), `${label}: bullet ${j} y su ✓ aparecen: ${JSON.stringify(st)}`);
    const d = st.check - st.li;
    assert.ok(d >= 0 && d <= 0.1 * slow + 1 / fps + 1e-6, `${label}: ✓ ${j} empieza con su bullet (Δ ${d.toFixed(3)} s)`);
  });
}

/**
 * Estado del DOM en `t` (count + barra, ✓, cursor) y el mismo estado tras
 * saltar al final y volver a `t`: deben ser idénticos (seek determinista a
 * mitad de una animación).
 */
async function assertSeekStable(page: Page, total: number, t: number, selector: string, label: string): Promise<void> {
  const read = (x: number) =>
    page.evaluate(
      ([x, sel]) => {
        (window as any).__reel.seek(x);
        return Array.from(document.querySelectorAll(sel)).map((el) => {
          const cs = getComputedStyle(el);
          return { text: el.textContent, width: (el as HTMLElement).getBoundingClientRect().width, transform: cs.transform, opacity: cs.opacity, visibility: cs.visibility };
        });
      },
      [x, selector] as const,
    );
  const first = await read(t);
  assert.ok(first.length > 0, `${label}: hay elementos (${selector})`);
  await page.evaluate((x) => (window as any).__reel.seek(x), total);
  assert.deepEqual(await read(t), first, `${label}: mismo estado en t=${t.toFixed(2)} tras ir al final y volver`);
}

/**
 * Barra del Stat (escena `scene`) en sincronía con la cuenta: en cada cuadro
 * de la escena, ancho de la barra / ancho final ≈ número mostrado / valor
 * (±3 %); vacía con el número en 0 y completa con el texto final.
 */
async function assertMeterSync(page: Page, timing: ReelTiming, scene: number, label: string): Promise<void> {
  const sc = timing.scenes[scene];
  let mid = 0;
  for (let k = Math.ceil(sc.start * timing.fps); k / timing.fps < sc.start + sc.dur - timing.transition; k++) {
    const r = await page.evaluate(
      ([x, i]) => {
        (window as any).__reel.seek(x);
        const el = document.querySelector(`[data-scene="${i}"] [data-anim="count"]`) as HTMLElement;
        const track = document.querySelector(`[data-scene="${i}"] [data-meter]`) as HTMLElement;
        const fill = track.firstElementChild as HTMLElement;
        return {
          text: el.textContent!,
          raw: el.dataset.reelCount!,
          fill: fill.getBoundingClientRect().width,
          final: (track.getBoundingClientRect().width * parseFloat(fill.dataset.reelWidth!)) / 100,
        };
      },
      [k / timing.fps, scene] as const,
    );
    const shown = parseStatValue(r.text)!.number;
    const value = parseStatValue(r.raw)!.number;
    const ratio = r.fill / r.final;
    if (shown === 0) assert.ok(ratio < 0.03, `${label}: barra vacía con el número en 0 (${ratio.toFixed(3)})`);
    else if (r.text === r.raw) assert.ok(ratio > 0.97, `${label}: barra completa con el número final (${ratio.toFixed(3)})`);
    else {
      mid++;
      assert.ok(Math.abs(ratio - shown / value) <= 0.03, `${label}: barra ${ratio.toFixed(3)} vs número ${shown}/${value} (t=${(k / timing.fps).toFixed(2)})`);
    }
  }
  assert.ok(mid >= 10, `${label}: se recorren cuadros a mitad de la cuenta (${mid})`);
}

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const { page, timing } = await open(browser, spec, "rapido");

  const duration = await page.evaluate(() => (window as any).__reel.duration as number);
  assert.ok(Math.abs(duration - timing.total) <= 1 / timing.fps, `duración ${duration} vs ${timing.total}`);

  // Hook (escena 0): metas del cuadro 0 y palabra clave en acento antes de 0.6 s.
  await hookGoals(page, "rapido");
  const hook = (t: number) => hookState(page, t);

  // La escala del titular decrece en cada cuadro (estrictamente los primeros
  // 0.6 s) hasta 1.2 s y queda en 1, también tras haber visto el final (seek hacia atrás).
  await page.evaluate((t) => (window as any).__reel.seek(t), timing.total);
  const scales: number[] = [];
  for (let k = 0; k <= Math.round(1.2 * timing.fps); k++) scales.push((await hook(k / timing.fps)).scale);
  assert.ok(Math.abs(scales[0] - 1.04) < 1e-3, `titular a 1.04 en el cuadro 0 tras volver atrás: ${scales[0]}`);
  assert.ok(Math.abs(scales[scales.length - 1] - 1) < 1e-4, `titular a 1 a 1.2 s: ${scales[scales.length - 1]}`);
  // Estricto en los primeros 0.6 s (al final el power2.out cae bajo la precisión del transform calculado).
  scales.forEach((v, k) => {
    if (k === 0) return;
    if (k <= 0.6 * timing.fps) assert.ok(v < scales[k - 1], `la escala del titular no decrece en el cuadro ${k}: ${scales[k - 1]} → ${v}`);
    else assert.ok(v <= scales[k - 1], `la escala del titular crece en el cuadro ${k}: ${scales[k - 1]} → ${v}`);
  });
  const back = await hook(0);
  assert.equal(back.pop, back.parent, "la palabra clave vuelve al color del titular al volver a 0");

  // Grilla: deriva diagonal continua (x sube, y baja) igual en todas las
  // escenas, envuelta dentro de una celda y determinista hacia atrás.
  const grid = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      return Array.from(document.querySelectorAll("[data-grid]")).map((g) => {
        const m = new DOMMatrix(getComputedStyle(g).transform);
        return { x: m.e, y: m.f, cell: parseFloat(getComputedStyle(g).backgroundSize) };
      });
    }, t);
  const g0 = await grid(0);
  assert.ok(g0.length === timing.scenes.length, `una grilla por escena: ${g0.length}`);
  assert.ok(g0.every((g) => g.x === 0 && g.y === 0), `grilla sin desplazar en el cuadro 0: ${JSON.stringify(g0)}`);
  const g1 = await grid(1);
  assert.ok(g1.every((g) => g.x === g1[0].x && g.y === g1[0].y), "todas las grillas se mueven igual");
  assert.ok(g1[0].x > 0 && g1[0].y < 0 && Math.abs(g1[0].x + g1[0].y) < 1e-3, `deriva diagonal: ${g1[0].x}, ${g1[0].y}`);
  const gEnd = await grid(timing.total);
  assert.ok(gEnd.every((g) => g.x >= 0 && g.x < g.cell && g.y <= 0 && g.y > -g.cell), "la deriva queda dentro de una celda (sin bordes vacíos)");
  const g1b = await grid(1);
  assert.deepEqual(g1b, g1, "grilla determinista al volver atrás");

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

  // count (Stat, escena 3): 0 al empezar, cuenta y termina en el texto exacto;
  // al volver atrás, vuelve a 0.
  const s3 = timing.scenes[3];
  const count = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      return (document.querySelector('[data-scene="3"] [data-anim="count"]') as HTMLElement).textContent;
    }, t);
  const countStart = await count(s3.start + timing.transition / 2);
  const countMid = await count(s3.start + timing.transition / 2 + 0.25);
  const countEnd = await count(s3.start + s3.dur - timing.transition);
  assert.equal(countStart, "0%", "el número parte en 0");
  assert.ok(/^\d+%$/.test(countMid!) && Number(countMid!.slice(0, -1)) > 0 && Number(countMid!.slice(0, -1)) < 47, `el número está contando: ${countMid}`);
  assert.equal(countEnd, "47%", "el número llega exactamente al texto original");
  assert.equal(await count(timing.total), "47%", "el número queda en el original al final del reel");
  assert.equal(await count(s3.start - 0.05), "0%", "el número vuelve a 0 al volver atrás");

  // check (Step, escena 2): cada ✓ en 0 antes de que entre su bullet, en 1 al
  // final de la escena, y de nuevo en 0 al volver atrás.
  const s2 = timing.scenes[2];
  const checks = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      return Array.from(document.querySelectorAll('[data-scene="2"] li')).map((li) => {
        const c = li.querySelector('[data-anim="check"]') as HTMLElement;
        return { li: Number(getComputedStyle(li).opacity), scale: new DOMMatrix(getComputedStyle(c).transform).a };
      });
    }, t);
  const cEnd = await checks(s2.start + s2.dur - timing.transition);
  assert.ok(cEnd.length >= 2 && cEnd.every((c) => c.li === 1 && Math.abs(c.scale - 1) < 1e-4), `✓ visibles al final de la escena: ${JSON.stringify(cEnd)}`);
  // Recorre la escena cuadro a cuadro: mientras un bullet no empezó a entrar, su ✓ está en 0.
  for (let t = s2.start; t < s2.start + s2.dur; t += 1 / timing.fps) {
    for (const c of await checks(t)) if (c.li === 0) assert.equal(c.scale, 0, `✓ oculto antes de su bullet (t=${t.toFixed(2)})`);
  }
  const cBack = await checks(s2.start - 0.05);
  assert.ok(cBack.every((c) => c.li === 0 && c.scale === 0), "los ✓ vuelven a 0 al volver atrás");

  // caret (Prompt, escena 4): oculto mientras se escribe; al terminar parpadea
  // on/off cada 0.5 s (15 cuadros) hasta el fin de la escena.
  const s4 = timing.scenes[4];
  const caret = (t: number) =>
    page.evaluate((x) => {
      (window as any).__reel.seek(x);
      const type = document.querySelector('[data-scene="4"] [data-anim="type"]') as HTMLElement;
      const c = type.querySelector('[data-anim="caret"]') as HTMLElement;
      const chars = Array.from(type.querySelectorAll("div > div > div, div > div")).filter((d) => !d.querySelector("div") && d.textContent);
      return { on: getComputedStyle(c).visibility === "visible", chars: chars.length, typed: chars.every((d) => Number(getComputedStyle(d).opacity) === 1) };
    }, t);
  const states: boolean[] = [];
  for (let k = Math.ceil(s4.start * timing.fps); k / timing.fps < s4.start + s4.dur; k++) {
    const st = await caret(k / timing.fps);
    assert.ok(st.chars > 20, `se encuentran los caracteres del prompt: ${st.chars}`);
    if (st.on) assert.ok(st.typed, `cursor encendido solo con el prompt ya escrito (t=${(k / timing.fps).toFixed(2)})`);
    states.push(st.on);
  }
  assert.equal(states[0], false, "cursor oculto al empezar la escena");
  const runs: { on: boolean; n: number }[] = [];
  for (const on of states) {
    if (runs.length && runs[runs.length - 1].on === on) runs[runs.length - 1].n++;
    else runs.push({ on, n: 1 });
  }
  assert.ok(runs.filter((r) => r.on).length >= 2, `el cursor parpadea: ${JSON.stringify(runs)}`);
  runs.slice(1, -1).forEach((r) => assert.ok(Math.abs(r.n - 0.5 * timing.fps) <= 1, `tramo del parpadeo de ${r.n} cuadros (≈ 15): ${JSON.stringify(runs)}`));
  assert.equal((await caret(s4.start - 0.05)).on, false, "cursor oculto al volver atrás");
  // Tomas fijas (--frames-only): con el cursor apagado en el instante de la toma, forceCaretsOn lo enciende.
  {
    const offK = states.findIndex((on, k) => k > 0 && !on && states[k - 1] !== undefined);
    assert.ok(offK > 0, "hay un instante con el cursor apagado");
    const tOff = Math.ceil(s4.start * timing.fps) / timing.fps + offK / timing.fps;
    assert.equal((await caret(tOff)).on, false, "el cursor está apagado en ese instante");
    await forceCaretsOn(page);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-scene="4"] [data-anim="caret"]')!).visibility), "visible", "forceCaretsOn enciende el cursor");
  }
  // La barra del Stat se llena en sincronía con la cuenta.
  await assertMeterSync(page, timing, 3, "rapido");
  // Cada ✓ empieza con su bullet (misma fuente de escalonado).
  const rapidBullets = await bulletStarts(page, timing, 2);
  assertChecksInSync(rapidBullets, 1, timing.fps, "rapido");
  // Seek determinista a mitad de count (+ barra), de un ✓ y del parpadeo del cursor.
  await assertSeekStable(page, timing.total, s3.start + timing.transition / 2 + 0.4, '[data-scene="3"] [data-anim="count"], [data-scene="3"] [data-meter] > div', "count rapido");
  await assertSeekStable(page, timing.total, rapidBullets[1].check + 0.1, '[data-scene="2"] li, [data-scene="2"] [data-anim="check"]', "check rapido");
  await assertSeekStable(page, timing.total, s4.start + s4.dur - timing.transition - 0.25, '[data-scene="4"] [data-anim="caret"]', "caret rapido");
  console.log("✓ count, check y caret: estados correctos y deterministas con seek (también a mitad de la animación)");
  console.log("✓ barra del Stat en sincronía con la cuenta; cada ✓ empieza con su bullet");

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
  // count con prefijos, sufijos, miles y decimales: texto final idéntico y
  // valores intermedios con el mismo formato; lo ambiguo ("1 de 3") no cuenta.
  const values: [string, RegExp | null][] = [
    ["$1.200/mes", /^\$(\d{1,3}(\.\d{3})*)\/mes$/],
    ["3,5×", /^\d,\d×$/],
    ["$25K", /^\$\d+K$/],
    ["12.5%", /^\d+\.\d%$/],
    ["1 de 3", null],
  ];
  const statSpec: CarouselSpec = {
    name: "_count",
    slides: values.map(([value]) => ({ template: Stat, props: { value, label: "Dato de prueba" } })),
  } as CarouselSpec;
  {
    const { page: p, timing: t } = await open(browser, statSpec, "rapido");
    for (let i = 0; i < values.length; i++) {
      const [value, mid] = values[i];
      const sc = t.scenes[i];
      const text = (x: number) =>
        p.evaluate(([x, i]) => {
          (window as any).__reel.seek(x);
          return (document.querySelector(`[data-scene="${i}"] [data-anim="count"]`) as HTMLElement).textContent;
        }, [x, i] as const);
      const m = await text(sc.start + t.transition / 2 + 0.3);
      if (mid) assert.ok(mid.test(m!) && m !== value, `"${value}" contando con su formato: ${m}`);
      else assert.equal(m, value, `"${value}" no cuenta`);
      assert.equal(await text(sc.start + sc.dur - t.transition), value, `"${value}" termina idéntico`);
    }
    await p.close();
  }
  console.log("✓ count: prefijos, sufijos, miles y decimales; lo ambiguo no cuenta");
  console.log(`✓ SplitText respeta el corte de líneas (${splits.join("; ")})`);
  console.log("✓ tachado: una barra por línea del mito");

  // Paridad: countFormat (runtime) y parseStatValue (Stat.tsx) leen igual el
  // número, el prefijo y el sufijo; lo que el runtime no cuenta es no numérico
  // o ambiguo (dígitos en el sufijo).
  {
    const { page: p } = await open(browser, statSpec, "rapido");
    const raws = ["47%", "$1.200/mes", "3,5×", "$25K", "12.5%", "1 de 3", "-12%", "+40%", "8×", "1.000.000", "0,75", "2026", "$20", "abc", "x10", "100%"];
    const fmts = await p.evaluate((vs) =>
      vs.map((v) => {
        const f = (window as any).__reelCountFormat(v);
        return f ? { value: f.value as number, zero: f.text(0) as string, end: f.text(f.value) as string } : null;
      }), raws);
    raws.forEach((raw, i) => {
      const parsed = parseStatValue(raw);
      const f = fmts[i];
      if (!f) {
        assert.ok(parsed === null || /\d/.test(parsed.suffix), `"${raw}": el runtime no cuenta solo si no es numérico o es ambiguo`);
        return;
      }
      assert.ok(parsed, `"${raw}": parseStatValue también lo lee`);
      assert.equal(f.value, parsed!.number, `"${raw}": mismo número`);
      assert.equal(f.end, raw.trim(), `"${raw}": el valor final se escribe idéntico`);
      assert.ok(f.zero.startsWith(parsed!.prefix) && f.zero.endsWith(parsed!.suffix), `"${raw}": mismo prefijo y sufijo (${f.zero})`);
    });
    await p.close();
  }
  console.log("✓ paridad countFormat (runtime) ↔ parseStatValue (Stat.tsx)");

  // Hook: solo el primer words de la escena 0 (el titular) recibe el trato de
  // hook; otro words en la misma escena entra palabra por palabra.
  {
    const Two = () =>
      createElement(
        "div",
        { style: { padding: 120, color: "#F4F4F6", fontSize: 96 } },
        createElement("h1", { "data-anim": "words", style: { margin: 0 } }, "Titular del hook"),
        createElement("h2", { "data-anim": "words", style: { margin: 0, fontSize: 64 } }, "Segundo bloque normal"),
      );
    const twoSpec = { name: "_hook-uno", slides: [{ template: Two, props: {} }, { template: Two, props: {} }] } as unknown as CarouselSpec;
    for (const pace of ["rapido", "ensenar"] as const) {
      const { page: p } = await open(browser, twoSpec, pace);
      const r = await p.evaluate(() => {
        (window as any).__reel.seek(0);
        const [h1, h2] = Array.from(document.querySelectorAll('[data-scene="0"] [data-anim="words"]')) as HTMLElement[];
        return {
          h1: { hook: h1.dataset.reelHook, words: h1.querySelectorAll(".reel-word").length, opacity: Number(getComputedStyle(h1).opacity) },
          h2: { hook: h2.dataset.reelHook, words: Array.from(h2.querySelectorAll(".reel-word")).map((w) => Number(getComputedStyle(w).opacity)) },
          scene1: Array.from(document.querySelectorAll('[data-scene="1"] [data-anim="words"]')).map((e) => (e as HTMLElement).dataset.reelHook ?? null),
        };
      });
      assert.deepEqual(r.h1, { hook: "1", words: 0, opacity: 1 }, `${pace}: el titular (primer words) es el hook`);
      assert.equal(r.h2.hook, undefined, `${pace}: el segundo words no es hook`);
      assert.ok(r.h2.words.length === 3 && r.h2.words.every((o) => o === 0), `${pace}: el segundo words entra palabra por palabra: ${r.h2.words}`);
      assert.deepEqual(r.scene1, [null, null], `${pace}: fuera de la escena 0 no hay hook`);
      await p.close();
    }
  }
  console.log("✓ el trato de hook solo aplica al titular (primer words de la escena 0)");

  // Un Hook fuera de la escena 0: la caja rosa (`mark`) no aparece antes de su palabra.
  {
    const markSpec = {
      name: "_hook-mark",
      slides: [
        { template: Hook, props: { title: "Primero", highlight: "Primero" } },
        { template: Hook, props: { title: "Nada de esto es gratis", highlight: "Nada", mark: "gratis" } },
      ],
    } as unknown as CarouselSpec;
    for (const pace of ["rapido", "ensenar"] as const) {
      const { page: p, timing: t } = await open(browser, markSpec, pace);
      const sc = t.scenes[1];
      const alpha = (x: number) =>
        p.evaluate((x) => {
          (window as any).__reel.seek(x);
          const mk = document.querySelector('[data-scene="1"] [data-mark]') as HTMLElement;
          const m = getComputedStyle(mk).backgroundColor.match(/[\d.]+/g)!.map(Number);
          return m.length > 3 ? m[3] : 1;
        }, x);
      assert.equal(await alpha(sc.start + t.transition / 2 + 0.01), 0, `${pace}: la caja rosa está oculta antes de su palabra`);
      assert.equal(await alpha(sc.start + sc.dur - t.transition), 1, `${pace}: la caja rosa se ve completa al final`);
      await p.close();
    }
  }
  console.log("✓ la caja rosa del Hook entra junto con su palabra");

  // La cuenta no alarga las entradas: en un Stat con etiqueta corta la sub no
  // incluye los 1.2 s de la cuenta, así etiqueta y contexto no se comprimen por
  // ella; la cuenta igual termina en su valor.
  {
    const short = {
      name: "_count-budget",
      slides: [
        { template: Hook, props: { title: "Un dato", highlight: "dato" } },
        { template: Stat, props: { value: "47%", label: "Dato corto" } },
        { template: Stat, props: { value: "47%", label: "Dato corto", context: "Contexto en una frase." } },
      ],
    } as unknown as CarouselSpec;
    for (const [pace, seconds] of [["rapido", 2.4], ["ensenar", undefined]] as const) {
      const { page: p, timing: t } = await open(browser, short, pace, seconds);
      for (const i of [1, 2]) {
        const sc = t.scenes[i];
        const r = await p.evaluate((i) => {
          const s = document.querySelector(`[data-scene="${i}"]`) as HTMLElement;
          return { natural: Number(s.dataset.reelNatural), scale: Number(s.dataset.reelScale) };
        }, i);
        const slow = t.entranceSlow;
        const expected = r.natural * slow > sc.budget ? r.natural / sc.budget : 1 / slow;
        assert.ok(Math.abs(r.scale - expected) < 1e-3, `${pace}: escala de la escena ${i} = ${r.scale} (esperada ${expected})`);
        // Sin contexto, las entradas duran menos que la cuenta: la sub no la incluye.
        if (i === 1) assert.ok(r.natural < 1.2, `${pace}: la cuenta no alarga las entradas (natural ${r.natural})`);
        // Etiqueta y contexto completos en offset + natural / escala.
        const settled = sc.start + t.transition / 2 + r.natural / r.scale + 0.05;
        const ops = await p.evaluate(([x, i]) => {
          (window as any).__reel.seek(x);
          return Array.from(document.querySelectorAll(`[data-scene="${i}"] .reel-word, [data-scene="${i}"] p[data-anim="rise"]`)).map((e) => Number(getComputedStyle(e).opacity));
        }, [settled, i] as const);
        assert.ok(ops.length > 0 && ops.every((o) => o === 1), `${pace}: etiqueta/contexto de la escena ${i} completos a tiempo: ${ops}`);
        const end = await p.evaluate(([x, i]) => {
          (window as any).__reel.seek(x);
          return document.querySelector(`[data-scene="${i}"] [data-anim="count"]`)!.textContent;
        }, [sc.start + sc.dur - t.transition, i] as const);
        assert.equal(end, "47%", `${pace}: la cuenta termina en su valor antes de salir de la escena ${i}`);
      }
      await p.close();
    }
  }
  console.log("✓ la cuenta del Stat no comprime etiqueta ni contexto");

  // Ritmo enseñar (por defecto): metas del hook, entradas 1.3× más lentas salvo
  // la escena 0, bullets uno cada 1.8 s sin comprimir con su ✓ en sincronía,
  // barra del Stat en sincronía y seek determinista.
  {
    const { page: p, timing: t } = await open(browser, spec);
    assert.equal(t.pace, "ensenar");
    const duration = await p.evaluate(() => (window as any).__reel.duration as number);
    assert.ok(Math.abs(duration - t.total) <= 1 / t.fps, `ensenar: duración ${duration} vs ${t.total}`);
    await hookGoals(p, "ensenar");
    assert.ok(t.scenes[0].dur <= HOOK_MAX_SECONDS, `ensenar: el hook dura ≤ ${HOOK_MAX_SECONDS} s: ${t.scenes[0].dur}`);
    const scales = await p.evaluate(() =>
      Array.from(document.querySelectorAll("[data-scene]")).map((s) => ({ natural: Number((s as HTMLElement).dataset.reelNatural), scale: Number((s as HTMLElement).dataset.reelScale) })),
    );
    scales.forEach((r, i) => {
      const slow = i === 0 ? 1 : t.entranceSlow;
      const expected = r.natural * slow > t.scenes[i].budget ? r.natural / t.scenes[i].budget : 1 / slow;
      assert.ok(Math.abs(r.scale - expected) < 1e-3, `ensenar: escala de la escena ${i} = ${r.scale} (esperada ${expected})`);
    });
    assert.ok(scales[0].scale >= 1, "ensenar: la escena 0 no se hace más lenta");
    assert.ok(scales.slice(1).some((r) => Math.abs(r.scale - 1 / t.entranceSlow) < 1e-3), `ensenar: hay escenas con entradas ${t.entranceSlow}× más lentas: ${JSON.stringify(scales)}`);

    // Bullets (Step, escena 2): uno cada 1.8 s (±1 cuadro), ✓ con su bullet,
    // y el último entra con tiempo para leerlo antes de la salida.
    const s2 = t.scenes[2];
    assert.ok(s2.dur >= BULLET_LEAD + t.stagger + t.bulletTail - 1e-9, `ensenar: la escena de bullets dura lo de la fórmula: ${s2.dur}`);
    const starts = await bulletStarts(p, t, 2);
    for (let j = 1; j < starts.length; j++) {
      const gap = starts[j].li - starts[j - 1].li;
      assert.ok(Math.abs(gap - t.stagger) <= 1 / t.fps + 1e-6, `ensenar: bullet ${j} entra ${t.stagger} s después del anterior (${gap.toFixed(3)})`);
    }
    assertChecksInSync(starts, t.entranceSlow, t.fps, "ensenar");
    const lastIn = starts[starts.length - 1].li + 0.45 * t.entranceSlow;
    assert.ok(s2.start + s2.dur - t.transition - lastIn >= 1, `ensenar: el último bullet queda ≥ 1 s a la vista (${(s2.start + s2.dur - t.transition - lastIn).toFixed(2)} s)`);

    await assertMeterSync(p, t, 3, "ensenar");
    const s3 = t.scenes[3];
    const s4 = t.scenes[4];
    await assertSeekStable(p, t.total, s3.start + t.transition / 2 + 0.5, '[data-scene="3"] [data-anim="count"], [data-scene="3"] [data-meter] > div', "count ensenar");
    await assertSeekStable(p, t.total, starts[1].check + 0.1, '[data-scene="2"] li, [data-scene="2"] [data-anim="check"]', "check ensenar");
    await assertSeekStable(p, t.total, s4.start + s4.dur - t.transition - 0.25, '[data-scene="4"] [data-anim="caret"]', "caret ensenar");
    await p.close();

    // Escena de bullets ajustada (la duración la fija la fórmula): el último
    // bullet entra a más tardar BULLET_TAIL (2.5 s) antes del fin de la escena,
    // manteniendo 1.8 s entre bullets.
    const tight = {
      name: "_bullets-justos",
      slides: [
        { template: Hook, props: { title: "Cuatro pasos", highlight: "pasos" } },
        { template: Step, props: { step: "01", heading: "Haz esto", highlight: "esto", bullets: ["Uno corto", "Dos corto", "Tres corto", "Cuatro corto"] } },
        { template: Hook, props: { title: "Fin del reel", highlight: "Fin" } },
      ],
    } as unknown as CarouselSpec;
    const { page: q, timing: tq } = await open(browser, tight);
    const sq = tq.scenes[1];
    assert.equal(sq.dur, +(BULLET_LEAD + tq.stagger * 3 + tq.bulletTail).toFixed(2), "ensenar: la duración de la escena la fija la fórmula de bullets");
    const tq1 = await bulletStarts(q, tq, 1);
    for (let j = 1; j < tq1.length; j++) assert.ok(Math.abs(tq1[j].li - tq1[j - 1].li - tq.stagger) <= 1 / tq.fps + 1e-6, `ensenar (justo): bullet ${j} a ${tq.stagger} s del anterior`);
    const lastStart = tq1[tq1.length - 1].li;
    assert.ok(sq.start + sq.dur - lastStart >= tq.bulletTail - 1 / tq.fps, `ensenar (justo): quedan ≥ ${tq.bulletTail} s tras el último bullet (${(sq.start + sq.dur - lastStart).toFixed(2)})`);
    assertChecksInSync(tq1, tq.entranceSlow, tq.fps, "ensenar (justo)");
    await q.close();

    // --seconds más corto que lo que piden los bullets: el intervalo se acorta
    // (≥ 0.6 s) y el último bullet entra entero antes de la salida de la escena.
    const { page: r, timing: tr } = await open(browser, tight, "ensenar", 4);
    const sr = tr.scenes[1];
    const tr1 = await bulletStarts(r, tr, 1);
    const gaps = tr1.slice(1).map((b, j) => b.li - tr1[j].li);
    assert.ok(gaps.every((g) => g < tr.stagger && g >= 0.6 - 1 / tr.fps && Math.abs(g - gaps[0]) <= 1 / tr.fps + 1e-6), `--seconds corto: intervalo acortado y parejo: ${gaps.map((g) => g.toFixed(3))}`);
    assertChecksInSync(tr1, tr.entranceSlow, tr.fps, "--seconds corto");
    const exitAt = sr.start + sr.dur - tr.transition;
    const lis = await r.evaluate((x) => {
      (window as any).__reel.seek(x);
      return Array.from(document.querySelectorAll('[data-scene="1"] li')).map((li) => Number(getComputedStyle(li).opacity));
    }, exitAt);
    assert.ok(lis.length === 4 && lis.every((o) => o === 1), `--seconds corto: todos los bullets enteros antes de la salida: ${lis}`);
    await r.close();
    console.log(`✓ ritmo ensenar: hook intacto, entradas 1.3× más lentas, bullets cada 1.8 s con su ✓, barra en sincronía (${t.total}s)`);
  }

  // Logo tardío (logoEnCuadro0: false): el wordmark de la escena 0 está oculto
  // hasta los 3 s y entra en 0.4 s; por defecto se ve desde el cuadro 0.
  {
    const logoSpec = (late: boolean) =>
      ({
        name: "_logo-tardio",
        slides: [
          { template: Hook, props: { title: "Logo después del hook", highlight: "Logo", ...(late ? { logoEnCuadro0: false } : {}) } },
          { template: Hook, props: { title: "Segunda escena del reel", highlight: "escena", ...(late ? { logoEnCuadro0: false } : {}) } },
        ],
      }) as unknown as CarouselSpec;
    const logoAt = (p: Page, t: number) =>
      p.evaluate((x) => {
        (window as any).__reel.seek(x);
        const logo = document.querySelector('[data-scene="0"] [data-brand="logo"]') as HTMLElement;
        return { opacity: Number(getComputedStyle(logo).opacity), late: logo.getAttribute("data-anim") === "late" };
      }, t);
    const { page: d } = await open(browser, logoSpec(false));
    const d0 = await logoAt(d, 0);
    assert.deepEqual(d0, { opacity: 1, late: false }, "por defecto, wordmark visible en el cuadro 0");
    await d.close();
    const { page: l } = await open(browser, logoSpec(true));
    await hookGoals(l, "logo tardío");
    for (const t of [0, 1.5, 2.95]) assert.equal((await logoAt(l, t)).opacity, 0, `logo tardío: oculto a los ${t} s`);
    const mid = (await logoAt(l, 3.2)).opacity;
    assert.ok(mid > 0 && mid < 1, `logo tardío: entrando a los 3.2 s (${mid})`);
    assert.equal((await logoAt(l, 3.45)).opacity, 1, "logo tardío: completo a los 3.4 s");
    assert.equal((await logoAt(l, 0)).opacity, 0, "logo tardío: seek hacia atrás lo vuelve a ocultar");
    await l.close();
    console.log("✓ logo tardío: wordmark oculto hasta 3 s, entra en 0.4 s; por defecto desde el cuadro 0");
  }
} finally {
  await browser.close();
}
