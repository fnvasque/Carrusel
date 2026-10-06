import assert from "node:assert/strict";
import { check, checkAsync } from "../_check.ts";
import {
  avisoRenderPendiente, avisosPostPublicacion, callbackSaltar, formatPreview, formatSemana, idDesdeArgumento, leerCallbackSaltar,
  modoCalendario, ordenesDesde, porProgramar, publicadas, recordatorioLunes, silencioCalendario, TELEGRAM_CAPTION_MAX,
} from "../../src/calendario/telegram.ts";
import { ORDEN_PUBLICAR, ORDEN_SALTAR, ordenesVencidas, tareasDebidas, tick, type SchedulerDeps } from "../../src/calendario/scheduler.ts";
import type { Fila } from "../../src/calendario/publish.ts";
import type { EstadoEntry, Medios, Pieza, RenderEntry, SemanaLeida } from "../../src/calendario/plan.ts";
import { onlineFollowersDisponible, PUBLISH_SCOPES, scopesRequeridos, REQUIRED_SCOPES, DM_SCOPES } from "../../src/meta/check.ts";

const Z = (s: string): Date => new Date(s);

function pieza(extra: Partial<Pieza> = {}): Pieza {
  return {
    id: "lun-reel-agentes", dia: "2026-10-12", hora: "08:00", formato: "reel",
    arquetipo: "tutorial", senal: "guardados", tema: "[[IA]]", pilar: "herramienta",
    hook: { categoria: "curiosidad", texto: "Deja de copiar y pegar", score: 9 }, emocion: "alivio",
    entregable: "x", fraseAmigo: "x", lectorFrio: { intentos: 1, resultado: "ok", notas: "" },
    origen: { fichas: [], referencias: [] }, derivadoDe: null,
    caption: "Primera línea con la keyword\n\n#ia #claudecode",
    borrador: "lun-reel-agentes.json", estado: "planificado", ...extra,
  };
}
const BASE = "https://m.ejemplo.cl/media/SECRETO/2026-10-12/lun-reel-agentes";
const medios: Medios = { urls: [`${BASE}/reel.mp4`], cover: `${BASE}/cover.jpg`, story: `${BASE}/story.jpg` };
const rend = (m: Medios = medios): RenderEntry => ({ estado: "renderizado", medios: m, en: "2026-10-11T10:00:00Z" });

function semana(piezas: Pieza[], render: Record<string, RenderEntry> = {}, estado: Record<string, EstadoEntry> = {}, s = "2026-10-12"): SemanaLeida {
  return { semana: s, plan: { semana: s, zona: "America/Santiago", experimento: null, piezas }, render, estado };
}

// --- formatPreview ---

check("telegram: preview con portada, hora y caption; foto = cover del reel", () => {
  const p = formatPreview(pieza(), medios);
  assert.equal(p.foto, `${BASE}/cover.jpg`);
  assert.match(p.caption, /lun 12\/10 08:00/i);
  assert.match(p.caption, /reel/);
  assert.match(p.caption, /Primera línea con la keyword/);
  assert.ok(!p.caption.includes("SECRETO"));
});

check("telegram: preview de carrusel usa la primera imagen; reel sin cover usa la story", () => {
  const c = formatPreview(pieza({ formato: "carrusel" }), { urls: [`${BASE}/01.jpg`, `${BASE}/02.jpg`] });
  assert.equal(c.foto, `${BASE}/01.jpg`);
  assert.equal(formatPreview(pieza(), { urls: [`${BASE}/reel.mp4`], story: `${BASE}/story.jpg` }).foto, `${BASE}/story.jpg`);
  assert.equal(formatPreview(pieza(), { urls: [`${BASE}/reel.mp4`] }).foto, "");
});

check("telegram: preview truncado con … a 1024 caracteres", () => {
  const p = formatPreview(pieza({ caption: "a".repeat(5000) }), medios);
  assert.equal(TELEGRAM_CAPTION_MAX, 1024);
  assert.equal(p.caption.length, 1024);
  assert.ok(p.caption.endsWith("…"));
  const corto = formatPreview(pieza(), medios);
  assert.ok(!corto.caption.endsWith("…"));
});

// --- avisoRenderPendiente ---

check("telegram: render pendiente — sábado 11:59 no, 12:00 sí (semana siguiente con piezas sin render)", () => {
  const s = [semana([pieza({ hora: "14:00" })])];
  assert.equal(avisoRenderPendiente(s, Z("2026-10-10T14:59:00Z")), undefined); // sáb 11:59 Chile (UTC-3)
  const a = avisoRenderPendiente(s, Z("2026-10-10T15:00:00Z"));
  assert.ok(a);
  assert.match(a.texto, /Prende el Mac: faltan 1 piezas? por renderizar/);
  assert.equal(a.clave, "2026-10-12:sabado");
});

check("telegram: render pendiente — primera pieza lun 08:00 → aviso el domingo 20:00 si aún falta", () => {
  const s = [semana([pieza()])];
  // El aviso del sábado ya salió: el de 12 h antes es otro.
  const ya = ["2026-10-12:sabado"];
  assert.equal(avisoRenderPendiente(s, Z("2026-10-11T22:59:00Z"), ya), undefined); // dom 19:59
  const a = avisoRenderPendiente(s, Z("2026-10-11T23:00:00Z"), ya); // dom 20:00
  assert.ok(a);
  assert.equal(a.clave, "2026-10-12:12h");
  // Ya renderizada: no avisa.
  assert.equal(avisoRenderPendiente([semana([pieza()], { [pieza().id]: rend() })], Z("2026-10-11T23:00:00Z"), ya), undefined);
});

check("telegram: render pendiente — no avisa dos veces la misma semana (yaAvisado)", () => {
  const s = [semana([pieza({ hora: "14:00" })])];
  const ahora = Z("2026-10-10T16:00:00Z");
  const a = avisoRenderPendiente(s, ahora);
  assert.ok(a);
  assert.equal(avisoRenderPendiente(s, ahora, [a.clave]), undefined);
});

check("telegram: render pendiente — ignora piezas cuya hora pasó, renderizadas, saltadas o semanas vacías", () => {
  const ahora = Z("2026-10-12T15:00:00Z"); // lun 12:00
  assert.equal(avisoRenderPendiente([semana([pieza()])], ahora), undefined); // lun 08:00 ya pasó
  const saltada = semana([pieza({ hora: "20:00" })], {}, { "lun-reel-agentes": { estado: "saltado" } });
  assert.equal(avisoRenderPendiente([saltada], ahora), undefined);
  assert.equal(avisoRenderPendiente([semana([])], ahora), undefined);
});

// --- recordatorioLunes ---

check("telegram: recordatorio del lunes ≥ 09:00 local, una vez por semana", () => {
  assert.equal(recordatorioLunes(Z("2026-10-12T11:59:00Z")), false); // lun 08:59
  assert.equal(recordatorioLunes(Z("2026-10-12T12:00:00Z")), true); // lun 09:00
  assert.equal(recordatorioLunes(Z("2026-10-12T20:00:00Z"), "2026-10-12"), false);
  assert.equal(recordatorioLunes(Z("2026-10-12T20:00:00Z"), "2026-10-05"), true);
  assert.equal(recordatorioLunes(Z("2026-10-13T12:00:00Z"), "2026-10-05"), false); // martes
});

// --- silencioCalendario ---

check("telegram: silencio — domingo 12:00 sin carpeta del lunes siguiente → texto; con carpeta → nada", () => {
  assert.equal(silencioCalendario([], Z("2026-10-11T14:59:00Z")), undefined); // dom 11:59
  const t = silencioCalendario(["2026-10-05"], Z("2026-10-11T15:00:00Z"));
  assert.ok(t);
  assert.match(t, /2026-10-12/);
  // La carpeta existe aunque el plan venga con piezas: [] (latido del agente).
  assert.equal(silencioCalendario(["2026-10-05", "2026-10-12"], Z("2026-10-11T15:00:00Z")), undefined);
  assert.equal(silencioCalendario([], Z("2026-10-10T15:00:00Z")), undefined); // sábado
});

// --- idDesdeArgumento ---

check("telegram: idDesdeArgumento acepta id exacto, semana/id o prefijo único", () => {
  const s = [semana([pieza(), pieza({ id: "mar-carrusel-guia", dia: "2026-10-13" }), pieza({ id: "mar-carrusel-mito", dia: "2026-10-13" })])];
  assert.deepEqual(idDesdeArgumento("lun-reel-agentes", s), { semana: "2026-10-12", id: "lun-reel-agentes" });
  assert.deepEqual(idDesdeArgumento("  lun ", s), { semana: "2026-10-12", id: "lun-reel-agentes" });
  assert.deepEqual(idDesdeArgumento("2026-10-12/mar-carrusel-guia", s), { semana: "2026-10-12", id: "mar-carrusel-guia" });
  assert.equal(idDesdeArgumento("mar-carrusel", s), undefined); // ambiguo
  assert.equal(idDesdeArgumento("nada", s), undefined);
  assert.equal(idDesdeArgumento("", s), undefined);
  assert.equal(idDesdeArgumento("../../etc", s), undefined);
  assert.equal(idDesdeArgumento("2026-10-19/lun-reel-agentes", s), undefined); // semana fuera de la lista
});

check("telegram: idDesdeArgumento con el mismo id en dos semanas exige semana/id", () => {
  const s = [semana([pieza()]), semana([pieza({ dia: "2026-10-19" })], {}, {}, "2026-10-19")];
  assert.equal(idDesdeArgumento("lun-reel-agentes", s), undefined);
  assert.deepEqual(idDesdeArgumento("2026-10-19/lun-reel-agentes", s), { semana: "2026-10-19", id: "lun-reel-agentes" });
});

// --- callback Saltar ---

check("telegram: callback cal-saltar cabe en 64 bytes y se lee de vuelta", () => {
  const s = semana([pieza(), pieza({ id: "x".repeat(70) })]);
  const corto = callbackSaltar("2026-10-12", "lun-reel-agentes", s);
  assert.equal(corto, "cal-saltar:2026-10-12:lun-reel-agentes");
  const largo = callbackSaltar("2026-10-12", "x".repeat(70), s);
  assert.ok(Buffer.byteLength(largo) <= 64);
  assert.deepEqual(leerCallbackSaltar(corto, [s]), { semana: "2026-10-12", id: "lun-reel-agentes" });
  assert.deepEqual(leerCallbackSaltar(largo, [s]), { semana: "2026-10-12", id: "x".repeat(70) });
  assert.equal(leerCallbackSaltar("cal-saltar:2026-10-12:otra", [s]), undefined);
  assert.equal(leerCallbackSaltar("cal-saltar:2026-10-12:#9", [s]), undefined);
  assert.equal(leerCallbackSaltar("cal-saltar:../x:lun-reel-agentes", [s]), undefined);
});

// --- formatSemana ---

check("telegram: /calendario — una línea por pieza con día, hora, formato, estado y emoji", () => {
  const s = semana(
    [pieza(), pieza({ id: "mar-carrusel-guia", dia: "2026-10-13", hora: "14:00", formato: "carrusel" }), pieza({ id: "mie-reel-x", dia: "2026-10-14" })],
    { "mar-carrusel-guia": rend() },
    { "lun-reel-agentes": { estado: "publicado", mediaId: "1", publicadoEn: "2026-10-12T11:00:00Z" } },
  );
  const t = formatSemana(s, Z("2026-10-12T15:00:00Z"));
  const lineas = t.split("\n").filter((l) => /lun-reel|mar-carrusel|mie-reel/.test(l));
  assert.equal(lineas.length, 3);
  assert.match(lineas[0], /✅.*lun 12\/10 08:00.*reel.*lun-reel-agentes.*publicado/i);
  assert.match(lineas[1], /mar 13\/10 14:00.*carrusel.*renderizado/i);
  assert.match(lineas[2], /planificado/);
  assert.match(t, /2026-10-12/);
});

check("telegram: /calendario — semana sin piezas muestra el motivo", () => {
  const s = semana([]);
  s.plan.motivo = "nada publicable";
  assert.match(formatSemana(s, Z("2026-10-12T15:00:00Z")), /sin piezas.*nada publicable/i);
});

// --- avisos post-publicación ---

check("telegram: aviso post-publicación a los 2 min, una vez, ignora aviso-* y lo viejo", () => {
  const est = (publicadoEn: string, mediaId = "17900"): Record<string, EstadoEntry> =>
    ({ "lun-reel-agentes": { estado: "publicado", mediaId, publicadoEn } });
  const s = (e: Record<string, EstadoEntry>) => [semana([pieza()], {}, e)];
  const pub = "2026-10-12T11:00:00.000Z";
  assert.deepEqual(avisosPostPublicacion(s(est(pub)), Z("2026-10-12T11:01:59Z"), []), []);
  const a = avisosPostPublicacion(s(est(pub)), Z("2026-10-12T11:02:00Z"), []);
  assert.deepEqual(a, [{ clave: "2026-10-12/lun-reel-agentes", semana: "2026-10-12", id: "lun-reel-agentes", mediaId: "17900" }]);
  assert.deepEqual(avisosPostPublicacion(s(est(pub)), Z("2026-10-12T11:03:00Z"), ["2026-10-12/lun-reel-agentes"]), []);
  assert.deepEqual(avisosPostPublicacion(s(est(pub, "aviso-lun")), Z("2026-10-12T11:03:00Z"), []), []);
  assert.deepEqual(avisosPostPublicacion(s(est(pub)), Z("2026-10-12T12:30:00Z"), []), []); // pasó la primera hora
});

// --- CALENDARIO_MODO ---

check("telegram: CALENDARIO_MODO auto/aviso; sin variable undefined; otro valor lanza con mensaje claro", () => {
  assert.equal(modoCalendario(undefined), undefined);
  assert.equal(modoCalendario(""), undefined);
  assert.equal(modoCalendario(" auto "), "auto");
  assert.equal(modoCalendario("aviso"), "aviso");
  assert.throws(() => modoCalendario("publicar"), /CALENDARIO_MODO.*auto.*aviso/);
});

// --- órdenes (/publicar y /saltar pasan por el tick) ---

check("telegram: ordenesDesde lee publicar:/saltar: de calendario_estado por pieza", () => {
  const s = [semana([pieza(), pieza({ id: "mar-carrusel-guia" })])];
  const claves: Record<string, string> = {
    "publicar:2026-10-12/lun-reel-agentes": "2026-10-11T12:00:00.000Z",
    "saltar:2026-10-12/mar-carrusel-guia": "2026-10-11T12:00:00.000Z",
    "publicar:2026-10-12/mar-carrusel-guia": "basura",
  };
  const o = ordenesDesde(s, (k) => claves[k]);
  assert.deepEqual(Object.keys(o.forzar), ["2026-10-12/lun-reel-agentes"]);
  assert.equal(o.forzar["2026-10-12/lun-reel-agentes"].toISOString(), "2026-10-11T12:00:00.000Z");
  assert.deepEqual([...o.saltar], ["2026-10-12/mar-carrusel-guia"]);
});

const prog = (): SemanaLeida => semana([pieza({ hora: "19:30" })], { "lun-reel-agentes": rend() }, { "lun-reel-agentes": { estado: "programado" } });
const CL = "2026-10-12/lun-reel-agentes";

check("scheduler: orden publicar → debida ahora (antes de su hora) con hora = la orden, solo 15 min", () => {
  const orden = Z("2026-10-11T12:00:00Z");
  const o = { forzar: { [CL]: orden }, saltar: new Set<string>() };
  const r = tareasDebidas([prog()], [], Z("2026-10-11T12:00:30Z"), false, o);
  assert.equal(r.publicar.length, 1);
  assert.equal(r.publicar[0].hora.toISOString(), orden.toISOString());
  // Vencida la orden: nada (la pieza sigue esperando su hora; no se salta).
  const v = tareasDebidas([prog()], [], Z("2026-10-11T12:16:00Z"), false, o);
  assert.equal(v.publicar.length + v.saltar.length, 0);
  // En pausa: nada.
  assert.equal(tareasDebidas([prog()], [], Z("2026-10-11T12:00:30Z"), true, o).publicar.length, 0);
});

check("scheduler: orden publicar exige estado programado con render", () => {
  const o = { forzar: { [CL]: Z("2026-10-11T12:00:00Z") }, saltar: new Set<string>() };
  const ahora = Z("2026-10-11T12:01:00Z");
  const soloRender = semana([pieza({ hora: "19:30" })], { "lun-reel-agentes": rend() });
  assert.equal(tareasDebidas([soloRender], [], ahora, false, o).publicar.length, 0);
  const sinRender = semana([pieza({ hora: "19:30" })], {}, { "lun-reel-agentes": { estado: "programado" } });
  assert.equal(tareasDebidas([sinRender], [], ahora, false, o).publicar.length, 0);
  const publicada: Fila = { piezaId: CL, tipo: "post", paso: "publicado", mediaId: "m", intentos: 0 };
  assert.equal(tareasDebidas([prog()], [publicada], ahora, false, o).publicar.length, 0);
});

check("scheduler: un contenedor de /publicar en espera se retoma con la hora de la orden", () => {
  const orden = Z("2026-10-11T12:00:00Z");
  const o = { forzar: { [CL]: orden }, saltar: new Set<string>() };
  const esperando: Fila = { piezaId: CL, tipo: "post", paso: "esperando", containerId: "c1", intentos: 0 };
  const r = tareasDebidas([prog()], [esperando], Z("2026-10-11T12:05:00Z"), false, o);
  assert.equal(r.publicar.length, 1);
  assert.equal(r.publicar[0].hora.toISOString(), orden.toISOString());
});

check("scheduler: orden saltar → salto 'saltada a mano' (nunca si está publicando o cerrada)", () => {
  const o = { forzar: {}, saltar: new Set([CL]) };
  const r = tareasDebidas([prog()], [], Z("2026-10-11T12:00:00Z"), false, o);
  assert.deepEqual(r.saltar.map((x) => [x.id, x.motivo, x.tipo]), [["lun-reel-agentes", "saltada a mano", "post"]]);
  assert.equal(r.publicar.length, 0);
  // A la hora, con la orden: se salta y no se publica.
  const h = tareasDebidas([prog()], [], Z("2026-10-12T22:30:00Z"), false, o);
  assert.equal(h.publicar.length, 0);
  assert.equal(h.saltar.length, 1);
  const publicando: Fila = { piezaId: CL, tipo: "post", paso: "publicando", containerId: "c", intentos: 0 };
  assert.equal(tareasDebidas([prog()], [publicando], Z("2026-10-12T22:31:00Z"), false, o).saltar.length, 0);
  const cerrada = semana([pieza({ hora: "19:30" })], {}, { "lun-reel-agentes": { estado: "publicado" } });
  assert.equal(tareasDebidas([cerrada], [], Z("2026-10-12T22:31:00Z"), false, o).saltar.length, 0);
});

// --- meta:check ---

check("meta:check: instagram_content_publish requerido solo con CALENDARIO_MODO", () => {
  assert.deepEqual(PUBLISH_SCOPES, ["instagram_content_publish"]);
  assert.deepEqual(scopesRequeridos({}), REQUIRED_SCOPES);
  assert.ok(scopesRequeridos({ CALENDARIO_MODO: "aviso" }).includes("instagram_content_publish"));
  assert.ok(!scopesRequeridos({ CALENDARIO_MODO: "  " }).includes("instagram_content_publish"));
  const ambos = scopesRequeridos({ CALENDARIO_MODO: "auto", META_WEBHOOK_VERIFY_TOKEN: "x" });
  for (const s of [...DM_SCOPES, ...PUBLISH_SCOPES]) assert.ok(ambos.includes(s));
});

check("meta:check: online_followers disponible solo si trae valores", () => {
  assert.equal(onlineFollowersDisponible({ data: [{ values: [{ value: { "0": 3 } }] }] }), true);
  assert.equal(onlineFollowersDisponible({ data: [{ values: [] }] }), false);
  assert.equal(onlineFollowersDisponible({ data: [{ values: [{ value: {} }] }] }), false);
  assert.equal(onlineFollowersDisponible({ data: [] }), false);
  assert.equal(onlineFollowersDisponible(undefined), false);
});

check("scheduler: orden de /publicar vencida sin empezar se borra; empezada se conserva", () => {
  const o = { forzar: { [CL]: Z("2026-10-11T12:00:00Z") }, saltar: new Set<string>() };
  assert.deepEqual(ordenesVencidas(o, [], Z("2026-10-11T12:14:00Z")), []);
  assert.deepEqual(ordenesVencidas(o, [], Z("2026-10-11T12:15:00Z")), [CL]);
  const inicio: Fila = { piezaId: CL, tipo: "post", paso: "inicio", intentos: 0 };
  assert.deepEqual(ordenesVencidas(o, [inicio], Z("2026-10-11T12:20:00Z")), [CL]);
  const esperando: Fila = { piezaId: CL, tipo: "post", paso: "esperando", containerId: "c", intentos: 0 };
  assert.deepEqual(ordenesVencidas(o, [esperando], Z("2026-10-11T12:20:00Z")), []);
});

check("scheduler: sin orden, el post que empezó a su hora usa la hora del plan", () => {
  const esperando: Fila = { piezaId: CL, tipo: "post", paso: "esperando", containerId: "c", intentos: 0 };
  const r = tareasDebidas([prog()], [esperando], Z("2026-10-12T22:35:00Z"), false);
  assert.equal(r.publicar[0].hora.toISOString(), "2026-10-12T22:30:00.000Z");
});

check("telegram: porProgramar — renderizadas sin estado y con hora futura; nada más", () => {
  const s = semana(
    [pieza({ hora: "20:00" }), pieza({ id: "ya-programada", hora: "20:00" }), pieza({ id: "ya-paso", hora: "07:00" }), pieza({ id: "sin-render", hora: "20:00" })],
    { "lun-reel-agentes": rend(), "ya-programada": rend(), "ya-paso": rend() },
    { "ya-programada": { estado: "programado" } },
  );
  const r = porProgramar([s], Z("2026-10-12T15:00:00Z"));
  assert.deepEqual(r.map((x) => x.pieza.id), ["lun-reel-agentes"]);
  assert.equal(r[0].medios.cover, medios.cover);
});

check("telegram: publicadas — solo estado publicado con fecha", () => {
  const s = semana([], {}, {
    a: { estado: "publicado", publicadoEn: "2026-10-12T11:00:00Z" }, b: { estado: "publicado" }, c: { estado: "saltado" },
  });
  assert.deepEqual(publicadas([s]), [{ semana: "2026-10-12", id: "a", publicadoEn: "2026-10-12T11:00:00Z" }]);
});

// --- tick con órdenes (modo aviso: sin Meta) ---

function mundoAviso(semanas: SemanaLeida[], ahora: Date) {
  const filas = new Map<string, Fila>();
  const claves = new Map<string, string>();
  const avisos: string[] = [];
  const deps: SchedulerDeps = {
    graph: { get: async () => { throw new Error("sin Meta"); }, post: async () => { throw new Error("sin Meta"); } },
    igUserId: "ig", modo: "aviso", ahora: () => ahora, dormir: async () => {},
    avisar: async (t) => { avisos.push(t); }, tokenOk: async () => true,
    listarSemanas: async () => semanas.map((x) => x.semana),
    leerSemana: async (x) => semanas.find((y) => y.semana === x),
    cargarFilas: () => [...filas.values()].map((f) => structuredClone(f)),
    guardarFila: (f) => { filas.set(`${f.piezaId}|${f.tipo}`, structuredClone(f)); },
    leerClave: (k) => claves.get(k), guardarClave: (k, v) => { claves.set(k, v); },
    escribirEstado: async (sem, id, e) => {
      const x = semanas.find((y) => y.semana === sem)!;
      x.estado[id] = { ...x.estado[id], ...e } as EstadoEntry;
    },
    anotarRegistro: async () => {}, commit: async () => {}, leerBorrador: async () => ({}),
  };
  return { deps, filas, claves, avisos };
}

await checkAsync("tick: orden de /publicar se consume en el tick (modo aviso), antes de la hora del plan", async () => {
  const ahora = Z("2026-10-11T12:00:30Z"); // domingo; la pieza es el lunes 19:30
  const s = prog();
  const w = mundoAviso([s], ahora);
  await tick(w.deps);
  assert.equal(w.filas.size, 0, "sin orden no hace nada");
  w.claves.set(ORDEN_PUBLICAR + CL, "2026-10-11T12:00:00.000Z");
  await tick(w.deps);
  assert.equal(w.filas.get(`${CL}|post`)?.paso, "publicado");
  assert.equal(s.estado["lun-reel-agentes"].estado, "publicado");
  assert.ok(w.avisos.some((a) => /Modo aviso/.test(a)));
});

await checkAsync("tick: orden de /saltar deja la fila terminal y el estado saltado", async () => {
  const s = prog();
  const w = mundoAviso([s], Z("2026-10-11T12:00:00Z"));
  w.claves.set(ORDEN_SALTAR + CL, "2026-10-11T12:00:00.000Z");
  await tick(w.deps);
  assert.equal(w.filas.get(`${CL}|post`)?.paso, "fallido");
  assert.equal(s.estado["lun-reel-agentes"].estado, "saltado");
  assert.equal(s.estado["lun-reel-agentes"].motivo, "saltada a mano");
});
