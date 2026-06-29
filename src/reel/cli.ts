import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Renderer } from "../render/renderSlide.ts";
import { resolveBackground } from "../render/background.ts";
import { FORMATS, type CarouselSpec } from "../templates/types.ts";
import { composeReel, reelDuration } from "./video.ts";

/**
 * Genera un Reel 9:16 a partir de un carrusel: renderiza los slides en vertical
 * (1080×1920) y los compone en output/<name>/reel.mp4 (zoom sutil + crossfades,
 * sin audio; el trending se añade en Instagram).
 *
 * Uso:
 *   npm run reel carousels/mi-carrusel.ts
 *   npm run reel carousels/mi-carrusel.ts -- --seconds=3 --fade=0.5
 *   npm run reel carousels/mi-carrusel.ts -- --frames-only
 */
function numFlag(name: string): number | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run reel <ruta-al-carrusel.ts> [-- --seconds=N --fade=N --frames-only]");
    process.exit(1);
  }
  const secondsPerSlide = numFlag("seconds") ?? 2.8;
  const fade = numFlag("fade") ?? 0.4;
  const framesOnly = process.argv.includes("--frames-only");

  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) {
    throw new Error(`El archivo ${file} no exporta por defecto un carrusel con slides.`);
  }

  const reelDir = join(process.cwd(), "output", spec.name, "reel");
  await mkdir(reelDir, { recursive: true });

  const renderer = new Renderer();
  await renderer.init(FORMATS.reel);
  const framePaths: string[] = [];
  try {
    let i = 0;
    for (const slide of spec.slides) {
      i++;
      const props = { ...spec.defaults, ...slide.props, format: "reel" as const };
      props.background = await resolveBackground(props.background);
      const png = await renderer.render(createElement(slide.template, props));
      const outPath = join(reelDir, `slide-${String(i).padStart(2, "0")}.png`);
      await writeFile(outPath, png);
      framePaths.push(outPath);
      console.log(`✓ reel-slide ${i}/${spec.slides.length} → ${outPath}`);
    }
  } finally {
    await renderer.close();
  }

  if (framesOnly) {
    console.log(`\n✓ Frames 9:16 de "${spec.name}" en output/${spec.name}/reel/`);
    return;
  }

  const mp4 = join(process.cwd(), "output", spec.name, "reel.mp4");
  console.log(`\n⏳ Componiendo video (${framePaths.length} slides, ${secondsPerSlide}s c/u, fade ${fade}s)…`);
  await composeReel(framePaths, mp4, { secondsPerSlide, fade });
  const dur = reelDuration(framePaths.length, secondsPerSlide, fade);
  console.log(`\n✓ Reel "${spec.name}" → ${mp4}  (~${dur}s, 1080×1920, sin audio)`);
  console.log("  Súbelo a IG y añádele un audio en tendencia dentro de la app.");
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
