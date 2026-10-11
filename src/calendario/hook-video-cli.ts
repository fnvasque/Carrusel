import { join, resolve } from "node:path";
import { pullKb } from "../kb/store.ts";
import { aplicarHook, mezclarReal, pendientesHook, type PendienteHook } from "./hook-video.ts";
import { parseBorrador } from "./draft.ts";
import { leerSemana, listarSemanas, ocultarToken, type SemanaLeida } from "./plan.ts";
import { qaHookVideo } from "./qa.ts";
import { clonKbCalendario, dirMediosValido, leerBorradorSeguro, rsyncReal, tomarCandado, verificarReal, type EnvRender } from "./render.ts";
import { avisarTelegram } from "./telegram-directo.ts";

/**
 * `npm run calendario:hook-video -- pendientes` — JSON con los reels que esperan su clip
 *   de Kling (prompt completo y parámetros de `generate_video`). Lo lee la tarea local
 *   de Claude que genera los clips con el MCP de Higgsfield.
 * `npm run calendario:hook-video -- aplicar <semana> <id> <clip.mp4>` — mezcla el clip
 *   detrás del hook, QA, reemplaza `reel.mp4`, lo sube y verifica la URL pública.
 *
 * Mismas variables (`.env`) y clon de la base que `calendario:render`; toma su candado
 * para no cruzarse con una corrida del render. Nunca imprime MEDIA_PUBLIC_TOKEN.
 */

try {
  process.loadEnvFile?.();
} catch {
  // Sin .env: se usan las variables del entorno.
}

const [accion, ...args] = process.argv.slice(2);
if (accion !== "pendientes" && !(accion === "aplicar" && args.length === 3)) {
  console.error("Uso: calendario:hook-video -- pendientes | aplicar <semana> <id> <clip.mp4>");
  process.exit(2);
}

const faltan = ["SERVER_HOST", "SERVER_MEDIA_DIR", "MEDIA_PUBLIC_BASE", "MEDIA_PUBLIC_TOKEN"].filter((k) => !process.env[k]?.trim());
if (faltan.length) {
  console.error(`✗ Faltan variables en .env: ${faltan.join(", ")}.`);
  process.exit(1);
}
if (!dirMediosValido(process.env.SERVER_MEDIA_DIR!.trim())) {
  console.error("✗ SERVER_MEDIA_DIR inválido (ver calendario:render).");
  process.exit(1);
}
const token = process.env.MEDIA_PUBLIC_TOKEN!.trim();
const env: EnvRender = {
  base: process.env.MEDIA_PUBLIC_BASE!.trim(),
  token,
  host: process.env.CALENDARIO_RSYNC_LOCAL === "1" ? "" : process.env.SERVER_HOST!.trim(),
  dir: process.env.SERVER_MEDIA_DIR!.trim(),
};
const outRoot = join(process.cwd(), "output", "calendario");

async function pendientes(): Promise<PendienteHook[]> {
  const semanas: SemanaLeida[] = [];
  for (const s of await listarSemanas()) {
    try {
      const l = await leerSemana(s);
      if (l) semanas.push(l);
    } catch {
      // plan inválido: el render ya avisa
    }
  }
  return pendientesHook(semanas, new Date(), outRoot, async (semana, pieza) => parseBorrador(await leerBorradorSeguro(semana, pieza.borrador)).hookVideo);
}

// El candado del render: ni git ni el reel se tocan mientras corre una render.
const soltar = await tomarCandado(join(outRoot, ".lock"));
if (!soltar) {
  console.error("✗ El render del calendario está corriendo; reintenta en unos minutos.");
  process.exit(75);
}
let codigo = 0;
try {
  const clon = await clonKbCalendario();
  if ("error" in clon) throw new Error(clon.error);
  process.env.KB_DIR = clon.dir;
  const pull = await pullKb();
  if (pull.error) console.warn(`⚠️  No pude traer la base (${pull.error}); sigo con la copia local.`);
  if (accion === "pendientes") {
    console.log(JSON.stringify(await pendientes(), null, 2));
  } else {
    await aplicar();
  }
} catch (e) {
  console.error(`✗ ${ocultarToken(e instanceof Error ? e.message : String(e), token)}`);
  codigo = 1;
} finally {
  await soltar();
}
process.exit(codigo);

async function aplicar(): Promise<void> {
  const [semana, id, clipArg] = args;
  // Error de uso (pieza que no espera clip): solo a la terminal, sin aviso por Telegram.
  const p = (await pendientes()).find((x) => x.semana === semana && x.id === id);
  if (!p) throw new Error(`${semana}/${id} no está pendiente de hook (sin hookVideo, sin render, ya aplicado o muy cerca de su hora).`);
  try {
    await aplicarHook(p, resolve(clipArg), outRoot, env, { mezclar: mezclarReal, qa: qaHookVideo, rsync: rsyncReal, verificar: verificarReal });
    console.log(`✓ Hook de video aplicado a ${semana}/${id} y subido al servidor.`);
    await avisarTelegram(`🎬 Hook de video (Kling) aplicado a ${id}.`);
  } catch (e) {
    const m = ocultarToken(e instanceof Error ? e.message : String(e), token);
    await avisarTelegram(`⚠️ Hook de video de ${id}: ${m} Si no se reintenta, el reel se publica sin clip.`);
    throw e;
  }
}
