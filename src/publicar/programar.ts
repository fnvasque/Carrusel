import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
  /** Deshace un commit nuestro que no llegó a la base (reset al upstream); no toca nada que no sea nuestro. `subido`: el commit ya está en origin. */
  deshacer: (msg: string) => Promise<"revertido" | "subido" | "nada">;
  /** Candado `outRoot/.lock` compartido con el render horario; `undefined` si otro lo tiene. */
  candado: () => Promise<(() => Promise<void>) | undefined>;
  render: () => Promise<{ ok: boolean; salida: string }>;
  /** Relee `render.json` de la semana (del clon de la base) tras el render; `undefined` si no existe o no se puede leer. */
  leerRender: (semana: string) => Promise<Record<string, { estado?: string }> | undefined>;
  /** Saca del índice de git los archivos que `commit` dejó con stage cuando el commit falló sin crear nada. */
  desindexar: (paths: string[]) => Promise<void>;
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
  /**
   * El render dejó la pieza en `renderizado` (ese estado solo se escribe tras verificar la URL
   * pública de cada medio). `false`: el render horario la subirá antes de la hora.
   */
  subida?: boolean;
}

/** ¿La pieza `id` quedó `renderizado` en `render.json`? Función pura. */
export function subidaDe(render: Record<string, { estado?: string }> | undefined, id: string): boolean {
  return render?.[id]?.estado === "renderizado";
}

/**
 * El comando solo vale corrido desde `Carrusel-render` (`CARRUSEL_RENDER_DIR` o
 * `~/Documents/Claude/Carrusel-render`): de ahí salen la carpeta de salida y el candado que
 * ve el render del Mac. Lanza si `cwd` es otro, salvo `cualquierDir` (solo para tests).
 */
export function exigirDirRender(cwd: string, renderDir: string | undefined, cualquierDir: boolean): void {
  if (cualquierDir) return;
  const real = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const esperado = renderDir?.trim() || join(homedir(), "Documents", "Claude", "Carrusel-render");
  if (real(cwd) !== real(esperado)) {
    throw new Error(
      `publicar solo corre desde ${esperado} (estás en ${cwd}): si no, la carpeta del reel queda donde el render del Mac no la ve. ` +
        `Usa npm --prefix ${esperado} run -s publicar -- …`,
    );
  }
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
  // El candado cubre pull, escritura y commit (el render horario comparte el clon). Se suelta
  // ANTES del render: `calendario:render` toma el mismo candado y saldría en silencio.
  let soltar: (() => Promise<void>) | undefined;
  if (!o.dryRun) {
    soltar = await d.candado();
    if (!soltar) throw new Error("otro proceso (el render horario) tiene el candado de output/calendario; reintenta en unos minutos");
  }
  let r: ResultadoProgramar;
  try {
    r = await programarBloqueado(o, d);
  } finally {
    await soltar?.();
  }
  if (r.programada) {
    r.render = await d.render();
    r.subida = subidaDe(await d.leerRender(r.semana).catch(() => undefined), r.id);
  }
  return r;
}

async function programarBloqueado(
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
  const staging = join(d.outRoot, semana, `${id}.tmp-${process.pid}`);
  let renombrada = false;
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
    renombrada = true;
    if (!(await leerManifiesto(carpeta))) throw new Error("la carpeta final del reel no pasó la validación del manifiesto");
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    if (renombrada) await rm(carpeta, { recursive: true, force: true });
    throw e;
  } finally {
    await rm(cuadros, { recursive: true, force: true });
  }

  // 6. Borrador y plan (el plan va último: es lo que hace «existir» a la pieza).
  const rutaBorrador = join(dirSemana, pieza.borrador);
  const textoNuevo = `${JSON.stringify(planNuevo, null, 2)}\n`;
  const msg = `calendario ${semana}: ${id} (publicar, hecha a mano)`;
  let paso: "escribir" | "commit" = "escribir";
  try {
    await escribirAtomico(rutaBorrador, `${JSON.stringify(borradorDe(id, o.hook), null, 2)}\n`);
    await escribirAtomico(rutaPlan, textoNuevo);
    // 7. Commit: lanza si el plan no llegó a la base.
    paso = "commit";
    await d.commit([rutaPlan, rutaBorrador], msg);
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    const quedo: string[] = [];
    // Si hubo commit nuestro, primero se mira en qué quedó: subido (no se deshace nada),
    // revertido o inexistente (se limpia todo). Si no se puede deshacer, NO se toca nada:
    // plan.json, borrador y carpeta quedan coherentes con el commit local.
    let estado: "revertido" | "subido" | "nada" | undefined;
    if (paso === "commit") {
      try {
        estado = await d.deshacer(msg);
      } catch (e2) {
        const det = e2 instanceof Error ? e2.message : String(e2);
        throw new Error(
          `${causa}. No pude deshacer: ${det}. Puede haber un commit local ahead con la pieza «${id}»; ` +
            `su carpeta ${carpeta}, el borrador y plan.json siguen intactos (coherentes con ese commit). ` +
            `Si no haces nada, el render horario la subirá y se publicará. ` +
            `Revisa con git -C ${d.kbCalendario} status -sb y, si confirmas que no debe publicarse, corre ` +
            `git -C ${d.kbCalendario} reset --keep @{u} y borra ${carpeta}.`,
        );
      }
      if (estado === "subido") {
        // El commit ya está en origin: la pieza existe allá y necesita sus medios. Se deja todo y se sigue.
        resultado.avisos.push(`el commit llegó a la base pero la verificación falló (${causa}); la pieza queda programada`);
        resultado.programada = true;
        return resultado;
      }
    }
    if (estado === "nada") {
      // El commit falló sin crear nada: `git add` pudo dejar los archivos con stage.
      await d.desindexar([rutaPlan, rutaBorrador]).catch((e2) => quedo.push(`el índice de git (${e2 instanceof Error ? e2.message : e2})`));
    }
    try {
      // Solo se restaura el plan si sigue siendo el nuestro (un reset o un rebase pudo cambiarlo).
      if ((await readFile(rutaPlan, "utf8").catch(() => undefined)) === textoNuevo) await escribirAtomico(rutaPlan, planTexto);
    } catch (e2) {
      quedo.push(`la pieza en ${rutaPlan} (${e2 instanceof Error ? e2.message : e2})`);
    }
    await rm(rutaBorrador, { force: true }).catch(() => quedo.push(`el borrador ${rutaBorrador}`));
    await rm(carpeta, { recursive: true, force: true }).catch(() => quedo.push(`la carpeta ${carpeta}`));
    if (!quedo.length) throw new Error(`${causa}. No quedó nada programado; puedes reintentar.`);
    throw new Error(
      `${causa}. No pude deshacer todo; quedó: ${quedo.join("; ")}. Para limpiar, en ${d.kbCalendario}: ` +
        `git reset --keep @{u} (si hay un commit local «${msg}» ahead), git checkout -- _calendario/${semana}/plan.json, ` +
        `rm _calendario/${semana}/${pieza.borrador}; y borra ${carpeta}.`,
    );
  }
  resultado.programada = true;
  return resultado;
}

/** Salida de git para `commitYVerificar`. */
export interface DepsCommit {
  commitPaths: (paths: string[], msg: string) => Promise<string | undefined>;
  git: (args: string[]) => Promise<{ code: number; out: string }>;
}

/**
 * `commitPaths` devuelve `undefined` en silencio si algo falla y el push puede no
 * llegar: se comprueba que haya commit y que no queden commits sin subir (`@{u}..HEAD`).
 */
export async function commitYVerificar(paths: string[], msg: string, d: DepsCommit): Promise<void> {
  const hash = await d.commitPaths(paths, msg);
  if (!hash) throw new Error("el plan no llegó a la base: no se pudo hacer el commit");
  // Cuenta commits sin subir con rev-list (no depende del idioma de git). Sin upstream falla: también lanza.
  const st = await d.git(["rev-list", "--count", "@{u}..HEAD"]);
  if (st.code !== 0) throw new Error(`el plan no llegó a la base: no pude verificar contra el upstream (${st.out.trim()})`);
  const ahead = Number(st.out.trim());
  if (!Number.isFinite(ahead)) throw new Error(`el plan no llegó a la base: respuesta inesperada de git (${st.out.trim()})`);
  if (ahead > 0) throw new Error(`el plan no llegó a la base: quedan ${ahead} commit(s) sin subir`);
}

/**
 * Deshace el commit local de `programar` que no llegó a origin: solo si es el único commit
 * `ahead` y su asunto es el nuestro (`git reset --keep @{u}`). Si no hay commits ahead no hace nada;
 * si hay otros, lanza (no se toca lo que no es nuestro).
 */
export async function deshacerCommit(msg: string, git: DepsCommit["git"]): Promise<"revertido" | "subido" | "nada"> {
  const asunto = await git(["log", "-1", "--format=%s", "HEAD"]);
  const head = await git(["rev-parse", "HEAD"]);
  const up = await git(["rev-parse", "@{u}"]);
  if (asunto.code !== 0 || head.code !== 0 || up.code !== 0) {
    throw new Error(`no pude leer el estado de git (${[asunto, head, up].filter((x) => x.code !== 0).map((x) => x.out.trim()).join(" | ")})`);
  }
  if (asunto.out.trim() === msg && head.out.trim() === up.out.trim()) return "subido";
  const l = await git(["log", "@{u}..HEAD", "--format=%s"]);
  if (l.code !== 0) throw new Error(`no pude leer los commits ahead: ${l.out.trim()}`);
  const asuntos = l.out.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!asuntos.length) return "nada";
  if (asuntos.length !== 1 || asuntos[0] !== msg) {
    throw new Error(`hay commits locales que no son solo el nuestro (${asuntos.join(" | ")})`);
  }
  const r = await git(["reset", "--keep", "@{u}"]);
  if (r.code !== 0) throw new Error(`git reset --keep @{u} falló: ${r.out.trim()}`);
  return "revertido";
}
