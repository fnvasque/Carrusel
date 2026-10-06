import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReelPage } from "../src/reel/page.ts";
import { captureReel, captureStills } from "../src/reel/capture.ts";
import { reelTiming, specDurations } from "../src/reel/timing.ts";
import spec from "../carousels/_smoke-plantillas.ts";

/**
 * Captura con Chromium + ffmpeg reales: un audio inexistente debe fallar con el
 * stderr de ffmpeg, sin colgarse y sin dejar mp4 parcial; el audio se recorta al
 * video y nunca lo trunca; y captureStills limpia escenas viejas (y slide-*.png
 * del motor anterior). Uso: npm run test:reel
 */

/** Duración (s) de un stream de `file` según ffprobe ("v:0" o "a:0"). */
function streamSeconds(file: string, stream: string): number {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", stream, "-show_entries", "stream=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

/** Tono de prueba de `seconds` s generado con ffmpeg. */
function tone(file: string, seconds: number): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, file]);
  assert.equal(r.status, 0, "ffmpeg genera el tono de prueba");
}
const timing = reelTiming(specDurations(spec));
const html = await buildReelPage(spec, timing);
const dir = await mkdtemp(join(tmpdir(), "reel-capture-"));
try {
  const out = join(dir, "reel.mp4");
  await assert.rejects(
    captureReel(html, timing, out, { audio: join(dir, "no-existe.mp3") }),
    (e: Error) => /ffmpeg falló/.test(e.message) && /no-existe\.mp3/.test(e.message),
  );
  assert.equal(existsSync(out), false, "no queda mp4 parcial");
  console.log("✓ audio inexistente: rechaza con el stderr de ffmpeg y sin mp4 parcial");

  // Audio: reel corto de una escena (1.2 s) con un tono más largo y uno más corto.
  const mini = { ...spec, slides: spec.slides.slice(0, 1) };
  const miniTiming = reelTiming([1.2]);
  const miniHtml = await buildReelPage(mini, miniTiming);
  const video = miniTiming.frames / miniTiming.fps;
  tone(join(dir, "largo.m4a"), 3);
  tone(join(dir, "corto.m4a"), 0.5);
  const conLargo = join(dir, "largo.mp4");
  await captureReel(miniHtml, miniTiming, conLargo, { audio: join(dir, "largo.m4a") });
  assert.ok(Math.abs(streamSeconds(conLargo, "v:0") - video) < 0.05, "video completo con audio largo");
  assert.ok(streamSeconds(conLargo, "a:0") <= video + 0.05, `audio recortado al video: ${streamSeconds(conLargo, "a:0")}s`);
  const conCorto = join(dir, "corto.mp4");
  await captureReel(miniHtml, miniTiming, conCorto, { audio: join(dir, "corto.m4a") });
  assert.ok(Math.abs(streamSeconds(conCorto, "v:0") - video) < 0.05, `un audio corto no trunca el video: ${streamSeconds(conCorto, "v:0")}s`);
  console.log("✓ audio recortado al video con fade-out; un audio corto no trunca el video");

  await writeFile(join(dir, "escena-99.png"), "viejo");
  await writeFile(join(dir, "slide-01.png"), "motor anterior");
  const paths = await captureStills(html, timing, dir);
  const left = (await readdir(dir)).filter((f) => /^(escena|slide)-/.test(f)).sort();
  assert.deepEqual(left, paths.map((p) => p.split("/").pop()).sort(), "captureStills borra escenas viejas y slide-*.png");
  console.log("✓ captureStills borra escenas viejas y slide-*.png del motor anterior");
} finally {
  await rm(dir, { recursive: true, force: true });
}
