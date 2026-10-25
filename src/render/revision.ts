import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import { MARGEN_LATERAL, REEL_SAFE_BOTTOM, REEL_SAFE_TOP } from "../templates/layout.ts";

/**
 * Revisión visual del render: mira el DOM ya pintado en Chromium y devuelve
 * hallazgos legibles (tilde que pisa la línea anterior, espacio antes de la
 * puntuación, texto fuera de la zona segura del reel…). La medición vive en
 * `revision-dom.js` (código de navegador plano, como `src/reel/runtime.js`);
 * aquí quedan los tipos, los agregadores puros y el puente con Playwright.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

export type TipoVisual = "tilde" | "puntuacion" | "transicion" | "numero-solo" | "zona";

export interface Hallazgo {
  tipo: TipoVisual;
  motivo: string;
  escena?: number;
  t?: number;
}

/** Error que corta el render cuando la revisión está en modo `bloquear`. */
export class ErrorVisual extends Error {
  hallazgos: Hallazgo[];
  constructor(hallazgos: Hallazgo[]) {
    super(hallazgos.map((h) => h.motivo).join("; "));
    this.name = "ErrorVisual";
    this.hallazgos = hallazgos;
  }
}

export type ModoRevision = "bloquear" | "avisar" | "no";

/** Estado de un texto visible en un instante (lo devuelve el DOM). */
export interface TextoDom {
  escena: number;
  texto: string;
  opacidad: number;
  rect: { x: number; y: number; w: number; h: number };
  paso?: "numero" | "heading";
  marca: boolean;
}

/** Lo que devuelve `window.__revisarVisual(opts)`. */
export interface InstanteDom {
  textos: TextoDom[];
  hallazgos: Hallazgo[];
}

/** Opciones de `window.__revisarVisual`. `contexto` es un texto o uno por escena (índice = escena). */
export interface OpcionesDom {
  comprobar: ("tilde" | "puntuacion" | "zona" | "lados")[];
  zona?: { arriba: number; abajo: number };
  /** Margen lateral (px) para "lados": texto que sale por un costado o se recorta en su caja (tipo "zona"). */
  lados?: number;
  /** Ancho del lienzo (por defecto innerWidth). */
  ancho?: number;
  contexto?: string | string[];
}

let script: Promise<string> | undefined;

/** Inyecta `revision-dom.js` en la página. Idempotente: si ya está, no hace nada. */
export async function inyectarRevision(page: Page): Promise<void> {
  const ya = await page.evaluate(() => typeof (window as any).__revisarVisual === "function");
  if (ya) return;
  script ??= readFile(join(HERE, "revision-dom.js"), "utf8").catch((e) => {
    script = undefined; // no dejar cacheado un fallo de lectura
    throw e;
  });
  await page.addScriptTag({ content: await script });
}

/**
 * Revisa el instante actual de la página: tilde, puntuación y lados
 * (`MARGEN_LATERAL`, texto que sale por un costado o se recorta) siempre; zona
 * segura vertical solo en reel (`REEL_SAFE_TOP` arriba, `REEL_SAFE_BOTTOM` abajo).
 * `contexto` va en cada motivo (p. ej. «slide 1 (Cta)»).
 */
export async function revisarPagina(page: Page, contexto: string, opts: { reel: boolean; altura: number }): Promise<Hallazgo[]> {
  await inyectarRevision(page);
  const dom: OpcionesDom = {
    comprobar: opts.reel ? ["tilde", "puntuacion", "zona", "lados"] : ["tilde", "puntuacion", "lados"],
    zona: { arriba: REEL_SAFE_TOP, abajo: REEL_SAFE_BOTTOM },
    lados: MARGEN_LATERAL,
    contexto,
  };
  const r = await page.evaluate(
    ({ o, altura }) => (window as any).__revisarVisual({ ...o, altura }) as InstanteDom,
    { o: dom, altura: opts.altura },
  );
  return unicos(r.hallazgos);
}

/** Quita repetidos por (tipo, escena, motivo); se queda con la primera aparición (y su `t`). */
export function unicos(h: Hallazgo[]): Hallazgo[] {
  const vistos = new Set<string>();
  const out: Hallazgo[] = [];
  for (const x of h) {
    const k = `${x.tipo}\u0000${x.escena ?? ""}\u0000${x.motivo}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(x);
  }
  return out;
}

/**
 * La revisión misma se cayó (no es un hallazgo): Chromium, el script del DOM, un seek.
 * El mensaje empieza con «la revisión visual falló: …» para que el aviso del Mac no lo
 * confunda con un problema del entorno.
 */
export class ErrorRevisionFallida extends Error {
  constructor(causa: unknown) {
    super(`la revisión visual falló: ${causa instanceof Error ? causa.message : String(causa)}`, { cause: causa });
    this.name = "ErrorRevisionFallida";
  }
}

/**
 * Corre la revisión (`revisar`) según el modo: `no` → no la corre; si se cae, en
 * `avisar` (CLI) solo advierte y sigue sin hallazgos, y en `bloquear` (calendario)
 * falla cerrado con `ErrorRevisionFallida`.
 */
export async function revisarSegun(modo: ModoRevision, revisar: () => Promise<Hallazgo[]>, log: (t: string) => void = console.warn): Promise<Hallazgo[]> {
  if (modo === "no") return [];
  try {
    return await revisar();
  } catch (e) {
    const err = new ErrorRevisionFallida(e);
    if (modo === "bloquear") throw err;
    log(`${err.message} (sigo sin revisar)`);
    return [];
  }
}

/** `bloquear` → lanza `ErrorVisual` si hay hallazgos; `avisar` → los registra; `no` → nada. */
export function aplicarModo(h: Hallazgo[], modo: ModoRevision, log: (t: string) => void = console.warn): void {
  if (modo === "no" || h.length === 0) return;
  if (modo === "bloquear") throw new ErrorVisual(h);
  for (const x of h) log(x.motivo);
}
