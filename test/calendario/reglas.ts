import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../_check.ts";
import type { Medicion } from "../../src/calendario/bucle.ts";
import { antesDespues, leerReglas, MIN_PIEZAS_REGLA } from "../../src/calendario/reglas.ts";

let seq = 0;
/** Reel publicado `dia` a las 14:00 de Chile con `seg` s de visionado medio. */
const reel = (dia: string, seg: number, extra: Partial<Medicion> = {}): { m: Medicion; rel: number } => {
  seq++;
  return {
    m: { piezaId: `p${seq}`, tema: "IA", arquetipo: "tutorial", hookCategoria: "x", senal: "retencion", valor: 0.2, modo: "tasa", semana: "2026-10-12", formato: "reel", publicadoEn: `${dia}T17:00:00.000Z`, avgWatchMs: seg * 1000, retencion: seg / 20, ...extra },
    rel: 1,
  };
};
const dias = (desde: number, n: number, mes = "2026-10"): string[] => Array.from({ length: n }, (_, i) => `${mes}-${String(desde + i).padStart(2, "0")}`);

check("reglas: leerReglas acepta { reglas } o la lista y avisa por cada entrada rara o repetida", () => {
  const ok = { id: "a", desde: "2026-10-16", formato: null, descripcion: "d" };
  assert.deepEqual(leerReglas({ reglas: [ok] }).reglas, [ok]);
  assert.deepEqual(leerReglas([{ ...ok, formato: undefined }]).reglas[0]!.formato, null, "sin formato = ambos");
  const r = leerReglas({ reglas: [ok, ok, { id: "b", desde: "16-10-2026" }, { id: "c", desde: "2026-10-16", formato: "story" }, 3] });
  assert.equal(r.reglas.length, 1);
  assert.equal(r.avisos.length, 4);
  assert.deepEqual(leerReglas(undefined), { reglas: [], avisos: [] });
  assert.equal(leerReglas({ reglas: "x" }).avisos.length, 1);
});

check("reglas: el registro sembrado de la plantilla es válido, con las fechas confirmadas en el git log", () => {
  const json = JSON.parse(readFileSync(join(import.meta.dirname, "../../kb-plantilla/_calendario/reglas.json"), "utf8"));
  const r = leerReglas(json);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.reglas.map((x) => [x.id, x.desde]), [
    ["ritmo-gancho-20s", "2026-10-15"], ["regla-6-ia-se-ve", "2026-10-16"], ["regla-7-gesto-antes-5s", "2026-10-16"],
    ["regla-8-hook-resultado", "2026-10-16"], ["regla-9-narracion", "2026-10-19"], ["regla-10-screen", "2026-10-19"],
    ["publico-profesional-ia", "2026-10-26"], ["lector-novedad-p8", "2026-10-26"], ["hook-juez", "2026-10-26"], ["guia-redaccion", "2026-10-26"],
    ["reel-35s", "2026-10-26"], ["carrusel-denso", "2026-10-26"], ["series-publico-profesional", "2026-10-26"],
    ["hook-umbral-7", "2026-10-26"], ["lector-prisa-p8-nb", "2026-10-26"], ["promesas-y-tope-juez", "2026-10-26"], ["investigacion-alcance-y-listas", "2026-10-26"],
    ["mito-realidad-corto", "2026-10-26"],
    ["revision-visual-fase1", "2026-10-23"],
    ["revision-visual-fase2", "2026-10-23"],
    ["pivote-coaching", "2026-10-31"],
    ["look-papel", "2026-10-31"],
    ["reel-sin-subtitulos", "2026-10-31"],
    ["revision-visual-fase3", "2026-11-09"],
    ["investigacion-por-etapas", "2026-11-02"],
    ["carrusel-explicativo", "2026-11-27"],
    ["portada-al-lector", "2026-10-31"],
    ["cierre-dm-o-comentario", "2026-10-31"],
    ["reel-explica-sin-voz", "2026-11-02"],
    ["piezas-que-se-entienden", "2026-11-02"],
    ["titulo-hasta-14-palabras", "2026-11-09"],
    ["juez-umbral-6", "2026-11-09"],
  ]);
  assert.ok(r.reglas.every((x) => x.descripcion && x.fuente));
});

check("reglas: antesDespues — reels por visionado medio, veredicto con n suficiente y simultáneas", () => {
  const regla = { id: "r", desde: "2026-10-16", formato: "reel" as const, descripcion: "d" };
  const otra = { id: "o", desde: "2026-10-19", formato: null, descripcion: "o" };
  const lejana = { id: "l", desde: "2026-12-30", formato: null, descripcion: "l" };
  const antes = dias(5, MIN_PIEZAS_REGLA).map((d) => reel(d, 5));
  const despues = dias(16, MIN_PIEZAS_REGLA).map((d) => reel(d, 4));
  const carrusel = reel("2026-10-17", 30, { formato: "carrusel" });
  const [c] = antesDespues([regla, otra, lejana], [...antes, ...despues, carrusel]);
  assert.equal(c!.metrica, "visionadoMedioSegundos");
  assert.deepEqual([c!.antes.n, c!.antes.media, c!.despues.n, c!.despues.media], [6, 5, 6, 4]);
  assert.equal(c!.antes.retencion, 0.25);
  assert.equal(c!.cambio, -0.2);
  assert.equal(c!.veredicto, "empeoró");
  assert.deepEqual(c!.simultaneas, ["o"]);
  assert.ok(!c!.despues.piezas.includes(`2026-10-12/${carrusel.m.piezaId}`), "el carrusel no entra en un reel");
  const mejor = antesDespues([regla], [...antes, ...dias(16, 6).map((d) => reel(d, 6))])[0]!;
  assert.equal(mejor.veredicto, "mejoró");
  assert.equal(antesDespues([regla], [...antes, ...dias(16, 6).map((d) => reel(d, 5.2))])[0]!.veredicto, "sin cambio claro");
});

check("reglas: antesDespues — n insuficiente no da veredicto; una regla de ambos formatos da una fila por formato (carrusel por índice)", () => {
  const regla = { id: "r", desde: "2026-10-16", formato: null, descripcion: "d" };
  const pocos = [...dias(10, 2).map((d) => reel(d, 5)), ...dias(16, 2).map((d) => reel(d, 1))];
  const filas = antesDespues([regla], pocos);
  assert.deepEqual(filas.map((f) => [f.formato, f.metrica, f.veredicto]), [["reel", "visionadoMedioSegundos", "n insuficiente"], ["carrusel", "indiceRelativo", "n insuficiente"]]);
  assert.equal(filas[0]!.cambio, undefined);
  assert.deepEqual(filas[1]!.antes, { n: 0, piezas: [] });
  // Fuera de la ventana de 28 días no cuenta; sin publicadoEn tampoco.
  const viejo = reel("2026-08-01", 9);
  const sinFecha = reel("x", 9, { publicadoEn: undefined });
  assert.equal(antesDespues([regla], [viejo, sinFecha])[0]!.antes.n, 0);
  // Carrusel: índice relativo.
  const car = (d: string, rel: number) => ({ ...reel(d, 0, { formato: "carrusel", avgWatchMs: undefined }), rel });
  const f = antesDespues([{ ...regla, formato: "carrusel" }], [...dias(5, 6).map((d) => car(d, 1)), ...dias(16, 6).map((d) => car(d, 1.5))])[0]!;
  assert.equal(f.veredicto, "mejoró");
  assert.equal(f.antes.retencion, undefined);
});

// T5: una regla registrada pero sin encender (`pendiente: true`) no se mide ni cuenta como simultánea.
check("reglas: una regla pendiente se lee (con pendiente) pero antesDespues la ignora, también como simultánea", () => {
  const regla = { id: "r", desde: "2026-10-16", formato: "reel" as const, descripcion: "d" };
  const pend = { id: "p", desde: "2026-10-19", formato: null, descripcion: "p", pendiente: true as const };
  const leidas = leerReglas({ reglas: [regla, pend] });
  assert.deepEqual(leidas.avisos, []);
  assert.deepEqual(leidas.reglas.map((x) => [x.id, x.pendiente]), [["r", undefined], ["p", true]]);
  assert.equal("pendiente" in leerReglas({ reglas: [{ ...pend, pendiente: false }] }).reglas[0]!, false, "pendiente: false = encendida");
  const antes = dias(5, MIN_PIEZAS_REGLA).map((d) => reel(d, 5));
  const despues = dias(19, MIN_PIEZAS_REGLA).map((d) => reel(d, 4));
  const filas = antesDespues(leidas.reglas, [...antes, ...despues]);
  assert.deepEqual(filas.map((f) => f.id), ["r"], "la pendiente no da filas");
  assert.deepEqual(filas[0]!.simultaneas, [], "ni cuenta como simultánea");
  // Encendida (sin pendiente), sí.
  const { pendiente: _, ...encendida } = pend;
  assert.deepEqual(antesDespues([regla, encendida], [...antes, ...despues])[0]!.simultaneas, ["p"]);
});

check("reglas: pendiente que no es booleano se avisa y la entrada se ignora", () => {
  const r = leerReglas({ reglas: [{ id: "x", desde: "2026-10-16", formato: null, descripcion: "d", pendiente: "sí" }] });
  assert.equal(r.reglas.length, 0);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0]!, /pendiente/);
});

check("reglas: en la plantilla, revision-visual-fase3 va pendiente (fecha provisional) y es la única", () => {
  const json = JSON.parse(readFileSync(join(import.meta.dirname, "../../kb-plantilla/_calendario/reglas.json"), "utf8"));
  const r = leerReglas(json);
  assert.deepEqual(r.reglas.filter((x) => x.pendiente).map((x) => x.id), ["revision-visual-fase3"]);
});
