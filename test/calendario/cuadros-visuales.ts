import assert from "node:assert/strict";
import { check } from "../_check.ts";
import type { Borrador } from "../../src/calendario/draft.ts";
import { cuadrosARevisar } from "../../src/calendario/cuadros-visuales.ts";

const slide = (template: string, background?: Record<string, unknown>) =>
  ({ template, props: {}, ...(background ? { background } : {}) });
const borr = (slides: ReturnType<typeof slide>[], pace?: string): Borrador =>
  ({ name: "x", slides, ...(pace ? { pace } : {}) }) as unknown as Borrador;

// 6 escenas de 4 s; transición de "ensenar" = 0,5.
const escenas6 = Array.from({ length: 6 }, (_, i) => ({ start: i * 4, dur: 4 }));

check("cuadros: carrusel de 5 slides con ai en 1 y 4 → portada + slide 4, sin duplicar", () => {
  const b = borr([slide("Hook", { ai: "a" }), slide("Lead"), slide("Step"), slide("Step", { ai: "b" }), slide("Cta")]);
  const c = cuadrosARevisar("carrusel", b, undefined, 0.5, 8);
  assert.deepEqual(c, [
    { n: 1, que: "portada", archivo: "01.jpg" },
    { n: 2, que: "slide 4", archivo: "04.jpg" },
  ]);
});

check("cuadros: fondos color/gradient no cuentan; image sí", () => {
  const b = borr([slide("Hook"), slide("Lead", { color: "#000" }), slide("Step", { gradient: "g" }), slide("Step", { image: "f.jpg" })]);
  assert.deepEqual(cuadrosARevisar("carrusel", b, undefined, 0.5, 8).map((c) => c.que), ["portada", "slide 4"]);
});

check("cuadros: quitados (ai que el render descarta) no se revisan", () => {
  const b = borr([slide("Hook", { ai: "a" }), slide("Lead"), slide("Step", { ai: "b" })]);
  assert.deepEqual(cuadrosARevisar("carrusel", b, undefined, 0.5, 8, [2]).map((c) => c.que), ["portada"]);
});

check("cuadros: reel de 6 escenas con Clip en la 1 y la 3 → portada + 6 cuadros", () => {
  const b = borr([slide("Clip"), slide("Lead"), slide("Clip"), slide("Step"), slide("Step"), slide("Cta")]);
  const c = cuadrosARevisar("reel", b, escenas6, 0.5, 20);
  assert.equal(c.length, 7);
  assert.deepEqual(c[0], { n: 1, que: "portada", archivo: "cover.jpg" });
  assert.deepEqual(c.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(c.slice(1).map((x) => [x.que, x.t, x.archivo]), [
    ["escena 1 (Clip) a 0 s", 0, "reel.mp4"],
    ["escena 1 (Clip) a 1 s", 1, "reel.mp4"],
    ["escena 1 (Clip) final", 3.45, "reel.mp4"],
    ["escena 3 (Clip) a 0 s", 8, "reel.mp4"],
    ["escena 3 (Clip) a 1 s", 9, "reel.mp4"],
    ["escena 3 (Clip) final", 11.45, "reel.mp4"],
  ]);
});

check("cuadros: la última escena termina en total − 0,05 y la transición sale del ritmo", () => {
  const b = borr([slide("Hook"), slide("Cta", { ai: "x" })], "rapido");
  const c = cuadrosARevisar("reel", b, [{ start: 0, dur: 3 }, { start: 3, dur: 4 }], 0.35, 20);
  assert.equal(c.at(-1)!.t, 6.95);
  const d = cuadrosARevisar("reel", borr([slide("Clip"), slide("Cta")], "rapido"), [{ start: 0, dur: 3 }, { start: 3, dur: 4 }], 0.35, 20);
  assert.equal(d.find((x) => x.que.endsWith("final"))!.t, 2.6);
});

check("cuadros: max 4 recorta por prioridad (portada, finales, 0 s, 1 s) y conserva el orden", () => {
  const b = borr([slide("Clip"), slide("Lead"), slide("Clip"), slide("Step"), slide("Step"), slide("Cta")]);
  const c = cuadrosARevisar("reel", b, escenas6, 0.5, 4);
  assert.deepEqual(c.map((x) => x.que), ["portada", "escena 1 (Clip) a 0 s", "escena 1 (Clip) final", "escena 3 (Clip) final"]);
  assert.deepEqual(c.map((x) => x.n), [1, 2, 3, 4]);
});

check("cuadros: reel sin escenas → solo la portada; max 1 → portada", () => {
  const b = borr([slide("Clip"), slide("Cta")]);
  assert.deepEqual(cuadrosARevisar("reel", b, undefined, 0.5, 8), [{ n: 1, que: "portada", archivo: "cover.jpg" }]);
  assert.equal(cuadrosARevisar("reel", b, [{ start: 0, dur: 3 }, { start: 3, dur: 3 }], 0.5, 1).length, 1);
});

check("cuadros: carrusel recortado a max conserva la portada", () => {
  const b = borr([slide("Hook"), slide("Lead", { ai: "a" }), slide("Step", { ai: "a" }), slide("Cta", { ai: "a" })]);
  assert.deepEqual(cuadrosARevisar("carrusel", b, undefined, 0.5, 2).map((c) => c.que), ["portada", "slide 2"]);
});
