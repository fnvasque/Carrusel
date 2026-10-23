import assert from "node:assert/strict";
import { check, done } from "./_check.ts";
import { unicos, aplicarModo, ErrorVisual, type Hallazgo } from "../src/render/revision.ts";

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

await done();
