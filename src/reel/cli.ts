import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderReel } from "./renderReel.ts";
import type { CarouselSpec } from "../templates/types.ts";

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

function strFlag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run reel <ruta-al-carrusel.ts> [-- --seconds=N --fade=N --frames-only]");
    process.exit(1);
  }
  const seconds = numFlag("seconds"); // override opcional: duración uniforme
  const fade = numFlag("fade") ?? 0.4;
  const audio = strFlag("audio"); // pista opcional; por defecto sin audio
  const framesOnly = process.argv.includes("--frames-only");

  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  if (!spec?.slides?.length) {
    throw new Error(`El archivo ${file} no exporta por defecto un carrusel con slides.`);
  }

  await renderReel(spec, { seconds, fade, audio, framesOnly });
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
