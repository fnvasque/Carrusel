import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { esEscenaClip, type ReelTiming } from "../reel/timing.ts";
import type { CarouselSpec } from "../templates/types.ts";

/**
 * Escenas `Clip` del calendario (video generado como contenido): el motor
 * renderiza el texto sobre el fondo casi negro y aquí se calcula en qué
 * segundos se ve cada clip y se mezcla con ffmpeg a pantalla completa, con el
 * mismo truco que `scripts/reel-hook-video.sh`: el clip oscurecido entra en
 * blend `lighten`, así el texto blanco y el lima quedan encima.
 *
 * Los clips viven en la caché del Mac (`CLIPS_DIR`, por defecto
 * ~/.cache/carrusel/clips/<semana>/<id>/<archivo>), fuera de la base.
 */

/** Cuánto se oscurece el clip (1 = tal cual). Más alto que en `hookVideo` (0.45): aquí el video es el contenido. */
export const CLIP_BRILLO = 0.7;
/** Fundido (s) al entrar y salir de cada clip; no se aplica al entrar en t = 0. */
export const CLIP_FADE = 0.25;
/** Carpeta de la caché de clips si no viene `CLIPS_DIR`. */
export const CLIPS_DIR_DEFECTO = join(homedir(), ".cache", "carrusel", "clips");
/** Nombre de archivo permitido: solo un .mp4 sin rutas. */
export const ARCHIVO_CLIP_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,120}\.mp4$/;

export interface RangoClip {
  /** Índice de la escena (0 = portada). */
  escena: number;
  archivo: string;
  /** Segundo del reel en que empieza a verse el clip. */
  inicio: number;
  /** Segundo en que deja de verse. */
  fin: number;
}

/** Motivo por el que `archivo` no sirve como nombre de clip, o undefined. */
export function archivoClipError(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return "archivo debe ser el nombre de un clip .mp4 (texto no vacío)";
  if (v.includes("..") || !ARCHIVO_CLIP_RE.test(v)) return `archivo ${JSON.stringify(v)} inválido: solo un nombre .mp4 sin rutas (letras, números, _ . -)`;
  return undefined;
}

/** Ruta del clip en la caché: <clipsDir>/<semana>/<id>/<archivo>. */
export function rutaClip(clipsDir: string, semana: string, id: string, archivo: string): string {
  return join(clipsDir, semana, id, archivo);
}

/**
 * Rutas de los clips que el borrador necesita y no están en la caché. Se
 * comprueba antes de abrir Chromium: no depende de los tiempos del reel.
 */
export function clipsFaltantes(slides: { props: Record<string, unknown>; [k: string]: unknown }[], clipsDir: string, semana: string, id: string): string[] {
  return slides
    .filter((s) => esEscenaClip(s.props))
    .map((s) => rutaClip(clipsDir, semana, id, String(s.props.archivo)))
    .filter((ruta) => !existsSync(ruta));
}

/**
 * Rango de cada escena `Clip` según los tiempos del reel: la escena 0 se ve
 * desde 0; las demás desde que termina la transición de entrada hasta que
 * empieza la de salida (la última, hasta su fin).
 */
export function rangosClips(spec: CarouselSpec, timing: ReelTiming): RangoClip[] {
  const last = spec.slides.length - 1;
  const out: RangoClip[] = [];
  spec.slides.forEach((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    if (!esEscenaClip(props)) return;
    const s = timing.scenes[i];
    const inicio = i === 0 ? 0 : s.start + timing.transition;
    const fin = s.start + s.dur - (i === last ? 0 : timing.transition);
    out.push({ escena: i, archivo: String(props.archivo), inicio: +inicio.toFixed(3), fin: +fin.toFixed(3) });
  });
  return out;
}

const num = (n: number): string => String(+n.toFixed(3));

/**
 * `-filter_complex` que mezcla los clips (entradas 1..n; el reel es la 0):
 * cada clip se escala/recorta al cuadro, se recorta a su duración, congela su
 * último cuadro si es más corto, se oscurece, se funde y se desplaza a su
 * `inicio` con negro antes y después; luego se encadenan en blend lighten.
 */
export function filtroClips(rangos: RangoClip[], dim: { width: number; height: number; fps: number }): string {
  const partes: string[] = ["[0:v]format=gbrp[v0]"];
  rangos.forEach((r, k) => {
    const dur = +(r.fin - r.inicio).toFixed(3);
    const cadena = [
      `scale=${dim.width}:${dim.height}:force_original_aspect_ratio=increase`,
      `crop=${dim.width}:${dim.height}`,
      `fps=${dim.fps}`,
      `trim=duration=${num(dur)}`,
      "setpts=PTS-STARTPTS",
      `tpad=stop_mode=clone:stop_duration=${num(dur)}`,
      `trim=duration=${num(dur)}`,
      `colorchannelmixer=rr=${CLIP_BRILLO}:gg=${CLIP_BRILLO}:bb=${CLIP_BRILLO}`,
      ...(r.inicio > 0 ? [`fade=t=in:st=0:d=${CLIP_FADE}`] : []),
      `fade=t=out:st=${(dur - CLIP_FADE).toFixed(3)}:d=${CLIP_FADE}`,
      ...(r.inicio > 0 ? [`tpad=start_duration=${num(r.inicio)}:start_mode=add:color=black`] : []),
      "tpad=stop_mode=add:stop_duration=36000:color=black",
      "format=gbrp",
    ];
    partes.push(`[${k + 1}:v]${cadena.join(",")}[c${k + 1}]`);
  });
  rangos.forEach((_, k) => {
    const ultimo = k === rangos.length - 1;
    partes.push(`[v${k}][c${k + 1}]blend=all_mode=lighten:shortest=1${ultimo ? ",format=yuv420p[v]" : `[v${k + 1}]`}`);
  });
  return partes.join(";");
}

/** Ancho, alto y fps del reel (ffprobe). */
export function dimensionesDe(mp4: string): { width: number; height: number; fps: number } {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", mp4], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`ffprobe no pudo leer ${mp4}: ${r.error?.message ?? r.stderr}`);
  const [w, h, fr] = r.stdout.trim().split(",");
  const [a, b] = fr.split("/").map(Number);
  return { width: Number(w), height: Number(h), fps: Math.round(b ? a / b : a) };
}

/**
 * Mezcla los clips sobre `reel` y escribe `salida` (video recodificado, audio
 * copiado tal cual). Lanza si ffmpeg falla.
 */
export function mezclarClips(reel: string, clips: { ruta: string; rango: RangoClip }[], salida: string): Promise<void> {
  const dim = dimensionesDe(reel);
  const args = [
    "-v", "error", "-y", "-i", reel,
    ...clips.flatMap((c) => ["-i", c.ruta]),
    "-filter_complex", filtroClips(clips.map((c) => c.rango), dim),
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "copy", "-movflags", "+faststart",
    salida,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => reject(new Error(`no se pudo ejecutar ffmpeg: ${e.message}`)));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`la mezcla de clips terminó con código ${code}: ${err.trim().split("\n").slice(-2).join(" ")}`))));
  });
}
