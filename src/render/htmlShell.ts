import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fontFaceCss } from "./fonts.ts";

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

/**
 * Envuelve el markup de un slide en un documento HTML completo, con las
 * fuentes locales embebidas y un reset de CSS. El resultado se carga en
 * Playwright para tomar el screenshot.
 */
/**
 * Grano de marca determinista (SVG feTurbulence con seed fijo), expuesto como
 * variable CSS `--brand-grain` para que `Frame` lo use en la superficie de marca.
 * Monocromo y tileable; `seed` fijo ⇒ render reproducible en Playwright. Los
 * caracteres `#`/`%` van URL-encodeados para un data URI válido en `url()`.
 */
const BRAND_GRAIN_CSS =
  `:root{--brand-grain:url("data:image/svg+xml,` +
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E` +
  `%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/%3E` +
  `%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E` +
  `%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");` +
  `--brand-bg-deep:#070A12;}`;

export async function htmlShell(slideMarkup: string): Promise<string> {
  const fonts = await fontFaceCss();
  const brand = await brandLogoCss();
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
${fonts}
${brand}
${BRAND_GRAIN_CSS}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{margin:0;padding:0;background:#000;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
</style>
</head>
<body>${slideMarkup}</body>
</html>`;
}

/**
 * Embebe el logo de marca como variable CSS `--brand-logo` (data URI), para que
 * `Frame` lo pinte sin lectura de disco síncrona. Mismo patrón que las fuentes.
 * Si el archivo no existe, deja la variable en `none` (degradación elegante).
 */
async function brandLogoCss(): Promise<string> {
  try {
    const data = await readFile(join(ASSETS_DIR, "ia_es_wordmark.png"));
    const uri = `data:image/png;base64,${data.toString("base64")}`;
    return `:root{--brand-logo:url("${uri}");}`;
  } catch {
    return ":root{--brand-logo:none;}";
  }
}
