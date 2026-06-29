import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Renderer } from "../render/renderSlide.ts";
import { resolveBackground } from "../render/background.ts";
import { FORMATS, type CarouselSpec } from "../templates/types.ts";
import { composeReel, reelDuration } from "./video.ts";

export interface RenderReelOptions {
  /** Carpeta base de salida (por defecto "output"). El reel va en <outDir>/<name>/. */
  outDir?: string;
  /** Override de duración uniforme por slide (s); por defecto según texto. */
  seconds?: number;
  /** Duración del crossfade (s). */
  fade?: number;
  /** Pista de audio opcional a muxear. */
  audio?: string;
  /** Solo renderizar los PNG 9:16, sin componer el video. */
  framesOnly?: boolean;
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

/**
 * Renderiza un carrusel como Reel 9:16 (1080×1920) y lo compone en
 * <outDir>/<name>/reel.mp4. Lógica reutilizable compartida por `npm run reel` y
 * `npm run remix --reel`. Devuelve la ruta del MP4 (o del directorio de frames si
 * `framesOnly`). Requiere ffmpeg en el PATH para componer.
 */
export async function renderReel(spec: CarouselSpec, opts: RenderReelOptions = {}): Promise<string> {
  const fixedSeconds = opts.seconds;
  const fade = opts.fade ?? 0.4;
  const audio = opts.audio;

  const reelDir = join(process.cwd(), opts.outDir ?? "output", spec.name, "reel");
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

  if (opts.framesOnly) {
    console.log(`\n✓ Frames 9:16 de "${spec.name}" en ${opts.outDir ?? "output"}/${spec.name}/reel/`);
    return reelDir;
  }

  // Duración por slide según su texto (hold extra en el primero/hook y el último/CTA).
  const last = spec.slides.length - 1;
  const durations = spec.slides.map((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    return fixedSeconds ?? slideSeconds(props, i === 0 || i === last);
  });

  const mp4 = join(process.cwd(), opts.outDir ?? "output", spec.name, "reel.mp4");
  const dur = reelDuration(durations, fade);
  console.log(`\n⏳ Componiendo video (${framePaths.length} slides, ~${dur}s, fade ${fade}s${audio ? ", con audio" : ""})…`);
  await composeReel(framePaths, durations, mp4, { fade, audio });
  console.log(`\n✓ Reel "${spec.name}" → ${mp4}  (~${dur}s, 1080×1920${audio ? "" : ", sin audio"})`);
  if (!audio) console.log("  Súbelo a IG y añádele un audio en tendencia dentro de la app.");
  return mp4;
}
