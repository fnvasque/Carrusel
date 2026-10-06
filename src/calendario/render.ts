import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createElement } from "react";
import { pullKb, commitPaths } from "../kb/store.ts";
import { scoreDraft } from "../remix/registry.ts";
import { THRESHOLD } from "../score/virality.ts";
import { renderCarousel } from "../render/renderCarousel.ts";
import { Renderer } from "../render/renderSlide.ts";
import { resolveBackground } from "../render/background.ts";
import { renderReelResult } from "../reel/renderReel.ts";
import { FORMATS } from "../templates/types.ts";
import { borradorASpec, parseBorrador, storySpec } from "./draft.ts";
import {
  calendarioDir, estadoEfectivo, ocultarToken, semanaDir, urlPublica,
  type Medios, type Pieza, type RenderEntry, type SemanaLeida,
} from "./plan.ts";
import { qaImagen, qaReel, type Puerta } from "./qa.ts";
import { zonedToUtc } from "./time.ts";

/**
 * Render del calendario en el Mac (`npm run calendario:render`, lanzado cada hora
 * por launchd). Por cada pieza planificada cuya hora no pasó: render en una carpeta
 * temporal → QA → `rename` atómico a `output/calendario/<semana>/<id>/` → rsync al
 * servidor → HEAD a cada URL pública → entrada en `render.json` (el Mac solo
 * escribe ese archivo; nunca `plan.json`). La lógica (`pendientes`, `procesar`)
 * recibe sus efectos inyectados (`Deps`) para probarla sin Chromium, ssh ni red.
 */

export interface PiezaPendiente {
  semana: string;
  pieza: Pieza;
  borradorPath: string;
}

/** Instante de publicación de una pieza (hora local de Chile). */
function horaDe(p: Pieza): number {
  return zonedToUtc(p.dia, p.hora).getTime();
}

/**
 * Piezas que hay que renderizar: estado efectivo `planificado` (sin render ok ni
 * fallido, ni publicada/saltada por el bot) y cuya hora aún no llega (nunca se
 * renderiza tarde: el bot ya la marca saltada). Ordenadas por hora de publicación.
 */
export function pendientes(semanas: SemanaLeida[], ahora: Date): PiezaPendiente[] {
  const out: { p: PiezaPendiente; t: number }[] = [];
  for (const s of semanas) {
    for (const pieza of s.plan.piezas) {
      if (estadoEfectivo(pieza, s.render[pieza.id], s.estado[pieza.id]) !== "planificado") continue;
      let t: number;
      try {
        t = horaDe(pieza);
      } catch {
        continue;
      }
      if (t <= ahora.getTime()) continue;
      out.push({ p: { semana: s.semana, pieza, borradorPath: join(semanaDir(s.semana), pieza.borrador) }, t });
    }
  }
  return out.sort((a, b) => a.t - b.t).map((x) => x.p);
}

/** Error de QA o de la puerta (score, audio, slides): `motivos` va tal cual a `render.json`. */
export class ErrorQa extends Error {
  constructor(public motivos: string[]) {
    super(motivos.join(" "));
    this.name = "ErrorQa";
  }
}

export interface Deps {
  /** Renderiza la pieza en `tmp` (y corre el QA). Devuelve los nombres de archivo. Lanza si falla. */
  render: (p: PiezaPendiente, tmp: string) => Promise<{ archivos: string[]; duracionMs?: number }>;
  /** Sube `local/` a `remoto` (`host:dir/semana/id/`, o una ruta local). Lanza si falla. */
  rsync: (local: string, remoto: string) => Promise<void>;
  /** ¿El servidor sirve `url` con 200 y el Content-Type `tipo`? */
  verificar: (url: string, tipo: string) => Promise<boolean>;
  /** Anota la entrada de una pieza (puede acumular y escribir en `confirmar`). */
  escribirRender: (semana: string, id: string, e: RenderEntry) => Promise<void>;
  avisar: (texto: string) => Promise<void>;
  /** Escribe de una vez lo acumulado de una semana (un commit por semana y corrida). */
  confirmar?: (semana: string) => Promise<void>;
  ahora?: () => Date;
  log?: (texto: string) => void;
}

export interface EnvRender {
  /** MEDIA_PUBLIC_BASE */
  base: string;
  /** MEDIA_PUBLIC_TOKEN */
  token: string;
  /** SERVER_HOST; vacío = destino local (pruebas sin ssh). */
  host: string;
  /** SERVER_MEDIA_DIR */
  dir: string;
}

/** Manifiesto de una carpeta final: qué archivos tiene y la duración del reel. No se sube. */
export const MANIFIESTO = ".manifiesto.json";

interface Manifiesto {
  archivos: string[];
  duracionMs?: number;
}

const ARCHIVO_RE = /^[a-z0-9][a-z0-9._-]*\.(jpg|mp4)$/;

/** Manifiesto válido y con todos sus archivos presentes, o undefined (carpeta incompleta o ajena). */
async function leerManifiesto(final: string): Promise<Manifiesto | undefined> {
  try {
    const m = JSON.parse(await readFile(join(final, MANIFIESTO), "utf8")) as Manifiesto;
    if (!Array.isArray(m.archivos) || !m.archivos.length) return undefined;
    if (!m.archivos.every((a) => typeof a === "string" && ARCHIVO_RE.test(a) && existsSync(join(final, a)))) return undefined;
    if (m.duracionMs !== undefined && typeof m.duracionMs !== "number") return undefined;
    return m;
  } catch {
    return undefined;
  }
}

/** Content-Type que debe servir el servidor según la extensión. */
export function tipoDe(archivo: string): string {
  return archivo.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
}

/** `medios` de render.json: reel → urls [mp4] + cover; carrusel → urls de los slides (cover = el primero). */
function armarMedios(formato: Pieza["formato"], m: Manifiesto, url: (a: string) => string): Medios {
  const story = m.archivos.includes("story.jpg") ? url("story.jpg") : undefined;
  if (formato === "reel") {
    return {
      urls: m.archivos.filter((a) => a.endsWith(".mp4")).map(url),
      ...(m.archivos.includes("cover.jpg") ? { cover: url("cover.jpg") } : {}),
      ...(story ? { story } : {}),
      ...(m.duracionMs !== undefined ? { duracionMs: m.duracionMs } : {}),
    };
  }
  const urls = m.archivos.filter((a) => /^\d{2}\.jpg$/.test(a)).sort().map(url);
  return { urls, ...(urls[0] ? { cover: urls[0] } : {}), ...(story ? { story } : {}) };
}

/** Destino de rsync: `host:dir/semana/id/` (o `dir/semana/id/` sin host). */
export function destinoRemoto(env: EnvRender, semana: string, id: string): string {
  const ruta = `${env.dir.replace(/\/+$/, "")}/${semana}/${id}/`;
  return env.host ? `${env.host}:${ruta}` : ruta;
}

function razon(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Procesa las piezas pendientes en orden. Una pieza que falla no corta las demás.
 * - Render o QA falla → `fallido` con el motivo.
 * - rsync o verificación fallan → no escribe nada (sigue planificada), avisa y deja
 *   la carpeta final: la próxima corrida solo reintenta la subida.
 * - La hora pasó mientras se renderizaba → no se sube (el bot la marca saltada).
 * `pendientes` del resultado = piezas que quedan planificadas.
 */
export async function procesar(
  pend: PiezaPendiente[],
  outRoot: string,
  env: EnvRender,
  deps: Deps,
): Promise<{ ok: number; fallidas: number; pendientes: number }> {
  const res = { ok: 0, fallidas: 0, pendientes: 0 };
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? ((t: string) => console.log(t));
  const oculto = (s: string): string => ocultarToken(s, env.token);
  const avisar = async (texto: string): Promise<void> => {
    const t = oculto(texto);
    log(`⚠️  ${t}`);
    try {
      await deps.avisar(t);
    } catch (e) {
      log(`⚠️  No pude enviar el aviso: ${oculto(razon(e))}`);
    }
  };
  const confirmar = async (semana: string): Promise<void> => {
    if (!deps.confirmar) return;
    try {
      await deps.confirmar(semana);
    } catch (e) {
      await avisar(`No pude escribir render.json de ${semana}: ${razon(e)}`);
    }
  };

  let semanaActual: string | undefined;
  for (const [i, p] of pend.entries()) {
    if (semanaActual !== undefined && semanaActual !== p.semana) await confirmar(semanaActual);
    semanaActual = p.semana;
    const { id } = p.pieza;
    const etiqueta = `[${i + 1}/${pend.length}] ${id}`;
    const carpetaSemana = join(outRoot, p.semana);
    const final = join(carpetaSemana, id);
    const en = (): string => ahora().toISOString();

    let manifiesto = await leerManifiesto(final);
    if (manifiesto) {
      log(`${etiqueta} ya renderizada; reintento la subida…`);
    } else {
      // Restos de una corrida cortada (el Mac se durmió): se borran y se renderiza entera.
      await mkdir(carpetaSemana, { recursive: true });
      for (const f of await readdir(carpetaSemana)) {
        if (f.startsWith(`${id}.tmp-`)) await rm(join(carpetaSemana, f), { recursive: true, force: true });
      }
      await rm(final, { recursive: true, force: true });
      if (horaDe(p.pieza) <= ahora().getTime()) {
        log(`${etiqueta} su hora ya pasó: no se renderiza (el bot la marca saltada).`);
        res.pendientes++;
        continue;
      }
      log(`${etiqueta} renderizando…`);
      const tmp = join(carpetaSemana, `${id}.tmp-${process.pid}`);
      await mkdir(tmp, { recursive: true });
      try {
        const r = await deps.render(p, tmp);
        manifiesto = { archivos: r.archivos, ...(r.duracionMs !== undefined ? { duracionMs: r.duracionMs } : {}) };
        await writeFile(join(tmp, MANIFIESTO), JSON.stringify(manifiesto), "utf8");
        await rename(tmp, final);
      } catch (e) {
        await rm(tmp, { recursive: true, force: true });
        const motivo = oculto(e instanceof ErrorQa ? e.motivos.join(" ") : razon(e));
        log(`✗ ${etiqueta} fallida: ${motivo}`);
        await deps.escribirRender(p.semana, id, { estado: "fallido", motivo, en: en() });
        res.fallidas++;
        continue;
      }
    }

    if (horaDe(p.pieza) <= ahora().getTime()) {
      log(`${etiqueta} su hora ya pasó mientras se renderizaba: no se sube (el bot la marca saltada).`);
      res.pendientes++;
      continue;
    }

    log(`${etiqueta} subiendo…`);
    try {
      await deps.rsync(final, destinoRemoto(env, p.semana, id));
    } catch (e) {
      await avisar(`No pude subir ${id} (${p.semana}) al servidor: ${razon(e)}. El render quedó en el Mac; la próxima corrida reintenta sin volver a renderizar.`);
      res.pendientes++;
      continue;
    }

    const url = (a: string): string => urlPublica(env.base, env.token, p.semana, id, a);
    const caidas: string[] = [];
    for (const a of manifiesto.archivos) {
      let ok = false;
      try {
        ok = await deps.verificar(url(a), tipoDe(a));
      } catch {
        ok = false;
      }
      if (!ok) caidas.push(url(a));
    }
    if (caidas.length) {
      await avisar(`El servidor no sirve ${caidas.join(", ")} (${id}). Queda planificada; la próxima corrida reintenta la subida.`);
      res.pendientes++;
      continue;
    }

    await deps.escribirRender(p.semana, id, { estado: "renderizado", medios: armarMedios(p.pieza.formato, manifiesto, url), en: en() });
    log(`✓ ${etiqueta} renderizada y subida.`);
    res.ok++;
  }
  if (semanaActual !== undefined) await confirmar(semanaActual);
  return res;
}

// --- Efectos reales (los usa render-cli.ts) ---

const BORRADOR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

/**
 * Lee un borrador por nombre, SOLO dentro de la carpeta de su semana: sin `/`, sin
 * `..`, y su ruta real (resueltos los symlinks) debe estar en esa carpeta.
 */
export async function leerBorradorSeguro(semana: string, nombre: string): Promise<string> {
  if (!BORRADOR_RE.test(nombre) || nombre.includes("..")) {
    throw new Error(`Ruta de borrador inválida (debe ser un .json dentro de la carpeta de la semana): ${JSON.stringify(nombre)}`);
  }
  const dir = await realpath(semanaDir(semana));
  let real: string;
  try {
    real = await realpath(join(dir, nombre));
  } catch {
    throw new Error(`No existe el borrador ${nombre} en _calendario/${semana}/.`);
  }
  if (dirname(real) !== dir) throw new Error(`El borrador ${nombre} apunta fuera de la carpeta de la semana.`);
  return readFile(real, "utf8");
}

/** Ritmo de lectura del QA desde `_calendario/config.json → puerta.<clave>.valor` (por defecto 2.5 y 1.5). */
export async function leerPuerta(): Promise<Puerta> {
  const puerta: Puerta = { lecturaPalabrasPorSegundo: 2.5, lecturaMinSegundos: 1.5 };
  try {
    const cfg = JSON.parse(await readFile(join(calendarioDir(), "config.json"), "utf8"));
    const wps = cfg?.puerta?.lecturaPalabrasPorSegundo?.valor;
    const min = cfg?.puerta?.lecturaMinSegundos?.valor;
    if (typeof wps === "number" && wps > 0) puerta.lecturaPalabrasPorSegundo = wps;
    if (typeof min === "number" && min >= 0) puerta.lecturaMinSegundos = min;
  } catch {
    // Sin config o corrupta: valores por defecto.
  }
  return puerta;
}

/** Ejecuta ffmpeg (sin shell, timeout 2 min). Lanza un Error en español si falla. */
function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { timeout: 120_000 });
  if (r.error) throw new Error(`ffmpeg no se pudo ejecutar: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg falló: ${String(r.stderr).trim().split("\n").pop()}`);
}

/** Story 1080×1920: un solo slide StoryCover en un viewport 9:16 (renderCarousel usa 4:5). */
async function renderStory(b: ReturnType<typeof parseBorrador>, png: string): Promise<void> {
  const spec = storySpec(b);
  const slide = spec.slides[0];
  const props = { ...spec.defaults, ...slide.props };
  props.background = await resolveBackground(props.background);
  const r = new Renderer();
  await r.init(FORMATS.reel);
  try {
    await writeFile(png, await r.render(createElement(slide.template, props)));
  } finally {
    await r.close();
  }
}

/**
 * Render real de una pieza en `tmp`: borrador (solo de la carpeta de su semana) →
 * score ≥ 75 → carrusel (JPEG 1080×1350) o reel (MP4 con audio + cover del cuadro 0)
 * → story 1080×1920 → QA. Cualquier problema editorial lanza `ErrorQa` con motivos.
 */
export async function renderPieza(p: PiezaPendiente, tmp: string, opts: { audioDir: string; puerta: Puerta }): Promise<{ archivos: string[]; duracionMs?: number }> {
  const b = parseBorrador(await leerBorradorSeguro(p.semana, p.pieza.borrador));
  const score = scoreDraft(b);
  if (score.total < THRESHOLD) throw new ErrorQa([`Score ${score.total} < ${THRESHOLD}.`, ...score.suggestions]);

  // Los motores escriben en <cwd>/<outDir>/<name>/: se les da una ruta relativa dentro de tmp.
  const trabajo = join(tmp, ".trabajo");
  const outDir = relative(process.cwd(), trabajo);
  const archivos: string[] = [];
  const motivos: string[] = [];
  let duracionMs: number | undefined;

  if (p.pieza.formato === "carrusel") {
    const spec = borradorASpec(b);
    if (spec.slides.length > 10) throw new ErrorQa([`El carrusel tiene ${spec.slides.length} slides; el máximo es 10.`]);
    const pngs = await renderCarousel(spec, { outDir });
    pngs.forEach((png, i) => {
      const jpg = `${String(i + 1).padStart(2, "0")}.jpg`;
      ffmpeg(["-i", png, "-q:v", "2", join(tmp, jpg)]);
      archivos.push(jpg);
    });
    const qa = await qaImagen(join(tmp, "01.jpg"), FORMATS.post.width, FORMATS.post.height);
    motivos.push(...qa.motivos.map((m) => `Portada: ${m}`));
  } else {
    if (!b.audio) throw new ErrorQa(["El reel no tiene `audio` (debe ir con una pista de promo/audio/)."]);
    if (/[/\\]/.test(b.audio) || b.audio.includes("..") || b.audio.startsWith(".")) {
      throw new ErrorQa([`La pista de audio ${JSON.stringify(b.audio)} debe ser un nombre de archivo de promo/audio/ (sin / ni ..).`]);
    }
    const audio = join(opts.audioDir, b.audio);
    if (!existsSync(audio)) throw new ErrorQa([`No existe la pista de audio ${b.audio} en promo/audio/.`]);
    const spec = borradorASpec(b, { format: "reel" });
    const r = await renderReelResult(spec, { outDir, pace: b.pace, audio, logoEnCuadro0: b.logoEnCuadro0 });
    await rename(r.path, join(tmp, "reel.mp4"));
    ffmpeg(["-ss", "0", "-i", join(tmp, "reel.mp4"), "-frames:v", "1", "-q:v", "2", join(tmp, "cover.jpg")]);
    archivos.push("reel.mp4", "cover.jpg");
    duracionMs = r.durationMs;
    const qa = await qaReel(join(tmp, "reel.mp4"), join(tmp, "cover.jpg"), spec, opts.puerta);
    motivos.push(...qa.motivos);
  }

  await mkdir(trabajo, { recursive: true });
  const storyPng = join(trabajo, "story.png");
  await renderStory(b, storyPng);
  ffmpeg(["-i", storyPng, "-q:v", "2", join(tmp, "story.jpg")]);
  archivos.push("story.jpg");
  const qs = await qaImagen(join(tmp, "story.jpg"), FORMATS.reel.width, FORMATS.reel.height);
  motivos.push(...qs.motivos.map((m) => `Story: ${m}`));

  await rm(trabajo, { recursive: true, force: true });
  if (motivos.length) throw new ErrorQa(motivos);
  return { archivos, ...(duracionMs !== undefined ? { duracionMs } : {}) };
}

/** Comilla simple para el shell remoto. */
const sq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * rsync real: `rsync -az --chmod=u=rwX,go=rX -e "ssh -o BatchMode=yes" <local>/ host:dir/semana/id/`.
 * El rsync del Mac (openrsync) rechaza `--chmod=F644,D755`; `u=rwX,go=rX` da lo mismo
 * (archivos 644, carpetas 755) y GNU rsync del servidor lo entiende. Tampoco tiene
 * `--mkpath`: la carpeta remota se crea con
 * `--rsync-path="mkdir -p … && rsync"`. Destino sin `host:` → copia local (pruebas).
 */
export function rsyncReal(local: string, remoto: string): Promise<void> {
  const m = /^([^:/]+):(.+)$/.exec(remoto);
  const args = ["-az", "--chmod=u=rwX,go=rX", `--exclude=${MANIFIESTO}`, "--timeout=120"];
  return (async () => {
    if (m) {
      args.push("-e", "ssh -o BatchMode=yes -o ConnectTimeout=20", `--rsync-path=mkdir -p ${sq(m[2])} && rsync`);
    } else {
      await mkdir(remoto, { recursive: true });
    }
    args.push(`${local.replace(/\/+$/, "")}/`, remoto);
    await new Promise<void>((resolveP, reject) => {
      const proc = spawn("rsync", args, { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      const t = setTimeout(() => proc.kill("SIGTERM"), 15 * 60_000);
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("error", (e) => {
        clearTimeout(t);
        reject(new Error(`no se pudo ejecutar rsync: ${e.message}`));
      });
      proc.on("close", (code) => {
        clearTimeout(t);
        if (code === 0) resolveP();
        else reject(new Error(`rsync terminó con código ${code}: ${err.trim().split("\n").slice(-2).join(" ")}`));
      });
    });
  })();
}

/** HEAD a la URL pública: 200 y el Content-Type esperado. Nunca lanza. */
export async function verificarReal(url: string, tipo: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    return r.status === 200 && (r.headers.get("content-type") ?? "").toLowerCase().startsWith(tipo);
  } catch {
    return false;
  }
}

/**
 * Escritor de `render.json` (único archivo que escribe el Mac): acumula las entradas
 * de la corrida y, por semana, trae la base (`pullKb`), lee el render.json FRESCO,
 * fusiona, escribe (tmp + rename) y hace un solo commit (push con rebase si
 * `KB_GIT_PUSH=1`). Si el pull choca, escribe igual: el commit sube en la próxima.
 */
export function crearEscritorRender(opts: { avisar: (texto: string) => Promise<void> }): Pick<Deps, "escribirRender" | "confirmar"> & { confirmar: (semana: string) => Promise<void> } {
  const buffer = new Map<string, Record<string, RenderEntry>>();
  return {
    escribirRender: async (semana, id, e) => {
      const m = buffer.get(semana) ?? {};
      m[id] = e;
      buffer.set(semana, m);
    },
    confirmar: async (semana) => {
      const nuevas = buffer.get(semana);
      if (!nuevas || !Object.keys(nuevas).length) return;
      buffer.delete(semana);
      const pull = await pullKb();
      if (pull.error) await opts.avisar(`No pude traer la base antes de escribir render.json de ${semana} (${pull.error}); escribo igual y se sube en la próxima corrida.`);
      const archivo = join(semanaDir(semana), "render.json");
      let actual: Record<string, unknown> = {};
      try {
        const raw = JSON.parse(await readFile(archivo, "utf8"));
        if (raw && typeof raw === "object" && !Array.isArray(raw)) actual = raw;
        else console.warn(`[calendario] ${archivo} no es un objeto; se reemplaza.`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[calendario] ${archivo} corrupto; se reemplaza.`);
      }
      const merged = { ...actual, ...nuevas };
      await mkdir(dirname(archivo), { recursive: true });
      const tmp = `${archivo}.tmp-${process.pid}`;
      await writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      await rename(tmp, archivo);
      const n = Object.keys(nuevas).length;
      await commitPaths([archivo], `calendario: render ${semana} (${n} ${n === 1 ? "pieza" : "piezas"})`);
    },
  };
}

function gitEn(cwd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolveP) => {
    const proc = spawn("git", args, { cwd });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolveP({ code: -1, out }));
    proc.on("close", (code) => resolveP({ code: code ?? -1, out }));
  });
}

/**
 * Recupera lo que una corrida anterior dejó a medias (el Mac se durmió o no había red):
 * commitea los `render.json` escritos y no commiteados, y si la base quedó adelante de
 * su remoto, hace push. Sin esto, una pieza ya anotada como renderizada (que ya no es
 * pendiente) nunca llegaría al servidor. Devuelve el error del push, si lo hubo.
 */
export async function sincronizarPendiente(semanas: string[]): Promise<string | undefined> {
  if (process.env.KB_GIT === "0") return undefined;
  for (const s of semanas) {
    const archivo = join(semanaDir(s), "render.json");
    if (existsSync(archivo)) await commitPaths([archivo], `calendario: render ${s} (recuperado)`);
  }
  if (process.env.KB_GIT_PUSH !== "1") return undefined;
  const adelante = await gitEn(dirname(calendarioDir()), ["rev-list", "--count", "@{u}..HEAD"]);
  if (adelante.code !== 0 || Number(adelante.out.trim()) === 0) return undefined;
  const push = await gitEn(dirname(calendarioDir()), ["push"]);
  return push.code === 0 ? undefined : push.out.trim().split("\n").pop() || "git push falló";
}

/** ¿Vive el proceso? (EPERM = vive, pero de otro usuario). */
function vive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Un candado de más de 6 h es de una corrida colgada o de un PID reciclado. */
const CANDADO_MAX_MS = 6 * 3_600_000;

/**
 * Candado con PID (`output/calendario/.lock`): launchd puede solapar corridas. Devuelve
 * la función que lo suelta, o undefined si otra corrida viva lo tiene. Un candado de un
 * PID muerto, ilegible o muy viejo se recupera.
 */
export async function tomarCandado(path: string): Promise<(() => Promise<void>) | undefined> {
  await mkdir(dirname(path), { recursive: true });
  for (let intento = 0; intento < 2; intento++) {
    try {
      const fh = await open(path, "wx");
      await fh.writeFile(`${process.pid}\n`);
      await fh.close();
      return async () => {
        try {
          if ((await readFile(path, "utf8")).trim() === String(process.pid)) await unlink(path);
        } catch {
          // ya no estaba
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    let pid = NaN;
    let edad = 0;
    try {
      pid = Number((await readFile(path, "utf8")).trim());
      edad = Date.now() - (await stat(path)).mtimeMs;
    } catch {
      // se soltó entre medio: reintenta
    }
    if (Number.isInteger(pid) && pid > 0 && vive(pid) && edad < CANDADO_MAX_MS) return undefined;
    await rm(path, { force: true });
  }
  return undefined;
}
