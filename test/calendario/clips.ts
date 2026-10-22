import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { reelTiming } from "../../src/reel/timing.ts";
import { Clip, Step, Cta } from "../../src/templates/index.ts";
import type { CarouselSpec } from "../../src/templates/types.ts";
import { ARCHIVO_CLIP_RE, CLIP_BRILLO, CLIP_FADE, CLIP_SOMBRA_ALTO, CLIP_SOMBRA_MIN, archivoClipError, clipsFaltantes, filtroClips, rangosClips, rutaClip } from "../../src/calendario/clips.ts";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Escenas `Clip` del calendario: en qué segundos se ve cada clip y el filtro
 * ffmpeg que los mezcla (puro). La mezcla real se prueba en clips-media.ts.
 */

const spec: CarouselSpec = {
  name: "x",
  slides: [
    { template: Clip, props: { title: "Una foto, 1 anuncio", archivo: "anuncio-1.mp4", format: "reel" } },
    { template: Step, props: { heading: "Sube la foto", format: "reel" } },
    { template: Clip, props: { title: "En uso", archivo: "anuncio-2.mp4", format: "reel" } },
    { template: Cta, props: { title: "Guárdalo", format: "reel" } },
  ],
};
const DIM = { width: 1080, height: 1920, fps: 30 };

check("rangosClips: la escena 0 empieza en 0, las demás tras la transición; la última llega hasta su fin", () => {
  const t = reelTiming([3, 2.5, 4, 3], 0.3, "gancho");
  assert.deepEqual(rangosClips(spec, t), [
    { escena: 0, archivo: "anuncio-1.mp4", inicio: 0, fin: 2.7 },
    { escena: 2, archivo: "anuncio-2.mp4", inicio: 5.2, fin: 8.6 },
  ]);
  const ultimo: CarouselSpec = { name: "y", slides: [spec.slides[1], spec.slides[0]] };
  assert.deepEqual(rangosClips(ultimo, reelTiming([2.5, 3], 0.3, "gancho")), [{ escena: 1, archivo: "anuncio-1.mp4", inicio: 2.5, fin: 5.2 }]);
  assert.deepEqual(rangosClips({ name: "z", slides: [spec.slides[1]] }, reelTiming([2.5], 0.3)), []);
});

check("filtroClips: una entrada por rango (el mismo archivo en dos escenas se abre dos veces), sin fade-in en t = 0", () => {
  const rangos = [
    { escena: 0, archivo: "a.mp4", inicio: 0, fin: 2.7 },
    { escena: 2, archivo: "a.mp4", inicio: 5.2, fin: 8.6 },
  ];
  const f = filtroClips(rangos, DIM);
  assert.ok(f.includes("[1:v]") && f.includes("[2:v]"));
  assert.equal((f.match(/blend=all_mode=lighten/g) ?? []).length, 2);
  assert.ok(f.includes("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30"));
  assert.ok(f.includes(`colorchannelmixer=rr=${CLIP_BRILLO}:gg=${CLIP_BRILLO}:bb=${CLIP_BRILLO}`));
  assert.ok(f.includes("tpad=stop_mode=clone:stop_duration=2.7"), "el clip corto congela su último cuadro");
  assert.ok(f.includes("tpad=start_duration=5.2:start_mode=add:color=black"), "el segundo clip arranca a los 5.2 s");
  // La cadena de cada clip termina en la parte "[aN][mN]blend=…": ahí van los fundidos y el desplazamiento.
  const [c1, c2] = f.split(";").filter((p) => p.startsWith("[a1][m1]") || p.startsWith("[a2][m2]"));
  assert.ok(!c1.includes("fade=t=in"), "en t = 0 el clip se ve desde el cuadro 0");
  assert.ok(c2.includes(`fade=t=in:st=0:d=${CLIP_FADE}`));
  assert.ok(c1.includes(`fade=t=out:st=${(2.7 - CLIP_FADE).toFixed(3)}:d=${CLIP_FADE}`));
  assert.ok(f.endsWith("format=yuv420p[v]"));
});

check("archivoClipError: solo nombres .mp4 sin rutas", () => {
  assert.equal(archivoClipError("idea-1.mp4"), undefined);
  for (const malo of ["../a.mp4", "a.mov", "a/b.mp4", ".a.mp4", "", 3, "a..b.mp4"]) {
    assert.ok(typeof archivoClipError(malo) === "string", `${JSON.stringify(malo)} debería rechazarse`);
  }
  assert.ok(ARCHIVO_CLIP_RE.test("Anuncio_2.mp4"));
  assert.equal(rutaClip("/c", "2026-10-19", "jue-pm-reel-x", "a.mp4"), "/c/2026-10-19/jue-pm-reel-x/a.mp4");
});

check("clipsFaltantes: antes de renderizar, las rutas de los clips que no están en la caché (sin timing)", () => {
  const dir = mkdtempSync(join(tmpdir(), "clips-cache-"));
  mkdirSync(join(dir, "2026-10-19", "jue-pm-reel-x"), { recursive: true });
  writeFileSync(join(dir, "2026-10-19", "jue-pm-reel-x", "anuncio-1.mp4"), "x");
  const slides = [{ template: "Clip", props: { title: "a", archivo: "anuncio-1.mp4" } }, { template: "Step", props: { heading: "b" } }, { template: "Clip", props: { title: "c", archivo: "anuncio-2.mp4" } }];
  assert.deepEqual(clipsFaltantes(slides, dir, "2026-10-19", "jue-pm-reel-x"), [join(dir, "2026-10-19", "jue-pm-reel-x", "anuncio-2.mp4")]);
  assert.deepEqual(clipsFaltantes(slides.slice(0, 2), dir, "2026-10-19", "jue-pm-reel-x"), []);
  assert.deepEqual(clipsFaltantes([{ template: "Step", props: { heading: "b" } }], dir, "2026-10-19", "otra"), []);
});

check("filtroClips: cada clip lleva una sombra degradada en el tercio superior (multiply con una máscara geq) antes de los fundidos", () => {
  const f = filtroClips([{ escena: 0, archivo: "a.mp4", inicio: 0, fin: 2 }, { escena: 2, archivo: "b.mp4", inicio: 4, fin: 6 }], DIM);
  assert.equal((f.match(/blend=all_mode=multiply/g) ?? []).length, 2);
  assert.equal((f.match(/geq=lum=/g) ?? []).length, 2);
  assert.ok(f.includes(`${Math.round(1920 * CLIP_SOMBRA_ALTO)}`), "la máscara usa la altura de la sombra en píxeles");
  assert.ok(f.includes(String(CLIP_SOMBRA_MIN)));
  // El multiply va antes del fade de salida y del desplazamiento en el tiempo.
  const i1 = f.indexOf("blend=all_mode=multiply"), i2 = f.indexOf("fade=t=out"), i3 = f.indexOf("tpad=start_duration");
  assert.ok(i1 < i2 && i2 < i3);
  assert.equal((f.match(/blend=all_mode=lighten/g) ?? []).length, 2);
});
