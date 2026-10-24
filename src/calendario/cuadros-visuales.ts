import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { DEFAULT_PACE, PACES } from "../reel/timing.ts";
import type { Borrador } from "./draft.ts";

/** Un cuadro que la revisión visual con modelo de visión debe mirar. */
export interface Cuadro {
  /** Posición 1..k, estable (orden cronológico dentro de la pieza). */
  n: number;
  /** Texto legible: `portada`, `slide 3`, `escena 2 (Clip) a 1 s`, `escena 4 (Step) final`. */
  que: string;
  /** Segundo del reel donde se saca (solo cuadros de `reel.mp4`). */
  t?: number;
  /** Índice (desde 0) de la slide o escena a la que pertenece el cuadro; la portada es la 0. */
  slide: number;
  /** Archivo dentro de la carpeta final de la pieza. */
  archivo: string;
}

/** Ritmo del borrador → transición (s) entre escenas. */
export function transicionDe(b: Borrador): number {
  return PACES[b.pace ?? DEFAULT_PACE].transition;
}

/** ¿El fondo es una foto o un video (ai / image)? Color y gradiente no se revisan. */
function fondoVisual(bg: unknown): boolean {
  if (!bg || typeof bg !== "object") return false;
  const o = bg as Record<string, unknown>;
  return typeof o.ai === "string" || typeof o.image === "string";
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Prioridad al recortar: menor = se conserva primero. */
const PRIORIDAD = { portada: 0, final: 1, cero: 2, uno: 3 } as const;

/**
 * Qué mirar (puro).
 * - Carrusel: portada (01.jpg) + cada slide cuyo borrador tiene background ai o image
 *   (el slide 1 ya es la portada: no se duplica).
 * - Reel: portada (cover.jpg) + por cada escena con background ai/image o template Clip,
 *   cuadros en start+0, start+1 y el final (start+dur−transición−0,05; la última, fin−0,05).
 *   Sin `escenas` (manifiesto antiguo) solo la portada.
 * - Al recortar a `max` se conservan, en este orden: portada, finales, 0 s, 1 s
 *   (a igual prioridad, las escenas más tempranas); el resultado va en orden cronológico.
 * `quitados`: índices de slide cuyo fondo ai el render descartó (`fondosIaQuitados`); esos
 * slides se vieron con el fondo por defecto, así que no cuentan como fondo visual.
 */
export function cuadrosARevisar(
  formato: "reel" | "carrusel",
  b: Borrador,
  escenas: { start: number; dur: number }[] | undefined,
  transicion: number,
  max: number,
  quitados: number[] = [],
): Cuadro[] {
  type Candidato = Omit<Cuadro, "n"> & { prio: number };
  const cand: Candidato[] = [{ que: "portada", slide: 0, archivo: formato === "reel" ? "cover.jpg" : "01.jpg", prio: PRIORIDAD.portada }];
  const sin = new Set(quitados);
  const interesa = (i: number): boolean => {
    const s = b.slides[i];
    return !sin.has(i) && fondoVisual(s.background);
  };

  if (formato === "carrusel") {
    b.slides.forEach((_, i) => {
      if (i === 0 || !interesa(i)) return;
      cand.push({ que: `slide ${i + 1}`, slide: i, archivo: `${String(i + 1).padStart(2, "0")}.jpg`, prio: PRIORIDAD.final });
    });
  } else if (escenas) {
    const ultima = escenas.length - 1;
    const totalAprox = escenas.length ? escenas[ultima].start + escenas[ultima].dur : 0;
    b.slides.forEach((s, i) => {
      const e = escenas[i];
      if (!e || !(s.template === "Clip" || interesa(i))) return;
      const nombre = `escena ${i + 1} (${s.template})`;
      const fin = i === ultima ? e.start + e.dur - 0.05 : e.start + e.dur - transicion - 0.05;
      // Cada t se acota a la escena: [inicio, min(fin de escena − 0,05, fin del reel − 0,05)].
      const tope = Math.min(e.start + e.dur - 0.05, totalAprox - 0.05);
      const acotar = (t: number): number => r3(Math.max(e.start, Math.min(t, tope)));
      // En orden de prioridad (finales, 0 s, 1 s): ante t repetido (±0,01 s) se queda el de mayor prioridad.
      const posibles: Candidato[] = [
        { que: `${nombre} final`, slide: i, t: acotar(fin), archivo: "reel.mp4", prio: PRIORIDAD.final },
        // La portada (cover.jpg) ya es el cuadro 0 s de la escena 1: no se repite.
        ...(i === 0 && e.start === 0 ? [] : [{ que: `${nombre} a 0 s`, slide: i, t: acotar(e.start), archivo: "reel.mp4", prio: PRIORIDAD.cero }]),
        { que: `${nombre} a 1 s`, slide: i, t: acotar(e.start + 1), archivo: "reel.mp4", prio: PRIORIDAD.uno },
      ];
      const vistos = new Set<number>();
      const unicos = posibles.filter((c) => {
        const k = Math.round((c.t as number) * 100);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
      // Orden cronológico dentro de la escena (0 s, 1 s, final).
      cand.push(...unicos.sort((x, y) => (x.t as number) - (y.t as number) || x.prio - y.prio));
    });
  }

  // Recorte por prioridad (estable: el orden de aparición desempata) y vuelta al orden cronológico.
  const orden = cand.map((c, idx) => ({ c, idx }));
  const elegidos = [...orden].sort((a, z) => a.c.prio - z.c.prio || a.idx - z.idx).slice(0, Math.max(1, max));
  elegidos.sort((a, z) => a.idx - z.idx);
  return elegidos.map(({ c }, k) => {
    const { prio: _p, ...resto } = c;
    return { n: k + 1, ...resto };
  });
}

/**
 * Extrae los cuadros a `<destino>/<n>.jpg` (ffmpeg, 540 px de ancho, JPEG). `destino` debe estar
 * FUERA de la carpeta final (`<outRoot>/.revision/<semana>/<id>/`): el rsync sube la final entera.
 * Devuelve las rutas. Un fallo de ffmpeg lanza un Error en español.
 */
export async function extraerCuadros(final: string, destino: string, cuadros: Cuadro[]): Promise<{ n: number; ruta: string; que: string }[]> {
  const rel = relative(final, destino);
  if (!rel.startsWith("..") || isAbsolute(rel)) throw new Error(`El destino de los cuadros (${destino}) debe estar fuera de la carpeta final (${final}): se subiría al servidor.`);
  // `destino` se borra entero: nunca puede ser la carpeta final ni contenerla.
  const inv = relative(destino, final);
  if (!inv.startsWith("..") && !isAbsolute(inv)) throw new Error(`El destino de los cuadros (${destino}) no puede contener la carpeta final (${final}): se borraría.`);
  // Sin restos de una corrida anterior.
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });
  const out: { n: number; ruta: string; que: string }[] = [];
  for (const c of cuadros) {
    const ruta = join(destino, `${c.n}.jpg`);
    const args = ["-y", "-v", "error", ...(c.t !== undefined ? ["-ss", String(c.t)] : []), "-i", join(final, c.archivo), "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", ruta];
    const r = spawnSync("ffmpeg", args, { timeout: 20_000 });
    // ffmpeg sale 0 sin escribir nada si el segundo cae más allá del final del video.
    if (r.error || r.status !== 0 || !existsSync(ruta) || statSync(ruta).size === 0) {
      throw new Error(`No pude extraer el cuadro «${c.que}» de ${c.archivo}: ${r.error?.message ?? (String(r.stderr).trim() || "no se generó el archivo")}`);
    }
    out.push({ n: c.n, ruta, que: c.que });
  }
  return out;
}
