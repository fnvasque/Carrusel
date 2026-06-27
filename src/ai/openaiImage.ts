import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

const CACHE_DIR = join(process.cwd(), ".cache", "ai");

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

  const key = createHash("sha256").update(`${prompt}|${size}|${quality}`).digest("hex");
  const cachePath = join(CACHE_DIR, `${key}.png`);

  if (existsSync(cachePath)) {
    const cached = await readFile(cachePath);
    return toDataUri(cached);
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
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, buf);
  return toDataUri(buf);
}

function toDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}
