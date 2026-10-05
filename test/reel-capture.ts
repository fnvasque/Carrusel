import assert from "node:assert/strict";
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
 * stderr de ffmpeg, sin colgarse y sin dejar mp4 parcial; y captureStills limpia
 * escenas viejas. Uso: npm run test:reel
 */
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

  await writeFile(join(dir, "escena-99.png"), "viejo");
  const paths = await captureStills(html, timing, dir);
  const left = (await readdir(dir)).filter((f) => f.startsWith("escena-")).sort();
  assert.deepEqual(left, paths.map((p) => p.split("/").pop()).sort(), "captureStills borra escenas viejas");
  console.log("✓ captureStills borra escenas viejas");
} finally {
  await rm(dir, { recursive: true, force: true });
}
