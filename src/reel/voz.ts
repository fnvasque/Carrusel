import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
const CACHE_DIR = join(process.cwd(), ".cache", "voz");
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
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) throw new Error("La narración está vacía.");
  const velocidad = opts.velocidad ?? 1.0;
  const key = sha(`${limpio}|${voz}|${velocidad}|kokoro-82M`);
  const wav = join(CACHE_DIR, `${key}.wav`);
  const meta = join(CACHE_DIR, `${key}.json`);
  if (existsSync(wav) && existsSync(meta)) {
    try {
      const m = JSON.parse(await readFile(meta, "utf8")) as { segundos?: number };
      if (typeof m.segundos === "number" && m.segundos > 0) return { path: wav, segundos: m.segundos };
    } catch {
      // caché rota: se vuelve a sintetizar
    }
  }
  const python = join(kokoroDir(), "bin", "python");
  if (!existsSync(python)) {
    throw new Error(`Kokoro no está instalado (no existe ${python}). Corre scripts/kokoro-install.sh y vuelve a intentar.`);
  }
  await mkdir(CACHE_DIR, { recursive: true });
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
 * Narraciones de un reel: una por escena con `narracion` (texto), en el mismo
 * orden que las escenas; `undefined` donde no hay. Sintetiza en serie (Kokoro
 * carga el modelo por llamada; la caché evita repetir).
 */
export async function narrarEscenas(textos: (string | undefined)[], voz: Voz = VOZ_DEFECTO): Promise<(Narracion | undefined)[]> {
  const out: (Narracion | undefined)[] = [];
  for (const t of textos) out.push(t && t.trim() ? await sintetizar(t, voz) : undefined);
  return out;
}
