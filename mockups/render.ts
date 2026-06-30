import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Prueba RÁPIDA y aislada de 3 direcciones de diseño de portada (no toca las
 * plantillas de producción). Misma copy, 3 looks:
 *   1) Pivot estilo @growai: claro + serif + highlighter pastel + asterisco.
 *   2) ia.es oscuro + mecanismos: navy/Anton/cian con marcador + screenshot anotado.
 *   3) Híbrido: claro/serif PERO acento de marca cian (un solo color).
 * Render 1080x1350 con Playwright. Fuentes vía Google Fonts (Playfair/Anton/Inter).
 */

const W = 1080, H = 1350;

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700&family=Playfair+Display:ital,wght@0,500;0,700;0,800;1,600&display=swap');`;

/** Swash de marcador "hecho a mano" (highlighter) detrás de una palabra. */
function marker(text: string, color: string, textColor = "inherit"): string {
  return `<span style="background:linear-gradient(100deg, transparent 1%, ${color} 1.5%, ${color} 96%, transparent 97%); padding:0 .08em; border-radius:.06em; color:${textColor}; box-decoration-break:clone; -webkit-box-decoration-break:clone;">${text}</span>`;
}

/** Asterisco coral tipo "spark" (SVG), como el del referente. */
function spark(color: string, size = 120): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x2 = 50 + 46 * Math.cos(a), y2 = 50 + 46 * Math.sin(a);
    return `<line x1="50" y1="50" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
  }).join("")}
  </svg>`;
}

function doc(body: string, bg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  ${FONTS}
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:${W}px;height:${H}px;}
  .canvas{position:relative;width:${W}px;height:${H}px;overflow:hidden;${bg}padding:96px;display:flex;flex-direction:column;}
  </style></head><body><div class="canvas">${body}</div></body></html>`;
}

// --- Camino 1: pivot estilo @growai (claro + serif + highlighter pastel) ---
const path1 = doc(`
  <div style="position:absolute;inset:0;background:
     repeating-linear-gradient(0deg, rgba(0,0,0,0.035) 0 1px, transparent 1px 44px),
     repeating-linear-gradient(90deg, rgba(0,0,0,0.035) 0 1px, transparent 1px 44px);"></div>
  <div style="position:relative;display:flex;flex-direction:column;height:100%;">
    <div style="font-family:Inter;font-weight:700;font-size:30px;letter-spacing:.18em;text-transform:uppercase;color:#9A6A3A;">ia.es · Herramienta</div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px;">
      <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:118px;line-height:1.02;color:#1A1714;">
        5 ${marker("trucos", "#FCE38A")} de
      </div>
      <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:118px;line-height:1.02;color:#1A1714;display:flex;align-items:center;gap:18px;">
        NotebookLM ${spark("#E8663D", 96)}
      </div>
      <div style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:84px;line-height:1.05;color:#1A1714;margin-top:8px;">
        que ${marker("nadie te enseñó", "#C9B8F0")}
      </div>
    </div>
    <div style="font-family:Inter;font-weight:700;font-size:28px;color:#6B6258;align-self:flex-end;">DESLIZA →</div>
  </div>
`, "background:#F4F1EA;");

// --- Camino 2: ia.es oscuro + mecanismos (navy/Anton/cian + marcador + screenshot anotado) ---
const path2 = doc(`
  <div style="position:absolute;inset:0;background:
     radial-gradient(120% 80% at 70% 0%, rgba(34,211,238,0.16), transparent 55%),
     linear-gradient(180deg, #0B1020, #070A12);"></div>
  <div style="position:relative;display:flex;flex-direction:column;height:100%;color:#E8ECF4;">
    <div style="font-family:Inter;font-weight:700;font-size:28px;letter-spacing:.18em;text-transform:uppercase;color:#22D3EE;">ia.es · Herramienta</div>
    <!-- screenshot anotado (mock UI de NotebookLM) -->
    <div style="margin-top:48px;background:#151D33;border:1px solid rgba(255,255,255,0.06);border-radius:18px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,.35);position:relative;">
      <div style="font-family:Inter;font-size:26px;color:#94A0B8;">＋ Fuentes</div>
      <div style="font-family:Inter;font-size:30px;margin-top:14px;color:#E8ECF4;">📄 Pega un video de YouTube…</div>
      <div style="position:absolute;right:24px;top:64px;width:200px;height:70px;border:4px solid #E8663D;border-radius:40px;transform:rotate(-4deg);"></div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:20px;">
      <div style="font-family:Anton;font-size:128px;line-height:.92;text-transform:uppercase;letter-spacing:-.02em;">
        5 ${marker("TRUCOS", "#22D3EE", "#0B1020")} DE NOTEBOOKLM QUE NADIE USA
      </div>
      <div style="font-family:Inter;font-weight:700;font-size:28px;color:#94A0B8;align-self:flex-end;">DESLIZA →</div>
    </div>
  </div>
`, "background:#0B1020;");

// --- Camino 3: híbrido (claro/serif PERO acento de marca cian, un solo color) ---
const path3 = doc(`
  <div style="position:absolute;inset:0;background:
     radial-gradient(110% 70% at 75% 0%, rgba(34,211,238,0.10), transparent 55%);"></div>
  <div style="position:relative;display:flex;flex-direction:column;height:100%;">
    <div style="font-family:Inter;font-weight:700;font-size:30px;letter-spacing:.18em;text-transform:uppercase;color:#0E7C8B;">ia.es · Herramienta</div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px;">
      <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:120px;line-height:1.0;color:#0B1020;">
        5 ${marker("trucos", "#22D3EE", "#0B1020")} de
      </div>
      <div style="font-family:'Playfair Display',serif;font-weight:800;font-size:120px;line-height:1.0;color:#0B1020;">NotebookLM</div>
      <div style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:80px;line-height:1.05;color:#0B1020;margin-top:6px;">
        que <span style="border-bottom:10px solid #22D3EE;">nadie te enseñó</span>
      </div>
    </div>
    <div style="font-family:Inter;font-weight:700;font-size:28px;color:#5B6472;align-self:flex-end;">DESLIZA →</div>
  </div>
`, "background:#FBFAF7;");

async function main() {
  const outDir = join(process.cwd(), "output", "mockups");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const docs = [["camino-1-claro-serif-highlighter", path1], ["camino-2-oscuro-mecanismos", path2], ["camino-3-hibrido-cian", path3]] as const;
  for (const [name, html] of docs) {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const png = await page.screenshot({ type: "png" });
    const p = join(outDir, `${name}.png`);
    await writeFile(p, png);
    console.log(`✓ ${p}`);
  }
  await browser.close();
}

main().catch((e) => { console.error("✗", e); process.exit(1); });
