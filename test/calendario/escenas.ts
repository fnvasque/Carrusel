import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../_check.ts";
import { duracionReel, segundosEscenas, segundosNarracion as narracionValidador } from "../../kb-plantilla/_calendario/validar.mjs";
import { escenaDeAbandono, escenasDeReel, segundosNarracion } from "../../src/calendario/escenas.ts";
import { leerBorradores } from "../../src/calendario/bucle.ts";
import type { SemanaLeida } from "../../src/calendario/plan.ts";

const reel = (pace: string, narrar = false) => ({
  name: "x", pace,
  slides: [
    { template: "Hook", props: { title: "Ordena tus pendientes en 4 cajas" }, ...(narrar ? { narracion: "Ordena tus pendientes en cuatro cajas con la IA de siempre." } : {}) },
    { template: "Lead", props: { text: "Eisenhower lo usaba en 1954 para decidir qué hacer primero." } },
    { template: "Step", props: { step: 1, heading: "Pega tu lista en ChatGPT", bullets: ["uno", "dos"] } },
    { template: "Cta", props: { title: "Guárdalo", cta: "Guarda" } },
  ],
});

check("escenas: sin duración real, el total coincide con duracionReel de validar.mjs (mismo motor) en los 3 ritmos", () => {
  for (const pace of ["ensenar", "rapido", "gancho"]) {
    for (const narrar of [false, true]) {
      const b = reel(pace, narrar);
      const es = escenasDeReel(b);
      assert.equal(es.length, 4);
      assert.ok(Math.abs(es.at(-1)!.fin - duracionReel(b)) < 0.02, `${pace}/${narrar}: ${es.at(-1)!.fin} vs ${duracionReel(b)}`);
      const durs = segundosEscenas(b.slides, pace as never);
      assert.ok(Math.abs(es[0]!.fin - (durs[0]! - (pace === "gancho" ? 0.3 : pace === "rapido" ? 0.35 : 0.5))) < 0.02);
    }
  }
  assert.equal(segundosNarracion("una dos tres"), narracionValidador("una dos tres"));
  assert.equal(segundosNarracion("  "), undefined);
});

check("escenas: con la duración real se escala; las escenas son contiguas y llevan su título", () => {
  const b = reel("gancho", true);
  const es = escenasDeReel(b, 20000);
  assert.equal(es.at(-1)!.fin, 20);
  assert.equal(es[0]!.inicio, 0);
  for (let i = 1; i < es.length; i++) assert.equal(es[i]!.inicio, es[i - 1]!.fin);
  assert.deepEqual(es.map((e) => [e.escena, e.plantilla, e.titulo]), [
    [1, "Hook", "Ordena tus pendientes en 4 cajas"], [2, "Lead", "Eisenhower lo usaba en 1954 para decidir qué hacer primero."],
    [3, "Step", "Pega tu lista en ChatGPT"], [4, "Cta", "Guárdalo"],
  ]);
  // Duración rara: no escala.
  assert.equal(escenasDeReel(b, Number.NaN).at(-1)!.fin, escenasDeReel(b).at(-1)!.fin);
});

check("escenas: escenaDeAbandono ubica el visionado medio; más largo que el reel → la última; datos raros → undefined", () => {
  const es = escenasDeReel(reel("gancho"), 10000);
  const a = escenaDeAbandono(es, 500)!;
  assert.equal(a.escena, 1);
  assert.equal(a.segundo, 0.5);
  assert.equal(a.de, 4);
  assert.equal(escenaDeAbandono(es, es[1]!.inicio * 1000)!.escena, 2, "el inicio exacto ya es la escena siguiente");
  assert.equal(escenaDeAbandono(es, 60000)!.escena, 4);
  assert.equal(escenaDeAbandono(es, undefined), undefined);
  assert.equal(escenaDeAbandono(es, -1), undefined);
  assert.equal(escenaDeAbandono([], 1000), undefined);
  assert.deepEqual(escenasDeReel(null), []);
  assert.deepEqual(escenasDeReel({ slides: [] }), []);
  assert.equal(escenasDeReel({ slides: ["raro", 3] }).length, 2, "slides raras usan props vacías");
});

check("escenas: leerBorradores lee solo los reels de cada semana y omite los ilegibles", () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-escenas-"));
  try {
    mkdirSync(join(dir, "2026-10-12"));
    writeFileSync(join(dir, "2026-10-12", "lun-reel-a.json"), JSON.stringify(reel("gancho")));
    writeFileSync(join(dir, "2026-10-12", "mar-carrusel-b.json"), "{}");
    writeFileSync(join(dir, "2026-10-12", "mie-reel-c.json"), "{");
    const plan = { semana: "2026-10-12", zona: "America/Santiago", experimento: null, piezas: ["lun-reel-a", "mar-carrusel-b", "mie-reel-c", "jue-reel-d"].map((id) => ({ id, formato: id.includes("carrusel") ? "carrusel" : "reel" })) };
    const r = leerBorradores([{ semana: "2026-10-12", plan, render: {}, estado: {} } as unknown as SemanaLeida], dir);
    assert.deepEqual(Object.keys(r), ["2026-10-12/lun-reel-a"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
