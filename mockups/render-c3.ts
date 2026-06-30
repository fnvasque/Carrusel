import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Mini-carrusel de prueba — Camino 3 (claro + serif editorial) con sistema de
 * DOS acentos de marca: cian #22D3EE + rosa #F471B5. Aislado de producción.
 * 4 slides: portada, truco 01 (con screenshot anotado), truco 02, CTA de cierre.
 */
const W = 1080, H = 1350;
const CYAN = "#22D3EE", PINK = "#F471B5", INK = "#0B1020", MUTED = "#5B6472", BG = "#FBFAF7";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:ital,wght@0,600;0,800;1,600&display=swap');`;

/** Marcador "hecho a mano" detrás de una palabra (highlighter). */
function mark(text: string, color: string): string {
  return `<span style="background:linear-gradient(100deg, transparent 1%, ${color} 1.5%, ${color} 96%, transparent 97%); padding:0 .08em; border-radius:.06em; color:${INK}; box-decoration-break:clone; -webkit-box-decoration-break:clone;">${text}</span>`;
}
/** Subrayado grueso a mano. */
function uline(text: string, color: string): string {
  return `<span style="border-bottom:10px solid ${color}; padding-bottom:2px;">${text}</span>`;
}

function frame(inner: string, opts: { glow?: string } = {}): string {
  const glow = opts.glow ?? CYAN;
  return `<div class="canvas" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${BG};padding:96px;display:flex;flex-direction:column;">
    <div style="position:absolute;inset:0;background:radial-gradient(110% 70% at 78% -5%, ${glow}22, transparent 55%);"></div>
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 46px),repeating-linear-gradient(90deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 46px);"></div>
    <div style="position:relative;display:flex;flex-direction:column;height:100%;">${inner}</div>
  </div>`;
}

function eyebrow(text: string, color: string): string {
  return `<div style="font-family:Inter;font-weight:700;font-size:28px;letter-spacing:.18em;text-transform:uppercase;color:${color};">${text}</div>`;
}
function progress(n: string): string {
  return `<div style="position:absolute;top:0;right:0;font-family:Inter;font-weight:700;font-size:26px;letter-spacing:.08em;color:${MUTED};">${n}</div>`;
}

// 1) Portada
const cover = frame(`
  ${eyebrow("ia.es · Herramienta", "#0E7C8B")}
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px;">
    <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:122px;line-height:1.0;color:${INK};">5 ${mark("trucos", CYAN)} de</div>
    <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:122px;line-height:1.0;color:${INK};">NotebookLM</div>
    <div style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:82px;line-height:1.05;color:${INK};margin-top:8px;">que ${uline("nadie te enseñó", PINK)}</div>
  </div>
  <div style="font-family:Inter;font-weight:700;font-size:28px;color:${MUTED};align-self:flex-end;">DESLIZA →</div>
`);

// 2) Truco 01 con "screenshot" anotado
const step1 = frame(`
  ${progress("02 / 06")}
  ${eyebrow("Truco 01", "#0E7C8B")}
  <div style="margin-top:18px;font-family:'Playfair Display',serif;font-weight:800;font-size:78px;line-height:1.02;color:${INK};">Convierte un ${mark("video de YouTube", CYAN)} en apuntes</div>
  <div style="margin-top:24px;font-family:Inter;font-size:38px;line-height:1.4;color:${MUTED};">Pega el enlace como fuente y pídele un resumen con los puntos clave.</div>
  <div style="margin-top:40px;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:18px;padding:34px;box-shadow:0 18px 50px rgba(0,0,0,.10);position:relative;">
    <div style="font-family:Inter;font-weight:600;font-size:30px;color:${INK};">＋ Añadir fuente</div>
    <div style="margin-top:18px;font-family:Inter;font-size:30px;color:${MUTED};border:2px dashed rgba(0,0,0,.15);border-radius:12px;padding:22px;">🔗 youtube.com/watch?v=…</div>
    <div style="position:absolute;right:26px;top:84px;width:230px;height:78px;border:5px solid ${PINK};border-radius:44px;transform:rotate(-3deg);"></div>
  </div>
`);

// 3) Truco 02 (acento rosa protagonista)
const step2 = frame(`
  ${progress("03 / 06")}
  ${eyebrow("Truco 02", "#B03A78")}
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;">
    <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:90px;line-height:1.02;color:${INK};">${mark("No leas", PINK)} el PDF entero</div>
    <div style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:56px;line-height:1.15;color:${INK};">Pregúntale directo: "dame las 3 ideas que importan".</div>
    <div style="font-family:Inter;font-size:34px;line-height:1.4;color:${MUTED};">Ahorras 40 páginas y te quedas con lo accionable.</div>
  </div>
`, { glow: PINK });

// 4) CTA de cierre
const cta = frame(`
  ${eyebrow("ia.es · Herramienta", "#0E7C8B")}
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:32px;align-items:flex-start;">
    <div style="display:flex;gap:10px;"><div style="width:70px;height:9px;background:${CYAN};border-radius:99px;"></div><div style="width:28px;height:9px;background:${PINK};border-radius:99px;"></div></div>
    <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:96px;line-height:1.0;color:${INK};">${mark("Guárdalo", CYAN)} y mándaselo a alguien</div>
    <div style="font-family:Inter;font-size:38px;color:${MUTED};">Lo que importa en IA, cada semana — sin hype.</div>
    <div style="font-family:Inter;font-weight:700;font-size:38px;color:#fff;background:${INK};padding:26px 44px;border-radius:99px;">📩 Link en bio</div>
    <div style="font-family:Inter;font-weight:700;font-size:32px;color:${INK};">@ia.es</div>
  </div>
`);

async function main() {
  const outDir = join(process.cwd(), "output", "mockups");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const slides = [["c3-1-portada", cover], ["c3-2-truco01", step1], ["c3-3-truco02", step2], ["c3-4-cta", cta]] as const;
  for (const [name, html] of slides) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/><style>${FONTS}*{margin:0;padding:0;box-sizing:border-box;}</style></head><body>${html}</body></html>`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await writeFile(join(outDir, `${name}.png`), await page.screenshot({ type: "png" }));
    console.log(`✓ ${name}.png`);
  }
  await browser.close();
}
main().catch((e) => { console.error("✗", e); process.exit(1); });
