import assert from "node:assert/strict";
import { check, checkAsync, done } from "./_check.ts";
import { unicos, aplicarModo, revisarSegun, ErrorRevisionFallida, ErrorVisual, type Hallazgo, type TextoDom } from "../src/render/revision.ts";
import { instantesRevision, instantesFinales, encimes, numerosSolos } from "../src/reel/revision.ts";
import { reelTiming } from "../src/reel/timing.ts";

/** Agregadores puros de la revisión visual (sin navegador). */

const h: Hallazgo = { tipo: "puntuacion", motivo: "visual: espacio antes de «,» tras «SEEDANCE» en escena 3 (Clip)", escena: 2 };

check("unicos: el mismo hallazgo en 20 instantes queda uno", () => {
  assert.equal(unicos(Array.from({ length: 20 }, (_, i) => ({ ...h, t: i / 10 }))).length, 1);
});
check("unicos: distinto tipo, escena o motivo no se funden", () => {
  assert.equal(unicos([h, { ...h, escena: 3 }, { ...h, tipo: "tilde" }, { ...h, motivo: "otro" }]).length, 4);
});
check("aplicarModo bloquear lanza ErrorVisual con los motivos", () => {
  assert.throws(() => aplicarModo([h], "bloquear"), (e: unknown) => e instanceof ErrorVisual && e.name === "ErrorVisual" && /SEEDANCE/.test(e.message));
});
check("aplicarModo bloquear sin hallazgos no lanza", () => {
  aplicarModo([], "bloquear");
});
check("aplicarModo avisar y no: no lanzan", () => {
  const log: string[] = [];
  aplicarModo([h], "avisar", (t) => log.push(t));
  assert.ok(log.some((t) => /SEEDANCE/.test(t)));
  aplicarModo([h], "no");
});

const caida = async (): Promise<Hallazgo[]> => {
  throw new Error("Target page, context or browser has been closed");
};
await checkAsync("revisarSegun avisar: si la revisión se cae, advierte y sigue sin hallazgos", async () => {
  const log: string[] = [];
  assert.deepEqual(await revisarSegun("avisar", caida, (t) => log.push(t)), []);
  assert.equal(log.length, 1);
  assert.match(log[0], /^la revisión visual falló: Target page/);
});
await checkAsync("revisarSegun bloquear: si la revisión se cae, lanza ErrorRevisionFallida («la revisión visual falló: …»)", async () => {
  await assert.rejects(revisarSegun("bloquear", caida), (e: unknown) =>
    e instanceof ErrorRevisionFallida && !(e instanceof ErrorVisual) && /^la revisión visual falló: Target page/.test((e as Error).message));
});
await checkAsync("revisarSegun: devuelve los hallazgos; con no ni la corre", async () => {
  assert.deepEqual(await revisarSegun("bloquear", async () => [h]), [h]);
  let corrida = false;
  assert.deepEqual(await revisarSegun("no", async () => { corrida = true; return [h]; }), []);
  assert.equal(corrida, false);
});

// --- Revisión del reel en el tiempo (agregadores puros) ---

check("instantesRevision: escena única → cada 0,1 s más total − 0,05, sin mitades de transición", () => {
  const t = reelTiming([3], 0.5, "ensenar");
  const xs = instantesRevision(t);
  assert.ok(xs.includes(2.95), JSON.stringify(xs));
  assert.equal(xs[0], 0);
  assert.ok(xs.includes(1.5) && xs.includes(3));
  // Solo la grilla de 0,1 s y el final: 31 + 1.
  assert.equal(xs.length, 32);
  assert.deepEqual(instantesFinales(t), [2.95]);
});
check("instantesRevision: varias escenas → finales como captureStills y mitad de cada transición, ordenados y sin repetir", () => {
  const t = reelTiming([3, 3, 3], 0.5, "ensenar"); // empiezan en 0, 2.5, 5; total 8
  const xs = instantesRevision(t);
  assert.deepEqual(instantesFinales(t), [2.45, 4.95, 7.95]);
  for (const x of [2.45, 4.95, 7.95, 2.75, 5.25]) assert.ok(xs.includes(x), `${x} en ${JSON.stringify(xs)}`);
  assert.deepEqual(xs, [...new Set(xs)].sort((a, b) => a - b));
  assert.equal(xs[xs.length - 1], 8);
});

const ctx = (i: number) => `escena ${i + 1} (Prueba)`;
const caja = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });
const tx = (escena: number, texto: string, opacidad: number, rect = caja(0, 0), extra: Partial<TextoDom> = {}): TextoDom => ({ escena, texto, opacidad, rect, marca: false, ...extra });

check("encimes: opacidades 0,5/0,5 e intersección del 50 % → 1 hallazgo transicion", () => {
  const h = encimes([{ t: 2.7, textos: [tx(0, "SEEDANCE", 0.5), tx(1, "GANA KLING", 0.5, caja(50, 0))] }], ctx);
  assert.equal(h.length, 1, JSON.stringify(h));
  assert.equal(h[0].tipo, "transicion");
  assert.equal(h[0].t, 2.7);
  assert.match(h[0].motivo, /SEEDANCE/);
  assert.match(h[0].motivo, /GANA KLING/);
  assert.match(h[0].motivo, /escena 2 \(Prueba\)/);
});
check("encimes: opacidades 0,25/0,9 → 0", () => {
  assert.deepEqual(encimes([{ t: 1, textos: [tx(0, "A", 0.25), tx(1, "B", 0.9, caja(50, 0))] }], ctx), []);
});
check("encimes: intersección del 5 % → 0", () => {
  assert.deepEqual(encimes([{ t: 1, textos: [tx(0, "A", 0.5), tx(1, "B", 0.5, caja(95, 0))] }], ctx), []);
});
check("encimes: misma escena o marca no cuentan; varios instantes del mismo par → 1", () => {
  assert.deepEqual(encimes([{ t: 1, textos: [tx(0, "A", 1), tx(0, "B", 1)] }], ctx), []);
  assert.deepEqual(encimes([{ t: 1, textos: [tx(0, "A", 1, caja(0, 0), { marca: true }), tx(1, "B", 1)] }], ctx), []);
  const serie = [0.1, 0.2, 0.3].map((t) => ({ t, textos: [tx(0, "A", 0.6), tx(1, "B", 0.6), tx(1, "C", 0.6)] }));
  assert.equal(encimes(serie, ctx).length, 1);
});

/** Serie de 0 a 1 s cada 0,1 s: número a 0,9 siempre; heading a 0 en [desde, hasta] y a 1 fuera. */
function seriePaso(desde: number, hasta: number) {
  return Array.from({ length: 11 }, (_, k) => {
    const t = +(k / 10).toFixed(1);
    const oculto = t >= desde - 1e-9 && t <= hasta + 1e-9;
    return { t, textos: [tx(1, "3", 0.9, caja(0, 0), { paso: "numero" }), tx(1, "COPIA EL PROMPT", oculto ? 0 : 1, caja(0, 200), { paso: "heading" })] };
  });
}
check("numerosSolos: número a 0,9 y heading a 0 durante 0,5 s → 1", () => {
  const h = numerosSolos(seriePaso(0.2, 0.7), ctx);
  assert.equal(h.length, 1, JSON.stringify(h));
  assert.equal(h[0].tipo, "numero-solo");
  assert.equal(h[0].escena, 1);
  assert.equal(h[0].t, 0.2);
  assert.match(h[0].motivo, /«3»/);
  assert.match(h[0].motivo, /escena 2 \(Prueba\)/);
});
check("numerosSolos: durante 0,3 s → 0", () => {
  assert.deepEqual(numerosSolos(seriePaso(0.2, 0.5), ctx), []);
});
check("numerosSolos: el heading en varias palabras cuenta por la más visible", () => {
  const serie = seriePaso(0.2, 0.7).map((s) => ({ ...s, textos: [...s.textos, tx(1, "YA", 1, caja(0, 300), { paso: "heading" })] }));
  assert.deepEqual(numerosSolos(serie, ctx), []);
});

await done();
