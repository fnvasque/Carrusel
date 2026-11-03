import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { hashHistoria } from "./aprobacion.ts";
import { hallazgosSensibles } from "./filtro.ts";
import { historiaAHtml, renderPdf } from "./pdf.ts";
import { borradorASpec, parseBorrador, type Borrador } from "../calendario/draft.ts";
import { archivoClipError, CLIP_BRILLO, mezclarClips, rangosClips } from "../calendario/clips.ts";
import { scoreDraft } from "../remix/registry.ts";
import { renderCarousel } from "../render/renderCarousel.ts";
import { renderReelResult } from "../reel/renderReel.ts";
import { THRESHOLD } from "../score/virality.ts";
import type { CarouselSpec } from "../templates/types.ts";

/** Todos los textos de un valor JSON, a cualquier profundidad. */
function todosLosTextos(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(todosLosTextos);
  if (v && typeof v === "object") return Object.values(v).flatMap(todosLosTextos);
  return [];
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Textos del borrador que pasan por el filtro. Solo se saltan las rutas que tienen su
 * propia regla, y solo en su lugar: `audio` arriba, `background.image` de cada slide y
 * `props.archivo` de las escenas Clip. La misma clave en otro lugar sí se revisa.
 */
function textosDe(crudo: unknown): string[] {
  if (!esObjeto(crudo)) return todosLosTextos(crudo);
  return Object.entries(crudo).flatMap(([k, v]) => {
    if (k === "audio") return [];
    if (k !== "slides" || !Array.isArray(v)) return todosLosTextos(v);
    return v.flatMap((slide) => {
      if (!esObjeto(slide)) return todosLosTextos(slide);
      return Object.entries(slide).flatMap(([sk, sv]) => {
        if (sk === "background" && esObjeto(sv)) return Object.entries(sv).flatMap(([bk, bv]) => (bk === "image" ? [] : todosLosTextos(bv)));
        if (sk === "props" && esObjeto(sv) && slide.template === "Clip")
          return Object.entries(sv).flatMap(([pk, pv]) => (pk === "archivo" ? [] : todosLosTextos(pv)));
        return todosLosTextos(sv);
      });
    });
  });
}

/** Cuenta por tipo y pistas de 3 caracteres: los mensajes nunca llevan el valor completo. */
function resumirHallazgos(textos: string[]): { resumen: string; pistas: string } | null {
  const cuenta = new Map<string, number>();
  const pistas: string[] = [];
  for (const t of textos) {
    for (const h of hallazgosSensibles(t)) {
      cuenta.set(h.tipo, (cuenta.get(h.tipo) ?? 0) + 1);
      pistas.push(`${h.tipo}: ${h.original.slice(0, 3)}…`);
    }
  }
  if (!cuenta.size) return null;
  return { resumen: [...cuenta].map(([t, n]) => `${t}: ${n}`).join(", "), pistas: pistas.join("; ") };
}

/** Ruta real de `ruta` (relativa a dirCaso) solo si existe y queda dentro de <dirCaso>/<carpeta>/; si no, null. */
function rutaDentro(ruta: unknown, dirCaso: string, carpeta: "imagenes" | "clips"): string | null {
  if (typeof ruta !== "string" || !ruta.trim() || ruta.includes("\0")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruta) || ruta.startsWith("/")) return null;
  const base = resolve(dirCaso, carpeta);
  const abs = resolve(dirCaso, ruta);
  if (!abs.startsWith(base + sep) || !existsSync(abs)) return null;
  try {
    // Un enlace simbólico no debe sacar el archivo de la carpeta.
    const real = realpathSync(abs);
    if (!real.startsWith(realpathSync(base) + sep)) return null;
    return real;
  } catch {
    return null;
  }
}

/** Valor de `audio` que hace sonar cada escena Clip con el audio de su propio clip. */
const AUDIO_CLIPS = "clips";

/** Nombre válido de una pista de música del caso: un archivo de audio sin rutas. */
const ARCHIVO_AUDIO_RE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(m4a|mp3|wav|aac)$/i;

/** Motivo por el que `v` no sirve como `audio` del borrador (undefined = sirve). */
function archivoAudioError(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return "audio debe ser el nombre de una pista de clips/ (texto no vacío)";
  if (v.includes("..") || !ARCHIVO_AUDIO_RE.test(v)) return `audio ${JSON.stringify(v)} inválido: solo un nombre .m4a, .mp3, .wav o .aac sin rutas`;
  return undefined;
}

/** Marca de color que reemplaza un fondo `image` mientras pasa por parseBorrador (que no los admite). */
const MARCA_IMAGEN = "__caso_imagen_";

interface BorradorLeido {
  borrador: Borrador;
  /** Marca de color → fondo `image` ya resuelto a ruta absoluta. */
  imagenes: Map<string, { image: string; overlay: number }>;
}

/**
 * Lee borrador.json: cambia los fondos `image` por una marca (parseBorrador solo admite
 * ai/gradient/color) y los guarda resueltos para reponerlos en el spec. Lanza si no es válido.
 */
function leerBorrador(dirCaso: string, crudo: unknown): BorradorLeido {
  const imagenes = new Map<string, { image: string; overlay: number }>();
  const copia = JSON.parse(JSON.stringify(crudo)) as { slides?: unknown };
  if (Array.isArray(copia.slides)) {
    copia.slides.forEach((s: unknown, i: number) => {
      const bg = (s as { background?: Record<string, unknown> } | null)?.background;
      if (!bg || typeof bg !== "object" || bg.image === undefined) return;
      const abs = rutaDentro(bg.image, dirCaso, "imagenes");
      if (!abs) throw new Error(`slide ${i + 1}: el fondo image debe ser un archivo dentro de imagenes/`);
      const marca = `${MARCA_IMAGEN}${i}__`;
      imagenes.set(marca, { image: abs, overlay: typeof bg.overlay === "number" ? bg.overlay : 0.5 });
      (s as { background: unknown }).background = { color: marca };
    });
  }
  return { borrador: parseBorrador(JSON.stringify(copia)), imagenes };
}

/** Repone en el spec los fondos `image` que leerBorrador cambió por una marca. */
function reponerImagenes(spec: CarouselSpec, imagenes: BorradorLeido["imagenes"]): CarouselSpec {
  return {
    ...spec,
    slides: spec.slides.map((s) => {
      const bg = s.props.background as { color?: string } | undefined;
      const img = bg?.color ? imagenes.get(bg.color) : undefined;
      return img ? { ...s, props: { ...s.props, background: img } } : s;
    }),
  };
}

/** Contenidos del caso leídos una sola vez: la puerta y el render usan exactamente estos. */
export interface ContenidosCaso {
  /** historia.md (null si no existe). */
  historia: string | null;
  /** borrador.json en texto (null si no existe). */
  borrador: string | null;
  /** carrusel.json en texto, si el carrusel va distinto del reel (null o ausente: sale de borrador.json). */
  carrusel?: string | null;
}

/** Lee historia.md, borrador.json y carrusel.json una vez. */
function leerContenidos(dirCaso: string): ContenidosCaso {
  const leer = (f: string): string | null => (existsSync(join(dirCaso, f)) ? readFileSync(join(dirCaso, f), "utf8") : null);
  return { historia: leer("historia.md"), borrador: leer("borrador.json"), carrusel: leer("carrusel.json") };
}

/** Hash guardado al aprobar (null si no hay aprobado.json válido). */
function hashAprobado(dirCaso: string): string | null {
  try {
    const h = (JSON.parse(readFileSync(join(dirCaso, "aprobado.json"), "utf8")) as { hash?: unknown }).hash;
    return typeof h === "string" ? h : null;
  } catch {
    return null;
  }
}

/**
 * Motivos para no generar la pieza (vacío = se puede). Mira la aprobación de la
 * historia, la forma de borrador.json, datos sensibles y «Felipe» en sus textos,
 * fondos (`image` solo dentro de imagenes/, nunca `ai`), hookVideo y clips (dentro
 * de clips/). Los mensajes nunca llevan el valor sensible completo: terminan en logs.
 */
export function puertaGenerar(dirCaso: string): string[] {
  return puertaGenerarDe(dirCaso, leerContenidos(dirCaso));
}

/**
 * Igual que `puertaGenerar`, sobre contenidos ya leídos: la aprobación se compara con
 * el hash de exactamente ese texto de historia (sin releer el archivo).
 */
export function puertaGenerarDe(dirCaso: string, c: ContenidosCaso): string[] {
  const motivos: string[] = [];
  if (c.historia === null) motivos.push("La historia no está aprobada (no hay historia.md): escríbela y apruébala.");
  else {
    const guardado = hashAprobado(dirCaso);
    if (guardado === null) motivos.push("La historia no está aprobada: revísala y apruébala.");
    else if (guardado !== hashHistoria(c.historia)) motivos.push("La historia no está aprobada (cambió después de aprobarla): revísala y apruébala de nuevo.");
    // El filtro puede haberse vuelto más estricto desde que se aprobó: la historia se vuelve a revisar.
    const h = resumirHallazgos([c.historia]);
    if (h) motivos.push(`historia.md contiene datos sensibles (${h.resumen}): tápalos y apruébala de nuevo. ${h.pistas}`);
  }
  if (c.borrador === null) {
    motivos.push("Falta borrador.json en la carpeta del caso.");
    return motivos;
  }
  motivos.push(...motivosDeBorrador(dirCaso, c.borrador, "borrador.json"));
  if (typeof c.carrusel === "string") {
    motivos.push(...motivosDeBorrador(dirCaso, c.carrusel, "carrusel.json").map((m) => (m.includes("carrusel.json") ? m : `carrusel.json: ${m}`)));
  }
  return motivos;
}

/**
 * Motivos para no usar `texto` (un borrador en JSON): datos sensibles y «Felipe» en sus
 * textos, hookVideo, `audio`, fondos (`image` solo dentro de imagenes/, nunca `ai`) y
 * clips (dentro de clips/). Vale para borrador.json y para carrusel.json.
 */
function motivosDeBorrador(dirCaso: string, texto: string, archivo: string): string[] {
  const motivos: string[] = [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto.replace(/^\uFEFF/, ""));
  } catch (e) {
    motivos.push(`${archivo} no es JSON válido: ${e instanceof Error ? e.message : e}`);
    return motivos;
  }

  const textos = textosDe(crudo);
  const h = resumirHallazgos(textos);
  if (h) motivos.push(`${archivo} contiene datos sensibles (${h.resumen}): ${h.pistas}`);
  if (textos.some((t) => /felipe/i.test(t))) {
    motivos.push(`${archivo} menciona «Felipe»: la pieza firma como la cuenta, nunca con su nombre.`);
  }

  if (crudo && typeof crudo === "object" && (crudo as { hookVideo?: unknown }).hookVideo !== undefined) {
    motivos.push(`${archivo} trae hookVideo: los casos no generan video IA; usa una escena Clip con un clip de clips/.`);
  }
  const audio = (crudo as { audio?: unknown }).audio;
  const slidesCrudos = (crudo as { slides?: unknown }).slides;
  if (audio === AUDIO_CLIPS) {
    const hayClip = Array.isArray(slidesCrudos) && slidesCrudos.some((s) => (s as { template?: unknown } | null)?.template === "Clip");
    if (!hayClip) motivos.push(`audio "${AUDIO_CLIPS}" necesita al menos una escena Clip (recortada con --con-sonido).`);
  } else if (audio !== undefined) {
    const err = archivoAudioError(audio);
    if (err) motivos.push(`${err}.`);
    else if (!rutaDentro(`clips/${String(audio)}`, dirCaso, "clips")) motivos.push(`falta el audio ${String(audio)} en clips/ (o apunta fuera de la carpeta): ármalo con el comando musica.`);
  }
  const slides = (crudo as { slides?: unknown }).slides;
  if (Array.isArray(slides)) {
    slides.forEach((s: unknown, i: number) => {
      const slide = s as { template?: unknown; props?: Record<string, unknown>; background?: Record<string, unknown> } | null;
      const bg = slide?.background;
      if (bg && typeof bg === "object" && bg.ai !== undefined) {
        motivos.push(`slide ${i + 1}: los casos usan imágenes de imagenes/, color o gradient; sin fondos ai.`);
      }
      if (bg && typeof bg === "object" && bg.image !== undefined && !rutaDentro(bg.image, dirCaso, "imagenes")) {
        motivos.push(`slide ${i + 1}: el fondo image debe ser un archivo que exista dentro de imagenes/.`);
      }
      const nombre = slide?.props?.archivo;
      if (slide?.template === "Clip" || nombre !== undefined) {
        const err = archivoClipError(nombre);
        if (err) motivos.push(`slide ${i + 1}: ${err}.`);
        else if (!rutaDentro(`clips/${String(nombre)}`, dirCaso, "clips")) motivos.push(`slide ${i + 1}: falta el clip ${String(nombre)} en clips/ (o apunta fuera de la carpeta).`);
      }
    });
  }

  // Forma mínima del borrador (lo que exige el render); solo si lo anterior no lo explica ya.
  if (!motivos.some((m) => m.startsWith("slide "))) {
    try {
      leerBorrador(dirCaso, crudo);
    } catch (e) {
      motivos.push(`${archivo} no es válido: ${e instanceof Error ? e.message : e}`);
    }
  }
  return motivos;
}

/** Corre `fn` guardando los avisos de revisión visual que escribe el render en consola. */
async function conAvisosVisuales<T>(avisos: string[], fn: () => Promise<T>): Promise<T> {
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    const t = args.map(String).join(" ");
    if (t.includes("Revisión visual")) avisos.push(t.replace(/^\s*⚠️?\s*/, "").trim());
    original(...args);
  };
  try {
    return await fn();
  } finally {
    console.warn = original;
  }
}

/** Línea de aviso con el puntaje de scoreDraft (no bloquea). */
function avisoPuntaje(que: string, r: { total: number; grade: string; suggestions: string[] }): string {
  const bajo = r.total < THRESHOLD ? ` bajo el umbral ${THRESHOLD}${r.suggestions.length ? `: ${r.suggestions.join(" ")}` : ""}` : "";
  return `Puntaje ${que}: ${r.total}/100 (${r.grade})${bajo}`;
}

/**
 * Genera la pieza del caso: `caso.pdf` (la guía) y, salvo `soloPdf`, el carrusel
 * (PNGs) y el reel (`reel.mp4`, sin voz; con la música de `audio` si la hay) en `salida/<nombre>/`. Si la puerta da
 * motivos, lanza con todos y no escribe nada. El puntaje y la revisión visual
 * solo van a `avisos`.
 */
export async function generarCaso(
  dirCaso: string,
  opts: { soloPdf?: boolean } = {},
): Promise<{ pdf: string; carrusel: string[]; reel?: string; avisos: string[] }> {
  // Una sola lectura: la puerta y el render usan los mismos textos (sin carrera entre aprobar y generar).
  const contenidos = leerContenidos(dirCaso);
  const motivos = puertaGenerarDe(dirCaso, contenidos);
  if (motivos.length) throw new Error(`No se puede generar el caso:\n${motivos.map((m) => `- ${m}`).join("\n")}`);

  const crudo: unknown = JSON.parse(contenidos.borrador!.replace(/^\uFEFF/, ""));
  const { borrador: b, imagenes } = leerBorrador(dirCaso, crudo);
  const carrusel = typeof contenidos.carrusel === "string" ? leerBorrador(dirCaso, JSON.parse(contenidos.carrusel.replace(/^\uFEFF/, ""))) : undefined;
  // historiaAHtml lanza si queda «Felipe» fuera de las secciones internas: antes de escribir nada.
  const html = historiaAHtml(contenidos.historia!, { dirCaso });

  // Defensa en profundidad: aunque la puerta ya rechaza fondos ai, el render nunca llama a la API de imágenes.
  const previo = process.env.CARRUSEL_AI_SOLO_CACHE;
  process.env.CARRUSEL_AI_SOLO_CACHE = "1";
  try {
    return await renderizar(dirCaso, html, b, imagenes, opts, carrusel);
  } finally {
    if (previo === undefined) delete process.env.CARRUSEL_AI_SOLO_CACHE;
    else process.env.CARRUSEL_AI_SOLO_CACHE = previo;
  }
}

/** PDF, carrusel y reel a partir de contenidos ya validados por la puerta. */
async function renderizar(
  dirCaso: string,
  html: string,
  b: Borrador,
  imagenes: BorradorLeido["imagenes"],
  opts: { soloPdf?: boolean },
  propio?: BorradorLeido,
): Promise<{ pdf: string; carrusel: string[]; reel?: string; avisos: string[] }> {
  const pdf = join(dirCaso, "caso.pdf");
  await renderPdf(html, pdf);
  const avisos: string[] = [];
  if (opts.soloPdf) return { pdf, carrusel: [], avisos };

  // renderCarousel/renderReel juntan su outDir con process.cwd(): se pasa relativo para no salir de dirCaso.
  const outDir = relative(process.cwd(), join(dirCaso, "salida")) || ".";

  // El carrusel sale de carrusel.json si existe; si no, de borrador.json. No puede mostrar
  // video: las escenas Clip quedan solo en el reel.
  const base = propio ?? { borrador: b, imagenes };
  const sinClips: Borrador = { ...base.borrador, slides: base.borrador.slides.filter((s) => s.template !== "Clip") };
  avisos.push(avisoPuntaje("del carrusel", scoreDraft(sinClips, { format: "carrusel" })));
  const specCarrusel = reponerImagenes(borradorASpec(sinClips), base.imagenes);
  // Las láminas de un render anterior más largo no deben quedar junto a las nuevas.
  const dirCarrusel = join(dirCaso, "salida", specCarrusel.name);
  if (existsSync(dirCarrusel)) for (const f of readdirSync(dirCarrusel)) if (/^slide-\d+\.(png|jpe?g)$/.test(f)) rmSync(join(dirCarrusel, f), { force: true });
  const carrusel = await conAvisosVisuales(avisos, () => renderCarousel(specCarrusel, { outDir, revision: "avisar" }));

  avisos.push(avisoPuntaje("del reel", scoreDraft(b, { format: "reel" })));
  const specReel = reponerImagenes(borradorASpec(b, { format: "reel" }), imagenes);
  // La música se vuelve a resolver aquí: debe seguir dentro de clips/. Con "clips", el sonido se arma después.
  const sonidoDeClips = b.audio === AUDIO_CLIPS;
  const audio = b.audio === undefined || sonidoDeClips ? undefined : rutaDentro(`clips/${b.audio}`, dirCaso, "clips");
  if (audio === null) throw new Error(`El audio ${b.audio} ya no está dentro de clips/`);
  const r = await conAvisosVisuales(avisos, () => renderReelResult(specReel, { outDir, pace: b.pace, audio, logoEnCuadro0: b.logoEnCuadro0, voz: false, revision: "avisar" }));

  // Escenas Clip: el video del caso (clips/) se mezcla sobre el reel, como en el calendario.
  const rangos = rangosClips(specReel, r.timing);
  if (rangos.length) {
    const original = join(dirCaso, "salida", specReel.name, ".reel-sin-clips.mp4");
    renameSync(r.path, original);
    const clips = rangos.map((rango) => {
      // Se vuelve a resolver la ruta real: el clip debe seguir dentro de clips/.
      const ruta = rutaDentro(`clips/${rango.archivo}`, dirCaso, "clips");
      if (!ruta) throw new Error(`El clip ${rango.archivo} ya no está dentro de clips/`);
      return { ruta, rango };
    });
    try {
      if (!sonidoDeClips) await mezclarClips(original, clips, r.path);
      else {
        const mudo = join(dirCaso, "salida", specReel.name, ".reel-mudo.mp4");
        try {
          await mezclarClips(original, clips, mudo);
          await ponerSonidoDeClips(mudo, clips, r.timing.total, r.path);
        } finally {
          rmSync(mudo, { force: true });
        }
      }
    } finally {
      rmSync(original, { force: true });
    }
  }
  return { pdf, carrusel, reel: r.path, avisos };
}

/** Ejecuta ffmpeg; lanza con las últimas líneas de error si falla. */
function ffmpeg(args: string[]): Promise<void> {
  return new Promise((ok, mal) => {
    const proc = spawn("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => mal(new Error(`no se pudo ejecutar ffmpeg: ${e.message}`)));
    proc.on("close", (code) => (code === 0 ? ok() : mal(new Error(`ffmpeg terminó con código ${code}: ${err.trim().split("\n").slice(-2).join(" ")}`))));
  });
}

/** Altura (px de un reel de 1920) donde empieza el video a lo ancho: bajo los títulos de Clip. */
const ANCHO_Y = 900;

/**
 * Aclarado del video a lo ancho: la mezcla de clips lo multiplica por CLIP_BRILLO (0.7) para
 * leer texto encima, pero aquí el texto va arriba y no sobre el video.
 */
const ANCHO_ACLARADO = +(1 / CLIP_BRILLO).toFixed(2);

/**
 * Filtro de ffmpeg que arma un clip vertical 1080×1920 con el video completo a lo ancho
 * (1080 de ancho) en `ANCHO_Y`, bajo los títulos, y el mismo video desenfocado detrás.
 */
export function filtroAncho(): string {
  const a = ANCHO_ACLARADO;
  return `split[f][g];[g]scale=-2:1920,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.12[fondo];[f]scale=1080:-2,colorchannelmixer=rr=${a}:gg=${a}:bb=${a}[video];[fondo][video]overlay=0:${ANCHO_Y},setsar=1`;
}

/**
 * Recorta `video` entre `desde` y `hasta` (s) a `clips/<nombre>.mp4`. Sin audio, salvo
 * `conSonido` (para `audio: "clips"`: el clip suena con su propio audio). Con `ancho`, el
 * clip sale ya en vertical (ver `filtroAncho`): el reel lo muestra completo, sin recortar los lados.
 * Devuelve la ruta.
 */
export async function recortarClip(video: string, desde: number, hasta: number, dirCaso: string, nombre: string, opts: { conSonido?: boolean; ancho?: boolean } = {}): Promise<string> {
  const archivo = nombre.endsWith(".mp4") ? nombre : `${nombre}.mp4`;
  const err = archivoClipError(archivo);
  if (err) throw new Error(`Nombre de clip inválido: ${err}`);
  if (!(Number.isFinite(desde) && Number.isFinite(hasta) && desde >= 0 && hasta > desde)) {
    throw new Error(`Rango de recorte inválido: desde ${desde} hasta ${hasta} (segundos, desde ≥ 0 y hasta > desde)`);
  }
  const origen = resolve(video);
  if (!existsSync(origen)) throw new Error(`No existe el video ${basename(origen)}`);
  const dir = join(dirCaso, "clips");
  mkdirSync(dir, { recursive: true });
  const salida = join(dir, archivo);
  await ffmpeg(["-nostdin", "-ss", String(desde), "-to", String(hasta), "-i", origen, ...(opts.ancho ? ["-vf", filtroAncho()] : []), ...(opts.conSonido ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", salida]);
  return salida;
}

/** Un tramo del sonido del reel: el audio de la entrada `entrada` (índice del clip) desde 0, o silencio. */
export interface TramoSonido {
  entrada: number | null;
  dur: number;
}

/**
 * Tramos del sonido con `audio: "clips"`: silencio hasta el primer clip y, desde ahí,
 * cada clip suena desde su segundo 0 (como su video) hasta que entra el siguiente; el
 * último sigue hasta el final del reel (se baja con fade-out en `filtroSonidoClips`).
 */
export function tramosSonidoClips(rangos: { inicio: number; fin: number }[], total: number): TramoSonido[] {
  const out: TramoSonido[] = [];
  if (rangos.length && rangos[0].inicio > 0) out.push({ entrada: null, dur: +rangos[0].inicio.toFixed(3) });
  rangos.forEach((r, i) => {
    const hasta = i + 1 < rangos.length ? rangos[i + 1].inicio : total;
    out.push({ entrada: i, dur: +(hasta - r.inicio).toFixed(3) });
  });
  return out;
}

/**
 * Filtro de ffmpeg para los tramos: el clip k es la entrada k + 1 (la 0 es el reel). Cada
 * tramo se recorta, se rellena con silencio si el clip es más corto y lleva fundidos de
 * 30 ms para que no haya clics; el final baja con fade-out. La salida es `[sonido]`.
 */
export function filtroSonidoClips(tramos: TramoSonido[]): string {
  const formato = "aformat=sample_rates=48000:channel_layouts=stereo";
  const total = tramos.reduce((t, x) => t + x.dur, 0);
  const partes = tramos.map((t, i) => {
    const fuente = t.entrada === null ? `anullsrc=r=48000:cl=stereo,atrim=0:${t.dur}` : `[${t.entrada + 1}:a]atrim=0:${t.dur}`;
    const fundidos = t.entrada === null ? "" : `,afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, t.dur - 0.03).toFixed(3)}:d=0.03`;
    return `${fuente},asetpts=PTS-STARTPTS,${formato},apad=whole_dur=${t.dur}${fundidos}[p${i}]`;
  });
  const cierre = `afade=t=out:st=${Math.max(0, total - MUSICA_CIERRE).toFixed(3)}:d=${MUSICA_CIERRE}[sonido]`;
  partes.push(`${tramos.map((_, i) => `[p${i}]`).join("")}concat=n=${tramos.length}:v=0:a=1,${cierre}`);
  return partes.join(";");
}

/** Pone en `reel` (video ya mezclado) el sonido de sus clips y escribe `salida`. */
async function ponerSonidoDeClips(reel: string, clips: { ruta: string; rango: { inicio: number; fin: number } }[], total: number, salida: string): Promise<void> {
  for (const c of clips) {
    const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", c.ruta], { encoding: "utf8" });
    if (!r.stdout.trim()) throw new Error(`El clip ${basename(c.ruta)} no tiene sonido: recórtalo de nuevo con --con-sonido.`);
  }
  const filtro = filtroSonidoClips(tramosSonidoClips(clips.map((c) => c.rango), total));
  await ffmpeg(["-nostdin", "-i", reel, ...clips.flatMap((c) => ["-i", c.ruta]), "-filter_complex", filtro, "-map", "0:v", "-map", "[sonido]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", salida]);
}

/** Segundos de fundido entre tramos de la música y del fade-out final. */
const MUSICA_FUNDIDO = 0.08;
const MUSICA_CIERRE = 1.5;

/** Lee tramos «desde-hasta» en segundos (p. ej. «12.5-26.7»). Lanza si falta alguno o es inválido. */
export function parsearTramos(args: string[]): [number, number][] {
  if (!args.length) throw new Error("Falta al menos un tramo desde-hasta (segundos), por ejemplo 12.5-26.7.");
  return args.map((a) => {
    const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(a.trim());
    const desde = m ? Number(m[1]) : NaN;
    const hasta = m ? Number(m[2]) : NaN;
    if (!(hasta > desde)) throw new Error(`Tramo inválido «${a}»: usa desde-hasta en segundos, con hasta mayor que desde.`);
    return [desde, hasta] as [number, number];
  });
}

/**
 * Filtro de ffmpeg que recorta cada tramo de `[0:a]`, los encadena con fundidos cortos
 * (para que no se note el corte) y cierra con un fade-out. La salida es `[musica]`.
 */
export function filtroMusica(tramos: [number, number][]): string {
  const total = tramos.reduce((t, [a, b]) => t + (b - a), 0) - MUSICA_FUNDIDO * (tramos.length - 1);
  const cierre = `afade=t=out:st=${Math.max(0, total - MUSICA_CIERRE).toFixed(3)}:d=${MUSICA_CIERRE}[musica]`;
  const recorte = ([a, b]: [number, number]) => `atrim=${a}:${b},asetpts=PTS-STARTPTS`;
  if (tramos.length === 1) return `[0:a]${recorte(tramos[0])},${cierre}`;
  const partes = [`[0:a]asplit=${tramos.length}${tramos.map((_, i) => `[s${i}]`).join("")}`];
  tramos.forEach((t, i) => partes.push(`[s${i}]${recorte(t)}[t${i}]`));
  let previo = "t0";
  for (let i = 1; i < tramos.length; i++) {
    const ultimo = i === tramos.length - 1;
    partes.push(`[${previo}][t${i}]acrossfade=d=${MUSICA_FUNDIDO}${ultimo ? `,${cierre}` : `[x${i}]`}`);
    previo = `x${i}`;
  }
  return partes.join(";");
}

/**
 * Arma la música de fondo del reel: une los `tramos` de `audio` (los que no dicen nada
 * confidencial) en `clips/<nombre>.m4a`. Devuelve la ruta.
 */
export async function armarMusica(audio: string, tramos: [number, number][], dirCaso: string, nombre: string): Promise<string> {
  const archivo = /\.m4a$/i.test(nombre) ? nombre : `${nombre}.m4a`;
  const err = archivoAudioError(archivo);
  if (err) throw new Error(`Nombre de música inválido: ${err}`);
  if (!tramos.length) throw new Error("Falta al menos un tramo de la canción.");
  const origen = resolve(audio);
  if (!existsSync(origen)) throw new Error(`No existe el audio ${basename(origen)}`);
  const dir = join(dirCaso, "clips");
  mkdirSync(dir, { recursive: true });
  const salida = join(dir, archivo);
  await ffmpeg(["-nostdin", "-i", origen, "-filter_complex", filtroMusica(tramos), "-map", "[musica]", "-vn", "-c:a", "aac", "-b:a", "192k", salida]);
  return salida;
}

/** Copia una imagen a `imagenes/` (nombre saneado) y devuelve la ruta relativa `imagenes/<nombre>`. */
export function copiarImagen(ruta: string, dirCaso: string): string {
  if (!existsSync(ruta)) throw new Error(`No existe la imagen ${basename(ruta)}`);
  const nombre = basename(ruta).replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^[.-]+/, "");
  if (!/\.(png|jpe?g|webp|gif)$/i.test(nombre)) throw new Error(`La imagen ${basename(ruta)} debe ser .png, .jpg, .webp o .gif`);
  const dir = join(dirCaso, "imagenes");
  mkdirSync(dir, { recursive: true });
  copyFileSync(ruta, join(dir, nombre));
  return `imagenes/${nombre}`;
}
