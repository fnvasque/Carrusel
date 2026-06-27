import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { htmlShell } from "./htmlShell.ts";
import { CANVAS } from "../templates/types.ts";

/**
 * Localiza un Chromium preinstalado para no depender de que la versión de
 * Playwright coincida exactamente con el navegador descargado.
 *  1. PLAYWRIGHT_CHROMIUM_EXECUTABLE (override manual)
 *  2. el chrome bajo PLAYWRIGHT_BROWSERS_PATH (entornos que ya lo traen)
 *  3. undefined → Playwright usa su propio navegador gestionado
 */
function findChromium(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override && existsSync(override)) return override;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    for (const dir of readdirSync(base)) {
      if (!dir.startsWith("chromium-")) continue;
      const bin = join(base, dir, "chrome-linux", "chrome");
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/**
 * Renderiza slides a PNG reutilizando una sola instancia de Chromium para todo
 * el carrusel (mucho más rápido que abrir un navegador por slide).
 *
 * Uso:
 *   const r = new Renderer();
 *   await r.init();
 *   const png = await r.render(<Cover ... />);
 *   await r.close();
 */
export class Renderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({ executablePath: findChromium() });
    this.page = await this.browser.newPage({
      viewport: { width: CANVAS.width, height: CANVAS.height },
      deviceScaleFactor: 1,
    });
  }

  async render(element: ReactElement): Promise<Buffer> {
    if (!this.page) throw new Error("Renderer no inicializado: llama a init() primero.");
    const html = await htmlShell(renderToStaticMarkup(element));
    await this.page.setContent(html, { waitUntil: "load" });
    // Asegura que las @font-face estén cargadas antes del screenshot, para que
    // el texto nunca salga con la fuente de fallback.
    await this.page.evaluate(() => document.fonts.ready);
    return this.page.screenshot({ type: "png" });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
