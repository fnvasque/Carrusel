import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync } from "../_check.ts";
import { parsePlan, type RenderEntry } from "../../src/calendario/plan.ts";
import { zonedToUtc } from "../../src/calendario/time.ts";
import {
  crearEscritorRender, destinoRemoto, procesar, rsyncReal, sincronizarPendiente, tomarCandado, type PiezaPendiente,
} from "../../src/calendario/render.ts";
import { abortStaleRebase, pullKb, setSyncErrorHandler } from "../../src/kb/store.ts";

/**
 * Adversario T8 (render en el Mac). Solo los ataques que el código NO resiste.
 * Sin Chromium, sin red, sin ssh: carpetas y repos git temporales (remoto bare local).
 */

const SEMANA = "2026-10-12";
const TOKEN = "tok-SECRETO-123";
const ENV = { base: "https://medios.example", token: TOKEN, host: "", dir: "/tmp/no-usado" };

function piezaRaw(id: string, dia: string, hora: string): Record<string, unknown> {
  return {
    id, dia, hora, formato: "reel", arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "herramienta",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador: `${id}.json`, estado: "planificado",
  };
}

function pend(id: string, dia: string, hora: string): PiezaPendiente {
  const plan = parsePlan(JSON.stringify({ semana: SEMANA, zona: "America/Santiago", experimento: null, piezas: [piezaRaw(id, dia, hora)] }));
  return { semana: SEMANA, pieza: plan.piezas[0], borradorPath: `${id}.json` };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// ---------------------------------------------------------------------------
// 1. Dos corridas a la vez con un candado de PID muerto.
// Brief, Step 3: «Candado `output/calendario/.lock` con PID (si el PID vive, sale en
// silencio: launchd puede solaparse)». Mandato: «dos corridas a la vez».
// Dos procesos que encuentran el mismo candado viejo: el lento lee el PID muerto, el
// rápido lo recupera y lo toma; el lento, con el PID viejo ya leído, BORRA el candado
// vivo del rápido y toma otro. Las dos corridas siguen (y la segunda borra la carpeta
// `<id>.tmp-*` que la primera está renderizando).
// ---------------------------------------------------------------------------
await checkAsync("adversario T8: candado de PID muerto + dos corridas a la vez → las dos toman el candado", async () => {
  const dir = mkdtempSync(join(tmpdir(), "adv-t8-lock-"));
  const lock = join(dir, ".lock");
  writeFileSync(lock, "999999\n"); // PID muerto (la corrida anterior murió con el Mac dormido)
  // Simula el orden de los dos procesos: el `stat` del primero tarda (planificador del SO).
  const require = createRequire(import.meta.url);
  const real = require("node:fs/promises") as typeof fsp;
  const statOriginal = real.stat;
  let primero = true;
  (real as { stat: unknown }).stat = async (p: Parameters<typeof fsp.stat>[0], ...rest: unknown[]) => {
    if (String(p) === lock && primero) {
      primero = false;
      await new Promise((r) => setTimeout(r, 150));
    }
    return (statOriginal as (...a: unknown[]) => unknown)(p, ...rest);
  };
  syncBuiltinESMExports();
  let a: Awaited<ReturnType<typeof tomarCandado>>;
  let b: Awaited<ReturnType<typeof tomarCandado>>;
  try {
    [a, b] = await Promise.all([tomarCandado(lock), tomarCandado(lock)]);
  } finally {
    (real as { stat: unknown }).stat = statOriginal;
    syncBuiltinESMExports();
  }
  const tomados = [a, b].filter(Boolean).length;
  assert.equal(tomados, 1, `${tomados} corridas tomaron el candado a la vez`);
});

// ---------------------------------------------------------------------------
// 2. render.json modificado en el remoto entre el pull y el push.
// Brief, Step 2: «`commitPaths([...], …)` (con `KB_GIT_PUSH=1` … para que suba)»;
// spec «Render en el Mac» paso 4: «commit … y push con `pull --rebase`».
// Mandato: «`render.json` modificado en remoto entre el pull y el push».
// Real: el rebase choca, se aborta, el commit queda local; en las corridas siguientes
// `pullKb` vuelve a chocar y `sincronizarPendiente` no puede hacer push: la entrada
// `renderizado` nunca llega al servidor (y la pieza ya no es pendiente en el Mac, así
// que nunca se reintenta: el bot la salta). Además la base del Mac queda sin poder
// traer nada más (planes nuevos del agente incluidos).
// ---------------------------------------------------------------------------
await checkAsync("adversario T8: render.json cambiado en el remoto entre pull y push → la entrada del Mac nunca llega al remoto", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "adv-t8-git-"));
  const bare = join(raiz, "remoto.git");
  git(raiz, "init", "--bare", "-b", "main", bare);
  const mac = join(raiz, "mac");
  git(raiz, "clone", bare, mac);
  const sd = join(mac, "_calendario", SEMANA);
  mkdirSync(sd, { recursive: true });
  writeFileSync(join(sd, "plan.json"), "{}\n");
  writeFileSync(join(sd, "render.json"), "{}\n");
  git(mac, "add", ".");
  git(mac, "commit", "-m", "base");
  git(mac, "push", "-u", "origin", "main");
  git(mac, "config", "user.name", "mac");
  git(mac, "config", "user.email", "mac@local");
  const otro = join(raiz, "otro");
  git(raiz, "clone", bare, otro);

  // Hook pre-push (solo la primera vez): otro escritor sube un render.json distinto justo
  // después de nuestro pull y antes de nuestro push.
  const hooks = join(mac, ".git", "hooks");
  mkdirSync(hooks, { recursive: true });
  const marca = join(raiz, "ya-disparo");
  writeFileSync(join(hooks, "pre-push"), `#!/bin/sh
[ -e "${marca}" ] && exit 0
touch "${marca}"
cd "${otro}" || exit 0
printf '{\\n  "otra-pieza": { "estado": "fallido", "motivo": "x", "en": "2026-10-10T00:00:00Z" }\\n}\\n' > "_calendario/${SEMANA}/render.json"
git -c user.name=o -c user.email=o@o commit -qam "otro escritor" && git push -q origin main
exit 0
`);
  chmodSync(join(hooks, "pre-push"), 0o755);
  git(mac, "config", "core.hooksPath", hooks);

  const prev = { KB_DIR: process.env.KB_DIR, KB_GIT_PUSH: process.env.KB_GIT_PUSH, KB_GIT: process.env.KB_GIT };
  process.env.KB_DIR = mac;
  process.env.KB_GIT_PUSH = "1";
  delete process.env.KB_GIT;
  const avisos: string[] = [];
  setSyncErrorHandler((m) => void avisos.push(m));
  try {
    const escritor = crearEscritorRender({ avisar: async (t) => void avisos.push(t) });
    const entrada: RenderEntry = { estado: "renderizado", medios: { archivos: ["u"] }, en: "2026-10-11T00:00:00Z" };
    await escritor.escribirRender(SEMANA, "lun-reel-mac", entrada);
    await escritor.confirmar(SEMANA);

    // Dos corridas horarias más, como las hace render-cli.ts.
    for (let i = 0; i < 2; i++) {
      await abortStaleRebase();
      await pullKb();
      await sincronizarPendiente([SEMANA]);
    }

    const remoto = JSON.parse(execFileSync("git", ["--git-dir", bare, "show", `main:_calendario/${SEMANA}/render.json`], { encoding: "utf8" }));
    assert.ok(remoto["lun-reel-mac"], `el remoto no tiene la entrada del Mac tras 3 corridas; avisos: ${avisos.join(" | ")}`);
  } finally {
    setSyncErrorHandler((m) => console.warn(`⚠️  ${m}`));
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ---------------------------------------------------------------------------
// 3. La hora de la pieza pasa durante la subida (rsync/verificación lentos).
// Brief, mandato: «pieza cuya hora pasó mientras renderizaba (…el bot la salta; el
// Mac no la sube)»; constraints: «Una pieza sin render a su hora → `saltado` …;
// nunca se publica tarde». El chequeo de hora está ANTES de rsync; si la subida
// (timeout de 15 min) cruza la hora, igual escribe `renderizado` con URLs para una
// pieza que a su hora no tenía render.
// ---------------------------------------------------------------------------
await checkAsync("adversario T8: la hora pasa durante rsync/verificación → igual escribe renderizado", async () => {
  const out = mkdtempSync(join(tmpdir(), "adv-t8-hora-"));
  const p = pend("lun-reel-lento", "2026-10-12", "14:00");
  const hora = zonedToUtc("2026-10-12", "14:00").getTime();
  let reloj = hora - 5 * 60_000; // 5 min antes
  const escritos: RenderEntry[] = [];
  const r = await procesar([p], out, ENV, {
    render: async (_p, tmp) => {
      writeFileSync(join(tmp, "reel.mp4"), "x");
      return { archivos: ["reel.mp4"] };
    },
    rsync: async () => {
      reloj = hora + 10 * 60_000; // la subida tardó 15 min: ya son las 14:10
    },
    verificar: async () => true,
    escribirRender: async (_s, _id, e) => void escritos.push(e),
    avisar: async () => {},
    ahora: () => new Date(reloj),
    log: () => {},
  });
  assert.ok(!escritos.some((e) => e.estado === "renderizado"), `escribió renderizado a las 14:10 para una pieza de las 14:00 (${JSON.stringify(r)})`);
});

// ---------------------------------------------------------------------------
// 4. SERVER_MEDIA_DIR en el comando remoto de rsync.
// Brief, Step 2: `rsync … <local>/ $SERVER_HOST:$SERVER_MEDIA_DIR/<semana>/<id>/`.
// `rsyncReal` envuelve la ruta con comillas simples (`sq`) en
// `--rsync-path=mkdir -p '<ruta>' && rsync`, pero el rsync del Mac (openrsync, el que
// usa el código: /usr/bin/rsync) parte ese valor como argv y descarta las comillas: el
// shell remoto recibe `mkdir -p <ruta> && rsync --server … <ruta>` SIN comillas. Un
// `$(…)` en la ruta se ejecuta en el servidor y un espacio la parte en dos (los archivos
// terminan en otra carpeta). Se prueba con un `ssh` falso en el PATH que ejecuta el
// comando remoto en un `sh -c` local, como hace sshd.
// ---------------------------------------------------------------------------
async function conSshFalso<T>(fn: (raiz: string) => Promise<T>): Promise<T> {
  const raiz = mkdtempSync(join(tmpdir(), "adv-t8-ssh-"));
  const bin = join(raiz, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "ssh"), `#!/bin/sh
while [ $# -gt 0 ]; do case "$1" in -o) shift 2;; -*) shift;; *) break;; esac; done
shift
exec sh -c "$*"
`);
  chmodSync(join(bin, "ssh"), 0o755);
  const prevPath = process.env.PATH;
  process.env.PATH = `${bin}:${prevPath}`;
  try {
    return await fn(raiz);
  } finally {
    process.env.PATH = prevPath;
  }
}

await checkAsync("adversario T8: SERVER_MEDIA_DIR con $(…) → se ejecuta en el shell remoto pese a las comillas de rsyncReal", async () => {
  await conSshFalso(async (raiz) => {
    const local = join(raiz, "local");
    mkdirSync(local);
    writeFileSync(join(local, "01.jpg"), "x");
    const marca = join(raiz, "EJECUTADO");
    const env = { ...ENV, host: "servidor", dir: `${raiz}/media-$(touch ${marca})` };
    try {
      await rsyncReal(local, destinoRemoto(env, SEMANA, "lun-reel-a"));
    } catch {
      // que rsync falle o no da igual: importa si el $(…) corrió
    }
    assert.ok(!existsSync(marca), "el $(…) de SERVER_MEDIA_DIR se ejecutó en el servidor");
  });
});

await checkAsync("adversario T8: SERVER_MEDIA_DIR con un espacio → los archivos no llegan a $SERVER_MEDIA_DIR/<semana>/<id>/", async () => {
  await conSshFalso(async (raiz) => {
    const local = join(raiz, "local");
    mkdirSync(local);
    writeFileSync(join(local, "01.jpg"), "x");
    const dir = join(raiz, "mis medios");
    const env = { ...ENV, host: "servidor", dir };
    let err = "";
    try {
      await rsyncReal(local, destinoRemoto(env, SEMANA, "lun-reel-a"));
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    assert.ok(existsSync(join(dir, SEMANA, "lun-reel-a", "01.jpg")), `no está en ${dir}/${SEMANA}/lun-reel-a/ (${err})`);
  });
});

void readFileSync;
