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

function strFlag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note"];

/** Segundos que se muestra un slide, según cuánto texto tiene (legibilidad). */
function slideSeconds(props: Record<string, unknown>, hold: boolean): number {
  let chars = 0;
  for (const k of TEXT_KEYS) {
    const v = props[k];
    if (typeof v === "string") chars += v.length;
    else if (Array.isArray(v)) chars += v.filter((x) => typeof x === "string").join(" ").length;
  }
  const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
  return +(s + (hold ? 0.7 : 0)).toFixed(2);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run reel <ruta-al-carrusel.ts> [-- --seconds=N --fade=N --frames-only]");
    process.exit(1);
  }
  const fixedSeconds = numFlag("seconds"); // override opcional: duración uniforme
  const fade = numFlag("fade") ?? 0.4;
  const audio = strFlag("audio"); // pista opcional; por defecto sin audio
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

  // Duración por slide según su texto (hold extra en el primero/hook y el último/CTA).
  const last = spec.slides.length - 1;
  const durations = spec.slides.map((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    return fixedSeconds ?? slideSeconds(props, i === 0 || i === last);
  });

  const mp4 = join(process.cwd(), "output", spec.name, "reel.mp4");
  const dur = reelDuration(durations, fade);
  console.log(`\n⏳ Componiendo video (${framePaths.length} slides, ~${dur}s, fade ${fade}s${audio ? ", con audio" : ""})…`);
  await composeReel(framePaths, durations, mp4, { fade, audio });
  console.log(`\n✓ Reel "${spec.name}" → ${mp4}  (~${dur}s, 1080×1920${audio ? "" : ", sin audio"})`);
  if (!audio) console.log("  Súbelo a IG y añádele un audio en tendencia dentro de la app.");
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
