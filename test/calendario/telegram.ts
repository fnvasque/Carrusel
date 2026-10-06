import assert from "node:assert/strict";
import { check, checkAsync } from "../_check.ts";
import {
  avisoRenderPendiente, avisosPostPublicacion, callbackSaltar, formatPreview, formatSemana, idDesdeArgumento, leerCallbackSaltar,
  archivoDeUrl, argsPreview, modoCalendario, ordenesDesde, previewsPendientes, publicadas, recordatorioLunes, rutaMedioLocal, semanasConPlan,
  silencioCalendario, TELEGRAM_CAPTION_MAX, truncar,
} from "../../src/calendario/telegram.ts";
import { empezado, ORDEN_PUBLICAR, ORDEN_SALTAR, ordenesVencidas, tareasDebidas, tick, type SchedulerDeps } from "../../src/calendario/scheduler.ts";
import type { Fila } from "../../src/calendario/publish.ts";
import { nombreDeArchivo, type EstadoEntry, type MediosRender, type Pieza, type RenderEntry, type SemanaLeida } from "../../src/calendario/plan.ts";
import { mensajeOnlineFollowers, onlineFollowersDisponible, PUBLISH_SCOPES, scopesRequeridos, REQUIRED_SCOPES, DM_SCOPES } from "../../src/meta/check.ts";

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
// R48: render.json trae nombres de archivo, no URLs.
const medios: MediosRender = { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg" };
const rend = (m: MediosRender = medios): RenderEntry => ({ estado: "renderizado", medios: m, en: "2026-10-11T10:00:00Z" });

function semana(piezas: Pieza[], render: Record<string, RenderEntry> = {}, estado: Record<string, EstadoEntry> = {}, s = "2026-10-12"): SemanaLeida {
  return { semana: s, plan: { semana: s, zona: "America/Santiago", experimento: null, piezas }, render, estado };
}

// --- formatPreview ---

check("telegram: preview con caption (día, hora, formato) y el NOMBRE del archivo de la portada del reel", () => {
  const p = formatPreview(pieza(), medios);
  assert.equal(p.archivo, "cover.jpg");
  assert.match(p.caption, /lun 12\/10 08:00/i);
  assert.match(p.caption, /reel/);
  assert.match(p.caption, /Primera línea con la keyword/);
});

check("telegram: preview de carrusel usa la primera imagen; reel sin cover usa la story; sin nada, ''", () => {
  const c = formatPreview(pieza({ formato: "carrusel" }), { archivos: ["01.jpg", "02.jpg"] });
  assert.equal(c.archivo, "01.jpg");
  assert.equal(formatPreview(pieza(), { archivos: ["reel.mp4"], story: "story.jpg" }).archivo, "story.jpg");
  assert.equal(formatPreview(pieza(), { archivos: ["reel.mp4"] }).archivo, "");
  // Un nombre inseguro en render.json no sale de la carpeta de la pieza.
  assert.equal(formatPreview(pieza(), { archivos: ["reel.mp4"], cover: "../secreto.jpg" }).archivo, "");
});

check("telegram (R44): nada de formatPreview ni de lo que va a sendPhoto contiene el token de medios", () => {
  // Formato viejo de render.json (URLs con el token) leído por leerSemana: queda como nombres.
  const viejo = { archivos: [`${BASE}/01.jpg`].map(nombreDeArchivo), story: nombreDeArchivo(`${BASE}/story.jpg`) };
  for (const m of [medios, { archivos: ["01.jpg"] }, { archivos: ["reel.mp4"], story: "story.jpg" }, viejo]) {
    for (const f of ["reel", "carrusel"] as const) {
      assert.ok(!JSON.stringify(formatPreview(pieza({ formato: f }), m)).includes("SECRETO"));
      const a = argsPreview("/data/media", "2026-10-12", pieza({ formato: f }), m);
      assert.ok(!JSON.stringify(a).includes("SECRETO"));
    }
  }
  // Ruta local bajo la raíz de medios, no la URL.
  assert.deepEqual(argsPreview("/data/media", "2026-10-12", pieza(), medios).ruta, "/data/media/2026-10-12/lun-reel-agentes/cover.jpg");
});

check("telegram (R44): nombre de archivo validado y ruta dentro de la raíz", () => {
  assert.equal(archivoDeUrl(`${BASE}/cover.jpg`), "cover.jpg");
  assert.equal(archivoDeUrl(`${BASE}/%2e%2e`), "");
  assert.equal(archivoDeUrl(`${BASE}/..%2fsecreto.jpg`), "");
  assert.equal(archivoDeUrl(`${BASE}/con espacio.jpg`), "");
  assert.equal(archivoDeUrl(`${BASE}/.oculto`), "");
  assert.equal(archivoDeUrl("no es url"), "");
  assert.equal(archivoDeUrl(undefined), "");
  assert.equal(rutaMedioLocal("/data/media", "2026-10-12", "lun-reel-agentes", "cover.jpg"), "/data/media/2026-10-12/lun-reel-agentes/cover.jpg");
  assert.equal(rutaMedioLocal("/data/media", "../x", "lun-reel-agentes", "cover.jpg"), undefined);
  assert.equal(rutaMedioLocal("/data/media", "2026-10-12", "../../etc", "cover.jpg"), undefined);
  assert.equal(rutaMedioLocal("/data/media", "2026-10-12", "lun-reel-agentes", ".."), undefined);
  // Sin archivo válido: solo texto.
  assert.equal(argsPreview("/data/media", "2026-10-12", pieza(), { archivos: ["reel.mp4"] }).ruta, undefined);
});

check("telegram: truncar corta entre grafemas (emojis, banderas, familias) y mide en UTF-16", () => {
  const suelto = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const e of ["🚀", "🇨🇱", "👨‍👩‍👧", "é"]) {
    for (let off = 0; off < 12; off++) {
      const t = truncar("x".repeat(off) + e.repeat(1200), 1024);
      assert.ok(t.length <= 1024);
      assert.ok(t.endsWith("…"));
      assert.ok(!suelto.test(t));
      assert.ok(t.slice(off, -1).split(e).every((x) => x === ""), `grafema partido (${e}, ${off})`);
    }
  }
  assert.equal(truncar("corto", 1024), "corto");
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

check("telegram: render pendiente (R41) — domingo 17:59 no, 18:00 sí (semana que empieza al día siguiente)", () => {
  const s = [semana([pieza({ hora: "14:00" })])];
  assert.equal(avisoRenderPendiente(s, Z("2026-10-10T15:00:00Z")), undefined); // sábado 12:00: ya no avisa
  assert.equal(avisoRenderPendiente(s, Z("2026-10-11T20:59:00Z")), undefined); // dom 17:59 Chile (UTC-3)
  const a = avisoRenderPendiente(s, Z("2026-10-11T21:00:00Z")); // dom 18:00
  assert.ok(a);
  assert.match(a.texto, /Prende el Mac: faltan 1 piezas? por renderizar/);
  assert.equal(a.clave, "2026-10-12:domingo");
});

check("telegram: render pendiente (R41) — post lun 14:00 → segunda etapa el lunes 02:00 si sigue pendiente", () => {
  const s = [semana([pieza({ hora: "14:00" })])];
  const ya = ["2026-10-12:domingo"];
  assert.equal(avisoRenderPendiente(s, Z("2026-10-12T04:59:00Z"), ya), undefined); // lun 01:59
  const a = avisoRenderPendiente(s, Z("2026-10-12T05:00:00Z"), ya); // lun 02:00
  assert.ok(a);
  assert.equal(a.clave, "2026-10-12:12h");
  assert.equal(avisoRenderPendiente(s, Z("2026-10-12T05:00:00Z"), [...ya, a.clave]), undefined);
});

check("telegram: render pendiente — primera pieza lun 08:00 → 12 h antes (dom 20:00) si aún falta", () => {
  const s = [semana([pieza()])];
  const ya = ["2026-10-12:domingo"];
  assert.equal(avisoRenderPendiente(s, Z("2026-10-11T22:59:00Z"), ya), undefined); // dom 19:59
  const a = avisoRenderPendiente(s, Z("2026-10-11T23:00:00Z"), ya); // dom 20:00
  assert.ok(a);
  assert.equal(a.clave, "2026-10-12:12h");
  // Ya renderizada: no avisa.
  assert.equal(avisoRenderPendiente([semana([pieza()], { [pieza().id]: rend() })], Z("2026-10-11T23:00:00Z"), ya), undefined);
});

check("telegram: render pendiente — cada etapa una vez por semana (yaAvisado); la de 12 h tapa la del domingo", () => {
  const s = [semana([pieza({ hora: "14:00" })])];
  const ahora = Z("2026-10-11T22:00:00Z"); // dom 19:00
  const a = avisoRenderPendiente(s, ahora);
  assert.ok(a);
  assert.equal(avisoRenderPendiente(s, ahora, [a.clave]), undefined);
  assert.equal(avisoRenderPendiente(s, ahora, ["2026-10-12:12h"]), undefined);
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

await checkAsync("telegram: semanasConPlan — carpeta sin plan.json o con plan ilegible cuenta como ausente", async () => {
  const leer = async (x: string): Promise<SemanaLeida | undefined> => {
    if (x === "2026-10-12") return semana([]);
    if (x === "2026-10-19") throw new Error("plan.json inválido");
    return undefined; // carpeta sin plan.json
  };
  assert.deepEqual(await semanasConPlan(["2026-10-05", "2026-10-12", "2026-10-19"], leer), ["2026-10-12"]);
  const sin = await semanasConPlan(["2026-10-12".replace("12", "19")], leer);
  assert.ok(silencioCalendario(sin, Z("2026-10-18T15:00:00Z")));
});

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

check("telegram: callback cal-saltar cabe en 64 bytes y se lee de vuelta (huella estable, no posición)", () => {
  const largoId = "x".repeat(70);
  const s = semana([pieza(), pieza({ id: largoId })]);
  const corto = callbackSaltar("2026-10-12", "lun-reel-agentes");
  assert.equal(corto, "cal-saltar:2026-10-12:lun-reel-agentes");
  const largo = callbackSaltar("2026-10-12", largoId);
  assert.ok(Buffer.byteLength(largo) <= 64);
  assert.ok(!largo.includes("#"));
  assert.deepEqual(leerCallbackSaltar(corto, [s]), { semana: "2026-10-12", id: "lun-reel-agentes" });
  assert.deepEqual(leerCallbackSaltar(largo, [s]), { semana: "2026-10-12", id: largoId });
  // El plan cambió de orden: la huella sigue apuntando al mismo id.
  const reordenada = semana([pieza({ id: largoId }), pieza()]);
  assert.deepEqual(leerCallbackSaltar(largo, [reordenada]), { semana: "2026-10-12", id: largoId });
  // El id ya no está (plan cambió): nada.
  assert.equal(leerCallbackSaltar(largo, [semana([pieza(), pieza({ id: "y".repeat(70) })])]), undefined);
  assert.equal(leerCallbackSaltar("cal-saltar:2026-10-12:otra", [s]), undefined);
  assert.equal(leerCallbackSaltar("cal-saltar:2026-10-12:#1", [s]), undefined);
  assert.equal(leerCallbackSaltar("cal-saltar:2026-10-12:~zz", [s]), undefined);
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

check("telegram: previewsPendientes — render con medios, sin estado o programado, hora futura y sin preview entregado", () => {
  const s = semana(
    [
      pieza({ hora: "20:00" }), pieza({ id: "ya-programada", hora: "20:00" }), pieza({ id: "ya-paso", hora: "07:00" }),
      pieza({ id: "sin-render", hora: "20:00" }), pieza({ id: "con-preview", hora: "20:00" }), pieza({ id: "saltada", hora: "20:00" }),
    ],
    { "lun-reel-agentes": rend(), "ya-programada": rend(), "ya-paso": rend(), "con-preview": rend(), saltada: rend() },
    { "ya-programada": { estado: "programado" }, "con-preview": { estado: "programado" }, saltada: { estado: "saltado" } },
  );
  const r = previewsPendientes([s], Z("2026-10-12T15:00:00Z"), (k) => k === "2026-10-12/con-preview");
  assert.deepEqual(r.map((x) => [x.pieza.id, x.nueva]), [["lun-reel-agentes", true], ["ya-programada", false]]);
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
    // Modo aviso hace todo menos los POST a Meta: también arma las URLs (R48).
    mediaBase: "https://m.ejemplo.cl", mediaToken: "SECRETO",
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

check("scheduler: un /publicar interrumpido en 'contenedor' no se retoma a la hora del plan (empezado único)", () => {
  const o = { forzar: { [CL]: Z("2026-10-11T12:00:00Z") }, saltar: new Set<string>() };
  const cont: Fila = { piezaId: CL, tipo: "post", paso: "contenedor", intentos: 0 };
  assert.equal(empezado(cont), true);
  assert.equal(empezado({ piezaId: CL, tipo: "post", paso: "inicio", intentos: 0 }), false);
  assert.equal(empezado(undefined), false);
  assert.deepEqual(ordenesVencidas(o, [cont], Z("2026-10-12T22:30:00Z")), []);
  // Dentro de la ventana de la orden: se retoma con la hora de la orden.
  const dentro = tareasDebidas([prog()], [cont], Z("2026-10-11T12:05:00Z"), false, o);
  assert.equal(dentro.publicar[0]?.hora.toISOString(), "2026-10-11T12:00:00.000Z");
  // A la hora del plan: no se publica; se salta.
  const plan = tareasDebidas([prog()], [cont], Z("2026-10-12T22:30:00Z"), false, o);
  assert.equal(plan.publicar.length, 0);
  assert.deepEqual(plan.saltar.map((x) => x.motivo), ["no se publica tarde"]);
});

check("meta:check: 'requiere 100 seguidores' solo si el error lo indica", () => {
  assert.match(mensajeOnlineFollowers("(#100) Not enough followers: the account needs 100 followers"), /requiere 100 seguidores/);
  const otro = mensajeOnlineFollowers("Falta el permiso instagram_manage_insights");
  assert.doesNotMatch(otro, /100 seguidores/);
  assert.match(otro, /instagram_manage_insights/);
  assert.doesNotMatch(mensajeOnlineFollowers("(#100) Invalid parameter"), /100 seguidores/);
});
