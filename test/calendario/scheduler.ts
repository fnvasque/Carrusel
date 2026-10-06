import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { tareasDebidas, tick, cargarFilasDb, guardarFilaDb, type SchedulerDeps } from "../../src/calendario/scheduler.ts";
import { anotarRegistro, escribirEstado } from "../../src/calendario/registro.ts";
import type { Fila } from "../../src/calendario/publish.ts";
import type { EstadoEntry, Pieza, RenderEntry, SemanaLeida } from "../../src/calendario/plan.ts";
import { closeDb } from "../../src/kb/db.ts";
import { MetaFalso, IG, mediosReel, piezaDe } from "./publish.ts";
// Los módulos hermanos con top-level await corren en paralelo: este archivo cambia
// KB_DIR y abre SQLite, igual que test/calendario/plan.ts. Importarlo lo vuelve
// dependencia, así que termina antes de que empiece este.
import "./plan.ts";

const Z = (s: string): Date => new Date(s);
const render = (medios = mediosReel): RenderEntry => ({ estado: "renderizado", medios, en: "2026-10-11T10:00:00Z" });

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
  ({ piezaId: lunes.id, tipo, paso, intentos: 0, ...extra });

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
  const pub: Fila = { piezaId: p.id, tipo: "post", paso: "publicado", mediaId: "m1", intentos: 0 };
  assert.equal(tareasDebidas(s, [pub], Z("2026-09-06T04:31:00Z"), false).publicar.length, 0);
});

check("scheduler: fin del horario de verano (sábado 2026-04-04 23:30 se repite) → una sola hora, la primera", () => {
  const p = piezaDe({ id: "sab-reel-prueba", dia: "2026-04-04", hora: "23:30" });
  const s = [semanaDe([p], { [p.id]: render() }, {}, "2026-03-30")];
  const r = tareasDebidas(s, [], Z("2026-04-05T02:30:00Z"), false);
  assert.equal(r.publicar.length, 1);
  const pub: Fila = { piezaId: p.id, tipo: "post", paso: "publicado", mediaId: "m1", intentos: 0 };
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

check("scheduler: fila en esperando o publicando → aparece aunque ya pasaron 15 min (se termina)", () => {
  const s = [programada()];
  for (const paso of ["esperando", "publicando"] as const) {
    const r = tareasDebidas(s, [fila(paso, "post", { containerId: "c1" })], Z("2026-10-12T23:30:00Z"), false);
    assert.equal(r.publicar.length, 1, paso);
    assert.equal(r.saltar.length, 0, paso);
  }
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
    mediaToken: "tok",
    ...extra,
  };
  return { deps, meta, avisos, estados, registro, commits, orden, filas, claves, reloj };
}

await checkAsync("tick: publica la pieza debida, persiste la fila antes del commit y anota el registro con los campos de T3", async () => {
  const w = mundo([programada()]);
  await tick(w.deps);
  assert.equal(w.meta.publicaciones, 1);
  const f = w.filas.get(`${lunes.id}|post`)!;
  assert.equal(f.paso, "publicado");
  const pub = w.estados.find((e) => e.e.estado === "publicado")!;
  assert.equal(pub.e.mediaId, f.mediaId);
  assert.ok(pub.e.publicadoEn);
  const linea = w.registro.find((l) => l.tipo === "publicado")!;
  assert.deepEqual(Object.keys(linea).sort(),
    ["duracionMs", "mediaId", "nombreMotor", "piezaId", "predictedScore", "publicadoEn", "semana", "tipo"].sort());
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
  assert.equal(w.filas.get(`${lunes.id}|story`)?.paso, "publicado");
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
  const mediaId = w.filas.get(`${lunes.id}|post`)!.mediaId!;
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
