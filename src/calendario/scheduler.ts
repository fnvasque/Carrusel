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
  type EstadoEntry, type Estado, type Pieza, type RenderEntry, type SemanaLeida,
} from "./plan.ts";
import { ErrorAmbiguo, PREFIJO_SALTO, publicar, publicarStory, type Fila, type Graph, type PublishCtx } from "./publish.ts";
import { anotarRegistro, escribirEstado, estadoPath, registroPath } from "./registro.ts";
import { addDays, localParts, weekMonday, zonedToUtc } from "./time.ts";

/**
 * Scheduler del calendario: cada minuto (el `setInterval` lo pone `bot.ts`, Task 11)
 * mira qué piezas tocan y las publica en serie. La tabla `publicaciones` (SQLite)
 * manda: una fila `publicado`/`fallido` jamás vuelve a publicarse, aunque un
 * `git pull` traiga un `estado.json` viejo. Todo salto también deja una fila
 * terminal (R27). La clave de la fila es `"<semana>/<id>"` (R20).
 * `estado.json` y `registro.jsonl` se escriben DESPUÉS de persistir la fila, y el
 * commit al final; `reparar` completa lo que falte si el proceso cayó entremedio.
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

/** Ventana de publicación: hasta 15 min después de la hora. Después no se crea ningún contenedor (R26). */
export const VENTANA_MS = 15 * 60_000;
/** Un contenedor creado dentro de la ventana se termina hasta 25 min después de la hora (ventana + sondeo de 10 min). */
export const REANUDAR_MS = VENTANA_MS + 10 * 60_000;
/** La story sale 60 min después del post, y se descarta si pasaron 6 h (R24, también en `esperando`). */
export const STORY_TRAS_MS = 60 * 60_000;
export const STORY_TOPE_MS = 6 * 3_600_000;
/** Al día siguiente (≥ 20 h) se pide el permalink. */
export const PERMALINK_TRAS_MS = 20 * 3_600_000;
/** `publicando` sin confirmar: se reconsulta cada 15 min y se deja de consultar a las 2 h. */
export const REVERIFICAR_MS = 15 * 60_000;
export const RENDIRSE_MS = 2 * 3_600_000;

const MOTIVO_STORY_TARDE = "la story ya no se publica: pasaron 6 h desde el post";

/** Clave de la fila en `publicaciones` (R20): el mismo id en otra semana es otra pieza. */
export const claveFila = (semana: string, id: string): string => `${semana}/${id}`;
/** Semana e id de una clave `"<semana>/<id>"` (undefined si no tiene ese formato). */
export function partirClave(clave: string): { semana: string; id: string } | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})\/([a-z0-9-]{3,80})$/.exec(clave);
  return m ? { semana: m[1], id: m[2] } : undefined;
}

const terminal = (f?: Fila): boolean => f?.paso === "publicado" || f?.paso === "fallido";
const cerrado = (e?: Estado): boolean => e === "publicado" || e === "fallido" || e === "saltado";
const esSalto = (f: Fila): boolean => f.paso === "fallido" && (f.error ?? "").startsWith(PREFIJO_SALTO);

/**
 * Qué publicar ahora y qué marcar `saltado`. Función pura.
 * - Post sin contenedor: debido si `ahora ∈ [hora, hora + 15 min)` y `programado`/
 *   `renderizado` con medios; después, `saltado` ("no se publica tarde" o "pausado").
 *   Sin render a la hora → "falta el render"; render fallido → "render fallido: …".
 * - Post en `esperando` (contenedor creado): se termina hasta hora + 25 min, salvo
 *   pausa; con pausa y la ventana pasada → "pausado" (R24).
 * - `publicando`: siempre se retoma para verificar (salvo pausa), cada 15 min, y
 *   se deja de consultar cuando la fila está `rendida`.
 * - Story: debida a `publicadoEn + 60 min` si el post está `publicado`; tras 6 h se
 *   descarta, aunque esté en `esperando` (R24).
 * - Una fila con `proximo` en el futuro espera (reintento programado, R25).
 * - Primero las piezas nuevas cuya hora llegó, después las reanudaciones (R25).
 */
export function tareasDebidas(
  semanas: SemanaLeida[],
  filas: Fila[],
  ahora: Date,
  pausado: boolean,
): { publicar: Tarea[]; saltar: Salto[] } {
  const nuevas: Tarea[] = [];
  const reanudar: Tarea[] = [];
  const saltar: Salto[] = [];
  const t = ahora.getTime();
  const porClave = new Map(filas.map((f) => [`${f.piezaId}|${f.tipo}`, f]));
  const listo = (f?: Fila): boolean => !f?.proximo || !(t < Date.parse(f.proximo));

  for (const s of semanas) {
    for (const p of s.plan.piezas) {
      let hora: Date;
      try {
        hora = zonedToUtc(p.dia, p.hora);
      } catch {
        continue; // el plan ya viene validado; por si acaso, no se adivina la hora.
      }
      const h = hora.getTime();
      const clave = claveFila(s.semana, p.id);
      const est = s.estado[p.id];
      const r: RenderEntry | undefined = s.render[p.id];
      const salta = (motivo: string, tipo: "post" | "story" = "post"): void => {
        saltar.push({ semana: s.semana, id: p.id, motivo, tipo });
      };

      // --- post ---
      const fp = porClave.get(`${clave}|post`);
      if (terminal(fp) || fp?.rendida) {
        // cerrado o abandonado: nunca más.
      } else if (fp?.paso === "publicando") {
        // Pudo publicarse: jamás se salta, solo se verifica.
        if (!pausado && listo(fp)) reanudar.push({ semana: s.semana, pieza: p, tipo: "post", hora });
      } else if (fp?.paso === "esperando") {
        if (pausado) {
          if (t >= h + VENTANA_MS) salta("pausado");
        } else if (t >= h + REANUDAR_MS) {
          salta("no se publica tarde");
        } else if (listo(fp)) {
          reanudar.push({ semana: s.semana, pieza: p, tipo: "post", hora });
        }
      } else {
        const ef = estadoEfectivo(p, r, est);
        const abierto = est ? !cerrado(est.estado) : (r?.estado === "fallido" || !cerrado(ef));
        if (abierto && t >= h) {
          const conRender = r?.estado === "renderizado" && r.medios !== undefined;
          if (r?.estado === "fallido") salta(`render fallido: ${r.motivo ?? "sin motivo"}`);
          else if (!conRender) salta("falta el render");
          else if (t >= h + VENTANA_MS) salta(pausado ? "pausado" : "no se publica tarde");
          else if (!pausado && listo(fp)) (fp ? reanudar : nuevas).push({ semana: s.semana, pieza: p, tipo: "post", hora });
        }
      }

      // --- story ---
      const fs = porClave.get(`${clave}|story`);
      if (terminal(fs) || fs?.rendida) continue;
      const pub = est?.estado === "publicado" ? Date.parse(est.publicadoEn ?? "") : NaN;
      const horaStory = new Date(Number.isNaN(pub) ? t : pub + STORY_TRAS_MS);
      const vencida = !Number.isNaN(pub) && t >= pub + STORY_TOPE_MS;
      if (fs?.paso === "publicando") {
        if (!pausado && listo(fs)) reanudar.push({ semana: s.semana, pieza: p, tipo: "story", hora: horaStory });
        continue;
      }
      if (fs?.paso === "esperando") {
        if (vencida) salta(pausado ? "pausado" : MOTIVO_STORY_TARDE, "story");
        else if (!pausado && listo(fs)) reanudar.push({ semana: s.semana, pieza: p, tipo: "story", hora: horaStory });
        continue;
      }
      if (Number.isNaN(pub) || cerrado(est?.story?.estado)) continue;
      if (t < pub + STORY_TRAS_MS) continue;
      if (vencida) salta(pausado ? "pausado" : MOTIVO_STORY_TARDE, "story");
      else if (!pausado && listo(fs)) (fs ? reanudar : nuevas).push({ semana: s.semana, pieza: p, tipo: "story", hora: horaStory });
    }
  }
  const porHora = (a: Tarea, b: Tarea): number => a.hora.getTime() - b.hora.getTime();
  return { publicar: [...nuevas.sort(porHora), ...reanudar.sort(porHora)], saltar };
}

/** Todo el I/O de `tick` (Ruling 4). `depsReales` arma el del servidor. */
export interface SchedulerDeps {
  graph: Graph;
  igUserId: string;
  modo: "auto" | "aviso";
  ahora: () => Date;
  dormir: (ms: number) => Promise<void>;
  /** Aviso al admin (Telegram). Los textos ya llegan sin token de medios. */
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
  /** Líneas de `registro.jsonl` (para reparar una línea `publicado` perdida). Sin esto, no se repara el registro. */
  leerRegistro?: () => Promise<Record<string, unknown>[]>;
  commit: (paths: string[], mensaje: string) => Promise<unknown>;
  /** JSON del borrador `<semana>/<archivo>` (para nombreMotor y predictedScore). */
  leerBorrador: (semana: string, archivo: string) => Promise<unknown>;
  /** MEDIA_PUBLIC_TOKEN: se reemplaza por *** en todo lo que sale (avisos, estado, registro, filas). */
  mediaToken?: string;
}

/** Valor de `calendario_estado.pausado` que significa "en pausa". */
export const esPausado = (v: string | undefined): boolean => v !== undefined && /^(1|true|s[ií])$/i.test(v.trim());

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Candado en memoria: el setInterval de 60 s se solapa si un sondeo tarda 10 min.
let enCurso = false;
/** Memoria del proceso, una por juego de dependencias (el servidor arma uno solo). */
interface Memoria {
  /** Avisos de "no pude confirmar" ya enviados (uno por fila hasta que se resuelva). */
  avisadosPendientes: Set<string>;
  /** Último intento de permalink por pieza (reintento cada hora si falla). */
  intentosPermalink: Map<string, number>;
  /** media_id con su línea `publicado` ya comprobada en registro.jsonl. */
  registroVisto: Set<string>;
}
const memorias = new WeakMap<SchedulerDeps, Memoria>();
function memoria(deps: SchedulerDeps): Memoria {
  let m = memorias.get(deps);
  if (!m) {
    m = { avisadosPendientes: new Set(), intentosPermalink: new Map(), registroVisto: new Set() };
    memorias.set(deps, m);
  }
  return m;
}

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

type Avisar = (texto: string) => Promise<void>;

async function pasada(deps: SchedulerDeps): Promise<void> {
  const ahora = deps.ahora();
  const hoy = localParts(ahora).dia;
  const avisar: Avisar = async (texto) => {
    try {
      await deps.avisar(limpiar(deps, texto));
    } catch (e) {
      // Solo el tipo de error: el mensaje podría arrastrar la URL del bot con su token.
      console.warn(`[calendario] no pude avisar por Telegram (${e instanceof Error ? e.name : typeof e}).`);
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

const etiqueta = (id: string, tipo: "post" | "story"): string => `${id}${tipo === "story" ? " (story)" : ""}`;

/** Crea/lee la fila, publica y cierra (estado.json + registro + commit, en ese orden). */
async function procesar(deps: SchedulerDeps, t: Tarea, semanas: SemanaLeida[], avisar: Avisar): Promise<void> {
  const id = t.pieza.id;
  const clave = claveFila(t.semana, id);
  const pend = `${clave}|${t.tipo}`;
  const buscar = (): Fila | undefined => deps.cargarFilas().find((f) => f.piezaId === clave && f.tipo === t.tipo);
  let fila = buscar();
  if (terminal(fila) || fila?.rendida) return;
  if (!fila) {
    fila = { piezaId: clave, tipo: t.tipo, paso: "inicio", intentos: 0 };
    deps.guardarFila(fila, deps.ahora());
  }
  const s = semanas.find((x) => x.semana === t.semana)!;
  const medios = s.render[id]?.medios ?? { urls: [] };
  // Post: contenedores nuevos solo hasta hora + 15 min (R26); publicar uno listo, hasta + 25 min.
  // Story: todo hasta publicadoEn + 6 h (t.hora = publicadoEn + 60 min).
  const base = t.hora.getTime();
  const ctx: PublishCtx = {
    graph: deps.graph,
    igUserId: deps.igUserId,
    guardar: (f) => deps.guardarFila(f.error ? { ...f, error: limpiar(deps, f.error) } : f, deps.ahora()),
    dormir: deps.dormir,
    ahora: deps.ahora,
    modo: deps.modo,
    limite: new Date(base + (t.tipo === "post" ? VENTANA_MS : STORY_TOPE_MS - STORY_TRAS_MS)),
    limitePublicar: new Date(base + (t.tipo === "post" ? REANUDAR_MS : STORY_TOPE_MS - STORY_TRAS_MS)),
  };

  let r: Fila;
  try {
    r = t.tipo === "post" ? await publicar(fila, t.pieza, medios, ctx) : await publicarStory(fila, medios, ctx);
  } catch (e) {
    await sinConfirmar(deps, t, buscar(), e, avisar);
    return;
  }
  memoria(deps).avisadosPendientes.delete(pend);
  if (!terminal(r)) return; // reintento programado (`proximo`): lo retoma un tick posterior.

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
          await deps.anotarRegistro(await lineaPublicado(deps, t.semana, t.pieza, r.mediaId, en, s.render[id]));
          memoria(deps).registroVisto.add(r.mediaId);
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
        ? `🧪 Modo aviso: ${etiqueta(id, t.tipo)} se habría publicado ahora (sin POST a Meta).`
        : t.tipo === "story"
          ? `📲 Story publicada de ${id}.`
          : `✅ Publicado ${id} (${t.pieza.formato})${r.mediaId ? ` · media ${r.mediaId}` : ` · ${error}`}.`);
    } else if (error?.startsWith(PREFIJO_SALTO)) {
      await cerrarSalto(deps, { semana: t.semana, id, tipo: t.tipo, motivo: error.slice(PREFIJO_SALTO.length) }, avisar);
    } else {
      const motivo = error ?? "error desconocido";
      await deps.escribirEstado(t.semana, id, t.tipo === "post"
        ? { estado: "fallido", motivo }
        : { story: { estado: "fallido", motivo } });
      await deps.anotarRegistro({ tipo: "fallido", pub: t.tipo, piezaId: id, semana: t.semana, motivo, en });
      await deps.commit([estadoPath(t.semana), registroPath()], `calendario: fallido ${etiqueta(id, t.tipo)}`);
      await avisar(`❌ No se publicó ${etiqueta(id, t.tipo)}: ${motivo}`);
    }
  } catch (e) {
    // La fila ya quedó en SQLite (manda); `reparar` completa estado.json y el registro en el próximo tick.
    console.warn(`[calendario] ${id}: no pude escribir estado/registro: ${limpiar(deps, mensaje(e))}`);
  }
}

/**
 * La fila quedó en `publicando` sin confirmar (red caída o ambigüedad). Se
 * reconsulta cada 15 min; a las 2 h desde el intento se deja de consultar y se
 * avisa una sola vez para que el admin revise en la app.
 */
async function sinConfirmar(deps: SchedulerDeps, t: Tarea, f: Fila | undefined, e: unknown, avisar: Avisar): Promise<void> {
  const id = t.pieza.id;
  const pend = `${claveFila(t.semana, id)}|${t.tipo}`;
  const msg = limpiar(deps, mensaje(e));
  console.warn(`[calendario] ${etiqueta(id, t.tipo)}: ${msg}`);
  if (!f || terminal(f)) return;
  const ahora = deps.ahora().getTime();
  if (f.paso !== "publicando") {
    deps.guardarFila({ ...f, proximo: new Date(ahora + 60_000).toISOString() }, deps.ahora());
    return;
  }
  const inicio = Date.parse(f.inicio ?? "");
  if (!Number.isNaN(inicio) && ahora - inicio >= RENDIRSE_MS) {
    deps.guardarFila({ ...f, rendida: true, proximo: undefined, error: msg }, deps.ahora());
    memoria(deps).avisadosPendientes.delete(pend);
    await avisar(`⚠️ ${etiqueta(id, t.tipo)}: llevo 2 h sin poder confirmar si se publicó (${msg}). ` +
      "Revisa en la app si salió; no vuelvo a consultar ni a publicar esta pieza.");
    return;
  }
  deps.guardarFila({ ...f, proximo: new Date(ahora + REVERIFICAR_MS).toISOString(), error: msg }, deps.ahora());
  if (!memoria(deps).avisadosPendientes.has(pend)) {
    memoria(deps).avisadosPendientes.add(pend);
    await avisar(e instanceof ErrorAmbiguo
      ? `⚠️ ${etiqueta(id, t.tipo)}: ${msg}`
      : `⏳ ${etiqueta(id, t.tipo)}: no pude confirmar con Meta si se publicó (${msg}). Lo reviso cada 15 min; no se publicará dos veces.`);
  }
}

/** Línea `publicado` de registro.jsonl (T3; R23 agrega señal, tema, arquetipo, hookCategoria y formato). */
async function lineaPublicado(
  deps: SchedulerDeps, semana: string, p: Pieza, mediaId: string, publicadoEn: string, render?: RenderEntry,
): Promise<Record<string, unknown>> {
  const duracionMs = render?.medios?.duracionMs;
  return {
    tipo: "publicado", piezaId: p.id, mediaId, semana, publicadoEn,
    ...(duracionMs !== undefined ? { duracionMs } : {}),
    ...(await datosDelBorrador(deps, semana, p)),
    senal: p.senal, tema: p.tema, arquetipo: p.arquetipo, hookCategoria: p.hook.categoria, formato: p.formato,
  };
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

/** Salto (R27): primero la fila terminal en SQLite, después estado.json, registro, commit y aviso. */
async function saltarPieza(deps: SchedulerDeps, x: Salto, filas: Fila[], avisar: Avisar): Promise<void> {
  const clave = claveFila(x.semana, x.id);
  try {
    const f = filas.find((y) => y.piezaId === clave && y.tipo === x.tipo);
    if (f?.paso === "publicando") return; // defensa: algo que pudo publicarse nunca se salta.
    if (!terminal(f)) {
      deps.guardarFila({
        piezaId: clave, tipo: x.tipo, intentos: f?.intentos ?? 0, containerId: f?.containerId, children: f?.children,
        paso: "fallido", error: `${PREFIJO_SALTO}${x.motivo}`,
      }, deps.ahora());
    }
    await cerrarSalto(deps, x, avisar);
  } catch (e) {
    console.warn(`[calendario] no pude saltar ${x.id}: ${limpiar(deps, mensaje(e))}`);
  }
}

async function cerrarSalto(deps: SchedulerDeps, x: Salto, avisar: Avisar): Promise<void> {
  const story = x.tipo === "story";
  await deps.escribirEstado(x.semana, x.id, story ? { story: { estado: "saltado", motivo: x.motivo } } : { estado: "saltado", motivo: x.motivo });
  await deps.anotarRegistro({ tipo: "saltado", pub: x.tipo, piezaId: x.id, semana: x.semana, motivo: x.motivo, en: deps.ahora().toISOString() });
  await deps.commit([estadoPath(x.semana), registroPath()], `calendario: saltado ${etiqueta(x.id, x.tipo)}`);
  await avisar(`⏭️ ${etiqueta(x.id, x.tipo)} saltada: ${x.motivo}.`);
}

/**
 * La fila de SQLite manda: si un `git pull` trajo un `estado.json` viejo (o el
 * proceso cayó antes de escribirlo), se reescribe el estado desde la fila, y se
 * anota la línea `publicado` de registro.jsonl si falta (idempotente: se busca por
 * `mediaId`). Actualiza también la copia en memoria para `tareasDebidas`.
 */
async function reparar(deps: SchedulerDeps, semanas: SemanaLeida[], filas: Fila[]): Promise<void> {
  const tocadas = new Set<string>();
  let registro: Set<string> | undefined;
  const enRegistro = async (mediaId: string): Promise<boolean | undefined> => {
    if (memoria(deps).registroVisto.has(mediaId)) return true;
    if (!deps.leerRegistro) return undefined;
    if (!registro) {
      registro = new Set((await deps.leerRegistro())
        .filter((l) => l.tipo === "publicado" && typeof l.mediaId === "string")
        .map((l) => l.mediaId as string));
    }
    return registro.has(mediaId);
  };
  const ordenadas = filas.filter(terminal).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "post" ? -1 : 1));
  for (const f of ordenadas) {
    const k = partirClave(f.piezaId);
    const s = k && semanas.find((x) => x.semana === k.semana);
    const p = k && s?.plan.piezas.find((y) => y.id === k.id);
    if (!k || !s || !p) continue;
    const est = s.estado[k.id];
    let e: Partial<EstadoEntry> | undefined;
    if (f.tipo === "post") {
      if (f.paso === "publicado" && est?.estado !== "publicado") {
        e = { estado: "publicado", mediaId: f.mediaId, containerId: f.containerId, publicadoEn: est?.publicadoEn ?? f.inicio };
      } else if (f.paso === "fallido" && !cerrado(est?.estado)) {
        e = esSalto(f)
          ? { estado: "saltado", motivo: f.error!.slice(PREFIJO_SALTO.length) }
          : { estado: "fallido", motivo: f.error ?? "error desconocido" };
      }
    } else if (est) {
      if (f.paso === "publicado" && est.story?.estado !== "publicado") e = { story: { estado: "publicado", mediaId: f.mediaId } };
      else if (f.paso === "fallido" && !cerrado(est.story?.estado)) {
        e = { story: esSalto(f)
          ? { estado: "saltado", motivo: f.error!.slice(PREFIJO_SALTO.length) }
          : { estado: "fallido", motivo: f.error } };
      }
    }
    try {
      if (e) {
        await deps.escribirEstado(s.semana, k.id, e);
        const prev = s.estado[k.id];
        s.estado[k.id] = { ...prev, ...e, ...(e.story ? { story: { ...prev?.story, ...e.story } } : {}) } as EstadoEntry;
        tocadas.add(s.semana);
      }
      // Línea `publicado` perdida (caída entre la fila y anotarRegistro).
      if (f.tipo === "post" && f.paso === "publicado" && f.mediaId && !f.mediaId.startsWith("aviso-")) {
        const ya = await enRegistro(f.mediaId);
        if (ya === false) {
          const publicadoEn = s.estado[k.id]?.publicadoEn ?? f.inicio ?? deps.ahora().toISOString();
          await deps.anotarRegistro(await lineaPublicado(deps, s.semana, p, f.mediaId, publicadoEn, s.render[k.id]));
          registro?.add(f.mediaId);
          tocadas.add(s.semana);
        }
        if (ya !== undefined) memoria(deps).registroVisto.add(f.mediaId);
      }
    } catch (err) {
      console.warn(`[calendario] no pude reparar ${f.piezaId}: ${limpiar(deps, mensaje(err))}`);
    }
  }
  if (tocadas.size) {
    await deps.commit([...[...tocadas].map(estadoPath), registroPath()], "calendario: estado y registro reparados desde publicaciones")
      .catch(() => undefined);
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
      const ultimo = memoria(deps).intentosPermalink.get(clave);
      if (ultimo !== undefined && t - ultimo < 3_600_000 && t >= ultimo) continue;
      memoria(deps).intentosPermalink.set(clave, t);
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

/**
 * La columna `children` guarda JSON: un arreglo (solo hijos) o un objeto
 * `{ children?, inicio?, proximo?, rendida? }` con los datos de control de la fila
 * (sin cambiar el esquema de db.ts). `actualizado` es siempre la última escritura.
 */
interface Extra { children?: string[]; inicio?: string; proximo?: string; rendida?: boolean }

/** Filas de `publicaciones` (clave `"<semana>/<id>"`). */
export function cargarFilasDb(): Fila[] {
  const rows = openDb().prepare(
    "SELECT pieza_id, tipo, paso, container_id, children, media_id, intentos, actualizado, error FROM publicaciones",
  ).all() as unknown as FilaDb[];
  const out: Fila[] = [];
  for (const r of rows) {
    if (r.tipo !== "post" && r.tipo !== "story") continue;
    let extra: Extra = {};
    try {
      const c: unknown = r.children ? JSON.parse(r.children) : undefined;
      if (Array.isArray(c)) extra = { children: c.map(String) };
      else if (c && typeof c === "object") extra = c as Extra;
    } catch {
      extra = {};
    }
    out.push({
      piezaId: r.pieza_id, tipo: r.tipo, paso: r.paso as Fila["paso"],
      containerId: r.container_id ?? undefined, mediaId: r.media_id ?? undefined,
      intentos: Number(r.intentos) || 0, error: r.error ?? undefined,
      ...(Array.isArray(extra.children) ? { children: extra.children.map(String) } : {}),
      ...(typeof extra.inicio === "string" ? { inicio: extra.inicio } : {}),
      ...(typeof extra.proximo === "string" ? { proximo: extra.proximo } : {}),
      ...(extra.rendida === true ? { rendida: true } : {}),
    });
  }
  return out;
}

/** Inserta o actualiza la fila (PK pieza_id + tipo). */
export function guardarFilaDb(f: Fila, ahora: Date): void {
  const extra: Extra = {};
  if (f.children) extra.children = f.children;
  if (f.inicio) extra.inicio = f.inicio;
  if (f.proximo) extra.proximo = f.proximo;
  if (f.rendida) extra.rendida = true;
  const children = Object.keys(extra).length ? JSON.stringify(extra) : null;
  openDb().prepare(
    `INSERT INTO publicaciones (pieza_id, tipo, paso, container_id, children, media_id, intentos, actualizado, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pieza_id, tipo) DO UPDATE SET paso = excluded.paso, container_id = excluded.container_id,
       children = excluded.children, media_id = excluded.media_id, intentos = excluded.intentos,
       actualizado = excluded.actualizado, error = excluded.error`,
  ).run(f.piezaId, f.tipo, f.paso, f.containerId ?? null, children, f.mediaId ?? null, f.intentos, ahora.toISOString(), f.error ?? null);
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

/** Líneas de registro.jsonl (las corruptas se ignoran; sin archivo, ninguna). */
export async function leerRegistroDisco(): Promise<Record<string, unknown>[]> {
  let texto: string;
  try {
    texto = await readFile(registroPath(), "utf8");
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const l of texto.split("\n")) {
    if (!l.trim()) continue;
    try {
      const o: unknown = JSON.parse(l);
      if (o && typeof o === "object" && !Array.isArray(o)) out.push(o as Record<string, unknown>);
    } catch {
      // línea corrupta: se ignora.
    }
  }
  return out;
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
    leerRegistro: leerRegistroDisco,
    commit: commitPaths,
    leerBorrador: leerBorradorDisco,
    mediaToken: process.env.MEDIA_PUBLIC_TOKEN?.trim() || undefined,
  };
}
