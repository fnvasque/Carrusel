import { rm } from "node:fs/promises";
import { join } from "node:path";
import { cuadrosARevisar, extraerCuadros, transicionDe, type Cuadro } from "./cuadros-visuales.ts";
import { corregirFondos, type DepsCorreccion, type PuertaCorreccion } from "./correccion-fondos.ts";
import { parseBorrador, type Borrador } from "./draft.ts";
import { estadoEfectivo, leerSemana, type Pieza, type SemanaLeida } from "./plan.ts";
import { TEXT_KEYS } from "./qa.ts";
import { fondosIaQuitados, horaDe, leerBorradorSeguro, leerManifiesto, type EnvRender } from "./render.ts";
import type { LlamarModelo, revisarFondos } from "./revisor-visual.ts";
import { callbackVisual, captionVisual } from "./telegram.ts";
import { TOPES_REVISOR, cupo, leerVisual, sinClaves, type CorreccionPieza, type PresupuestoSemana, type RevisionPieza, type VeredictoImagen, type VisualJson, type VisualPieza } from "./visual.ts";

/**
 * Revisión de fondos con modelo de visión en el Mac, después de `procesar` (solo avisa,
 * nunca bloquea): por cada pieza renderizada cuya hora no pasó y que aún no tiene
 * `revisor` ni `correccion` en visual.json, saca los cuadros, pregunta al modelo, anota el veredicto y
 * el gasto de la semana (`_presupuesto`) y manda una foto con botones por imagen señalada
 * (una por escena o slide, a lo más 3 por pieza). Corre cada hora sin supervisión y gasta dinero: respeta los topes y nunca lanza.
 *
 * Reparto en dos pasos (fase 3): la corrección automática tiene que correr entre la revisión y
 * el aviso, para que la caption diga si la slide se corrigió.
 *  1. `revisarSinAvisar`: revisa y anota (igual que la fase 2) y deja en cola las fotos a
 *     mandar, con sus cuadros aún en `<outRoot>/.revision/<semana>/<id>/`. Las piezas sin fotos
 *     en cola borran sus cuadros al terminar, como antes.
 *  2. (opcional) `corregirFondos` sobre `piezas` (las revisadas en esta corrida).
 *  3. `avisarRevisadas`: manda las fotos en cola (si la hora de la pieza no pasó mientras tanto)
 *     y borra siempre los cuadros que quedaban, también ante un error.
 * La foto avisada es del render que el revisor marcó (el ANTERIOR a la corrección): así se mide si
 * el revisor tenía razón. Si esa slide quedó corregida, la caption lleva «(corregido: fondo quitado)».
 * `revisarRenderizadas` (fase 2) = 1 + 3; `revisarYCorregir` (render-cli) = 1 + 2 + 3.
 */

export interface DepsRevision {
  revisar: typeof revisarFondos;
  llamar: LlamarModelo;
  extraer: typeof extraerCuadros;
  enviarFoto: (ruta: string, caption: string, botones: { texto: string; data: string }[][]) => Promise<boolean>;
  escribirVisual: (semana: string, id: string, e: VisualPieza | PresupuestoSemana) => Promise<void>;
  log: (t: string) => void;
  ahora?: () => Date;
  /** Lo anotado en esta corrida y aún sin confirmar (el escritor reemplaza por id). */
  visualPendiente?: (semana: string, id: string) => unknown;
  /** Lector de visual.json (por defecto el de la base). */
  leerVisual?: (semana: string) => Promise<VisualJson>;
  /** Para ver si hay `OPENAI_API_KEY` (por defecto `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Plazo total de la revisión (ms, por defecto 5 min): corre con el candado del render tomado. */
  plazoMs?: number;
}

export const PLAZO_REVISION_MS = 5 * 60_000;

const SEMANA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9-]{3,80}$/;

const razon = (e: unknown): string => sinClaves(e instanceof Error ? e.message : String(e));

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Textos visibles del borrador (las mismas props que lee la QA de lectura). */
function textosDe(b: Borrador): string[] {
  const out: string[] = [];
  for (const s of b.slides) {
    const props = (s.props ?? {}) as Record<string, unknown>;
    for (const k of TEXT_KEYS) {
      const v = props[k];
      if (typeof v === "string" && v.trim()) out.push(v.trim());
      else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) out.push(x.trim());
    }
  }
  return out;
}

function sinRevisar(en: string, motivo: string): RevisionPieza {
  return { en, modelo: "", estado: "sin revisar", motivo, imagenes: [], usd: 0 };
}

/** Escena o slide de un cuadro según su `que` («escena 2 (Step) final» → «escena 2»); la portada es su propio grupo. */
export function grupoDe(que: string): string {
  return /^(escena \d+|slide \d+)/.exec(que)?.[1] ?? que;
}

/** Las imágenes señaladas que se avisan por foto: la primera de cada escena o slide, hasta `avisosPorPieza`. */
export function avisosDe(imagenes: VeredictoImagen[]): VeredictoImagen[] {
  const vistos = new Set<string>();
  const out: VeredictoImagen[] = [];
  for (const v of imagenes) {
    if (!v.compite && !v.ajeno) continue;
    const g = grupoDe(v.que);
    if (vistos.has(g)) continue;
    vistos.add(g);
    out.push(v);
    if (out.length >= TOPES_REVISOR.avisosPorPieza) break;
  }
  return out;
}

export interface ResumenRevision { revisadas: number; sinRevisar: number; avisos: number; usd: number }

/** Una foto en cola: el veredicto señalado y su cuadro extraído. */
export interface FotoPendiente { v: VeredictoImagen; ruta: string }

/** Lo que deja `revisarSinAvisar` para `avisarRevisadas`. */
export interface RevisionCorrida {
  resumen: ResumenRevision;
  /** Piezas con veredicto «revisado» en esta corrida: las candidatas de `corregirFondos`. */
  piezas: { semana: string; id: string }[];
  /** Fotos por mandar, por pieza, en orden de hora. */
  avisos: { semana: string; id: string; t: number; fotos: FotoPendiente[] }[];
  /** Borra los cuadros que siguen en disco (idempotente; nunca lanza). */
  limpiar: () => Promise<void>;
}

/** Fase 2 completa (revisar y avisar sin corrección en medio). Respeta topes; nunca lanza. Devuelve un resumen. */
export async function revisarRenderizadas(semanas: SemanaLeida[], outRoot: string, deps: DepsRevision): Promise<ResumenRevision> {
  const c = await revisarSinAvisar(semanas, outRoot, deps);
  c.resumen.avisos = await avisarRevisadas(c, deps);
  return c.resumen;
}

const logSeguro = (deps: Pick<DepsRevision, "log">) => (t: string): void => {
  try {
    deps.log(sinClaves(t));
  } catch {
    // un log que falla no corta la revisión
  }
};

/**
 * Paso 1: revisa las piezas renderizadas en outRoot (carpeta final con manifiesto) cuya entrada en
 * visual.json no tiene `revisor` ni `correccion` y cuya hora no pasó, anota el veredicto y deja en
 * cola las fotos (sin mandarlas). Respeta topes; nunca lanza. Quien la llama debe llamar después
 * a `avisarRevisadas` (o a `limpiar`) para borrar los cuadros en cola.
 */
export async function revisarSinAvisar(
  semanas: SemanaLeida[],
  outRoot: string,
  deps: DepsRevision,
): Promise<RevisionCorrida> {
  const res: ResumenRevision = { revisadas: 0, sinRevisar: 0, avisos: 0, usd: 0 };
  const log = logSeguro(deps);
  const enCola = new Set<string>();
  const corrida: RevisionCorrida = {
    resumen: res,
    piezas: [],
    avisos: [],
    limpiar: async () => {
      for (const d of [...enCola]) {
        enCola.delete(d);
        await rm(d, { recursive: true, force: true }).catch((e) => log(`⚠️  No pude borrar ${d}: ${razon(e)}`));
      }
    },
  };
  try {
    const env = deps.env ?? process.env;
    if (!env.OPENAI_API_KEY?.trim()) {
      log("🖼️  Revisión de fondos: falta OPENAI_API_KEY; no reviso nada (se reintenta cuando haya clave).");
      return corrida;
    }
    const ahora = deps.ahora ?? (() => new Date());
    const limite = ahora().getTime() + (deps.plazoMs ?? PLAZO_REVISION_MS);
    const leer = deps.leerVisual ?? leerVisual;

    // Candidatas en orden de hora (todas las semanas cargadas).
    const cand: { semana: string; pieza: Pieza; t: number }[] = [];
    for (const s of semanas) {
      if (!SEMANA_RE.test(s.semana)) continue;
      for (const pieza of s.plan.piezas) {
        if (!ID_RE.test(pieza.id)) continue;
        // Publicada o saltada (por el bot): ya no hay nada que avisar.
        const ef = estadoEfectivo(pieza, s.render[pieza.id], s.estado[pieza.id]);
        if (ef === "publicado" || ef === "saltado") continue;
        let t: number;
        try {
          t = horaDe(pieza);
        } catch {
          continue;
        }
        if (Number.isFinite(t)) cand.push({ semana: s.semana, pieza, t });
      }
    }
    cand.sort((a, b) => a.t - b.t);

    // Estado por semana, leído una sola vez: visual.json y el contador de gasto en memoria.
    const visuales = new Map<string, VisualJson>();
    const presupuestos = new Map<string, PresupuestoSemana>();
    const quitadosPorSemana = new Map<string, Map<string, { slide: number }[]>>();
    const visualDe = async (semana: string): Promise<VisualJson> => {
      let v = visuales.get(semana);
      if (!v) {
        try {
          v = await leer(semana);
        } catch (e) {
          log(`⚠️  Revisión de fondos: no pude leer visual.json de ${semana}: ${razon(e)}`);
          v = {};
        }
        visuales.set(semana, v);
      }
      return v;
    };
    const entradaDe = async (semana: string, id: string): Promise<VisualPieza> => {
      const pend = deps.visualPendiente?.(semana, id);
      if (esObjeto(pend)) return pend as VisualPieza;
      return (await visualDe(semana))[id] ?? {};
    };
    const presupuestoDe = async (semana: string): Promise<PresupuestoSemana> => {
      let p = presupuestos.get(semana);
      if (!p) {
        const pend = deps.visualPendiente?.(semana, "_presupuesto");
        const previo = (esObjeto(pend) ? pend : (await visualDe(semana))._presupuesto) as PresupuestoSemana | undefined;
        // Lo ilegible se conserva tal cual: `cupo` falla cerrado ante eso.
        p = previo ? { ...previo } : { imagenes: 0, usd: 0 };
        presupuestos.set(semana, p);
      }
      return p;
    };
    const quitadosDe = async (semana: string, id: string): Promise<number[]> => {
      let q = quitadosPorSemana.get(semana);
      if (!q) {
        try {
          q = await fondosIaQuitados(semana);
        } catch {
          q = new Map();
        }
        quitadosPorSemana.set(semana, q);
      }
      return (q.get(id) ?? []).map((x) => x.slide);
    };
    const escribir = async (semana: string, id: string, e: VisualPieza | PresupuestoSemana): Promise<boolean> => {
      try {
        await deps.escribirVisual(semana, id, e);
        return true;
      } catch (err) {
        log(`⚠️  Revisión de fondos: no pude anotar ${id} en visual.json de ${semana}: ${razon(err)}`);
        return false;
      }
    };

    for (const [k, { semana, pieza, t }] of cand.entries()) {
      if (ahora().getTime() >= limite) {
        log(`🖼️  Revisión de fondos: se acabó el plazo de la corrida; quedan ${cand.length - k} pieza(s) candidatas para la próxima.`);
        break;
      }
      const { id } = pieza;
      const final = join(outRoot, semana, id);
      const destino = join(outRoot, ".revision", semana, id);
      let guardar = false; // ¿quedan fotos en cola con cuadros en `destino`?
      try {
        if (t <= ahora().getTime()) continue;
        const manifiesto = await leerManifiesto(final);
        if (!manifiesto) continue;
        const previa = await entradaDe(semana, id);
        // Con `correccion` (fase 3) no se vuelve a revisar: una corrección por pieza, sin bucle.
        if (previa.revisor || previa.correccion) continue;

        let b: Borrador;
        try {
          b = parseBorrador(await leerBorradorSeguro(semana, pieza.borrador));
        } catch (e) {
          log(`⚠️  Revisión de fondos: no pude leer el borrador de ${id} (${semana}): ${razon(e)}`);
          continue;
        }
        const quitados = await quitadosDe(semana, id);
        const transicion = transicionDe(b);
        const pres = await presupuestoDe(semana);
        const todos = cuadrosARevisar(pieza.formato, b, manifiesto.escenas, transicion, TOPES_REVISOR.imagenesPorPieza, quitados);
        const c = cupo(pres, todos.length);
        const en = ahora().toISOString();

        let revision: RevisionPieza;
        let rutas: { n: number; ruta: string; que: string }[] = [];
        let cuadrosPedidos: Cuadro[] = [];
        let intentos: number | undefined;
        if (c.imagenes === 0) {
          revision = sinRevisar(en, c.motivo ?? "sin cupo");
        } else {
          const cuadros = cuadrosARevisar(pieza.formato, b, manifiesto.escenas, transicion, Math.min(c.imagenes, TOPES_REVISOR.imagenesPorPieza), quitados);
          cuadrosPedidos = cuadros;
          // Un fallo al extraer no se anota: la próxima corrida reintenta.
          rutas = await deps.extraer(final, destino, cuadros);
          // El plazo se mira también justo antes de llamar: así se pasa a lo más por una llamada.
          if (ahora().getTime() >= limite) {
            log(`🖼️  Revisión de fondos: se acabó el plazo antes de llamar al modelo por ${id}; quedan ${cand.length - k} pieza(s) candidatas para la próxima.`);
            break;
          }
          revision = await deps.revisar(rutas, { id, formato: pieza.formato, textos: textosDe(b) }, { llamar: deps.llamar, ahora });
          const usd = Number.isFinite(revision.usd) && revision.usd > 0 ? revision.usd : 0;
          // Fallo sin veredicto ni respuesta medida: sin costo (imagen ilegible) o con costo
          // estimado (la llamada lanzó: timeout/red/5xx, pudo cobrarse). Se reintenta en la
          // próxima corrida hasta `intentosPorPieza`; al último se anota «sin revisar».
          if (revision.estado !== "revisado" && (revision.usdEstimado === true || usd === 0)) {
            if (revision.usdEstimado === true && usd > 0) {
              pres.imagenes += rutas.length;
              pres.usd += usd;
              res.usd += usd;
            }
            const previos = Number.isInteger(previa.intentos) && (previa.intentos as number) > 0 ? (previa.intentos as number) : 0;
            intentos = previos + 1;
            const motivo = sinClaves(revision.motivo ?? "sin motivo");
            if (intentos < TOPES_REVISOR.intentosPorPieza) {
              await escribir(semana, id, { ...previa, intentos });
              if (usd > 0) await escribir(semana, "_presupuesto", { ...pres });
              log(`⚠️  Revisión de fondos: ${id} (${semana}) no se pudo revisar (${motivo}${usd > 0 ? `, costo estimado US$${usd.toFixed(4)}` : ""}); intento ${intentos} de ${TOPES_REVISOR.intentosPorPieza}, se reintenta en la próxima corrida.`);
              continue;
            }
            revision = { ...revision, motivo: `${motivo} (${intentos} intentos)` };
          } else {
            // Respuesta del modelo (revisada o con costo medido): sus imágenes y su costo cuentan.
            pres.imagenes += rutas.length;
            pres.usd += usd;
            res.usd += usd;
          }
        }
        // Cada veredicto lleva la slide de su cuadro (mismo `n`) para que la fase 3 sepa qué corregir.
        const slidePorN = new Map(cuadrosPedidos.map((q) => [q.n, q.slide]));
        revision = {
          ...revision,
          ...(revision.motivo !== undefined ? { motivo: sinClaves(revision.motivo) } : {}),
          imagenes: revision.imagenes.map((v) => (slidePorN.has(v.n) ? { ...v, slide: slidePorN.get(v.n) as number } : v)),
        };

        await escribir(semana, id, { ...previa, ...(intentos !== undefined ? { intentos } : {}), revisor: revision });
        await escribir(semana, "_presupuesto", { ...pres });

        if (revision.estado === "revisado") {
          res.revisadas++;
          corrida.piezas.push({ semana, id });
          log(`🖼️  ${id} (${semana}): fondos revisados (${revision.imagenes.length} imagen(es), US$${revision.usd.toFixed(4)}).`);
        } else {
          res.sinRevisar++;
          log(`🖼️  ${id} (${semana}): sin revisar (${revision.motivo ?? "sin motivo"}).`);
          continue;
        }

        // La hora pudo pasar durante la llamada: el veredicto queda, pero ya no se avisa.
        if (t <= ahora().getTime()) {
          log(`🖼️  ${id} (${semana}): su hora pasó durante la revisión; no mando avisos.`);
          continue;
        }
        const aAvisar = avisosDe(revision.imagenes);
        const resto = revision.imagenes.filter((v) => v.compite || v.ajeno).length - aAvisar.length;
        if (resto > 0) log(`🖼️  ${id} (${semana}): ${resto} imagen(es) señalada(s) más quedan solo en visual.json (una foto por escena, ${TOPES_REVISOR.avisosPorPieza} por pieza).`);
        const fotos: FotoPendiente[] = [];
        for (const v of aAvisar) {
          const ruta = rutas.find((r) => r.n === v.n)?.ruta;
          if (ruta) fotos.push({ v, ruta });
        }
        if (fotos.length) {
          corrida.avisos.push({ semana, id, t, fotos });
          enCola.add(destino);
          guardar = true;
        }
      } catch (e) {
        log(`⚠️  Revisión de fondos: ${id} (${semana}) quedó sin revisar en esta corrida: ${razon(e)}`);
      } finally {
        if (!guardar) await rm(destino, { recursive: true, force: true }).catch((e) => log(`⚠️  No pude borrar ${destino}: ${razon(e)}`));
      }
    }
  } catch (e) {
    log(`⚠️  Revisión de fondos: error inesperado: ${razon(e)}`);
  }
  return corrida;
}

/**
 * Paso 3: manda las fotos en cola de `revisarSinAvisar` y borra siempre sus cuadros. Una pieza cuya
 * hora pasó desde la revisión (p. ej. durante la corrección) ya no se avisa, como en la fase 2.
 * `correccionDe` (fase 3) da la corrección de la pieza tras `corregirFondos`: «corregido» solo si
 * quedó `aplicada` y la slide de la foto está entre las corregidas. Devuelve los avisos que llegaron. Nunca lanza.
 */
export async function avisarRevisadas(
  corrida: RevisionCorrida,
  deps: Pick<DepsRevision, "enviarFoto" | "log" | "ahora">,
  correccionDe?: (semana: string, id: string) => CorreccionPieza | undefined,
): Promise<number> {
  const log = logSeguro(deps);
  const ahora = deps.ahora ?? (() => new Date());
  let avisos = 0;
  try {
    for (const { semana, id, t, fotos } of corrida.avisos) {
      try {
        if (t <= ahora().getTime()) {
          log(`🖼️  ${id} (${semana}): su hora pasó antes de mandar los avisos; no los mando.`);
          continue;
        }
        let corr: CorreccionPieza | undefined;
        try {
          corr = correccionDe?.(semana, id);
        } catch {
          corr = undefined;
        }
        for (const { v, ruta } of fotos) {
          const tipo = v.compite ? "fondo-compite" : "fondo-ajeno";
          const corregido = corr?.estado === "aplicada" && typeof v.slide === "number" && Array.isArray(corr.slides) && corr.slides.includes(v.slide);
          const caption = captionVisual(id, semana, v.que, sinClaves(v.frase), tipo, corregido || undefined);
          const botones = [[
            { texto: "Tenía razón", data: callbackVisual(semana, id, v.n, "si") },
            { texto: "No", data: callbackVisual(semana, id, v.n, "no") },
          ]];
          let ok = false;
          try {
            ok = await deps.enviarFoto(ruta, caption, botones);
          } catch (e) {
            log(`⚠️  Revisión de fondos: no pude mandar la foto ${v.n} de ${id}: ${razon(e)}`);
          }
          if (ok) avisos++;
          else log(`⚠️  Revisión de fondos: el aviso de la imagen ${v.n} de ${id} no llegó (no se reintenta).`);
        }
      } catch (e) {
        log(`⚠️  Revisión de fondos: no pude avisar ${id} (${semana}): ${razon(e)}`);
      }
    }
  } finally {
    await corrida.limpiar();
  }
  return avisos;
}

/**
 * Revisión + corrección (fase 3) + aviso, en ese orden (ver el reparto arriba). `corregirFondos`
 * corre siempre (loguea «fase 3 inactiva» una sola vez); los restos de una corrida cortada ya los
 * deshizo `recuperarCorreccionesCortadas` en `render-cli`, antes de `procesar`. `semanas` debe traer el render.json de ESTA corrida (ver
 * `releerSemanas`): `corregirFondos` solo toca piezas «renderizado» con medios. Nunca lanza.
 */
export async function revisarYCorregir(
  semanas: SemanaLeida[],
  outRoot: string,
  deps: DepsRevision,
  corr: { env: EnvRender; puerta: PuertaCorreccion; deps: DepsCorreccion },
): Promise<{ revision: ResumenRevision; correccion: { aplicadas: number; fallidas: number; omitidas: number } }> {
  const corrida = await revisarSinAvisar(semanas, outRoot, deps);
  let correccion = { aplicadas: 0, fallidas: 0, omitidas: 0 };
  // Lo que `corregirFondos` anota por pieza, para la caption (además va al escritor como siempre).
  const anotadas = new Map<string, CorreccionPieza>();
  try {
    correccion = await corregirFondos(semanas, corrida.piezas, outRoot, corr.env, corr.puerta, {
      ...corr.deps,
      escribirVisual: async (semana, id, e) => {
        if (e.correccion) anotadas.set(`${semana}/${id}`, e.correccion);
        await corr.deps.escribirVisual(semana, id, e);
      },
    });
  } catch (e) {
    logSeguro(deps)(`⚠️  Corrección de fondos: error inesperado: ${razon(e)}`);
  }
  corrida.resumen.avisos = await avisarRevisadas(corrida, deps, (semana, id) => anotadas.get(`${semana}/${id}`));
  return { revision: corrida.resumen, correccion };
}

/**
 * Vuelve a leer cada semana del disco de la base (después de los `confirmar` de `procesar`), para
 * que la revisión y la corrección vean el render.json de esta corrida: una pieza renderizada recién
 * no está «renderizado» en las semanas leídas antes de `procesar`, y como sale de la revisión con
 * `revisor` ya no se corregiría nunca. Si la relectura falla o no encuentra la semana, se queda la leída.
 */
export async function releerSemanas(
  semanas: SemanaLeida[],
  leer: (semana: string) => Promise<SemanaLeida | undefined> = leerSemana,
  log: (t: string) => void = () => {},
): Promise<SemanaLeida[]> {
  const out: SemanaLeida[] = [];
  for (const s of semanas) {
    try {
      out.push((await leer(s.semana)) ?? s);
    } catch (e) {
      log(`⚠️  No pude releer la semana ${s.semana} (${razon(e)}); sigo con la leída al empezar.`);
      out.push(s);
    }
  }
  return out;
}
