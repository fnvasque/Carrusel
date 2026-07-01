import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Renderer } from "./renderSlide.ts";
import { resolveBackground } from "./background.ts";
import { scoreCarousel, THRESHOLD } from "../score/virality.ts";
import { printReport } from "../score/cli.ts";
import {
  evaluateContent,
  gateSuggestions,
  printAudienceReport,
  printFactCheckReport,
  hasApiKey,
} from "../ai/evaluate.ts";
import type { CarouselSpec } from "../templates/types.ts";

export interface RenderCarouselOptions {
  /** Carpeta base de salida (por defecto "output"). El carrusel va en <outDir>/<name>/. */
  outDir?: string;
  /** Verifica los hechos contra la web en el gate de contenido (más lento). */
  web?: boolean;
  /** Salta el gate de contenido (valor + fact-check). Lo usa `remix`, que ya lo corrió. */
  skipContentGate?: boolean;
}

/**
 * Renderiza un carrusel a PNGs 4:5 (1080×1350). Lógica reutilizable compartida por
 * `npm run generate` y `npm run remix --render`: indicador de viralidad (gate),
 * resolución de fondos (IA/local) y screenshot por slide con una sola instancia de
 * Chromium. Devuelve las rutas de los PNGs escritos.
 */
export async function renderCarousel(spec: CarouselSpec, opts: RenderCarouselOptions = {}): Promise<string[]> {
  // Gate 1: indicador de viralidad (proxy heurístico, siempre corre, sin red).
  const score = scoreCarousel(spec);
  printReport(spec.name, score);
  if (score.total < THRESHOLD) {
    if (process.env.SCORE_STRICT) {
      console.error(`✗ Viralidad ${score.total}/100 < ${THRESHOLD} (SCORE_STRICT). No se renderiza. Mejora el copy o quita SCORE_STRICT.`);
      throw new Error(`Viralidad ${score.total}/100 < ${THRESHOLD} (SCORE_STRICT).`);
    }
    console.warn(`⚠️  Viralidad ${score.total}/100 bajo el umbral (${THRESHOLD}). Renderizo igual; revisa las sugerencias de arriba.\n`);
  }

  // Gate 2+3: valor de audiencia (persona Andrea) + fact-check. Requiere OPENAI_API_KEY.
  // Bloquea por defecto si falla; CONTENT_GATE_LENIENT=1 lo degrada a warning.
  // `skipContentGate` lo omite (lo usa `remix`, que ya evaluó el contenido).
  if (!opts.skipContentGate) {
    if (!hasApiKey()) {
      console.warn(
        "⚠️  Sin OPENAI_API_KEY: no se evaluó VALOR de audiencia ni FACT-CHECK. " +
          "Solo corrió el proxy de viralidad. Exporta la API key para el gate de contenido completo.\n",
      );
    } else {
      const lenient = Boolean(process.env.CONTENT_GATE_LENIENT);
      const gate = await evaluateContent(spec, undefined, { web: opts.web });
      printAudienceReport(spec.name, gate.audience);
      printFactCheckReport(spec.name, gate.factcheck);
      if (!gate.pass) {
        const fallos: string[] = [];
        if (gate.audience.total < gate.minAudience) fallos.push(`valor ${gate.audience.total}/${gate.minAudience}`);
        if (!gate.factcheck.pass) fallos.push(`hechos (${gate.factcheck.issues.filter((x) => x.severity !== "baja").length} a corregir)`);
        if (lenient) {
          console.warn(`⚠️  Gate de contenido NO superado — ${fallos.join(", ")}. Renderizo igual (CONTENT_GATE_LENIENT).`);
          for (const s of gateSuggestions(gate)) console.warn(`   • ${s}`);
        } else {
          console.error(`⛔ Gate de contenido NO superado — ${fallos.join(", ")}. No se renderiza. Corrige el copy o usa CONTENT_GATE_LENIENT=1.`);
          for (const s of gateSuggestions(gate)) console.error(`   • ${s}`);
          throw new Error(`Gate de contenido no superado — ${fallos.join(", ")}.`);
        }
      }
    }
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
