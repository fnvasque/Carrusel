/** Piloto local: valida borradores, calcula tiempos y renderiza sin calendario, voz ni APIs. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { parseBorrador, borradorASpec } from "../../../../src/calendario/draft.ts";
import { Renderer } from "../../../../src/render/renderSlide.ts";
import { FORMATS } from "../../../../src/templates/types.ts";
import { specTiming } from "../../../../src/reel/timing.ts";
import { renderReelResult } from "../../../../src/reel/renderReel.ts";

const carpeta = dirname(fileURLToPath(import.meta.url));
const nombres = ["reel-notas", "carrusel-reclamo", "carrusel-estilo", "reel-bitacora"];
const elegir = process.argv.find((a) => a.startsWith("--pieza="))?.split("=")[1];
if (elegir && !nombres.includes(elegir)) throw new Error("Pieza desconocida: usa uno de los cuatro nombres del piloto.");
const comprobar = process.argv.includes("--check");
const video = process.argv.includes("--video");
if (comprobar && video) throw new Error("Elige --check o --video, no ambos.");
const informes = [];
for (const nombre of nombres.filter((n) => !elegir || n === elegir)) {
  const borrador = parseBorrador(await readFile(join(carpeta, `${nombre}.json`), "utf8"));
  // Estos ejemplos solo usan texto: una futura edición no debe activar generación de fondos.
  if (borrador.slides.some((s) => s.background || s.template === "Clip")) {
    throw new Error(`${nombre}: el piloto no admite fondos ni clips.`);
  }
  const formato = nombre.startsWith("reel-") ? "reel" : "post";
  const spec = borradorASpec(borrador, { format: formato });
  if (spec.slides.length !== borrador.slides.length) throw new Error(`${nombre}: se descartó o agregó una plantilla.`);
  const timing = formato === "reel" ? specTiming(spec) : undefined;
  if (timing && timing.total > 35) throw new Error(`${nombre}: ${timing.total} segundos supera 35.`);
  const hallazgos = [];
  const salida = join(carpeta, "rendered", nombre);
  if (!comprobar) {
    await mkdir(salida, { recursive: true });
    const renderer = new Renderer();
    await renderer.init(FORMATS[formato]);
    try {
      for (const [i, slide] of spec.slides.entries()) {
        const png = await renderer.render(createElement(slide.template, { ...spec.defaults, ...slide.props }));
        await writeFile(join(salida, `slide-${String(i + 1).padStart(2, "0")}.png`), png);
        hallazgos.push(...await renderer.revisar(`${nombre}: lámina ${i + 1}`));
      }
    } finally {
      await renderer.close();
    }
    if (video && formato === "reel") {
      await renderReelResult(spec, {
        outDir: join(carpeta, "rendered"), voz: false, subtitulos: false,
        pace: "ensenar", maxSeconds: 35, revision: "bloquear",
      });
    }
  }
  informes.push({ nombre, formato, laminas: spec.slides.length, timing, hallazgos });
}
console.log(JSON.stringify(informes, null, 2));
