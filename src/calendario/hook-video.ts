import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, link, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { estadoEfectivo, urlPublica, type Pieza, type SemanaLeida } from "./plan.ts";
import type { QaResultado } from "./qa.ts";
import { destinoRemoto, type EnvRender } from "./render.ts";
import { zonedToUtc } from "./time.ts";

/**
 * Hook con video IA (Kling 3.0 vía Higgsfield). El planificador marca a lo más
 * `hookVideoMaxSemana` reels con `hookVideo: { prompt, segundos? }` en el borrador; el
 * Mac los renderiza normal y después una tarea local de Claude (con el MCP de
 * Higgsfield, que usa los créditos de la suscripción) genera el clip y llama a
 * `npm run calendario:hook-video -- aplicar`: el clip se mezcla DETRÁS del título del
 * hook (`scripts/reel-hook-video.sh`), pasa QA, reemplaza `reel.mp4` y se sube al
 * servidor antes de la hora. La duración no cambia, así que `render.json` sigue valiendo.
 * Idempotente: siempre mezcla sobre el original respaldado (`RESPALDO`) y marca la pieza
 * con `HECHO` solo cuando el servidor ya sirve el reel nuevo.
 */

export interface HookVideo {
  /** Prompt de Kling (en inglés): una toma continua, personas chilenas si hay personas. */
  prompt: string;
  /** Segundos del clip sobre el reel (3–6; por defecto 5). */
  segundos?: number;
}

export const HOOK_SEGUNDOS_MIN = 3;
export const HOOK_SEGUNDOS_MAX = 6;
export const HOOK_SEGUNDOS_DEFECTO = 5;
const PROMPT_MIN = 40;
const PROMPT_MAX = 800;

/** Lo que se agrega siempre al prompt al generar: encuadre y nada de texto (lo pone el reel). */
export const SUFIJO_PROMPT =
  " Vertical 9:16 framing; main action in the lower half of the frame, upper half dark and out of focus. Low-key lighting, deep shadows. No text, no letters, no logos, no subtitles.";

/** Parámetros de Kling 3.0 para el clip (sin sonido: el reel ya trae su pista). */
export const KLING = { model: "kling3_0", aspect_ratio: "9:16", mode: "pro", sound: "off" } as const;

/** Faltando menos que esto para publicar, no se toca el reel (el bot pudo tomarlo ya). */
export const MARGEN_MS = 45 * 60_000;

/** Marca de pieza terminada (en la carpeta de salida; no se sube). */
export const HECHO = ".hook-video.json";
/** Reel original, sin hook (en la carpeta de salida; no se sube). */
export const RESPALDO = ".reel-sin-hook.mp4";

/** Forma de `hookVideo` en el borrador; devuelve el motivo del rechazo o undefined. */
export function hookVideoError(v: unknown): string | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "hookVideo debe ser un objeto { prompt, segundos? }";
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== "prompt" && k !== "segundos") return `hookVideo: campo desconocido ${JSON.stringify(k)}`;
  if (typeof o.prompt !== "string" || o.prompt.trim().length < PROMPT_MIN || o.prompt.length > PROMPT_MAX) {
    return `hookVideo.prompt debe ser un texto de ${PROMPT_MIN} a ${PROMPT_MAX} caracteres`;
  }
  if (o.segundos !== undefined && (!Number.isInteger(o.segundos) || (o.segundos as number) < HOOK_SEGUNDOS_MIN || (o.segundos as number) > HOOK_SEGUNDOS_MAX)) {
    return `hookVideo.segundos debe ser un entero entre ${HOOK_SEGUNDOS_MIN} y ${HOOK_SEGUNDOS_MAX}`;
  }
  return undefined;
}

export interface PendienteHook {
  semana: string;
  id: string;
  dia: string;
  hora: string;
  /** Prompt completo para Kling (el del planificador + `SUFIJO_PROMPT`). */
  prompt: string;
  segundos: number;
  /** Parámetros de `generate_video` para el MCP de Higgsfield. */
  kling: typeof KLING & { duration: number };
}

/** Carpeta final de una pieza (la misma del render). */
export const carpetaPieza = (outRoot: string, semana: string, id: string): string => join(outRoot, semana, id);

/**
 * Reels que esperan su clip: el borrador trae `hookVideo`, el render terminó bien
 * (`renderizado` o ya `programado` por el bot), falta más de `MARGEN_MS` para
 * publicar, existe `reel.mp4` y aún no tiene la marca `HECHO`. Ordenados por hora.
 * `leerHook` lee el borrador (lanza o devuelve undefined si no hay hook).
 */
export async function pendientesHook(
  semanas: SemanaLeida[],
  ahora: Date,
  outRoot: string,
  leerHook: (semana: string, pieza: Pieza) => Promise<HookVideo | undefined>,
): Promise<PendienteHook[]> {
  const out: { p: PendienteHook; t: number }[] = [];
  for (const s of semanas) {
    for (const pieza of s.plan.piezas) {
      if (pieza.formato !== "reel" || s.render[pieza.id]?.estado !== "renderizado") continue;
      const estado = estadoEfectivo(pieza, s.render[pieza.id], s.estado[pieza.id]);
      if (estado !== "renderizado" && estado !== "programado") continue;
      let t: number;
      try {
        t = zonedToUtc(pieza.dia, pieza.hora).getTime();
      } catch {
        continue;
      }
      if (t - ahora.getTime() <= MARGEN_MS) continue;
      const final = carpetaPieza(outRoot, s.semana, pieza.id);
      if (!existsSync(join(final, "reel.mp4")) || existsSync(join(final, HECHO))) continue;
      let hook: HookVideo | undefined;
      try {
        hook = await leerHook(s.semana, pieza);
      } catch {
        continue; // borrador ilegible: el render ya lo habría marcado fallido
      }
      if (!hook || hookVideoError(hook)) continue;
      const segundos = hook.segundos ?? HOOK_SEGUNDOS_DEFECTO;
      out.push({
        t,
        p: {
          semana: s.semana,
          id: pieza.id,
          dia: pieza.dia,
          hora: pieza.hora,
          prompt: hook.prompt.trim() + SUFIJO_PROMPT,
          segundos,
          kling: { ...KLING, duration: segundos },
        },
      });
    }
  }
  return out.sort((a, b) => a.t - b.t).map((x) => x.p);
}

export interface DepsAplicar {
  /** Mezcla `clip` detrás del hook de `reel` en `salida`. Lanza si falla. */
  mezclar: (reel: string, clip: string, salida: string, segundos: number) => Promise<void>;
  /** QA del reel mezclado frente al original. */
  qa: (mp4: string, original: string) => Promise<QaResultado>;
  /** Sube `local/` a `remoto` (como en el render). */
  rsync: (local: string, remoto: string) => Promise<void>;
  /** ¿El servidor sirve `url` con 200 y el Content-Type `tipo`? */
  verificar: (url: string, tipo: string) => Promise<boolean>;
  ahora?: () => Date;
}

/**
 * Aplica el clip a una pieza pendiente: mezcla sobre el original (respaldado la
 * primera vez), QA, reemplazo de `reel.mp4`, subida de ese solo archivo y HEAD a su
 * URL pública. Escribe `HECHO` al final. Lanza con el motivo si algo falla; si la
 * subida falla, el reel local ya tiene el hook pero la pieza sigue pendiente y el
 * reintento vuelve a mezclar desde el respaldo.
 */
export async function aplicarHook(p: PendienteHook, clip: string, outRoot: string, env: EnvRender, deps: DepsAplicar): Promise<void> {
  if (!existsSync(clip)) throw new Error(`No existe el clip ${clip}.`);
  const ahora = deps.ahora?.() ?? new Date();
  if (zonedToUtc(p.dia, p.hora).getTime() - ahora.getTime() <= MARGEN_MS) {
    throw new Error(`Falta menos de ${MARGEN_MS / 60_000} min para publicar ${p.id}: no se toca el reel.`);
  }
  const final = carpetaPieza(outRoot, p.semana, p.id);
  const reel = join(final, "reel.mp4");
  const respaldo = join(final, RESPALDO);
  if (!existsSync(respaldo)) await copyFile(reel, respaldo);

  const mezcla = join(final, ".tmp-hook.mp4");
  await rm(mezcla, { force: true });
  await deps.mezclar(respaldo, clip, mezcla, p.segundos);
  const qa = await deps.qa(mezcla, respaldo);
  if (!qa.ok) {
    await rm(mezcla, { force: true });
    throw new Error(`QA del reel con hook: ${qa.motivos.join(" ")}`);
  }
  await rename(mezcla, reel);

  // Solo reel.mp4: la carpeta de subida no lleva respaldo ni marcas.
  const subida = await mkdtemp(join(final, ".subida-"));
  try {
    await link(reel, join(subida, "reel.mp4"));
    await deps.rsync(subida, destinoRemoto(env, p.semana, p.id));
  } finally {
    await rm(subida, { recursive: true, force: true });
  }
  if (!(await deps.verificar(urlPublica(env.base, env.token, p.semana, p.id, "reel.mp4"), "video/mp4"))) {
    throw new Error(`El servidor no sirve el reel nuevo de ${p.id} (HEAD sin 200 video/mp4).`);
  }
  await writeFile(join(final, HECHO), JSON.stringify({ prompt: p.prompt, segundos: p.segundos, en: ahora.toISOString() }, null, 2));
}

/** Script de mezcla del repo (`scripts/reel-hook-video.sh`). */
const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "reel-hook-video.sh");

/** Mezcla real con ffmpeg (vía el script, que también se usa a mano). */
export function mezclarReal(reel: string, clip: string, salida: string, segundos: number): Promise<void> {
  return new Promise((resolveP, reject) => {
    const proc = spawn(SCRIPT, [reel, clip, salida, String(segundos)], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => reject(new Error(`no se pudo ejecutar ${SCRIPT}: ${e.message}`)));
    proc.on("close", (code) => (code === 0 ? resolveP() : reject(new Error(`la mezcla terminó con código ${code}: ${err.trim().split("\n").slice(-2).join(" ")}`))));
  });
}
