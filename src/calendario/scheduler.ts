import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { openDb } from "../kb/db.ts";
import { commitPaths } from "../kb/store.ts";
import { graphGet, graphPostForm } from "../meta/client.ts";
import { tokenDaysLeft } from "../meta/check.ts";
import { metaConfig } from "../meta/env.ts";
import { slugify } from "../remix/emit.ts";
import {
  estadoEfectivo, leerSemana, listarSemanas, ocultarToken, semanaDir,
  type EstadoEntry, type Estado, type Pieza, type SemanaLeida,
} from "./plan.ts";
import { publicar, publicarStory, type Fila, type Graph, type PublishCtx } from "./publish.ts";
import { anotarRegistro, escribirEstado, estadoPath, registroPath } from "./registro.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "./time.ts";

/**
 * Scheduler del calendario: cada minuto (el `setInterval` lo pone `bot.ts`, Task 11)
 * mira qué piezas tocan y las publica en serie. La tabla `publicaciones` (SQLite)
 * manda: una fila `publicado`/`fallido` jamás vuelve a publicarse, aunque un
 * `git pull` traiga un `estado.json` viejo. `estado.json` y `registro.jsonl` se
 * escriben DESPUÉS de persistir la fila, y el commit al final.
 *
 * `tareasDebidas` es pura; `tick` recibe todo el I/O en `SchedulerDeps`.
 */

export interface Tarea {
  semana: string;
  pieza: Pieza;
  tipo: "post" | "story";
  hora: Date;
}

export interface Salto {
  semana: string;
  id: string;
  motivo: string;
  tipo: "post" | "story";
}

/** Ventana de publicación: hasta 15 min después de la hora. Después, no se publica tarde. */
export const VENTANA_MS = 15 * 60_000;
/** La story sale 60 min después del post, y se descarta si pasaron 6 h. */
export const STORY_TRAS_MS = 60 * 60_000;
export const STORY_TOPE_MS = 6 * 3_600_000;
/** Al día siguiente (≥ 20 h) se pide el permalink. */
export const PERMALINK_TRAS_MS = 20 * 3_600_000;
/** Tope para crear contenedores nuevos de un post: la ventana + 3 reintentos de 10 min + margen. */
const LIMITE_POST_MS = 50 * 60_000;

const terminal = (f?: Fila): boolean => f?.paso === "publicado" || f?.paso === "fallido";
/** Con el contenedor principal creado: se termina aunque haya pasado la ventana. */
const reanudable = (f?: Fila): boolean => f?.paso === "esperando" || f?.paso === "publicando";
const cerrado = (e?: Estado): boolean => e === "publicado" || e === "fallido" || e === "saltado";
const MOTIVO_STORY_TARDE = "la story ya no se publica: pasaron 6 h desde el post";

/**
 * Qué publicar ahora y qué marcar `saltado`. Función pura.
 * - Post: debido si `ahora ∈ [hora, hora + 15 min)` y está `programado`/`renderizado`
 *   con medios; después, `saltado` ("no se publica tarde", o "pausado" si lo está).
 *   Sin render a la hora → `saltado` "falta el render". Una fila en `esperando` o
 *   `publicando` se retoma siempre (salvo en pausa).
 * - Story: debida si el post está `publicado` con `publicadoEn` y pasaron 60 min;
 *   tras 6 h, se descarta con motivo.
 * - `pausado`: nada se publica.
 */
export function tareasDebidas(
  semanas: SemanaLeida[],
  filas: Fila[],
  ahora: Date,
  pausado: boolean,
): { publicar: Tarea[]; saltar: Salto[] } {
  const publicarL: Tarea[] = [];
  const saltar: Salto[] = [];
  const t = ahora.getTime();
  const filaDe = (id: string, tipo: "post" | "story"): Fila | undefined =>
    filas.find((f) => f.piezaId === id && f.tipo === tipo);

  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      let hora: Date;
      try {
        hora = zonedToUtc(p.dia, p.hora);
      } catch {
        continue; // el plan ya viene validado; por si acaso, no se adivina la hora.
      }
      const est = s.estado[p.id];

      // --- post ---
      const fp = filaDe(p.id, "post");
      if (terminal(fp)) {
        // ya se cerró: nunca más.
      } else if (reanudable(fp)) {
        if (!pausado) publicarL.push({ semana: s.semana, pieza: p, tipo: "post", hora });
      } else {
        const ef = estadoEfectivo(p, s.render[p.id], est);
        if ((ef === "programado" || ef === "renderizado" || ef === "planificado") && t >= hora.getTime()) {
          const r = s.render[p.id];
          const conRender = r?.estado === "renderizado" && r.medios !== undefined;
          if (!conRender) {
            saltar.push({ semana: s.semana, id: p.id, motivo: "falta el render", tipo: "post" });
          } else if (t < hora.getTime() + VENTANA_MS) {
            if (!pausado) publicarL.push({ semana: s.semana, pieza: p, tipo: "post", hora });
          } else {
            saltar.push({ semana: s.semana, id: p.id, motivo: pausado ? "pausado" : "no se publica tarde", tipo: "post" });
          }
        }
      }

      // --- story ---
      const fs = filaDe(p.id, "story");
      if (terminal(fs)) continue;
      const pub = est?.estado === "publicado" ? Date.parse(est.publicadoEn ?? "") : NaN;
      const horaStory = new Date(Number.isNaN(pub) ? t : pub + STORY_TRAS_MS);
      if (reanudable(fs)) {
        if (!pausado) publicarL.push({ semana: s.semana, pieza: p, tipo: "story", hora: horaStory });
        continue;
      }
      if (Number.isNaN(pub) || cerrado(est?.story?.estado)) continue;
      if (t < pub + STORY_TRAS_MS) continue;
      if (t >= pub + STORY_TOPE_MS) {
        saltar.push({ semana: s.semana, id: p.id, motivo: pausado ? "pausado" : MOTIVO_STORY_TARDE, tipo: "story" });
      } else if (!pausado) {
        publicarL.push({ semana: s.semana, pieza: p, tipo: "story", hora: horaStory });
      }
    }
  }
  publicarL.sort((a, b) => a.hora.getTime() - b.hora.getTime());
  return { publicar: publicarL, saltar };
}

/** Todo el I/O de `tick` (Ruling 4). `depsReales` arma el del servidor. */
export interface SchedulerDeps {
  graph: Graph;
  igUserId: string;
  modo: "auto" | "aviso";
  ahora: () => Date;
  dormir: (ms: number) => Promise<void>;
  /** Aviso al admin (Telegram). Los textos ya llegan sin token. */
  avisar: (texto: string) => Promise<void>;
  /** ¿El token de Meta es válido? (debug_token). */
  tokenOk: () => Promise<boolean>;
  listarSemanas: () => Promise<string[]>;
  /** Puede lanzar si `plan.json` es inválido (Ruling 10): se avisa y se sigue. */
  leerSemana: (semana: string) => Promise<SemanaLeida | undefined>;
  cargarFilas: () => Fila[];
  guardarFila: (f: Fila, ahora: Date) => void;
  /** Tabla `calendario_estado` (`pausado` = "1" lo pone /pausar; avisos del día). */
  leerClave: (clave: string) => string | undefined;
  guardarClave: (clave: string, valor: string) => void;
  escribirEstado: (semana: string, id: string, e: Partial<EstadoEntry>) => Promise<void>;
  anotarRegistro: (linea: Record<string, unknown>) => Promise<void>;
  commit: (paths: string[], mensaje: string) => Promise<unknown>;
  /** JSON del borrador `<semana>/<archivo>` (para nombreMotor y predictedScore). */
  leerBorrador: (semana: string, archivo: string) => Promise<unknown>;
  /** MEDIA_PUBLIC_TOKEN: se reemplaza por *** en todo lo que sale (avisos, estado, registro, filas). */
  mediaToken?: string;
}

/** Valor de `calendario_estado.pausado` que significa "en pausa". */
export const esPausado = (v: string | undefined): boolean => v !== undefined && /^(1|true|s[ií])$/i.test(v.trim());

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Candado en memoria: el setInterval de 60 s se solapa si una publicación tarda 10 min.
let enCurso = false;
// Avisos de "no pude confirmar" ya enviados (uno por pieza y tipo hasta que se resuelva).
const avisadosPendientes = new Set<string>();
// Último intento de permalink por pieza (reintento cada hora si falla).
const intentosPermalink = new Map<string, number>();

/** Una pasada del scheduler. Nunca lanza; si hay otra en curso, vuelve de inmediato. */
export async function tick(deps: SchedulerDeps): Promise<void> {
  if (enCurso) return;
  enCurso = true;
  try {
    await pasada(deps);
  } catch (e) {
    console.warn(`[calendario] tick: ${limpiar(deps, mensaje(e))}`);
  } finally {
    enCurso = false;
  }
}

const limpiar = (deps: SchedulerDeps, s: string): string => (deps.mediaToken ? ocultarToken(s, deps.mediaToken) : s);

async function pasada(deps: SchedulerDeps): Promise<void> {
  const ahora = deps.ahora();
  const hoy = localParts(ahora).dia;
  const avisar = async (texto: string): Promise<void> => {
    try {
      await deps.avisar(limpiar(deps, texto));
    } catch (e) {
      console.warn(`[calendario] no pude avisar: ${mensaje(e)}`);
    }
  };
  const unaVezAlDia = async (clave: string, texto: string): Promise<void> => {
    if (deps.leerClave(clave) === hoy) return;
    deps.guardarClave(clave, hoy);
    await avisar(texto);
  };

  // Semanas: la anterior (stories y permalinks de fin de semana), la actual y la siguiente.
  const lunes = weekMonday(ahora);
  const hay = new Set(await deps.listarSemanas());
  const semanas: SemanaLeida[] = [];
  for (const s of [addDays(lunes, -7), lunes, addDays(lunes, 7)]) {
    if (!hay.has(s)) continue;
    try {
      const r = await deps.leerSemana(s);
      if (r) semanas.push(r);
    } catch (e) {
      await unaVezAlDia(`aviso_plan:${s}`, `⚠️ El plan.json de la semana ${s} es inválido; no publico sus piezas hasta que se corrija: ${mensaje(e)}`);
    }
  }

  const filas = deps.cargarFilas();
  await reparar(deps, semanas, filas);
  const pausado = esPausado(deps.leerClave("pausado"));
  const { publicar: tareas, saltar } = tareasDebidas(semanas, filas, ahora, pausado);

  for (const x of saltar) await saltarPieza(deps, x, filas, avisar);

  // El token se consulta solo si hay algo que hacer con Meta, y una vez por pasada.
  let token: boolean | undefined;
  const tokenValido = async (): Promise<boolean> => {
    if (token === undefined) {
      try {
        token = await deps.tokenOk();
      } catch {
        token = false;
      }
      if (!token) {
        await unaVezAlDia("aviso_token", "⚠️ El token de Meta no es válido (o no pude verificarlo): el calendario no publica. " +
          "Renueva META_ACCESS_TOKEN (con instagram_content_publish) y corre npm run meta:check.");
      }
    }
    return token;
  };

  if (tareas.length && (await tokenValido())) {
    for (const t of tareas) await procesar(deps, t, semanas, avisar);
  }
  if (deps.modo === "auto") await permalinks(deps, semanas, tokenValido);
}

/** Crea/lee la fila, publica y cierra (estado.json + registro + commit, en ese orden). */
async function procesar(deps: SchedulerDeps, t: Tarea, semanas: SemanaLeida[], avisar: (s: string) => Promise<void>): Promise<void> {
  const id = t.pieza.id;
  const clave = `${t.semana}/${id}|${t.tipo}`;
  let fila = deps.cargarFilas().find((f) => f.piezaId === id && f.tipo === t.tipo);
  if (terminal(fila)) return;
  if (!fila) {
    fila = { piezaId: id, tipo: t.tipo, paso: "inicio", intentos: 0 };
    deps.guardarFila(fila, deps.ahora());
  }
  const s = semanas.find((x) => x.semana === t.semana)!;
  const medios = s.render[id]?.medios ?? { urls: [] };
  const ctx: PublishCtx = {
    graph: deps.graph,
    igUserId: deps.igUserId,
    guardar: (f) => deps.guardarFila(f.error ? { ...f, error: limpiar(deps, f.error) } : f, deps.ahora()),
    dormir: deps.dormir,
    ahora: deps.ahora,
    modo: deps.modo,
    limite: new Date(t.hora.getTime() + (t.tipo === "post" ? LIMITE_POST_MS : STORY_TOPE_MS - STORY_TRAS_MS)),
  };

  let r: Fila;
  try {
    r = t.tipo === "post" ? await publicar(fila, t.pieza, medios, ctx) : await publicarStory(fila, medios, ctx);
  } catch (e) {
    // Quedó sin confirmar (p. ej. red caída al verificar): la fila sigue y el próximo tick la retoma.
    console.warn(`[calendario] ${id} (${t.tipo}): ${limpiar(deps, mensaje(e))}`);
    if (!avisadosPendientes.has(clave)) {
      avisadosPendientes.add(clave);
      await avisar(`⏳ ${id}${t.tipo === "story" ? " (story)" : ""}: no pude confirmar con Meta si se publicó (${mensaje(e)}). Lo reviso en el próximo minuto; no se publicará dos veces.`);
    }
    return;
  }
  avisadosPendientes.delete(clave);

  const en = deps.ahora().toISOString();
  const aviso = deps.modo === "aviso";
  const error = r.error ? limpiar(deps, r.error) : undefined;
  try {
    if (r.paso === "publicado") {
      if (t.tipo === "post") {
        await deps.escribirEstado(t.semana, id, {
          estado: "publicado", containerId: r.containerId, mediaId: r.mediaId, publicadoEn: en,
          ...(aviso ? { motivo: "modo aviso: no se publicó en Instagram" } : {}),
        });
        if (aviso) {
          await deps.anotarRegistro({ tipo: "aviso", pub: "post", piezaId: id, semana: t.semana, mediaId: r.mediaId, en });
        } else if (r.mediaId) {
          const duracionMs = s.render[id]?.medios?.duracionMs;
          await deps.anotarRegistro({
            tipo: "publicado", piezaId: id, mediaId: r.mediaId, semana: t.semana, publicadoEn: en,
            ...(duracionMs !== undefined ? { duracionMs } : {}),
            ...(await datosDelBorrador(deps, t.semana, t.pieza)),
          });
        } else {
          await deps.anotarRegistro({ tipo: "publicado-sin-id", piezaId: id, semana: t.semana, publicadoEn: en, motivo: error });
        }
      } else {
        await deps.escribirEstado(t.semana, id, { story: { estado: "publicado", mediaId: r.mediaId } });
        await deps.anotarRegistro(aviso
          ? { tipo: "aviso", pub: "story", piezaId: id, semana: t.semana, mediaId: r.mediaId, en }
          : { tipo: "story", piezaId: id, semana: t.semana, mediaId: r.mediaId, publicadoEn: en });
      }
      await deps.commit([estadoPath(t.semana), registroPath()], `calendario: ${t.tipo === "story" ? "story" : "publicado"} ${id}`);
      await avisar(aviso
        ? `🧪 Modo aviso: ${id}${t.tipo === "story" ? " (story)" : ""} se habría publicado ahora (sin POST a Meta).`
        : t.tipo === "story"
          ? `📲 Story publicada de ${id}.`
          : `✅ Publicado ${id} (${t.pieza.formato})${r.mediaId ? ` · media ${r.mediaId}` : ` · ${error}`}.`);
    } else if (r.paso === "fallido") {
      const motivo = error ?? "error desconocido";
      await deps.escribirEstado(t.semana, id, t.tipo === "post"
        ? { estado: "fallido", motivo }
        : { story: { estado: "fallido", motivo } });
      await deps.anotarRegistro({ tipo: "fallido", pub: t.tipo, piezaId: id, semana: t.semana, motivo, en });
      await deps.commit([estadoPath(t.semana), registroPath()], `calendario: fallido ${id}${t.tipo === "story" ? " (story)" : ""}`);
      await avisar(`❌ No se publicó ${id}${t.tipo === "story" ? " (story)" : ""}: ${motivo}`);
    }
  } catch (e) {
    // La fila ya quedó en SQLite (manda); `reparar` reescribe estado.json en el próximo tick.
    console.warn(`[calendario] ${id}: no pude escribir estado/registro: ${limpiar(deps, mensaje(e))}`);
  }
}

/** `nombreMotor` y `predictedScore` del borrador; si algo falla, se omiten. */
async function datosDelBorrador(deps: SchedulerDeps, semana: string, p: Pieza): Promise<{ nombreMotor?: string; predictedScore?: number }> {
  const out: { nombreMotor?: string; predictedScore?: number } = {};
  let d: unknown;
  try {
    d = await deps.leerBorrador(semana, p.borrador);
  } catch {
    return out;
  }
  const name = (d as { name?: unknown } | null)?.name;
  if (typeof name === "string") out.nombreMotor = slugify(name);
  try {
    // Import diferido: el registro de plantillas arrastra React.
    const { scoreDraft } = await import("../remix/registry.ts");
    const total = scoreDraft(d as Parameters<typeof scoreDraft>[0]).total;
    if (Number.isFinite(total)) out.predictedScore = total;
  } catch {
    // borrador ilegible para el score: se omite.
  }
  return out;
}

async function saltarPieza(deps: SchedulerDeps, x: Salto, filas: Fila[], avisar: (s: string) => Promise<void>): Promise<void> {
  const story = x.tipo === "story";
  try {
    // Una fila a medias (sin contenedor principal) se cierra para que no se retome tarde.
    const f = filas.find((y) => y.piezaId === x.id && y.tipo === x.tipo);
    if (f && !terminal(f)) deps.guardarFila({ ...f, paso: "fallido", error: `saltado: ${x.motivo}` }, deps.ahora());
    await deps.escribirEstado(x.semana, x.id, story ? { story: { estado: "saltado", motivo: x.motivo } } : { estado: "saltado", motivo: x.motivo });
    await deps.anotarRegistro({ tipo: "saltado", pub: x.tipo, piezaId: x.id, semana: x.semana, motivo: x.motivo, en: deps.ahora().toISOString() });
    await deps.commit([estadoPath(x.semana), registroPath()], `calendario: saltado ${x.id}${story ? " (story)" : ""}`);
    await avisar(`⏭️ ${x.id}${story ? " (story)" : ""} saltada: ${x.motivo}.`);
  } catch (e) {
    console.warn(`[calendario] no pude saltar ${x.id}: ${limpiar(deps, mensaje(e))}`);
  }
}

/**
 * La fila de SQLite manda: si un `git pull` trajo un `estado.json` viejo (o se
 * perdió la escritura), se reescribe el estado desde la fila. Actualiza también
 * la copia en memoria para que `tareasDebidas` vea lo correcto.
 */
async function reparar(deps: SchedulerDeps, semanas: SemanaLeida[], filas: Fila[]): Promise<void> {
  const tocadas = new Set<string>();
  const ordenadas = [...filas].filter(terminal).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "post" ? -1 : 1));
  for (const f of ordenadas) {
    const s = semanas.find((x) => x.plan.piezas.some((p) => p.id === f.piezaId));
    if (!s) continue;
    const est = s.estado[f.piezaId];
    let e: Partial<EstadoEntry> | undefined;
    if (f.tipo === "post") {
      if (f.paso === "publicado" && est?.estado !== "publicado") {
        e = { estado: "publicado", mediaId: f.mediaId, containerId: f.containerId, publicadoEn: est?.publicadoEn ?? f.inicio };
      } else if (f.paso === "fallido" && !cerrado(est?.estado)) {
        const saltado = f.error?.startsWith("saltado: ");
        e = saltado
          ? { estado: "saltado", motivo: f.error!.slice("saltado: ".length) }
          : { estado: "fallido", motivo: f.error ?? "error desconocido" };
      }
    } else if (est) {
      if (f.paso === "publicado" && est.story?.estado !== "publicado") e = { story: { estado: "publicado", mediaId: f.mediaId } };
      else if (f.paso === "fallido" && !cerrado(est.story?.estado)) e = { story: { estado: "fallido", motivo: f.error } };
    }
    if (!e) continue;
    try {
      await deps.escribirEstado(s.semana, f.piezaId, e);
      const prev = s.estado[f.piezaId];
      s.estado[f.piezaId] = { ...prev, ...e, ...(e.story ? { story: { ...prev?.story, ...e.story } } : {}) } as EstadoEntry;
      tocadas.add(s.semana);
    } catch (err) {
      console.warn(`[calendario] no pude reparar estado de ${f.piezaId}: ${mensaje(err)}`);
    }
  }
  if (tocadas.size) {
    await deps.commit([...tocadas].map(estadoPath), "calendario: estado.json reparado desde publicaciones").catch(() => undefined);
  }
}

/** Al día siguiente: `GET {media}?fields=permalink` → estado.json + registro. */
async function permalinks(deps: SchedulerDeps, semanas: SemanaLeida[], tokenValido: () => Promise<boolean>): Promise<void> {
  const t = deps.ahora().getTime();
  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      const est = s.estado[p.id];
      if (est?.estado !== "publicado" || !est.mediaId || est.permalink || est.mediaId.startsWith("aviso-")) continue;
      const pub = Date.parse(est.publicadoEn ?? "");
      if (Number.isNaN(pub) || t < pub + PERMALINK_TRAS_MS) continue;
      const clave = `${s.semana}/${p.id}/${est.mediaId}`;
      const ultimo = intentosPermalink.get(clave);
      if (ultimo !== undefined && t - ultimo < 3_600_000 && t >= ultimo) continue;
      intentosPermalink.set(clave, t);
      if (!(await tokenValido())) return;
      try {
        const r = await deps.graph.get<{ permalink?: string }>(est.mediaId, { fields: "permalink" });
        if (typeof r?.permalink !== "string" || !r.permalink) continue;
        await deps.escribirEstado(s.semana, p.id, { permalink: r.permalink });
        est.permalink = r.permalink;
        await deps.anotarRegistro({ tipo: "permalink", piezaId: p.id, semana: s.semana, mediaId: est.mediaId, permalink: r.permalink });
        await deps.commit([estadoPath(s.semana), registroPath()], `calendario: permalink ${p.id}`);
      } catch (e) {
        console.warn(`[calendario] permalink de ${p.id}: ${limpiar(deps, mensaje(e))}`);
      }
    }
  }
}

// --- I/O real (servidor) ---

interface FilaDb {
  pieza_id: string; tipo: string; paso: string; container_id: string | null; children: string | null;
  media_id: string | null; intentos: number; actualizado: string; error: string | null;
}

/** Filas de `publicaciones`. En `publicando`/`publicado`, `actualizado` es el `inicio` del publish. */
export function cargarFilasDb(): Fila[] {
  const rows = openDb().prepare(
    "SELECT pieza_id, tipo, paso, container_id, children, media_id, intentos, actualizado, error FROM publicaciones",
  ).all() as unknown as FilaDb[];
  const out: Fila[] = [];
  for (const r of rows) {
    if (r.tipo !== "post" && r.tipo !== "story") continue;
    let children: string[] | undefined;
    try {
      const c: unknown = r.children ? JSON.parse(r.children) : undefined;
      children = Array.isArray(c) ? c.map(String) : undefined;
    } catch {
      children = undefined;
    }
    const paso = r.paso as Fila["paso"];
    out.push({
      piezaId: r.pieza_id, tipo: r.tipo, paso,
      containerId: r.container_id ?? undefined, children, mediaId: r.media_id ?? undefined,
      intentos: Number(r.intentos) || 0, error: r.error ?? undefined,
      inicio: paso === "publicando" || paso === "publicado" ? r.actualizado : undefined,
    });
  }
  return out;
}

/** Inserta o actualiza la fila (PK pieza_id + tipo). */
export function guardarFilaDb(f: Fila, ahora: Date): void {
  const actualizado = (f.paso === "publicando" || f.paso === "publicado") && f.inicio ? f.inicio : ahora.toISOString();
  openDb().prepare(
    `INSERT INTO publicaciones (pieza_id, tipo, paso, container_id, children, media_id, intentos, actualizado, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pieza_id, tipo) DO UPDATE SET paso = excluded.paso, container_id = excluded.container_id,
       children = excluded.children, media_id = excluded.media_id, intentos = excluded.intentos,
       actualizado = excluded.actualizado, error = excluded.error`,
  ).run(
    f.piezaId, f.tipo, f.paso, f.containerId ?? null, f.children ? JSON.stringify(f.children) : null,
    f.mediaId ?? null, f.intentos, actualizado, f.error ?? null,
  );
}

export function leerClaveDb(clave: string): string | undefined {
  const r = openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get(clave) as { valor?: string } | undefined;
  return r?.valor;
}

export function guardarClaveDb(clave: string, valor: string): void {
  openDb().prepare(
    "INSERT INTO calendario_estado (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
  ).run(clave, valor);
}

/** Lee `<semana>/<archivo>` como JSON. Solo un nombre de archivo .json, nunca una ruta. */
export async function leerBorradorDisco(semana: string, archivo: string): Promise<unknown> {
  if (basename(archivo) !== archivo || !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(archivo) || archivo.includes("..")) {
    throw new Error(`Borrador inválido: ${archivo}`);
  }
  return JSON.parse(await readFile(join(semanaDir(semana), archivo), "utf8"));
}

/** ¿Token válido? `tokenDaysLeft` lanza si no lo es; sin red también cuenta como no válido. */
async function tokenOkReal(): Promise<boolean> {
  try {
    const d = await tokenDaysLeft();
    return d === undefined || d >= 0;
  } catch {
    return false;
  }
}

/** Dependencias reales del servidor (Task 11 las usa con su `avisar` de Telegram). */
export function depsReales(o: { modo: "auto" | "aviso"; avisar: (texto: string) => Promise<void> }): SchedulerDeps {
  const cfg = metaConfig();
  return {
    graph: {
      get: <T>(p: string, q?: Record<string, string | number | undefined>) => graphGet<T>(p, q),
      post: (p, q) => graphPostForm(p, q),
    },
    igUserId: cfg.igUserId,
    modo: o.modo,
    ahora: () => new Date(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    avisar: o.avisar,
    tokenOk: tokenOkReal,
    listarSemanas,
    leerSemana,
    cargarFilas: cargarFilasDb,
    guardarFila: guardarFilaDb,
    leerClave: leerClaveDb,
    guardarClave: guardarClaveDb,
    escribirEstado,
    anotarRegistro,
    commit: commitPaths,
    leerBorrador: leerBorradorDisco,
    mediaToken: process.env.MEDIA_PUBLIC_TOKEN?.trim() || undefined,
  };
}
