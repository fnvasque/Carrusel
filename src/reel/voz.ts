import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Narración de los reels con Kokoro-82M en local (voz en español, gratis;
 * referencias/kokoro.md de la base). Cada escena con `narracion` se sintetiza
 * por separado y se cachea por (texto, voz, velocidad) en `.cache/voz/`, así
 * re-renderizar no vuelve a sintetizar. El venv lo instala
 * `scripts/kokoro-install.sh`; `scripts/kokoro-tts.py` hace la síntesis.
 */

/** Voz por defecto (masculina, español; la eligió el usuario el 2026-10-17). */
export const VOZ_DEFECTO = "em_alex";
/** Voces en español de Kokoro v1.0 (VOICES.md). */
export const VOCES = ["em_alex", "em_santa", "ef_dora"] as const;
export type Voz = (typeof VOCES)[number];

/** Palabras por segundo medidas con em_alex (29 palabras en 9,8 s): para estimar sin sintetizar. */
export const PALABRAS_POR_SEGUNDO = 2.9;

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "scripts", "kokoro-tts.py");
const TIMEOUT_MS = 180_000;

/** Carpeta del venv de Kokoro (`CARRUSEL_KOKORO_DIR` o ~/.cache/carrusel/kokoro). */
export function kokoroDir(): string {
  return process.env.CARRUSEL_KOKORO_DIR?.trim() || join(homedir(), ".cache", "carrusel", "kokoro");
}

/** Valida el nombre de una voz; lanza en español. */
export function parseVoz(v: unknown): Voz {
  if ((VOCES as readonly unknown[]).includes(v)) return v as Voz;
  throw new Error(`La voz ${JSON.stringify(v)} no existe: usa ${VOCES.join(", ")} (voces en español de Kokoro).`);
}

/** Estimación (s) de lo que dura una narración sin sintetizarla (misma fórmula que validar.mjs). */
export function segundosEstimados(texto: string): number {
  const n = texto.trim().split(/\s+/).filter(Boolean).length;
  return +Math.max(1.0, n / PALABRAS_POR_SEGUNDO + 0.3).toFixed(2);
}

export interface Narracion {
  /** WAV mono 24 kHz. */
  path: string;
  /** Duración (s) del audio. */
  segundos: number;
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Carpeta de la caché de voz. `CARRUSEL_VOZ_CACHE_DIR` la cambia (los tests usan una temporal). */
function cacheDir(): string {
  return process.env.CARRUSEL_VOZ_CACHE_DIR?.trim() || join(process.cwd(), ".cache", "voz");
}

/** Texto tal como se narra y se cachea: espacios colapsados y sin bordes. */
const limpiar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/**
 * Rutas de la caché de una narración (WAV y metadatos), con la MISMA clave que usa
 * `sintetizar`: (texto limpio, voz, velocidad, modelo).
 */
export function rutaCacheVoz(texto: string, voz: Voz = VOZ_DEFECTO, velocidad = 1.0): { wav: string; meta: string } {
  const key = sha(`${limpiar(texto)}|${voz}|${velocidad}|kokoro-82M`);
  return { wav: join(cacheDir(), `${key}.wav`), meta: join(cacheDir(), `${key}.json`) };
}

/** Lee la caché válida de una narración (WAV presente y metadatos con `segundos` > 0), o undefined. */
async function leerCacheVoz(texto: string, voz: Voz, velocidad: number): Promise<Narracion | undefined> {
  const { wav, meta } = rutaCacheVoz(texto, voz, velocidad);
  if (!existsSync(wav) || !existsSync(meta)) return undefined;
  try {
    const m = JSON.parse(await readFile(meta, "utf8")) as { segundos?: number };
    if (typeof m.segundos === "number" && m.segundos > 0) return { path: wav, segundos: m.segundos };
  } catch {
    // caché rota: se vuelve a sintetizar
  }
  return undefined;
}

/**
 * ¿`sintetizar(texto, voz, { velocidad })` saldría de la caché sin llamar a Kokoro? Mismo
 * criterio que `sintetizar` (WAV y metadatos válidos). Sin efectos; nunca lanza.
 */
export function enCacheVoz(texto: string, voz: Voz = VOZ_DEFECTO, velocidad = 1.0): boolean {
  try {
    if (!limpiar(texto)) return false;
    const { wav, meta } = rutaCacheVoz(texto, voz, velocidad);
    if (!existsSync(wav) || !existsSync(meta)) return false;
    const m = JSON.parse(readFileSync(meta, "utf8")) as { segundos?: number };
    return typeof m.segundos === "number" && m.segundos > 0;
  } catch {
    return false;
  }
}

/** Duración (s) de un archivo de audio según ffprobe. */
export function duracionAudio(path: string): number {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8", timeout: 30_000 });
  const n = Number(String(r.stdout).trim());
  if (r.status !== 0 || !Number.isFinite(n) || n <= 0) throw new Error(`No se pudo leer la duración de ${path}: ${String(r.stderr).trim() || "ffprobe no respondió"}`);
  return +n.toFixed(3);
}

/** Entorno del venv: espeak-ng de Homebrew como respaldo de fonemas (el loader de pip trae una ruta rota en macOS). */
function entornoKokoro(): NodeJS.ProcessEnv {
  const prefix = process.env.HOMEBREW_PREFIX?.trim() || (existsSync("/opt/homebrew") ? "/opt/homebrew" : "/usr/local");
  return {
    ...process.env,
    ESPEAK_DATA_PATH: process.env.ESPEAK_DATA_PATH ?? join(prefix, "share", "espeak-ng-data"),
    PHONEMIZER_ESPEAK_LIBRARY: process.env.PHONEMIZER_ESPEAK_LIBRARY ?? join(prefix, "lib", "libespeak-ng.dylib"),
    PYTHONWARNINGS: "ignore",
  };
}

/**
 * Sintetiza `texto` con la voz dada (o la devuelve de la caché). Lanza un error
 * claro en español si Kokoro no está instalado o falla.
 */
export async function sintetizar(texto: string, voz: Voz = VOZ_DEFECTO, opts: { velocidad?: number } = {}): Promise<Narracion> {
  const limpio = limpiar(texto);
  if (!limpio) throw new Error("La narración está vacía.");
  const velocidad = opts.velocidad ?? 1.0;
  const { wav, meta } = rutaCacheVoz(limpio, voz, velocidad);
  const cache = await leerCacheVoz(limpio, voz, velocidad);
  if (cache) return cache;
  const python = join(kokoroDir(), "bin", "python");
  if (!existsSync(python)) {
    throw new Error(`Kokoro no está instalado (no existe ${python}). Corre scripts/kokoro-install.sh y vuelve a intentar.`);
  }
  await mkdir(dirname(wav), { recursive: true });
  const tmp = `${wav}.tmp.wav`;
  const r = spawnSync(python, [SCRIPT, "--voz", voz, "--out", tmp, "--velocidad", String(velocidad)], {
    input: limpio,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    env: entornoKokoro(),
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error || r.status !== 0 || !existsSync(tmp)) {
    const err = (r.stderr || "").split("\n").filter((l) => l.trim() && !/Warning|warn\(|redirects\.py|WeightNorm|LSTM/.test(l)).slice(-4).join("\n");
    throw new Error(`Kokoro falló al narrar «${limpio.slice(0, 60)}…»: ${r.error?.message ?? err ?? `código ${r.status}`}`);
  }
  const segundos = duracionAudio(tmp);
  await writeFile(meta, JSON.stringify({ texto: limpio, voz, velocidad, segundos }));
  const { rename } = await import("node:fs/promises");
  await rename(tmp, wav);
  return { path: wav, segundos };
}

/**
 * Textos que `narrarEscenas` sintetiza (en `renderReelResult`): la `narracion` de cada escena
 * (props sobre defaults), solo si es un texto no vacío. Un solo lugar para el render y para la
 * precondición de caché de la fase 3.
 */
export function textosNarracion(spec: { defaults?: Record<string, unknown>; slides: { props: Record<string, unknown> }[] }): (string | undefined)[] {
  return spec.slides.map((s) => {
    const n = ({ ...spec.defaults, ...s.props } as { narracion?: unknown }).narracion;
    return typeof n === "string" && n.trim() ? n : undefined;
  });
}

/**
 * Narraciones de un reel: una por escena con `narracion` (texto), en el mismo
 * orden que las escenas; `undefined` donde no hay. Sintetiza en serie (Kokoro
 * carga el modelo por llamada; la caché evita repetir).
 */
export async function narrarEscenas(textos: (string | undefined)[], voz: Voz = VOZ_DEFECTO): Promise<(Narracion | undefined)[]> {
  const out: (Narracion | undefined)[] = [];
  for (const t of textos) out.push(t && t.trim() ? await sintetizar(t, voz) : undefined);
  return out;
}
