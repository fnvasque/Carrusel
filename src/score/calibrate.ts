import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pearson, refreshCalibration, projectOutcome, type Metric } from "./calibration.ts";
import { THRESHOLD } from "./virality.ts";

/**
 * Cierra el bucle: compara el score de viralidad PREDICHO con las métricas
 * REALES registradas (`npm run record`), persiste el modelo de calibración y
 * muestra la proyección saves/shares para scores de referencia. Cuantos más
 * carruseles registres, más fiable.
 *
 * Uso: npm run calibrate
 */
const METRICS_DIR = join(process.cwd(), "metrics");

async function main() {
  let files: string[];
  try {
    files = (await readdir(METRICS_DIR)).filter((f) => f.endsWith(".json") && f !== "calibration.json");
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

  // Cierra el bucle: persiste el modelo y proyecta scores de referencia.
  const model = await refreshCalibration();
  if (model) {
    console.log(`\nModelo de calibración actualizado (n=${model.n}) → metrics/calibration.json`);
    console.log("Proyección según tus datos:");
    for (const s of [THRESHOLD, 90]) {
      const p = projectOutcome(model, s);
      console.log(`  score ${s} ≈ ${p.savesPerK} saves/1k · ${p.sharesPerK} shares/1k`);
    }
  } else {
    console.log("\n(Registra ≥3 carruseles para activar la proyección en cada score.)");
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
