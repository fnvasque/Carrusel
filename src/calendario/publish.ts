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
 *   pregunta a Meta por el contenedor (`status_code`) y se busca el post publicado.
 *   Solo si el contenedor sigue `FINISHED` y no hay post se vuelve a publicar.
 *
 * Todo el I/O entra por `ctx` (graph, reloj, dormir, guardar): se prueba con un
 * Meta falso, sin red.
 */

export type Paso = "inicio" | "hijos" | "contenedor" | "esperando" | "publicando" | "publicado" | "fallido";

export interface Fila {
  piezaId: string;
  tipo: "post" | "story";
  paso: Paso;
  containerId?: string;
  children?: string[];
  mediaId?: string;
  intentos: number;
  error?: string;
  /**
   * Instante (ISO) en que se guardó `publicando`, justo antes del primer
   * `media_publish`. Cota inferior para reconocer el post al verificar. En
   * SQLite vive en la columna `actualizado` mientras la fila está `publicando`.
   */
  inicio?: string;
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
  /**
   * Después de este instante no se crea ningún contenedor nuevo (la pieza no se
   * publica tarde). Un contenedor ya creado sí se termina. Opcional.
   */
  limite?: Date;
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

/** Sondeo de `status_code` cada 15 s, tope 10 min (40 sondeos). */
export const SONDEO_MS = 15_000;
export const MAX_SONDEOS = 40;
/** URL caída: 3 reintentos separados por 10 min (30 min) y luego `fallido`. */
export const ESPERA_REINTENTO_MS = 10 * 60_000;
export const MAX_REINTENTOS = 3;
/** Pausa antes de verificar un `media_publish` que falló por red (Meta puede seguir procesándolo). */
export const ESPERA_VERIFICAR_MS = 30_000;
/** Límites de Instagram (se validan antes de llamar a Meta). */
export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const CARRUSEL_MAX = 10;
export const CARRUSEL_MIN = 2;
/** Margen de reloj entre este servidor y Meta al comparar `timestamp`. */
const MARGEN_RELOJ_MS = 5 * 60_000;

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
 * Publica un post (carrusel o reel) retomando desde `fila.paso`. Devuelve la fila
 * final (`publicado` o `fallido`). Lanza `ErrorTransitorio` solo si quedó en
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
  const f: Fila = { ...fila, paso: "fallido", error };
  ctx.guardar(f);
  return f;
}

/** Modo aviso: recorre los pasos con IDs ficticios, sin ninguna llamada a Meta. */
function simular(fila: Fila, receta: Receta, ctx: PublishCtx): Fila {
  const base = receta.tipo === "story" ? `aviso-${fila.piezaId}-story` : `aviso-${fila.piezaId}`;
  let f: Fila = { ...fila };
  const paso = (p: Partial<Fila>): void => {
    f = { ...f, ...p };
    ctx.guardar(f);
  };
  if (receta.hijos.length) paso({ paso: "hijos", children: receta.hijos.map((_, i) => `${base}-${i + 1}`) });
  paso({ paso: "contenedor" });
  paso({ paso: "esperando", containerId: base });
  paso({ paso: "publicando", inicio: ctx.ahora().toISOString() });
  paso({ paso: "publicado", mediaId: base, error: undefined });
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
 * Busca el post recién publicado: el más reciente con caption idéntico (stories:
 * cualquiera) y `timestamp` ≥ inicio del intento (menos un margen de reloj).
 * Sin `inicio` conocido, se mira solo el último día.
 */
async function buscarPublicado(f: Fila, receta: Receta, ctx: PublishCtx): Promise<string | undefined> {
  const inicio = Date.parse(f.inicio ?? "");
  const desde = Number.isNaN(inicio) ? ctx.ahora().getTime() - 86_400_000 : inicio - MARGEN_RELOJ_MS;
  const r = receta.tipo === "story"
    ? await ctx.graph.get<{ data?: { id?: string; timestamp?: string }[] }>(`${ctx.igUserId}/stories`, { fields: "id,timestamp" })
    : await ctx.graph.get<{ data?: { id?: string; caption?: string; timestamp?: string }[] }>(
      `${ctx.igUserId}/media`, { fields: "id,caption,timestamp", limit: 10 },
    );
  const candidatos = (r?.data ?? [])
    .filter((m): m is { id: string; caption?: string; timestamp?: string } => typeof m?.id === "string")
    .filter((m) => receta.tipo === "story" || (m as { caption?: string }).caption === receta.caption)
    .map((m) => ({ id: m.id, ts: tsDe(m.timestamp) }))
    .filter((m) => !Number.isNaN(m.ts) && m.ts >= desde)
    .sort((a, b) => b.ts - a.ts);
  return candidatos[0]?.id;
}

/**
 * ¿Ya está publicado este contenedor? Pregunta el `status_code` y busca el post.
 * Si el contenedor dice PUBLISHED pero el post aún no aparece en la lista, insiste
 * dos veces más; si sigue sin aparecer, igual es `publicado` (sin media_id): jamás
 * se vuelve a publicar un contenedor PUBLISHED. Errores de red → ErrorTransitorio.
 */
async function verificar(f: Fila, receta: Receta, ctx: PublishCtx): Promise<{ publicado: true; mediaId?: string } | { publicado: false; status: Estado }> {
  try {
    const status = await leerStatus(f.containerId!, ctx);
    if (status === "PUBLISHED") {
      for (let i = 0; i < 3; i++) {
        const id = await buscarPublicado(f, receta, ctx);
        if (id) return { publicado: true, mediaId: id };
        if (i < 2) await ctx.dormir(20_000);
      }
      return { publicado: true };
    }
    // Defensa extra por si el status va atrasado: ¿el post ya está en la cuenta?
    const id = await buscarPublicado(f, receta, ctx);
    if (id) return { publicado: true, mediaId: id };
    return { publicado: false, status };
  } catch (e) {
    if (e instanceof ErrorTransitorio) throw e;
    throw new ErrorTransitorio(`No pude confirmar con Meta si ${receta.queProcesa} se publicó: ${mensaje(e)}`);
  }
}

/** El motor: retoma desde `fila.paso` y avanza hasta `publicado` o `fallido`. */
async function ejecutar(fila: Fila, receta: Receta, ctx: PublishCtx): Promise<Fila> {
  if (ctx.modo === "aviso") return simular(fila, receta, ctx);
  const ig = ctx.igUserId;
  let f: Fila = { ...fila, children: fila.children ? [...fila.children] : undefined };
  const guardar = (p: Partial<Fila>): Fila => {
    f = { ...f, ...p };
    ctx.guardar({ ...f, children: f.children ? [...f.children] : undefined });
    return f;
  };
  const tarde = (): boolean => ctx.limite !== undefined && ctx.ahora().getTime() > ctx.limite.getTime();
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
            if (!children.length && tarde()) return guardar({ paso: "fallido", error: "no se publica tarde" });
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
          if (tarde()) return guardar({ paso: "fallido", error: "no se publica tarde" });
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
                paso: "publicado", mediaId: v.mediaId,
                error: v.mediaId ? undefined : "Instagram confirmó la publicación, pero no encontré su media_id.",
              });
            }
            verificarPrimero = false;
            if (v.status !== "FINISHED") {
              // No publicado y no listo: se vuelve a esperar (IN_PROGRESS) o se recrea (ERROR/EXPIRED).
              guardar({ paso: "esperando" });
              break;
            }
          }
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
            // Red caída o respuesta sin id: quizás SÍ se publicó. Se espera y se verifica.
            if (++fallosPublish >= MAX_REINTENTOS) {
              throw new ErrorTransitorio(`No pude confirmar si se publicó ${receta.queProcesa}: ${mensaje(e)}`);
            }
            await ctx.dormir(ESPERA_VERIFICAR_MS);
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
        return guardar({ paso: "fallido", intentos, error: `${mensaje(e)} (tras ${MAX_REINTENTOS} reintentos)` });
      }
      // Contenedor muerto → uno nuevo desde cero (el viejo queda huérfano y Meta lo expira).
      const reinicio: Partial<Fila> = e instanceof ContenedorMuerto
        ? { paso: "inicio", children: undefined, containerId: undefined, inicio: undefined }
        : {};
      guardar({ ...reinicio, intentos, error: mensaje(e) });
      await ctx.dormir(ESPERA_REINTENTO_MS);
    }
  }
}
