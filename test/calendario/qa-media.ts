import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { checkAsync, done } from "../_check.ts";
import { qaReel, qaImagen, tieneAudio, grisDeImagen, type Puerta } from "../../src/calendario/qa.ts";
import { borradorASpec, type Borrador } from "../../src/calendario/draft.ts";
import { renderReelResult } from "../../src/reel/renderReel.ts";

/**
 * QA del archivo final con ffmpeg/Chromium reales (npm run test:reel): MP4 negro
 * y mudo, reel renderizado con audio, audio en silencio absoluto, portada clara
 * con texto oscuro y archivos truncados o inexistentes (ok:false, sin lanzar).
 */

const puerta: Puerta = { lecturaPalabrasPorSegundo: 3, lecturaMinSegundos: 2 };

function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  assert.equal(r.status, 0, `ffmpeg ${args.join(" ")}: ${r.stderr}`);
}

const borrador: Borrador = {
  name: "qa-media-prueba",
  angle: "tutorial",
  pillar: "herramienta",
  pace: "rapido",
  slides: [
    { template: "Hook", props: { title: "3 IAs gratis para estudiar", highlight: "gratis" } },
    { template: "Step", props: { step: "01", heading: "Abre NotebookLM", highlight: "NotebookLM", body: "Sube tus apuntes." } },
    { template: "Cta", props: { title: "Guárdalo para tu prueba", highlight: "Guárdalo", reason: "Cada semana, IA útil.", handle: "ia.punto.es" } },
  ],
};

const dir = await mkdtemp(join(tmpdir(), "qa-media-"));
try {
  const spec = borradorASpec(borrador, { format: "reel" });
  const portadaNegra = join(dir, "negra.jpg");
  ffmpeg(["-f", "lavfi", "-i", "color=black:s=1080x1920:d=1", "-frames:v", "1", portadaNegra]);

  await checkAsync("qaReel: MP4 negro y mudo → pantalla negra y sin audio", async () => {
    const mp4 = join(dir, "negro.mp4");
    ffmpeg(["-f", "lavfi", "-i", "color=black:s=1080x1920:d=2", "-pix_fmt", "yuv420p", mp4]);
    const r = await qaReel(mp4, portadaNegra, spec, puerta);
    assert.equal(r.ok, false);
    assert.ok(r.motivos.some((m) => m.includes("pantalla negra")), r.motivos.join(" | "));
    assert.ok(r.motivos.some((m) => m.includes("sin audio")), r.motivos.join(" | "));
    assert.equal(await tieneAudio(mp4), false);
  });

  // Reel real renderizado con un tono de 440 Hz (promo/audio/ puede estar vacía).
  const tono = join(dir, "tono.m4a");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=30", tono]);
  const salida = relative(process.cwd(), join(dir, "salida"));
  const { path: reel } = await renderReelResult(spec, { outDir: salida, audio: tono });
  const portada = join(dir, "portada.jpg");
  ffmpeg(["-ss", "1.5", "-i", reel, "-frames:v", "1", portada]);

  await checkAsync("qaReel: reel renderizado del borrador con audio → ok", async () => {
    const r = await qaReel(reel, portada, spec, puerta);
    assert.deepEqual(r.motivos, []);
    assert.equal(r.ok, true);
    assert.equal(await tieneAudio(reel), true);
  });

  await checkAsync("qaReel (adversarial): pista de audio en silencio absoluto → audio mudo", async () => {
    const mudo = join(dir, "silencio.mp4");
    ffmpeg(["-i", reel, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", mudo]);
    assert.equal(await tieneAudio(mudo), true, "la pista existe");
    const r = await qaReel(mudo, portada, spec, puerta);
    assert.equal(r.ok, false);
    assert.ok(r.motivos.some((m) => m.includes("audio mudo")), r.motivos.join(" | "));
  });

  await checkAsync("qaReel: tiempos de lectura insuficientes se reportan", async () => {
    const r = await qaReel(reel, portada, spec, { lecturaPalabrasPorSegundo: 0.5, lecturaMinSegundos: 2 });
    assert.equal(r.ok, false);
    assert.ok(r.motivos.some((m) => m.includes("escena")), r.motivos.join(" | "));
  });

  await checkAsync("qaReel (adversarial): archivo inexistente, truncado o portada inexistente → ok:false sin lanzar", async () => {
    const a = await qaReel(join(dir, "no-existe.mp4"), portada, spec, puerta);
    assert.equal(a.ok, false);
    assert.ok(a.motivos.length > 0);
    const bytes = await readFile(reel);
    const truncado = join(dir, "truncado.mp4");
    await writeFile(truncado, bytes.subarray(0, 4000));
    const b = await qaReel(truncado, portada, spec, puerta);
    assert.equal(b.ok, false);
    assert.ok(b.motivos.length > 0);
    const c = await qaReel(reel, join(dir, "no-existe.jpg"), spec, puerta);
    assert.equal(c.ok, false);
    assert.ok(c.motivos.some((m) => m.includes("portada")));
  });

  await checkAsync("qaImagen (adversarial): fondo claro con texto oscuro → ok; fondo claro sin texto → sin texto", async () => {
    const conTexto = join(dir, "clara.jpg");
    ffmpeg(["-f", "lavfi", "-i", "color=c=0xEBEBEB:s=1080x1920:d=1", "-vf", "drawbox=x=100:y=768:w=400:h=60:color=black:t=fill", "-frames:v", "1", conTexto]);
    const r = await qaImagen(conTexto, 1080, 1920);
    assert.deepEqual(r.motivos, []);
    assert.equal(r.ok, true);
    const sinTexto = join(dir, "clara-lisa.jpg");
    ffmpeg(["-f", "lavfi", "-i", "color=c=0xEBEBEB:s=1080x1920:d=1", "-frames:v", "1", sinTexto]);
    const s = await qaImagen(sinTexto, 1080, 1920);
    assert.equal(s.ok, false);
    assert.ok(s.motivos.some((m) => m.includes("texto")));
    assert.ok((await qaImagen(portadaNegra, 1080, 1920)).motivos.some((m) => m.includes("pantalla negra")));
  });

  await checkAsync("qaImagen: inexistente o truncada → ok:false sin lanzar; grisDeImagen lanza", async () => {
    assert.equal((await qaImagen(join(dir, "nada.jpg"), 1080, 1920)).ok, false);
    const bytes = await readFile(portada);
    const trunc = join(dir, "trunc.jpg");
    await writeFile(trunc, bytes.subarray(0, 200));
    const r = await qaImagen(trunc, 1080, 1920);
    assert.equal(r.ok, false);
    await assert.rejects(grisDeImagen(join(dir, "nada.jpg"), 10, 10));
  });
} finally {
  await rm(dir, { recursive: true, force: true });
}

await done();
