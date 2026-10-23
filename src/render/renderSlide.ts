import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { htmlShell } from "./htmlShell.ts";
import { FORMATS } from "../templates/types.ts";
import { revisarPagina, type Hallazgo } from "./revision.ts";

/**
 * Localiza un Chromium preinstalado para no depender de que la versión de
 * Playwright coincida exactamente con el navegador descargado.
 *  1. PLAYWRIGHT_CHROMIUM_EXECUTABLE (override manual)
 *  2. el chrome bajo PLAYWRIGHT_BROWSERS_PATH (entornos que ya lo traen)
 *  3. undefined → Playwright usa su propio navegador gestionado
 */
export function findChromium(): string | undefined {
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

  private dim: { width: number; height: number } = FORMATS.post;

  async init(dim: { width: number; height: number } = FORMATS.post): Promise<void> {
    this.dim = dim;
    this.browser = await chromium.launch({ executablePath: findChromium() });
    this.page = await this.browser.newPage({
      viewport: { width: dim.width, height: dim.height },
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

  /**
   * Revisión visual de la página actual (la del último `render`). `contexto` va en
   * cada motivo (p. ej. «slide 2 (Step)»). Por defecto, zona segura del reel solo si
   * el viewport es 9:16 (1080×1920).
   */
  async revisar(contexto: string, opts?: { reel: boolean; altura: number }): Promise<Hallazgo[]> {
    if (!this.page) throw new Error("Renderer no inicializado: llama a init() primero.");
    const reel = this.dim.width === FORMATS.reel.width && this.dim.height === FORMATS.reel.height;
    return revisarPagina(this.page, contexto, opts ?? { reel, altura: this.dim.height });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
