import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { fontFaceCss } from "../render/fonts.ts";
import { findChromium } from "../render/renderSlide.ts";
import { theme } from "../theme.ts";

/** Secciones internas (qué se tapó, sesiones usadas, imágenes candidatas): no van al PDF. */
export const SECCION_INTERNA = /^#{1,6}\s+Para Felipe/i;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Quita las secciones internas: desde su encabezado hasta el siguiente de igual o menor nivel (o el final). */
function quitarInternas(md: string): string {
  const salida: string[] = [];
  let nivelSaltado = 0; // 0 = no se está saltando
  let enBloque = false;
  for (const linea of md.split("\n")) {
    if (/^```/.test(linea)) enBloque = !enBloque;
    const h = enBloque ? null : /^(#{1,6})\s/.exec(linea);
    if (h) {
      const nivel = h[1].length;
      if (nivelSaltado && nivel <= nivelSaltado) nivelSaltado = 0;
      if (!nivelSaltado && SECCION_INTERNA.test(linea)) nivelSaltado = nivel;
    }
    if (!nivelSaltado) salida.push(linea);
  }
  return salida.join("\n");
}

/** Inline: escapa y aplica `código` y **negrita**. */
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** Devuelve la URL file:// de la imagen solo si existe y queda dentro de <dirCaso>/imagenes/. */
function urlImagen(ruta: string, dirCaso: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruta) || ruta.startsWith("/") || ruta.includes("\0")) return null;
  const base = resolve(dirCaso, "imagenes");
  let abs = resolve(dirCaso, ruta);
  if (!abs.startsWith(base + sep)) return null;
  // Sin archivo no hay <img>: el navegador mostraría el texto alternativo en su lugar.
  if (!existsSync(abs)) return null;
  // Un enlace simbólico no debe sacar la imagen de la carpeta.
  try {
    abs = realpathSync(abs);
    if (!abs.startsWith(realpathSync(base) + sep)) return null;
  } catch { return null; }
  return pathToFileURL(abs).href;
}

/** Conversor mínimo de Markdown a HTML (sin dependencias) para la guía en PDF. */
export function historiaAHtml(md: string, opts: { dirCaso: string }): string {
  const lineas = quitarInternas(md.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let i = 0;
  let titulo = "Guía paso a paso";
  const srcEmitidos: string[] = [];
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) {
      const buf: string[] = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) buf.push(lineas[i++]);
      i++;
      out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      if (h[1].length === 1 && out.length === 0) titulo = h[2].trim();
      out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`);
      i++;
      continue;
    }
    // El alt puede traer corchetes ([correo] tras tapar): se acepta cualquier texto antes de ](.
    const im = /^!\[(.*)\]\(([^)\s]+)\)\s*$/.exec(l.trim());
    if (im) {
      const url = urlImagen(im[2], opts.dirCaso);
      if (url) srcEmitidos.push(`src="${esc(url)}"`);
      // alt vacío siempre: la imagen es decorativa y el alt no pasó por la aprobación como prosa visible.
      if (url) out.push(`<figure><img src="${esc(url)}" alt=""></figure>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf: string[] = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) buf.push(lineas[i++].replace(/^>\s?/, ""));
      out.push(`<aside><p class="et">Para quien quiera el detalle técnico</p><p>${inline(buf.join(" "))}</p></aside>`);
      continue;
    }
    const lista = /^(\s*)(-|\d+\.)\s+/.exec(l);
    if (lista) {
      const ord = lista[2] !== "-";
      const items: string[] = [];
      while (i < lineas.length && /^(\s*)(-|\d+\.)\s+/.test(lineas[i])) {
        items.push(`<li>${inline(lineas[i].replace(/^\s*(-|\d+\.)\s+/, ""))}</li>`);
        i++;
      }
      out.push(ord ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const buf: string[] = [];
    while (
      i < lineas.length && lineas[i].trim() && !/^(```|#{1,6}\s|>|\s*(-|\d+\.)\s)/.test(lineas[i]) &&
      !/^!\[/.test(lineas[i].trim())
    ) buf.push(lineas[i++].trim());
    if (!buf.length) { i++; continue; }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }

  const c = theme.colors;
  const f = theme.fonts;
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
@page{size:A4;margin:22mm 20mm;}
*{box-sizing:border-box;}
html,body{margin:0;background:${c.bg};color:${c.ink};font-family:${f.body},system-ui,sans-serif;font-size:11.5pt;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
h1{font-weight:700;font-size:28pt;letter-spacing:-0.04em;line-height:1.15;margin:0 0 8mm;}
h2{font-weight:700;font-size:17pt;letter-spacing:-0.03em;margin:9mm 0 3mm;background:${theme.marker};display:inline-block;break-after:avoid;}
h3{font-weight:700;font-size:13pt;margin:6mm 0 2mm;break-after:avoid;}
h4,h5,h6{font-weight:700;font-size:11.5pt;margin:5mm 0 1.5mm;break-after:avoid;}
p{margin:0 0 3.5mm;}
ul,ol{margin:0 0 4mm;padding-left:7mm;}
li{margin-bottom:1.5mm;}
code{font-family:${f.mono},monospace;font-size:10pt;background:${c.card};padding:0 1.2mm;border-radius:1.5mm;}
pre{font-family:${f.mono},monospace;font-size:9.5pt;line-height:1.5;background:${c.card};border-radius:4mm;padding:4mm 5mm;margin:0 0 5mm;white-space:pre-wrap;word-break:break-word;break-inside:avoid;}
aside{background:${c.card};border-left:1.5mm solid ${c.accent};border-radius:3mm;padding:3mm 5mm;margin:0 0 5mm;break-inside:avoid;}
aside p{margin:0;color:${c.textSoft};font-size:10.5pt;}
aside .et{font-weight:600;font-size:9pt;text-transform:uppercase;letter-spacing:.06em;color:${c.textMuted};margin-bottom:1mm;}
figure{margin:0 0 5mm;break-inside:avoid;}
img{max-width:100%;border-radius:3mm;}
footer{margin-top:12mm;padding-top:4mm;border-top:.3mm solid ${c.textMuted};color:${c.textSoft};font-size:10pt;}
footer b{font-family:${f.serif},serif;font-style:italic;font-weight:400;font-size:13pt;color:${c.ink};}
</style>
</head>
<body>
${out.join("\n")}
<footer><b>${esc(theme.firma.nombre)}</b> · ${esc(theme.firma.linea)}</footer>
</body>
</html>`;
  // Falla cerrado: la guía pública no puede nombrar a Felipe. Se excluyen solo los src exactos emitidos (rutas locales).
  let visible = html;
  for (const src of srcEmitidos) visible = visible.split(src).join("");
  if (/felipe/i.test(visible)) {
    throw new Error("La historia menciona «Felipe» fuera de las secciones «Para Felipe»: cámbialo antes de generar el PDF");
  }
  return html;
}

/** Renderiza el HTML a PDF A4 con el Chromium de Playwright. */
export async function renderPdf(html: string, salida: string): Promise<void> {
  const fuentes = await fontFaceCss();
  const conFuentes = html.replace("</head>", () => `<style>\n${fuentes}\n</style>\n</head>`);
  // Se carga desde un archivo para que las imágenes file:// no queden bloqueadas.
  const tmp = mkdtempSync(join(tmpdir(), "caso-pdf-"));
  const archivo = join(tmp, "historia.html");
  writeFileSync(archivo, conFuentes);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath: findChromium() });
    const page = await browser.newPage();
    await page.goto(pathToFileURL(archivo).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: salida, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser?.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}
