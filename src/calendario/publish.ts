import { GraphError } from "../meta/client.ts";
import type { GraphGetFn } from "../insights/client.ts";
import type { Medios, Pieza } from "./plan.ts";

/**
 * Publicación idempotente en Instagram (Graph API de contenido). Máquina de
 * estados por (pieza, tipo):
 *
 *   inicio → hijos (solo carrusel) → contenedor → esperando → publicando → publicado
 *                                                                     ↘ fallido
 *
 * Invariante de la que depende todo: **a lo más un `media_publish` exitoso por
 * (pieza, tipo)**. Para eso:
 * - la fila se persiste (`ctx.guardar`) ANTES de cada POST que avanza de paso, así
 *   que la fila guardada nunca va adelante del trabajo hecho;
 * - una fila que llega en `publicando` (reinicio entre el POST y su respuesta) o un
 *   `media_publish` que falla por red NUNCA se reintentan a ciegas: primero se
 *   pregunta a Meta por el contenedor (`status_code`). Solo si está `PUBLISHED` se
 *   busca el post propio (R28); si sigue `FINISHED`, no se publicó y se publica.
 *
 * Nunca duerme minutos (R25): un reintento por URL caída se anota en la fila como
 * `proximo` y lo retoma el tick siguiente. Solo el sondeo de `status_code` (15 s)
 * y la pausa antes de verificar (30 s) ocurren dentro de la llamada.
 *
 * Todo el I/O entra por `ctx` (graph, reloj, dormir, guardar): se prueba con un
 * Meta falso, sin red.
 */

export type Paso = "inicio" | "hijos" | "contenedor" | "esperando" | "publicando" | "publicado" | "fallido";

export interface Fila {
  /** Clave de la fila: `"<semana>/<id>"` (R20). Los tests de `publish` pueden usar el id solo. */
  piezaId: string;
  tipo: "post" | "story";
  paso: Paso;
  containerId?: string;
  children?: string[];
  mediaId?: string;
  intentos: number;
  /** Último error. Un `fallido` cuyo error empieza con `"saltado: "` es un salto (no se publica tarde). */
  error?: string;
  /** Instante (ISO) en que se guardó `publicando`, justo antes del primer `media_publish`. */
  inicio?: string;
  /** No retomar antes de este instante (ISO): reintento programado (R25). */
  proximo?: string;
  /** `publicando` sin confirmar tras 2 h: se avisó al admin y no se vuelve a consultar. */
  rendida?: boolean;
  /** R32: sondeos de `status_code` que dieron FINISHED tras un `media_publish` ambiguo. */
  resondeos?: number;
  /** R29: los reintentos son por URL caída (contenedor en ERROR/EXPIRED): valen hasta `limiteReintento`. */
  urlCaida?: boolean;
}

export interface Graph {
  get: GraphGetFn;
  post: (path: string, params: Record<string, string | number | boolean | undefined>) => Promise<Record<string, unknown>>;
}

export interface PublishCtx {
  graph: Graph;
  igUserId: string;
  guardar: (f: Fila) => void;
  dormir: (ms: number) => Promise<void>;
  ahora: () => Date;
  modo: "auto" | "aviso";
  /** Después de este instante no se crea el PRIMER contenedor (R26: post = hora + 15 min). */
  limite?: Date;
  /**
   * Tope para los reintentos de una pieza cuyo primer intento sí empezó a tiempo
   * (R29: URL caída → hasta hora + 30 min). Sin él, vale `limite`.
   */
  limiteReintento?: Date;
  /** Después de este instante no se hace `media_publish` de un contenedor que no se publicó. */
  limitePublicar?: Date;
  /**
   * `true` (el scheduler): nunca espera minutos; los reintentos y re-sondeos quedan en
   * la fila como `proximo` y los retoma un tick posterior (R25, R32). Sin él (llamada
   * directa), espera dentro de la llamada con `dormir` y termina la secuencia.
   */
  diferido?: boolean;
}

/** Error de Meta (contenido, permiso, token, cuota): no se reintenta. */
export class ErrorDeMeta extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorDeMeta";
  }
}

/** Error pasajero (red, 5xx, URL de medios caída): se reintenta. */
export class ErrorTransitorio extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorTransitorio";
  }
}

/** El contenedor está PUBLISHED y hay más de un post que podría ser el nuestro: no se adivina (R28). */
export class ErrorAmbiguo extends ErrorTransitorio {
  constructor(message: string) {
    super(message);
    this.name = "ErrorAmbiguo";
  }
}

/** Sondeo de `status_code` cada 15 s, tope 10 min (40 sondeos). */
export const SONDEO_MS = 15_000;
export const MAX_SONDEOS = 40;
/** URL caída: espera hasta el reintento (lo retoma un tick posterior) y tope de reintentos. */
export const ESPERA_REINTENTO_MS = 10 * 60_000;
/** Error de red al crear un contenedor: se reintenta en el tick siguiente. */
export const ESPERA_RED_MS = 60_000;
export const MAX_REINTENTOS = 3;
/** R32: tras un `media_publish` ambiguo, sondeos en FINISHED (≥ 1 min entre sí) antes de mirar candidatos. */
export const RESONDEOS = 3;
export const ESPERA_RESONDEO_MS = 60_000;
/** Candidatos válidos al verificar: `timestamp ≥ inicio − 30 s` (R28). */
export const MARGEN_INICIO_MS = 30_000;
/** Límites de Instagram (se validan antes de llamar a Meta). */
export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const CARRUSEL_MAX = 10;
export const CARRUSEL_MIN = 2;
/** Prefijo del error de una fila cerrada como salto (la pieza queda `saltado`, no `fallido`). */
export const PREFIJO_SALTO = "saltado: ";

// Códigos de Graph que son decisiones de Meta: token (190), permisos (10, 2xx),
// consulta inválida (100), cuota (4, 17, 32, 613) y media no publicable (9007).
const CODIGOS_META = new Set([190, 10, 100, 4, 17, 32, 613, 9007]);
const esContenidoRechazado = (n?: number): boolean => n !== undefined && n >= 2207000 && n < 2208000;

/** ¿Se reintenta? Errores de Meta no; red, 5xx y lo desconocido sí. Función pura. */
export function clasificar(err: unknown): "meta" | "transitorio" {
  if (err instanceof ErrorDeMeta) return "meta";
  if (err instanceof ErrorTransitorio) return "transitorio";
  if (err instanceof GraphError) {
    const { code, subcode } = err;
    if (code === undefined) return "transitorio";
    if (CODIGOS_META.has(code) || (code >= 200 && code < 300)) return "meta";
    if (esContenidoRechazado(code) || esContenidoRechazado(subcode)) return "meta";
    return "transitorio";
  }
  return "transitorio";
}

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Contenedor muerto (ERROR/EXPIRED): el reintento crea uno nuevo desde cero. */
class ContenedorMuerto extends ErrorTransitorio {}

/** Qué publicar: los mismos pasos sirven para carrusel, reel y story. */
interface Receta {
  tipo: "post" | "story";
  /** URLs de los hijos (solo carrusel). */
  hijos: string[];
  contenedor: (children: string[]) => Record<string, string | number | boolean | undefined>;
  /** Caption para reconocer el post al verificar (las stories no llevan). */
  caption?: string;
  /** Texto del tope de sondeo. */
  queProcesa: string;
}

const contarHashtags = (s: string): number => (s.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
const urlValida = (u: string | undefined): u is string => typeof u === "string" && /^https?:\/\/\S+$/.test(u);
/** Caption comparable: Instagram puede devolver `\r\n` o recortar espacios al final. */
const normalizarCaption = (s: string): string => s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
/** Id de la pieza dentro de la clave `"<semana>/<id>"`. */
const idDeClave = (clave: string): string => clave.slice(clave.lastIndexOf("/") + 1);

/** Límites de Instagram y medios mínimos. Devuelve el motivo del rechazo o undefined. */
function validarPost(p: Pieza, m: Medios): string | undefined {
  if (p.caption.length > CAPTION_MAX) {
    return `El caption tiene ${p.caption.length} caracteres; Instagram acepta hasta 2 200.`;
  }
  const tags = contarHashtags(p.caption);
  if (tags > HASHTAGS_MAX) return `El caption tiene ${tags} hashtags; Instagram acepta hasta ${HASHTAGS_MAX}.`;
  const urls = m.urls ?? [];
  if (p.formato === "carrusel") {
    if (urls.length > CARRUSEL_MAX) return `El carrusel tiene ${urls.length} imágenes; la API acepta hasta ${CARRUSEL_MAX}.`;
    if (urls.length < CARRUSEL_MIN) return `El carrusel tiene ${urls.length} imagen(es); necesita al menos ${CARRUSEL_MIN}.`;
    if (!urls.every(urlValida)) return "Una URL de imagen del carrusel no es válida (render.json).";
  } else {
    if (!urlValida(urls[0])) return "Falta la URL del video del reel en render.json.";
    if (m.cover !== undefined && !urlValida(m.cover)) return "La URL de la portada del reel no es válida (render.json).";
  }
  return undefined;
}

/**
 * Publica un post (carrusel o reel) retomando desde `fila.paso`. Devuelve la fila:
 * `publicado`, `fallido` (o salto), o una fila intermedia con `proximo` cuando hay
 * un reintento programado (R25). Lanza `ErrorTransitorio` solo si quedó en
 * `publicando` sin poder confirmar con Meta si se publicó: quien llama reintenta
 * más tarde (nunca se marca `fallido` algo que quizás está publicado).
 */
export async function publicar(fila: Fila, pieza: Pieza, medios: Medios, ctx: PublishCtx): Promise<Fila> {
  if (fila.paso === "publicado" || fila.paso === "fallido") return fila;
  const receta: Receta = pieza.formato === "carrusel"
    ? {
      tipo: "post",
      hijos: medios.urls ?? [],
      contenedor: (children) => ({ media_type: "CAROUSEL", children: children.join(","), caption: pieza.caption }),
      caption: pieza.caption,
      queProcesa: "el carrusel",
    }
    : {
      tipo: "post",
      hijos: [],
      contenedor: () => ({
        media_type: "REELS", video_url: medios.urls?.[0], cover_url: medios.cover, share_to_feed: true, caption: pieza.caption,
      }),
      caption: pieza.caption,
      queProcesa: "el video",
    };
  const sinEmpezar = fila.paso === "inicio" || fila.paso === "hijos" || fila.paso === "contenedor";
  const invalido = sinEmpezar ? validarPost(pieza, medios) : undefined;
  if (invalido) return cerrarFallido(fila, invalido, ctx);
  return ejecutar(fila, receta, ctx);
}

/** Publica la story (portada 9:16, sin caption) de una pieza ya publicada. Mismo patrón que `publicar`. */
export async function publicarStory(fila: Fila, medios: Medios, ctx: PublishCtx): Promise<Fila> {
  if (fila.paso === "publicado" || fila.paso === "fallido") return fila;
  const sinEmpezar = fila.paso === "inicio" || fila.paso === "hijos" || fila.paso === "contenedor";
  if (sinEmpezar && !urlValida(medios.story)) {
    return cerrarFallido(fila, "Falta la portada de la story (story.jpg) en render.json.", ctx);
  }
  return ejecutar(fila, {
    tipo: "story",
    hijos: [],
    contenedor: () => ({ media_type: "STORIES", image_url: medios.story }),
    queProcesa: "la story",
  }, ctx);
}

function cerrarFallido(fila: Fila, error: string, ctx: PublishCtx): Fila {
  const f: Fila = { ...fila, paso: "fallido", error, proximo: undefined };
  ctx.guardar(f);
  return f;
}

/** Modo aviso: recorre los pasos con IDs ficticios, sin ninguna llamada a Meta. */
function simular(fila: Fila, receta: Receta, ctx: PublishCtx): Fila {
  const id = idDeClave(fila.piezaId);
  const base = receta.tipo === "story" ? `aviso-${id}-story` : `aviso-${id}`;
  let f: Fila = { ...fila };
  const paso = (p: Partial<Fila>): void => {
    f = { ...f, ...p };
    ctx.guardar(f);
  };
  if (receta.hijos.length) paso({ paso: "hijos", children: receta.hijos.map((_, i) => `${base}-${i + 1}`) });
  paso({ paso: "contenedor" });
  paso({ paso: "esperando", containerId: base });
  paso({ paso: "publicando", inicio: ctx.ahora().toISOString() });
  paso({ paso: "publicado", mediaId: base, error: undefined, proximo: undefined });
  return f;
}

function idDe(r: Record<string, unknown>, que: string): string {
  const id = r?.id;
  if (typeof id !== "string" && typeof id !== "number") throw new ErrorTransitorio(`Meta no devolvió el id de ${que}.`);
  return String(id);
}

type Estado = "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED" | "IN_PROGRESS" | "DESCONOCIDO";

async function leerStatus(id: string, ctx: PublishCtx): Promise<Estado> {
  const r = await ctx.graph.get<{ status_code?: string }>(id, { fields: "status_code" });
  const s = r?.status_code;
  return s === "FINISHED" || s === "PUBLISHED" || s === "ERROR" || s === "EXPIRED" || s === "IN_PROGRESS" ? s : "DESCONOCIDO";
}

/**
 * Sondea el contenedor cada 15 s hasta un estado final, con tope de 40 sondeos.
 * Un GET que falla por red cuenta como sondeo; un error de Meta se propaga.
 */
async function sondear(id: string, ctx: PublishCtx): Promise<Estado | "TOPE"> {
  for (let i = 1; i <= MAX_SONDEOS; i++) {
    try {
      const s = await leerStatus(id, ctx);
      if (s === "FINISHED" || s === "PUBLISHED" || s === "ERROR" || s === "EXPIRED") return s;
    } catch (e) {
      if (clasificar(e) === "meta") throw e;
    }
    if (i < MAX_SONDEOS) await ctx.dormir(SONDEO_MS);
  }
  return "TOPE";
}

/** `timestamp` de Graph ("2026-10-12T22:30:05+0000") a ms. */
const tsDe = (s: unknown): number => (typeof s === "string" ? Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN);

/**
 * Posts (o stories) que podrían ser el nuestro: caption idéntico (stories: cualquiera)
 * y `timestamp ≥ inicio − 30 s` (R28). Ids sin repetir.
 */
async function candidatos(f: Fila, receta: Receta, ctx: PublishCtx): Promise<string[]> {
  const inicio = Date.parse(f.inicio ?? "");
  const desde = Number.isNaN(inicio) ? ctx.ahora().getTime() - 86_400_000 : inicio - MARGEN_INICIO_MS;
  const r = receta.tipo === "story"
    ? await ctx.graph.get<{ data?: { id?: string; timestamp?: string }[] }>(`${ctx.igUserId}/stories`, { fields: "id,timestamp" })
    : await ctx.graph.get<{ data?: { id?: string; caption?: string; timestamp?: string }[] }>(
      `${ctx.igUserId}/media`, { fields: "id,caption,timestamp", limit: 10 },
    );
  const caption = receta.caption !== undefined ? normalizarCaption(receta.caption) : undefined;
  const ids = (r?.data ?? [])
    .filter((m): m is { id: string; caption?: string; timestamp?: string } => typeof m?.id === "string")
    .filter((m) => receta.tipo === "story" || (typeof m.caption === "string" && normalizarCaption(m.caption) === caption))
    .filter((m) => {
      const ts = tsDe(m.timestamp);
      return !Number.isNaN(ts) && ts >= desde;
    })
    .map((m) => m.id);
  return [...new Set(ids)];
}

const ambiguo = (receta: Receta, n: number, porque: string): ErrorAmbiguo =>
  new ErrorAmbiguo(`${porque}, pero hay ${n} ${receta.tipo === "story" ? "stories" : "posts con el mismo caption"} ` +
    "en ese rango; no adivino cuál es ni vuelvo a publicar. Revisa en la app.");

/** Post propio de un contenedor PUBLISHED: uno → su id; ninguno → undefined; más → `ErrorAmbiguo`. */
async function buscarPublicado(f: Fila, receta: Receta, ctx: PublishCtx): Promise<string | undefined> {
  const ids = await candidatos(f, receta, ctx);
  if (ids.length > 1) throw ambiguo(receta, ids.length, `Instagram confirmó la publicación de ${receta.queProcesa}`);
  return ids[0];
}

/**
 * ¿Ya está publicado este contenedor? Solo si Meta dice PUBLISHED se busca el post
 * (R28). Si el post aún no aparece, se insiste dos veces; si sigue sin aparecer,
 * igual es `publicado` (sin media_id): jamás se republica un contenedor PUBLISHED.
 * Errores de red → ErrorTransitorio; ambigüedad → ErrorAmbiguo.
 */
async function verificar(f: Fila, receta: Receta, ctx: PublishCtx): Promise<{ publicado: true; mediaId?: string } | { publicado: false; status: Estado }> {
  try {
    const status = await leerStatus(f.containerId!, ctx);
    if (status !== "PUBLISHED") return { publicado: false, status };
    for (let i = 0; i < 3; i++) {
      const id = await buscarPublicado(f, receta, ctx);
      if (id) return { publicado: true, mediaId: id };
      if (i < 2) await ctx.dormir(20_000);
    }
    return { publicado: true };
  } catch (e) {
    if (e instanceof ErrorTransitorio) throw e;
    throw new ErrorTransitorio(`No pude confirmar con Meta si ${receta.queProcesa} se publicó: ${mensaje(e)}`);
  }
}

/** El motor: retoma desde `fila.paso` y avanza hasta `publicado`, `fallido` o un reintento programado. */
async function ejecutar(fila: Fila, receta: Receta, ctx: PublishCtx): Promise<Fila> {
  if (ctx.modo === "aviso") return simular(fila, receta, ctx);
  const ig = ctx.igUserId;
  let f: Fila = { ...fila, children: fila.children ? [...fila.children] : undefined, proximo: undefined };
  const guardar = (p: Partial<Fila>): Fila => {
    f = { ...f, ...p };
    ctx.guardar({ ...f, children: f.children ? [...f.children] : undefined });
    return f;
  };
  const pasado = (d?: Date): boolean => d !== undefined && ctx.ahora().getTime() > d.getTime();
  const salto = (detalle?: string): Fila =>
    guardar({ paso: "fallido", proximo: undefined, error: `${PREFIJO_SALTO}no se publica tarde${detalle ? ` (${detalle})` : ""}` });
  // R26/R29: el primer contenedor solo dentro de la ventana; los reintentos, hasta `limiteReintento`.
  const limiteCrear = (): Date | undefined => (f.urlCaida ? ctx.limiteReintento ?? ctx.limite : ctx.limite);
  /** Ya no se puede crear contenedor: sin intentos previos es un salto; con reintentos en curso, `fallido` (R29). */
  const sinTiempo = (): Fila => f.intentos > 0
    ? guardar({ paso: "fallido", proximo: undefined, error: `${f.error ?? "no se pudo crear el contenedor"} (sin tiempo para otro reintento)` })
    : salto();
  // Una fila que llega en `publicando` pudo publicarse antes del reinicio: se verifica primero.
  let verificarPrimero = f.paso === "publicando";
  let fallosPublish = 0;

  for (;;) {
    try {
      switch (f.paso) {
        case "inicio":
        case "hijos": {
          if (receta.hijos.length) {
            const children = f.children ?? [];
            if (!children.length && pasado(limiteCrear())) return sinTiempo();
            while (children.length < receta.hijos.length) {
              guardar({ paso: "hijos", children: [...children] });
              const r = await ctx.graph.post(`${ig}/media`, { image_url: receta.hijos[children.length], is_carousel_item: true });
              children.push(idDe(r, "una imagen del carrusel"));
              guardar({ paso: "hijos", children: [...children] });
            }
          }
          guardar({ paso: "contenedor" });
          break;
        }
        case "contenedor": {
          if (pasado(limiteCrear())) return sinTiempo();
          const r = await ctx.graph.post(`${ig}/media`, receta.contenedor(f.children ?? []));
          guardar({ paso: "esperando", containerId: idDe(r, "el contenedor") });
          break;
        }
        case "esperando": {
          if (!f.containerId) {
            guardar({ paso: "contenedor" });
            break;
          }
          const s = await sondear(f.containerId, ctx);
          if (s === "TOPE") return guardar({ paso: "fallido", error: `Meta no terminó de procesar ${receta.queProcesa} en 10 min` });
          if (s === "ERROR" || s === "EXPIRED") {
            throw new ContenedorMuerto(`Meta no pudo procesar ${receta.queProcesa} (status_code=${s}); ¿la URL de medios responde?`);
          }
          // PUBLISHED aquí solo si alguien lo publicó por fuera: se verifica, nunca se republica.
          verificarPrimero = s === "PUBLISHED";
          guardar({ paso: "publicando", inicio: f.inicio ?? ctx.ahora().toISOString() });
          break;
        }
        case "publicando": {
          if (!f.containerId) {
            guardar({ paso: "contenedor" });
            break;
          }
          if (verificarPrimero) {
            const v = await verificar(f, receta, ctx);
            if (v.publicado) {
              return guardar({
                paso: "publicado", mediaId: v.mediaId, resondeos: undefined,
                error: v.mediaId ? undefined : "Instagram confirmó la publicación, pero no encontré su media_id.",
              });
            }
            verificarPrimero = false;
            if (v.status !== "FINISHED") {
              // No publicado y no listo: se vuelve a esperar (IN_PROGRESS) o se recrea (ERROR/EXPIRED).
              guardar({ paso: "esperando", resondeos: undefined });
              break;
            }
            // R32: FINISHED tras un publish ambiguo puede ser un status atrasado. No se republica
            // hasta ver FINISHED en 3 sondeos separados por ≥ 1 min…
            const n = (f.resondeos ?? 0) + 1;
            if (n < RESONDEOS) {
              if (ctx.diferido) {
                return guardar({ resondeos: n, proximo: new Date(ctx.ahora().getTime() + ESPERA_RESONDEO_MS).toISOString() });
              }
              guardar({ resondeos: n });
              await ctx.dormir(ESPERA_RESONDEO_MS);
              verificarPrimero = true;
              break;
            }
            // …y sin ningún candidato en la cuenta. Con uno o más, no se adopta ni se republica.
            let ids: string[];
            try {
              ids = await candidatos(f, receta, ctx);
            } catch (e) {
              throw new ErrorTransitorio(`No pude revisar los posts recientes: ${mensaje(e)}`);
            }
            if (ids.length) throw ambiguo(receta, ids.length, `Según Meta, ${receta.queProcesa} sigue sin publicarse`);
            guardar({ resondeos: undefined });
          }
          // Contenedor listo y NO publicado: si ya es tarde, no se publica (el contenedor expira solo).
          if (pasado(ctx.limitePublicar)) return salto("el contenedor estaba listo, pero pasó la hora");
          // La fila `publicando` (con containerId e inicio) queda guardada ANTES del POST.
          guardar({ paso: "publicando", inicio: f.inicio ?? ctx.ahora().toISOString() });
          try {
            const r = await ctx.graph.post(`${ig}/media_publish`, { creation_id: f.containerId });
            const mediaId = typeof r?.id === "string" || typeof r?.id === "number" ? String(r.id) : undefined;
            if (!mediaId) throw new ErrorTransitorio("Meta no devolvió el id del post publicado.");
            return guardar({ paso: "publicado", mediaId, error: undefined });
          } catch (e) {
            if (clasificar(e) === "meta") {
              // Respuesta limpia de Meta: no se publicó... salvo que el contenedor diga lo contrario.
              const v = await verificar(f, receta, ctx);
              if (v.publicado) return guardar({ paso: "publicado", mediaId: v.mediaId, error: undefined });
              return guardar({ paso: "fallido", error: mensaje(e) });
            }
            // Red caída o respuesta sin id: quizás SÍ se publicó. Nunca se republica en esta
            // pasada: se re-sondea el contenedor (R32).
            if (++fallosPublish >= MAX_REINTENTOS) {
              throw new ErrorTransitorio(`No pude confirmar si se publicó ${receta.queProcesa}: ${mensaje(e)}`);
            }
            if (ctx.diferido) {
              return guardar({ resondeos: 0, error: mensaje(e), proximo: new Date(ctx.ahora().getTime() + ESPERA_RESONDEO_MS).toISOString() });
            }
            guardar({ resondeos: 0, error: mensaje(e) });
            await ctx.dormir(ESPERA_RESONDEO_MS);
            verificarPrimero = true;
          }
          break;
        }
        default:
          return f;
      }
    } catch (e) {
      // En `publicando` jamás se cierra como fallido por un error pasajero: se reintenta después.
      if (f.paso === "publicando") throw e instanceof ErrorTransitorio ? e : new ErrorTransitorio(mensaje(e));
      if (clasificar(e) === "meta") return guardar({ paso: "fallido", error: mensaje(e) });
      const intentos = f.intentos + 1;
      if (intentos > MAX_REINTENTOS) {
        return guardar({ paso: "fallido", intentos, proximo: undefined, error: `${mensaje(e)} (tras ${MAX_REINTENTOS} reintentos)` });
      }
      const muerto = e instanceof ContenedorMuerto;
      const ahora = ctx.ahora().getTime();
      let proximo = new Date(ahora + (muerto ? ESPERA_REINTENTO_MS : ESPERA_RED_MS));
      // R29: este intento empezó a tiempo, así que los reintentos valen hasta `limiteReintento`
      // (se adelantan para caber). Si ya no queda tiempo: `fallido` con el motivo, no salto.
      // La ventana extendida (R29) es solo para URL caída; un error de red al crear se queda en `limite`.
      const urlCaida = muerto || f.urlCaida === true;
      const tope = urlCaida ? ctx.limiteReintento ?? ctx.limite : ctx.limite;
      if (tope && proximo.getTime() > tope.getTime()) {
        if (ahora >= tope.getTime()) {
          return guardar({ paso: "fallido", intentos, proximo: undefined, error: `${mensaje(e)} (sin tiempo para otro reintento)` });
        }
        proximo = tope;
      }
      // Contenedor muerto → uno nuevo desde cero (el viejo queda huérfano y Meta lo expira).
      const reinicio: Partial<Fila> = muerto
        ? { paso: "inicio", children: undefined, containerId: undefined, inicio: undefined }
        : {};
      // R25: con `diferido` no se duerme; el tick que llegue después de `proximo` retoma la fila.
      guardar({ ...reinicio, intentos, error: mensaje(e), ...(urlCaida ? { urlCaida: true } : {}), proximo: proximo.toISOString() });
      if (ctx.diferido) return f;
      await ctx.dormir(Math.max(0, proximo.getTime() - ctx.ahora().getTime()));
      f = { ...f, proximo: undefined };
    }
  }
}
