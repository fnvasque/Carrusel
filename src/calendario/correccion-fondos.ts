import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { calendarioDir, estadoEfectivo, listarSemanas, ocultarToken, semanaDir, urlPublica, type Pieza, type SemanaLeida } from "./plan.ts";
import { borradorASpec, parseBorrador, type Borrador } from "./draft.ts";
import { fondoEnCache } from "../ai/openaiImage.ts";
import { applyBrandStyle } from "../render/background.ts";
import { HECHO, RESPALDO } from "./hook-video.ts";
import {
  MANIFIESTO, armarMedios, destinoRemoto, fondosIaQuitados, horaDe, leerBorradorSeguro, leerManifiesto, tipoDe,
  type Deps, type EnvRender, type Manifiesto, type PiezaPendiente,
} from "./render.ts";
import {
  leerRespuestasVisuales, leerVisual, resumenVisual, sinClaves, visualPath,
  type CorreccionPieza, type VeredictoImagen, type VisualJson, type VisualPieza,
} from "./visual.ts";

/** Puerta de la fase 3 (corrección automática de fondos): cuántos avisos respondidos y qué precisión hacen falta. */
export const UMBRAL_CORRECCION = { respondidos: 30, precision: 0.8 } as const;

export interface PuertaCorreccion { activa: boolean; motivo: string; respondidos: number; precision?: number }

/**
 * Número con coma decimal y a lo más 2 decimales, truncado hacia abajo (0.72 → «0,72»; 0.795 →
 * «0,79»): solo para el motivo. Truncar evita que 0,795 se lea «0,8 < 0,8».
 */
const coma = (x: number): string => String(Math.floor(x * 100 + 1e-9) / 100).replace(".", ",");

/** Pura: decide con el interruptor de `config.json` y el resumen de precisión del revisor. */
export function puertaCorreccion(interruptor: unknown, total: { respondidos: number; precision?: number }): PuertaCorreccion {
  const { respondidos, precision } = total;
  const base = { respondidos, ...(precision !== undefined ? { precision } : {}) };
  if (interruptor !== true) return { ...base, activa: false, motivo: "apagada en config.json" };
  if (respondidos < UMBRAL_CORRECCION.respondidos) {
    return { ...base, activa: false, motivo: `solo ${respondidos} avisos respondidos (faltan ${UMBRAL_CORRECCION.respondidos - respondidos})` };
  }
  if (precision === undefined || !(precision >= UMBRAL_CORRECCION.precision)) {
    const p = precision === undefined ? "sin precisión medida" : `precisión ${coma(precision)}`;
    return { ...base, activa: false, motivo: precision === undefined ? p : `${p} < ${coma(UMBRAL_CORRECCION.precision)}` };
  }
  return { ...base, activa: true, motivo: `activa (precisión ${coma(precision)} con ${respondidos} respondidos)` };
}

/** Lee `config.json → revisionVisual.corregir` y el resumen de todas las semanas con `visual.json`. Nunca lanza. */
export async function leerPuertaCorreccion(): Promise<PuertaCorreccion> {
  try {
    let interruptor: unknown;
    try {
      const cfg = JSON.parse(readFileSync(join(calendarioDir(), "config.json"), "utf8")) as { revisionVisual?: { corregir?: unknown } } | null;
      interruptor = cfg?.revisionVisual?.corregir;
    } catch (err) {
      return { activa: false, respondidos: 0, motivo: `config.json ausente o ilegible: ${err instanceof Error ? err.message : String(err)}` };
    }
    const semanas = [];
    for (const semana of await listarSemanas()) {
      if (!existsSync(visualPath(semana))) continue;
      const [visual, respuestas] = await Promise.all([leerVisual(semana), leerRespuestasVisuales(semana)]);
      semanas.push({ semana, visual, respuestas });
    }
    // La precisión se compara sin redondear: `resumenVisual` la redondea a 2 decimales (0,795 → 0,8).
    const { respondidos, aciertos } = resumenVisual(semanas).total;
    return puertaCorreccion(interruptor, { respondidos, ...(respondidos > 0 ? { precision: aciertos / respondidos } : {}) });
  } catch (err) {
    return { activa: false, respondidos: 0, motivo: `no se pudo leer la puerta: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Pura: índices de slide (ordenados, sin repetir) con aviso (`compite || ajeno`) cuyo borrador tiene
 * `background.ai` y no es `Clip`; excluye los que `fondosIaQuitados` ya quita (`yaQuitadas`).
 * Falla seguro: un veredicto sin `slide` entero ≥ 0 o fuera de rango no corrige nada.
 */
export function slidesACorregir(b: Borrador, imagenes: VeredictoImagen[], yaQuitadas: number[]): number[] {
  const quitadas = new Set(yaQuitadas);
  const out = new Set<number>();
  for (const v of imagenes) {
    if (!v || (!v.compite && !v.ajeno)) continue;
    const i = v.slide;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= b.slides.length) continue;
    if (quitadas.has(i)) continue;
    const s = b.slides[i];
    if (s.template === "Clip") continue;
    const bg = s.background as Record<string, unknown> | undefined | null;
    if (!bg || typeof bg !== "object" || typeof bg.ai !== "string") continue;
    out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

// --- Re-render corregido y nueva subida (fase 3) ---

/** Solo se corrige si faltan al menos 30 min para la hora de la pieza (se mira al empezar, antes de subir y antes de anotar). */
export const MARGEN_CORRECCION_MS = 30 * 60_000;
export const SIN_MARGEN = "sin margen antes de la hora";

export interface DepsCorreccion {
  /** Re-render en `tmp` con los fondos `quitar` (en el real, `renderPieza` con `quitarFondos`; fase 1 en modo bloquear). Lanza si falla. */
  render: (p: PiezaPendiente, tmp: string, quitar: { slide: number; motivo: string }[]) => Promise<{ archivos: string[]; duracionMs?: number; escenas?: { start: number; dur: number }[] }>;
  rsync: Deps["rsync"];
  verificar: Deps["verificar"];
  escribirRender: Deps["escribirRender"];
  /** Reemplaza la entrada por id: se le pasa la entrada completa con `correccion` fusionada. */
  escribirVisual: (semana: string, id: string, e: VisualPieza) => Promise<void>;
  avisar: (t: string) => Promise<boolean | void>;
  log: (t: string) => void;
  ahora?: () => Date;
  /** Lo anotado en esta corrida y aún sin confirmar (el veredicto recién hecho por `revisarRenderizadas` está aquí, no en disco). */
  visualPendiente?: (semana: string, id: string) => unknown;
  /** Lector de visual.json (por defecto el de la base). */
  leerVisual?: (semana: string) => Promise<VisualJson>;
  /** Borra una carpeta ya descartada (por defecto `rm -rf`); inyectable para probar un borrado que falla. */
  borrar?: (ruta: string) => Promise<void>;
  /**
   * Sube a la base lo anotado de la semana (en el real, `confirmar` del escritor). Tras una
   * corrección aplicada se llama de inmediato, para que el render.json con el `en` nuevo llegue
   * al bot cuanto antes (si el bot entrega el preview del original después de ese `en`, ya no
   * mandaría el de la versión corregida).
   */
  confirmar?: (semana: string) => Promise<void>;
  /**
   * ¿Está en la caché el fondo ai de este prompt (ya con el estilo de marca)? Por defecto
   * `fondoEnCache`, con la misma clave que `generateBackground`. El re-render nunca genera imágenes.
   */
  enCache?: (prompt: string) => boolean;
}

/** Lo que usa la recuperación de corridas cortadas. */
export type DepsRecuperacion = Pick<DepsCorreccion, "rsync" | "avisar" | "log" | "ahora">;

export const SIN_CACHE = "fondo ai sin caché: no se regenera";

const SEMANA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9-]{3,80}$/;
const PREV_RE = /^([a-z0-9-]{3,80})\.prev-\d+$/;
/** Restos propios: el tmp del re-render y la previa ya descartada (`procesar` también borra `<id>.tmp-*`). */
const TMP_CORR_RE = /^([a-z0-9-]{3,80})\.tmp-(corr|descartada)-\d+$/;

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const razon = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Motivo del aviso «Fondo ai quitado…» para una slide: qué señaló el revisor. */
function motivoRevisor(imagenes: VeredictoImagen[], slide: number): string {
  const vs = imagenes.filter((v) => v && v.slide === slide);
  const tipos = [vs.some((v) => v.compite) ? "compite" : "", vs.some((v) => v.ajeno) ? "ajeno" : ""].filter(Boolean);
  return `el revisor visual lo marcó (${tipos.join(" y ") || "compite/ajeno"})`;
}

const mismosArchivos = (a: string[], b: string[]): boolean => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Log, aviso y hora comunes a la recuperación y a la corrección (todo con el token oculto; nada lanza). */
function contexto(env: EnvRender, deps: DepsRecuperacion) {
  const oculto = (t: string): string => sinClaves(ocultarToken(t, env.token));
  const log = (t: string): void => {
    try {
      deps.log(oculto(t));
    } catch {
      // un log que falla no corta la corrección
    }
  };
  const avisar = async (t: string): Promise<void> => {
    const x = oculto(t);
    log(`⚠️  ${x}`);
    try {
      if ((await deps.avisar(x)) === false) log("⚠️  El aviso de la corrección de fondos no se entregó (no se reintenta).");
    } catch (e) {
      log(`⚠️  No pude enviar el aviso de la corrección de fondos: ${razon(e)}`);
    }
  };
  const ahora = deps.ahora ?? (() => new Date());
  const conMargen = (t: number): boolean => t - ahora().getTime() >= MARGEN_CORRECCION_MS;
  /**
   * Sube `final` (el original restaurado) para que el servidor vuelva a coincidir con render.json.
   * Si la hora de la pieza ya pasó no sube nada: el bot pudo estar publicando justo esos archivos.
   */
  const resubir = async (semana: string, id: string, final: string, t: number): Promise<string> => {
    if (t <= ahora().getTime()) {
      return "no re-subí el original porque su hora ya pasó: el servidor puede tener archivos corregidos mezclados con los originales";
    }
    try {
      await deps.rsync(final, destinoRemoto(env, semana, id));
      return "re-subí el original al servidor";
    } catch (e) {
      return `no pude re-subir el original (${razon(e)}): el servidor puede tener archivos corregidos mezclados con los originales`;
    }
  };
  return { oculto, log, avisar, ahora, conMargen, resubir };
}

const piezaDe = (semanas: SemanaLeida[], semana: string, id: string): { s: SemanaLeida; pieza: Pieza } | undefined => {
  const s = semanas.find((x) => x.semana === semana);
  const pieza = s?.plan.piezas.find((p) => p.id === id);
  return s && pieza ? { s, pieza } : undefined;
};

const horaSegura = (p: Pieza): number | undefined => {
  try {
    const t = horaDe(p);
    return Number.isFinite(t) ? t : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Deshace lo que dejó una corrida de la fase 3 cortada (el Mac se durmió o launchd la mató a
 * mitad del swap o de la subida). Corre en `render-cli` justo después de tomar el candado y
 * ANTES de `procesar` y de la revisión: así la revisión nunca mira (ni cobra) una versión
 * corregida a medias, y una `.prev` vieja nunca pisa un render fresco de `procesar`.
 *
 * Una `<id>.prev-*` válida siempre es el original verificado que corresponde a render.json
 * (render.json se confirma después de que `corregirFondos` aparta la previa), así que se
 * restaura como final y, si render.json la referencia y queda margen, se re-sube para dejar el
 * servidor igual. Por eso, una vez que el render nuevo queda como definitivo, la previa
 * primero se renombra a `<id>.tmp-descartada-<pid>` (que esto no restaura) y solo después se
 * borra. También limpia los `.tmp-corr-` y `.tmp-descartada-`. Nunca lanza.
 */
export async function recuperarCorreccionesCortadas(
  semanas: SemanaLeida[],
  outRoot: string,
  env: EnvRender,
  deps: DepsRecuperacion,
): Promise<{ restauradas: number }> {
  const res = { restauradas: 0 };
  const { log, avisar, conMargen, resubir } = contexto(env, deps);
  try {
    for (const s of semanas) {
      if (!SEMANA_RE.test(s.semana)) continue;
      const carpeta = join(outRoot, s.semana);
      let nombres: string[];
      try {
        nombres = await readdir(carpeta);
      } catch {
        continue;
      }
      for (const f of nombres) {
        const id = PREV_RE.exec(f)?.[1];
        if (!id) continue;
        try {
          const prev = join(carpeta, f);
          const final = join(carpeta, id);
          if (!(await leerManifiesto(prev))) {
            await rm(prev, { recursive: true, force: true });
            continue;
          }
          await rm(final, { recursive: true, force: true });
          await rename(prev, final);
          res.restauradas++;
          const pz = piezaDe(semanas, s.semana, id);
          const t = pz ? horaSegura(pz.pieza) : undefined;
          const ef = pz ? estadoEfectivo(pz.pieza, pz.s.render[id], pz.s.estado[id]) : undefined;
          const rj = pz?.s.render[id];
          let subida = "no la re-subo (su hora pasó o ya no hay margen)";
          if (rj?.estado !== "renderizado" || !rj.medios) subida = "no la re-subo (render.json no la tiene como renderizada: se vuelve a renderizar)";
          else if (t !== undefined && conMargen(t) && ef !== "publicado" && ef !== "saltado") subida = await resubir(s.semana, id, final, t);
          await avisar(`Corrección de fondos: una corrida anterior quedó a medias en ${id} (${s.semana}); restauré el original en el Mac y ${subida}.`);
        } catch (e) {
          log(`⚠️  Corrección de fondos: no pude recuperar ${f} (${s.semana}): ${razon(e)}`);
        }
      }
      for (const f of nombres) {
        if (TMP_CORR_RE.test(f)) await rm(join(carpeta, f), { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (e) {
    log(`⚠️  Corrección de fondos: error inesperado al recuperar: ${razon(e)}`);
  }
  return res;
}

/**
 * Prompts (con el estilo de marca, la clave de la caché) de los fondos ai que el re-render
 * conserva: los del borrador menos los de `quitadas` (tope semanal y corrección). Pasa por
 * `borradorASpec`, el mismo camino que siguen los motores hasta `resolveBackground`.
 */
export function fondosAiConservados(b: Borrador, quitadas: number[], formato: Pieza["formato"]): { slide: number; prompt: string }[] {
  const copia = structuredClone(b);
  for (const i of quitadas) if (copia.slides[i]) delete copia.slides[i].background;
  const spec = borradorASpec(copia, formato === "reel" ? { format: "reel" } : {});
  const out: { slide: number; prompt: string }[] = [];
  spec.slides.forEach((s, slide) => {
    const bg = (s.props as Record<string, unknown>).background as Record<string, unknown> | undefined;
    if (bg && typeof bg === "object" && typeof bg.ai === "string") {
      out.push({ slide, prompt: applyBrandStyle(bg.ai, typeof bg.brandStyle === "boolean" ? bg.brandStyle : undefined) });
    }
  });
  return out;
}

/**
 * Corrección automática de fondos (fase 3), después de `revisarSinAvisar` y con el
 * candado del render tomado. Para cada pieza de `piezas` con revisión «revisado» y
 * `slidesACorregir` no vacío: comprueba que los fondos ai que se conservan estén en caché →
 * re-render en `<id>.tmp-corr-<pid>` sin esos fondos ai → swap de la carpeta final (la actual
 * pasa a `<id>.prev-<pid>`) → rsync → verificar → `escribirRender(renderizado, en nuevo)` →
 * se aparta la previa → `visual.correccion = aplicada` → `confirmar(semana)` de inmediato.
 * La hora se mira al empezar, antes de rsync y antes de anotar render.json.
 * Si algo falla queda el original (Mac y servidor), render.json no cambia, `fallida` y
 * un aviso. Una pieza con `correccion` no se vuelve a tocar. Nunca lanza.
 *
 * Los restos de una corrida cortada NO se recuperan aquí: lo hace
 * `recuperarCorreccionesCortadas` antes de `procesar`. Una pieza que aún tenga una
 * `<id>.prev-*` (la recuperación no pudo con ella) no se corrige.
 *
 * Riesgo conocido, sin resolver en código: `/publicar` (`ordenes.forzar` en el scheduler del
 * bot) puede adelantar la publicación, y el Mac no ve esa orden. `conMargen` solo protege la
 * hora del plan. Una publicación forzada durante la subida de un carrusel podría mezclar
 * slides viejas y nuevas (rsync reemplaza archivo por archivo).
 */
export async function corregirFondos(
  semanas: SemanaLeida[],
  piezas: { semana: string; id: string }[],
  outRoot: string,
  env: EnvRender,
  puerta: PuertaCorreccion,
  deps: DepsCorreccion,
): Promise<{ aplicadas: number; fallidas: number; omitidas: number }> {
  const res = { aplicadas: 0, fallidas: 0, omitidas: 0 };
  const { oculto, log, avisar, ahora, conMargen, resubir } = contexto(env, deps);
  try {
    // 2) Puerta.
    if (!puerta.activa) {
      log(`🖼️  fase 3 inactiva: ${puerta.motivo}`);
      return res;
    }

    const leer = deps.leerVisual ?? leerVisual;
    const visuales = new Map<string, VisualJson>();
    const entradaDe = async (semana: string, id: string): Promise<VisualPieza> => {
      const pend = deps.visualPendiente?.(semana, id);
      if (esObjeto(pend)) return pend as VisualPieza;
      let v = visuales.get(semana);
      if (!v) {
        try {
          v = await leer(semana);
        } catch (e) {
          log(`⚠️  Corrección de fondos: no pude leer visual.json de ${semana}: ${razon(e)}`);
          v = {};
        }
        visuales.set(semana, v);
      }
      return v[id] ?? {};
    };

    /** Sube ya lo anotado de la semana (render.json y visual.json). Nunca lanza; después visual.json se relee del disco. */
    const confirmar = async (semana: string): Promise<void> => {
      if (!deps.confirmar) return;
      try {
        await deps.confirmar(semana);
      } catch (e) {
        log(`⚠️  Corrección de fondos: no pude subir lo anotado de ${semana}: ${razon(e)} (se reintenta al final de la corrida).`);
      }
      visuales.delete(semana);
    };

    const vistos = new Set<string>();
    for (const { semana, id } of piezas) {
      if (!SEMANA_RE.test(semana) || !ID_RE.test(id)) continue;
      const k = `${semana}/${id}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      try {
        // 3) Filtros previos, sin efectos.
        const pz = piezaDe(semanas, semana, id);
        if (!pz) continue;
        const { s, pieza } = pz;
        const ef = estadoEfectivo(pieza, s.render[id], s.estado[id]);
        if (ef === "publicado" || ef === "saltado" || ef === "fallido") continue;
        // Solo piezas cuya subida quedó anotada en render.json (si la subida de procesar quedó pendiente, no).
        const rj = s.render[id];
        if (rj?.estado !== "renderizado" || !rj.medios) continue;
        const t = horaSegura(pieza);
        if (t === undefined) continue;
        const carpeta = join(outRoot, semana);
        const final = join(carpeta, id);
        const original = await leerManifiesto(final);
        if (!original) continue;
        // Una previa que la recuperación no pudo restaurar: no se apila otra encima.
        try {
          if ((await readdir(carpeta)).some((f) => PREV_RE.exec(f)?.[1] === id)) {
            log(`⚠️  ${id} (${semana}): quedó una carpeta .prev- de una corrida anterior; no corrijo sus fondos.`);
            continue;
          }
        } catch {
          continue;
        }
        // Hook de video Kling (pagado): reemplazó reel.mp4 en la final y dejó HECHO y RESPALDO,
        // que el manifiesto no lista. Un re-render limpio borraría el clip y la tarea del hook
        // volvería a gastar créditos cerca de la hora: nunca se corrige.
        if (existsSync(join(final, HECHO)) || existsSync(join(final, RESPALDO))) {
          log(`🖼️  ${id} (${semana}): tiene hook de video aplicado; no corrijo sus fondos.`);
          continue;
        }
        const previa = await entradaDe(semana, id);
        if (previa.correccion) continue;
        if (previa.revisor?.estado !== "revisado") continue;
        let b: Borrador;
        try {
          b = parseBorrador(await leerBorradorSeguro(semana, pieza.borrador));
        } catch {
          continue;
        }
        if (b.hookVideo !== undefined) {
          log(`🖼️  ${id} (${semana}): su borrador pide hook de video; no corrijo sus fondos.`);
          continue;
        }
        const ya = ((await fondosIaQuitados(semana)).get(id) ?? []).map((x) => x.slide);
        const slides = slidesACorregir(b, previa.revisor.imagenes, ya);
        if (!slides.length) continue;
        const quitar = slides.map((slide) => ({ slide, motivo: motivoRevisor(previa.revisor!.imagenes, slide) }));

        const anotar = async (estado: CorreccionPieza["estado"], motivo?: string): Promise<void> => {
          const correccion: CorreccionPieza = { en: ahora().toISOString(), estado, slides, ...(motivo !== undefined ? { motivo: oculto(motivo) } : {}) };
          try {
            await deps.escribirVisual(semana, id, { ...previa, correccion });
          } catch (e) {
            log(`⚠️  Corrección de fondos: no pude anotar ${id} en visual.json de ${semana}: ${razon(e)}`);
          }
        };
        const omitir = async (motivo: string): Promise<void> => {
          log(`🖼️  ${id} (${semana}): corrección omitida (${motivo}).`);
          await anotar("omitida", motivo);
          res.omitidas++;
        };
        const fallar = async (motivo: string, extra = ""): Promise<void> => {
          await anotar("fallida", motivo);
          res.fallidas++;
          await avisar(`Corrección de fondos de ${id} (${semana}) fallida: ${motivo}. Queda el render original${extra}; render.json sin cambios.`);
        };

        // (a) Hora al empezar: sin render.
        if (!conMargen(t)) {
          await omitir(SIN_MARGEN);
          continue;
        }

        // (a') El re-render nunca genera imágenes: todo fondo ai que se conserva debe estar en caché
        // (si no, `resolveBackground` llamaría a gpt-image-1, o con solo-caché lo dejaría liso sin avisar).
        let faltan: number[];
        try {
          const enCache = deps.enCache ?? ((x: string) => fondoEnCache(x));
          faltan = fondosAiConservados(b, [...ya, ...slides], pieza.formato).filter((f) => !enCache(f.prompt)).map((f) => f.slide);
        } catch (e) {
          await fallar(`no pude comprobar la caché de fondos ai: ${razon(e)}`);
          continue;
        }
        if (faltan.length) {
          await fallar(`${SIN_CACHE} (${faltan.map((i) => `slide ${i + 1}`).join(", ")})`);
          continue;
        }

        const tmp = join(carpeta, `${id}.tmp-corr-${process.pid}`);
        const prev = join(carpeta, `${id}.prev-${process.pid}`);
        let movido = false; // ¿la final original está en `prev`?
        const descartada = join(carpeta, `${id}.tmp-descartada-${process.pid}`);
        /**
         * El render nuevo queda como definitivo: desde aquí ya no se puede restaurar (`movido`
         * en false) y la previa deja de parecer válida antes de borrarla (rename a un nombre que
         * la recuperación no toma; si falla, se le quita el manifiesto). Nunca lanza.
         */
        const descartarPrevia = async (): Promise<void> => {
          movido = false;
          let aBorrar = descartada;
          try {
            await rm(descartada, { recursive: true, force: true });
            await rename(prev, descartada);
          } catch (e) {
            aBorrar = prev;
            log(`⚠️  No pude apartar ${prev} (${razon(e)}); le quito el manifiesto antes de borrarla.`);
            await unlink(join(prev, MANIFIESTO)).catch((err) => log(`⚠️  No pude quitar el manifiesto de ${prev}: ${razon(err)}; la próxima corrida podría restaurarla.`));
          }
          try {
            await (deps.borrar ?? ((r: string) => rm(r, { recursive: true, force: true })))(aBorrar);
          } catch (e) {
            log(`⚠️  No pude borrar ${aBorrar}: ${razon(e)} (ya no se restaura; la próxima corrida la limpia).`);
          }
        };
        const restaurar = async (): Promise<void> => {
          if (!movido) return;
          await rm(final, { recursive: true, force: true });
          await rename(prev, final);
          movido = false;
        };
        let subio = false; // ¿se intentó subir el render nuevo?
        try {
          await rm(tmp, { recursive: true, force: true });
          await mkdir(tmp, { recursive: true });
          log(`🖼️  ${id} (${semana}): re-render sin el fondo ai de ${slides.map((i) => `slide ${i + 1}`).join(", ")}…`);
          const pend: PiezaPendiente = { semana, pieza, borradorPath: join(semanaDir(semana), pieza.borrador) };
          let nuevo: Manifiesto;
          try {
            const r = await deps.render(pend, tmp, quitar);
            // Los nombres de archivo no pueden cambiar: el bot publica los de render.json, y
            // la subida (sin --delete) pisa archivo por archivo.
            if (!mismosArchivos(r.archivos, original.archivos)) {
              throw new Error(`el re-render cambió los archivos (${r.archivos.join(", ")} en vez de ${original.archivos.join(", ")})`);
            }
            nuevo = { archivos: r.archivos, ...(r.duracionMs !== undefined ? { duracionMs: r.duracionMs } : {}), ...(r.escenas?.length ? { escenas: r.escenas } : {}) };
            await writeFile(join(tmp, MANIFIESTO), JSON.stringify(nuevo), "utf8");
          } catch (e) {
            // ErrorVisual (fase 1 en bloquear), ErrorContenido o del entorno: se queda el original.
            await fallar(`el re-render falló: ${razon(e)}`);
            continue;
          }

          // Swap: la final original pasa a la previa y el render nuevo a la final.
          await rename(final, prev);
          movido = true;
          await rename(tmp, final);

          // (b) Hora antes de subir: si no alcanza, vuelve el original (que ya estaba subido).
          if (!conMargen(t)) {
            await restaurar();
            await omitir(SIN_MARGEN);
            continue;
          }

          subio = true;
          try {
            await deps.rsync(final, destinoRemoto(env, semana, id));
          } catch (e) {
            await restaurar();
            const re = await resubir(semana, id, final, t);
            await fallar(`la subida falló: ${razon(e)}`, ` (${re})`);
            continue;
          }
          const url = (a: string): string => urlPublica(env.base, env.token, semana, id, a);
          const caidas: string[] = [];
          for (const a of nuevo.archivos) {
            let ok = false;
            try {
              ok = await deps.verificar(url(a), tipoDe(a));
            } catch {
              ok = false;
            }
            if (!ok) caidas.push(a);
          }
          if (caidas.length) {
            await restaurar();
            const re = await resubir(semana, id, final, t);
            await fallar(`el servidor no sirve ${caidas.join(", ")} tras la subida`, ` (${re})`);
            continue;
          }

          // (c) Hora antes de anotar. Los archivos corregidos ya están en el servidor con los
          // mismos nombres, así que el bot publicará esos igual. Lo seguro es NO re-subir el
          // original (otra subida aún más cerca de la hora es justo la carrera que se evita)
          // ni reescribir render.json (mandaría un preview nuevo ya sin margen). La final del
          // Mac queda con el render nuevo para coincidir con el servidor; la previa se borra.
          // Se anota «aplicada» (con motivo): los archivos corregidos son los que se publicarán.
          if (!conMargen(t)) {
            await descartarPrevia();
            await anotar("aplicada", `subida sin reescribir render.json: ${SIN_MARGEN}`);
            await confirmar(semana);
            res.aplicadas++;
            log(`🖼️  ${id} (${semana}): corrección subida sin reescribir render.json (${SIN_MARGEN}).`);
            await avisar(`Corrección de fondos de ${id} (${semana}): la subida terminó sin margen antes de la hora. El servidor ya tiene la versión sin el fondo ai de ${slides.map((i) => `slide ${i + 1}`).join(", ")} y es la que se publicará, pero no mando un preview nuevo (render.json sin cambios).`);
            continue;
          }

          try {
            // `en` se fija aquí, justo antes de anotar, y se confirma enseguida (abajo): el bot
            // vuelve a mandar el preview solo si `en` es posterior a la entrega del original.
            const medios = armarMedios(pieza.formato, nuevo);
            await deps.escribirRender(semana, id, { estado: "renderizado", medios, en: ahora().toISOString() });
          } catch (e) {
            await restaurar();
            const re = await resubir(semana, id, final, t);
            await fallar(`no pude anotar render.json: ${razon(e)}`, ` (${re})`);
            continue;
          }
          await descartarPrevia();
          await anotar("aplicada");
          await confirmar(semana);
          res.aplicadas++;
          log(`🖼️  ✓ ${id} (${semana}): fondo ai quitado en ${slides.map((i) => `slide ${i + 1}`).join(", ")}, re-renderizada y subida.`);
        } catch (e) {
          // Inesperado (rename, disco): se deja el original como se pueda.
          let extra = "";
          try {
            await restaurar();
            if (subio) extra = ` (${await resubir(semana, id, final, t)})`;
          } catch (err) {
            extra = ` (no pude restaurar la carpeta original: ${razon(err)}; la próxima corrida lo reintenta)`;
          }
          await fallar(`error inesperado: ${razon(e)}`, extra);
        } finally {
          await rm(tmp, { recursive: true, force: true }).catch(() => {});
        }
      } catch (e) {
        log(`⚠️  Corrección de fondos: ${id} (${semana}) quedó sin corregir: ${razon(e)}`);
      }
    }
  } catch (e) {
    log(`⚠️  Corrección de fondos: error inesperado: ${razon(e)}`);
  }
  return res;
}
