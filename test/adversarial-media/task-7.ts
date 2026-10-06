import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { checkAsync } from "../_check.ts";
import { qaImagen, qaReel, type Puerta } from "../../src/calendario/qa.ts";
import { borradorASpec, storySpec, type Borrador } from "../../src/calendario/draft.ts";
import { renderCarousel } from "../../src/render/renderCarousel.ts";
import { renderReelResult } from "../../src/reel/renderReel.ts";

/**
 * Adversario T7 (QA del archivo final). Necesita ffmpeg/ffprobe y, el primero,
 * Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE): va en `test:reel`, no en `npm test`.
 * Las carpetas temporales no se borran a propósito, para poder mirar los cuadros.
 */

const puerta: Puerta = { lecturaPalabrasPorSegundo: 2.5, lecturaMinSegundos: 1.5 };
const dir = await mkdtemp(join(tmpdir(), "adv-t7-"));

function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  assert.equal(r.status, 0, `ffmpeg ${args.join(" ")}: ${r.stderr}`);
}

function borrador(name: string, title: string, highlight: string | undefined, pillar: Borrador["pillar"]): Borrador {
  return {
    name,
    angle: "tutorial",
    pillar,
    pace: "rapido",
    slides: [
      { template: "Hook", props: { title, ...(highlight ? { highlight } : {}) } },
      { template: "Step", props: { step: "01", heading: "Abre NotebookLM", highlight: "NotebookLM", body: "Sube tus apuntes." } },
      { template: "Cta", props: { title: "Guárdalo para tu prueba", highlight: "Guárdalo", reason: "Cada semana, IA útil.", handle: "ia.punto.es" } },
    ],
  };
}

// Spec "QA del archivo final": "luminancia media > 12 % (no es una pantalla negra)".
// El look lima (fondo #06060A con texto grande) NO es una pantalla negra.
await checkAsync("adversario T7: piezas buenas reales del motor (look lima) rechazadas como 'pantalla negra'", async () => {
  const out = relative(process.cwd(), dir);
  const malos: string[] = [];

  // Portada de carrusel real (Hook), convertida a JPEG como la sube el calendario.
  const b1 = borrador("adv-t7-opinion", "Esto cambia todo", undefined, "curiosidad");
  const png = (await renderCarousel(borradorASpec(b1), { outDir: join(out, "carrusel") }))[0];
  const jpg = join(dir, "portada carrusel.jpg");
  ffmpeg(["-i", png, "-q:v", "2", jpg]);
  const rc = await qaImagen(jpg, 1080, 1350);
  if (rc.motivos.some((m) => m.includes("pantalla negra"))) malos.push(`portada carrusel: ${rc.motivos.join(" / ")}`);

  // Story real (StoryCover 1080×1920).
  const b2 = borrador("adv-t7-corto", "Deja ChatGPT", "ChatGPT", "herramienta");
  const st = (await renderCarousel(storySpec(b2), { outDir: join(out, "story") }))[0];
  const rs = await qaImagen(st, 1080, 1920);
  if (rs.motivos.some((m) => m.includes("pantalla negra"))) malos.push(`story: ${rs.motivos.join(" / ")}`);

  // Cuadro 0 de un reel real (con audio).
  const tono = join(dir, "tono.m4a");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=30", tono]);
  const spec = borradorASpec(b1, { format: "reel" });
  const { path: reel } = await renderReelResult(spec, { outDir: join(out, "reel"), audio: tono });
  const rr = await qaReel(reel, jpg, spec, puerta);
  const f0 = rr.motivos.filter((m) => m.includes("cuadro 0") && m.includes("pantalla negra"));
  if (f0.length) malos.push(`reel: ${f0.join(" / ")}`);

  assert.deepEqual(malos, [], `${malos.join(" | ")} (archivos en ${dir})`);
});

/** MP4 1080×1920 claro con un bloque de "texto" en el 40 % vertical, tono audible y +faststart. */
function reelSintetico(path: string, segundos: number, fondo = "0xEBEBEB"): void {
  ffmpeg([
    "-f", "lavfi", "-i", `color=c=${fondo}:s=1080x1920:r=30:d=${segundos}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`,
    "-vf", "drawbox=x=100:y=768:w=600:h=120:color=black:t=fill",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", path,
  ]);
}

const portada = join(dir, "portada.jpg");
ffmpeg(["-f", "lavfi", "-i", "color=c=0xEBEBEB:s=1080x1920:d=1", "-vf", "drawbox=x=100:y=768:w=600:h=120:color=black:t=fill", "-frames:v", "1", portada]);
const specReel = borradorASpec(borrador("adv-t7-sint", "3 IAs gratis para estudiar", "gratis", "herramienta"), { format: "reel" });

// Brief T7, mandato adversarial: "Archivo truncado o que no existe → ok: false con motivo, nunca excepción."
await checkAsync("adversario T7: MP4 truncado (con +faststart, como lo escribe el motor) pasa el QA con ok:true", async () => {
  const completo = join(dir, "completo.mp4");
  reelSintetico(completo, 10);
  const base = await qaReel(completo, portada, specReel, puerta);
  assert.deepEqual(base.motivos, [], "el MP4 completo debe pasar (control)");
  const bytes = await readFile(completo);
  const truncado = join(dir, "truncado.mp4");
  await writeFile(truncado, bytes.subarray(0, Math.floor(bytes.length * 0.5)));
  const r = await qaReel(truncado, portada, specReel, puerta);
  assert.equal(r.ok, false, `MP4 truncado al 50 % aceptado: ${JSON.stringify(r)}`);
});

// Spec "QA del archivo final": "Cada texto del reel visible al menos palabras ÷
// lecturaPalabrasPorSegundo s". Un archivo de 3 s no muestra las escenas 2 y 3.
await checkAsync("adversario T7: los tiempos de lectura no miran el archivo: un MP4 de 3 s para un spec de ~10 s pasa", async () => {
  const corto = join(dir, "corto.mp4");
  reelSintetico(corto, 3);
  const r = await qaReel(corto, portada, specReel, puerta);
  assert.equal(r.ok, false, `reel de 3 s aceptado para un spec de varias escenas: ${JSON.stringify(r)}`);
});

// Spec "QA del archivo final": "Cuadro 0 del reel y portada del carrusel: luminancia
// media > 12 % (no es una pantalla negra), hay texto detectado en la zona segura".
await checkAsync("adversario T7: cuadro 0 del reel sin texto (claro y liso) no se reporta", async () => {
  const liso = join(dir, "cuadro0-liso.mp4");
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=0x808080:s=1080x1920:r=30:d=10",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", liso,
  ]);
  const r = await qaReel(liso, portada, specReel, puerta);
  assert.ok(r.motivos.some((m) => m.includes("texto")), `cuadro 0 sin texto aceptado: ${JSON.stringify(r)}`);
});
