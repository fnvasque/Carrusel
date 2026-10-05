import { spawn, spawnSync } from "node:child_process";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { findChromium } from "../render/renderSlide.ts";
import { FORMATS } from "../templates/types.ts";
import type { ReelTiming } from "./timing.ts";

/** Falla con un mensaje claro si ffmpeg no está en el PATH. */
export function assertFfmpeg(): void {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.error || r.status !== 0) {
    throw new Error("No encontré ffmpeg en el PATH. Instálalo con `brew install ffmpeg` y vuelve a intentar.");
  }
}

/** Carga la página del reel y valida que el runtime arrancó con la duración esperada. */
async function openReel(html: string, timing: ReelTiming) {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: FORMATS.reel, deviceScaleFactor: 1 });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.warn(`  [página] ${m.text()}`);
      if (m.type() === "error") consoleErrors.push(m.text());
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => (window as any).__reelReady === true, null, { timeout: 30_000 });
    const state = await page.evaluate(() => ({
      errors: (window as any).__reelErrors as string[],
      duration: (window as any).__reel?.duration as number | undefined,
    }));
    const problems = [...state.errors, ...consoleErrors];
    if (state.duration === undefined || problems.length) {
      throw new Error(`El runtime del reel no arrancó:\n${problems.join("\n") || "window.__reel no existe"}`);
    }
    if (Math.abs(state.duration - timing.total) > 1 / timing.fps) {
      throw new Error(`La animación dura ${state.duration.toFixed(3)}s pero se esperaban ${timing.total}s.`);
    }
  } catch (e) {
    await browser.close();
    throw e;
  }
  return { browser, page };
}

async function shot(page: Page, t: number): Promise<Buffer> {
  await page.evaluate((x) => (window as any).__reel.seek(x), t);
  return page.screenshot({ type: "png" });
}

/**
 * Captura el reel cuadro a cuadro y lo codifica con ffmpeg (PNG por stdin →
 * h264/yuv420p 30 fps, +faststart). Si ffmpeg falla, borra el mp4 parcial.
 */
export async function captureReel(html: string, timing: ReelTiming, outPath: string, opts: { audio?: string } = {}): Promise<void> {
  assertFfmpeg();
  const { browser, page } = await openReel(html, timing);
  const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(timing.fps), "-c:v", "png", "-i", "-"];
  if (opts.audio) args.push("-i", opts.audio, "-c:a", "aac", "-b:a", "192k", "-shortest");
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(timing.fps), "-movflags", "+faststart", outPath);
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => (stderr += d));
  const done = new Promise<number>((res) => ff.on("close", (code) => res(code ?? 1)));
  try {
    for (let k = 0; k < timing.frames; k++) {
      const png = await shot(page, k / timing.fps);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (k % timing.fps === 0) process.stdout.write(`\r  cuadro ${k}/${timing.frames}`);
    }
    ff.stdin.end();
    const code = await done;
    process.stdout.write("\n");
    if (code !== 0) throw new Error(`ffmpeg falló (código ${code}):\n${stderr.split("\n").slice(-8).join("\n")}`);
  } catch (e) {
    ff.stdin.destroy();
    ff.kill("SIGKILL");
    await rm(outPath, { force: true });
    throw e;
  } finally {
    await browser.close();
  }
}

/** Un PNG por escena en su estado final (para revisar rápido sin video). */
export async function captureStills(html: string, timing: ReelTiming, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const { browser, page } = await openReel(html, timing);
  const paths: string[] = [];
  try {
    const n = timing.scenes.length;
    for (let i = 0; i < n; i++) {
      const s = timing.scenes[i];
      const t = i === n - 1 ? timing.total - 0.05 : s.start + s.dur - timing.transition - 0.05;
      const p = join(outDir, `escena-${String(i + 1).padStart(2, "0")}.png`);
      await writeFile(p, await shot(page, t));
      paths.push(p);
    }
  } finally {
    await browser.close();
  }
  return paths;
}
