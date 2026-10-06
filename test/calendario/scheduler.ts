import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { tareasDebidas, tick, cargarFilasDb, guardarFilaDb, type SchedulerDeps } from "../../src/calendario/scheduler.ts";
import { anotarRegistro, escribirEstado } from "../../src/calendario/registro.ts";
import type { Fila } from "../../src/calendario/publish.ts";
import type { EstadoEntry, MediosRender, Pieza, RenderEntry, SemanaLeida } from "../../src/calendario/plan.ts";
import { closeDb } from "../../src/kb/db.ts";
import { MetaFalso, IG, mediosReel, piezaDe } from "./publish.ts";
// Los módulos hermanos con top-level await corren en paralelo: este archivo cambia
// KB_DIR y abre SQLite, igual que test/calendario/plan.ts. Importarlo lo vuelve
// dependencia, así que termina antes de que empiece este.
import "./plan.ts";

const Z = (s: string): Date => new Date(s);
/** render.json del Mac (R48): nombres de archivo; el bot arma las URLs con MEDIA_PUBLIC_BASE y el token. */
const renderReel: MediosRender = { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg", duracionMs: 21000 };
const render = (medios = renderReel): RenderEntry => ({ estado: "renderizado", medios, en: "2026-10-11T10:00:00Z" });

function semanaDe(piezas: Pieza[], rend: Record<string, RenderEntry> = {}, est: Record<string, EstadoEntry> = {}, semana = "2026-10-12"): SemanaLeida {
  return {
    semana,
    plan: { semana, zona: "America/Santiago", experimento: null, piezas },
    render: rend,
    estado: est,
  };
}
const lunes = piezaDe(); // 2026-10-12 19:30 Chile = 22:30Z
const programada = (): SemanaLeida => semanaDe([lunes], { [lunes.id]: render() }, { [lunes.id]: { estado: "programado" } });
const fila = (paso: Fila["paso"], tipo: "post" | "story" = "post", extra: Partial<Fila> = {}): Fila =>
  ({ piezaId: `2026-10-12/${lunes.id}`, tipo, paso, intentos: 0, ...extra });

// --- tareasDebidas (puro) ---

check("scheduler: pieza 19:30 del lunes 2026-10-12 → 22:29Z no, 22:30Z sí, 22:46Z saltar 'no se publica tarde'", () => {
  const s = [programada()];
  assert.equal(tareasDebidas(s, [], Z("2026-10-12T22:29:00Z"), false).publicar.length, 0);
  const a = tareasDebidas(s, [], Z("2026-10-12T22:30:00Z"), false);
  assert.equal(a.publicar.length, 1);
  assert.equal(a.publicar[0].tipo, "post");
  assert.equal(a.publicar[0].semana, "2026-10-12");
  assert.equal(a.publicar[0].hora.toISOString(), "2026-10-12T22:30:00.000Z");
  assert.equal(tareasDebidas(s, [], Z("2026-10-12T22:44:59Z"), false).publicar.length, 1);
  const b = tareasDebidas(s, [], Z("2026-10-12T22:46:00Z"), false);
  assert.equal(b.publicar.length, 0);
  assert.deepEqual(b.saltar.map((x) => [x.id, x.motivo]), [[lunes.id, "no se publica tarde"]]);
});

check("scheduler: renderizado sin estado.json también es debido (el bot lo pasa a programado)", () => {
  const s = [semanaDe([lunes], { [lunes.id]: render() })];
  assert.equal(tareasDebidas(s, [], Z("2026-10-12T22:31:00Z"), false).publicar.length, 1);
});

check("scheduler: sin render a la hora → saltar 'falta el render' (antes de la hora, nada)", () => {
  const s = [semanaDe([lunes])];
  const antes = tareasDebidas(s, [], Z("2026-10-12T22:00:00Z"), false);
  assert.equal(antes.publicar.length + antes.saltar.length, 0);
  const r = tareasDebidas(s, [], Z("2026-10-12T22:30:00Z"), false);
  assert.equal(r.publicar.length, 0);
  assert.deepEqual(r.saltar.map((x) => x.motivo), ["falta el render"]);
  // programado en estado.json pero sin medios en render.json → tampoco se publica.
  const sinMedios = [semanaDe([lunes], {}, { [lunes.id]: { estado: "programado" } })];
  assert.deepEqual(tareasDebidas(sinMedios, [], Z("2026-10-12T22:30:00Z"), false).saltar.map((x) => x.motivo), ["falta el render"]);
});

check("scheduler: 00:30 del domingo 2026-09-06 (hora inexistente) → debida a las 04:30Z una sola vez", () => {
  const p = piezaDe({ id: "dom-reel-prueba", dia: "2026-09-06", hora: "00:30" });
  const s = [semanaDe([p], { [p.id]: render() }, {}, "2026-08-31")];
  assert.equal(tareasDebidas(s, [], Z("2026-09-06T03:30:00Z"), false).publicar.length, 0);
  assert.equal(tareasDebidas(s, [], Z("2026-09-06T04:29:00Z"), false).publicar.length, 0);
  const r = tareasDebidas(s, [], Z("2026-09-06T04:30:00Z"), false);
  assert.equal(r.publicar.length, 1);
  assert.equal(r.publicar[0].hora.toISOString(), "2026-09-06T04:30:00.000Z");
  const pub: Fila = { piezaId: `2026-08-31/${p.id}`, tipo: "post", paso: "publicado", mediaId: "m1", intentos: 0 };
  assert.equal(tareasDebidas(s, [pub], Z("2026-09-06T04:31:00Z"), false).publicar.length, 0);
});

check("scheduler: fin del horario de verano (sábado 2026-04-04 23:30 se repite) → una sola hora, la primera", () => {
  const p = piezaDe({ id: "sab-reel-prueba", dia: "2026-04-04", hora: "23:30" });
  const s = [semanaDe([p], { [p.id]: render() }, {}, "2026-03-30")];
  const r = tareasDebidas(s, [], Z("2026-04-05T02:30:00Z"), false);
  assert.equal(r.publicar.length, 1);
  const pub: Fila = { piezaId: `2026-03-30/${p.id}`, tipo: "post", paso: "publicado", mediaId: "m1", intentos: 0 };
  // La segunda vez que el reloj marca 23:30 (03:30Z) ya está publicada.
  const r2 = tareasDebidas(s, [pub], Z("2026-04-05T03:30:00Z"), false);
  assert.equal(r2.publicar.length + r2.saltar.length, 0);
});

check("scheduler: fila post publicada o fallida → nunca vuelve a aparecer (aunque estado.json sea viejo)", () => {
  const s = [programada()];
  for (const paso of ["publicado", "fallido"] as const) {
    for (const t of ["2026-10-12T22:30:00Z", "2026-10-12T22:50:00Z", "2026-10-13T12:00:00Z"]) {
      const r = tareasDebidas(s, [fila(paso, "post", { mediaId: "m1" })], Z(t), false);
      assert.equal(r.publicar.filter((x) => x.tipo === "post").length, 0, `${paso} ${t}`);
      assert.equal(r.saltar.filter((x) => x.tipo === "post").length, 0, `${paso} ${t}`);
    }
  }
});

check("scheduler: estado.json publicado sin fila (base perdida) → no se publica de nuevo", () => {
  const s = [semanaDe([lunes], { [lunes.id]: render() }, { [lunes.id]: { estado: "publicado", mediaId: "m1" } })];
  assert.equal(tareasDebidas(s, [], Z("2026-10-12T22:31:00Z"), false).publicar.length, 0);
});

check("scheduler: fila en esperando → se termina hasta hora + 40 min (REANUDAR_MS); publicando → siempre se verifica", () => {
  const s = [programada()];
  for (const paso of ["esperando", "publicando"] as const) {
    const r = tareasDebidas(s, [fila(paso, "post", { containerId: "c1" })], Z("2026-10-12T22:50:00Z"), false);
    assert.equal(r.publicar.length, 1, paso);
    assert.equal(r.saltar.length, 0, paso);
  }
  // Contenedor creado pero el bot estuvo caído una hora: no se publica tarde.
  const tarde = tareasDebidas(s, [fila("esperando", "post", { containerId: "c1" })], Z("2026-10-12T23:30:00Z"), false);
  assert.equal(tarde.publicar.length, 0);
  assert.deepEqual(tarde.saltar.map((x) => x.motivo), ["no se publica tarde"]);
  // publicando nunca se salta (pudo publicarse): se verifica.
  const ver = tareasDebidas(s, [fila("publicando", "post", { containerId: "c1" })], Z("2026-10-13T03:30:00Z"), false);
  assert.equal(ver.publicar.length, 1);
  assert.equal(ver.saltar.length, 0);
  // Fila que no llegó a crear el contenedor principal, fuera de la ventana → se salta.
  const h = tareasDebidas(s, [fila("hijos", "post", { children: ["a"] })], Z("2026-10-12T23:30:00Z"), false);
  assert.equal(h.publicar.length, 0);
  assert.deepEqual(h.saltar.map((x) => x.motivo), ["no se publica tarde"]);
});

check("scheduler: story a publicadoEn + 60 min, no antes; con fila story terminada no", () => {
  const est = { [lunes.id]: { estado: "publicado" as const, mediaId: "m1", publicadoEn: "2026-10-12T22:31:00.000Z" } };
  const s = [semanaDe([lunes], { [lunes.id]: render() }, est)];
  const pub = [fila("publicado", "post", { mediaId: "m1" })];
  assert.equal(tareasDebidas(s, pub, Z("2026-10-12T23:30:59Z"), false).publicar.length, 0);
  const r = tareasDebidas(s, pub, Z("2026-10-12T23:31:00Z"), false);
  assert.equal(r.publicar.length, 1);
  assert.equal(r.publicar[0].tipo, "story");
  assert.equal(r.publicar[0].hora.toISOString(), "2026-10-12T23:31:00.000Z");
  // Story sin ventana de 15 min: 3 h después sigue debida.
  assert.equal(tareasDebidas(s, pub, Z("2026-10-13T01:31:00Z"), false).publicar.length, 1);
  for (const paso of ["publicado", "fallido"] as const) {
    assert.equal(tareasDebidas(s, [...pub, fila(paso, "story")], Z("2026-10-12T23:40:00Z"), false).publicar.length, 0);
  }
  // story ya registrada en estado.json → no
  const s2 = [semanaDe([lunes], { [lunes.id]: render() }, { [lunes.id]: { ...est[lunes.id], story: { estado: "publicado", mediaId: "s1" } } })];
  assert.equal(tareasDebidas(s2, pub, Z("2026-10-12T23:40:00Z"), false).publicar.length, 0);
  // Más de 6 h después sin story → se descarta con motivo.
  const tarde = tareasDebidas(s, pub, Z("2026-10-13T04:32:00Z"), false);
  assert.equal(tarde.publicar.length, 0);
  assert.equal(tarde.saltar.length, 1);
  assert.equal(tarde.saltar[0].tipo, "story");
  assert.match(tarde.saltar[0].motivo, /6 h/);
});

check("scheduler: pieza saltada o fallida → sin story", () => {
  for (const estado of ["saltado", "fallido"] as const) {
    const s = [semanaDe([lunes], { [lunes.id]: render() }, { [lunes.id]: { estado, publicadoEn: "2026-10-12T22:31:00Z" } })];
    const r = tareasDebidas(s, [], Z("2026-10-12T23:40:00Z"), false);
    assert.equal(r.publicar.length + r.saltar.length, 0, estado);
  }
});

check("scheduler: pausado → publicar vacío; si la ventana pasa en pausa → saltar 'pausado'", () => {
  const s = [programada()];
  const a = tareasDebidas(s, [], Z("2026-10-12T22:30:00Z"), true);
  assert.equal(a.publicar.length, 0);
  assert.equal(a.saltar.length, 0);
  const b = tareasDebidas(s, [], Z("2026-10-12T22:46:00Z"), true);
  assert.deepEqual(b.saltar.map((x) => x.motivo), ["pausado"]);
  // También una reanudación espera a que se reanude.
  assert.equal(tareasDebidas(s, [fila("esperando", "post", { containerId: "c1" })], Z("2026-10-12T22:35:00Z"), true).publicar.length, 0);
});

check("scheduler: reloj que salta hacia atrás (NTP) no publica antes de la hora", () => {
  const s = [programada()];
  assert.equal(tareasDebidas(s, [], Z("2026-10-12T21:30:00Z"), false).publicar.length, 0);
});

check("scheduler: borde de REANUDAR_MS — esperando sin pausa a hora + 39:59 se retoma; a hora + 40:00 se salta", () => {
  const s = [programada()];
  const f = [fila("esperando", "post", { containerId: "c1" })];
  const antes = tareasDebidas(s, f, Z("2026-10-12T23:09:59Z"), false);
  assert.equal(antes.publicar.length, 1);
  assert.equal(antes.saltar.length, 0);
  const borde = tareasDebidas(s, f, Z("2026-10-12T23:10:00Z"), false);
  assert.equal(borde.publicar.length, 0);
  assert.deepEqual(borde.saltar.map((x) => x.motivo), ["no se publica tarde"]);
});

// --- tick (con I/O falso) ---

interface Mundo {
  deps: SchedulerDeps;
  meta: MetaFalso;
  avisos: string[];
  estados: { semana: string; id: string; e: Partial<EstadoEntry> }[];
  registro: Record<string, unknown>[];
  commits: string[][];
  orden: string[];
  filas: Map<string, Fila>;
  claves: Map<string, string>;
  reloj: { t: number };
}

function mundo(semanas: SemanaLeida[], extra: Partial<SchedulerDeps> = {}): Mundo {
  const meta = new MetaFalso();
  const reloj = { t: Date.parse("2026-10-12T22:30:00Z") };
  meta.reloj = reloj.t;
  const avisos: string[] = [];
  const estados: Mundo["estados"] = [];
  const registro: Record<string, unknown>[] = [];
  const commits: string[][] = [];
  const orden: string[] = [];
  const filas = new Map<string, Fila>();
  const claves = new Map<string, string>();
  const ctx = meta.ctx();
  const deps: SchedulerDeps = {
    graph: ctx.graph,
    igUserId: IG,
    modo: "auto",
    ahora: () => new Date(reloj.t),
    dormir: async (ms) => { reloj.t += ms; meta.reloj = reloj.t; },
    avisar: async (t) => { avisos.push(t); },
    tokenOk: async () => true,
    listarSemanas: async () => semanas.map((s) => s.semana),
    leerSemana: async (s) => semanas.find((x) => x.semana === s),
    cargarFilas: () => [...filas.values()].map((f) => structuredClone(f)),
    guardarFila: (f) => { filas.set(`${f.piezaId}|${f.tipo}`, structuredClone(f)); orden.push(`fila:${f.paso}`); meta.guardadas.push(structuredClone(f)); },
    leerClave: (k) => claves.get(k),
    guardarClave: (k, v) => { claves.set(k, v); },
    escribirEstado: async (semana, id, e) => {
      estados.push({ semana, id, e });
      orden.push(`estado:${e.estado ?? (e.story ? "story" : "otro")}`);
      const s = semanas.find((x) => x.semana === semana)!;
      const prev = s.estado[id];
      s.estado[id] = { ...prev, ...e, ...(e.story ? { story: { ...prev?.story, ...e.story } } : {}) } as EstadoEntry;
    },
    anotarRegistro: async (l) => { registro.push(l); orden.push(`registro:${l.tipo}`); },
    commit: async (paths) => { commits.push(paths); orden.push("commit"); },
    leerBorrador: async () => ({
      name: "Agentes de Claude Code", angle: "x", pillar: "herramienta",
      slides: [
        { template: "Hook", props: { title: "Esta IA te ahorra 3 horas al día", highlight: "3 horas" } },
        { template: "Cta", props: { title: "Guarda este post" } },
      ],
    }),
    mediaBase: "https://media.ejemplo.cl",
    mediaToken: "tok",
    ...extra,
  };
  return { deps, meta, avisos, estados, registro, commits, orden, filas, claves, reloj };
}

// R48: render.json trae nombres; el bot arma las URLs con urlPublica(MEDIA_PUBLIC_BASE, MEDIA_PUBLIC_TOKEN, …).
await checkAsync("tick (R48): arma las URLs públicas de los medios con MEDIA_PUBLIC_BASE y el token al publicar", async () => {
  const w = mundo([programada()]);
  await tick(w.deps);
  const params = [...w.meta.contenedores.values()].map((c) => c.params);
  assert.equal(params[0]?.video_url, "https://media.ejemplo.cl/media/tok/2026-10-12/lun-reel-agentes/reel.mp4");
  assert.equal(params[0]?.cover_url, "https://media.ejemplo.cl/media/tok/2026-10-12/lun-reel-agentes/cover.jpg");
  // Sin MEDIA_PUBLIC_BASE no hay URL: la pieza falla con motivo claro y sin POST a Meta.
  const sinBase = mundo([programada()], { mediaBase: undefined });
  await tick(sinBase.deps);
  assert.equal(sinBase.meta.contenedores.size, 0);
  assert.match(sinBase.estados.at(-1)?.e.motivo ?? "", /MEDIA_PUBLIC_BASE/);
});

await checkAsync("tick: publica la pieza debida, persiste la fila antes del commit y anota el registro con los campos de T3", async () => {
  const w = mundo([programada()]);
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 1);
  const f = w.filas.get(`2026-10-12/${lunes.id}|post`)!;
  assert.equal(f.paso, "publicado");
  const pub = w.estados.find((e) => e.e.estado === "publicado")!;
  assert.equal(pub.e.mediaId, f.mediaId);
  assert.ok(pub.e.publicadoEn);
  const linea = w.registro.find((l) => l.tipo === "publicado")!;
  assert.deepEqual(Object.keys(linea).sort(),
    ["duracionMs", "mediaId", "nombreMotor", "piezaId", "predictedScore", "publicadoEn", "semana", "tipo",
      "senal", "tema", "arquetipo", "hookCategoria", "formato"].sort());
  assert.equal(linea.senal, lunes.senal);
  assert.equal(linea.tema, lunes.tema);
  assert.equal(linea.arquetipo, lunes.arquetipo);
  assert.equal(linea.hookCategoria, lunes.hook.categoria);
  assert.equal(linea.formato, "reel");
  assert.equal(f.piezaId, `2026-10-12/${lunes.id}`, "R20: la clave incluye la semana");
  assert.equal(linea.piezaId, lunes.id);
  assert.equal(linea.mediaId, f.mediaId);
  assert.equal(linea.semana, "2026-10-12");
  assert.equal(linea.duracionMs, 21000);
  assert.equal(linea.nombreMotor, "agentes-de-claude-code");
  assert.equal(typeof linea.predictedScore, "number");
  // La fila "publicado" se guardó antes de escribir estado.json, el registro y el commit.
  const iFila = w.orden.indexOf("fila:publicado");
  assert.ok(iFila >= 0 && iFila < w.orden.indexOf("estado:publicado"));
  assert.ok(w.orden.indexOf("estado:publicado") < w.orden.lastIndexOf("commit"));
  assert.ok(w.commits.at(-1)!.some((p) => p.endsWith("estado.json")));
  assert.ok(w.commits.at(-1)!.some((p) => p.endsWith("registro.jsonl")));
  assert.ok(w.avisos.some((a) => /Publicad/.test(a)));
  // Un segundo tick no vuelve a publicar.
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 1);
});

await checkAsync("tick: sin borrador legible omite nombreMotor y predictedScore", async () => {
  const w = mundo([programada()], { leerBorrador: async () => { throw new Error("no existe"); } });
  await tick(w.deps);
  const linea = w.registro.find((l) => l.tipo === "publicado")!;
  assert.equal("nombreMotor" in linea, false);
  assert.equal("predictedScore" in linea, false);
  assert.equal(w.meta.publicaciones, 1);
});

await checkAsync("tick: token inválido → no publica y avisa una sola vez por día", async () => {
  const w = mundo([programada()], { tokenOk: async () => false });
  await tick(w.deps);
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.equal(w.meta.llamadas, 0);
  assert.equal(w.avisos.filter((a) => /token/i.test(a)).length, 1);
  assert.equal(w.filas.size, 0);
  // Al día siguiente vuelve a avisar (con otra pieza debida).
  const martes = piezaDe({ id: "mar-reel-otra", dia: "2026-10-13", hora: "19:30" });
  const s = w.deps.leerSemana;
  w.deps.leerSemana = async (x) => { const r = await s(x); if (r && !r.plan.piezas.some((p) => p.id === martes.id)) { r.plan.piezas.push(martes); r.render[martes.id] = render(); } return r; };
  w.reloj.t = Date.parse("2026-10-13T22:30:00Z");
  await tick(w.deps);
  assert.equal(w.avisos.filter((a) => /token/i.test(a)).length, 2);
});

await checkAsync("tick: candado — dos tick concurrentes publican una sola vez", async () => {
  let soltar!: () => void;
  const bloqueo = new Promise<void>((r) => { soltar = r; });
  const w = mundo([programada()]);
  w.meta.colaStatus = [["IN_PROGRESS", "FINISHED"]];
  const dormir = w.deps.dormir;
  w.deps.dormir = async (ms) => { await bloqueo; await dormir(ms); };
  const a = tick(w.deps);
  await new Promise((r) => setTimeout(r, 5));
  await tick(w.deps); // vuelve de inmediato: hay un tick en curso
  soltar();
  await a;
  assert.equal(w.meta.publicaciones, 1);
  assert.equal(w.meta.postsA("/media").length, 1);
});

await checkAsync("tick: plan.json inválido en una semana → avisa y sigue con las otras", async () => {
  const otra = semanaDe([], {}, {}, "2026-10-05");
  const w = mundo([otra, programada()]);
  const leer = w.deps.leerSemana;
  w.deps.leerSemana = async (s) => { if (s === "2026-10-05") throw new Error("plan.json inválido: piezas.0.hora"); return leer(s); };
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 1);
  assert.ok(w.avisos.some((a) => a.includes("2026-10-05") && a.includes("plan.json")));
  await tick(w.deps);
  assert.equal(w.avisos.filter((a) => a.includes("2026-10-05")).length, 1, "no repite el aviso en cada tick");
});

await checkAsync("tick: saltar escribe estado 'saltado' con motivo, registro y aviso; no vuelve a saltar", async () => {
  const w = mundo([semanaDe([lunes])]);
  await tick(w.deps);
  assert.deepEqual(w.estados.map((e) => [e.id, e.e.estado, e.e.motivo]), [[lunes.id, "saltado", "falta el render"]]);
  assert.equal(w.registro[0].tipo, "saltado");
  assert.ok(w.avisos.some((a) => a.includes("falta el render")));
  await tick(w.deps);
  assert.equal(w.estados.length, 1);
  assert.equal(w.meta.llamadas, 0);
});

await checkAsync("tick: modo aviso no hace POST y anota { tipo: 'aviso' } en el registro", async () => {
  const w = mundo([programada()], { modo: "aviso" });
  await tick(w.deps);
  assert.equal(w.meta.llamadas, 0);
  assert.ok(w.registro.some((l) => l.tipo === "aviso" && l.piezaId === lunes.id));
  assert.equal(w.registro.some((l) => l.tipo === "publicado"), false);
});

await checkAsync("tick: fallido → estado con el error traducido y sin el token de medios", async () => {
  const w = mundo([programada()]);
  // Error de Meta (código 100) que repite la URL de medios con el token.
  const { GraphError } = await import("../../src/meta/client.ts");
  w.meta.fallar = (c) => c.metodo === "post" ? { error: new GraphError("Consulta inválida: https://x/media/tok/2026/reel.mp4", 100) } : undefined;
  await tick(w.deps);
  const e = w.estados.find((x) => x.e.estado === "fallido")!;
  assert.ok(e);
  assert.ok(!e.e.motivo!.includes("/tok/"), e.e.motivo);
  assert.ok(e.e.motivo!.includes("***"));
  assert.ok(w.avisos.every((a) => !a.includes("/tok/")));
  assert.ok(w.registro.every((l) => !JSON.stringify(l).includes("/tok/")));
  assert.ok([...w.filas.values()].every((f) => !(f.error ?? "").includes("/tok/")));
});

await checkAsync("tick: story 60 min después y estado.story publicado", async () => {
  const w = mundo([programada()]);
  await tick(w.deps);
  w.reloj.t += 59 * 60_000;
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 1);
  w.reloj.t += 2 * 60_000;
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 2);
  const st = w.estados.find((e) => e.e.story)!;
  assert.equal(st.e.story?.estado, "publicado");
  assert.equal(w.filas.get(`2026-10-12/${lunes.id}|story`)?.paso, "publicado");
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 2);
});

await checkAsync("tick: estado.json viejo tras un git pull → la fila manda y se repara el estado, sin repost", async () => {
  const w = mundo([programada()]);
  await tick(w.deps);
  const s = (await w.deps.leerSemana("2026-10-12"))!;
  s.estado[lunes.id] = { estado: "programado" }; // pull trajo una versión vieja
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 1);
  assert.equal(s.estado[lunes.id].estado, "publicado");
});

await checkAsync("tick: al día siguiente (≥ 20 h) pide el permalink una vez y lo anota", async () => {
  const w = mundo([programada()]);
  await tick(w.deps);
  const mediaId = w.filas.get(`2026-10-12/${lunes.id}|post`)!.mediaId!;
  const get = w.deps.graph.get;
  let pedidos = 0;
  w.deps.graph = { ...w.deps.graph, get: async <T>(p: string, q?: Record<string, string | number | undefined>) => {
    if (p === mediaId) { pedidos++; return { id: mediaId, permalink: "https://www.instagram.com/reel/XYZ/" } as T; }
    return get<T>(p, q);
  } };
  w.reloj.t += 19 * 3_600_000;
  await tick(w.deps);
  assert.equal(pedidos, 0);
  w.reloj.t += 3_600_000 + 60_000;
  await tick(w.deps);
  assert.equal(pedidos, 1);
  assert.ok(w.estados.some((e) => e.e.permalink === "https://www.instagram.com/reel/XYZ/"));
  assert.ok(w.registro.some((l) => l.tipo === "permalink" && l.mediaId === mediaId));
  await tick(w.deps);
  assert.equal(pedidos, 1);
});

await checkAsync("tick: caída entre la fila 'publicado' y el registro → el siguiente tick anota la línea una sola vez", async () => {
  const w = mundo([programada()]);
  let falla = true;
  const anotar = w.deps.anotarRegistro;
  w.deps.anotarRegistro = async (l) => {
    if (falla && l.tipo === "publicado") { falla = false; throw new Error("ENOSPC"); }
    await anotar(l);
  };
  w.deps.leerRegistro = async () => [...w.registro];
  await tick(w.deps);
  assert.equal(w.registro.filter((l) => l.tipo === "publicado").length, 0);
  w.reloj.t += 60_000;
  await tick(w.deps);
  const lineas = w.registro.filter((l) => l.tipo === "publicado");
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].mediaId, w.filas.get(`2026-10-12/${lunes.id}|post`)!.mediaId);
  assert.equal(lineas[0].hookCategoria, lunes.hook.categoria);
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.equal(w.registro.filter((l) => l.tipo === "publicado").length, 1, "idempotente");
  assert.equal(w.meta.publicaciones, 1);
});

// R50 / I2: una pull con --autostash del bot no puede cruzarse con escrituras del scheduler.
await checkAsync("tick (R50): estado.json, registro.jsonl y su commit se escriben dentro de enSerie (publicado, story, permalink, salto, reparación)", async () => {
  const sinRender = piezaDe({ id: "mar-sin-render", dia: "2026-10-13", formato: "carrusel", borrador: "mar-sin-render.json" });
  const s = semanaDe([lunes, sinRender], { [lunes.id]: render() }, { [lunes.id]: { estado: "programado" } });
  const w = mundo([s]);
  let dentro = 0;
  const fuera: string[] = [];
  const llamadas: string[] = [];
  w.deps.enSerie = async (fn) => {
    dentro++;
    try {
      return await fn();
    } finally {
      dentro--;
    }
  };
  for (const k of ["escribirEstado", "anotarRegistro", "commit"] as const) {
    const orig = w.deps[k] as (...a: unknown[]) => Promise<unknown>;
    (w.deps as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
      llamadas.push(k);
      if (!dentro) fuera.push(k);
      return orig(...a);
    };
  }
  w.deps.leerRegistro = async () => [...w.registro];
  const get = w.deps.graph.get;
  w.deps.graph = { ...w.deps.graph, get: async <T>(p: string, q?: Record<string, string | number | undefined>) =>
    (/^m\d+$/.test(p) ? ({ id: p, permalink: "https://www.instagram.com/reel/R50/" } as T) : get<T>(p, q)) };
  await tick(w.deps); // publica
  w.reloj.t += 61 * 60_000;
  w.meta.reloj = w.reloj.t;
  await tick(w.deps); // story
  w.reloj.t = Date.parse("2026-10-13T23:00:00Z");
  w.meta.reloj = w.reloj.t;
  await tick(w.deps); // permalink del día siguiente + salto de la pieza sin render
  // Reparación: estado.json viejo traído por un pull.
  s.estado[lunes.id] = { estado: "programado" };
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.ok(llamadas.includes("escribirEstado") && llamadas.includes("anotarRegistro") && llamadas.includes("commit"));
  assert.ok(w.registro.some((l) => l.tipo === "permalink"), "precondición: hubo permalink");
  assert.ok(w.registro.some((l) => l.tipo === "saltado"), "precondición: hubo salto");
  assert.deepEqual(fuera, [], `escrituras fuera de la cadena serial: ${fuera.join(", ")}`);
});

await checkAsync("tick (R50): una línea `publicado` que se pierde DESPUÉS de anotarla (pull con autostash) se repara sin reiniciar el bot", async () => {
  const w = mundo([programada()]);
  w.deps.leerRegistro = async () => [...w.registro];
  await tick(w.deps);
  assert.equal(w.registro.filter((l) => l.tipo === "publicado").length, 1);
  // Un pull con autostash dejó registro.jsonl sin la línea (quedó solo en el stash).
  w.registro.splice(0, w.registro.length);
  for (let i = 0; i < 10; i++) {
    w.reloj.t += 60_000;
    await tick(w.deps);
  }
  assert.equal(w.registro.filter((l) => l.tipo === "publicado").length, 1, "a los 10 min, sin reiniciar, la línea vuelve");
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.equal(w.registro.filter((l) => l.tipo === "publicado").length, 1, "idempotente");
});

await checkAsync("tick: render fallido → a su hora saltado 'render fallido: <motivo>' con fila terminal", async () => {
  const w = mundo([semanaDe([lunes], { [lunes.id]: { estado: "fallido", motivo: "score 61 < 75", en: "2026-10-11T10:00:00Z" } })]);
  w.reloj.t -= 60_000;
  await tick(w.deps);
  assert.equal(w.estados.length, 0, "antes de la hora no se marca");
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.deepEqual(w.estados.map((e) => [e.e.estado, e.e.motivo]), [["saltado", "render fallido: score 61 < 75"]]);
  assert.equal(w.filas.get(`2026-10-12/${lunes.id}|post`)?.paso, "fallido");
});

await checkAsync("tick: R27 — saltado deja fila terminal antes de estado.json; un estado.json viejo no la revive", async () => {
  const w = mundo([semanaDe([lunes], {}, { [lunes.id]: { estado: "programado" } })]);
  await tick(w.deps);
  assert.ok(w.orden.indexOf("fila:fallido") < w.orden.indexOf("estado:saltado"));
  const s = (await w.deps.leerSemana("2026-10-12"))!;
  s.estado[lunes.id] = { estado: "programado" };
  s.render[lunes.id] = render();
  w.reloj.t += 5 * 60_000;
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 0);
  assert.equal(s.estado[lunes.id].estado, "saltado", "reparar restaura el salto");
});

await checkAsync("tick: publicando sin confirmar → reconsulta cada 15 min y a las 2 h avisa una vez y deja de consultar", async () => {
  const w = mundo([programada()]);
  w.meta.crear("c1", "PUBLISHED");
  w.filas.set(`2026-10-12/${lunes.id}|post`, { piezaId: `2026-10-12/${lunes.id}`, tipo: "post", paso: "publicando", containerId: "c1", intentos: 0, inicio: new Date(w.reloj.t).toISOString() });
  w.meta.fallar = (c) => c.metodo === "get" ? { error: new (class extends Error {})("ECONNRESET") } : undefined;
  let consultas = 0;
  const get = w.deps.graph.get;
  w.deps.graph = { ...w.deps.graph, get: async <T>(p: string, q?: Record<string, string | number | undefined>) => { consultas++; return get<T>(p, q); } };
  await tick(w.deps);
  assert.equal(consultas, 1);
  assert.equal(w.avisos.filter((a) => a.includes("no pude confirmar")).length, 1);
  w.reloj.t += 60_000;
  await tick(w.deps);
  assert.equal(consultas, 1, "no reconsulta antes de 15 min");
  for (let i = 0; i < 9; i++) { w.reloj.t += 15 * 60_000; await tick(w.deps); }
  const f = w.filas.get(`2026-10-12/${lunes.id}|post`)!;
  assert.equal(f.paso, "publicando");
  assert.equal(f.rendida, true);
  assert.equal(w.avisos.filter((a) => a.includes("Revisa en la app")).length, 1);
  const antes = consultas;
  w.reloj.t += 60 * 60_000;
  await tick(w.deps);
  assert.equal(consultas, antes, "no sigue consultando");
  assert.equal(w.meta.posts.length, 0);
  assert.equal(w.avisos.filter((a) => a.includes("no pude confirmar")).length, 1);
});

await checkAsync("tick: R20 — el mismo id en dos semanas se publica en ambas", async () => {
  const otra = piezaDe({ dia: "2026-10-19" });
  const s1 = programada();
  const s2 = semanaDe([otra], { [otra.id]: render() }, { [otra.id]: { estado: "programado" } }, "2026-10-19");
  const w = mundo([s1, s2]);
  await tick(w.deps);
  w.reloj.t = Date.parse("2026-10-19T22:30:00Z");
  await tick(w.deps);
  assert.equal(w.meta.postsA("/media_publish").length, 2);
  assert.ok(w.filas.has(`2026-10-12/${lunes.id}|post`) && w.filas.has(`2026-10-19/${lunes.id}|post`));
});

await checkAsync("tick: un error de avisar no imprime su mensaje (puede llevar el token del bot)", async () => {
  const w = mundo([programada()], { avisar: async () => { throw new Error("https://api.telegram.org/bot123:SECRETO/sendMessage"); } });
  const warn = console.warn;
  const vistos: string[] = [];
  console.warn = (...a: unknown[]) => { vistos.push(a.join(" ")); };
  try {
    await tick(w.deps);
  } finally {
    console.warn = warn;
  }
  assert.equal(w.meta.publicaciones, 1);
  assert.ok(vistos.length > 0);
  assert.ok(vistos.every((v) => !v.includes("SECRETO")));
});

await checkAsync("tick: R29 — URL caída ERROR ×4 → 3 reintentos a ~10 min, nunca después de hora + 30 min, fallido; la pieza vecina sale a su hora", async () => {
  const vecina = piezaDe({ id: "lun-reel-vecina", hora: "19:50", caption: "Otra pieza\n\n#ia" }); // 22:50Z
  const s = semanaDe([lunes, vecina], { [lunes.id]: render(), [vecina.id]: render() },
    { [lunes.id]: { estado: "programado" }, [vecina.id]: { estado: "programado" } });
  const w = mundo([s]);
  const hora = Date.parse("2026-10-12T22:30:00Z");
  const creados: { pieza: string; en: number }[] = [];
  const post = w.deps.graph.post;
  w.deps.graph = { ...w.deps.graph, post: async (p, q) => {
    const r = await post(p, q);
    if (p.endsWith("/media")) {
      const esVecina = String(q.video_url).includes(vecina.id);
      creados.push({ pieza: esVecina ? vecina.id : lunes.id, en: w.reloj.t });
      const c = w.meta.contenedores.get(String(r.id))!;
      if (esVecina) { c.cola = []; c.status = "FINISHED"; } else { c.cola = ["ERROR"]; c.status = "IN_PROGRESS"; }
    }
    return r;
  } };
  const publicadosEn: number[] = [];
  const pub = w.deps.graph.post;
  w.deps.graph = { ...w.deps.graph, post: async (p, q) => {
    const r = await pub(p, q);
    if (p.endsWith("/media_publish")) publicadosEn.push(w.reloj.t);
    return r;
  } };
  for (w.reloj.t = hora; w.reloj.t <= hora + 60 * 60_000; w.reloj.t += 60_000) await tick(w.deps);

  const intentos = creados.filter((c) => c.pieza === lunes.id).map((c) => (c.en - hora) / 60_000);
  assert.deepEqual(intentos, [0, 10, 20, 30], "1 intento + 3 reintentos espaciados 10 min");
  assert.ok(intentos.every((m) => m <= 30), "nunca después de hora + 30 min");
  const f = w.filas.get(`2026-10-12/${lunes.id}|post`)!;
  assert.equal(f.paso, "fallido");
  assert.equal(f.intentos, 4);
  const est = w.estados.filter((e) => e.id === lunes.id).at(-1)!;
  assert.equal(est.e.estado, "fallido", "fallido, no saltado (R29)");
  assert.match(est.e.motivo ?? "", /URL de medios/);
  // La vecina (22:50Z) se crea y publica en el mismo minuto de su hora.
  assert.deepEqual(creados.filter((c) => c.pieza === vecina.id).map((c) => (c.en - hora) / 60_000), [20]);
  assert.deepEqual(publicadosEn.map((t) => (t - hora) / 60_000), [20]);
  assert.equal(w.meta.publicaciones, 1);
});

await checkAsync("tick: R32 — status siempre FINISHED con un post manual de caption idéntico tras el inicio → no republica, queda publicando y avisa", async () => {
  const w = mundo([programada()]);
  const inicio = w.reloj.t;
  w.meta.crear("c1", "FINISHED", { caption: lunes.caption });
  w.meta.publicado("m-manual", "c9", lunes.caption, inicio + 20_000);
  w.filas.set(`2026-10-12/${lunes.id}|post`, {
    piezaId: `2026-10-12/${lunes.id}`, tipo: "post", paso: "publicando", containerId: "c1", intentos: 0,
    inicio: new Date(inicio).toISOString(),
  });
  for (let i = 0; i < 20; i++) { await tick(w.deps); w.reloj.t += 60_000; }
  assert.equal(w.meta.posts.length, 0, "ni adopta ni republica");
  assert.equal(w.meta.publicaciones, 0);
  const f = w.filas.get(`2026-10-12/${lunes.id}|post`)!;
  assert.equal(f.paso, "publicando");
  assert.equal(w.estados.some((e) => e.e.estado === "publicado"), false);
  const avisos = w.avisos.filter((a) => a.includes("no adivino"));
  assert.equal(avisos.length, 1, "avisa una vez");
});

await checkAsync("tick: un error de red al crear el contenedor no gana la ventana de +30 min de R29 (solo URL caída)", async () => {
  const w = mundo([programada()]);
  const { GraphError } = await import("../../src/meta/client.ts");
  const hora = w.reloj.t;
  const intentosEn: number[] = [];
  w.meta.fallar = (c) => {
    if (c.metodo !== "post") return undefined;
    if (c.path.endsWith("/media")) intentosEn.push(w.reloj.t);
    return { error: new GraphError("No pude conectar con la API de Meta (ECONNRESET).") };
  };
  for (w.reloj.t = hora + 13 * 60_000; w.reloj.t <= hora + 35 * 60_000; w.reloj.t += 60_000) await tick(w.deps);
  assert.ok(intentosEn.length >= 1, "hubo al menos el intento original");
  const tardios = intentosEn.filter((t) => t > hora + 15 * 60_000).map((t) => `+${(t - hora) / 60_000} min`);
  assert.deepEqual(tardios, [], "ningún intento de crear contenedor después de hora + 15 min");
  const f = w.filas.get(`2026-10-12/${lunes.id}|post`)!;
  assert.equal(f.paso, "fallido");
  assert.match(f.error ?? "", /sin tiempo|reintentos/);
  assert.equal(f.urlCaida, undefined);
});

await checkAsync("tick: R32 — media_publish siempre ambiguo, status siempre FINISHED y sin candidatos → exactamente 2 media_publish, sin importar los ticks", async () => {
  const w = mundo([programada()]);
  const { GraphError } = await import("../../src/meta/client.ts");
  let publishes = 0;
  w.meta.fallar = (c) => {
    if (c.metodo !== "post" || !c.path.endsWith("/media_publish")) return undefined;
    publishes++;
    return { error: new GraphError("No pude conectar con la API de Meta (ETIMEDOUT).") };
  };
  for (let i = 0; i < 6 * 60; i++) { await tick(w.deps); w.reloj.t += 60_000; }
  assert.equal(publishes, 2, "el original y un solo republish");
  assert.equal(w.meta.publicaciones, 0);
  const f = w.filas.get(`2026-10-12/${lunes.id}|post`)!;
  assert.equal(f.paso, "publicando");
  assert.equal(f.republicaciones, 1);
  assert.ok(w.avisos.some((a) => /no vuelvo a publicar/.test(a)), "avisa al admin");
});

// --- registro.ts y filas en SQLite (con KB_DIR temporal) ---

const tmp = mkdtempSync(join(tmpdir(), "kb-sched-"));
const prevKb = process.env.KB_DIR;
process.env.KB_DIR = tmp;
try {
  await checkAsync("registro: escribirEstado fusiona y conserva las otras piezas; publicado no retrocede", async () => {
    mkdirSync(join(tmp, "_calendario", "2026-10-12"), { recursive: true });
    const f = join(tmp, "_calendario", "2026-10-12", "estado.json");
    writeFileSync(f, JSON.stringify({ "otra-pieza": { estado: "saltado", motivo: "x" } }));
    await escribirEstado("2026-10-12", "lun-reel-x", { estado: "programado" });
    await escribirEstado("2026-10-12", "lun-reel-x", { estado: "publicado", mediaId: "m1", publicadoEn: "2026-10-12T22:31:00Z" });
    await escribirEstado("2026-10-12", "lun-reel-x", { estado: "saltado", motivo: "tarde" });
    await escribirEstado("2026-10-12", "lun-reel-x", { story: { estado: "publicado", mediaId: "s1" } });
    const j = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(j["otra-pieza"].estado, "saltado");
    assert.equal(j["lun-reel-x"].estado, "publicado");
    assert.equal(j["lun-reel-x"].mediaId, "m1");
    assert.equal(j["lun-reel-x"].story.mediaId, "s1");
    await assert.rejects(escribirEstado("2026-10-12", "../x", { estado: "saltado" }));
    await assert.rejects(escribirEstado("../..", "lun-reel-x", { estado: "saltado" }));
  });
  await checkAsync("registro: anotarRegistro agrega una línea JSON por llamada", async () => {
    await anotarRegistro({ tipo: "publicado", piezaId: "a" });
    await anotarRegistro({ tipo: "saltado", piezaId: "b" });
    const lineas = readFileSync(join(tmp, "_calendario", "registro.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lineas.map((l) => l.piezaId), ["a", "b"]);
  });
  await checkAsync("scheduler: filas en SQLite ida y vuelta (children, inicio de 'publicando')", async () => {
    const ahora = new Date("2026-10-12T22:40:00Z");
    guardarFilaDb({ piezaId: "p1", tipo: "post", paso: "hijos", children: ["a", "b"], intentos: 1, error: "x" }, ahora);
    guardarFilaDb({ piezaId: "p2", tipo: "story", paso: "publicando", containerId: "c1", intentos: 0, inicio: "2026-10-12T22:31:00.000Z" }, ahora);
    const filas = cargarFilasDb();
    const p1 = filas.find((f) => f.piezaId === "p1")!;
    assert.deepEqual(p1.children, ["a", "b"]);
    assert.equal(p1.intentos, 1);
    assert.equal(p1.error, "x");
    const p2 = filas.find((f) => f.piezaId === "p2")!;
    assert.equal(p2.tipo, "story");
    assert.equal(p2.inicio, "2026-10-12T22:31:00.000Z");
    guardarFilaDb({ ...p1, paso: "publicado", mediaId: "m1", children: ["a", "b", "c"], error: undefined }, ahora);
    const p1b = cargarFilasDb().find((f) => f.piezaId === "p1")!;
    assert.equal(p1b.paso, "publicado");
    assert.equal(p1b.error, undefined);
  });
} finally {
  closeDb();
  if (prevKb === undefined) delete process.env.KB_DIR;
  else process.env.KB_DIR = prevKb;
  rmSync(tmp, { recursive: true, force: true });
}
