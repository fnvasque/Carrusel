import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Renderer } from "./renderSlide.ts";
import { resolveBackground } from "./background.ts";
import { scoreCarousel, THRESHOLD } from "../score/virality.ts";
import { printReport } from "../score/cli.ts";
import type { CarouselSpec } from "../templates/types.ts";

export interface RenderCarouselOptions {
  /** Carpeta base de salida (por defecto "output"). El carrusel va en <outDir>/<name>/. */
  outDir?: string;
}

/**
 * Renderiza un carrusel a PNGs 4:5 (1080×1350). Lógica reutilizable compartida por
 * `npm run generate` y `npm run remix --render`: indicador de viralidad (gate),
 * resolución de fondos (IA/local) y screenshot por slide con una sola instancia de
 * Chromium. Devuelve las rutas de los PNGs escritos.
 */
export async function renderCarousel(spec: CarouselSpec, opts: RenderCarouselOptions = {}): Promise<string[]> {
  // Indicador de viralidad antes de renderizar (gate de contenido).
  const score = scoreCarousel(spec);
  printReport(spec.name, score);
  if (score.total < THRESHOLD) {
    if (process.env.SCORE_STRICT) {
      console.error(`✗ Viralidad ${score.total}/100 < ${THRESHOLD} (SCORE_STRICT). No se renderiza. Mejora el copy o quita SCORE_STRICT.`);
      throw new Error(`Viralidad ${score.total}/100 < ${THRESHOLD} (SCORE_STRICT).`);
    }
    console.warn(`⚠️  Viralidad ${score.total}/100 bajo el umbral (${THRESHOLD}). Renderizo igual; revisa las sugerencias de arriba.\n`);
  }

  const outDir = join(process.cwd(), opts.outDir ?? "output", spec.name);
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];
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
      written.push(outPath);
      console.log(`✓ slide ${i}/${spec.slides.length} → ${outPath}`);
    }
  } finally {
    await renderer.close();
  }

  console.log(`\n✓ Carrusel "${spec.name}" generado en ${opts.outDir ?? "output"}/${spec.name}/`);
  return written;
}
