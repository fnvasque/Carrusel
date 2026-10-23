import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { anotarRespuestaVisual, cupo, sinClaves, leerRespuestasVisuales, leerVisual, respuestasVisualesPath, visualPath } from "../../src/calendario/visual.ts";

check("visual: sinClaves oculta fragmentos con forma de clave de API", () => {
  assert.equal(sinClaves("Incorrect API key provided: sk-proj-AbC_12-x9. Otra: sk-xyz"), "Incorrect API key provided: sk-…. Otra: sk-…");
  assert.equal(sinClaves("sin claves"), "sin claves");
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
