import { spawn, spawnSync } from "node:child_process";
import { rm, writeFile, mkdir, readdir } from "node:fs/promises";
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
    try {
      await page.waitForFunction(() => (window as any).__reelReady === true, null, { timeout: 30_000 });
    } catch (e) {
      // Sin __reelReady el timeout de Playwright no dice nada útil: se informan
      // los errores de la página recolectados hasta ahora.
      if (!(e instanceof Error && e.name === "TimeoutError")) throw e;
      throw new Error(`El runtime del reel no respondió en 30 s (no llegó window.__reelReady):\n${consoleErrors.join("\n") || "sin errores en la consola de la página"}`);
    }
    const state = await page.evaluate(() => ({
      errors: ((window as any).__reelErrors ?? []) as string[],
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
 * Para las tomas fijas (`--frames-only`): el cursor parpadeante puede caer
 * apagado justo en el instante de la toma; se fuerza encendido.
 */
export async function forceCaretsOn(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('[data-anim="caret"]').forEach((c) => {
      c.style.opacity = "1";
      c.style.visibility = "visible";
    });
  });
}

/** Segundos de fade-out del audio al final del reel (como el motor anterior). */
const AUDIO_FADE = 0.6;

/** Argumentos de ffmpeg: PNG por stdin → h264/yuv420p; audio opcional recortado al video. */
export function ffmpegArgs(timing: ReelTiming, outPath: string, audio?: string): string[] {
  const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(timing.fps), "-c:v", "png", "-i", "-"];
  if (audio) {
    // El audio se recorta a la duración del video con fade-out; nunca al revés
    // (sin -shortest: un audio corto no trunca el video).
    const dur = timing.frames / timing.fps;
    const st = Math.max(0, dur - AUDIO_FADE).toFixed(2);
    args.push("-i", audio, "-filter_complex", `[1:a]afade=t=out:st=${st}:d=${AUDIO_FADE},atrim=0:${dur.toFixed(3)}[aud]`);
    args.push("-map", "0:v", "-map", "[aud]", "-c:a", "aac", "-b:a", "128k");
  }
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(timing.fps), "-movflags", "+faststart", outPath);
  return args;
}

/**
 * Captura el reel cuadro a cuadro y lo codifica con ffmpeg (PNG por stdin →
 * h264/yuv420p 30 fps, +faststart). Si ffmpeg falla, borra el mp4 parcial.
 */
export async function captureReel(html: string, timing: ReelTiming, outPath: string, opts: { audio?: string } = {}): Promise<void> {
  assertFfmpeg();
  const { browser, page } = await openReel(html, timing);
  const args = ffmpegArgs(timing, outPath, opts.audio);
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => (stderr += d));
  // Un solo desenlace: ffmpeg terminó (código) o no pudo arrancar/escribirse (error).
  let exited = false;
  let failure: Error | undefined;
  const exit = new Promise<number>((res) => {
    ff.on("close", (code) => { exited = true; res(code ?? 1); });
    ff.on("error", (e) => { failure ??= e; exited = true; res(1); });
  });
  // EPIPE al escribir cuando ffmpeg ya murió: se ignora aquí y se informa con su stderr.
  ff.stdin.on("error", () => {});
  const tail = () => stderr.split("\n").filter(Boolean).slice(-8).join("\n");
  let written = 0;
  try {
    for (let k = 0; k < timing.frames && !exited; k++) {
      const png = await shot(page, k / timing.fps);
      if (exited) break;
      written++;
      if (!ff.stdin.write(png)) {
        await Promise.race([new Promise((r) => ff.stdin.once("drain", r)), exit]);
      }
      if (k % timing.fps === 0) process.stdout.write(`\r  cuadro ${k}/${timing.frames}`);
    }
    if (!exited) ff.stdin.end();
    const code = await exit;
    process.stdout.write("\n");
    if (code !== 0 || failure) {
      throw new Error(`ffmpeg falló (código ${code})${failure ? `: ${failure.message}` : ""}:\n${tail()}`);
    }
    if (written < timing.frames) {
      console.warn(`  ⚠ ffmpeg terminó antes de recibir todos los cuadros (${written}/${timing.frames}): el video puede quedar más corto.`);
    }
  } catch (e) {
    process.stdout.write("\n");
    ff.stdin.destroy();
    ff.kill("SIGKILL");
    await exit;
    await rm(outPath, { force: true });
    throw e;
  } finally {
    await browser.close();
  }
}

/** Un PNG por escena en su estado final (para revisar rápido sin video). */
export async function captureStills(html: string, timing: ReelTiming, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  // Sin restos de una corrida anterior con más escenas, ni los slide-*.png del motor anterior.
  for (const f of await readdir(outDir)) if (/^(escena|slide)-\d+\.png$/.test(f)) await rm(join(outDir, f));
  const { browser, page } = await openReel(html, timing);
  const paths: string[] = [];
  try {
    const n = timing.scenes.length;
    for (let i = 0; i < n; i++) {
      const s = timing.scenes[i];
      const t = i === n - 1 ? timing.total - 0.05 : s.start + s.dur - timing.transition - 0.05;
      const p = join(outDir, `escena-${String(i + 1).padStart(2, "0")}.png`);
      const png = await shot(page, t);
      // shot() ya hizo el seek; se enciende el cursor y se toma de nuevo solo si hay uno.
      if (await page.evaluate(() => document.querySelector('[data-anim="caret"]') !== null)) {
        await forceCaretsOn(page);
        await writeFile(p, await page.screenshot({ type: "png" }));
      } else {
        await writeFile(p, png);
      }
      paths.push(p);
    }
  } finally {
    await browser.close();
  }
  return paths;
}
