import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { buildReelPage } from "../src/reel/page.ts";
import { reelTiming, specDurations } from "../src/reel/timing.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { FORMATS, type CarouselSpec } from "../src/templates/types.ts";
import { Stat } from "../src/templates/index.ts";
import spec from "../carousels/_smoke-plantillas.ts";
import estudiar from "../carousels/estudiar-3-ias.ts";
import mentiras from "../carousels/mentiras-ia.ts";

/**
 * Prueba el runtime del reel en Chromium real (sin ffmpeg): duración, hook
 * legible desde el cuadro 0 (acercamiento 1.04 → 1 y palabra clave en acento
 * antes de 0.6 s), deriva de la grilla, barra de progreso, count / check /
 * caret, tachado por línea y que SplitText no cambie el corte de líneas; todo
 * determinista con seek hacia adelante y atrás.
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

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const { page, timing } = await open(browser, spec);

  const duration = await page.evaluate(() => (window as any).__reel.duration as number);
  assert.ok(Math.abs(duration - timing.total) <= 1 / timing.fps, `duración ${duration} vs ${timing.total}`);

  // Hook (escena 0): titular completo y legible en el cuadro 0 (sin dividir
  // en palabras), con un acercamiento 1.04 → 1 que ya se mueve desde el cuadro 0.
  const hook = (t: number) =>
    page.evaluate((x) => {
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
  const h0 = await hook(0);
  assert.equal(h0.split, 0, "el titular del hook no se divide en palabras");
  assert.deepEqual([h0.opacity, h0.visibility], [1, "visible"], "titular completo y visible en el cuadro 0");
  assert.ok(Math.abs(h0.scale - 1.04) < 1e-3, `titular a 1.04 en el cuadro 0: ${h0.scale}`);
  assert.equal(h0.pop, h0.parent, "palabra clave aún en el color del titular en el cuadro 0");
  // Miniatura: el cuadro 0 no sale vacío.
  const visible0 = await page.evaluate(() => {
    (window as any).__reel.seek(0);
    return Array.from(document.querySelectorAll('[data-scene="0"] [data-anim]'))
      .filter((el) => getComputedStyle(el).visibility === "visible" && Number(getComputedStyle(el).opacity) > 0 && el.getBoundingClientRect().height > 0).length;
  });
  assert.ok(visible0 > 0, "el cuadro 0 muestra al menos un elemento (miniatura no vacía)");
  const h06 = await hook(0.59);
  assert.equal(h06.pop, h06.accent, "palabra clave en acento antes de 0.6 s");

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
  console.log("✓ count, check y caret: estados correctos y deterministas con seek");

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
    const { page: p, timing: t } = await open(browser, statSpec);
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
} finally {
  await browser.close();
}
