import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Renderer } from "../render/renderSlide.ts";
import { resolveBackground } from "../render/background.ts";
import { FORMATS, type CarouselSpec } from "../templates/types.ts";

/**
 * Renderiza los slides de un carrusel en formato vertical 9:16 (1080×1920),
 * nativo para Reels, a output/<name>/reel/slide-NN.png. La composición a vídeo
 * (mp4) se añade en el siguiente loop.
 *
 * Uso: npm run reel carousels/mi-carrusel.ts
 */
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run reel <ruta-al-carrusel.ts>");
    process.exit(1);
  }

  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) {
    throw new Error(`El archivo ${file} no exporta por defecto un carrusel con slides.`);
  }

  const reelDir = join(process.cwd(), "output", spec.name, "reel");
  await mkdir(reelDir, { recursive: true });

  const renderer = new Renderer();
  await renderer.init(FORMATS.reel);
  try {
    let i = 0;
    for (const slide of spec.slides) {
      i++;
      const props = { ...spec.defaults, ...slide.props, format: "reel" as const };
      props.background = await resolveBackground(props.background);
      const png = await renderer.render(createElement(slide.template, props));
      const outPath = join(reelDir, `slide-${String(i).padStart(2, "0")}.png`);
      await writeFile(outPath, png);
      console.log(`✓ reel-slide ${i}/${spec.slides.length} → ${outPath}`);
    }
  } finally {
    await renderer.close();
  }

  console.log(`\n✓ Frames 9:16 de "${spec.name}" en output/${spec.name}/reel/`);
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
