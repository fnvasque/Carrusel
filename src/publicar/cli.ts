import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { commitPaths, pullKb } from "../kb/store.ts";
import { clonKbCalendario } from "../calendario/render.ts";
import { localParts } from "../calendario/time.ts";
import { semanaDe } from "./hueco.ts";
import { commitYVerificar, programar, type DepsProgramar } from "./programar.ts";
import { extraerCuadros, inspeccionarVideo, problemasVideo } from "./video.ts";

/**
 * `npm run -s publicar -- revisar "<video>" [--transcribir]`
 * `npm run -s publicar -- programar "<video>" --cuando "<ahora|AAAA-MM-DD HH:MM>" --hook "<texto>"
 *    --caption-file "<ruta>" [--id <id>] [--dry-run]`
 * Imprime JSON en stdout. Los errores salen por stderr con código 1.
 */

try {
  process.loadEnvFile?.();
} catch {
  // Sin .env: se usan las variables del entorno.
}

const ejecutar = promisify(execFile);

function valorDe(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`falta el valor de ${nombre}`);
  return v;
}

/** Semanas (AAAA-MM-DD) con `plan.json` desde la semana de hoy en adelante. */
function semanasConPlan(kb: string, hoy: Date): string[] {
  const dir = join(kb, "_calendario");
  if (!existsSync(dir)) return [];
  const desde = semanaDe(localParts(hoy).dia);
  return readdirSync(dir)
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= desde && existsSync(join(dir, s, "plan.json")))
    .sort();
}

function hashtagsBase(kb: string): string[] {
  try {
    const cfg = JSON.parse(readFileSync(join(kb, "_calendario", "config.json"), "utf8")) as { hashtagsBase?: unknown };
    return Array.isArray(cfg.hashtagsBase) ? cfg.hashtagsBase.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

async function principal(): Promise<void> {
  const [cmd, video, ...resto] = process.argv.slice(2);
  if ((cmd !== "revisar" && cmd !== "programar") || !video) {
    throw new Error('uso: publicar revisar "<video>" [--transcribir] | publicar programar "<video>" --cuando … --hook … --caption-file …');
  }
  const rutaVideo = resolve(video);
  if (!existsSync(rutaVideo)) throw new Error(`no existe el video: ${rutaVideo}`);

  // Clon propio de la base (nunca la bóveda de Obsidian); push tras el commit.
  const clon = await clonKbCalendario();
  if ("error" in clon) throw new Error(clon.error);
  process.env.KB_DIR = clon.dir;
  process.env.KB_GIT_PUSH ??= "1";
  // `kbDir()` lee KB_DIR en cada llamada, así que basta fijarlo antes de usar el store.

  if (cmd === "revisar") {
    await pullKb().catch(() => undefined);
    const info = await inspeccionarVideo(rutaVideo);
    const { errores, avisos } = problemasVideo(info);
    const cuadros = await extraerCuadros(rutaVideo, await mkdtemp(join(tmpdir(), "publicar-revisar-")), info);
    let transcripcion: string | undefined;
    if (resto.includes("--transcribir")) {
      const { transcribe } = await import("../kb/ai.ts");
      transcripcion = await transcribe(rutaVideo);
    }
    console.log(
      JSON.stringify({ info, errores, avisos, cuadros, ...(transcripcion !== undefined ? { transcripcion } : {}), hashtagsBase: hashtagsBase(clon.dir), semanasConPlan: semanasConPlan(clon.dir, new Date()) }, null, 2),
    );
    return;
  }

  const cuando = valorDe(resto, "--cuando");
  const hook = valorDe(resto, "--hook");
  const captionFile = valorDe(resto, "--caption-file");
  if (!cuando || !hook || !captionFile) throw new Error("programar necesita --cuando, --hook y --caption-file");
  const caption = readFileSync(resolve(captionFile), "utf8").trim();
  const dryRun = resto.includes("--dry-run");

  const git = async (args: string[]): Promise<{ code: number; out: string }> => {
    try {
      const r = await ejecutar("git", args, { cwd: clon.dir });
      return { code: 0, out: r.stdout + r.stderr };
    } catch (e) {
      const x = e as { code?: number; stdout?: string; stderr?: string };
      return { code: typeof x.code === "number" ? x.code : -1, out: `${x.stdout ?? ""}${x.stderr ?? ""}` };
    }
  };
  const deps: DepsProgramar = {
    outRoot: join(process.cwd(), "output", "calendario"),
    kbCalendario: clon.dir,
    ahora: () => new Date(),
    pull: async () => {
      const r = await pullKb();
      if (r.error) throw new Error(`no pude traer la base: ${r.error}`);
    },
    commit: (paths, msg) => commitYVerificar(paths, msg, { commitPaths: commitPaths, git }),
    render: async () => {
      try {
        const r = await ejecutar("npm", ["run", "-s", "calendario:render"], { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024 });
        return { ok: true, salida: (r.stdout + r.stderr).trim() };
      } catch (e) {
        const x = e as { stdout?: string; stderr?: string; message: string };
        return { ok: false, salida: `${x.stdout ?? ""}${x.stderr ?? ""}`.trim() || x.message };
      }
    },
    inspeccionar: inspeccionarVideo,
    extraer: extraerCuadros,
  };
  const id = valorDe(resto, "--id");
  const r = await programar({ video: rutaVideo, cuando, hook, caption, ...(id ? { id } : {}), dryRun }, deps);
  console.log(JSON.stringify(r, null, 2));
}

principal().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
