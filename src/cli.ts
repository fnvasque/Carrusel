import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Renderer } from "./render/renderSlide.ts";
import { resolveBackground } from "./render/background.ts";
import { scoreCarousel, THRESHOLD } from "./score/virality.ts";
import { printReport } from "./score/cli.ts";
import type { CarouselSpec } from "./templates/types.ts";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run generate <ruta-al-carrusel.ts>");
    console.error("Ej:  npm run generate carousels/ejemplo.ts");
    process.exit(1);
  }

  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) {
    throw new Error(`El archivo ${file} no exporta por defecto un carrusel con slides.`);
  }

  // Indicador de viralidad antes de renderizar (gate de contenido).
  const score = scoreCarousel(spec);
  printReport(spec.name, score);
  if (score.total < THRESHOLD) {
    if (process.env.SCORE_STRICT) {
      console.error(`✗ Viralidad ${score.total}/100 < ${THRESHOLD} (SCORE_STRICT). No se renderiza. Mejora el copy o quita SCORE_STRICT.`);
      process.exit(1);
    }
    console.warn(`⚠️  Viralidad ${score.total}/100 bajo el umbral (${THRESHOLD}). Renderizo igual; revisa las sugerencias de arriba.\n`);
  }

  const outDir = join(process.cwd(), "output", spec.name);
  await mkdir(outDir, { recursive: true });

  const renderer = new Renderer();
  await renderer.init();
  try {
    let i = 0;
    for (const slide of spec.slides) {
      i++;
      const props = { ...spec.defaults, ...slide.props };
      // Resuelve el fondo (genera con IA o embebe imagen local) antes de render.
      props.background = await resolveBackground(props.background);

      const png = await renderer.render(createElement(slide.template, props));
      const outPath = join(outDir, `slide-${String(i).padStart(2, "0")}.png`);
      await writeFile(outPath, png);
      console.log(`✓ slide ${i}/${spec.slides.length} → ${outPath}`);
    }
  } finally {
    await renderer.close();
  }

  console.log(`\n✓ Carrusel "${spec.name}" generado en output/${spec.name}/`);
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
