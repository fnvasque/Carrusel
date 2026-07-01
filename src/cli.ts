import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderCarousel } from "./render/renderCarousel.ts";
import type { CarouselSpec } from "./templates/types.ts";

async function main() {
  const args = process.argv.slice(2);
  const web = args.includes("--web");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Uso: npm run generate <ruta-al-carrusel.ts> [--web]");
    console.error("Ej:  npm run generate carousels/ejemplo.ts");
    console.error("  --web   verifica los hechos contra la web en el gate de contenido");
    process.exit(1);
  }

  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) {
    throw new Error(`El archivo ${file} no exporta por defecto un carrusel con slides.`);
  }

  await renderCarousel(spec, { web });
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
