import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { derivar } from "../../src/insights/derive.ts";
import type { Instantanea } from "../../src/insights/snapshots.ts";
import type { Pieza, Plan, SemanaLeida } from "../../src/calendario/plan.ts";
import {
  construirBucle, derivadosPendientes, ganadores, type Medicion,
} from "../../src/calendario/bucle.ts";

let seq = 0;
function med(extra: Partial<Medicion> = {}): Medicion {
  seq++;
  return {
    piezaId: `p${seq}`, mediaId: `m${seq}`, tema: "IA", arquetipo: "tutorial", hookCategoria: "curiosidad",
    senal: "guardados", valor: 1, modo: "absoluto", semana: "2026-10-12", ...extra,
  };
}

function inst(mediaId: string, pub: string, extra: Partial<Instantanea> = {}): Instantanea {
  const tomadaEn = new Date(new Date(pub).getTime() + 168 * 3_600_000 + 60_000).toISOString();
  const m = { reach: 30, saved: 3, shares: 1, likes: 5, comments: 0, views: 100, avg_watch_ms: 6000, descartadas: [] as string[], ...extra };
  return { ...m, mediaId, ventana: "7d", tomadaEn, origen: "motor", derivadas: derivar(m, 20000) } as Instantanea;
}
const regl = (mediaId: string, piezaId: string, semana: string, publicadoEn: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tipo: "publicado", piezaId, mediaId, semana, publicadoEn, duracionMs: 20000, nombreMotor: `n-${mediaId}`,
  predictedScore: 80, senal: "guardados", tema: "IA", arquetipo: "tutorial", hookCategoria: "curiosidad", formato: "reel", ...extra,
});
function pieza(id: string, extra: Partial<Pieza> = {}): Pieza {
  return {
    id, dia: "2026-10-19", hora: "14:00", formato: "reel", arquetipo: "tutorial", senal: "guardados", tema: "IA", pilar: "x",
    hook: { categoria: "curiosidad", texto: "t", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "pasa", notas: "" }, origen: { fichas: [], referencias: [] }, derivadoDe: null,
    caption: "c", borrador: "b", estado: "planificado", ...extra,
  } as Pieza;
}

// R37: "la ventana de derivados cuenta desde la semana de planificación en que el ganador
// se identifica (primer bucle.json que lo lista), no desde su publicación".
check("adversario T12: R37 — ganador de la semana W sigue pendiente en W + 21 (identificado al planificar W + 14)", () => {
  // Una pieza de la semana W (lunes 2026-10-12) tiene su 7d el lunes 19 o después: el primer
  // bucle que la puede listar es el del domingo 25, que planifica la semana del 26 (W + 14).
  // "En las 2 semanas siguientes" a esa identificación → todavía vale para W + 21.
  const m = [1, 2, 3, 4, 5].map((v) => med({ piezaId: `d${v}`, valor: v, semana: "2026-10-12" }));
  const r = derivadosPendientes(m, [], "2026-11-02");
  assert.equal(r.length, 1, `pendientes en W + 21: ${JSON.stringify(r)}`);
  assert.ok(r[0]!.hasta >= "2026-11-02", `hasta = ${r[0]!.hasta}`);
});

check("adversario T12: R37 — un ganador identificado tarde (el grupo llega a 5 piezas semanas después) no nace vencido", () => {
  // Antes de R53 4 piezas eran "muy pocas" y la 5.ª identificaba tarde a la mejor de W. Con R53
  // ("ganadores desde la primera semana medida") w10 ya gana con 4; sigue valiendo que un ganador
  // sin historial en bucle.json no nace vencido: su ventana empieza en la semana que se planifica (R37).
  assert.deepEqual(ganadores([1, 2, 3, 10].map((v) => med({ piezaId: `w${v}`, valor: v, semana: "2026-10-12" }))), ["w10"]);
  const m = [
    ...[1, 2, 3, 10].map((v) => med({ piezaId: `w${v}`, valor: v, semana: "2026-10-12" })),
    med({ piezaId: "tarde", valor: 2, semana: "2026-11-09" }),
  ];
  assert.deepEqual(ganadores(m), ["w10"]);
  const r = derivadosPendientes(m, [], "2026-11-23");
  assert.equal(r.length, 1, `recién identificado y ya sin derivados pendientes: ${JSON.stringify(r)}`);
});

// Spec: "Toda pieza en el 20 % superior de su señal objetivo (ventana 7 d) genera 1-2 derivados
// en las 2 semanas siguientes". El brief prohíbe mezclar absolutos y tasas en un *peso*; el
// ganador se calcula dentro de su propia señal y escala, no mezcla nada.
check("adversario T12: la cuenta cruza 50 de alcance a mitad del mes y el ganador de la semana anterior pierde su derivado", () => {
  const antes = [1, 2, 3, 4, 5].map((v) => med({ piezaId: `a${v}`, valor: v, semana: "2026-10-12", modo: "absoluto" }));
  assert.deepEqual(derivadosPendientes(antes, [], "2026-10-26").map((d) => d.de), ["a5"], "antes del cruce a5 es ganador con derivado");
  // La semana siguiente una sola pieza ya se mide en tasas (alcance ≥ 50).
  const despues = [...antes, med({ piezaId: "t1", valor: 0.05, semana: "2026-10-19", modo: "tasa" })];
  assert.deepEqual(derivadosPendientes(despues, [], "2026-10-26").map((d) => d.de), ["a5"], "el derivado pendiente de a5 desapareció");
});

// R21: "T11/T12 deben ignorar mediaId que empiece con aviso-". Un derivado "publicado" en modo
// aviso nunca salió a Instagram: no puede agotar los 2 derivados del ganador.
check("adversario T12: R21 — derivados publicados en modo aviso (mediaId aviso-) agotan los derivados del ganador", () => {
  const PUB = "2026-10-12T17:00:00.000Z";
  const ids = ["1", "2", "3", "4", "5"];
  const ii = ids.map((id) => inst(id, PUB, { saved: Number(id) }));
  const reg = ids.map((id) => regl(id, `pz${id}`, "2026-10-12", PUB));
  const w: Plan = {
    semana: "2026-10-19", zona: "America/Santiago", experimento: null,
    piezas: [pieza("der1", { derivadoDe: "pz5" }), pieza("der2", { dia: "2026-10-20", derivadoDe: "pz5" })],
  };
  const semanas: SemanaLeida[] = [{
    semana: w.semana, plan: w, render: {},
    estado: {
      der1: { estado: "publicado", mediaId: "aviso-der1" } as SemanaLeida["estado"][string],
      der2: { estado: "publicado", mediaId: "aviso-der2" } as SemanaLeida["estado"][string],
    },
  }];
  const b = construirBucle({ ahora: new Date("2026-10-25T09:00:00.000Z"), instantaneas: ii, registro: reg, semanas, cuenta: {}, config: {} });
  assert.deepEqual(b.ganadores.map((g) => g.piezaId), ["pz5"]);
  assert.equal(b.derivados.length, 1, `derivados: ${JSON.stringify(b.derivados)}`);
});

// R20: "un id puede repetirse en otra semana (derivados con el mismo slug)". El registro trae
// piezaId y semana por separado; bucle.ts indexa todo por piezaId solo.
check("adversario T12: R20 — mismo id en dos semanas: el ganador listado trae valor/semana de la otra pieza", () => {
  const W = "2026-10-12", W2 = "2026-10-19";
  const p1 = "2026-10-12T17:00:00.000Z", p2 = "2026-10-19T17:00:00.000Z";
  const ii = [
    ...["a", "b", "c", "d"].map((id, i) => inst(`m-${id}`, p1, { saved: i + 1 })),
    inst("m-lun-W", p1, { saved: 9 }),
    inst("m-lun-W2", p2, { saved: 0 }),
  ];
  const reg = [
    ...["a", "b", "c", "d"].map((id) => regl(`m-${id}`, id, W, p1)),
    regl("m-lun-W", "lunes-tutorial", W, p1, { tema: "Tema ganador" }),
    regl("m-lun-W2", "lunes-tutorial", W2, p2, { tema: "Otro tema" }),
  ];
  const b = construirBucle({ ahora: new Date("2026-11-01T09:00:00.000Z"), instantaneas: ii, registro: reg, semanas: [], cuenta: {}, config: {} });
  const g = b.ganadores.find((x) => x.piezaId === "lunes-tutorial");
  assert.ok(g, `ganadores: ${JSON.stringify(b.ganadores)}`);
  assert.equal(g.valor, 9, `ganador: ${JSON.stringify(g)}`);
  assert.equal(g.semana, W);
  assert.equal(g.tema, "Tema ganador");
});

check("adversario T12: R20 — mismo id en dos semanas: el experimento de W se evalúa con la pieza de W2", () => {
  // Spec: experimento "anotado antes de publicar y evaluado a las 4 semanas" sobre SUS piezas.
  // La pieza "lunes" de W está en el experimento; la "lunes" de W2 es otra pieza (R20).
  const semanas: SemanaLeida[] = ["2026-10-12", "2026-10-19"].map((s) => {
    const plan: Plan = { semana: s, zona: "America/Santiago", experimento: null, piezas: [pieza("lunes")] };
    return { semana: s, plan, render: {}, estado: {} };
  });
  const PUB = "2026-10-12T17:00:00.000Z";
  // Experimento de la semana W sobre la pieza "lunes" de W: debe usar la medición de W, no la de W2.
  const conExp = semanas.map((s, i) => (i === 0 ? { ...s, plan: { ...s.plan, experimento: { variable: "hora", hipotesis: "h", piezas: ["lunes"] } } } : s));
  const p2 = "2026-10-19T17:00:00.000Z";
  const ii = [inst("m1", PUB, { saved: 10 }), inst("m2", p2, { saved: 0 }), inst("m3", PUB, { saved: 5 })];
  const reg = [regl("m1", "lunes", "2026-10-12", PUB), regl("m2", "lunes", "2026-10-19", p2), regl("m3", "otra", "2026-10-12", PUB)];
  const b2 = construirBucle({ ahora: new Date("2026-11-15T09:00:00.000Z"), instantaneas: ii, registro: reg, semanas: conExp, cuenta: {}, config: {} });
  const e = b2.experimentos.find((x) => x.semana === "2026-10-12")!;
  // media de guardados absolutos: (10 + 0 + 5) / 3 = 5 → la pieza de W vale 10/5 = 2.
  assert.equal(e.experimento.media, 2, `experimento de W evaluado con otra pieza: ${JSON.stringify(e.experimento)}`);
});
