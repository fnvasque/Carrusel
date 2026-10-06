import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolveBackground } from "../render/background.ts";
import type { CarouselSpec, Pace } from "../templates/types.ts";
import { buildReelPage } from "./page.ts";
import { captureReel, captureStills, assertFfmpeg } from "./capture.ts";
import { specTiming } from "./timing.ts";

export interface RenderReelOptions {
  /** Carpeta base de salida (por defecto "output"). El reel va en <outDir>/<name>/. */
  outDir?: string;
  /** Override de duración uniforme por escena (s); por defecto según texto. */
  seconds?: number;
  /** Duración de la transición entre escenas (s); por defecto, la del ritmo. */
  fade?: number;
  /** Ritmo del reel; sobrescribe el `pace` del carrusel (por defecto "ensenar"). */
  pace?: Pace;
  /** Pista de audio opcional a muxear. */
  audio?: string;
  /** Solo exportar un PNG por escena (estado final), sin componer el video. */
  framesOnly?: boolean;
  /**
   * Wordmark desde el cuadro 0 (por defecto true). Con false, el logo de cada
   * escena entra a los 3 s (experimento del calendario, `data-anim="late"`).
   */
  logoEnCuadro0?: boolean;
}

/** Resultado del render: ruta del MP4 (o del directorio de escenas) y duración del reel. */
export interface RenderReelResult {
  path: string;
  /** Duración del reel en ms (la de los tiempos usados para componerlo). */
  durationMs: number;
}

/**
 * Renderiza un carrusel como Reel animado 9:16 (1080×1920, 30 fps) en
 * <outDir>/<name>/reel.mp4. Compartido por `npm run reel` y `npm run remix --reel`.
 * Devuelve la ruta del MP4 (o del directorio de escenas si `framesOnly`).
 */
export async function renderReel(spec: CarouselSpec, opts: RenderReelOptions = {}): Promise<string> {
  return (await renderReelResult(spec, opts)).path;
}

/**
 * Igual que `renderReel`, pero devuelve también la duración del reel (ms), que
 * el calendario registra y usa en el QA del archivo final.
 */
export async function renderReelResult(spec: CarouselSpec, opts: RenderReelOptions = {}): Promise<RenderReelResult> {
  const base = join(process.cwd(), opts.outDir ?? "output", spec.name);
  const timing = specTiming(spec, { seconds: opts.seconds, fade: opts.fade, pace: opts.pace });
  if (!opts.framesOnly) assertFfmpeg();

  // Fondos `ai`/`image` resueltos a data URI antes de armar la página.
  const resolved: CarouselSpec = {
    ...spec,
    slides: await Promise.all(
      spec.slides.map(async (s) => {
        const props = { ...spec.defaults, ...s.props };
        const logo = opts.logoEnCuadro0 === false ? { logoEnCuadro0: false } : {};
        return { ...s, props: { ...s.props, ...logo, background: await resolveBackground(props.background) } };
      }),
    ),
  };
  const html = await buildReelPage(resolved, timing);
  const durationMs = Math.round(timing.total * 1000);

  if (opts.framesOnly) {
    const dir = join(base, "reel");
    const paths = await captureStills(html, timing, dir);
    console.log(`\n✓ ${paths.length} escenas de "${spec.name}" en ${dir}`);
    return { path: dir, durationMs };
  }

  await mkdir(base, { recursive: true });
  const mp4 = join(base, "reel.mp4");
  console.log(`⏳ Animando "${spec.name}" (${timing.scenes.length} escenas, ${timing.total}s, ${timing.frames} cuadros, ritmo ${timing.pace})…`);
  await captureReel(html, timing, mp4, { audio: opts.audio });
  console.log(`✓ Reel "${spec.name}" → ${mp4}  (${timing.total}s, 1080×1920${opts.audio ? "" : ", sin audio"})`);
  if (!opts.audio) console.log("  Súbelo y añádele un audio en tendencia dentro de la app.");
  return { path: mp4, durationMs };
}
