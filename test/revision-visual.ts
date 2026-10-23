import assert from "node:assert/strict";
import { chromium } from "playwright";
import { htmlShell } from "../src/render/htmlShell.ts";
import { findChromium } from "../src/render/renderSlide.ts";
import { revisarPagina, type Hallazgo } from "../src/render/revision.ts";

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
} finally {
  await browser.close();
}

console.log(fallos ? `\n${fallos} fallos` : "\nrevisión visual ok");
if (fallos) process.exit(1);
