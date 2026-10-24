import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

/** Carpeta de la caché de fondos. `CARRUSEL_AI_CACHE_DIR` la cambia (el corpus visual lee la del Mac sin escribirla). */
function cacheDir(): string {
  return process.env.CARRUSEL_AI_CACHE_DIR?.trim() || join(process.cwd(), ".cache", "ai");
}

/** Con `CARRUSEL_AI_SOLO_CACHE=1` y el fondo fuera de caché: no se llama a la API (ni hace falta clave). */
export class ErrorSinCacheIa extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorSinCacheIa";
  }
}

/** Tamaños soportados por gpt-image-1. 1024x1536 (2:3) es el más cercano al 4:5 del lienzo. */
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export interface GenerateOptions {
  size?: ImageSize;
  /** "low" | "medium" | "high" — calidad/coste de gpt-image-1. */
  quality?: "low" | "medium" | "high";
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Falta OPENAI_API_KEY. Expórtala para usar fondos { ai }, o usa fondos { color } / { gradient } / { image }.",
    );
  }
  client ??= new OpenAI();
  return client;
}

/** Ruta en la caché del fondo de `prompt` (la misma clave que usa `generateBackground`). */
export function rutaCacheFondo(prompt: string, opts: GenerateOptions = {}): string {
  const size = opts.size ?? "1024x1536";
  const quality = opts.quality ?? "medium";
  const key = createHash("sha256").update(`${prompt}|${size}|${quality}`).digest("hex");
  return join(cacheDir(), `${key}.png`);
}

/** ¿El fondo de `prompt` ya está en la caché? (`generateBackground` no llamaría a la API.) */
export function fondoEnCache(prompt: string, opts: GenerateOptions = {}): boolean {
  return existsSync(rutaCacheFondo(prompt, opts));
}

/**
 * Genera (o recupera de caché) un fondo con gpt-image-1 a partir de un prompt.
 * Devuelve un data URI PNG listo para usar como background-image.
 *
 * La caché es por hash de (prompt + opciones), así que repetir una generación
 * idéntica no vuelve a llamar a la API ni gasta tokens.
 */
export async function generateBackground(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const size = opts.size ?? "1024x1536";
  const quality = opts.quality ?? "medium";
  const cachePath = rutaCacheFondo(prompt, opts);

  if (existsSync(cachePath)) {
    const cached = await readFile(cachePath);
    return toDataUri(cached);
  }

  // Antes de getClient(): sin caché y en modo solo-caché no se necesita clave ni se escribe nada.
  if (process.env.CARRUSEL_AI_SOLO_CACHE === "1") {
    throw new ErrorSinCacheIa("Fondo ai fuera de caché y CARRUSEL_AI_SOLO_CACHE=1: no se llama a la API.");
  }

  const res = await getClient().images.generate({
    model: "gpt-image-1",
    prompt,
    size,
    quality,
    n: 1,
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 no devolvió datos de imagen.");

  const buf = Buffer.from(b64, "base64");
  await mkdir(cacheDir(), { recursive: true });
  await writeFile(cachePath, buf);
  return toDataUri(buf);
}

function toDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}
