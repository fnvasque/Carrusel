import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { check, checkAsync } from "../_check.ts";
import { derivar } from "../../src/insights/derive.ts";
import type { Instantanea } from "../../src/insights/snapshots.ts";
import { formatResumen, resumirSemana } from "../../src/insights/summary.ts";
import type { Plan, SemanaLeida } from "../../src/calendario/plan.ts";
import {
  aplicarSeparacion, compararParametro, construirBucle, debeEscribirBucle, derivadosPendientes, diagnostico, escribirBucle, ganadores,
  horasDesdeOnline, medicionesDe, pesoEncogido, pesos, seguidoresPorPieza, type Medicion,
} from "../../src/calendario/bucle.ts";

const execFileP = promisify(execFile);

// --- fábricas ---

let seq = 0;
function med(extra: Partial<Medicion> = {}): Medicion {
  seq++;
  return {
    piezaId: `p${seq}`, mediaId: `m${seq}`, tema: "IA", arquetipo: "tutorial", hookCategoria: "curiosidad",
    senal: "guardados", valor: 1, modo: "absoluto", semana: "2026-10-12", ...extra,
  };
}

/** Recorre un valor JSON y falla si encuentra NaN, Infinity o null. */
function sinNumerosRaros(v: unknown, ruta = "$"): void {
  if (v === null) assert.fail(`null en ${ruta}`);
  if (typeof v === "number") assert.ok(Number.isFinite(v), `número no finito en ${ruta}`);
  if (Array.isArray(v)) v.forEach((x, i) => sinNumerosRaros(x, `${ruta}[${i}]`));
  else if (typeof v === "object" && v) for (const [k, x] of Object.entries(v)) sinNumerosRaros(x, `${ruta}.${k}`);
}

// --- pesoEncogido ---

check("pesoEncogido: n < 3 → undefined", () => {
  assert.equal(pesoEncogido([10, 10], 2), undefined);
  assert.equal(pesoEncogido([], 2), undefined);
});

check("pesoEncogido: (n·media + k·global)/(n + k) con k = 3", () => {
  assert.equal(pesoEncogido([10, 10, 10], 2), 6);
  assert.equal(pesoEncogido([10, 10, 10], 2, 0), 10);
});

check("pesoEncogido: un viral no dicta el peso", () => {
  const p = pesoEncogido([1000, 1, 1], 2)!;
  assert.ok(p <= 170, `peso ${p}`);
});

check("pesoEncogido: valores o media global no finitos no producen NaN", () => {
  assert.equal(pesoEncogido([NaN, 1, 1, 1], 2), pesoEncogido([1, 1, 1], 2));
  assert.equal(pesoEncogido([1, 1, 1], NaN), undefined);
  assert.equal(pesoEncogido([NaN, Infinity, 1], 2), undefined);
});

// --- pesos ---

check("pesos: tema con tildes o [[ ]] se agrupa igual (topicKey)", () => {
  const m = [
    med({ tema: "[[Automatización con IA]]", valor: 4 }),
    med({ tema: "Automatizacion con IA", valor: 4 }),
    med({ tema: "automatización con ia", valor: 4 }),
    med({ tema: "Otro", valor: 0 }),
  ];
  const p = pesos(m, "tema");
  const claves = Object.keys(p);
  assert.equal(claves.length, 2, claves.join(" | "));
  const auto = Object.entries(p).find(([k]) => k.toLowerCase().includes("autom"))!;
  assert.ok(!auto[0].includes("[["), "la clave se muestra sin [[ ]]");
  assert.equal(auto[1].n, 3);
  assert.ok(auto[1].peso! > 1, "un tema por encima de la media pesa > 1");
  assert.equal(p.Otro?.n, 1);
  assert.equal(p.Otro?.peso, undefined, "con 1 pieza no hay peso");
});

check("pesos: índice relativo a su señal (no mezcla retención con guardados)", () => {
  // Tema A: retención 0,5 (media de retención 0,5); tema B: 10 guardados (media 10). Ambos están en su media.
  const m = [
    ...[1, 2, 3].map(() => med({ tema: "A", senal: "retencion", modo: "tasa", valor: 0.5 })),
    ...[1, 2, 3].map(() => med({ tema: "B", senal: "guardados", valor: 10 })),
  ];
  const p = pesos(m, "tema");
  assert.equal(p.A?.peso, 1);
  assert.equal(p.B?.peso, 1);
});

check("pesos: si la cuenta cruzó el umbral, solo cuentan las piezas en modo tasa", () => {
  const m = [
    // Antes del cruce: conteos absolutos enormes del tema Viejo.
    ...[1, 2, 3].map(() => med({ tema: "Viejo", valor: 40, modo: "absoluto", semana: "2026-10-05" })),
    ...[1, 2, 3].map(() => med({ tema: "Nuevo", valor: 0.05, modo: "tasa", semana: "2026-10-26" })),
    ...[1, 2, 3].map(() => med({ tema: "Otro", valor: 0.01, modo: "tasa", semana: "2026-10-26" })),
  ];
  const p = pesos(m, "tema");
  assert.equal(p.Viejo, undefined, "los absolutos no entran tras el cruce");
  assert.ok(p.Nuevo!.peso! > p.Otro!.peso!);
});

check("pesos: todas las piezas con valor 0 → peso 1 sin NaN", () => {
  const m = [1, 2, 3, 4].map(() => med({ valor: 0 }));
  const p = pesos(m, "arquetipo");
  assert.equal(p.tutorial?.n, 4);
  assert.equal(p.tutorial?.peso, 1);
});

check("pesos: sin mediciones → {}", () => {
  assert.deepEqual(pesos([], "hookCategoria"), {});
});

check("pesos: clave vacía no se agrupa", () => {
  const p = pesos([med({ hookCategoria: "" }), med({ hookCategoria: "  " })], "hookCategoria");
  assert.deepEqual(p, {});
});

// --- ganadores ---

check("ganadores: 10 piezas de guardados → las 2 mejores", () => {
  const m = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => med({ piezaId: `g${v}`, valor: v }));
  assert.deepEqual(ganadores(m).sort(), ["g10", "g9"]);
});

check("ganadores: 4 piezas → ninguna (muy pocas)", () => {
  assert.deepEqual(ganadores([1, 2, 3, 4].map((v) => med({ valor: v }))), []);
});

check("ganadores: 5 piezas → la mejor (mínimo 1)", () => {
  assert.deepEqual(ganadores([1, 2, 3, 4, 5].map((v) => med({ piezaId: `c${v}`, valor: v }))), ["c5"]);
});

check("ganadores: empates en el corte → todos los empatados", () => {
  const vals = [10, 9, 9, 9, 1, 1, 1, 1, 1, 1];
  const m = vals.map((v, i) => med({ piezaId: `e${i}`, valor: v }));
  assert.deepEqual(ganadores(m).sort(), ["e0", "e1", "e2", "e3"]);
});

check("ganadores: todas con el mismo valor (o 0) → ninguna", () => {
  assert.deepEqual(ganadores([1, 2, 3, 4, 5, 6].map(() => med({ valor: 0 }))), []);
  assert.deepEqual(ganadores([1, 2, 3, 4, 5, 6].map(() => med({ valor: 3 }))), []);
});

check("ganadores: cada señal compite en su grupo", () => {
  const m = [
    ...[1, 2, 3, 4, 5].map((v) => med({ piezaId: `g${v}`, valor: v * 100 })),
    ...[1, 2, 3, 4, 5].map((v) => med({ piezaId: `r${v}`, senal: "retencion", modo: "tasa", valor: v / 10 })),
  ];
  assert.deepEqual(ganadores(m).sort(), ["g5", "r5"]);
});

// --- derivados ---

check("derivadosPendientes: un ganador de la semana W queda pendiente hasta W + 14 d", () => {
  const m = [1, 2, 3, 4, 5].map((v) => med({ piezaId: `d${v}`, valor: v, tema: "[[Tema X]]", semana: "2026-10-12" }));
  assert.deepEqual(derivadosPendientes(m, [], "2026-10-19"), [{ de: "d5", tema: "[[Tema X]]", hasta: "2026-10-26" }]);
  assert.deepEqual(derivadosPendientes(m, [], "2026-10-26").length, 1, "la semana W + 14 todavía cabe");
});

check("derivadosPendientes: con 1 derivado sigue pendiente; con 2 ya no", () => {
  const m = [1, 2, 3, 4, 5].map((v) => med({ piezaId: `d${v}`, valor: v, semana: "2026-10-12" }));
  assert.equal(derivadosPendientes(m, [{ derivadoDe: "d5", semana: "2026-10-19" }], "2026-10-26").length, 1);
  const dos = [{ derivadoDe: "d5", semana: "2026-10-19" }, { derivadoDe: "d5", semana: "2026-10-26" }];
  assert.deepEqual(derivadosPendientes(m, dos, "2026-10-26"), []);
});

check("derivadosPendientes: vencido → ninguno", () => {
  const m = [1, 2, 3, 4, 5].map((v) => med({ piezaId: `d${v}`, valor: v, semana: "2026-10-12" }));
  assert.deepEqual(derivadosPendientes(m, [], "2026-11-02"), []);
});

// --- horas ---

check("horasDesdeOnline: undefined o vacío → undefined (el agente usa la tabla)", () => {
  assert.equal(horasDesdeOnline(undefined, ["08:00", "23:00"], 20, [1, 2], "2026-10-12"), undefined);
  assert.equal(horasDesdeOnline({}, ["08:00", "23:00"], 20, [1, 2], "2026-10-12"), undefined);
  assert.equal(horasDesdeOnline({ "3": 0, "4": 0 }, ["08:00", "23:00"], 20, [1], "2026-10-12"), undefined);
});

check("horasDesdeOnline: horas UTC → hora de Chile con más seguidores dentro de la ventana", () => {
  // Octubre: Chile en UTC-3. 23 UTC = 20:00 Chile; 4 UTC = 01:00 Chile (fuera de la ventana).
  const h = horasDesdeOnline({ "4": 999, "23": 80, "15": 50 }, ["08:00", "23:00"], 20, [1, 2, 3, 4, 5, 6], "2026-10-12");
  assert.deepEqual(h, { "1": "20:00", "2": "20:00", "3": "20:00", "4": "20:00", "5": "20:00", "6": "20:00" });
});

check("horasDesdeOnline: horas faltantes o basura se ignoran", () => {
  const h = horasDesdeOnline({ "17": 30, "x": 500, "25": 900, "18": NaN as unknown as number }, ["08:00", "23:00"], 20, [1], "2026-10-12");
  assert.deepEqual(h, { "1": "14:00" });
});

check("horasDesdeOnline: el cambio de hora de Chile mueve la hora local del día", () => {
  // 2027-04-04 (domingo 00:00) Chile vuelve a UTC-4: 17 UTC pasa de 14:00 a 13:00.
  const h = horasDesdeOnline({ "17": 30 }, ["08:00", "23:00"], 20, [5, 6, 1], "2027-04-05");
  assert.equal(h?.["1"], "13:00");
});

check("aplicarSeparacion: dos días seguidos a < 20 h → el segundo pasa a la siguiente mejor hora válida", () => {
  const r = aplicarSeparacion(
    [
      { dia: 1, ranking: [{ hora: "23:00", n: 100 }] },
      { dia: 2, ranking: [{ hora: "08:00", n: 100 }, { hora: "14:00", n: 90 }, { hora: "20:00", n: 50 }, { hora: "19:00", n: 40 }] },
    ],
    20,
  );
  assert.deepEqual(r, { "1": "23:00", "2": "20:00" });
});

check("aplicarSeparacion: sin hora válida ese día queda fuera (usa la tabla)", () => {
  const r = aplicarSeparacion([{ dia: 1, ranking: [{ hora: "23:00", n: 1 }] }, { dia: 2, ranking: [{ hora: "08:00", n: 1 }] }], 20);
  assert.deepEqual(r, { "1": "23:00" });
});

check("aplicarSeparacion: días no consecutivos no se restringen", () => {
  const r = aplicarSeparacion([{ dia: 1, ranking: [{ hora: "23:00", n: 1 }] }, { dia: 3, ranking: [{ hora: "08:00", n: 1 }] }], 20);
  assert.deepEqual(r, { "1": "23:00", "3": "08:00" });
});

// --- seguidores por pieza ---

check("seguidoresPorPieza: delta del día siguiente; sin dato no aparece", () => {
  const r = seguidoresPorPieza({ "2026-10-13": 5, "2026-10-14": 0 }, [
    { piezaId: "a", dia: "2026-10-12" }, { piezaId: "b", dia: "2026-10-13" }, { piezaId: "c", dia: "2026-10-20" },
  ]);
  assert.deepEqual(r, { a: 5, b: 0 });
});

check("seguidoresPorPieza: valores no numéricos se ignoran", () => {
  assert.deepEqual(seguidoresPorPieza({ "2026-10-13": "x" as unknown as number }, [{ piezaId: "a", dia: "2026-10-12" }]), {});
});

// --- diagnóstico ---

const CUATRO = ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
const mes = (extra: (s: string) => Partial<Medicion> = () => ({})): Medicion[] =>
  CUATRO.flatMap((s) => [1, 2].map(() => med({ semana: s, reach: 100, saved: 5, shares: 2, ...extra(s) })));

check("diagnostico: con < 4 semanas de datos → []", () => {
  const m = CUATRO.slice(1).flatMap((s) => [med({ semana: s, retencion: 0.1 })]);
  assert.deepEqual(diagnostico(m, { seguidoresNuevos28d: 0, alcance28d: 1000 }), []);
});

check("diagnostico: seguidores nuevos / alcance < 1 % → problema de perfil", () => {
  const d = diagnostico(mes((s) => ({ saved: s >= "2026-10-05" ? 10 : 5 })), { seguidoresNuevos28d: 2, alcance28d: 1000 });
  assert.ok(d.some((x) => /perfil/.test(x)), d.join(" | "));
});

check("diagnostico: retención media de reels < 0,3 → cambiar la categoría de hook del arquetipo", () => {
  const d = diagnostico(mes(() => ({ arquetipo: "demo", hookCategoria: "lista", retencion: 0.2 })), { seguidoresNuevos28d: 50, alcance28d: 1000 });
  assert.ok(d.some((x) => /cambiar la categoría de hook/.test(x) && /demo/.test(x)), d.join(" | "));
});

check("diagnostico: retención bien y guardados/envíos planos → falta entregable o destinatario", () => {
  const d = diagnostico(mes(() => ({ retencion: 0.5 })), { seguidoresNuevos28d: 50, alcance28d: 1000 });
  assert.ok(d.some((x) => /falta entregable o destinatario/.test(x)), d.join(" | "));
  assert.ok(!d.some((x) => /cambiar la categoría de hook/.test(x)));
});

check("diagnostico: todo bien y crecimiento plano → volumen o distribución", () => {
  const sube = mes((s) => ({ retencion: 0.5, saved: s >= "2026-10-05" ? 20 : 5, shares: s >= "2026-10-05" ? 8 : 2 }));
  const d = diagnostico(sube, { seguidoresNuevos28d: 50, alcance28d: 1000, seguidoresNuevosPrevios28d: 60 });
  assert.deepEqual(d.length, 1, d.join(" | "));
  assert.match(d[0]!, /volumen o distribución/);
  assert.deepEqual(diagnostico(sube, { seguidoresNuevos28d: 80, alcance28d: 1000, seguidoresNuevosPrevios28d: 60 }), []);
});

check("diagnostico: alcance 0 o ausente no divide por cero", () => {
  const d = diagnostico(mes(() => ({ retencion: 0.5 })), { seguidoresNuevos28d: 3, alcance28d: 0 });
  assert.ok(!d.some((x) => /perfil/.test(x)));
  assert.ok(d.every((x) => !/NaN|Infinity/.test(x)));
});

// --- compararParametro ---

const conParam = (valor: unknown, n: number, semanas: string[], v: number): Medicion[] =>
  Array.from({ length: n }, (_, i) => med({ semana: semanas[i % semanas.length]!, valor: v, parametros: { logoEnCuadro0: valor } }));

check("compararParametro: 5 piezas por valor → undefined", () => {
  const m = [...conParam(true, 5, CUATRO, 4), ...conParam(false, 5, CUATRO, 2)];
  assert.equal(compararParametro(m, "logoEnCuadro0"), undefined);
});

check("compararParametro: < 4 semanas → undefined", () => {
  const m = [...conParam(true, 6, CUATRO.slice(1), 4), ...conParam(false, 6, CUATRO.slice(1), 2)];
  assert.equal(compararParametro(m, "logoEnCuadro0"), undefined);
});

check("compararParametro: ≥ 4 semanas y ≥ 6 por valor → media relativa por valor", () => {
  const m = [...conParam(true, 6, CUATRO, 4), ...conParam(false, 6, CUATRO, 2), ...conParam("raro", 2, CUATRO, 9)];
  const r = compararParametro(m, "logoEnCuadro0")!;
  assert.deepEqual(r.map((x) => [x.valor, x.n]), [["true", 6], ["false", 6]]);
  assert.ok(r[0]!.media > r[1]!.media);
});

check("compararParametro: piezas sin parametros no cuentan", () => {
  const m = [...conParam(true, 6, CUATRO, 4), ...CUATRO.flatMap((s) => [1, 2].map(() => med({ semana: s })))];
  assert.equal(compararParametro(m, "logoEnCuadro0"), undefined, "un solo valor no se compara");
});

// --- medicionesDe (instantáneas + registro) ---

const PUB = "2026-10-12T17:00:00.000Z";
function inst(mediaId: string, extra: Partial<Instantanea> = {}, tomadaEn = "2026-10-19T17:05:00.000Z"): Instantanea {
  const m = { reach: 30, saved: 3, shares: 1, likes: 5, comments: 0, views: 100, avg_watch_ms: 6000, descartadas: [] as string[], ...extra };
  return { ...m, mediaId, ventana: "7d", tomadaEn, origen: "motor", piezaId: `pz-${mediaId}`, derivadas: derivar(m, 20000), ...extra } as Instantanea;
}
const regl = (mediaId: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tipo: "publicado", piezaId: `pz-${mediaId}`, mediaId, semana: "2026-10-12", publicadoEn: PUB, duracionMs: 20000, nombreMotor: `n-${mediaId}`,
  predictedScore: 80, senal: "guardados", tema: "[[IA]]", arquetipo: "tutorial", hookCategoria: "curiosidad", formato: "reel", ...extra,
});

check("medicionesDe: solo 7d comparable de piezas del motor; ignora manuales, aviso- y valores raros", () => {
  const ii = [
    inst("1"),
    { ...inst("2"), origen: "manual" } as Instantanea,
    inst("aviso-x"),
    inst("3", {}, "2026-10-20T03:00:00.000Z"), // 10 h tarde: no comparable
    { ...inst("4"), ventana: "24h" } as Instantanea,
    inst("5", { saved: undefined }),
    inst("6", { saved: NaN }),
  ];
  const reg = ["1", "2", "aviso-x", "3", "4", "5", "6"].map((id) => regl(id));
  const m = medicionesDe(ii, reg, [], 50);
  assert.deepEqual(m.map((x) => x.mediaId), ["1"]);
  assert.equal(m[0]!.valor, 3);
  assert.equal(m[0]!.modo, "absoluto");
  assert.equal(m[0]!.tema, "[[IA]]");
  assert.equal(m[0]!.retencion, 0.3);
});

check("medicionesDe: con alcance ≥ umbral usa la tasa y toma parametros del plan", () => {
  const plan: Plan = { semana: "2026-10-12", zona: "America/Santiago", experimento: null, piezas: [{ id: "pz-1", parametros: { logoEnCuadro0: false } } as unknown as Plan["piezas"][number]] };
  const m = medicionesDe([inst("1", { reach: 100, saved: 5 })], [regl("1")], [{ semana: "2026-10-12", plan, render: {}, estado: {} }], 50);
  assert.equal(m[0]!.modo, "tasa");
  assert.equal(m[0]!.valor, 0.05);
  assert.deepEqual(m[0]!.parametros, { logoEnCuadro0: false });
});

check("medicionesDe: registro sin señal válida o sin publicadoEn → fuera", () => {
  const m = medicionesDe([inst("1"), inst("2")], [regl("1", { senal: "likes" }), regl("2", { publicadoEn: undefined })], [], 50);
  assert.deepEqual(m, []);
});

// --- construirBucle ---

const AHORA = new Date("2026-10-18T09:00:00.000Z"); // domingo 06:00 Chile (UTC-3)

check("construirBucle: sin datos → estructura vacía serializable sin NaN ni null", () => {
  const b = construirBucle({ ahora: AHORA, instantaneas: [], registro: [], semanas: [], cuenta: undefined, config: undefined });
  assert.equal(b.semana, "2026-10-19");
  assert.equal(b.medidas, 0);
  assert.deepEqual(b.ganadores, []);
  assert.deepEqual(b.derivados, []);
  assert.deepEqual(b.diagnostico, []);
  assert.equal(b.horas, undefined);
  sinNumerosRaros(JSON.parse(JSON.stringify(b)));
});

check("construirBucle: una sola pieza no tiene peso ni ganador", () => {
  const b = construirBucle({ ahora: AHORA, instantaneas: [inst("1")], registro: [regl("1")], semanas: [], cuenta: {}, config: {} });
  assert.equal(b.medidas, 1);
  assert.deepEqual(b.pesos.tema, { IA: { n: 1 } });
  assert.deepEqual(b.ganadores, []);
});

check("construirBucle: horas solo con ≥ 100 seguidores; seguidores por pieza desde porDia", () => {
  const cuenta = { seguidores: 150, onlineFollowers: { "23": 50 }, porDia: { "2026-10-13": 4 } };
  const b = construirBucle({ ahora: AHORA, instantaneas: [inst("1")], registro: [regl("1")], semanas: [], cuenta, config: {} });
  assert.equal(b.horas?.["1"], "20:00");
  assert.deepEqual(b.seguidoresPorPieza, { "pz-1": 4 });
  const chica = construirBucle({ ahora: AHORA, instantaneas: [], registro: [], semanas: [], cuenta: { ...cuenta, seguidores: 4 }, config: {} });
  assert.equal(chica.horas, undefined);
});

check("construirBucle: ganadores con derivados pendientes; NaN en el registro no se cuela", () => {
  const ids = ["1", "2", "3", "4", "5", "6"];
  const ii = ids.map((id) => inst(id, { saved: Number(id) }));
  const reg = ids.map((id) => regl(id, { tema: id === "6" ? "[[Agentes]]" : "[[IA]]", duracionMs: id === "2" ? NaN : 20000 }));
  const b = construirBucle({ ahora: AHORA, instantaneas: ii, registro: reg, semanas: [], cuenta: {}, config: {} });
  assert.deepEqual(b.ganadores.map((g) => g.piezaId), ["pz-6"]);
  assert.deepEqual(b.derivados, [{ de: "pz-6", tema: "[[Agentes]]", hasta: "2026-10-26" }]);
  assert.equal(b.pesos.tema.IA?.n, 5);
  sinNumerosRaros(JSON.parse(JSON.stringify(b)));
});

check("construirBucle: experimento declarado con variable válida (R15) y su evaluación a 4 semanas", () => {
  const plan: Plan = {
    semana: "2026-09-21", zona: "America/Santiago", experimento: { variable: "logoEnCuadro0", hipotesis: "h", piezas: ["pz-1"] },
    piezas: [],
  };
  const raro: Plan = { ...plan, semana: "2026-10-12", experimento: { variable: "colorFondo", hipotesis: "h", piezas: [] } };
  const semanas: SemanaLeida[] = [{ semana: plan.semana, plan, render: {}, estado: {} }, { semana: raro.semana, plan: raro, render: {}, estado: {} }];
  const config = { puerta: { logoEnCuadro0: { valor: true, respaldo: "base" } } };
  const b = construirBucle({ ahora: AHORA, instantaneas: [], registro: [], semanas, cuenta: {}, config });
  assert.equal(b.experimentos.length, 2);
  assert.equal(b.experimentos[0]!.variableValida, true);
  assert.equal(b.experimentos[0]!.evaluarDesde, "2026-10-19");
  assert.equal(b.experimentos[0]!.evaluable, true);
  assert.equal(b.experimentos[1]!.variableValida, false);
  assert.equal(b.experimentos[1]!.evaluable, false);
});

// --- debeEscribirBucle ---

check("debeEscribirBucle: domingo 05:30–06:00 sí; antes de 05:30 no", () => {
  assert.equal(debeEscribirBucle(new Date("2026-10-18T08:45:00Z")), true); // 05:45 Chile
  assert.equal(debeEscribirBucle(new Date("2026-10-18T08:15:00Z"), "2026-10-11"), false); // 05:15: el vigente es el 11, ya escrito
});

check("debeEscribirBucle: una vez por semana", () => {
  assert.equal(debeEscribirBucle(new Date("2026-10-18T08:45:00Z"), "2026-10-18"), false);
  assert.equal(debeEscribirBucle(new Date("2026-10-18T08:45:00Z"), "2026-10-11"), true);
});

check("debeEscribirBucle: recuperable hasta el lunes; el martes ya no", () => {
  assert.equal(debeEscribirBucle(new Date("2026-10-19T20:00:00Z"), "2026-10-11"), true); // lunes 17:00
  assert.equal(debeEscribirBucle(new Date("2026-10-20T15:00:00Z"), "2026-10-11"), false); // martes
  assert.equal(debeEscribirBucle(new Date("2026-10-20T15:00:00Z")), false);
});

check("debeEscribirBucle: marca basura se trata como sin marca", () => {
  assert.equal(debeEscribirBucle(new Date("2026-10-18T08:45:00Z"), "basura"), true);
});

// --- resumen con diagnóstico ---

check("formatResumen: incluye el diagnóstico mensual si lo hay", () => {
  const r = resumirSemana([], {}, [], "2026-10-18", 50);
  r.diagnostico = ["Seguidores nuevos / alcance < 1 %: problema de perfil."];
  assert.match(formatResumen(r), /Diagnóstico[\s\S]*problema de perfil/);
  r.diagnostico = [];
  assert.ok(!/Diagnóstico/.test(formatResumen(r)));
});

// --- escribirBucle (disco) ---

// Corre en un proceso aparte con su propio KB_DIR: los otros tests async cambian
// `process.env.KB_DIR` en paralelo y no deben pisarse con este.
await checkAsync("escribirBucle: lee la base, escribe _metricas/bucle.json y devuelve la ruta", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bucle-"));
  try {
    mkdirSync(join(dir, "_calendario", "2026-10-12"), { recursive: true });
    writeFileSync(join(dir, "_calendario", "config.json"), JSON.stringify({ umbralAlcanceTasas: 50 }));
    writeFileSync(join(dir, "_calendario", "registro.jsonl"), [JSON.stringify(regl("1")), "{roto", JSON.stringify({ tipo: "aviso", mediaId: "aviso-1" })].join("\n") + "\n");
    writeFileSync(join(dir, "_calendario", "2026-10-12", "plan.json"), "{no es json");
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    const script = `
      const { openDb, closeDb } = await import(${JSON.stringify(join(raiz, "src/kb/db.ts"))});
      const { escribirBucle } = await import(${JSON.stringify(join(raiz, "src/calendario/bucle.ts"))});
      openDb().prepare("INSERT INTO insights (media_id, ventana, tomada_en, reach, saved, shares, likes, comments, views, avg_watch_ms, total_watch_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run("1", "7d", ${JSON.stringify(inst("1").tomadaEn)}, 30, 3, 1, 5, 0, 100, 6000, null);
      const rutas = await escribirBucle(new Date(${JSON.stringify(AHORA.toISOString())}));
      closeDb();
      process.stdout.write("RUTAS=" + JSON.stringify(rutas));
    `;
    const { stdout } = await execFileP(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: raiz, env: { ...process.env, KB_DIR: dir },
    });
    const rutas = JSON.parse(stdout.slice(stdout.indexOf("RUTAS=") + 6)) as string[];
    assert.deepEqual(rutas, [join(dir, "_metricas", "bucle.json")]);
    assert.ok(existsSync(rutas[0]!));
    const texto = readFileSync(rutas[0]!, "utf8");
    assert.ok(!/NaN|Infinity/.test(texto));
    const b = JSON.parse(texto);
    assert.equal(b.medidas, 1);
    assert.equal(b.semana, "2026-10-19");
    assert.ok(b.avisos.some((a: string) => /2026-10-12/.test(a)), "un plan.json roto se avisa y no rompe el bucle");
    sinNumerosRaros(b);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await checkAsync("escribirBucle: con deps inyectadas escribe en la ruta pedida", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bucle-deps-"));
  try {
    const ruta = join(dir, "sub", "bucle.json");
    const rutas = await escribirBucle(AHORA, {
      ruta,
      leer: async () => ({ instantaneas: [inst("1")], registro: [regl("1")], semanas: [], cuenta: {}, config: {}, avisos: [] }),
    });
    assert.deepEqual(rutas, [ruta]);
    assert.equal(JSON.parse(readFileSync(ruta, "utf8")).medidas, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
