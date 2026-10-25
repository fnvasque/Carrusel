import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolveBackground } from "../render/background.ts";
import type { CarouselSpec, Pace } from "../templates/types.ts";
import { buildReelPage } from "./page.ts";
import { captureReel, captureStills, assertFfmpeg, type VozEnReel } from "./capture.ts";
import { maxSecondsError, specTiming, type Lectura, type ReelTiming } from "./timing.ts";
import { narrarEscenas, textosNarracion, VOZ_DEFECTO, type Voz } from "./voz.ts";
import type { ModoRevision } from "../render/revision.ts";

export interface RenderReelOptions {
  /** Carpeta base de salida (por defecto "output"). El reel va en <outDir>/<name>/. */
  outDir?: string;
  /** Override de duración uniforme por escena (s); por defecto según texto. */
  seconds?: number;
  /** Duración de la transición entre escenas (s); por defecto, la del ritmo. */
  fade?: number;
  /** Ritmo del reel; sobrescribe el `pace` del carrusel (por defecto "ensenar"). */
  pace?: Pace;
  /**
   * Tope de duración del reel (s): si los tiempos calculados lo superan, falla
   * antes de abrir Chromium con un mensaje claro (`duracionMaxSegundos` del
   * calendario, `--max-seconds` del CLI).
   */
  maxSeconds?: number;
  /** Pista de audio opcional a muxear. */
  audio?: string;
  /** Solo exportar un PNG por escena (estado final), sin componer el video. */
  framesOnly?: boolean;
  /**
   * Wordmark desde el cuadro 0 (por defecto true). Con false, el logo de cada
   * escena entra a los 3 s (experimento del calendario, `data-anim="late"`).
   */
  logoEnCuadro0?: boolean;
  /**
   * Voz de la narración (Kokoro) de las escenas con `narracion`; por defecto
   * VOZ_DEFECTO. Con `false` no se narra (las escenas con `narracion` se
   * renderizan igual, sin voz ni subtítulo alargado).
   */
  voz?: Voz | false;
  /**
   * Revisión visual del reel antes de capturar: `avisar` (por defecto, CLI) solo
   * escribe en consola; `bloquear` (calendario) lanza `ErrorVisual` sin componer el
   * video; `no` no revisa. No aplica a `framesOnly`.
   */
  revision?: ModoRevision;
  /** Ritmo de lectura: alarga las escenas narradas hasta que se alcancen a leer (calendario). */
  lectura?: Lectura;
}

/** Resultado del render: ruta del MP4 (o del directorio de escenas) y duración del reel. */
export interface RenderReelResult {
  path: string;
  /** Duración del reel en ms (la de los tiempos usados para componerlo). */
  durationMs: number;
  /** Tiempos con que se compuso (incluyen las escenas alargadas por la narración). */
  timing: ReelTiming;
  /** Narraciones sintetizadas, una por escena narrada (vacío sin voz). */
  voces: VozEnReel[];
}

/** Segundos tras el inicio de la escena en que empieza a hablar (deja entrar el texto). */
export const VOZ_ENTRADA = 0.2;

/**
 * Dónde empieza cada narración: el inicio de su escena (más media transición,
 * salvo la escena 0, que arranca en 0) y VOZ_ENTRADA. Puro, para los tests.
 */
export function inicioVoces(timing: ReelTiming, narradas: (string | undefined)[]): number[] {
  return timing.scenes.map((s, i) => (narradas[i] ? +(s.start + (i === 0 ? 0 : timing.transition / 2) + VOZ_ENTRADA).toFixed(3) : NaN));
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
  // Narración: se sintetiza antes de calcular los tiempos (cada escena dura al menos su voz).
  const textos = textosNarracion(spec);
  const narrar = opts.voz !== false && !opts.framesOnly && textos.some(Boolean);
  const narraciones = narrar ? await narrarEscenas(textos, opts.voz || VOZ_DEFECTO) : [];
  const timing = specTiming(spec, {
    seconds: opts.seconds,
    fade: opts.fade,
    pace: opts.pace,
    ...(narrar ? { narracion: narraciones.map((n) => n?.segundos), lectura: opts.lectura } : {}),
  });
  const exceso = maxSecondsError(timing.total, opts.maxSeconds);
  if (exceso) throw new Error(exceso);
  if (!opts.framesOnly) assertFfmpeg();
  const inicios = inicioVoces(timing, textos);
  const voces: VozEnReel[] = narrar ? narraciones.flatMap((n, i) => (n ? [{ path: n.path, start: inicios[i] }] : [])) : [];

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
  const html = await buildReelPage(resolved, timing, {
    voces: narraciones.map((n, i) => (n ? { start: inicios[i], segundos: n.segundos } : undefined)),
  });
  const durationMs = Math.round(timing.total * 1000);

  if (opts.framesOnly) {
    const dir = join(base, "reel");
    const paths = await captureStills(html, timing, dir);
    console.log(`\n✓ ${paths.length} escenas de "${spec.name}" en ${dir}`);
    return { path: dir, durationMs, timing, voces: [] };
  }

  await mkdir(base, { recursive: true });
  const mp4 = join(base, "reel.mp4");
  const vozTxt = voces.length ? `, ${voces.length} escenas narradas (${opts.voz ?? VOZ_DEFECTO})` : "";
  console.log(`⏳ Animando "${spec.name}" (${timing.scenes.length} escenas, ${timing.total}s, ${timing.frames} cuadros, ritmo ${timing.pace}${vozTxt})…`);
  await captureReel(html, timing, mp4, { audio: opts.audio, voces, revision: opts.revision });
  console.log(`✓ Reel "${spec.name}" → ${mp4}  (${timing.total}s, 1080×1920${opts.audio || voces.length ? "" : ", sin audio"})`);
  if (!opts.audio && !voces.length) console.log("  Súbelo y añádele un audio en tendencia dentro de la app.");
  return { path: mp4, durationMs, timing, voces };
}
