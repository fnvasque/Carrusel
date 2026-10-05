import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlShell } from "../render/htmlShell.ts";
import { FORMATS, type CarouselSpec } from "../templates/types.ts";
import { theme } from "../theme.ts";
import type { ReelTiming } from "./timing.ts";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/** Lee un archivo de gsap/dist como texto para inyectarlo inline (render offline). */
async function gsapScript(file: string): Promise<string> {
  const dist = dirname(require.resolve("gsap/dist/gsap.min.js"));
  return readFile(join(dist, file), "utf8");
}

/**
 * Arma la página única del reel: todas las escenas apiladas (una por slide, en
 * formato reel), la barra de progreso, GSAP + SplitText inline, los tiempos y
 * el runtime que expone `window.__reel`. Los fondos `ai` deben venir ya resueltos.
 */
export async function buildReelPage(spec: CarouselSpec, timing: ReelTiming): Promise<string> {
  const { width, height } = FORMATS.reel;
  const scenes = spec.slides
    .map((slide, i) => {
      const props = { ...spec.defaults, ...slide.props, format: "reel" as const };
      const markup = renderToStaticMarkup(createElement(slide.template, props));
      return `<div data-scene="${i}" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden;">${markup}</div>`;
    })
    .join("");
  const [gsap, split, runtime] = await Promise.all([
    gsapScript("gsap.min.js"),
    gsapScript("SplitText.min.js"),
    readFile(join(HERE, "runtime.js"), "utf8"),
  ]);
  // Barra de progreso de marca (como el motor anterior): 8 px en el borde
  // superior, color de acento, crece de 0 a 100% durante todo el reel (runtime).
  const progress = `<div data-reel-progress style="position:absolute;left:0;top:0;width:${width}px;height:8px;background:${theme.colors.accent};transform-origin:left center;transform:scaleX(0);z-index:10;"></div>`;
  const body =
    `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#000;">${scenes}${progress}</div>` +
    `<script>${gsap}</script><script>${split}</script>` +
    `<script>window.__REEL_TIMING__ = ${JSON.stringify(timing)};</script>` +
    `<script>${runtime}</script>`;
  return htmlShell(body);
}
