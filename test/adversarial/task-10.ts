import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { GraphError } from "../../src/meta/client.ts";
import { publicar, type Fila } from "../../src/calendario/publish.ts";
import { tareasDebidas, tick, type SchedulerDeps } from "../../src/calendario/scheduler.ts";
import type { EstadoEntry, Medios, Pieza, RenderEntry, SemanaLeida } from "../../src/calendario/plan.ts";
import { zonedToUtc } from "../../src/calendario/time.ts";

/**
 * Adversario T10 (publicación idempotente y scheduler). Arnés propio: no usa los
 * helpers del implementador. Todo en memoria, sin red; KB_DIR a una carpeta temporal
 * (solo para calcular rutas de estado.json/registro.jsonl, que aquí no se escriben).
 */
process.env.KB_DIR = mkdtempSync(join(tmpdir(), "adv-t10-"));
process.env.KB_GIT = "0";

const pz = (id: string, dia: string, hora: string, formato: "reel" | "carrusel" = "reel"): Pieza => ({
  id, dia, hora, formato, arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "p",
  hook: { categoria: "curiosidad", texto: "h", score: 80 }, emocion: "e", entregable: "e", fraseAmigo: "f",
  lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
  derivadoDe: null, caption: `Caption de ${id}\n\n#ia #claudecode`, borrador: `${id}.json`, estado: "planificado",
});
const medios = (id: string): Medios => ({
  urls: [`https://kb.ngrok.app/media/T/2026-10-12/${id}/reel.mp4`],
  cover: `https://kb.ngrok.app/media/T/2026-10-12/${id}/cover.jpg`,
  story: `https://kb.ngrok.app/media/T/2026-10-12/${id}/story.jpg`,
});
// R48: render.json trae nombres; el scheduler arma las mismas URLs de `medios` con mediaBase y mediaToken.
const rendido = (_id: string): RenderEntry => ({ estado: "renderizado", medios: { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg" }, en: "2026-10-11T10:00:00Z" });

/** Meta mínimo y estricto: registra cada media_publish exitoso con su hora. */
function metaSimple(reloj: { t: number }, contenedores: Record<string, string> = {}) {
  const status = new Map(Object.entries(contenedores));
  const publicados: { creationId: string; en: number; mediaId: string }[] = [];
  let n = 0;
  return {
    publicados,
    graph: {
      get: async <T,>(path: string): Promise<T> => {
        if (status.has(path)) return { status_code: status.get(path) } as T;
        return { data: [] } as T;
      },
      post: async (path: string, q: Record<string, string | number | boolean | undefined>) => {
        if (path.endsWith("/media_publish")) {
          const c = String(q.creation_id);
          if (status.get(c) !== "FINISHED") throw new GraphError("no listo", 9007);
          status.set(c, "PUBLISHED");
          const mediaId = `m${++n}`;
          publicados.push({ creationId: c, en: reloj.t, mediaId });
          return { id: mediaId };
        }
        const id = `c${++n}`;
        status.set(id, "FINISHED");
        return { id };
      },
    },
  };
}

/** Mundo en memoria para `tick`: semanas, filas (PK pieza+tipo como la tabla), estado.json por semana. */
function mundo(reloj: { t: number }, planes: Record<string, Pieza[]>, meta: ReturnType<typeof metaSimple>) {
  const render: Record<string, Record<string, RenderEntry>> = {};
  const estado: Record<string, Record<string, EstadoEntry>> = {};
  const filas = new Map<string, Fila>();
  const claves = new Map<string, string>();
  const avisos: string[] = [];
  const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? {}));
  const deps: SchedulerDeps = {
    graph: meta.graph,
    igUserId: "IG",
    modo: "auto",
    ahora: () => new Date(reloj.t),
    dormir: async (ms) => { reloj.t += ms; },
    avisar: async (s) => { avisos.push(s); },
    tokenOk: async () => true,
    listarSemanas: async () => Object.keys(planes).sort(),
    leerSemana: async (s) => planes[s] ? ({
      semana: s,
      plan: { semana: s, zona: "America/Santiago", experimento: null, piezas: planes[s] },
      render: copia(render[s]),
      estado: copia(estado[s]),
    }) : undefined,
    cargarFilas: () => [...filas.values()].map(copia),
    guardarFila: (f) => { filas.set(`${f.piezaId}|${f.tipo}`, copia(f)); },
    leerClave: (k) => claves.get(k),
    guardarClave: (k, v) => { claves.set(k, v); },
    escribirEstado: async (s, id, e) => {
      const m = (estado[s] ??= {});
      const prev = m[id] ?? ({} as EstadoEntry);
      m[id] = { ...prev, ...e, ...(e.story ? { story: { ...prev.story, ...e.story } } : {}) } as EstadoEntry;
    },
    anotarRegistro: async () => undefined,
    commit: async () => undefined,
    leerBorrador: async () => { throw new Error("sin borrador"); },
    mediaBase: "https://kb.ngrok.app",
    mediaToken: "T",
  };
  return { deps, render, estado, filas, avisos };
}

const ms = (d: Date): number => d.getTime();
const MIN = 60_000;

// --- R20: ids repetidos entre semanas ---

check("adversario T10: un id que se repite en otra semana no se publica (la clave de publicaciones ignora la semana; R20)", () => {
  // Ruling R20: la clave de `publicaciones` incluye la semana; un id repetido en otra semana debe publicarse.
  const viejo = pz("reel-tutorial-claude", "2026-10-05", "19:30");
  const nuevo = pz("reel-tutorial-claude", "2026-10-12", "19:30");
  const semanas: SemanaLeida[] = [
    { semana: "2026-10-05", plan: { semana: "2026-10-05", zona: "America/Santiago", experimento: null, piezas: [viejo] },
      render: { [viejo.id]: rendido(viejo.id) },
      estado: { [viejo.id]: { estado: "publicado", mediaId: "m1", publicadoEn: "2026-10-05T22:30:10Z", story: { estado: "publicado" } } } },
    { semana: "2026-10-12", plan: { semana: "2026-10-12", zona: "America/Santiago", experimento: null, piezas: [nuevo] },
      render: { [nuevo.id]: rendido(nuevo.id) }, estado: { [nuevo.id]: { estado: "programado" } } },
  ];
  const filas: Fila[] = [
    { piezaId: viejo.id, tipo: "post", paso: "publicado", mediaId: "m1", intentos: 0 },
    { piezaId: viejo.id, tipo: "story", paso: "publicado", mediaId: "m2", intentos: 0 },
  ];
  const r = tareasDebidas(semanas, filas, zonedToUtc("2026-10-12", "19:30"), false);
  assert.deepEqual(r.publicar.map((t) => `${t.semana}/${t.pieza.id}/${t.tipo}`), [`2026-10-12/${nuevo.id}/post`]);
});

// --- búsqueda por caption con un post manual de caption idéntico ---

await checkAsync("adversario T10: un post manual con el mismo caption publicado minutos antes del intento se toma como propio y la pieza nunca se publica", async () => {
  // Brief Step 1: "busca ... el más reciente con caption idéntico y timestamp ≥ inicio del intento".
  // El código usa inicio − 5 min y además busca con el contenedor FINISHED (no publicado).
  const reloj = { t: Date.parse("2026-10-12T22:30:00Z") };
  const p = pz("reel-manual", "2026-10-12", "19:30");
  const manual = { id: "manual-1", caption: p.caption, timestamp: "2026-10-12T22:28:00+0000" };
  let exitos = 0;
  let primero = true;
  const graph = {
    get: async <T,>(path: string): Promise<T> => {
      if (path === "c1") return { status_code: exitos ? "PUBLISHED" : "FINISHED" } as T;
      if (path === "IG/media") return { data: exitos ? [{ id: "m-real", caption: p.caption, timestamp: "2026-10-12T22:31:00+0000" }, manual] : [manual] } as T;
      return { data: [] } as T;
    },
    post: async (path: string): Promise<Record<string, unknown>> => {
      if (path === "IG/media_publish") {
        if (primero) { primero = false; throw new GraphError("No pude conectar con la API de Meta (ECONNRESET)."); } // antes del efecto
        exitos++;
        return { id: "m-real" };
      }
      return { id: "c1" };
    },
  };
  const f = await publicar({ piezaId: p.id, tipo: "post", paso: "inicio", intentos: 0 }, p, medios(p.id), {
    graph, igUserId: "IG", guardar: () => undefined, dormir: async (x) => { reloj.t += x; },
    ahora: () => new Date(reloj.t), modo: "auto",
  });
  assert.equal(exitos, 1, `media_publish exitosos = ${exitos}; fila ${f.paso} con mediaId ${f.mediaId}`);
  assert.equal(f.mediaId, "m-real");
});

// --- reanudaciones con contenedor muerto que retrasan la pieza del día fuera de su ventana ---

await checkAsync("adversario T10: dos filas viejas con contenedor EXPIRED duermen 10 min cada una pasado su límite y la pieza del día se publica a los +20 min", async () => {
  // Brief: "Post debido si ahora ≥ hora y ahora < hora + 15 min ... Fuera de esa ventana sin publicar → saltado".
  const a1 = pz("reel-lunes", "2026-10-12", "19:30");
  const a2 = pz("reel-martes", "2026-10-13", "19:30");
  const b = pz("reel-miercoles", "2026-10-14", "19:30");
  const hora = ms(zonedToUtc(b.dia, b.hora));
  const reloj = { t: hora };
  const meta = metaSimple(reloj, { "cont-a1": "EXPIRED", "cont-a2": "EXPIRED" });
  const w = mundo(reloj, { "2026-10-12": [a1, a2, b] }, meta);
  for (const x of [a1, a2, b]) w.render["2026-10-12"] = { ...w.render["2026-10-12"], [x.id]: rendido(x.id) };
  w.estado["2026-10-12"] = { [b.id]: { estado: "programado" } };
  // El bot estuvo caído: quedaron dos filas en `esperando` cuyos contenedores ya expiraron.
  w.filas.set(`${a1.id}|post`, { piezaId: a1.id, tipo: "post", paso: "esperando", containerId: "cont-a1", intentos: 0 });
  w.filas.set(`${a2.id}|post`, { piezaId: a2.id, tipo: "post", paso: "esperando", containerId: "cont-a2", intentos: 0 });
  await tick(w.deps);
  const tardios = meta.publicados.filter((x) => x.en >= hora + 15 * MIN).map((x) => `${x.mediaId} a +${(x.en - hora) / MIN} min`);
  assert.deepEqual(tardios, [], `publicado fuera de la ventana: ${tardios.join(", ")}`);
});

// --- pausa que cruza la ventana de una fila en `esperando` ---

check("adversario T10: una fila en esperando cuya ventana pasa durante la pausa no queda saltada 'pausado' y se publica horas después al reanudar", () => {
  // Brief: "`pausado` → nada se publica; piezas cuya ventana pasa durante la pausa → saltado 'pausado'".
  const p = pz("reel-pausa", "2026-10-12", "19:30");
  const hora = zonedToUtc(p.dia, p.hora);
  const s: SemanaLeida[] = [{ semana: "2026-10-12", plan: { semana: "2026-10-12", zona: "America/Santiago", experimento: null, piezas: [p] },
    render: { [p.id]: rendido(p.id) }, estado: { [p.id]: { estado: "programado" } } }];
  const filas: Fila[] = [{ piezaId: p.id, tipo: "post", paso: "esperando", containerId: "c1", intentos: 0 }];
  const enPausa = tareasDebidas(s, filas, new Date(ms(hora) + 20 * MIN), true);
  const despues = tareasDebidas(s, filas, new Date(ms(hora) + 3 * 60 * MIN), false);
  assert.deepEqual(
    { saltadas: enPausa.saltar.map((x) => x.motivo), luego: despues.publicar.map((t) => t.tipo) },
    { saltadas: ["pausado"], luego: [] },
  );
});

// --- story reanudada más allá de las 6 h ---

check("adversario T10: una story en esperando se publica a las 8 h del post (el tope de 6 h no aplica a filas reanudables)", () => {
  // Brief: "la story puede ir tarde hasta +6 h; después, se descarta con motivo".
  const p = pz("reel-story-tarde", "2026-10-12", "19:30");
  const pub = "2026-10-12T22:30:20Z";
  const s: SemanaLeida[] = [{ semana: "2026-10-12", plan: { semana: "2026-10-12", zona: "America/Santiago", experimento: null, piezas: [p] },
    render: { [p.id]: rendido(p.id) }, estado: { [p.id]: { estado: "publicado", mediaId: "m1", publicadoEn: pub } } }];
  const filas: Fila[] = [
    { piezaId: p.id, tipo: "post", paso: "publicado", mediaId: "m1", intentos: 0 },
    { piezaId: p.id, tipo: "story", paso: "esperando", containerId: "cs", intentos: 0 },
  ];
  const r = tareasDebidas(s, filas, new Date(Date.parse(pub) + 8 * 60 * MIN), false);
  assert.deepEqual(r.publicar.map((t) => t.tipo), [], "la story sale a las 8 h");
});

// --- estado.json viejo tras un git pull: una pieza ya saltada vuelve a publicarse ---

await checkAsync("adversario T10: pieza saltada por 'falta el render' se publica si un pull deja estado.json viejo y el render llega dentro de los 15 min", async () => {
  // Brief: "Sin render a la hora → saltado 'falta el render'"; constraints: "nunca se publica tarde";
  // mandato: estado.json que el git pull reemplaza por una versión vieja (la fila de SQLite manda).
  const p = pz("reel-sin-render", "2026-10-12", "19:30");
  const hora = ms(zonedToUtc(p.dia, p.hora));
  const reloj = { t: hora };
  const meta = metaSimple(reloj);
  const w = mundo(reloj, { "2026-10-12": [p] }, meta);
  w.estado["2026-10-12"] = { [p.id]: { estado: "programado" } };
  await tick(w.deps);
  assert.equal(w.estado["2026-10-12"][p.id].estado, "saltado");
  // git pull: estado.json vuelve a la versión anterior; y el render del Mac llega tarde.
  w.estado["2026-10-12"] = { [p.id]: { estado: "programado" } };
  w.render["2026-10-12"] = { [p.id]: rendido(p.id) };
  reloj.t = hora + 5 * MIN;
  await tick(w.deps);
  assert.equal(meta.publicados.length, 0, `se publicó una pieza ya saltada (avisos: ${w.avisos.join(" | ")})`);
});
