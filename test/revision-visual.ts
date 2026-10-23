import assert from "node:assert/strict";
import { chromium } from "playwright";
import { htmlShell } from "../src/render/htmlShell.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { revisarPagina, type Hallazgo } from "../src/render/revision.ts";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBorrador, borradorASpec, storySpec } from "../src/calendario/draft.ts";
import { Hook } from "../src/templates/index.ts";
import { displayLineHeight, ANTON_LH_ACENTO } from "../src/templates/fit.ts";
import { FORMATS, type CarouselSpec } from "../src/templates/types.ts";
import { buildReelPage } from "../src/reel/page.ts";
import { specTiming } from "../src/reel/timing.ts";
import { revisarReel, serieReel, numerosSolos } from "../src/reel/revision.ts";
import smoke from "../carousels/_smoke-plantillas.ts";
import estudiar from "../carousels/estudiar-3-ias.ts";
import mentiras from "../carousels/mentiras-ia.ts";
import video3 from "../carousels/video-3-segundos.ts";
import escalera from "../carousels/escalera-dopamina.ts";
import voz from "../carousels/voz-subtitulos-gratis.ts";

/**
 * Núcleo de la revisión visual en Chromium real: tilde que pisa la línea de
 * arriba (Anton con interlineado apretado), espacio antes de la puntuación
 * (palabra escalada con transform) y texto fuera de la zona segura del reel.
 * Uso: npm run test:reel
 */

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

async function revisar(markup: string, reel = false): Promise<Hallazgo[]> {
  await page.setContent(await htmlShell(markup));
  await page.evaluate(() => document.fonts.ready);
  return revisarPagina(page, "caso de prueba", { reel, altura: 1920 });
}

const titulo = (html: string, lh: number, extra = "") =>
  `<h2 style="font-family:Anton;font-size:124px;width:640px;line-height:${lh};color:#fff;margin:200px 60px;${extra}">${html}</h2>`;
const h2 = (html: string) => `<h2 style="font-family:Anton;font-size:124px;color:#fff;margin:200px 60px;">${html}</h2>`;
const escalado = (w: string) => `<span style="display:inline-block;transform:scale(0.9)">${w}</span>`;
const tipos = (h: Hallazgo[], t: string) => h.filter((x) => x.tipo === t);

let fallos = 0;
async function caso(nombre: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log("✓", nombre);
  } catch (e) {
    fallos++;
    console.error("✗", nombre, "—", e instanceof Error ? e.message : e);
  }
}

try {
  await caso("tilde: «PRÓXIMO» con line-height 0.98 pisa la línea anterior", async () => {
    const h = await revisar(titulo("PARA TU<br>PRÓXIMO", 0.98));
    assert.equal(tipos(h, "tilde").length, 1, JSON.stringify(h));
    assert.match(h[0].motivo, /«PRÓXIMO»/);
    assert.match(h[0].motivo, /caso de prueba/);
  });
  await caso("tilde: con text-transform el motivo va en mayúsculas", async () => {
    const h = await revisar(titulo("para tu<br>próximo", 0.98, "text-transform:uppercase;"));
    assert.equal(tipos(h, "tilde").length, 1, JSON.stringify(h));
    assert.match(h[0].motivo, /«PRÓXIMO»/);
  });
  await caso("tilde: con line-height 1.14 no hay hallazgo", async () => {
    assert.deepEqual(await revisar(titulo("PARA TU<br>PRÓXIMO", 1.14)), []);
  });
  await caso("tilde: en la primera línea no pisa nada", async () => {
    assert.deepEqual(await revisar(titulo("GUÁRDALO<br>PARA TU", 0.98)), []);
  });
  await caso("puntuación: palabra escalada deja espacio antes de la coma", async () => {
    const h = await revisar(h2(`${escalado("SEEDANCE")}, MISMO`));
    assert.equal(tipos(h, "puntuacion").length, 1, JSON.stringify(h));
    assert.match(h[0].motivo, /espacio antes de «,» tras «SEEDANCE»/);
  });
  await caso("puntuación: texto corrido sin espacio no da hallazgo", async () => {
    assert.deepEqual(await revisar(h2("SEEDANCE, MISMO")), []);
  });
  await caso("puntuación: palabra escalada sin puntuación no da hallazgo", async () => {
    assert.deepEqual(await revisar(h2(`GANA ${escalado("KLING")} REAL`)), []);
  });
  const abajo = (extra: string) =>
    `<p style="position:absolute;left:60px;top:1600px;font-family:Inter;font-size:48px;color:#fff;${extra}">Texto en la zona tapada</p>`;
  await caso("zona: texto en top 1600 del reel sale de la zona segura", async () => {
    const h = await revisar(abajo(""), true);
    assert.equal(tipos(h, "zona").length, 1, JSON.stringify(h));
  });
  await caso("zona: el mismo texto con opacity 0 no cuenta", async () => {
    assert.deepEqual(await revisar(abajo("opacity:0;"), true), []);
  });
  await caso("zona: en post (no reel) no se revisa", async () => {
    assert.deepEqual(await revisar(abajo(""), false), []);
  });
  const fixture = (n: string) => parseBorrador(readFileSync(new URL(`./fixtures/revision-visual/${n}.json`, import.meta.url), "utf8"));
  const flat = (props: Record<string, any>) => (props.background && "ai" in props.background ? { ...props, background: { color: "#06060A" } } : props);
  const renderSlide = (spec: CarouselSpec, i: number, format: "post" | "reel") =>
    renderToStaticMarkup(createElement(spec.slides[i].template as any, { ...flat({ ...spec.defaults, ...spec.slides[i].props }), format }));
  await caso("zona: trozo de subtítulo oculto (autoAlpha 0) no cuenta, ni su hijo", async () => {
    const trozo = `<div data-scene="0"><span data-sub-trozo="" style="position:absolute;left:60px;top:1600px;font-family:Inter;font-size:48px;color:#fff;visibility:hidden;opacity:0;">Texto <b>tapado</b></span></div>`;
    assert.deepEqual(await revisar(trozo, true), []);
  });
  await caso("reel kling-vs-seedance: la puntuación no se separa de la palabra clave en ningún instante", async () => {
    const b = fixture("vie-pm-reel-kling-vs-seedance");
    const spec = borradorASpec(b, { format: "reel" });
    const offline = { ...spec, defaults: flat(spec.defaults as any), slides: spec.slides.map((sl) => ({ ...sl, props: flat(sl.props as any) })) } as CarouselSpec;
    const timing = specTiming(spec, { pace: b.pace });
    const p = await browser.newPage({ viewport: FORMATS.reel, deviceScaleFactor: 1 });
    try {
      await p.setContent(await buildReelPage(offline, timing), { waitUntil: "load" });
      await p.waitForFunction(() => (window as any).__reelReady === true);
      const plantillas = await p.evaluate(() => Array.from(document.querySelectorAll("[data-scene]")).map((s) => s.getAttribute("data-plantilla")));
      assert.deepEqual(plantillas, spec.slides.map((sl) => sl.template.name));
      const t0 = performance.now();
      const h = await revisarReel(p, timing);
      console.log(`  revisarReel kling: ${Math.round(performance.now() - t0)} ms, ${h.length} hallazgos (${[...new Set(h.map((x) => x.tipo))].join(", ") || "ninguno"})`);
      assert.deepEqual(tipos(h, "puntuacion"), [], JSON.stringify(tipos(h, "puntuacion")));
    } finally {
      await p.close();
    }
  });
  const reelDe = async (offline: CarouselSpec, timing: ReturnType<typeof specTiming>) => {
    const p = await browser.newPage({ viewport: FORMATS.reel, deviceScaleFactor: 1 });
    try {
      await p.setContent(await buildReelPage(offline, timing), { waitUntil: "load" });
      await p.waitForFunction(() => (window as any).__reelReady === true);
      return await revisarReel(p, timing);
    } finally {
      await p.close();
    }
  };
  await caso("transición: kling-vs-seedance no da hallazgos de transicion", async () => {
    const b = fixture("vie-pm-reel-kling-vs-seedance");
    const spec = borradorASpec(b, { format: "reel" });
    const offline = { ...spec, defaults: flat(spec.defaults as any), slides: spec.slides.map((sl) => ({ ...sl, props: flat(sl.props as any) })) } as CarouselSpec;
    const h = await reelDe(offline, specTiming(spec, { pace: b.pace }));
    assert.deepEqual(tipos(h, "transicion"), [], JSON.stringify(tipos(h, "transicion")));
  });
  await caso("transición: reel de 2 escenas con strike y subtítulos no da transicion ni zona", async () => {
    const [myth, screen] = [smoke.slides.find((x) => x.template.name === "MythReality")!, smoke.slides.find((x) => x.template.name === "Screen")!];
    const spec = {
      ...smoke,
      slides: [
        { ...myth, props: { ...myth.props, narracion: "La IA no piensa sola, hace lo que tú le pides." } },
        { ...screen, props: { ...screen.props, narracion: "Le escribes esto una vez y te lo recuerda todos los meses." } },
      ],
    } as CarouselSpec;
    const h = await reelDe(spec, specTiming(spec));
    assert.deepEqual([...tipos(h, "transicion"), ...tipos(h, "zona")], [], JSON.stringify(h));
  });
  // El número de paso entra junto con su heading: ninguno se ve solo más de 0,15 s (el bloqueo es a 0,4 s).
  const ritmos = ["ensenar", "rapido", "gancho"] as const;
  const casosNumero: [string, () => CarouselSpec][] = [
    ["narra-sin-tu-voz", () => borradorASpec(fixture("sab-reel-narra-sin-tu-voz"), { format: "reel" })],
    ["kling-vs-seedance", () => borradorASpec(fixture("vie-pm-reel-kling-vs-seedance"), { format: "reel" })],
    ["estudiar-3-ias", () => estudiar as CarouselSpec],
  ];
  for (const [nombre, armar] of casosNumero) {
    for (const pace of ritmos) {
      await caso(`número de paso: ${nombre} (${pace}) no se ve sin su heading más de 0,15 s`, async () => {
        const spec = armar();
        const offline = { ...spec, defaults: flat(spec.defaults as any), slides: spec.slides.map((sl) => ({ ...sl, props: flat(sl.props as any) })) } as CarouselSpec;
        const timing = specTiming(spec, { pace });
        const p = await browser.newPage({ viewport: FORMATS.reel, deviceScaleFactor: 1 });
        try {
          await p.setContent(await buildReelPage(offline, timing), { waitUntil: "load" });
          await p.waitForFunction(() => (window as any).__reelReady === true);
          const fina = Array.from({ length: Math.floor(timing.total / 0.02) + 1 }, (_, k) => +(k * 0.02).toFixed(2));
          const { serie, contexto } = await serieReel(p, timing, fina);
          let solo = 0;
          while (solo < 2 && numerosSolos(serie, contexto, solo).length) solo += 0.02;
          console.log(`  ${nombre} (${pace}): número solo ≈ ${solo.toFixed(2)} s`);
          assert.deepEqual(numerosSolos(serie, contexto, 0.15), [], JSON.stringify(numerosSolos(serie, contexto, 0.15)));
        } finally {
          await p.close();
        }
      });
    }
  }
  await caso("displayLineHeight: sube a 1.14 solo con tildes", async () => {
    assert.equal(ANTON_LH_ACENTO, 1.14);
    assert.equal(displayLineHeight("PRÓXIMO", 0.98), 1.14);
    assert.equal(displayLineHeight("año", 0.98), 1.14);
    assert.equal(displayLineHeight("PROXIMO", 0.98), 0.98);
    assert.equal(displayLineHeight("ÑU", 1.2), 1.2);
    assert.equal(displayLineHeight("QUE TÚ", 0.98), 1.2);
    assert.equal(displayLineHeight("QUE TU", 0.98), 0.98);
  });
  for (const format of ["reel", "post"] as const) {
    const reel = format === "reel";
    await caso(`tildes: Cta «Guárdalo para tu próximo video» (${format}) sin hallazgos`, async () => {
      const spec = borradorASpec(fixture("sab-reel-narra-sin-tu-voz"), { format });
      const cta = spec.slides.length - 1;
      assert.equal(spec.slides[cta].props.title, "Guárdalo para tu próximo video");
      const h = await revisar(renderSlide(spec, cta, format), reel);
      assert.deepEqual(tipos(h, "tilde"), [], JSON.stringify(h));
    });
    await caso(`tildes: Hook de narra-sin-tu-voz (${format})`, async () => {
      const spec = borradorASpec(fixture("sab-reel-narra-sin-tu-voz"), { format });
      const h = await revisar(renderSlide(spec, 0, format), reel);
      assert.deepEqual(tipos(h, "tilde"), [], JSON.stringify(h));
    });
    await caso(`tildes: Hook con tilde en dos líneas (${format})`, async () => {
      const h = await revisar(renderToStaticMarkup(createElement(Hook as any, { title: "Cómo narrar tu próximo video sin grabarte", highlight: "próximo", format })), reel);
      assert.deepEqual(tipos(h, "tilde"), [], JSON.stringify(h));
    });
    await caso(`tildes: kling-vs-seedance (${format}) sin hallazgos`, async () => {
      const spec = borradorASpec(fixture("vie-pm-reel-kling-vs-seedance"), { format });
      for (let i = 0; i < spec.slides.length; i++) {
        const h = await revisar(renderSlide(spec, i, format), reel);
        assert.deepEqual(tipos(h, "tilde"), [], `slide ${i + 1}: ${JSON.stringify(h)}`);
      }
    });
    await caso(`tildes: StoryCover (${format})`, async () => {
      const spec = storySpec(fixture("sab-reel-narra-sin-tu-voz"));
      const h = await revisar(renderSlide(spec, 0, "reel"), true);
      assert.deepEqual(tipos(h, "tilde"), [], JSON.stringify(h));
    });
    await caso(`tildes: carruseles de carousels/ (${format}) sin hallazgos`, async () => {
      const malos: string[] = [];
      for (const spec of [smoke, estudiar, mentiras, video3, escalera, voz] as CarouselSpec[]) {
        for (let i = 0; i < spec.slides.length; i++) {
          const h = tipos(await revisar(renderSlide(spec, i, format), reel), "tilde");
          for (const x of h) malos.push(`${spec.name} #${i + 1}: ${x.motivo}`);
        }
      }
      assert.deepEqual(malos, []);
    });
  }
} finally {
  await browser.close();
}

console.log(fallos ? `\n${fallos} fallos` : "\nrevisión visual ok");
if (fallos) process.exit(1);
