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
