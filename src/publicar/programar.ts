import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MANIFIESTO, leerManifiesto } from "../calendario/render.ts";
import { PlanSchema, type Plan } from "../calendario/plan.ts";
import { localParts } from "../calendario/time.ts";
import { resolverCuando, piezasCercanas, semanaDe } from "./hueco.ts";
import { armarPieza, borradorDe, idDe, insertarPieza, problemasCaption } from "./pieza.ts";
import { problemasVideo, type extraerCuadros, type inspeccionarVideo } from "./video.ts";

export interface DepsProgramar {
  outRoot: string;
  /** Raíz del clon de la base (contiene `_calendario/`). */
  kbCalendario: string;
  ahora: () => Date;
  pull: () => Promise<void>;
  commit: (paths: string[], msg: string) => Promise<void>;
  render: () => Promise<{ ok: boolean; salida: string }>;
  inspeccionar: typeof inspeccionarVideo;
  extraer: typeof extraerCuadros;
}

export interface ResultadoProgramar {
  semana: string;
  id: string;
  dia: string;
  hora: string;
  cercanas: string[];
  avisos: string[];
  carpeta: string;
  programada: boolean;
  render?: { ok: boolean; salida: string };
}

const ID_VALIDO = /^[a-z0-9][a-z0-9-]*$/;

/** Escritura atómica: archivo temporal hermano y `rename`. */
async function escribirAtomico(ruta: string, texto: string): Promise<void> {
  const tmp = `${ruta}.tmp-${process.pid}`;
  await writeFile(tmp, texto, "utf8");
  await rename(tmp, ruta);
}

/**
 * Deja un video listo programado por el camino «hecha a mano»: carpeta final con
 * `.manifiesto.json` (el render del Mac solo la sube) + pieza nueva en `plan.json`.
 * Orden fijo; cualquier error lanza antes del paso siguiente.
 */
export async function programar(
  o: { video: string; cuando: string; hook: string; caption: string; id?: string; dryRun: boolean },
  d: DepsProgramar,
): Promise<ResultadoProgramar> {
  // 1. Base al día.
  await d.pull();

  // 2. Cuándo y semana (de la fecha RESUELTA: «ahora» puede cruzar a la semana siguiente) y plan.
  const ahora = d.ahora();
  const { dia, hora } = resolverCuando(o.cuando, ahora);
  const semana = semanaDe(dia);
  const dirSemana = join(d.kbCalendario, "_calendario", semana);
  const rutaPlan = join(dirSemana, "plan.json");
  let planTexto: string;
  try {
    planTexto = await readFile(rutaPlan, "utf8");
  } catch {
    throw new Error(`la semana ${semana} aún no tiene plan`);
  }
  const plan: Plan = PlanSchema.parse(JSON.parse(planTexto));

  // 3. Validar caption, video e id.
  if (o.id === undefined && !/[\p{L}\p{N}]/u.test(o.hook)) throw new Error("el hook necesita letras o números (o pasa --id)");
  const id = o.id ?? idDe(dia, o.hook);
  if (!ID_VALIDO.test(id)) throw new Error(`id inválido: «${id}» (usa minúsculas, números y guiones)`);
  const info = await d.inspeccionar(o.video);
  const v = problemasVideo(info);
  const errores = [...problemasCaption(o.caption), ...v.errores];
  if (errores.length) throw new Error(errores.join("; "));

  const carpeta = join(d.outRoot, semana, id);
  if (existsSync(carpeta)) throw new Error(`id repetido: ${id} (ya existe ${carpeta})`);
  const hoy = localParts(ahora).dia;
  const pieza = armarPieza({ id, dia, hora, hook: o.hook, caption: o.caption, hoy });
  // Lanza «id repetido» sin haber copiado nada; el plan nuevo se valida antes de escribir cualquier cosa.
  const planNuevo = PlanSchema.parse(insertarPieza(plan, pieza));
  const resultado: ResultadoProgramar = {
    semana, id, dia, hora,
    cercanas: piezasCercanas(plan.piezas, dia, hora),
    avisos: v.avisos,
    carpeta,
    programada: false,
  };

  // 4. Simulacro: nada se escribe.
  if (o.dryRun) return resultado;

  // 5. Carpeta final (staging hermano + rename), validada ANTES de tocar plan.json y el commit:
  //    así el render horario nunca ve una pieza en el plan sin sus archivos.
  const cuadros = await mkdtemp(join(tmpdir(), "publicar-cuadros-"));
  const staging = join(d.outRoot, semana, `.tmp-${id}-${process.pid}`);
  try {
    const c = await d.extraer(o.video, cuadros, info);
    await mkdir(staging, { recursive: true });
    await copyFile(o.video, join(staging, "reel.mp4"));
    await copyFile(c.cover, join(staging, "cover.jpg"));
    await copyFile(c.story, join(staging, "story.jpg"));
    await writeFile(
      join(staging, MANIFIESTO),
      JSON.stringify({ archivos: ["reel.mp4", "cover.jpg", "story.jpg"], duracionMs: info.duracionMs }),
      "utf8",
    );
    if (!(await leerManifiesto(staging))) throw new Error("la carpeta del reel quedó incompleta (manifiesto inválido)");
    await rename(staging, carpeta);
    if (!(await leerManifiesto(carpeta))) throw new Error("la carpeta final del reel no pasó la validación del manifiesto");
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    throw e;
  } finally {
    await rm(cuadros, { recursive: true, force: true });
  }

  // 6. Borrador y plan (el plan va último: es lo que hace «existir» a la pieza).
  const rutaBorrador = join(dirSemana, pieza.borrador);
  try {
    await escribirAtomico(rutaBorrador, `${JSON.stringify(borradorDe(id, o.hook), null, 2)}\n`);
    await escribirAtomico(rutaPlan, `${JSON.stringify(planNuevo, null, 2)}\n`);
  } catch (e) {
    await rm(carpeta, { recursive: true, force: true });
    throw e;
  }

  // 7. Commit (lanza si el plan no llegó a la base) y 8. render.
  await d.commit([rutaPlan, rutaBorrador], `calendario ${semana}: ${id} (publicar, hecha a mano)`);
  resultado.programada = true;
  resultado.render = await d.render();
  return resultado;
}

/** Salida de git para `commitYVerificar`. */
export interface DepsCommit {
  commitPaths: (paths: string[], msg: string) => Promise<string | undefined>;
  git: (args: string[]) => Promise<{ code: number; out: string }>;
}

/**
 * `commitPaths` devuelve `undefined` en silencio si algo falla y el push puede no
 * llegar: se comprueba que haya commit y que el clon no quede `ahead` de origin.
 */
export async function commitYVerificar(paths: string[], msg: string, d: DepsCommit): Promise<void> {
  const hash = await d.commitPaths(paths, msg);
  if (!hash) throw new Error("el plan no llegó a la base: no se pudo hacer el commit");
  const st = await d.git(["status", "-sb"]);
  if (st.code !== 0) throw new Error(`el plan no llegó a la base: no pude verificar con git status (${st.out.trim()})`);
  const cabecera = st.out.split("\n")[0] ?? "";
  if (/\bahead\b/.test(cabecera)) throw new Error(`el plan no llegó a la base: ${cabecera.trim()}`);
}
