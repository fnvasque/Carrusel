import assert from "node:assert/strict";
import { check } from "../_check.ts";
import type { Plan } from "../../src/calendario/plan.ts";
import { caidasDePlan, causaDeDuda, causasDeFallo, hallazgosDeNotas, resumirLectorFrio } from "../../src/calendario/lector-causas.ts";

const pieza = (id: string, intentos: number, notas: string): Plan["piezas"][number] =>
  ({ id, lectorFrio: { intentos, resultado: "ok", notas } }) as unknown as Plan["piezas"][number];
const plan = (semana: string, piezas: Plan["piezas"], extra: Partial<Plan> = {}): Plan => ({ semana, zona: "America/Santiago", experimento: null, piezas, ...extra });

check("lector-causas: un fallo se clasifica por palabras clave (varias causas a la vez)", () => {
  assert.deepEqual(causasDeFallo("los dos lectores vieron 6 preguntas prometidas y solo 3 pasos numerados"), ["promesa-incumplida"]);
  assert.deepEqual(causasDeFallo("el completo no entendió «Kokoro»"), ["termino-sin-explicar"]);
  assert.ok(causasDeFallo("el con prisa respondió «no sé» a la 7").includes("portada-sin-resultado"));
  assert.ok(causasDeFallo("«19 puntos menos» quedó vago").includes("dato-sin-contexto"));
  assert.deepEqual(causasDeFallo("el con prisa no haría nada"), ["sin-accion"], "«nada» es la marca de P5");
  assert.deepEqual(causasDeFallo("el lector se aburrió"), ["otro"]);
});

check("lector-causas: una duda NB solo compite con las causas de su pregunta; sin calce, la última de ella", () => {
  assert.equal(causaDeDuda(3, "'776 profesionales' aparece sin decir quién lo midió"), "dato-sin-contexto");
  assert.equal(causaDeDuda(3, "'Canal' no sé bien qué es"), "termino-sin-explicar");
  assert.equal(causaDeDuda(5, "Nada, con prisa pasaría de largo"), "sin-accion");
  assert.equal(causaDeDuda(5, "Guardar, para probarlo después"), "accion-distinta");
  assert.equal(causaDeDuda(6, "Promete 'gratis' pero nunca dice dónde"), "promesa-incumplida");
  assert.equal(causaDeDuda(6, "el ejemplo del precio suena a todo el rato"), "confuso");
  assert.equal(causaDeDuda(9, "x"), "otro");
});

check("lector-causas: notas → el último intento no es fallo, la corrección tras «; se» no cuenta y los NB son dudas", () => {
  const notas = [
    "v1: el completo no entendió «Kokoro»; se explicó en el paso 1.",
    "v2: el con prisa respondió «no sé» a la 7; el Hook pasó a «Narra sin tu voz».",
    "v3: recortes de duración.",
    "NB: «Guardar, para probarlo después» → completo P5: acción distinta a la señal",
  ].join("\n");
  const hs = hallazgosDeNotas(notas, 3);
  assert.deepEqual(hs.filter((h) => h.tipo === "fallo").map((h) => h.causa), ["termino-sin-explicar", "portada-sin-resultado"]);
  assert.deepEqual(hs.filter((h) => h.tipo === "duda").map((h) => [h.causa, h.lector]), [["accion-distinta", "completo"]]);
  assert.ok(!hs.some((h) => /explicó/.test(h.texto)), "la corrección no entra en el texto");
  // Con 2 intentos, el v2 es el que pasó: no cuenta.
  assert.equal(hallazgosDeNotas(notas, 2).filter((h) => h.tipo === "fallo").length, 1);
  // Rango v1-v3 con 4 intentos cuenta; el v4 no.
  assert.equal(hallazgosDeNotas("v1-v3: Muse sin explicar; se quitó.\nv4: tras la duda se cambió la slide 6.", 4).filter((h) => h.tipo === "fallo").length, 1);
});

check("lector-causas: intentos del validador o frases sin marca de fallo no cuentan; notas raras no rompen", () => {
  assert.deepEqual(hallazgosDeNotas("v1: el validador rechazó el Hook (13 palabras para 5 s); se acortó.\nv2: ok", 2), []);
  assert.deepEqual(hallazgosDeNotas("v1: se nombró ganador (Kling) y el Stat quedó «por clip»", 3), []);
  assert.deepEqual(hallazgosDeNotas(undefined, 2), []);
  assert.deepEqual(hallazgosDeNotas(42, 2), []);
  assert.deepEqual(hallazgosDeNotas("los dos lectores entendieron el entregable a la primera", 1), []);
});

check("lector-causas: caídas desde plan.caidas y, para semanas viejas, desde motivo (sin repetir las que siguen en el plan)", () => {
  const p = plan("2026-10-05", [pieza("mie-reel-la-ia-hace-fila-por-ti", 4, "")], {
    motivo: "Corrida: mie-reel-fugas-de-dinero y jue-reel-video-ia-dirigido no pasaron el lector frío en 3 vueltas. mie-reel-la-ia-hace-fila-por-ti no pasó el lector frío con el criterio anterior. sab-reel-otra se publicó.",
    caidas: [{ id: "vie-carrusel-x", intentos: 3, notas: "v1: el completo no entendió «x»" }],
  });
  assert.deepEqual(caidasDePlan(p).map((c) => c.id), ["vie-carrusel-x", "mie-reel-fugas-de-dinero", "jue-reel-video-ia-dirigido"]);
  assert.deepEqual(caidasDePlan(plan("2026-10-12", [], { caidas: "raro" as never })), []);
});

check("lector-causas: resumen por causa con conteos, piezas, desenlace y la cita más reciente; solo las últimas 4 semanas", () => {
  const semanas = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
  const planes = semanas.map((s, i) =>
    plan(s, [
      pieza(`lun-reel-a${i}`, 2, `v1: los dos lectores vieron prometidas «${i} críticas» y solo una; se cambió el título.`),
      pieza(`mar-carrusel-b${i}`, 1, "NB: «'Canal' no sé qué es» → completo P3: explicado en la pieza (slide 1)"),
    ], i === 4 ? { caidas: [{ id: "sab-reel-c", intentos: 3, notas: "v1: «3 puntos» no se cumplía, solo había uno" }] } : {}),
  );
  const r = resumirLectorFrio(planes);
  assert.deepEqual(r.semanas, semanas.slice(1));
  assert.equal(r.piezas, 9);
  assert.equal(r.aLaPrimera, 4);
  assert.equal(r.reescritas, 4);
  assert.equal(r.caidas, 1);
  assert.deepEqual(r.caidasSinNotas, []);
  const promesa = r.causas[0]!;
  assert.equal(promesa.causa, "promesa-incumplida");
  assert.equal(promesa.pregunta, 6);
  assert.equal(promesa.fallos, 5);
  assert.equal(promesa.piezas.length, 5);
  assert.deepEqual(promesa.piezas.at(-1), { pieza: "2026-10-12/sab-reel-c", desenlace: "cayó" });
  assert.equal(promesa.piezas[0]!.desenlace, "pasó tras reescribir");
  assert.match(promesa.ejemplo, /3 puntos/);
  const termino = r.causas.find((c) => c.causa === "termino-sin-explicar")!;
  assert.equal(termino.fallos, 0);
  assert.equal(termino.dudas, 4);
  assert.equal(termino.piezas[0]!.desenlace, "pasó con duda");
  assert.deepEqual(resumirLectorFrio([]).causas, []);
  assert.deepEqual(resumirLectorFrio([undefined as never, null as never]).piezas, 0);
});

check("lector-causas: «nada nuevo» en la P8 es la causa nada-nuevo (también en un NB de la P8)", () => {
  assert.ok(causasDeFallo("v1: el lector completo respondió nada nuevo en P8").includes("nada-nuevo"));
  assert.ok(causasDeFallo("el con prisa dijo que ya sabía lo que enseña").includes("nada-nuevo"));
  assert.equal(causaDeDuda(8, "Ya lo conocía, es lo básico"), "nada-nuevo");
  const hs = hallazgosDeNotas("NB: «Aprendí que hay que revisar, pero no cómo» → con prisa P8: no bloquea", 1);
  assert.deepEqual(hs.map((h) => [h.tipo, h.causa, h.lector]), [["duda", "nada-nuevo", "con prisa"]]);
});

check("pr56-4: nada-nuevo no calza con «ya sabía qué/cuál/cómo/dónde» de otras preguntas", () => {
  assert.ok(!causasDeFallo("el lector completo dijo que ya sabía qué es ChatGPT pero no entendió “agente”").includes("nada-nuevo"));
  assert.ok(!causasDeFallo("el con prisa ya sabía cómo abrirlo, no dónde pegar el prompt").includes("nada-nuevo"));
  assert.ok(causasDeFallo("respondió ya lo sabía en P8").includes("nada-nuevo"));
  assert.ok(causasDeFallo("el completo respondió no aprendí nada en P8").includes("nada-nuevo"));
  assert.ok(causasDeFallo("el con prisa: nada que no supiera").includes("nada-nuevo"));
  assert.ok(causasDeFallo("el con prisa dijo «nada de nuevo»").includes("nada-nuevo"));
});

check("pr56-8: sin-accion no calza con «nada de nuevo» ni «nada, nuevo» de la P8", () => {
  assert.ok(!causasDeFallo("respondió “nada de nuevo” en P8").includes("sin-accion"));
  assert.ok(!causasDeFallo("respondió nada nuevo en P8").includes("sin-accion"));
  assert.deepEqual(causasDeFallo("el con prisa no haría nada"), ["sin-accion"]);
});
