import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { derivar, modoComparacion, valorSenal, ventanaDebida, VENTANAS, desvioVentana } from "../../src/insights/derive.ts";

check("VENTANAS: 24 h, 72 h, 7 d, 14 d, 21 d, 28 d", () => {
  assert.deepEqual(VENTANAS.map((v) => v.horas), [24, 72, 168, 336, 504, 672]);
});
check("ventanaDebida: dentro de ±1 h de las 24 h", () => {
  const pub = new Date("2026-10-12T22:30:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-13T21:45:00Z"), new Set()), "24h");
  assert.equal(ventanaDebida(pub, new Date("2026-10-13T20:00:00Z"), new Set()), undefined);
});
check("ventanaDebida: si el bot estuvo caído, toma la ventana atrasada más reciente que no se tomó, sin pasar de 28d+1h", () => {
  const pub = new Date("2026-10-01T00:00:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-04T05:00:00Z"), new Set(["24h"])), "72h");
  assert.equal(ventanaDebida(pub, new Date("2026-10-08T00:30:00Z"), new Set(["24h"])), "7d");
  assert.equal(ventanaDebida(pub, new Date("2026-11-01T00:00:00Z"), new Set()), undefined);
});
check("ventanaDebida: no repite una ventana ya tomada", () => {
  const pub = new Date("2026-10-12T22:30:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-13T22:30:00Z"), new Set(["24h"])), undefined);
});
check("ventanaDebida: bot apagado 5 días salta 24h y 72h hacia la más reciente vencida", () => {
  const pub = new Date("2026-10-01T00:00:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-06T00:00:00Z"), new Set()), "72h");
  // la más reciente ya tomada: no se retoma una anterior
  assert.equal(ventanaDebida(pub, new Date("2026-10-06T00:00:00Z"), new Set(["72h"])), undefined);
});
check("ventanaDebida: borde de 28 d + 1 h y publicación futura", () => {
  const pub = new Date("2026-10-01T00:00:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-10-29T01:00:00Z"), new Set(["24h", "72h", "7d", "14d", "21d"])), "28d");
  assert.equal(ventanaDebida(pub, new Date("2026-10-29T01:00:01Z"), new Set()), undefined);
  assert.equal(ventanaDebida(pub, new Date("2026-09-30T00:00:00Z"), new Set()), undefined);
  assert.equal(ventanaDebida(new Date("invalid"), new Date("2026-10-29T01:00:00Z"), new Set()), undefined);
});
check("ventanaDebida: un cambio de hora de Chile no mueve las ventanas (son horas absolutas)", () => {
  // Cambio a horario de verano: domingo 2026-09-06 04:00 UTC. 24 h son 24 h reales.
  const pub = new Date("2026-09-05T20:00:00Z");
  assert.equal(ventanaDebida(pub, new Date("2026-09-06T20:00:00Z"), new Set()), "24h");
  assert.equal(ventanaDebida(pub, new Date("2026-09-06T18:30:00Z"), new Set()), undefined);
});
check("desvioVentana: milisegundos de desvío respecto de la hora nominal", () => {
  const pub = new Date("2026-10-01T00:00:00Z");
  assert.equal(desvioVentana(pub, "7d", new Date("2026-10-08T05:00:00Z")), 5 * 3_600_000);
  assert.equal(desvioVentana(pub, "24h", new Date("2026-10-01T23:30:00Z")), -30 * 60_000);
});
check("derivar: reach 0 o ausente no produce tasas (ni NaN ni Infinity)", () => {
  assert.deepEqual(derivar({ reach: 0, saved: 2, descartadas: [] }), {});
  assert.deepEqual(derivar({ saved: 2, descartadas: [] }), {});
  assert.deepEqual(derivar({ reach: NaN, saved: 2, descartadas: [] }), {});
  assert.deepEqual(derivar({ reach: -5, saved: 2, descartadas: [] }), {});
});
check("derivar: tasas por alcance y solo de lo que hay", () => {
  assert.deepEqual(derivar({ reach: 200, saved: 10, shares: 4, descartadas: [] }), { saved_por_alcance: 0.05, shares_por_alcance: 0.02 });
  assert.deepEqual(derivar({ reach: 100, comments: 1, views: 250, descartadas: [] }), { comments_por_alcance: 0.01, views_por_alcance: 2.5 });
});
check("derivar: retención solo con duración conocida", () => {
  const d = derivar({ reach: 10, avg_watch_ms: 6000, descartadas: [] }, 20000);
  assert.equal(d.retencion, 0.3);
  assert.equal(derivar({ reach: 10, avg_watch_ms: 6000, descartadas: [] }).retencion, undefined);
  assert.equal(derivar({ reach: 10, avg_watch_ms: 6000, descartadas: [] }, 0).retencion, undefined);
  assert.equal(derivar({ reach: 10, descartadas: [] }, 20000).retencion, undefined);
  assert.equal(derivar({ reach: 0, avg_watch_ms: 6000, descartadas: [] }, 20000).retencion, 0.3);
});
check("valorSenal: conteo absoluto bajo el umbral, tasa sobre él", () => {
  const m = { reach: 12, saved: 3, shares: 1, descartadas: [] };
  assert.equal(valorSenal("guardados", m, derivar(m), 50), 3);
  const g = { reach: 200, saved: 10, descartadas: [] };
  assert.equal(valorSenal("guardados", g, derivar(g), 50), 0.05);
  assert.equal(valorSenal("retencion", m, derivar(m), 50), undefined);
});
check("valorSenal: envíos y comentarios; alcance ausente o 0 cae a conteos; retención siempre es ratio", () => {
  const m = { reach: 12, saved: 3, shares: 1, comments: 2, avg_watch_ms: 5000, descartadas: [] };
  assert.equal(valorSenal("envios", m, derivar(m, 10000), 50), 1);
  assert.equal(valorSenal("comentarios", m, derivar(m, 10000), 50), 2);
  assert.equal(valorSenal("retencion", m, derivar(m, 10000), 50), 0.5);
  const z = { reach: 0, saved: 3, descartadas: [] };
  assert.equal(valorSenal("guardados", z, derivar(z), 50), 3);
  assert.equal(valorSenal("guardados", { descartadas: [] }, {}, 50), undefined);
});
check("modoComparacion: umbral 50", () => {
  assert.equal(modoComparacion(49, 50), "absoluto");
  assert.equal(modoComparacion(50, 50), "tasa");
  assert.equal(modoComparacion(undefined, 50), "absoluto");
  assert.equal(modoComparacion(0, 0), "absoluto");
});
