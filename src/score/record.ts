import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CarouselSpec } from "../templates/types.ts";
import { scoreCarousel } from "./virality.ts";
import { refreshCalibration } from "./calibration.ts";

/**
 * Registra las métricas REALES de Instagram de un carrusel publicado, junto al
 * score predicho, para cerrar el bucle de aprendizaje (calibrar con `npm run calibrate`).
 *
 * Uso:
 *   npm run record carousels/estudiar-3-ias.ts -- --saves=120 --shares=40 --reach=5000
 */
const METRICS_DIR = join(process.cwd(), "metrics");

function flag(name: string): number | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run record <carrusel.ts> -- --saves=N --shares=N --reach=N [--likes=N]");
    process.exit(1);
  }
  const saves = flag("saves");
  const shares = flag("shares");
  const reach = flag("reach");
  if (saves === undefined || shares === undefined || reach === undefined || reach === 0) {
    console.error("Faltan métricas: --saves, --shares y --reach (>0) son obligatorias.");
    process.exit(1);
  }

  const mod = await import(pathToFileURL(resolve(file)).href);
  const spec: CarouselSpec = mod.default;
  const predicted = scoreCarousel(spec).total;

  const record = {
    name: spec.name,
    predictedScore: predicted,
    recordedAt: new Date().toISOString(),
    saves,
    shares,
    reach,
    likes: flag("likes") ?? null,
    // Tasas por cada 1.000 de alcance: lo que de verdad importa.
    savesPerK: +((saves / reach) * 1000).toFixed(1),
    sharesPerK: +((shares / reach) * 1000).toFixed(1),
  };

  await mkdir(METRICS_DIR, { recursive: true });
  const out = join(METRICS_DIR, `${spec.name}.json`);
  await writeFile(out, JSON.stringify(record, null, 2) + "\n");
  console.log(`✓ Registrado ${spec.name}: score predicho ${predicted}, ${record.savesPerK} saves/1k, ${record.sharesPerK} shares/1k`);
  console.log(`  → ${out}`);

  // Cierra el bucle: refresca el modelo de calibración con el nuevo dato.
  const model = await refreshCalibration();
  if (model) {
    console.log(`  ✓ Calibración actualizada (n=${model.n}); el reporte de score ahora proyecta saves/shares reales.`);
  } else {
    console.log("  Registra ≥3 carruseles para activar la proyección. Corre `npm run calibrate` para el detalle.");
  }
}

main().catch((err) => {
  console.error("\n✗ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
