import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

/** Lo que importa de un video para decidir si se puede publicar como reel. */
export interface InfoVideo {
  ancho: number;
  alto: number;
  duracionMs: number;
  codec: string;
  tieneAudio: boolean;
}

const CODECS_VALIDOS = ["h264", "hevc"];
const MIN_MS = 3000;
const MAX_MS = 900_000;
const AVISO_MS = 90_000;

/** Errores (no se puede publicar) y avisos (se puede, pero conviene mirar). */
export function problemasVideo(i: InfoVideo): { errores: string[]; avisos: string[] } {
  const errores: string[] = [];
  const avisos: string[] = [];
  if (!(i.alto > i.ancho)) errores.push(`el video tiene que ser vertical (alto > ancho); este es ${i.ancho}x${i.alto}`);
  if (i.duracionMs < MIN_MS) errores.push(`el video dura ${(i.duracionMs / 1000).toFixed(1)} s; el mínimo es 3 s`);
  if (i.duracionMs > MAX_MS) errores.push(`el video dura ${Math.round(i.duracionMs / 1000)} s; el máximo es 900 s`);
  if (!CODECS_VALIDOS.includes(i.codec)) errores.push(`códec de video «${i.codec}» no sirve; se necesita h264 o hevc`);
  if (i.duracionMs <= MAX_MS && i.duracionMs > AVISO_MS) {
    avisos.push(`el video dura ${Math.round(i.duracionMs / 1000)} s; sobre 90 s Instagram puede no tratarlo como reel`);
  }
  if (i.alto > i.ancho && Math.abs(i.ancho / i.alto - 9 / 16) / (9 / 16) > 0.02) {
    avisos.push(`el aspecto es ${i.ancho}x${i.alto}, no 9:16; Instagram puede recortarlo`);
  }
  return { errores, avisos };
}

interface StreamProbe {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}

/** Lee el video con ffprobe (execFile, sin shell). Respeta la rotación de metadatos. */
export async function inspeccionarVideo(ruta: string): Promise<InfoVideo> {
  const { stdout } = await ejecutar("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", ruta], { maxBuffer: 16 * 1024 * 1024 });
  const j = JSON.parse(stdout) as { streams?: StreamProbe[]; format?: { duration?: string } };
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  if (!v || !v.width || !v.height) throw new Error(`«${ruta}» no tiene pista de video`);
  const rot = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const [ancho, alto] = rot === 90 ? [v.height, v.width] : [v.width, v.height];
  const seg = Number(j.format?.duration ?? v.duration ?? 0);
  return {
    ancho,
    alto,
    duracionMs: Math.round(seg * 1000),
    codec: v.codec_name ?? "desconocido",
    tieneAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

async function cuadro(ruta: string, segundo: number, destino: string, filtro: string): Promise<void> {
  await ejecutar("ffmpeg", ["-y", "-loglevel", "error", "-ss", segundo.toFixed(3), "-i", ruta, "-frames:v", "1", "-vf", filtro, "-q:v", "2", destino]);
}

const A_1080x1920 = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";

/**
 * Deja en `dir` la portada y la story (`cover.jpg`, `story.jpg`: cuadro a 1 s, o a la
 * mitad si el video dura menos de 2 s, a 1080x1920) y 6 cuadros repartidos
 * (`clave-1.jpg`…) para que el skill escriba el caption.
 */
export async function extraerCuadros(ruta: string, dir: string, info: InfoVideo): Promise<{ cover: string; story: string; clave: string[] }> {
  mkdirSync(dir, { recursive: true });
  const seg = info.duracionMs / 1000;
  const t = seg < 2 ? seg / 2 : 1;
  const cover = join(dir, "cover.jpg");
  const story = join(dir, "story.jpg");
  await cuadro(ruta, t, cover, A_1080x1920);
  await cuadro(ruta, t, story, A_1080x1920);
  const clave: string[] = [];
  for (let n = 1; n <= 6; n++) {
    // Centros de seis tramos iguales; el recorte evita pedir justo el último cuadro.
    const destino = join(dir, `clave-${n}.jpg`);
    await cuadro(ruta, Math.min(seg * ((n - 0.5) / 6), Math.max(seg - 0.1, 0)), destino, "scale=540:-2");
    clave.push(destino);
  }
  return { cover, story, clave };
}
