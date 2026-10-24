import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abortStaleRebase, pullKb, setSyncErrorHandler } from "../kb/store.ts";
import { leerSemana, listarSemanas, ocultarToken, type SemanaLeida } from "./plan.ts";
import {
  clonKbCalendario, copiarCalibracion, crearEscritorRender, destinoRemoto, dirMediosValido, leerPuerta, leerVoz, pendientes, procesar, renderPieza, rsyncReal, sincronizarPendiente, tomarCandado,
  verificarReal,
  type EnvRender,
} from "./render.ts";
import { leerPuertaCorreccion, recuperarCorreccionesCortadas } from "./correccion-fondos.ts";
import { extraerCuadros } from "./cuadros-visuales.ts";
import { releerSemanas, revisarYCorregir } from "./revision-fondos.ts";
import { llamarOpenAI, revisarFondos } from "./revisor-visual.ts";
import { avisarTelegram, enviarFotoTelegram } from "./telegram-directo.ts";

/**
 * `npm run calendario:render [-- --dry-run]` — lo lanza launchd cada hora en el Mac
 * (`deploy/launchd/es.ia.calendario-render.plist`). Idempotente y silencioso cuando
 * no hay nada que hacer. No arranca ningún bot (el único bot vive en el servidor).
 *
 * Variables (`.env`): SERVER_HOST, SERVER_MEDIA_DIR, MEDIA_PUBLIC_BASE,
 * MEDIA_PUBLIC_TOKEN (obligatorias); TELEGRAM_BOT_TOKEN y TELEGRAM_ALLOWED_CHAT_IDS
 * (avisos); CALENDARIO_KB_DIR (clon propio de ia-es-kb, default
 * ~/.cache/carrusel/kb-calendario; se clona de KB_REPO o del origin de knowledge/ si
 * falta: nunca la bóveda de Obsidian, R49); CALENDARIO_AUDIO_DIR (default promo/audio);
 * CALENDARIO_RSYNC_LOCAL=1 copia a SERVER_MEDIA_DIR en este disco (pruebas sin ssh).
 * Termina con código ≠ 0 si render.json no llegó a la base (I4).
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
    "✗ SERVER_MEDIA_DIR inválido: usa solo letras, números y _ . / - (sin espacios, ~, $, comillas, .. ni - al inicio), " +
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
const clipsDir = process.env.CLIPS_DIR?.trim() || undefined;

/** Aviso en la terminal y por Telegram, siempre con el token de medios oculto. Devuelve si Telegram lo recibió. */
async function avisar(texto: string): Promise<boolean> {
  const t = ocultarToken(texto, token);
  console.warn(`⚠️  ${t}`);
  return avisarTelegram(`🖥️ Render del calendario (Mac): ${t}`);
}

const soltar = await tomarCandado(join(outRoot, ".lock"));
if (!soltar) process.exit(0); // otra corrida viva (launchd puede solaparse): en silencio

// launchd o Ctrl-C: suelta el candado. La carpeta .tmp-* a medias se borra en la próxima corrida.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(sig, () => {
    void soltar().finally(() => process.exit(130));
  });
}

/**
 * Avisa por Telegram un error de pull solo si cambió desde el último (launchd corre cada
 * hora: el mismo error no se repite 24 veces al día). El último queda en `output/`.
 */
async function avisarPullUnaVez(error: string | undefined): Promise<void> {
  const marca = join(outRoot, ".ultimo-error-pull");
  let previo = "";
  try {
    previo = readFileSync(marca, "utf8");
  } catch {
    // primera vez
  }
  if (!error) {
    if (previo) rmSync(marca, { force: true });
    return;
  }
  console.warn(`⚠️  No pude traer la base (${error}); sigo con la copia local.`);
  if (previo === error) return;
  writeFileSync(marca, error);
  await avisar(`No pude traer la base (${error}); sigo con la copia local.`);
}

let codigo = 0;
try {
  // Clon propio de la base (R49): nunca la bóveda de Obsidian.
  const clon = await clonKbCalendario();
  if ("error" in clon) {
    await avisar(clon.error);
    throw new Error(clon.error);
  }
  process.env.KB_DIR = clon.dir;
  if (clon.clonado) console.log(`📥 Base clonada en ${clon.dir} (clon propio del render).`);

  setSyncErrorHandler((m) => void avisar(m));
  if (await abortStaleRebase()) console.warn("⚠️  Había un rebase a medias en la base; lo aborté.");
  const pull = await pullKb();
  await avisarPullUnaVez(pull.error);
  // R51: la calibración que escribe el bot llega por la base; se copia a metrics/ de este repo.
  if (!dryRun) {
    try {
      const n = await copiarCalibracion(clon.dir);
      if (n) console.log(`📐 Calibración: ${n} métrica(s) de la base copiadas a metrics/.`);
    } catch (e) {
      console.warn(`⚠️  Calibración: ${ocultarToken(e instanceof Error ? e.message : String(e), token)}`);
    }
  }

  const nombres = await listarSemanas();
  if (!dryRun) {
    const errPush = await sincronizarPendiente(nombres);
    if (errPush) {
      codigo = 1;
      await avisar(`No pude subir a la base un render.json de una corrida anterior (${errPush}); reintento en la próxima.`);
    }
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
  // Fase 3: restos de una corrección cortada (SIGTERM, sueño) se deshacen antes de procesar y de
  // revisar, para que ni un render fresco quede pisado por una .prev vieja ni la revisión mire una
  // versión corregida a medias. Con --dry-run no se toca nada.
  if (!dryRun) {
    await recuperarCorreccionesCortadas(semanas, outRoot, env, {
      avisar,
      log: (t) => console.log(ocultarToken(t, token)),
    });
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
  }
  if (!dryRun) {
    const escritor = crearEscritorRender({ avisar });
    const log = (t: string): void => console.log(ocultarToken(t, token));
    // Puerta de score/QA y voz: las mismas para procesar y para el re-render de la fase 3. Se leen
    // una vez y solo si hacen falta (sin pendientes, recién cuando la fase 3 re-renderiza algo).
    let recursos: Promise<{ puerta: Awaited<ReturnType<typeof leerPuerta>>; voz: Awaited<ReturnType<typeof leerVoz>> }> | undefined;
    const leerRecursos = () => (recursos ??= (async () => ({ puerta: await leerPuerta(), voz: await leerVoz(avisar) }))());
    if (pend.length) {
      console.log(`🎬 ${pend.length} pieza(s) por renderizar (${new Date().toISOString()}).`);
      const { puerta, voz } = await leerRecursos();
      const r = await procesar(pend, outRoot, env, {
        render: (p, tmp) => renderPieza(p, tmp, { audioDir, puerta, voz, avisar, clipsDir }),
        rsync: rsyncReal,
        verificar: verificarReal,
        escribirRender: escritor.escribirRender,
        escribirVisual: escritor.escribirVisual,
        confirmar: escritor.confirmar,
        avisar,
        log,
      });
      console.log(`Listo: ${r.ok} renderizada(s), ${r.fallidas} fallida(s), ${r.pendientes} pendiente(s).`);
    }
    // Revisión de fondos con modelo de visión (fase 2, solo avisa, nunca bloquea ni lanza): también
    // las piezas renderizadas en corridas anteriores que aún no tienen veredicto. Entre la revisión
    // y el aviso corre la corrección automática (fase 3), para que la caption diga si se corrigió.
    // Las semanas se releen después de los `confirmar` de procesar: así la revisión y la corrección
    // ven el render.json de esta corrida (una pieza recién renderizada ya está «renderizado»).
    try {
      const actuales = pend.length ? await releerSemanas(semanas, leerSemana, log) : semanas;
      const puertaCorr = await leerPuertaCorreccion(); // una vez por corrida
      const rv = await revisarYCorregir(actuales, outRoot, {
        revisar: revisarFondos,
        llamar: llamarOpenAI,
        extraer: extraerCuadros,
        enviarFoto: enviarFotoTelegram,
        escribirVisual: escritor.escribirVisual,
        visualPendiente: escritor.visualPendiente,
        log,
      }, {
        env,
        puerta: puertaCorr,
        deps: {
          render: async (p, tmp, quitar) => {
            const { puerta, voz } = await leerRecursos();
            return renderPieza(p, tmp, { audioDir, puerta, voz, avisar, clipsDir, quitarFondos: quitar });
          },
          // La misma voz que usará `render`: la precondición de caché de voz mira esas líneas.
          voz: async () => (await leerRecursos()).voz,
          rsync: rsyncReal,
          verificar: verificarReal,
          escribirRender: escritor.escribirRender,
          escribirVisual: escritor.escribirVisual,
          visualPendiente: escritor.visualPendiente,
          // Cada corrección aplicada sube su semana de inmediato (el preview nuevo sale cuanto antes).
          confirmar: escritor.confirmar,
          avisar,
          log,
        },
      });
      const { revision: r, correccion: c } = rv;
      if (r.revisadas || r.sinRevisar) {
        console.log(`🖼️  Revisión de fondos: ${r.revisadas} revisada(s), ${r.sinRevisar} sin revisar, ${r.avisos} aviso(s), US$${r.usd.toFixed(4)}.`);
      }
      if (c.aplicadas || c.fallidas || c.omitidas) {
        console.log(`🖼️  Corrección de fondos: ${c.aplicadas} aplicada(s), ${c.fallidas} fallida(s), ${c.omitidas} omitida(s).`);
      }
      // procesar ya confirmó lo suyo: aquí se sube lo que anotaron la revisión y la corrección
      // (render.json y visual.json; no-op si no hay nada).
      for (const s of actuales) await escritor.confirmar(s.semana);
    } catch (e) {
      console.warn(`⚠️  Revisión de fondos: ${ocultarToken(e instanceof Error ? e.message : String(e), token)}`);
    }
    // render.json o visual.json sin subir (I4): ya avisado; la corrida no es buena y la próxima reintenta solo la subida.
    if (escritor.huboError()) codigo = 1;
  }
} catch (e) {
  console.error(`✗ ${ocultarToken(e instanceof Error ? (e.stack ?? e.message) : String(e), token)}`);
  codigo = 1;
} finally {
  await soltar();
}
process.exit(codigo);
