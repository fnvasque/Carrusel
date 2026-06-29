import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Capa de calibración: aprende un mapeo del score de viralidad PREDICHO a las
 * tasas REALES (saves/1k, shares/1k) registradas con `npm run record`, lo
 * persiste en metrics/calibration.json y lo proyecta sobre cualquier score nuevo.
 * Cierra el bucle predicho↔real SIN auto-tunear los pesos de scoreCarousel.
 */

const METRICS_DIR = join(process.cwd(), "metrics");
const CALIBRATION_FILE = "calibration.json";

/** Métrica registrada de un carrusel publicado (forma que escribe record.ts). */
export interface Metric {
  name: string;
  predictedScore: number;
  saves: number;
  shares: number;
  reach: number;
  savesPerK: number;
  sharesPerK: number;
}

/** Recta y = slope·x + intercept. */
export interface LinearFit {
  slope: number;
  intercept: number;
}

/** Modelo aprendido predicho→real. */
export interface CalibrationModel {
  n: number;
  rSaves: number | null;
  rShares: number | null;
  saves: LinearFit;
  shares: LinearFit;
  updatedAt: string;
}

/** Correlación de Pearson; null si <3 puntos o varianza nula. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : +(num / den).toFixed(2);
}

/** Regresión lineal por mínimos cuadrados; null si <2 puntos o varianza X nula. */
export function linearFit(xs: number[], ys: number[]): LinearFit | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

/** Construye el modelo desde las métricas (n≥3); null si insuficiente o degenerado. */
export function buildCalibration(metrics: Metric[], updatedAt: string): CalibrationModel | null {
  if (metrics.length < 3) return null;
  const xs = metrics.map((m) => m.predictedScore);
  const savesY = metrics.map((m) => m.savesPerK);
  const sharesY = metrics.map((m) => m.sharesPerK);
  const saves = linearFit(xs, savesY);
  const shares = linearFit(xs, sharesY);
  if (!saves || !shares) return null;
  return {
    n: metrics.length,
    rSaves: pearson(xs, savesY),
    rShares: pearson(xs, sharesY),
    saves,
    shares,
    updatedAt,
  };
}

/**
 * Lee todas las métricas (metrics/*.json salvo calibration.json), reconstruye el
 * modelo y lo persiste en metrics/calibration.json. Devuelve el modelo o null.
 * Tolerante a errores de IO/parse.
 */
export async function refreshCalibration(metricsDir: string = METRICS_DIR): Promise<CalibrationModel | null> {
  let files: string[];
  try {
    files = (await readdir(metricsDir)).filter((f) => f.endsWith(".json") && f !== CALIBRATION_FILE);
  } catch {
    return null;
  }
  const metrics: Metric[] = [];
  for (const f of files) {
    try {
      const m = JSON.parse(await readFile(join(metricsDir, f), "utf8")) as Metric;
      if (typeof m.predictedScore === "number" && typeof m.savesPerK === "number" && typeof m.sharesPerK === "number") {
        metrics.push(m);
      }
    } catch {
      // archivo corrupto: ignorar.
    }
  }
  const model = buildCalibration(metrics, new Date().toISOString());
  if (model) {
    try {
      await mkdir(metricsDir, { recursive: true });
      await writeFile(join(metricsDir, CALIBRATION_FILE), JSON.stringify(model, null, 2) + "\n");
    } catch {
      // si no se puede escribir, igual devolvemos el modelo en memoria.
    }
  }
  return model;
}

/** Carga el modelo persistido (sync, tolerante); null si no existe o falla. */
export function loadCalibration(metricsDir: string = METRICS_DIR): CalibrationModel | null {
  const path = join(metricsDir, CALIBRATION_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CalibrationModel;
  } catch {
    return null;
  }
}

/** Proyecta las tasas reales esperadas para un score dado (clamp ≥0, 1 decimal). */
export function projectOutcome(model: CalibrationModel, score: number): { savesPerK: number; sharesPerK: number } {
  const apply = (f: LinearFit) => +Math.max(0, f.slope * score + f.intercept).toFixed(1);
  return { savesPerK: apply(model.saves), sharesPerK: apply(model.shares) };
}
