import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { luminanciaMedia, hayTextoEnZona, tiemposDeLectura } from "../../src/calendario/qa.ts";
import { Hook } from "../../src/templates/index.ts";
import type { CarouselSpec } from "../../src/templates/types.ts";

/** QA del archivo final: partes puras (luminancia, texto en zona, tiempos de lectura). */

const W = 1080;
const H = 1920;

/** Lienzo W×H de valor `bg` con un rectángulo 400×60 de valor `fg` con su borde superior en `yFrac`. */
function lienzo(bg: number, fg: number | null, yFrac: number): Uint8Array {
  const g = new Uint8Array(W * H).fill(bg);
  if (fg !== null) {
    const y0 = Math.floor(H * yFrac);
    for (let y = y0; y < y0 + 60; y++) for (let x = 100; x < 500; x++) g[y * W + x] = fg;
  }
  return g;
}

check("luminanciaMedia: negro 0, blanco 1, mitad 0.5", () => {
  assert.equal(luminanciaMedia(new Uint8Array(100).fill(0)), 0);
  assert.equal(luminanciaMedia(new Uint8Array(100).fill(255)), 1);
  assert.ok(Math.abs(luminanciaMedia(new Uint8Array([0, 255])) - 0.5) < 1e-9);
  assert.equal(luminanciaMedia(new Uint8Array(0)), 0);
});

check("hayTextoEnZona: rectángulo blanco al 40 % sí; al 90 % no", () => {
  assert.equal(hayTextoEnZona(lienzo(0, 255, 0.4), W, H), true);
  assert.equal(hayTextoEnZona(lienzo(0, 255, 0.9), W, H), false);
});

check("hayTextoEnZona: grilla lima tenue sin texto no cuenta", () => {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x % 120 === 0 || y % 120 === 0) g[y * W + x] = 40;
  assert.equal(hayTextoEnZona(g, W, H), false);
});

check("hayTextoEnZona (adversarial): fondo muy claro con texto oscuro sí cuenta", () => {
  assert.equal(hayTextoEnZona(lienzo(235, 20, 0.4), W, H), true);
});

check("hayTextoEnZona: fondo blanco liso sin texto no cuenta; buffers inválidos → false", () => {
  assert.equal(hayTextoEnZona(lienzo(255, null, 0.4), W, H), false);
  assert.equal(hayTextoEnZona(new Uint8Array(10), W, H), false);
  assert.equal(hayTextoEnZona(new Uint8Array(0), 0, 0), false);
});

const treintaPalabras = Array.from({ length: 30 }, (_, i) => `palabra${i}`).join(" ");
const spec = (title: string): CarouselSpec => ({ name: "t", slides: [{ template: Hook, props: { title } }] });

check("tiemposDeLectura: 30 palabras en 4 s se reporta", () => {
  const r = tiemposDeLectura(spec(treintaPalabras), 3, 2, [4]);
  assert.equal(r.length, 1);
  assert.match(r[0], /escena 1/);
});

check("tiemposDeLectura: texto corto con tiempo de sobra pasa; el mínimo también cuenta", () => {
  assert.deepEqual(tiemposDeLectura(spec("Hola mundo"), 3, 2, [4]), []);
  assert.equal(tiemposDeLectura(spec("Hola mundo"), 3, 2, [1.5]).length, 1);
});

check("tiemposDeLectura: sin duraciones usa las del motor", () => {
  assert.deepEqual(tiemposDeLectura(spec("Hola mundo"), 3, 2), []);
});
