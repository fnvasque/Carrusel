import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Background } from "../templates/types.ts";
import { ErrorSinCacheIa, generateBackground } from "../ai/openaiImage.ts";

/**
 * Estilo visual de marca (look papel, spec 2026-10-29) que se anexa a cada
 * prompt de fondo `{ ai }`, para que todos los fondos generados compartan el
 * look: papel gris cálido claro, calmo y editorial, con un acento lima suave.
 * Sin flags de Midjourney (no aplican a gpt-image-1; el aspecto lo fija el
 * lienzo 1080x1350). Cambiar este texto cambia la clave de `.cache/ai/`: los
 * fondos viejos quedan en caché sin tocar y solo se generan nuevos si se piden.
 */
const BRAND_IMAGE_STYLE =
  "light warm grey paper background #ECECEA, calm minimal editorial photography, lots of " +
  "negative space for text, soft natural light, subtle soft lime #C6FF3D accent, " +
  "uncluttered composition, shallow depth of field, photoreal, no text, no watermark";

/** Anexa el estilo de marca al prompt, salvo que `brandStyle` sea false. Exportada para los tests (clave de la caché `.cache/ai/`). */
export function applyBrandStyle(prompt: string, enabled?: boolean): string {
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
    try {
      const image = await generateBackground(applyBrandStyle(bg.ai, bg.brandStyle));
      return { image, overlay };
    } catch (e) {
      // Solo-caché (corpus visual): sin fondo en caché va el fondo por defecto, sin gastar API.
      if (!(e instanceof ErrorSinCacheIa)) throw e;
      console.warn(`⚠️  ${e.message} Va con el fondo por defecto.`);
      return undefined;
    }
  }
  if ("image" in bg) {
    if (bg.image.startsWith("data:")) return bg;
    const buf = await readFile(resolve(bg.image));
    return { image: `data:image/png;base64,${buf.toString("base64")}`, overlay };
  }
  return bg;
}
