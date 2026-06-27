import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");

const MIME: Record<string, string> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const NAMED_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

/**
 * Genera reglas @font-face para cada archivo de fuente en src/fonts/,
 * embebido como data URI para que el HTML sea totalmente autónomo.
 *
 * Convención de nombres: `Familia-Peso.ext`, p.ej. `Inter-700.woff2` o
 * `Inter-Bold.woff2`. Sin sufijo de peso → 400. El estilo es `italic` si el
 * nombre contiene "italic".
 *
 * Si la carpeta no existe o está vacía, devuelve "" y las plantillas usan la
 * pila de fuentes de fallback del sistema.
 */
export async function fontFaceCss(): Promise<string> {
  let files: string[];
  try {
    files = await readdir(FONTS_DIR);
  } catch {
    return "";
  }

  const faces: string[] = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const mime = MIME[ext];
    if (!mime) continue;

    const base = file.slice(0, -ext.length);
    const italic = /italic/i.test(base);
    const [family, weightToken] = base.replace(/-?italic/i, "").split("-");
    const weight = resolveWeight(weightToken);

    const data = await readFile(join(FONTS_DIR, file));
    const uri = `data:${mime};base64,${data.toString("base64")}`;
    faces.push(
      `@font-face{font-family:"${family}";font-style:${italic ? "italic" : "normal"};` +
        `font-weight:${weight};font-display:block;src:url("${uri}") format("${formatOf(ext)}");}`,
    );
  }
  return faces.join("\n");
}

function resolveWeight(token?: string): number {
  if (!token) return 400;
  if (/^\d+$/.test(token)) return Number(token);
  return NAMED_WEIGHTS[token.toLowerCase()] ?? 400;
}

function formatOf(ext: string): string {
  switch (ext) {
    case ".woff2":
      return "woff2";
    case ".woff":
      return "woff";
    case ".ttf":
      return "truetype";
    case ".otf":
      return "opentype";
    default:
      return "woff2";
  }
}
