// Renderiza el kit (kit.html) a PDF de 1080×1620 por página y la portada a PNG.
//   node promo/kit-arranque-ia/render.mjs [salida/]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? new URL("./salida/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1620 } });
await page.goto(new URL("./kit.html", import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.emulateMedia({ media: "print" });
await page.pdf({ path: join(out, "kit-arranque-con-ia.pdf"), width: "1080px", height: "1620px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await page.emulateMedia({ media: "screen" });
// Portada y una página interior como imágenes (Gumroad y stories).
const secciones = await page.$$("section.page");
await secciones[0].screenshot({ path: join(out, "portada.png") });
await secciones[2].screenshot({ path: join(out, "dia-1.png") });
console.log(`PDF y portada en ${out} (${secciones.length} páginas)`);
await browser.close();
