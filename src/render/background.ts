import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Background } from "../templates/types.ts";
import { generateBackground } from "../ai/openaiImage.ts";

/**
 * Estilo visual de marca (look lima, spec 2026-10-05) que se anexa a cada
 * prompt de fondo `{ ai }`, para que todos los fondos generados compartan el
 * look: casi negro con acentos lima. Sin flags de Midjourney (no aplican a
 * gpt-image-1; el aspecto lo fija el lienzo 1080x1350).
 */
const BRAND_IMAGE_STYLE =
  "minimal editorial tech photography, near-black #06060A background, sparse lime #C6FF3D " +
  "accent light on the subject, high contrast, minimalist composition, generous negative " +
  "space for text, shallow depth of field, photoreal, no text, no watermark";

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
