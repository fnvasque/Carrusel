import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Background } from "../templates/types.ts";
import { generateBackground } from "../ai/openaiImage.ts";

/**
 * Convierte un fondo declarado por el usuario en uno listo para renderizar:
 *  - { ai }    → genera con gpt-image-1 y devuelve { image: dataUri }
 *  - { image } → lee el archivo local y lo embebe como data URI
 *  - { color } / { gradient } → se devuelven tal cual
 *
 * Así el HTML resultante es autónomo (no depende de rutas en disco).
 */
export async function resolveBackground(bg?: Background): Promise<Background | undefined> {
  if (!bg) return undefined;
  const overlay = "overlay" in bg ? bg.overlay : undefined;

  if ("ai" in bg) {
    const image = await generateBackground(bg.ai);
    return { image, overlay };
  }
  if ("image" in bg) {
    if (bg.image.startsWith("data:")) return bg;
    const buf = await readFile(resolve(bg.image));
    return { image: `data:image/png;base64,${buf.toString("base64")}`, overlay };
  }
  return bg;
}
