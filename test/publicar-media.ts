import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync, done } from "./_check.ts";
import { extraerCuadros, inspeccionarVideo } from "../src/publicar/video.ts";

/**
 * Prueba con ffmpeg/ffprobe reales (npm run test:reel): un mp4 vertical de 4 s en una
 * carpeta con espacio en el nombre. Se inspecciona y se extraen portada, story y 6 cuadros.
 */

await checkAsync("inspeccionarVideo y extraerCuadros con ffmpeg real (ruta con espacio)", async () => {
  const d = mkdtempSync(join(tmpdir(), "publicar media "));
  try {
    const mp4 = join(d, "mi video.mp4");
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30", "-t", "4", "-pix_fmt", "yuv420p", "-c:v", "libx264", mp4]);
    if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr)}`);

    const info = await inspeccionarVideo(mp4);
    if (info.ancho !== 1080 || info.alto !== 1920) throw new Error(`tamaño ${info.ancho}x${info.alto}`);
    if (Math.abs(info.duracionMs - 4000) > 200) throw new Error(`duración ${info.duracionMs}`);
    if (info.codec !== "h264" || info.tieneAudio) throw new Error(`codec/audio ${info.codec} ${info.tieneAudio}`);

    const out = join(d, "cuadros dir");
    const c = await extraerCuadros(mp4, out, info);
    if (c.cover !== join(out, "cover.jpg") || c.story !== join(out, "story.jpg")) throw new Error(`rutas ${c.cover} ${c.story}`);
    for (const f of [c.cover, c.story, ...c.clave]) if (!existsSync(f)) throw new Error(`falta ${f}`);
    if (c.clave.length !== 6) throw new Error(`clave ${c.clave.length}`);
    if (!c.clave.every((f, i) => f === join(out, `clave-${i + 1}.jpg`))) throw new Error(`nombres ${c.clave.join()}`);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

await done();
