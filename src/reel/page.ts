import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlShell } from "../render/htmlShell.ts";
import { FORMATS, type CarouselSpec } from "../templates/types.ts";
import { theme } from "../theme.ts";
import { REEL_SAFE_BOTTOM, sourceReserve } from "../templates/layout.ts";
import type { ReelTiming } from "./timing.ts";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Alto (px desde abajo) del subtítulo: sobre la zona que tapa la interfaz de
 * Instagram (REEL_SAFE_BOTTOM, 440 px) y sobre la fuente al pie, que queda
 * justo encima de esa zona; el bloque de contenido va centrado más arriba.
 */
export const SUBTITULO_BOTTOM = REEL_SAFE_BOTTOM + 60;
/** Tamaño (px) del subtítulo y palabras / caracteres máximos por trozo (como en el cine: una frase, ≤ 2 líneas). */
export const SUBTITULO_SIZE = 54;
export const SUBTITULO_MAX_PALABRAS = 10;
export const SUBTITULO_MAX_CHARS = 48;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Parte una narración en trozos de subtítulo como en el cine: una frase por
 * trozo (corta por . ! ? …), y una frase larga en grupos de ≤
 * SUBTITULO_MAX_PALABRAS palabras y ≤ SUBTITULO_MAX_CHARS caracteres, cortando
 * de preferencia en una coma. Nunca devuelve trozos vacíos ni de una palabra
 * suelta si puede pegarla al anterior.
 */
export function trozosSubtitulo(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const frases = limpio.split(/(?<=[.!?…])\s+/).map((f) => f.trim()).filter(Boolean);
  const out: string[] = [];
  for (const f of frases) {
    if (f.split(" ").length <= SUBTITULO_MAX_PALABRAS && f.length <= SUBTITULO_MAX_CHARS) {
      out.push(f);
      continue;
    }
    // Frase larga: primero por comas (si cada parte cabe), si no por palabras.
    const partes = f.split(/(?<=[,;:])\s+/).map((x) => x.trim()).filter(Boolean);
    const cabe = (x: string) => x.split(" ").length <= SUBTITULO_MAX_PALABRAS && x.length <= SUBTITULO_MAX_CHARS;
    let grupo = "";
    const cierraGrupo = () => {
      if (grupo) out.push(grupo);
      grupo = "";
    };
    for (const parte of partes) {
      if (!cabe(parte)) {
        cierraGrupo();
        const palabras = parte.split(" ");
        let actual: string[] = [];
        for (const w of palabras) {
          const largo = actual.join(" ").length + (actual.length ? 1 : 0) + w.length;
          if (actual.length && (actual.length >= SUBTITULO_MAX_PALABRAS || largo > SUBTITULO_MAX_CHARS)) {
            out.push(actual.join(" "));
            actual = [];
          }
          actual.push(w);
        }
        if (actual.length) out.push(actual.join(" "));
        continue;
      }
      const junto = grupo ? `${grupo} ${parte}` : parte;
      if (cabe(junto)) grupo = junto;
      else {
        cierraGrupo();
        grupo = parte;
      }
    }
    cierraGrupo();
  }
  // Un trozo de 1 palabra corta al final de una frase se pega al anterior si cabe.
  for (let i = out.length - 1; i > 0; i--) {
    const uno = out[i].split(" ").length === 1 && out[i].length <= 8;
    const cabe = out[i - 1].split(" ").length < SUBTITULO_MAX_PALABRAS && (out[i - 1] + " " + out[i]).length <= SUBTITULO_MAX_CHARS + 6;
    if (uno && cabe) out.splice(i - 1, 2, `${out[i - 1]} ${out[i]}`);
  }
  return out;
}

/** Ventana de un trozo en segundos del reel. */
export interface TrozoTiempo {
  texto: string;
  at: number;
  hasta: number;
}

/** Silencio (s) que el último trozo sigue en pantalla tras terminar la voz. */
export const SUBTITULO_COLA = 0.35;

/**
 * Reparte los trozos sobre la voz: cada uno dura en proporción a sus
 * caracteres (más una pausa por la puntuación que lo cierra), empezando en
 * `start` y terminando en `start + segundos` (+ SUBTITULO_COLA el último).
 * Los trozos son continuos: uno termina cuando empieza el siguiente.
 */
export function tiemposTrozos(trozos: string[], start: number, segundos: number): TrozoTiempo[] {
  if (!trozos.length) return [];
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(segundos) || segundos <= 0) {
    throw new Error(`Tiempos de subtítulo inválidos (inicio ${start} s, voz ${segundos} s).`);
  }
  const peso = trozos.map((t) => t.length + (/[.!?…]$/.test(t) ? 6 : /[,;:]$/.test(t) ? 3 : 0));
  const total = peso.reduce((a, b) => a + b, 0);
  let t = start;
  return trozos.map((texto, i) => {
    const dur = (segundos * peso[i]) / total;
    const at = +t.toFixed(3);
    t += dur;
    const hasta = +(i === trozos.length - 1 ? t + SUBTITULO_COLA : t).toFixed(3);
    return { texto, at, hasta };
  });
}

/** Voz de una escena, para sincronizar su subtítulo: segundo del reel en que empieza y cuánto dura. */
export interface VozEscena {
  start: number;
  segundos: number;
}

/**
 * Subtítulo de la narración (`props.narracion`) en píldora: texto blanco sobre
 * tinta al 88 % (#111111), sin sombra, centrado abajo (sobre la fuente al pie),
 * ≤ 2 líneas. La píldora se lee igual sobre el papel que sobre el video de Clip; un trozo a la vez al ritmo de la voz (`data-sub-at` / `data-sub-hasta`
 * en segundos del reel; el runtime los enciende y apaga). Sin tiempos de voz
 * (sin narración sintetizada), muestra el texto entero mientras dura la escena.
 */
export function subtitulo(narracion: unknown, source?: unknown, voz?: VozEscena): string {
  if (typeof narracion !== "string" || !narracion.trim()) return "";
  const bottom = SUBTITULO_BOTTOM + sourceReserve(typeof source === "string" ? source : undefined);
  const estilo =
    `position:absolute;left:0;right:0;margin:0 auto;width:fit-content;max-width:960px;box-sizing:border-box;padding:10px 32px;border-radius:44px;` +
    `background:rgba(17,17,17,0.88);` +
    `font-family:${theme.fonts.body},system-ui,sans-serif;font-weight:600;font-size:${SUBTITULO_SIZE}px;line-height:1.2;color:#FFFFFF;` +
    `text-align:center;text-wrap:balance;letter-spacing:-0.005em;`;
  const trozos = voz ? tiemposTrozos(trozosSubtitulo(narracion), voz.start, voz.segundos) : [{ texto: narracion.replace(/\s+/g, " ").trim(), at: NaN, hasta: NaN }];
  // Los trozos van apilados en el mismo sitio (abajo, anclados al borde inferior): solo uno se ve a la vez.
  const spans = trozos
    .map((t) => {
      const tiempos = Number.isFinite(t.at) ? ` data-sub-at="${t.at}" data-sub-hasta="${t.hasta}"` : "";
      return `<span data-sub-trozo=""${tiempos} style="${estilo}bottom:0;">${escapeHtml(t.texto)}</span>`;
    })
    .join("");
  return `<div data-subtitulo="" style="position:absolute;left:0;right:0;bottom:${bottom}px;height:${Math.round(SUBTITULO_SIZE * 1.2 * 2)}px;pointer-events:none;">${spans}</div>`;
}

/** Lee un archivo de gsap/dist como texto para inyectarlo inline (render offline). */
async function gsapScript(file: string): Promise<string> {
  const dist = dirname(require.resolve("gsap/dist/gsap.min.js"));
  return readFile(join(dist, file), "utf8");
}

/**
 * Arma la página única del reel: todas las escenas apiladas (una por slide, en
 * formato reel), la barra de progreso, GSAP + SplitText inline, los tiempos y
 * el runtime que expone `window.__reel`. Los fondos `ai` deben venir ya resueltos.
 */
export async function buildReelPage(spec: CarouselSpec, timing: ReelTiming, opts: { voces?: (VozEscena | undefined)[] } = {}): Promise<string> {
  const { width, height } = FORMATS.reel;
  const scenes = spec.slides
    .map((slide, i) => {
      const props = { ...spec.defaults, ...slide.props, format: "reel" as const };
      const markup = renderToStaticMarkup(createElement(slide.template, props));
      return `<div data-scene="${i}" data-plantilla="${slide.template.name}" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden;">${markup}${subtitulo(props.narracion, props.source, opts.voces?.[i])}</div>`;
    })
    .join("");
  const [gsap, split, runtime] = await Promise.all([
    gsapScript("gsap.min.js"),
    gsapScript("SplitText.min.js"),
    readFile(join(HERE, "runtime.js"), "utf8"),
  ]);
  // Barra de progreso de marca: 8 px en el borde superior, en tinta (look papel), crece de 0 a 100% durante todo el reel (runtime).
  const progress = `<div data-reel-progress style="position:absolute;left:0;top:0;width:${width}px;height:8px;background:${theme.colors.ink};transform-origin:left center;transform:scaleX(0);z-index:10;"></div>`;
  const body =
    `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#000;">${scenes}${progress}</div>` +
    `<script>${gsap}</script><script>${split}</script>` +
    `<script>window.__REEL_TIMING__ = ${JSON.stringify(timing)};</script>` +
    `<script>${runtime}</script>`;
  return htmlShell(body);
}
