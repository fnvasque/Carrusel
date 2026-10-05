import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolveBackground } from "../render/background.ts";
import type { CarouselSpec } from "../templates/types.ts";
import { buildReelPage } from "./page.ts";
import { captureReel, captureStills, assertFfmpeg } from "./capture.ts";
import { DEFAULT_TRANSITION, reelTiming, specDurations } from "./timing.ts";

export interface RenderReelOptions {
  /** Carpeta base de salida (por defecto "output"). El reel va en <outDir>/<name>/. */
  outDir?: string;
  /** Override de duración uniforme por escena (s); por defecto según texto. */
  seconds?: number;
  /** Duración de la transición entre escenas (s). */
  fade?: number;
  /** Pista de audio opcional a muxear. */
  audio?: string;
  /** Solo exportar un PNG por escena (estado final), sin componer el video. */
  framesOnly?: boolean;
}

/**
 * Renderiza un carrusel como Reel animado 9:16 (1080×1920, 30 fps) en
 * <outDir>/<name>/reel.mp4. Compartido por `npm run reel` y `npm run remix --reel`.
 * Devuelve la ruta del MP4 (o del directorio de escenas si `framesOnly`).
 */
export async function renderReel(spec: CarouselSpec, opts: RenderReelOptions = {}): Promise<string> {
  const base = join(process.cwd(), opts.outDir ?? "output", spec.name);
  const timing = reelTiming(specDurations(spec, opts.seconds), opts.fade ?? DEFAULT_TRANSITION);
  if (!opts.framesOnly) assertFfmpeg();

  // Fondos `ai`/`image` resueltos a data URI antes de armar la página.
  const resolved: CarouselSpec = {
    ...spec,
    slides: await Promise.all(
      spec.slides.map(async (s) => {
        const props = { ...spec.defaults, ...s.props };
        return { ...s, props: { ...s.props, background: await resolveBackground(props.background) } };
      }),
    ),
  };
  const html = await buildReelPage(resolved, timing);

  if (opts.framesOnly) {
    const dir = join(base, "reel");
    const paths = await captureStills(html, timing, dir);
    console.log(`\n✓ ${paths.length} escenas de "${spec.name}" en ${dir}`);
    return dir;
  }

  await mkdir(base, { recursive: true });
  const mp4 = join(base, "reel.mp4");
  console.log(`⏳ Animando "${spec.name}" (${timing.scenes.length} escenas, ${timing.total}s, ${timing.frames} cuadros)…`);
  await captureReel(html, timing, mp4, { audio: opts.audio });
  console.log(`✓ Reel "${spec.name}" → ${mp4}  (${timing.total}s, 1080×1920${opts.audio ? "" : ", sin audio"})`);
  if (!opts.audio) console.log("  Súbelo y añádele un audio en tendencia dentro de la app.");
  return mp4;
}
