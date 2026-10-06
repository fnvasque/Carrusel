import assert from "node:assert/strict";
import { check, checkAsync } from "../_check.ts";
import { GraphError, graphPostForm } from "../../src/meta/client.ts";
import {
  clasificar, ErrorDeMeta, ErrorTransitorio, publicar, publicarStory,
  type Fila, type PublishCtx,
} from "../../src/calendario/publish.ts";
import type { Medios, Pieza } from "../../src/calendario/plan.ts";

/**
 * "Meta falso": simula contenedores con `status_code` programable, errores por
 * llamada (antes o después de su efecto) y cuenta cada `media_publish` exitoso.
 * Es permisivo a propósito: publicar dos veces el mismo contenedor crea DOS
 * medios (la Meta real quizás lo rechace, pero no dependemos de eso).
 */
export const IG = "17841400000000000";
export const T0 = Date.parse("2026-10-12T22:30:00Z");

type Status = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";
interface Contenedor { id: string; params: Record<string, unknown>; cola: Status[]; status: Status }
interface Medio { id: string; caption?: string; ts: number; story: boolean; containerId: string }
export interface Llamada { metodo: "get" | "post"; path: string; params: Record<string, unknown>; n: number }

export class MetaFalso {
  reloj = T0;
  private n = 0;
  llamadas = 0;
  contenedores = new Map<string, Contenedor>();
  medios: Medio[] = [];
  publicaciones = 0;
  posts: { path: string; params: Record<string, unknown> }[] = [];
  gets: { path: string; params: Record<string, unknown> }[] = [];
  guardadas: Fila[] = [];
  dormidas: number[] = [];
  violaciones: string[] = [];
  /** Cola de `status_code` para cada contenedor principal nuevo, en orden de creación. */
  colaStatus: Status[][] = [];
  /** Error a inyectar en una llamada; `despues` = la llamada surte efecto y luego falla (red). */
  fallar: (c: Llamada) => { error: Error; despues?: boolean } | undefined = () => undefined;

  /** Crea a mano un contenedor (para probar reanudaciones). */
  crear(id: string, status: Status, params: Record<string, unknown> = {}): void {
    this.contenedores.set(id, { id, params, cola: [], status });
  }
  /** Crea a mano un medio ya publicado. */
  publicado(id: string, containerId: string, caption: string | undefined, ts: number, story = false): void {
    this.medios.push({ id, caption, ts, story, containerId });
  }

  private iso(ms: number): string {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+0000");
  }

  async get(path: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const llamada: Llamada = { metodo: "get", path, params, n: ++this.llamadas };
    const f = this.fallar(llamada);
    if (f && !f.despues) throw f.error;
    this.gets.push({ path, params });
    let out: Record<string, unknown>;
    if (path === `${IG}/media` || path === `${IG}/stories`) {
      const story = path.endsWith("stories");
      const limit = Number(params.limit ?? 25);
      out = {
        data: this.medios.filter((m) => m.story === story).sort((a, b) => b.ts - a.ts).slice(0, limit)
          .map((m) => ({ id: m.id, ...(story ? {} : { caption: m.caption }), timestamp: this.iso(m.ts) })),
      };
    } else {
      const c = this.contenedores.get(path);
      if (!c) throw new GraphError("Consulta inválida: el objeto no existe.", 100);
      if (c.status !== "PUBLISHED" && c.cola.length) c.status = c.cola.shift()!;
      out = { id: c.id, status_code: c.status };
    }
    if (f) throw f.error;
    return out;
  }

  async post(path: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const llamada: Llamada = { metodo: "post", path, params, n: ++this.llamadas };
    this.revisarGuardado(path, params);
    const f = this.fallar(llamada);
    if (f && !f.despues) throw f.error;
    this.posts.push({ path, params });
    let out: Record<string, unknown>;
    if (path === `${IG}/media`) {
      const hijo = params.is_carousel_item === true;
      const id = `${hijo ? "h" : "c"}${++this.n}`;
      const cola = hijo ? [] : (this.colaStatus.shift() ?? []);
      this.contenedores.set(id, { id, params, cola: [...cola], status: cola.length ? "IN_PROGRESS" : "FINISHED" });
      out = { id };
    } else if (path === `${IG}/media_publish`) {
      const c = this.contenedores.get(String(params.creation_id));
      if (!c || (c.status !== "FINISHED" && c.status !== "PUBLISHED")) {
        throw new GraphError("Error de la API de Meta (código 9007): media no lista", 9007);
      }
      this.publicaciones++;
      const id = `m${++this.n}`;
      this.medios.push({ id, caption: c.params.caption as string | undefined, ts: this.reloj, story: c.params.media_type === "STORIES", containerId: c.id });
      c.status = "PUBLISHED";
      out = { id };
    } else {
      throw new Error(`POST inesperado: ${path}`);
    }
    if (f) throw f.error;
    return out;
  }

  /** La fila guardada nunca debe ir adelante del trabajo hecho. */
  private revisarGuardado(path: string, params: Record<string, unknown>): void {
    const u = this.guardadas.at(-1);
    if (path.endsWith("media_publish")) {
      if (u?.paso !== "publicando" || u.containerId !== params.creation_id) {
        this.violaciones.push(`media_publish sin fila "publicando" guardada (última: ${u?.paso})`);
      }
    } else if (params.is_carousel_item === true) {
      if (u?.paso !== "hijos") this.violaciones.push(`hijo sin fila "hijos" guardada (última: ${u?.paso})`);
    } else if (u?.paso !== "contenedor") {
      this.violaciones.push(`contenedor sin fila "contenedor" guardada (última: ${u?.paso})`);
    }
    for (const id of u?.children ?? []) {
      if (!this.contenedores.has(id)) this.violaciones.push(`fila guardada con hijo inexistente ${id}`);
    }
  }

  ctx(extra: Partial<PublishCtx> = {}): PublishCtx {
    return {
      graph: {
        get: <T>(p: string, q?: Record<string, string | number | undefined>) => this.get(p, q) as Promise<T>,
        post: (p, q) => this.post(p, q),
      },
      igUserId: IG,
      guardar: (f) => { this.guardadas.push(structuredClone(f)); },
      dormir: async (ms) => { this.dormidas.push(ms); this.reloj += ms; },
      ahora: () => new Date(this.reloj),
      modo: "auto",
      ...extra,
    };
  }

  postsA(sufijo: string): { path: string; params: Record<string, unknown> }[] {
    return this.posts.filter((p) => p.path.endsWith(sufijo));
  }
}

export function piezaDe(extra: Partial<Pieza> = {}): Pieza {
  return {
    id: "lun-reel-agentes", dia: "2026-10-12", hora: "19:30", formato: "reel",
    arquetipo: "tutorial", senal: "guardados", tema: "[[IA]]", pilar: "herramienta",
    hook: { categoria: "curiosidad", texto: "hook", score: 9 }, emocion: "alivio",
    entregable: "x", fraseAmigo: "x", lectorFrio: { intentos: 1, resultado: "ok", notas: "" },
    origen: { fichas: [], referencias: [] }, derivadoDe: null,
    caption: "Primera línea con la keyword\n\n#ia #claudecode #automatizacion",
    borrador: "lun-reel-agentes.json", estado: "programado", ...extra,
  };
}
const URL = "https://media.ejemplo.cl/media/tok/2026-10-12";
export const mediosReel: Medios = {
  urls: [`${URL}/lun-reel-agentes/reel.mp4`], cover: `${URL}/lun-reel-agentes/cover.jpg`,
  story: `${URL}/lun-reel-agentes/story.jpg`, duracionMs: 21000,
};
export const carrusel = (n: number): { pieza: Pieza; medios: Medios } => ({
  pieza: piezaDe({ id: "mar-carrusel-guia", formato: "carrusel", borrador: "mar-carrusel-guia.json" }),
  medios: {
    urls: Array.from({ length: n }, (_, i) => `${URL}/mar-carrusel-guia/${String(i + 1).padStart(2, "0")}.jpg`),
    story: `${URL}/mar-carrusel-guia/story.jpg`,
  },
});
export const filaNueva = (piezaId = "lun-reel-agentes", tipo: "post" | "story" = "post"): Fila =>
  ({ piezaId, tipo, paso: "inicio", intentos: 0 });

// --- clasificar ---

check("clasificar: errores de Meta (token, permiso, consulta, cuota, contenido) no se reintentan", () => {
  for (const code of [190, 10, 200, 299, 100, 4, 17, 32, 613, 9007]) {
    assert.equal(clasificar(new GraphError("x", code)), "meta", `código ${code}`);
  }
  assert.equal(clasificar(new GraphError("x", 36003, 2207026)), "meta");
  assert.equal(clasificar(new GraphError("x", 2207001)), "meta");
  assert.equal(clasificar(new ErrorDeMeta("x")), "meta");
});
check("clasificar: red, 5xx sin código, ErrorTransitorio y lo desconocido se reintentan", () => {
  assert.equal(clasificar(new GraphError("No pude conectar con la API de Meta")), "transitorio");
  assert.equal(clasificar(new GraphError("x", 2)), "transitorio");
  assert.equal(clasificar(new GraphError("x", 1)), "transitorio");
  assert.equal(clasificar(new ErrorTransitorio("x")), "transitorio");
  assert.equal(clasificar(new Error("cualquier cosa")), "transitorio");
});

// --- carrusel ---

await checkAsync("publish: carrusel de 3 → 3 hijos, 1 CAROUSEL con children y caption, FINISHED, 1 media_publish", async () => {
  const m = new MetaFalso();
  const { pieza, medios } = carrusel(3);
  const r = await publicar(filaNueva(pieza.id), pieza, medios, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.ok(r.mediaId);
  const media = m.postsA("/media");
  assert.equal(media.length, 4);
  for (let i = 0; i < 3; i++) {
    assert.equal(media[i].params.image_url, medios.urls[i]);
    assert.equal(media[i].params.is_carousel_item, true);
  }
  assert.equal(media[3].params.media_type, "CAROUSEL");
  assert.equal(media[3].params.children, "h1,h2,h3");
  assert.equal(media[3].params.caption, pieza.caption);
  assert.equal(m.postsA("/media_publish").length, 1);
  assert.equal(m.postsA("/media_publish")[0].params.creation_id, "c4");
  assert.equal(m.publicaciones, 1);
  assert.deepEqual(m.violaciones, []);
  assert.equal(m.guardadas.at(-1)?.paso, "publicado");
  assert.equal(m.guardadas.at(-1)?.mediaId, r.mediaId);
});

await checkAsync("publish: reanudar {paso: hijos, children: [a,b]} de un carrusel de 3 crea solo el 3.º hijo", async () => {
  const m = new MetaFalso();
  m.crear("a", "FINISHED"); m.crear("b", "FINISHED");
  const { pieza, medios } = carrusel(3);
  const r = await publicar({ ...filaNueva(pieza.id), paso: "hijos", children: ["a", "b"] }, pieza, medios, m.ctx());
  assert.equal(r.paso, "publicado");
  const media = m.postsA("/media");
  assert.equal(media.length, 2);
  assert.equal(media[0].params.image_url, medios.urls[2]);
  assert.match(String(media[1].params.children), /^a,b,h\d+$/);
  assert.equal(m.publicaciones, 1);
  assert.deepEqual(m.violaciones, []);
});

// --- reel ---

await checkAsync("publish: reel con REELS, video_url, cover_url, share_to_feed y caption; IN_PROGRESS ×3 → FINISHED", async () => {
  const m = new MetaFalso();
  m.colaStatus = [["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "FINISHED"]];
  const pieza = piezaDe();
  const r = await publicar(filaNueva(), pieza, mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  const [c] = m.postsA("/media");
  assert.equal(c.params.media_type, "REELS");
  assert.equal(c.params.video_url, mediosReel.urls[0]);
  assert.equal(c.params.cover_url, mediosReel.cover);
  assert.equal(c.params.share_to_feed, true);
  assert.equal(c.params.caption, pieza.caption);
  assert.deepEqual(m.dormidas, [15_000, 15_000, 15_000]);
  assert.equal(m.publicaciones, 1);
  assert.deepEqual(m.violaciones, []);
});

await checkAsync("publish: reel que no termina en 10 min (40 sondeos) → fallido sin media_publish", async () => {
  const m = new MetaFalso();
  m.colaStatus = [Array(60).fill("IN_PROGRESS")];
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(r.error, "Meta no terminó de procesar el video en 10 min");
  assert.equal(m.gets.filter((g) => g.path === "c1").length, 40);
  assert.ok(m.dormidas.every((d) => d === 15_000));
  assert.ok(m.dormidas.reduce((a, b) => a + b, 0) <= 10 * 60_000);
  assert.equal(m.publicaciones, 0);
});

await checkAsync("publish: status ERROR 3 veces → reintenta con dormir(10 min) y contenedor nuevo; al 4.º fallido", async () => {
  const m = new MetaFalso();
  m.colaStatus = [["ERROR"], ["ERROR"], ["ERROR"], ["ERROR"]];
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(r.intentos, 4);
  assert.equal(m.postsA("/media").length, 4, "cada reintento crea un contenedor nuevo");
  assert.equal(new Set(m.postsA("/media").map((_, i) => i)).size, 4);
  assert.deepEqual(m.dormidas.filter((d) => d === 10 * 60_000).length, 3);
  assert.equal(m.publicaciones, 0);
  assert.deepEqual(m.violaciones, []);
});

await checkAsync("publish: status ERROR 3 veces y luego FINISHED → publica una vez", async () => {
  const m = new MetaFalso();
  m.colaStatus = [["ERROR"], ["ERROR"], ["ERROR"], ["FINISHED"]];
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.equal(m.postsA("/media_publish")[0].params.creation_id, "c4");
  assert.equal(m.publicaciones, 1);
});

// --- reanudar ---

await checkAsync("publish: reanudar {paso: esperando, containerId: c1} no crea contenedor: sondea c1 y publica", async () => {
  const m = new MetaFalso();
  m.crear("c1", "FINISHED", { caption: piezaDe().caption });
  const r = await publicar({ ...filaNueva(), paso: "esperando", containerId: "c1" }, piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.equal(m.postsA("/media").length, 0);
  assert.equal(m.postsA("/media_publish")[0].params.creation_id, "c1");
  assert.equal(m.publicaciones, 1);
});

await checkAsync("publish: fallo de red tras media_publish no duplica", async () => {
  const m = new MetaFalso();
  m.fallar = (c) => c.metodo === "post" && c.path.endsWith("media_publish")
    ? { error: new GraphError("No pude conectar con la API de Meta (ECONNRESET)."), despues: true }
    : undefined;
  const pieza = piezaDe();
  const r = await publicar(filaNueva(), pieza, mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.equal(m.publicaciones, 1, "un solo media_publish exitoso");
  assert.equal(m.postsA("/media_publish").length, 1, "no repite media_publish a ciegas");
  assert.equal(r.mediaId, m.medios[0].id);
  assert.ok(m.gets.some((g) => g.path === "c1" && g.params.fields === "status_code"));
  const lista = m.gets.find((g) => g.path === `${IG}/media`);
  assert.equal(lista?.params.fields, "id,caption,timestamp");
  assert.equal(lista?.params.limit, 10);
});

await checkAsync("publish: reanudar {paso: publicando} con el contenedor PUBLISHED busca el media_id sin publicar", async () => {
  const m = new MetaFalso();
  const pieza = piezaDe();
  m.crear("c1", "PUBLISHED", { caption: pieza.caption });
  m.publicado("m-viejo", "c0", pieza.caption, T0 - 7 * 86_400_000); // mismo caption, de otra semana
  m.publicado("m-otro", "c9", "otro caption", T0 + 1000);
  m.publicado("m1", "c1", pieza.caption, T0 + 500);
  m.reloj = T0 + 120_000;
  const fila: Fila = { ...filaNueva(), paso: "publicando", containerId: "c1", inicio: new Date(T0).toISOString() };
  const r = await publicar(fila, pieza, mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.equal(r.mediaId, "m1");
  assert.equal(m.posts.length, 0);
  assert.equal(m.publicaciones, 0);
});

await checkAsync("publish: reanudar {paso: publicando} con el contenedor aún FINISHED (el POST no llegó) publica una vez", async () => {
  const m = new MetaFalso();
  m.crear("c1", "FINISHED", { caption: piezaDe().caption });
  const fila: Fila = { ...filaNueva(), paso: "publicando", containerId: "c1", inicio: new Date(T0).toISOString() };
  const r = await publicar(fila, piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.equal(m.publicaciones, 1);
});

await checkAsync("publish: reanudar {paso: publicando} sin red para verificar → lanza ErrorTransitorio y no publica", async () => {
  const m = new MetaFalso();
  m.crear("c1", "PUBLISHED");
  m.fallar = (c) => c.metodo === "get" ? { error: new GraphError("No pude conectar con la API de Meta") } : undefined;
  const fila: Fila = { ...filaNueva(), paso: "publicando", containerId: "c1", inicio: new Date(T0).toISOString() };
  await assert.rejects(publicar(fila, piezaDe(), mediosReel, m.ctx()), ErrorTransitorio);
  assert.equal(m.posts.length, 0);
  assert.notEqual(m.guardadas.at(-1)?.paso, "fallido");
});

// --- errores de Meta ---

for (const code of [190, 10, 200, 100, 9007, 4, 17, 32, 613]) {
  await checkAsync(`publish: error de Meta código ${code} → fallido sin reintento, con el mensaje traducido`, async () => {
    const m = new MetaFalso();
    const msg = `mensaje traducido ${code}`;
    m.fallar = (c) => c.metodo === "post" ? { error: new GraphError(msg, code) } : undefined;
    const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
    assert.equal(r.paso, "fallido");
    assert.equal(r.error, msg);
    assert.equal(m.dormidas.length, 0);
    assert.equal(m.llamadas, 1);
  });
}
await checkAsync("publish: contenido rechazado (subcódigo 2207xxx) → fallido sin reintento", async () => {
  const m = new MetaFalso();
  m.fallar = (c) => c.metodo === "post" ? { error: new GraphError("rechazado", 36003, 2207026) } : undefined;
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(m.llamadas, 1);
});
await checkAsync("publish: error de Meta en media_publish (respuesta limpia) → fallido, sin segundo intento", async () => {
  const m = new MetaFalso();
  let intentosPublish = 0;
  m.fallar = (c) => {
    if (c.metodo !== "post" || !c.path.endsWith("media_publish")) return undefined;
    intentosPublish++;
    return { error: new GraphError("cuota", 4) };
  };
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(r.error, "cuota");
  assert.equal(intentosPublish, 1);
  assert.equal(m.publicaciones, 0);
});
await checkAsync("publish: red caída al crear el contenedor → reintenta (máx. 3) y luego fallido", async () => {
  const m = new MetaFalso();
  m.fallar = (c) => c.metodo === "post" ? { error: new GraphError("No pude conectar con la API de Meta") } : undefined;
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(m.llamadas, 4);
  assert.equal(m.dormidas.filter((d) => d === 10 * 60_000).length, 3);
});

// --- límites de Instagram: fallido sin llamar a Meta ---

await checkAsync("publish: carrusel de 11 imágenes → fallido sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const { pieza, medios } = carrusel(11);
  const r = await publicar(filaNueva(pieza.id), pieza, medios, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.match(r.error ?? "", /10/);
  assert.equal(m.llamadas, 0);
});
await checkAsync("publish: carrusel de 1 imagen → fallido sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const { pieza, medios } = carrusel(1);
  const r = await publicar(filaNueva(pieza.id), pieza, medios, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(m.llamadas, 0);
});
await checkAsync("publish: caption de 2 300 caracteres → fallido sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const r = await publicar(filaNueva(), piezaDe({ caption: "a".repeat(2300) }), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.match(r.error ?? "", /2[ .]?200/);
  assert.equal(m.llamadas, 0);
});
await checkAsync("publish: caption con 31 hashtags → fallido sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  const r = await publicar(filaNueva(), piezaDe({ caption: `hola\n\n${tags}` }), mediosReel, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.match(r.error ?? "", /30/);
  assert.equal(m.llamadas, 0);
});
await checkAsync("publish: reel sin video en los medios → fallido sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const r = await publicar(filaNueva(), piezaDe(), { urls: [] }, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(m.llamadas, 0);
});
await checkAsync("publish: fila ya publicada o fallida se devuelve tal cual, sin llamadas", async () => {
  const m = new MetaFalso();
  const a = await publicar({ ...filaNueva(), paso: "publicado", mediaId: "m1" }, piezaDe(), mediosReel, m.ctx());
  const b = await publicar({ ...filaNueva(), paso: "fallido", error: "x" }, piezaDe(), mediosReel, m.ctx());
  assert.equal(a.mediaId, "m1");
  assert.equal(b.paso, "fallido");
  assert.equal(m.llamadas, 0);
});
await checkAsync("publish: después del límite no crea contenedor nuevo (no se publica tarde)", async () => {
  const m = new MetaFalso();
  const r = await publicar(filaNueva(), piezaDe(), mediosReel, m.ctx({ limite: new Date(T0 - 1) }));
  assert.equal(r.paso, "fallido");
  assert.match(r.error ?? "", /tarde/);
  assert.equal(m.llamadas, 0);
});

// --- story ---

await checkAsync("publish: story con STORIES, image_url = story.jpg y sin caption", async () => {
  const m = new MetaFalso();
  const r = await publicarStory(filaNueva("lun-reel-agentes", "story"), mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  const [c] = m.postsA("/media");
  assert.equal(c.params.media_type, "STORIES");
  assert.equal(c.params.image_url, mediosReel.story);
  assert.equal("caption" in c.params, false);
  assert.equal(m.publicaciones, 1);
  assert.deepEqual(m.violaciones, []);
});
await checkAsync("publish: story con red caída tras media_publish no duplica (busca en /stories)", async () => {
  const m = new MetaFalso();
  m.fallar = (c) => c.metodo === "post" && c.path.endsWith("media_publish")
    ? { error: new GraphError("No pude conectar con la API de Meta"), despues: true } : undefined;
  const r = await publicarStory(filaNueva("lun-reel-agentes", "story"), mediosReel, m.ctx());
  assert.equal(r.paso, "publicado");
  assert.equal(r.mediaId, m.medios[0].id);
  assert.equal(m.publicaciones, 1);
  assert.ok(m.gets.some((g) => g.path === `${IG}/stories`));
});
await checkAsync("publish: story sin story.jpg → fallido sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const r = await publicarStory(filaNueva("x", "story"), { urls: ["https://a/b.jpg"] }, m.ctx());
  assert.equal(r.paso, "fallido");
  assert.equal(m.llamadas, 0);
});

// --- modo aviso ---

await checkAsync("publish: modo aviso recorre los pasos con IDs aviso-<id> sin llamar a Meta", async () => {
  const m = new MetaFalso();
  const { pieza, medios } = carrusel(3);
  const r = await publicar(filaNueva(pieza.id), pieza, medios, m.ctx({ modo: "aviso" }));
  assert.equal(r.paso, "publicado");
  assert.equal(r.mediaId, `aviso-${pieza.id}`);
  assert.equal(r.containerId, `aviso-${pieza.id}`);
  assert.equal(m.llamadas, 0);
  assert.deepEqual(m.guardadas.map((g) => g.paso), ["hijos", "contenedor", "esperando", "publicando", "publicado"]);
  const s = await publicarStory(filaNueva(pieza.id, "story"), medios, m.ctx({ modo: "aviso" }));
  assert.equal(s.paso, "publicado");
  assert.match(s.mediaId ?? "", /^aviso-/);
  assert.equal(m.llamadas, 0);
});

// --- reinicio en cada await: nunca dos media_publish ---

class Muerto extends Error {}

/** Corre `publicar` matando el proceso en la operación k (antes o después de su efecto), y reanuda desde la última fila guardada. */
async function reinicioEn(k: number, despues: boolean, preparar: (m: MetaFalso) => void, esCarrusel: boolean): Promise<{ m: MetaFalso; final: Fila }> {
  const m = new MetaFalso();
  preparar(m);
  const { pieza, medios } = esCarrusel ? carrusel(3) : { pieza: piezaDe(), medios: mediosReel };
  let ops = 0;
  let muerto = false;
  const tocar = (): void => {
    if (muerto) throw new Muerto();
    if (++ops === k && !despues) { muerto = true; throw new Muerto(); }
  };
  const tras = (): void => {
    if (ops === k && despues) { muerto = true; throw new Muerto(); }
  };
  const base = m.ctx();
  let guardada: Fila = filaNueva(pieza.id);
  const ctx: PublishCtx = {
    ...base,
    graph: {
      get: async <T>(p: string, q?: Record<string, string | number | undefined>) => { tocar(); const r = await base.graph.get<T>(p, q); tras(); return r; },
      post: async (p, q) => { tocar(); const r = await base.graph.post(p, q); tras(); return r; },
    },
    guardar: (f) => { tocar(); base.guardar(f); guardada = structuredClone(f); tras(); },
    dormir: async (ms) => { tocar(); await base.dormir(ms); tras(); },
  };
  try {
    await publicar(filaNueva(pieza.id), pieza, medios, ctx);
  } catch (e) {
    if (!(e instanceof Muerto) && !muerto) throw e;
  }
  // Reinicio: el proceso nuevo solo conoce la última fila persistida. Reanuda hasta cerrar.
  let final = guardada;
  for (let i = 0; i < 5 && final.paso !== "publicado" && final.paso !== "fallido"; i++) {
    try {
      final = await publicar(final, pieza, medios, m.ctx({ guardar: (f) => { m.guardadas.push(structuredClone(f)); final = structuredClone(f); } }));
    } catch (e) {
      if (!(e instanceof ErrorTransitorio)) throw e;
    }
  }
  return { m, final };
}

await checkAsync("publish: reinicio en cada await posible (carrusel y reel, antes y después del efecto) → a lo más un media_publish", async () => {
  let corridas = 0;
  for (const esCarrusel of [true, false]) {
    for (const despues of [false, true]) {
      for (let k = 1; k <= 30; k++) {
        const { m, final } = await reinicioEn(k, despues, (mm) => {
          if (!esCarrusel) mm.colaStatus = [["IN_PROGRESS", "IN_PROGRESS", "FINISHED"], ["FINISHED"]];
        }, esCarrusel);
        corridas++;
        assert.ok(m.publicaciones <= 1, `k=${k} despues=${despues} carrusel=${esCarrusel}: ${m.publicaciones} publicaciones`);
        assert.equal(final.paso, "publicado", `k=${k} despues=${despues} carrusel=${esCarrusel}: termina en ${final.paso} (${final.error})`);
        assert.equal(m.publicaciones, 1);
        assert.ok(final.mediaId, `k=${k}: sin mediaId`);
      }
    }
  }
  assert.equal(corridas, 120);
});

// --- graphPostForm ---

await checkAsync("graphPostForm: form-urlencoded, token y proof en el cuerpo (no en la URL), sin reintento", async () => {
  const original = globalThis.fetch;
  const vistos: { url: string; init: RequestInit }[] = [];
  try {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      vistos.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: "c1" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const cfg = { accessToken: "TOKENSECRETO", igUserId: IG, appSecret: "0123456789abcdef0123456789abcdef", graphVersion: "v26.0" };
    const r = await graphPostForm(`${IG}/media`, { image_url: "https://x/a.jpg", is_carousel_item: true, caption: undefined }, { config: cfg });
    assert.equal(r.id, "c1");
    assert.equal(vistos.length, 1);
    assert.equal(vistos[0].url, `https://graph.facebook.com/v26.0/${IG}/media`);
    assert.ok(!vistos[0].url.includes("TOKENSECRETO"));
    assert.equal(vistos[0].init.method, "POST");
    assert.equal((vistos[0].init.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(vistos[0].init.body));
    assert.equal(body.get("image_url"), "https://x/a.jpg");
    assert.equal(body.get("is_carousel_item"), "true");
    assert.equal(body.has("caption"), false);
    assert.equal(body.get("access_token"), "TOKENSECRETO");
    assert.match(body.get("appsecret_proof") ?? "", /^[0-9a-f]{64}$/);

    // Error de Graph → GraphError traducido, con código.
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "bad", code: 190 } }), { status: 400 })) as typeof fetch;
    await assert.rejects(graphPostForm("x", {}, { config: cfg }), (e: unknown) => e instanceof GraphError && e.code === 190 && /token/i.test(e.message));

    // Falla de red → GraphError sin código, una sola llamada y sin el token en el mensaje.
    let n = 0;
    globalThis.fetch = (async () => { n++; throw Object.assign(new TypeError("fetch failed TOKENSECRETO"), { cause: { code: "ECONNRESET" } }); }) as typeof fetch;
    await assert.rejects(graphPostForm("x", {}, { config: cfg }), (e: unknown) =>
      e instanceof GraphError && e.code === undefined && !e.message.includes("TOKENSECRETO"));
    assert.equal(n, 1, "sin reintento interno");
  } finally {
    globalThis.fetch = original;
  }
});
