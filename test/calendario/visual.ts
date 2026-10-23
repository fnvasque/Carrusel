import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import {
  anotarRespuestaVisual, cupo, leerRespuestasVisuales, leerVisual, respuestasVisualesPath, resumenVisual, sinClaves, visualPath,
  type RespuestaVisual, type VeredictoImagen, type VisualJson, type VisualPieza,
} from "../../src/calendario/visual.ts";

check("visual: sinClaves oculta fragmentos con forma de clave de API", () => {
  assert.equal(sinClaves("Incorrect API key provided: sk-proj-AbC_12-x9. Otra: sk-xyz"), "Incorrect API key provided: sk-…. Otra: sk-…");
  assert.equal(sinClaves("sin claves"), "sin claves");
  assert.equal(sinClaves("risk-free y desk-top"), "risk-free y desk-top");
});

check("visual: cupo respeta los topes por pieza, por semana y de dinero", () => {
  assert.deepEqual(cupo(undefined, 15), { imagenes: 12 });
  assert.deepEqual(cupo({ imagenes: 0, usd: 0 }, 15), { imagenes: 12 });
  assert.deepEqual(cupo({ imagenes: 115, usd: 1 }, 15), { imagenes: 5 });
  assert.deepEqual(cupo({ imagenes: 115, usd: 1 }, 3), { imagenes: 3 });
  const lleno = cupo({ imagenes: 120, usd: 1 }, 4);
  assert.equal(lleno.imagenes, 0);
  assert.ok(lleno.motivo);
  const caro = cupo({ imagenes: 0, usd: 5.01 }, 4);
  assert.equal(caro.imagenes, 0);
  assert.equal(caro.motivo, "tope semanal de US$5");
  assert.equal(cupo({ imagenes: 0, usd: 5 }, 4).imagenes, 0);
  assert.equal(cupo({ imagenes: 130, usd: 1 }, 4).imagenes, 0);
  assert.deepEqual(cupo({ imagenes: 1, usd: 1 }, 0), { imagenes: 0 });
  assert.deepEqual(cupo(undefined, -3), { imagenes: 0 });
  assert.deepEqual(cupo(undefined, NaN), { imagenes: 0 });
  for (const mala of [{ imagenes: NaN, usd: 0 }, { imagenes: 0, usd: NaN }, { imagenes: -1, usd: 0 }, { imagenes: Infinity, usd: 0 }]) {
    const c = cupo(mala, 4);
    assert.equal(c.imagenes, 0);
    assert.equal(c.motivo, "presupuesto ilegible");
  }
});

async function conKb(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "visual-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

await checkAsync("visual: leerVisual devuelve {} si falta o está corrupto, y lee uno válido", async () => {
  await conKb(async (dir) => {
    assert.deepEqual(await leerVisual("2026-10-19"), {});
    mkdirSync(join(dir, "_calendario", "2026-10-19"), { recursive: true });
    writeFileSync(visualPath("2026-10-19"), "{roto");
    assert.deepEqual(await leerVisual("2026-10-19"), {});
    writeFileSync(visualPath("2026-10-19"), JSON.stringify({ _presupuesto: { imagenes: 2, usd: 0.1 } }));
    assert.deepEqual((await leerVisual("2026-10-19"))._presupuesto, { imagenes: 2, usd: 0.1 });
    writeFileSync(visualPath("2026-10-19"), JSON.stringify({
      _presupuesto: "abc",
      arr: [1],
      txt: "x",
      p1: { fase1: "no", revisor: { imagenes: "no" } },
      p2: { fase1: [], revisor: { imagenes: [] } },
    }));
    const v = await leerVisual("2026-10-19");
    assert.equal(v._presupuesto, undefined);
    assert.deepEqual(Object.keys(v).sort(), ["p1", "p2"]);
    assert.deepEqual(v.p1, {});
    assert.deepEqual(v.p2, { fase1: [], revisor: { imagenes: [] } });
    writeFileSync(visualPath("2026-10-19"), JSON.stringify({ _presupuesto: { imagenes: -1, usd: 0 } }));
    assert.equal((await leerVisual("2026-10-19"))._presupuesto, undefined);
  });
});

await checkAsync("visual: leerVisual conserva intentos enteros ≥ 0 y descarta los demás", async () => {
  await conKb(async (dir) => {
    mkdirSync(join(dir, "_calendario", "2026-10-19"), { recursive: true });
    writeFileSync(visualPath("2026-10-19"), JSON.stringify({ a: { intentos: 2 }, b: { intentos: -1 }, c: { intentos: 1.5 }, d: { intentos: "2" }, e: { intentos: 0 } }));
    const v = await leerVisual("2026-10-19");
    assert.deepEqual(v, { a: { intentos: 2 }, b: {}, c: {}, d: {}, e: { intentos: 0 } });
  });
});

await checkAsync("visual: respuestas — una línea mala entre dos buenas se salta; anotar agrega una línea por llamada", async () => {
  await conKb(async (dir) => {
    mkdirSync(join(dir, "_calendario", "2026-10-19"), { recursive: true });
    const a = { id: "p1", n: 1, respuesta: "si" as const, en: "2026-10-20T10:00:00Z" };
    const b = { id: "p1", n: 2, respuesta: "no" as const, en: "2026-10-20T10:01:00Z" };
    writeFileSync(respuestasVisualesPath("2026-10-19"), `${JSON.stringify(a)}\n{mala\n${JSON.stringify({ ...a, respuesta: "tal vez" })}\n${JSON.stringify({ ...a, n: 0 })}\n${JSON.stringify(b)}\n`);
    assert.equal((await leerRespuestasVisuales("2026-10-19")).length, 2);
  });
  await conKb(async () => {
    assert.deepEqual(await leerRespuestasVisuales("2026-10-19"), []);
    const r = { id: "p2", n: 3, respuesta: "si" as const, en: "x" };
    const ruta = await anotarRespuestaVisual("2026-10-19", r);
    assert.equal(ruta, respuestasVisualesPath("2026-10-19"));
    await anotarRespuestaVisual("2026-10-19", { ...r, n: 4 });
    assert.equal(readFileSync(ruta, "utf8").trim().split("\n").length, 2);
    assert.deepEqual((await leerRespuestasVisuales("2026-10-19")).map((x) => x.n), [3, 4]);
  });
});

// --- resumenVisual ---
const imgV = (n: number, o: Partial<VeredictoImagen> = {}): VeredictoImagen => ({ n, que: "x", compite: false, ajeno: false, frase: "", ...o });
const revV = (imagenes: VeredictoImagen[]): VisualPieza => ({ revisor: { en: "2026-10-20T10:00:00Z", modelo: "m", estado: "revisado", imagenes, usd: 0 } });

check("resumenVisual: precisión 2/3 con un aviso sin responder; doble respuesta gana la última", () => {
  const visual: VisualJson = { p1: revV([imgV(1, { compite: true }), imgV(2, { ajeno: true }), imgV(3, { compite: true }), imgV(4, { ajeno: true }), imgV(5)]) };
  const respuestas: RespuestaVisual[] = [
    { id: "p1", n: 1, respuesta: "si", en: "2026-10-20T10:00:00Z" },
    { id: "p1", n: 2, respuesta: "no", en: "2026-10-20T10:01:00Z" },
    { id: "p1", n: 2, respuesta: "si", en: "2026-10-20T10:02:00Z" },
    { id: "p1", n: 3, respuesta: "no", en: "2026-10-20T10:03:00Z" },
  ];
  const r = resumenVisual([{ semana: "2026-10-19", visual, respuestas }]);
  assert.deepEqual(r.porSemana[0], { semana: "2026-10-19", avisos: 4, respondidos: 3, aciertos: 2, precision: 0.67 });
  assert.deepEqual(r.total, { avisos: 4, respondidos: 3, aciertos: 2, precision: 0.67 });
});

check("resumenVisual: sin respuestas no hay precisión; sin revisar no cuenta", () => {
  const visual: VisualJson = { p1: { revisor: { en: "x", modelo: "m", estado: "sin revisar", imagenes: [imgV(1, { compite: true })], usd: 0 } }, p2: revV([imgV(1, { compite: true })]) };
  const r = resumenVisual([{ semana: "2026-10-19", visual, respuestas: [] }]);
  assert.deepEqual(r.porSemana[0], { semana: "2026-10-19", avisos: 1, respondidos: 0, aciertos: 0 });
  assert.equal(r.total.precision, undefined);
});

check("resumenVisual: propuesta con 3 casos fondo-ajeno en 2 semanas; no con 1 semana", () => {
  const aj = (k: number): VisualJson => ({ p: revV(Array.from({ length: k }, (_, i) => imgV(i + 1, { ajeno: true }))) });
  const dos = resumenVisual([{ semana: "2026-10-12", visual: aj(1), respuestas: [] }, { semana: "2026-10-19", visual: aj(2), respuestas: [] }]);
  assert.deepEqual(dos.propuestas, ["proponer regla en aprendizajes.md: fondo-ajeno (3 casos en 2 semanas)"]);
  assert.deepEqual(dos.porTipo, { "fondo-ajeno": { "2026-10-12": 1, "2026-10-19": 2 } });
  assert.deepEqual(resumenVisual([{ semana: "2026-10-19", visual: aj(3), respuestas: [] }]).propuestas, []);
});

check("resumenVisual: zona de fase 1 posterior a desde alerta; anterior no", () => {
  const visual: VisualJson = { p: { fase1: [{ tipo: "zona", motivo: "m", en: "2026-10-22T10:00:00Z" }, { tipo: "tilde", motivo: "m", en: "2026-10-01T10:00:00Z" }] } };
  const r = resumenVisual([{ semana: "2026-10-19", visual, respuestas: [] }], "2026-10-20");
  assert.deepEqual(r.alertas, ["el motor volvió a fallar en zona (1 casos desde 2026-10-20): revisar el código"]);
  assert.deepEqual(resumenVisual([{ semana: "2026-10-19", visual, respuestas: [] }]).alertas, []);
});

check("resumenVisual: la fecha de una alerta es la de Chile, no la UTC", () => {
  // 02:00Z del 20 es el 19 a las 23:00 en Chile (UTC-3): antes de `desde`.
  const visual: VisualJson = { p: { fase1: [{ tipo: "zona", motivo: "m", en: "2026-10-20T02:00:00Z" }, { tipo: "tilde", motivo: "m", en: "2026-10-20T04:00:00Z" }, { tipo: "puntuacion", motivo: "m", en: "no-es-fecha" }] } };
  const r = resumenVisual([{ semana: "2026-10-19", visual, respuestas: [] }], "2026-10-20");
  assert.deepEqual(r.alertas, ["el motor volvió a fallar en tilde (1 casos desde 2026-10-20): revisar el código"]);
});

check("resumenVisual: elementos malformados se saltan sin lanzar y los válidos cuentan", () => {
  const visual = { p: { revisor: { en: "x", modelo: "m", estado: "revisado", usd: 0, imagenes: [null, imgV(1, { compite: true })] }, fase1: [null, { tipo: 5 }] } } as unknown as VisualJson;
  const r = resumenVisual([{ semana: "2026-10-19", visual, respuestas: [] }], "2026-10-01");
  assert.equal(r.total.avisos, 1);
  assert.deepEqual(r.alertas, []);
});

check("resumenVisual: dos piezas con n=1 y respuestas distintas se cuentan por separado", () => {
  const visual: VisualJson = { a: revV([imgV(1, { compite: true })]), b: revV([imgV(1, { compite: true })]) };
  const respuestas: RespuestaVisual[] = [{ id: "a", n: 1, respuesta: "si", en: "2026-10-20T10:00:00Z" }, { id: "b", n: 1, respuesta: "no", en: "2026-10-20T10:01:00Z" }];
  assert.deepEqual(resumenVisual([{ semana: "2026-10-19", visual, respuestas }]).total, { avisos: 2, respondidos: 2, aciertos: 1, precision: 0.5 });
});

check("resumenVisual: cuenta las correcciones de la fase 3 por semana y en total; las mal formadas no cuentan", () => {
  const corr = (estado: string): VisualPieza => ({ correccion: { en: "2026-10-20T10:00:00Z", estado, slides: [0] } } as unknown as VisualPieza);
  const s1: VisualJson = { a: corr("aplicada"), b: corr("aplicada"), c: corr("fallida"), d: corr("rara"), e: { correccion: null } as unknown as VisualPieza, f: revV([]) };
  const s2: VisualJson = { g: corr("omitida"), h: corr("aplicada") };
  const r = resumenVisual([{ semana: "2026-10-19", visual: s1, respuestas: [] }, { semana: "2026-10-26", visual: s2, respuestas: [] }, { semana: "2026-11-02", visual: { i: revV([]) }, respuestas: [] }]);
  assert.deepEqual(r.porSemana[0].correcciones, { aplicadas: 2, fallidas: 1, omitidas: 0 });
  assert.deepEqual(r.porSemana[1].correcciones, { aplicadas: 1, fallidas: 0, omitidas: 1 });
  // Sin correcciones la semana no lleva el campo (como `precision` sin respondidos).
  assert.equal("correcciones" in r.porSemana[2], false);
  assert.deepEqual(r.total.correcciones, { aplicadas: 3, fallidas: 1, omitidas: 1 });
  assert.equal("correcciones" in resumenVisual([{ semana: "2026-10-19", visual: { f: revV([]) }, respuestas: [] }]).total, false);
});
