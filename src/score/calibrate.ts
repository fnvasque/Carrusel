import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Cierra el bucle: compara el score de viralidad PREDICHO con las métricas
 * REALES registradas (`npm run record`), para ver si el indicador predice bien
 * y calibrarlo con el tiempo. Cuantos más carruseles registres, más fiable.
 *
 * Uso: npm run calibrate
 */
const METRICS_DIR = join(process.cwd(), "metrics");

interface Metric {
  name: string;
  predictedScore: number;
  saves: number;
  shares: number;
  reach: number;
  savesPerK: number;
  sharesPerK: number;
}

/** Correlación de Pearson; null si no hay datos suficientes. */
function pearson(xs: number[], ys: number[]): number | null {
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

async function main() {
  let files: string[];
  try {
    files = (await readdir(METRICS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.log("Sin métricas registradas todavía. Publica un carrusel y corre `npm run record`.");
    return;
  }

  const metrics: Metric[] = [];
  for (const f of files) {
    metrics.push(JSON.parse(await readFile(join(METRICS_DIR, f), "utf8")));
  }
  metrics.sort((a, b) => b.predictedScore - a.predictedScore);

  console.log("\nPredicho vs real (ordenado por score predicho):\n");
  console.log("  carrusel".padEnd(26) + "predicho   saves/1k   shares/1k");
  for (const m of metrics) {
    console.log(
      "  " + m.name.padEnd(24) +
      String(m.predictedScore).padStart(5) + "    " +
      String(m.savesPerK).padStart(7) + "    " +
      String(m.sharesPerK).padStart(7),
    );
  }

  const scores = metrics.map((m) => m.predictedScore);
  const rSaves = pearson(scores, metrics.map((m) => m.savesPerK));
  const rShares = pearson(scores, metrics.map((m) => m.sharesPerK));
  console.log("\nCorrelación score↔real (1 = predice perfecto, 0 = nada, <0 = inverso):");
  console.log(`  saves:  ${rSaves ?? "necesitas ≥3 carruseles registrados"}`);
  console.log(`  shares: ${rShares ?? "necesitas ≥3 carruseles registrados"}`);
  if (rSaves !== null && rSaves < 0.3) {
    console.log("\n  ⚠️  El score predice mal los saves. Revisa los pesos en src/score/virality.ts con los datos reales.");
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
