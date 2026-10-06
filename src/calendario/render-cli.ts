import { join } from "node:path";
import { abortStaleRebase, pullKb, setSyncErrorHandler } from "../kb/store.ts";
import { leerSemana, listarSemanas, ocultarToken, type SemanaLeida } from "./plan.ts";
import {
  crearEscritorRender, destinoRemoto, dirMediosValido, leerPuerta, pendientes, procesar, renderPieza, rsyncReal, sincronizarPendiente, tomarCandado,
  verificarReal,
  type EnvRender,
} from "./render.ts";
import { avisarTelegram } from "./telegram-directo.ts";

/**
 * `npm run calendario:render [-- --dry-run]` — lo lanza launchd cada hora en el Mac
 * (`deploy/launchd/es.ia.calendario-render.plist`). Idempotente y silencioso cuando
 * no hay nada que hacer. No arranca ningún bot (el único bot vive en el servidor).
 *
 * Variables (`.env`): SERVER_HOST, SERVER_MEDIA_DIR, MEDIA_PUBLIC_BASE,
 * MEDIA_PUBLIC_TOKEN (obligatorias); TELEGRAM_BOT_TOKEN y TELEGRAM_ALLOWED_CHAT_IDS
 * (avisos); KB_DIR (default ./knowledge); CALENDARIO_AUDIO_DIR (default promo/audio);
 * CALENDARIO_RSYNC_LOCAL=1 copia a SERVER_MEDIA_DIR en este disco (pruebas sin ssh).
 */

try {
  process.loadEnvFile?.();
} catch {
  // Sin .env: se usan las variables del entorno.
}

const dryRun = process.argv.includes("--dry-run");
const OBLIGATORIAS = ["SERVER_HOST", "SERVER_MEDIA_DIR", "MEDIA_PUBLIC_BASE", "MEDIA_PUBLIC_TOKEN"] as const;
const faltan = OBLIGATORIAS.filter((k) => !process.env[k]?.trim());
if (faltan.length) {
  console.error(`✗ Faltan variables en .env: ${faltan.join(", ")}. Ver .env.example (sección "Render del calendario en el Mac").`);
  process.exit(1);
}

if (!dirMediosValido(process.env.SERVER_MEDIA_DIR!.trim())) {
  console.error(
    "✗ SERVER_MEDIA_DIR inválido: usa solo letras, números y _ . / - (sin espacios, ~, $, comillas ni ..), " +
      "p. ej. carrusel/media (relativo al home del servidor).",
  );
  process.exit(1);
}

const token = process.env.MEDIA_PUBLIC_TOKEN!.trim();
const local = process.env.CALENDARIO_RSYNC_LOCAL === "1";
const env: EnvRender = {
  base: process.env.MEDIA_PUBLIC_BASE!.trim(),
  token,
  host: local ? "" : process.env.SERVER_HOST!.trim(),
  dir: process.env.SERVER_MEDIA_DIR!.trim(),
};
// render.json debe llegar al servidor: push tras el commit (salvo que se pida lo contrario).
process.env.KB_GIT_PUSH ??= "1";

const outRoot = join(process.cwd(), "output", "calendario");
const audioDir = process.env.CALENDARIO_AUDIO_DIR?.trim() || join(process.cwd(), "promo", "audio");

/** Aviso en la terminal y por Telegram, siempre con el token de medios oculto. */
async function avisar(texto: string): Promise<void> {
  const t = ocultarToken(texto, token);
  console.warn(`⚠️  ${t}`);
  await avisarTelegram(`🖥️ Render del calendario (Mac): ${t}`);
}

const soltar = await tomarCandado(join(outRoot, ".lock"));
if (!soltar) process.exit(0); // otra corrida viva (launchd puede solaparse): en silencio

// launchd o Ctrl-C: suelta el candado. La carpeta .tmp-* a medias se borra en la próxima corrida.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(sig, () => {
    void soltar().finally(() => process.exit(130));
  });
}

let codigo = 0;
try {
  setSyncErrorHandler((m) => void avisar(m));
  if (await abortStaleRebase()) console.warn("⚠️  Había un rebase a medias en la base; lo aborté.");
  const pull = await pullKb();
  if (pull.error) console.warn(`⚠️  No pude traer la base (${pull.error}); sigo con la copia local.`);

  const nombres = await listarSemanas();
  if (!dryRun) {
    const errPush = await sincronizarPendiente(nombres);
    if (errPush) await avisar(`No pude subir a la base un render.json de una corrida anterior (${errPush}); reintento en la próxima.`);
  }

  const semanas: SemanaLeida[] = [];
  for (const s of nombres) {
    try {
      const l = await leerSemana(s);
      if (l) semanas.push(l);
    } catch (e) {
      console.warn(`⚠️  Semana ${s} ignorada: ${e instanceof Error ? e.message : e}`);
    }
  }
  const pend = pendientes(semanas, new Date());
  if (!pend.length) {
    if (dryRun) console.log("(dry-run) No hay piezas pendientes de render.");
  } else if (dryRun) {
    console.log(`(dry-run) ${pend.length} pieza(s) por renderizar:`);
    for (const p of pend) {
      console.log(`  ${p.semana}/${p.pieza.id} (${p.pieza.formato}, ${p.pieza.dia} ${p.pieza.hora}) ← ${p.borradorPath}`);
      console.log(`    rsync → ${destinoRemoto(env, p.semana, p.pieza.id)}`);
    }
  } else {
    console.log(`🎬 ${pend.length} pieza(s) por renderizar (${new Date().toISOString()}).`);
    const puerta = await leerPuerta();
    const escritor = crearEscritorRender({ avisar });
    const r = await procesar(pend, outRoot, env, {
      render: (p, tmp) => renderPieza(p, tmp, { audioDir, puerta, avisar }),
      rsync: rsyncReal,
      verificar: verificarReal,
      escribirRender: escritor.escribirRender,
      confirmar: escritor.confirmar,
      avisar,
      log: (t) => console.log(ocultarToken(t, token)),
    });
    console.log(`Listo: ${r.ok} renderizada(s), ${r.fallidas} fallida(s), ${r.pendientes} pendiente(s).`);
  }
} catch (e) {
  console.error(`✗ ${ocultarToken(e instanceof Error ? (e.stack ?? e.message) : String(e), token)}`);
  codigo = 1;
} finally {
  await soltar();
}
process.exit(codigo);
