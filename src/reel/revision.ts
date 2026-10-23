import type { Page } from "playwright";
import type { ReelTiming } from "./timing.ts";
import { inyectarRevision, unicos, type Hallazgo, type InstanteDom, type OpcionesDom, type TextoDom } from "../render/revision.ts";
import { REEL_SAFE_BOTTOM, REEL_SAFE_TOP } from "../templates/layout.ts";
import { FORMATS } from "../templates/types.ts";

/**
 * Revisión visual del reel en el tiempo: recorre la timeline con
 * `__reel.seek` y lee el DOM en cada instante (sin capturas). La puntuación se
 * mira en todos los instantes (el espacio antes de la coma dura lo que crece
 * la palabra clave, ~0,3 s); tilde y zona solo en el estado final de cada
 * escena; el encime de la transición y el número de paso solo se sacan de la
 * serie completa con los agregadores puros.
 */

/** Separación (s) entre instantes de la grilla. */
const PASO = 0.1;

const r3 = (x: number) => +x.toFixed(3);

/** Estado final de cada escena, como `captureStills`: antes de su salida (la última, al final del reel). */
export function instantesFinales(timing: ReelTiming): number[] {
  const n = timing.scenes.length;
  return timing.scenes.map((s, i) => r3(i === n - 1 ? timing.total - 0.05 : s.start + s.dur - timing.transition - 0.05));
}

/** Instantes a revisar: cada 0,1 s de 0 a total, más el estado final de cada escena (como captureStills) y la mitad de cada transición. Ordenados y sin repetir. */
export function instantesRevision(timing: ReelTiming): number[] {
  const xs: number[] = [];
  for (let k = 0; k * PASO <= timing.total + 1e-9; k++) xs.push(r3(k * PASO));
  xs.push(...instantesFinales(timing));
  for (let i = 1; i < timing.scenes.length; i++) xs.push(r3(timing.scenes[i].start + timing.transition / 2));
  return [...new Set(xs)].sort((a, b) => a - b);
}

type Serie = { t: number; textos: TextoDom[] }[];

/** Opacidad mínima de cada texto para contar como encime. */
const ENCIME_OPACIDAD = 0.3;
/** Intersección mínima, como fracción del área del menor de los dos. */
const ENCIME_AREA = 0.1;

function interseccion(a: TextoDom["rect"], b: TextoDom["rect"]): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const corto = (s: string) => (s.length > 40 ? s.slice(0, 40) + "…" : s);

/**
 * Dos textos de escenas distintas, visibles a la vez (opacidad ≥ 0,3 cada uno)
 * y encimados (intersección ≥ 10 % del área del menor). Uno por par de
 * escenas, con el primer instante y los primeros textos en que se ve.
 */
export function encimes(serie: Serie, contexto: (escena: number) => string): Hallazgo[] {
  const out: Hallazgo[] = [];
  const pares = new Set<string>();
  for (const { t, textos } of serie) {
    const vis = textos.filter((x) => !x.marca && x.opacidad >= ENCIME_OPACIDAD && x.rect.w > 0 && x.rect.h > 0);
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const [a, b] = vis[i].escena <= vis[j].escena ? [vis[i], vis[j]] : [vis[j], vis[i]];
        if (a.escena === b.escena) continue;
        const par = `${a.escena}-${b.escena}`;
        if (pares.has(par)) continue;
        const menor = Math.min(a.rect.w * a.rect.h, b.rect.w * b.rect.h);
        if (interseccion(a.rect, b.rect) < ENCIME_AREA * menor) continue;
        pares.add(par);
        out.push({
          tipo: "transicion",
          escena: b.escena,
          t,
          motivo: `visual: «${corto(a.texto)}» de ${contexto(a.escena)} se encima con «${corto(b.texto)}» de ${contexto(b.escena)} en la transición`,
        });
      }
    }
  }
  return out;
}

/** Opacidad desde la que el número de paso se ve, y bajo la que su heading no. */
const NUMERO_VISIBLE = 0.8;
const HEADING_OCULTO = 0.2;

/**
 * Número de paso visible (≥ 0,8) mientras su heading (la palabra más visible)
 * está bajo 0,2 durante más de `maxS` s seguidos, medido entre el primer y el
 * último instante de la racha. Uno por escena.
 */
export function numerosSolos(serie: Serie, contexto: (escena: number) => string, maxS = 0.4): Hallazgo[] {
  const out: Hallazgo[] = [];
  const racha = new Map<number, { desde: number; numero: string }>();
  const avisadas = new Set<number>();
  const ordenada = [...serie].sort((a, b) => a.t - b.t);
  for (const { t, textos } of ordenada) {
    const numeros = new Map<number, TextoDom>();
    const headings = new Map<number, number>();
    for (const x of textos) {
      if (x.paso === "numero" && x.opacidad > (numeros.get(x.escena)?.opacidad ?? -1)) numeros.set(x.escena, x);
      if (x.paso === "heading") headings.set(x.escena, Math.max(headings.get(x.escena) ?? 0, x.opacidad));
    }
    const escenas = new Set([...numeros.keys(), ...racha.keys()]);
    for (const e of escenas) {
      const n = numeros.get(e);
      const solo = !!n && n.opacidad >= NUMERO_VISIBLE && (headings.get(e) ?? 0) < HEADING_OCULTO;
      if (!solo) {
        racha.delete(e);
        continue;
      }
      const r = racha.get(e) ?? { desde: t, numero: n!.texto };
      racha.set(e, r);
      if (t - r.desde > maxS + 1e-9 && !avisadas.has(e)) {
        avisadas.add(e);
        out.push({
          tipo: "numero-solo",
          escena: e,
          t: r.desde,
          motivo: `visual: el número «${r.numero}» se ve sin su heading más de ${maxS} s en ${contexto(e)}`,
        });
      }
    }
  }
  return out;
}

/** Lo que devuelve `window.__revisarSerie`: un `InstanteDom` por instante pedido. */
type InstanteSerie = InstanteDom & { t: number };

/** Recorre la timeline con __reel.seek y junta todos los hallazgos (puntuación en cada instante; tilde y zona en los estados finales; encime y número solo con los agregadores). */
export async function revisarReel(page: Page, timing: ReelTiming): Promise<Hallazgo[]> {
  await inyectarRevision(page);
  const finales = new Set(instantesFinales(timing));
  const pasos = instantesRevision(timing).map((t) => ({
    t,
    comprobar: (finales.has(t) ? ["tilde", "puntuacion", "zona"] : ["puntuacion"]) as OpcionesDom["comprobar"],
  }));
  const plantillas = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-scene]")).map((s) => s.getAttribute("data-plantilla") ?? "?"),
  );
  const contextos = plantillas.map((p, i) => `escena ${i + 1} (${p})`);
  const contexto = (i: number) => contextos[i] ?? `escena ${i + 1}`;
  const opts = { zona: { arriba: REEL_SAFE_TOP, abajo: REEL_SAFE_BOTTOM }, contexto: contextos, altura: FORMATS.reel.height };
  const serie = await page.evaluate(
    ({ pasos, opts }) => (window as any).__revisarSerie(pasos, opts) as InstanteSerie[],
    { pasos, opts },
  );
  const directos = serie.flatMap((s) => s.hallazgos.map((h) => ({ ...h, t: s.t })));
  return unicos([...directos, ...encimes(serie, contexto), ...numerosSolos(serie, contexto)]);
}
