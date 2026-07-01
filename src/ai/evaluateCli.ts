import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CarouselSpec } from "../templates/types.ts";
import { scoreCarousel } from "../score/virality.ts";
import { printReport } from "../score/cli.ts";
import {
  evaluateAudienceValue,
  factCheckContent,
  printAudienceReport,
  printFactCheckReport,
  AUDIENCE_THRESHOLD,
  hasApiKey,
} from "./evaluate.ts";

/**
 * Inspección manual del contenido de un carrusel: corre los tres gates y muestra
 * los reportes SIN renderizar. Es el "leer como la audiencia + fact-check" bajo
 * demanda. `npm run evaluate carousels/x.ts [--web]`.
 */

async function loadSpec(file: string): Promise<CarouselSpec> {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) throw new Error(`${file} no exporta un carrusel con slides.`);
  return spec;
}

async function main() {
  const args = process.argv.slice(2);
  const web = args.includes("--web");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Uso: npm run evaluate <ruta-al-carrusel.ts> [--web]");
    console.error("  Corre viralidad + valor de audiencia + fact-check (sin renderizar).");
    console.error("  --web   verifica los hechos contra la web (más lento).");
    process.exit(1);
  }
  if (!hasApiKey()) {
    console.error("Falta OPENAI_API_KEY: el valor de audiencia y el fact-check la necesitan.");
    process.exit(1);
  }

  const spec = await loadSpec(file);

  // Gate 1: viralidad (proxy heurístico, sin red).
  const vir = scoreCarousel(spec);
  printReport(spec.name, vir);

  // Gate 2 y 3: valor de audiencia + fact-check (en paralelo).
  const [audience, factcheck] = await Promise.all([
    evaluateAudienceValue(spec),
    factCheckContent(spec, undefined, { web }),
  ]);
  printAudienceReport(spec.name, audience);
  printFactCheckReport(spec.name, factcheck);

  const pass = vir.total >= 75 && audience.total >= AUDIENCE_THRESHOLD && factcheck.pass;
  console.log(pass ? "✅ Pasa los tres gates.\n" : "⚠️  No pasa todos los gates (ver arriba).\n");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
