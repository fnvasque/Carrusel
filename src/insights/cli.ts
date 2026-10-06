import { fechaValida } from "../calendario/time.ts";
import { MetaConfigError, metaConfig } from "../meta/env.ts";
import { guardarCuenta, tomarInstantaneas } from "./snapshots.ts";
import { resumenDeLaSemana, resumenReciente, textoPost } from "./lectura.ts";
import { formatResumen, hastaDesdeDesde } from "./summary.ts";

/**
 * Espejo de `/metricas` en la terminal:
 *   npm run insights                          (últimos 7 días, hasta hoy)
 *   npm run insights -- --desde=2026-09-28    (la semana que empieza ese día)
 *   npm run insights -- --post=<id|url|piezaId>
 *   npm run insights -- --ahora               (toma instantáneas y cuenta en el acto; útil para probar)
 */

try {
  process.loadEnvFile?.();
} catch {
  // sin .env: se usan las variables del entorno.
}

const arg = (nombre: string): string | undefined => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const flag = (nombre: string): boolean => process.argv.includes(`--${nombre}`);
const sinHtml = (s: string): string => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function main(): Promise<void> {
  metaConfig(); // lanza MetaConfigError si falta META_*.
  const now = new Date();

  if (flag("ahora")) {
    const nuevas = await tomarInstantaneas(now);
    console.log(`Instantáneas nuevas: ${nuevas.length}${nuevas.length ? ` (${nuevas.map((i) => `${i.mediaId} ${i.ventana}`).join(", ")})` : ""}`);
    await guardarCuenta(now);
    console.log("Cuenta guardada en _metricas/cuenta.json");
  }

  const post = arg("post");
  if (post !== undefined) {
    console.log(sinHtml(await textoPost(post, now)));
    return;
  }

  const desde = arg("desde");
  if (desde !== undefined && !fechaValida(desde)) throw new Error(`--desde debe ser AAAA-MM-DD (recibí "${desde}").`);
  const r = desde ? resumenDeLaSemana(hastaDesdeDesde(desde)) : resumenReciente(now);
  console.log(formatResumen(r));
}

try {
  await main();
} catch (err) {
  console.error(err instanceof MetaConfigError ? err.message : `⚠️  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
