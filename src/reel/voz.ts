import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Narración de los reels con Kokoro-82M en local (voz en español, gratis;
 * referencias/kokoro.md de la base). Cada escena con `narracion` se sintetiza
 * por separado y se cachea por (texto, voz, velocidad) en `.cache/voz/`, así
 * re-renderizar no vuelve a sintetizar. El venv lo instala
 * `scripts/kokoro-install.sh`; `scripts/kokoro-tts.py` hace la síntesis.
 *
 * Con `VOZ_PROVEEDOR=elevenlabs` narra la voz clonada del usuario por la API de
 * ElevenLabs (OpenRouter no acepta voces clonadas de una cuenta; spec
 * docs/superpowers/specs/2026-10-28-voz-elevenlabs-design.md), con Kokoro de respaldo.
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

/** Modelo de ElevenLabs por defecto (el que su documentación recomienda para voces clonadas). */
export const ELEVENLABS_MODELO_DEFECTO = "eleven_v4";
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_TIMEOUT_MS = 60_000;
/** PCM 16 bit mono a 24 kHz: 48 000 bytes por segundo. */
const PCM_HZ = 24_000;

/** Quién narra. La clave de la API vive solo aquí (de `.env`): nunca va a logs, errores ni a la caché. */
export type ProveedorVoz = { tipo: "kokoro" } | { tipo: "elevenlabs"; voiceId: string; modelo: string; apiKey: string };

let avisadoConfig = false;

/**
 * Proveedor según `.env`: `VOZ_PROVEEDOR=elevenlabs` con `ELEVENLABS_API_KEY` y
 * `ELEVENLABS_VOICE_ID` (y `ELEVENLABS_MODEL` opcional). Sin la variable, Kokoro. Si
 * pide ElevenLabs y falta un dato, avisa una vez y usa Kokoro.
 */
export function proveedorVoz(env: NodeJS.ProcessEnv = process.env): ProveedorVoz {
  const tipo = env.VOZ_PROVEEDOR?.trim().toLowerCase() || "kokoro";
  if (tipo === "kokoro") return { tipo: "kokoro" };
  if (tipo !== "elevenlabs") throw new Error(`VOZ_PROVEEDOR=${JSON.stringify(tipo)} no existe: usa kokoro o elevenlabs.`);
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId) {
    if (!avisadoConfig) console.warn(`⚠ VOZ_PROVEEDOR=elevenlabs pero falta ${!apiKey ? "ELEVENLABS_API_KEY" : "ELEVENLABS_VOICE_ID"} en .env: narro con Kokoro.`);
    avisadoConfig = true;
    return { tipo: "kokoro" };
  }
  return { tipo: "elevenlabs", apiKey, voiceId, modelo: env.ELEVENLABS_MODEL?.trim() || ELEVENLABS_MODELO_DEFECTO };
}

/** Nombre corto para logs (sin la clave). */
export function nombreProveedor(p: ProveedorVoz, voz: Voz = VOZ_DEFECTO): string {
  return p.tipo === "kokoro" ? `Kokoro ${voz}` : `ElevenLabs ${p.modelo}`;
}

export interface Narracion {
  /** WAV mono 24 kHz. */
  path: string;
  /** Duración (s) del audio. */
  segundos: number;
  /** Quién la narró (para el log del render); falta en lo que no sale de `sintetizar`. */
  proveedor?: ProveedorVoz["tipo"];
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
 * `sintetizar`: Kokoro por (texto limpio, voz, velocidad, modelo), como siempre;
 * ElevenLabs por (texto limpio, voice_id, modelo, velocidad), así otra voz u otro
 * modelo generan audio nuevo y el mismo nunca se paga dos veces.
 */
export function rutaCacheVoz(texto: string, voz: Voz = VOZ_DEFECTO, velocidad = 1.0, proveedor: ProveedorVoz = { tipo: "kokoro" }): { wav: string; meta: string } {
  const key =
    proveedor.tipo === "kokoro"
      ? sha(`${limpiar(texto)}|${voz}|${velocidad}|kokoro-82M`)
      : sha(`${limpiar(texto)}|elevenlabs|${proveedor.voiceId}|${proveedor.modelo}|${velocidad}`);
  return { wav: join(cacheDir(), `${key}.wav`), meta: join(cacheDir(), `${key}.json`) };
}

/** Lee la caché válida de una narración (WAV presente y metadatos con `segundos` > 0), o undefined. */
async function leerCacheVoz(texto: string, voz: Voz, velocidad: number, proveedor: ProveedorVoz): Promise<Narracion | undefined> {
  const { wav, meta } = rutaCacheVoz(texto, voz, velocidad, proveedor);
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
 * ¿`sintetizar(texto, voz, { velocidad })` saldría de la caché sin llamar a Kokoro ni a
 * ElevenLabs? Mira la caché del proveedor activo (`proveedorVoz()`), con el mismo criterio
 * que `sintetizar` (WAV y metadatos válidos). Sin efectos; nunca lanza.
 */
export function enCacheVoz(texto: string, voz: Voz = VOZ_DEFECTO, velocidad = 1.0, proveedor?: ProveedorVoz): boolean {
  try {
    if (!limpiar(texto)) return false;
    const { wav, meta } = rutaCacheVoz(texto, voz, velocidad, proveedor ?? proveedorVoz());
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

/** WAV (PCM 16 bit mono) con su cabecera de 44 bytes alrededor de `pcm` crudo. */
export function wavDePcm(pcm: Buffer, hz = PCM_HZ): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16); // tamaño del bloque fmt
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(hz, 24);
  h.writeUInt32LE(hz * 2, 28); // bytes por segundo
  h.writeUInt16LE(2, 32); // bytes por muestra
  h.writeUInt16LE(16, 34); // bits
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Llama a la API de texto a voz de ElevenLabs y guarda el WAV en `tmp`; devuelve los segundos. */
async function sintetizarElevenLabs(limpio: string, p: Extract<ProveedorVoz, { tipo: "elevenlabs" }>, velocidad: number, tmp: string): Promise<number> {
  const url = `${ELEVENLABS_URL}/${encodeURIComponent(p.voiceId)}?output_format=pcm_24000`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": p.apiKey, "Content-Type": "application/json", Accept: "audio/pcm" },
      body: JSON.stringify({ text: limpio, model_id: p.modelo, language_code: "es", voice_settings: { speed: velocidad } }),
      signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`ElevenLabs no respondió al narrar «${limpio.slice(0, 60)}…»: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const detalle = (await res.text().catch(() => "")).replaceAll(p.apiKey, "***").slice(0, 300);
    throw new Error(`ElevenLabs falló al narrar «${limpio.slice(0, 60)}…» (HTTP ${res.status}): ${detalle || res.statusText}`);
  }
  const pcm = Buffer.from(await res.arrayBuffer());
  if (pcm.length < PCM_HZ * 2 * 0.1 || pcm.length % 2) throw new Error(`ElevenLabs devolvió un audio inválido (${pcm.length} bytes) para «${limpio.slice(0, 60)}…».`);
  await writeFile(tmp, wavDePcm(pcm));
  return +(pcm.length / (PCM_HZ * 2)).toFixed(3);
}

/**
 * Sintetiza `texto` con el proveedor activo (`proveedorVoz()`, o `opts.proveedor`) y la
 * voz de Kokoro dada, o la devuelve de la caché. Lanza un error claro en español si
 * Kokoro no está instalado o falla, o si ElevenLabs falla (sin la clave en el mensaje).
 */
export async function sintetizar(texto: string, voz: Voz = VOZ_DEFECTO, opts: { velocidad?: number; proveedor?: ProveedorVoz } = {}): Promise<Narracion> {
  const limpio = limpiar(texto);
  if (!limpio) throw new Error("La narración está vacía.");
  const velocidad = opts.velocidad ?? 1.0;
  const proveedor = opts.proveedor ?? proveedorVoz();
  const { wav, meta } = rutaCacheVoz(limpio, voz, velocidad, proveedor);
  const cache = await leerCacheVoz(limpio, voz, velocidad, proveedor);
  if (cache) return { ...cache, proveedor: proveedor.tipo };
  if (proveedor.tipo === "elevenlabs") {
    await mkdir(dirname(wav), { recursive: true });
    const tmp = `${wav}.tmp.wav`;
    const segundos = await sintetizarElevenLabs(limpio, proveedor, velocidad, tmp);
    await writeFile(meta, JSON.stringify({ texto: limpio, proveedor: "elevenlabs", voiceId: proveedor.voiceId, modelo: proveedor.modelo, velocidad, segundos }));
    await rename(tmp, wav);
    return { path: wav, segundos, proveedor: "elevenlabs" };
  }
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
  await rename(tmp, wav);
  return { path: wav, segundos, proveedor: "kokoro" };
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
 * carga el modelo por llamada; la caché evita repetir). Todo el reel va con un
 * solo proveedor: si ElevenLabs falla en una escena, avisa y lo narra entero con
 * Kokoro (nunca dos voces en un reel; lo ya pagado queda en la caché).
 */
export async function narrarEscenas(
  textos: (string | undefined)[],
  voz: Voz = VOZ_DEFECTO,
  proveedor: ProveedorVoz = proveedorVoz(),
): Promise<(Narracion | undefined)[]> {
  const narrar = async (p: ProveedorVoz) => {
    const out: (Narracion | undefined)[] = [];
    for (const t of textos) out.push(t && t.trim() ? await sintetizar(t, voz, { proveedor: p }) : undefined);
    return out;
  };
  if (proveedor.tipo === "kokoro") return narrar(proveedor);
  try {
    return await narrar(proveedor);
  } catch (e) {
    console.warn(`⚠ ${e instanceof Error ? e.message : String(e)} Narro el reel entero con Kokoro ${voz}.`);
    return narrar({ tipo: "kokoro" });
  }
}
