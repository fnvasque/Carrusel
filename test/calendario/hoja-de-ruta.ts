import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../_check.ts";
import { ETAPAS, avisosDeHojaDeRuta, leerBanco, leerHojaDeRuta, seriesDe, validarConfig } from "../../kb-plantilla/_calendario/validar.mjs";
import { serieLabel } from "../../src/theme.ts";

/**
 * Hoja de ruta (pedido de Felipe 2026-11-01): `_calendario/hoja-de-ruta.md` da la etapa de cada
 * semana y una línea guía por día; el viernes pasa a la serie `con-tu-equipo`.
 */

const DIR = "kb-plantilla/_calendario";
const HOJA_MD = readFileSync(join(DIR, "hoja-de-ruta.md"), "utf8");
const hoja = leerHojaDeRuta(HOJA_MD);
const CONFIG = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
const has = (l: string[], re: RegExp) => l.some((e) => re.test(e));

check("hoja de ruta: la semilla trae 7 semanas seguidas, 2 por etapa en el orden del coaching, sin errores", () => {
  assert.deepEqual(hoja.errores, []);
  const semanas = [...hoja.semanas.values()];
  assert.deepEqual(semanas.map((s) => s.lunes), ["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"]);
  assert.deepEqual(semanas.map((s) => s.etapa), ["perder-el-miedo", "adoptar", "adoptar", "liderar", "liderar", "revalorizarse", "revalorizarse"]);
  for (const s of semanas) {
    assert.deepEqual(s.piezas.map((p) => p.dia), [s.lunes, sumar(s.lunes, 2), sumar(s.lunes, 4)], `${s.lunes}: lunes, miércoles y viernes`);
    assert.ok(s.piezas.every((p) => p.guia && p.referencias.length > 0 && !p.guia.includes("referencias/")));
  }
  assert.equal(hoja.semanas.has("Reserva"), false, "la reserva no es una semana");
});

check("hoja de ruta: los lunes sugieren un momento × capacidad del banco, con respaldo y sin repetirse en 35 días", () => {
  const banco = leerBanco(readFileSync(join(DIR, "momentos.md"), "utf8"));
  const vistas: { dia: string; k: string }[] = [];
  for (const s of hoja.semanas.values()) {
    const lun = s.piezas.find((p) => p.dia === s.lunes)!;
    const m = /\(([a-z-]+) × ([a-z-]+)\)/.exec(lun.guia);
    assert.ok(m, `${s.lunes}: el lunes trae su momento × capacidad`);
    assert.ok(banco.momentos.has(m[1]), `${s.lunes}: momento ${m[1]}`);
    assert.ok((banco.capacidades.get(m[2]) ?? []).length > 0, `${s.lunes}: capacidad ${m[2]} con respaldo`);
    const k = `${m[1]} × ${m[2]}`;
    assert.ok(!vistas.some((v) => v.k === k && dias(v.dia, lun.dia) < 35), `${s.lunes}: ${k} se repite en 35 días`);
    vistas.push({ dia: lun.dia, k });
  }
});

check("hoja de ruta: leerHojaDeRuta reporta fecha, etapa, día y referencias mal escritos", () => {
  const md = [
    "## 2026-11-10 · adoptar · martes",
    "## 2026-11-16 · aprender · etapa rara",
    "## 2026-11-23 · liderar · ok",
    "- lun: sin referencias",
    "- vie: algo — `referencias/a.md`",
    "- vie: otra vez — `referencias/b.md`",
    "- xyz: día raro — `referencias/c.md`",
    "## 2026-11-23 · liderar · repetida",
    "## Reserva",
    "- lun: no es semana — `referencias/d.md`",
  ].join("\n");
  const h = leerHojaDeRuta(md);
  assert.deepEqual([...h.semanas.keys()], ["2026-11-23"]);
  const e = h.errores;
  assert.ok(has(e, /2026-11-10: la semana se escribe con su lunes/));
  assert.ok(has(e, /etapa "aprender" no es una de/));
  assert.ok(has(e, /el lun no cita ninguna referencia/));
  assert.ok(has(e, /el vie está dos veces/));
  assert.deepEqual(h.semanas.get("2026-11-23")!.piezas.map((p) => p.guia), ["sin referencias", "algo"], "el día repetido no se agrega");
  assert.ok(has(e, /día "xyz" inválido/));
  assert.ok(has(e, /2026-11-23: semana repetida/));
  assert.equal(e.length, 6);
  assert.equal(ETAPAS.length, 4);
});

check("hoja de ruta: avisa (no bloquea) la pieza que no cita ninguna referencia de su línea", () => {
  const vie = { id: "vie-carrusel-x", dia: "2026-11-13", origen: { fichas: [], referencias: ["referencias/apoyo-del-jefe-al-uso-de-ia.md"] } };
  const lun = { id: "lun-reel-x", dia: "2026-11-09", origen: { fichas: [], referencias: ["referencias/empezar-con-ia-sin-pagar.md"] } };
  const mie = { id: "mie-reel-x", dia: "2026-11-11", origen: { fichas: [], referencias: ["referencias/building-effective-agents.md"] } };
  const plan = (p: Record<string, unknown>) => ({ semana: "2026-11-09", piezas: [lun, mie, p] });
  assert.deepEqual(avisosDeHojaDeRuta(plan(vie), hoja), []);
  const aparte = avisosDeHojaDeRuta(plan({ ...vie, origen: { fichas: [], referencias: ["referencias/marco-crit.md"] } }), hoja);
  assert.equal(aparte.length, 1);
  assert.match(aparte[0]!, /vie-carrusel-x: se aparta de la hoja de ruta \(etapa perder-el-miedo/);
  assert.match(aparte[0]!, /aprendizajes\.md/);
  assert.deepEqual(avisosDeHojaDeRuta({ semana: "2027-01-04", piezas: [vie] }, hoja), [], "semana fuera de la hoja");
  const movida = avisosDeHojaDeRuta(plan({ ...vie, dia: "2026-11-14" }), hoja);
  assert.equal(movida.length, 1, "pieza movida de día: se avisa el día guiado sin pieza");
  assert.match(movida[0]!, /^2026-11-13: la hoja de ruta guía ese día/);
  assert.deepEqual(avisosDeHojaDeRuta(plan(vie), undefined), [], "sin hoja");
  const rota = leerHojaDeRuta("## 2026-11-10 · adoptar · x");
  assert.ok(has(avisosDeHojaDeRuta(plan(vie), rota), /^hoja-de-ruta\.md: 2026-11-10/));
});

check("hoja de ruta: el viernes del mix es con-tu-equipo, serie válida y con rótulo en la cabecera", () => {
  assert.deepEqual(validarConfig(CONFIG), []);
  assert.ok(seriesDe(CONFIG).includes("con-tu-equipo"));
  assert.equal(CONFIG.mix.find((m: { dia: number }) => m.dia === 5).serie, "con-tu-equipo");
  assert.equal(serieLabel("con-tu-equipo"), "Con tu equipo");
});

function sumar(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dias(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}
