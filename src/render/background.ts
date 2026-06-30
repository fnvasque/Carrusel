import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Background } from "../templates/types.ts";
import { generateBackground } from "../ai/openaiImage.ts";

/**
 * Estilo visual de marca (design-brand.md §6) que se anexa a cada prompt de
 * fondo `{ ai }`, para que todos los fondos generados compartan el look navy +
 * cyan rim light. Sin flags de Midjourney (no aplican a gpt-image-1; el aspecto
 * lo fija el lienzo 1080x1350).
 */
const BRAND_IMAGE_STYLE =
  "abstract branded backdrop, deep navy #0B1020 to near-black gradient, soft cyan #22D3EE " +
  "glow orb, subtle film grain, faint bokeh light specks, NO objects, NO devices, NO people, " +
  "NO text, NO watermark, generous dark negative space for text overlay, poster aesthetic, high contrast";

/** Anexa el estilo de marca al prompt, salvo que `brandStyle` sea false. */
function applyBrandStyle(prompt: string, enabled?: boolean): string {
  return enabled === false ? prompt : `${prompt}, ${BRAND_IMAGE_STYLE}`;
}

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
    const image = await generateBackground(applyBrandStyle(bg.ai, bg.brandStyle));
    return { image, overlay };
  }
  if ("image" in bg) {
    if (bg.image.startsWith("data:")) return bg;
    const buf = await readFile(resolve(bg.image));
    return { image: `data:image/png;base64,${buf.toString("base64")}`, overlay };
  }
  return bg;
}
