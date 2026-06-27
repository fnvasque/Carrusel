import { fontFaceCss } from "./fonts.ts";

/**
 * Envuelve el markup de un slide en un documento HTML completo, con las
 * fuentes locales embebidas y un reset de CSS. El resultado se carga en
 * Playwright para tomar el screenshot.
 */
export async function htmlShell(slideMarkup: string): Promise<string> {
  const fonts = await fontFaceCss();
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{margin:0;padding:0;background:#000;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
</style>
</head>
<body>${slideMarkup}</body>
</html>`;
}
