import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CarouselSpec } from "../templates/types.ts";
import { scoreCarousel, THRESHOLD, type ViralityResult } from "./virality.ts";

/** Imprime el reporte de viralidad de un carrusel en la terminal. */
export function printReport(name: string, r: ViralityResult): void {
  const status = r.total >= THRESHOLD ? "✅ listo" : "⚠️  revisar";
  console.log(`\n${name}  →  ${r.total}/100  (${r.grade})  ${status}\n`);
  for (const d of r.dimensions) {
    const bar = "█".repeat(Math.round((d.score / d.max) * 10)).padEnd(10, "░");
    const notes = d.notes.length ? `  · ${d.notes.join(" · ")}` : "";
    console.log(`  ${d.name.padEnd(11)} ${bar} ${String(d.score).padStart(2)}/${d.max}${notes}`);
  }
  if (r.suggestions.length) {
    console.log("\n  Para mejorar:");
    for (const s of r.suggestions.slice(0, 6)) console.log(`   • ${s}`);
  }
  console.log("");
}

async function loadSpec(file: string): Promise<CarouselSpec> {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) throw new Error(`${file} no exporta un carrusel con slides.`);
  return spec;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run score <ruta-al-carrusel.ts>");
    process.exit(1);
  }
  const spec = await loadSpec(file);
  const r = scoreCarousel(spec);
  printReport(spec.name, r);
  // Salida 1 si está bajo el umbral, para poder usarlo en scripts/CI.
  process.exit(r.total >= THRESHOLD ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
