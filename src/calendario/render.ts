import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createElement } from "react";
import { abortStaleRebase, commitPaths, kbDir, pullKb } from "../kb/store.ts";
import { scoreDraft } from "../remix/registry.ts";
import { THRESHOLD } from "../score/virality.ts";
import { renderCarousel } from "../render/renderCarousel.ts";
import { Renderer } from "../render/renderSlide.ts";
import { resolveBackground } from "../render/background.ts";
import { renderReelResult } from "../reel/renderReel.ts";
import { FORMATS } from "../templates/types.ts";
import { borradorASpec, parseBorrador, storySpec, type Borrador } from "./draft.ts";
import {
  calendarioDir, estadoEfectivo, leerSemana, ocultarToken, semanaDir, urlPublica,
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

/**
 * Error de CONTENIDO (QA que no pasa, score < 75, borrador inválido o fuera de la
 * semana, audio inválido, > 10 slides): la pieza queda `fallido` (terminal) y
 * `motivos` va tal cual a `render.json`. Cualquier otro error (Chromium no arranca,
 * falta ffmpeg, disco lleno, red) es del ENTORNO: la pieza sigue planificada y se
 * reintenta en la próxima corrida (R31).
 */
export class ErrorContenido extends Error {
  constructor(public motivos: string[]) {
    super(motivos.join(" "));
    this.name = "ErrorContenido";
  }
}

const SEMANA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9-]{3,80}$/;

/**
 * SERVER_MEDIA_DIR admitido (R34): solo letras, números, `_ . / -`, sin `..`. Sin
 * espacios, `~`, `$` ni comillas: la ruta pasa por el shell remoto de ssh.
 */
export function dirMediosValido(dir: string): boolean {
  return /^[A-Za-z0-9_./-]+$/.test(dir) && !dir.split("/").includes("..");
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
 * - Error de contenido (`ErrorContenido`: QA, score, borrador, audio) → `fallido` con el motivo.
 * - Error del entorno en el render (Chromium, ffmpeg, disco) → avisa y sigue planificada.
 * - rsync o verificación fallan → no escribe nada (sigue planificada), avisa y deja
 *   la carpeta final: la próxima corrida solo reintenta la subida.
 * - La hora pasó (antes de subir o durante la subida) → no se anota (el bot la marca saltada).
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
    // Defensa propia: semana e id son nombres de carpeta y van al comando remoto.
    if (!SEMANA_RE.test(p.semana) || !ID_RE.test(id)) {
      await avisar(`Pieza ignorada: semana o id inválidos (${JSON.stringify(p.semana)}, ${JSON.stringify(id)}).`);
      continue;
    }
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
        if (!(e instanceof ErrorContenido)) {
          await avisar(`No pude renderizar ${id} (${p.semana}) por un problema del Mac: ${razon(e)}. Sigue planificada; la próxima corrida reintenta.`);
          res.pendientes++;
          continue;
        }
        const motivo = oculto(e.motivos.join(" "));
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

    // La subida pudo cruzar la hora (rsync con timeout de 15 min): a su hora no tenía render.
    if (horaDe(p.pieza) <= ahora().getTime()) {
      log(`${etiqueta} su hora pasó durante la subida: no se anota (el bot la marca saltada).`);
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
    throw new ErrorContenido([`Ruta de borrador inválida (debe ser un .json dentro de la carpeta de la semana): ${JSON.stringify(nombre)}`]);
  }
  const dir = await realpath(semanaDir(semana));
  let real: string;
  try {
    real = await realpath(join(dir, nombre));
  } catch {
    throw new ErrorContenido([`No existe el borrador ${nombre} en _calendario/${semana}/.`]);
  }
  if (dirname(real) !== dir) throw new ErrorContenido([`El borrador ${nombre} apunta fuera de la carpeta de la semana.`]);
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

/** Tope de fondos `ai` por semana (constraints) y plantillas donde se admiten. */
export const FONDOS_IA_MAX_SEMANA = 3;
const PLANTILLAS_IA = new Set(["Hook", "Cta"]);

/**
 * Fondos `ai` que el Mac NO genera (R35), por pieza: índices de slide. Recorre todas
 * las piezas del plan en orden de día y hora (también las ya renderizadas, para que el
 * reparto sea el mismo en cada corrida); un `ai` fuera de Hook/Cta, o más allá del
 * tercero de la semana, se quita. Un borrador ilegible no cuenta (fallará al renderizar).
 */
export async function fondosIaQuitados(semana: string): Promise<Map<string, { slide: number; motivo: string }[]>> {
  const out = new Map<string, { slide: number; motivo: string }[]>();
  let s: SemanaLeida | undefined;
  try {
    s = await leerSemana(semana);
  } catch {
    return out;
  }
  if (!s) return out;
  const orden = [...s.plan.piezas].sort((a, b) => {
    try {
      return horaDe(a) - horaDe(b);
    } catch {
      return 0;
    }
  });
  let usados = 0;
  for (const pieza of orden) {
    let b: Borrador;
    try {
      b = parseBorrador(await leerBorradorSeguro(semana, pieza.borrador));
    } catch {
      continue;
    }
    b.slides.forEach((slide, i) => {
      if (!slide.background?.ai) return;
      let motivo: string | undefined;
      if (!PLANTILLAS_IA.has(slide.template)) motivo = `fondo ai en ${slide.template} (solo se admite en Hook o Cta)`;
      else if (usados >= FONDOS_IA_MAX_SEMANA) motivo = `pasa el tope de ${FONDOS_IA_MAX_SEMANA} fondos ai por semana`;
      else usados++;
      if (motivo) out.set(pieza.id, [...(out.get(pieza.id) ?? []), { slide: i, motivo }]);
    });
  }
  return out;
}

/**
 * Render real de una pieza en `tmp`: borrador (solo de la carpeta de su semana) →
 * score ≥ 75 → tope de fondos ai → carrusel (JPEG 1080×1350) o reel (MP4 con audio +
 * cover del cuadro 0) → story 1080×1920 → QA. Todo problema editorial lanza
 * `ErrorContenido`; los del entorno (Chromium, ffmpeg, disco) lanzan Error normal.
 */
export async function renderPieza(
  p: PiezaPendiente,
  tmp: string,
  opts: { audioDir: string; puerta: Puerta; avisar?: (texto: string) => Promise<void> },
): Promise<{ archivos: string[]; duracionMs?: number }> {
  const texto = await leerBorradorSeguro(p.semana, p.pieza.borrador);
  let b: Borrador;
  try {
    b = parseBorrador(texto);
  } catch (e) {
    throw new ErrorContenido([razon(e)]);
  }
  // Tope de fondos ai: los que sobran vuelven al fondo por defecto del look lima.
  const quitar = (await fondosIaQuitados(p.semana)).get(p.pieza.id) ?? [];
  if (quitar.length) {
    for (const { slide } of quitar) delete b.slides[slide].background;
    const texto = `Fondo ai quitado en ${p.pieza.id} (${p.semana}): ${quitar.map((q) => `slide ${q.slide + 1}, ${q.motivo}`).join("; ")}. Va con el fondo por defecto.`;
    if (opts.avisar) await opts.avisar(texto).catch(() => {});
    else console.warn(`⚠️  ${texto}`);
  }
  const score = scoreDraft(b);
  if (score.total < THRESHOLD) throw new ErrorContenido([`Score ${score.total} < ${THRESHOLD}.`, ...score.suggestions]);

  // Los motores escriben en <cwd>/<outDir>/<name>/: se les da una ruta relativa dentro de tmp.
  const trabajo = join(tmp, ".trabajo");
  const outDir = relative(process.cwd(), trabajo);
  const archivos: string[] = [];
  const motivos: string[] = [];
  let duracionMs: number | undefined;

  if (p.pieza.formato === "carrusel") {
    const spec = borradorASpec(b);
    if (spec.slides.length > 10) throw new ErrorContenido([`El carrusel tiene ${spec.slides.length} slides; el máximo es 10.`]);
    const pngs = await renderCarousel(spec, { outDir });
    pngs.forEach((png, i) => {
      const jpg = `${String(i + 1).padStart(2, "0")}.jpg`;
      ffmpeg(["-i", png, "-q:v", "2", join(tmp, jpg)]);
      archivos.push(jpg);
    });
    const qa = await qaImagen(join(tmp, "01.jpg"), FORMATS.post.width, FORMATS.post.height);
    motivos.push(...qa.motivos.map((m) => `Portada: ${m}`));
  } else {
    if (!b.audio) throw new ErrorContenido(["El reel no tiene `audio` (debe ir con una pista de promo/audio/)."]);
    if (/[/\\]/.test(b.audio) || b.audio.includes("..") || b.audio.startsWith(".")) {
      throw new ErrorContenido([`La pista de audio ${JSON.stringify(b.audio)} debe ser un nombre de archivo de promo/audio/ (sin / ni ..).`]);
    }
    const audio = join(opts.audioDir, b.audio);
    if (!existsSync(audio)) throw new ErrorContenido([`No existe la pista de audio ${b.audio} en promo/audio/.`]);
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
  if (motivos.length) throw new ErrorContenido(motivos);
  return { archivos, ...(duracionMs !== undefined ? { duracionMs } : {}) };
}


/**
 * Escapa para el shell remoto todo carácter fuera de `[A-Za-z0-9_./-]` con `\`. openrsync
 * (el rsync del Mac) parte `--rsync-path` en palabras y pasa la ruta remota tal cual a
 * ssh, que las vuelve a unir para el shell del servidor: las comillas simples no
 * sobreviven como tales, la barra invertida sí (probado con un ssh que registra argv).
 * El CLI además rechaza un SERVER_MEDIA_DIR con caracteres raros (R34).
 */
export const escaparShell = (s: string): string => s.replace(/[^A-Za-z0-9_./-]/g, (c) => `\\${c}`);

/** El rsync del sistema (openrsync): su forma de pasar la ruta remota es la que se escapa arriba. */
const RSYNC = existsSync("/usr/bin/rsync") ? "/usr/bin/rsync" : "rsync";

/**
 * rsync real: `rsync -az --chmod=u=rwX,go=rX -e "ssh -o BatchMode=yes" <local>/ host:dir/semana/id/`.
 * El rsync del Mac (openrsync) rechaza `--chmod=F644,D755`; `u=rwX,go=rX` da lo mismo
 * (archivos 644, carpetas 755) y GNU rsync del servidor lo entiende. Tampoco tiene
 * `--mkpath`: la carpeta remota se crea con `--rsync-path="mkdir -p … && rsync"`.
 * Destino sin `host:` → copia local (pruebas).
 */
export function rsyncReal(local: string, remoto: string): Promise<void> {
  const m = /^([^:/]+):(.+)$/.exec(remoto);
  const args = ["-az", "--chmod=u=rwX,go=rX", `--exclude=${MANIFIESTO}`, "--timeout=120"];
  return (async () => {
    let destino = remoto;
    if (m) {
      const ruta = escaparShell(m[2]);
      args.push("-e", "ssh -o BatchMode=yes -o ConnectTimeout=20", `--rsync-path=mkdir -p ${ruta} && rsync`);
      destino = `${m[1]}:${ruta}`;
    } else {
      await mkdir(remoto, { recursive: true });
    }
    args.push(`${local.replace(/\/+$/, "")}/`, destino);
    await new Promise<void>((resolveP, reject) => {
      const proc = spawn(RSYNC, args, { stdio: ["ignore", "ignore", "pipe"] });
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

// --- render.json en la base (git) ---

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

const ultimaLinea = (s: string): string => s.trim().split("\n").pop() ?? "";
const lineas = (s: string): string[] => s.split("\n").map((l) => l.trim()).filter(Boolean);
/** render.json de una semana, relativo a la raíz del repo. */
const RENDER_REL_RE = /(?:^|\/)_calendario\/(\d{4}-\d{2}-\d{2})\/render\.json$/;
const ASUNTO_RENDER = "calendario: render ";
const REINTENTOS_PUSH = 3;

type Entradas = Record<string, unknown>;

function parsearMapa(texto: string | undefined, origen: string): Entradas {
  if (texto === undefined) return {};
  try {
    const raw = JSON.parse(texto);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Entradas;
    console.warn(`[calendario] ${origen} no es un objeto; se reemplaza.`);
  } catch {
    console.warn(`[calendario] ${origen} corrupto; se reemplaza.`);
  }
  return {};
}

async function leerSiExiste(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Aplica `entradas` sobre el render.json que hay en disco (tmp + rename). Devuelve la ruta. */
async function aplicarEntradas(semana: string, entradas: Entradas): Promise<string> {
  const archivo = join(semanaDir(semana), "render.json");
  const actual = parsearMapa(await leerSiExiste(archivo), archivo);
  await mkdir(dirname(archivo), { recursive: true });
  const tmp = `${archivo}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify({ ...actual, ...entradas }, null, 2)}\n`, "utf8");
  await rename(tmp, archivo);
  return archivo;
}

/** Commit local de un solo archivo. */
async function commitArchivo(root: string, archivo: string, n: number, semana: string): Promise<boolean> {
  const rel = relative(root, await realpath(archivo));
  if ((await gitEn(root, ["add", "--", rel])).code !== 0) return false;
  const msg = `${ASUNTO_RENDER}${semana} (${n} ${n === 1 ? "pieza" : "piezas"})`;
  return (await gitEn(root, ["commit", "-m", msg, "--", rel])).code === 0;
}

/** Escribe y commitea (local) cada semana. */
async function escribirLocal(root: string | undefined, todas: Map<string, Entradas>): Promise<void> {
  for (const [semana, entradas] of todas) {
    const n = Object.keys(entradas).length;
    if (!n) continue;
    const archivo = await aplicarEntradas(semana, entradas);
    if (root) await commitArchivo(root, archivo, n, semana);
  }
}

function combinar(a: Map<string, Entradas>, b: Map<string, Entradas>): Map<string, Entradas> {
  const out = new Map<string, Entradas>();
  for (const m of [a, b]) for (const [s, e] of m) out.set(s, { ...(out.get(s) ?? {}), ...e });
  return out;
}

/**
 * Entradas de render.json que este Mac escribió y el remoto no tiene: lo cambiado desde
 * el merge-base (commits sin subir, archivos sin commit o nuevos). Las del remoto que el
 * Mac aún no trae no cuentan (no se pisan con una versión vieja).
 */
async function entradasLocales(root: string): Promise<Map<string, Entradas>> {
  const out = new Map<string, Entradas>();
  const mb = await gitEn(root, ["merge-base", "HEAD", "@{u}"]);
  if (mb.code !== 0) return out;
  const base = mb.out.trim();
  const rels = new Set<string>();
  for (const args of [["diff", "--name-only", base, "HEAD"], ["diff", "--name-only", "HEAD"], ["ls-files", "--others", "--exclude-standard"]]) {
    const r = await gitEn(root, args);
    if (r.code === 0) for (const l of lineas(r.out)) if (RENDER_REL_RE.test(l)) rels.add(l);
  }
  for (const rel of rels) {
    const semana = RENDER_REL_RE.exec(rel)![1];
    const local = parsearMapa(await leerSiExiste(join(root, rel)), rel);
    const show = await gitEn(root, ["show", `${base}:${rel}`]);
    const previo = show.code === 0 ? parsearMapa(show.out, `${rel} (remoto)`) : {};
    const cambiadas: Entradas = {};
    for (const [id, e] of Object.entries(local)) if (JSON.stringify(e) !== JSON.stringify(previo[id])) cambiadas[id] = e;
    if (Object.keys(cambiadas).length) out.set(semana, cambiadas);
  }
  return out;
}

/**
 * Deja la rama local igual al remoto recién traído (R33). Solo descarta commits locales
 * si TODOS son commits de render.json de este Mac (sus entradas ya se capturaron); si
 * hay otros, avisa y no toca nada. Devuelve el motivo si no pudo alinear.
 */
async function alinearConRemoto(root: string): Promise<string | undefined> {
  const adelante = Number((await gitEn(root, ["rev-list", "--count", "@{u}..HEAD"])).out.trim()) || 0;
  if (adelante > 0) {
    const asuntos = lineas((await gitEn(root, ["log", "--format=%s", "@{u}..HEAD"])).out);
    const archivos = lineas((await gitEn(root, ["diff", "--name-only", "@{u}...HEAD"])).out);
    if (!asuntos.every((s) => s.startsWith(ASUNTO_RENDER)) || !archivos.every((f) => RENDER_REL_RE.test(f))) {
      return "la base del Mac tiene commits sin subir que no son de render.json; no los toco (revísalos con git log @{u}..HEAD)";
    }
  }
  // Los render.json locales sin commit ya están capturados: se descartan para alinear.
  const sucios = lineas((await gitEn(root, ["diff", "--name-only", "HEAD"])).out).filter((f) => RENDER_REL_RE.test(f));
  if (sucios.length) await gitEn(root, ["checkout", "HEAD", "--", ...sucios]);
  const nuevos = lineas((await gitEn(root, ["ls-files", "--others", "--exclude-standard"])).out).filter((f) => RENDER_REL_RE.test(f));
  for (const f of nuevos) await rm(join(root, f), { force: true });
  if (adelante > 0) {
    // Equivale a `reset --hard @{u}` para estos commits, pero conserva otros cambios sin commit del usuario.
    const r = await gitEn(root, ["reset", "-q", "--keep", "@{u}"]);
    if (r.code !== 0) return `no pude alinear la base con el remoto: ${ultimaLinea(r.out)}`;
  }
  const atras = Number((await gitEn(root, ["rev-list", "--count", "HEAD..@{u}"])).out.trim()) || 0;
  if (atras > 0) {
    const p = await pullKb();
    if (p.error) return `no pude traer la base: ${p.error}`;
  }
  return undefined;
}

/**
 * Sube entradas de render.json re-aplicándolas sobre un pull fresco (R33), nunca con
 * merge de git: fetch → captura lo local pendiente → alinea con el remoto → lee el
 * render.json remoto → aplica → un commit por semana → push. Si el push falla (el
 * remoto avanzó entre medio), repite hasta 3 veces. Sin push posible, lo deja
 * commiteado en local (la próxima corrida lo sube). Devuelve el error, si quedó alguno.
 */
async function subirRender(nuevas: Map<string, Entradas>): Promise<string | undefined> {
  if (process.env.KB_GIT === "0") {
    await escribirLocal(undefined, nuevas);
    return undefined;
  }
  const top = await gitEn(kbDir(), ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    await escribirLocal(undefined, nuevas);
    return undefined;
  }
  const root = top.out.trim();
  const conRemoto = (await gitEn(root, ["rev-parse", "--abbrev-ref", "@{u}"])).code === 0;
  if (process.env.KB_GIT_PUSH !== "1" || !conRemoto) {
    await escribirLocal(root, nuevas);
    return undefined;
  }
  await abortStaleRebase();
  let error = "";
  let locales = new Map<string, Entradas>();
  for (let intento = 1; intento <= REINTENTOS_PUSH; intento++) {
    const f = await gitEn(root, ["fetch", "-q"]);
    if (f.code !== 0) {
      error = `git fetch falló: ${ultimaLinea(f.out)}`;
      break;
    }
    locales = combinar(locales, await entradasLocales(root));
    const al = await alinearConRemoto(root);
    if (al) {
      error = al;
      break;
    }
    const todas = combinar(locales, nuevas);
    if (![...todas.values()].some((e) => Object.keys(e).length)) return undefined;
    await escribirLocal(root, todas);
    const push = await gitEn(root, ["push", "-q"]);
    if (push.code === 0) return undefined;
    error = `git push falló: ${ultimaLinea(push.out)}`;
  }
  // No se pudo subir: que al menos quede escrito y commiteado en local.
  const todas = combinar(locales, nuevas);
  const pendienteLocal = (await entradasLocales(root));
  const faltan = new Map<string, Entradas>();
  for (const [s, e] of todas) {
    const ya = pendienteLocal.get(s) ?? {};
    const resto: Entradas = {};
    for (const [id, v] of Object.entries(e)) if (JSON.stringify(ya[id]) !== JSON.stringify(v)) resto[id] = v;
    if (Object.keys(resto).length) faltan.set(s, resto);
  }
  await escribirLocal(root, faltan);
  return error || "no pude subir render.json";
}

/**
 * Escritor de `render.json` (único archivo que escribe el Mac): acumula las entradas de
 * la corrida y, por semana, las sube con `subirRender` (un solo commit por semana).
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
      const err = await subirRender(new Map([[semana, nuevas as Entradas]]));
      if (err) await opts.avisar(`No pude subir render.json de ${semana} a la base (${err}). Quedó en el Mac; la próxima corrida reintenta.`);
    },
  };
}

/**
 * Recupera lo que una corrida anterior dejó a medias (el Mac se durmió, no había red o
 * el remoto cambió entre el pull y el push): re-aplica sobre el remoto las entradas de
 * render.json escritas o commiteadas y sin subir. Sin esto, una pieza ya anotada (que
 * ya no es pendiente) nunca llegaría al servidor. Devuelve el error, si lo hubo.
 */
export async function sincronizarPendiente(semanas: string[]): Promise<string | undefined> {
  if (process.env.KB_GIT === "0") return undefined;
  if (process.env.KB_GIT_PUSH !== "1") {
    for (const s of semanas) {
      const archivo = join(semanaDir(s), "render.json");
      if (existsSync(archivo)) await commitPaths([archivo], `${ASUNTO_RENDER}${s} (recuperado)`);
    }
    return undefined;
  }
  return subirRender(new Map());
}

// --- candado ---

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
 * la función que lo suelta, o undefined si otra corrida viva lo tiene. Se toma con
 * `open(…, "wx")` (atómico). Uno muerto (PID muerto, ilegible o muy viejo) se recupera
 * renombrándolo a un nombre único (atómico) y comprobando que lo renombrado es el mismo
 * candado muerto que se leyó; si era el candado nuevo de otra corrida, se le devuelve.
 * Así, de dos corridas que ven el mismo candado muerto, gana una sola.
 */
export async function tomarCandado(path: string): Promise<(() => Promise<void>) | undefined> {
  await mkdir(dirname(path), { recursive: true });
  for (let intento = 0; intento < 4; intento++) {
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
    let visto: string;
    let edad = 0;
    try {
      visto = await readFile(path, "utf8");
      edad = Date.now() - (await stat(path)).mtimeMs;
    } catch {
      continue; // se soltó entre medio: reintenta
    }
    const pid = Number(visto.trim());
    if (Number.isInteger(pid) && pid > 0 && vive(pid) && edad < CANDADO_MAX_MS) return undefined;
    const robado = `${path}.muerto-${process.pid}-${randomUUID()}`;
    try {
      await rename(path, robado);
    } catch {
      continue; // otra corrida lo recuperó antes
    }
    const contenido = await readFile(robado, "utf8").catch(() => "");
    if (contenido !== visto) {
      // Era el candado recién tomado por otra corrida: se le devuelve (link no pisa uno existente).
      await link(robado, path).catch(() => {});
    }
    await rm(robado, { force: true });
  }
  return undefined;
}
