import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { specDurations } from "../reel/timing.ts";
import type { CarouselSpec } from "../templates/types.ts";

/**
 * QA del archivo final (en el Mac, tras el render, sin juicio humano): que el
 * cuadro 0 no sea una pantalla negra, que haya texto en la zona segura, que el
 * MP4 lleve audio audible y que cada texto se vea el tiempo de lectura. Nada
 * lanza ante archivos malos: siempre devuelve un `QaResultado` con motivos.
 */

export interface QaResultado {
  ok: boolean;
  motivos: string[];
}

/** Parte de la puerta del calendario que usa el QA (ritmo de lectura). */
export interface Puerta {
  lecturaPalabrasPorSegundo: number;
  lecturaMinSegundos: number;
}

/** Luminancia media (0..1) del buffer en escala de grises. Vacío → 0. */
export function luminanciaMedia(gray: Uint8Array): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return sum / gray.length / 255;
}

/** Contraste local mínimo (0..255) con la mediana de la banda para contar un píxel como texto. */
const CONTRASTE_MIN = 70;
/** Fracción mínima de píxeles de la banda con contraste local para dar por hecho que hay texto. */
const FRACCION_TEXTO = 0.004;

/**
 * ¿Hay texto en la banda vertical [desde, hasta] (fracciones del alto)? Cuenta
 * los píxeles que difieren de la mediana de la banda en más de CONTRASTE_MIN:
 * sirve igual para texto claro sobre fondo oscuro que oscuro sobre claro, y una
 * grilla tenue o un fondo liso no lo disparan.
 */
export function hayTextoEnZona(gray: Uint8Array, width: number, height: number, desde = 0.15, hasta = 0.75): boolean {
  if (width <= 0 || height <= 0 || gray.length < width * height) return false;
  const y0 = Math.max(0, Math.floor(height * desde));
  const y1 = Math.min(height, Math.ceil(height * hasta));
  const total = (y1 - y0) * width;
  if (total <= 0) return false;
  const hist = new Array<number>(256).fill(0);
  for (let i = y0 * width; i < y1 * width; i++) hist[gray[i]]++;
  let acc = 0;
  let mediana = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total / 2) {
      mediana = v;
      break;
    }
  }
  let distintos = 0;
  for (let v = 0; v < 256; v++) if (Math.abs(v - mediana) > CONTRASTE_MIN) distintos += hist[v];
  return distintos / total >= FRACCION_TEXTO;
}

/** Props cuyo texto hay que leer (las mismas que alargan la escena en el motor). */
const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note", "value", "label", "context", "prompt"];

function palabras(props: Record<string, unknown>): number {
  let n = 0;
  for (const k of TEXT_KEYS) {
    const v = props[k];
    const texto = typeof v === "string" ? v : Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : "";
    n += texto.split(/\s+/).filter(Boolean).length;
  }
  return n;
}

/**
 * Escenas que no se ven el tiempo suficiente: duración < max(minS, palabras ÷
 * wps). `duraciones` (s por escena) por defecto son las del motor para el ritmo
 * del spec. Devuelve un mensaje en español por escena.
 */
export function tiemposDeLectura(spec: CarouselSpec, wps: number, minS: number, duraciones?: number[]): string[] {
  const durs = duraciones ?? specDurations(spec);
  const out: string[] = [];
  spec.slides.forEach((slide, i) => {
    const props = { ...spec.defaults, ...slide.props } as Record<string, unknown>;
    const n = palabras(props);
    const necesita = Math.max(minS, wps > 0 ? n / wps : 0);
    const dur = durs[i] ?? 0;
    if (dur + 1e-6 < necesita) {
      out.push(`La escena ${i + 1} dura ${dur.toFixed(1)} s y necesita al menos ${necesita.toFixed(1)} s para leer ${n} palabras.`);
    }
  });
  return out;
}

/** Un cuadro (imagen o primer cuadro de un video) escalado a width×height en grises. Lanza si no se puede leer. */
export async function grisDeImagen(path: string, width: number, height: number): Promise<Uint8Array> {
  if (!existsSync(path)) throw new Error(`no existe el archivo ${path}`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-vf", `scale=${width}:${height},format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"], {
    maxBuffer: width * height + 1024,
  });
  if (r.error) throw new Error(`no se pudo ejecutar ffmpeg: ${r.error.message}`);
  const buf = r.stdout as Buffer;
  if (r.status !== 0 || buf.length !== width * height) throw new Error(`no se pudo leer un cuadro de ${path}`);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

/** ¿El MP4 tiene al menos una pista de audio? (false si no existe o está dañado). */
export async function tieneAudio(mp4: string): Promise<boolean> {
  if (!existsSync(mp4)) return false;
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", mp4], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().length > 0;
}

/** Volumen máximo (dB) de la pista de audio; -Infinity si es silencio absoluto; undefined si no se pudo medir. */
function volumenMaximo(mp4: string): number | undefined {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", mp4, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const m = /max_volume:\s*(-?inf|-?[\d.]+)\s*dB/.exec(r.stderr ?? "");
  if (!m) return undefined;
  return /inf/.test(m[1]) ? -Infinity : Number(m[1]);
}

const LUMINANCIA_MIN = 0.12;
const AUDIO_MUDO_DB = -60;
const ANCHO = 540;
const ALTO = 960;

function resultado(motivos: string[]): QaResultado {
  return { ok: motivos.length === 0, motivos };
}

function razon(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Motivos de un cuadro: pantalla negra y (opcional) falta de texto en zona segura. */
function motivosDeCuadro(gray: Uint8Array, w: number, h: number, que: string, conTexto: boolean): string[] {
  const m: string[] = [];
  if (luminanciaMedia(gray) <= LUMINANCIA_MIN) m.push(`${que} es una pantalla negra (luminancia media ≤ 12 %).`);
  if (conTexto && !hayTextoEnZona(gray, w, h)) m.push(`No se detecta texto en la zona segura (15-75 % vertical) de ${que}.`);
  return m;
}

/**
 * QA de un reel: cuadro 0 no negro, portada con texto en zona segura, audio
 * presente y audible, y tiempos de lectura de cada escena. Nunca lanza.
 */
export async function qaReel(mp4: string, cover: string, spec: CarouselSpec, puerta: Puerta): Promise<QaResultado> {
  const motivos: string[] = [];
  if (!existsSync(mp4)) return resultado([`No existe el reel ${mp4}.`]);
  try {
    const frame0 = await grisDeImagen(mp4, ANCHO, ALTO);
    motivos.push(...motivosDeCuadro(frame0, ANCHO, ALTO, "El cuadro 0 del reel", false));
  } catch (e) {
    motivos.push(`No se pudo leer el cuadro 0 del reel (¿archivo truncado o dañado?): ${razon(e)}`);
  }
  try {
    const portada = await grisDeImagen(cover, ANCHO, ALTO);
    motivos.push(...motivosDeCuadro(portada, ANCHO, ALTO, "La portada", true));
  } catch (e) {
    motivos.push(`No se pudo leer la portada: ${razon(e)}`);
  }
  if (!(await tieneAudio(mp4))) {
    motivos.push("El reel está sin audio (no tiene pista de audio).");
  } else {
    const vol = volumenMaximo(mp4);
    if (vol === undefined) motivos.push("No se pudo medir el volumen del audio del reel.");
    else if (vol < AUDIO_MUDO_DB) motivos.push(`Hay audio mudo: la pista está en silencio (volumen máximo ${Number.isFinite(vol) ? vol.toFixed(1) : "-inf"} dB < ${AUDIO_MUDO_DB} dB).`);
  }
  try {
    motivos.push(...tiemposDeLectura(spec, puerta.lecturaPalabrasPorSegundo, puerta.lecturaMinSegundos));
  } catch (e) {
    motivos.push(`No se pudieron comprobar los tiempos de lectura: ${razon(e)}`);
  }
  return resultado(motivos);
}

/** QA de una imagen (portada de carrusel o story): no negra y con texto en zona segura. Nunca lanza. */
export async function qaImagen(jpg: string, width: number, height: number): Promise<QaResultado> {
  if (!existsSync(jpg)) return resultado([`No existe la imagen ${jpg}.`]);
  try {
    const gray = await grisDeImagen(jpg, width, height);
    return resultado(motivosDeCuadro(gray, width, height, "La imagen", true));
  } catch (e) {
    return resultado([`No se pudo leer la imagen (¿archivo truncado o dañado?): ${razon(e)}`]);
  }
}
