import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync, done } from "../_check.ts";
import { mezclarClips } from "../../src/calendario/clips.ts";
import { grisDeImagen, luminanciaMedia, tieneAudio } from "../../src/calendario/qa.ts";

/**
 * Mezcla real de clips con ffmpeg (npm run test:reel): un reel negro de 4 s con
 * audio y un clip rojo de 1 s en una escena de 2 s. A 1,5 s se ve el último
 * cuadro congelado del clip; a 3 s vuelve el negro; la duración y el audio del
 * reel no cambian.
 */

const W = 1080;
const H = 1920;

function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  assert.equal(r.status, 0, String(r.stderr));
}
function duracion(f: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).trim());
}
/** Luminancia media (0..1) del cuadro en el segundo `t`. */
async function luzEn(mp4: string, t: number, dir: string): Promise<number> {
  const jpg = join(dir, `cuadro-${t}.png`);
  ffmpeg(["-ss", String(t), "-i", mp4, "-frames:v", "1", jpg]);
  return luminanciaMedia(await grisDeImagen(jpg, W, H));
}

const dir = mkdtempSync(join(tmpdir(), "clips-media-"));
const reel = join(dir, "reel.mp4");
const clip = join(dir, "clip.mp4");
const salida = join(dir, "mezcla.mp4");

await checkAsync("mezclarClips: el clip corto se congela hasta el fin de su escena y después vuelve el negro; duración y audio intactos", async () => {
  ffmpeg(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=30:d=4`, "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", reel]);
  ffmpeg(["-f", "lavfi", "-i", `color=c=red:s=${W}x${H}:r=30:d=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
  await mezclarClips(reel, [{ ruta: clip, rango: { escena: 0, archivo: "clip.mp4", inicio: 0, fin: 2 } }], salida);
  assert.ok(Math.abs(duracion(salida) - duracion(reel)) <= 0.1, `dura ${duracion(salida)} s y el original ${duracion(reel)} s`);
  assert.ok(await tieneAudio(salida), "la mezcla perdió el audio");
  const en0 = await luzEn(salida, 0, dir);
  const en15 = await luzEn(salida, 1.5, dir);
  const en3 = await luzEn(salida, 3, dir);
  assert.ok(en0 > 0.1, `cuadro 0 negro (${en0})`);
  assert.ok(en15 > 0.1, `a 1,5 s el clip ya no se ve (${en15}): debía congelar su último cuadro`);
  assert.ok(en3 < 0.03, `a 3 s debía ser negro (${en3})`);
});

await done();
