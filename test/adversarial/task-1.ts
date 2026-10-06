import assert from "node:assert/strict";
import { check } from "../_check.ts";
import { parsePlan } from "../../src/calendario/plan.ts";

/*
 * Adversario T1. Respaldo: ruling del integrador para T1 — el `id` de pieza debe cumplir
 * `^[a-z0-9-]{3,80}$` (se usa como carpeta y en URLs del servidor; así lo validan T5 y T9).
 * parsePlan hoy usa /^[A-Za-z0-9][A-Za-z0-9_-]*$/: acepta ids que T5/T9 rechazarán.
 */

function pieza(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lun-reel-agentes-claude-code", dia: "2026-10-12", hora: "19:30",
    formato: "reel", arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "p",
    hook: { categoria: "curiosidad", texto: "Esta IA gratis te resume 6 PDFs", score: 9 },
    emocion: "alivio", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" },
    origen: { fichas: [], referencias: [] }, derivadoDe: null, caption: "c", borrador: "b.json",
    estado: "planificado", ...extra,
  };
}
const plan = (piezas: unknown[]): string =>
  JSON.stringify({ semana: "2026-10-12", zona: "America/Santiago", experimento: null, piezas });

check("adversario T1: parsePlan acepta id con mayúsculas (debe cumplir ^[a-z0-9-]{3,80}$)", () => {
  assert.throws(() => parsePlan(plan([pieza({ id: "Lun-Reel-Agentes" })])), /id/);
});
check("adversario T1: parsePlan acepta id con guion bajo", () => {
  assert.throws(() => parsePlan(plan([pieza({ id: "lun_reel_agentes" })])), /id/);
});
check("adversario T1: parsePlan acepta id de menos de 3 caracteres", () => {
  assert.throws(() => parsePlan(plan([pieza({ id: "a" })])), /id/);
  assert.throws(() => parsePlan(plan([pieza({ id: "ab" })])), /id/);
});
check("adversario T1: parsePlan acepta id de más de 80 caracteres", () => {
  assert.throws(() => parsePlan(plan([pieza({ id: "a".repeat(81) })])), /id/);
});
