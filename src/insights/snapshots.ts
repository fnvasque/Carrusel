import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { localParts, zonaOnlineFollowers } from "../calendario/time.ts";
import { calendarioDir } from "../calendario/plan.ts";
import { openDb } from "../kb/db.ts";
import { kbDir } from "../kb/store.ts";
import { GraphError } from "../meta/client.ts";
import { refreshCalibration, type Metric } from "../score/calibration.ts";
import {
  fetchAccountInsights, fetchMediaInsights, fetchOwnMedia, type AccountInsights, type GraphGetFn, type MediaInsights,
} from "./client.ts";
import { DESVIO_COMPARABLE_7D_MS, derivar, desvioVentana, ventanaDebida, type Derivadas, type Ventana } from "./derive.ts";

/**
 * Instantáneas de métricas por post en ventanas fijas, y su puente a la
 * calibración del score. Todo error por post se captura aquí: una instantánea
 * nunca falla completa por un post borrado o una métrica rara. Los fallos de
 * escritura en disco (jsonl, posts.json, metrics/) se avisan y no impiden que la
 * fila de SQLite (la fuente de verdad) quede guardada.
 */

export interface PostInfo {
  mediaId: string;
  publicado: Date;
  productType: string;
  piezaId?: string;
  origen: "motor" | "manual";
  duracionMs?: number;
  nombreMotor?: string;
  predictedScore?: number;
}

export interface Instantanea extends MediaInsights {
  mediaId: string;
  ventana: Ventana;
  tomadaEn: string;
  piezaId?: string;
  origen: "motor" | "manual";
  derivadas: Derivadas;
}

/** Fallos seguidos de "este post ya no existe" tras los que se deja de pedir. */
const MAX_FALLOS = 3;
const DIA_MS = 86_400_000;
const ALCANCE_MINIMO_CALIBRACION = 50;

const metricasDir = (): string => join(kbDir(), "_metricas");
const claveFallos = (mediaId: string): string => `insights_fallos:${mediaId}`;
const msgOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Escritura atómica (archivo temporal + rename): un corte a medias no deja un JSON truncado. */
function escribirAtomico(ruta: string, contenido: string): void {
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.tmp`;
  writeFileSync(tmp, contenido, "utf8");
  renameSync(tmp, ruta);
}

/** JSON objeto desde disco; ausente, corrupto o de otra forma → `{}`. */
function leerObjeto(ruta: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * `posts.json` (última instantánea por post). Si no se puede leer, se reconstruye desde
 * la tabla `insights` (la última por `media_id`) y se avisa; si no existe, parte vacío.
 */
function leerPostsJson(ruta: string, conocidos: Map<string, PostInfo>): Record<string, unknown> {
  if (!existsSync(ruta)) return {};
  try {
    const v: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // cae a la reconstrucción.
  }
  console.warn("⚠️  posts.json ilegible: lo reconstruyo desde la tabla insights.");
  const out: Record<string, unknown> = {};
  const filas = openDb().prepare(
    "SELECT media_id, ventana, tomada_en, reach, saved, shares, likes, comments, views, avg_watch_ms, total_watch_ms FROM insights ORDER BY tomada_en ASC",
  ).all() as Record<string, string | number | null>[];
  for (const f of filas) {
    const p = conocidos.get(String(f.media_id));
    const num = (k: string): number | undefined => (typeof f[k] === "number" ? (f[k] as number) : undefined);
    const m: MediaInsights = {
      reach: num("reach"), saved: num("saved"), shares: num("shares"), likes: num("likes"), comments: num("comments"),
      views: num("views"), avg_watch_ms: num("avg_watch_ms"), total_watch_ms: num("total_watch_ms"), descartadas: [],
    };
    out[String(f.media_id)] = {
      ...m, mediaId: f.media_id, ventana: f.ventana, tomadaEn: f.tomada_en,
      piezaId: p?.piezaId, origen: p?.origen ?? "manual", derivadas: derivar(m, p?.duracionMs),
      publicado: p?.publicado.toISOString(), productType: p?.productType,
    };
  }
  return out;
}

interface RegistroPublicado {
  piezaId?: string;
  duracionMs?: number;
  nombreMotor?: string;
  predictedScore?: number;
  publicadoEn?: string;
}

/** Líneas `tipo: "publicado"` de `_calendario/registro.jsonl`, por `mediaId`. Las líneas rotas se ignoran. */
function leerRegistro(): Map<string, RegistroPublicado> {
  const out = new Map<string, RegistroPublicado>();
  let texto: string;
  try {
    texto = readFileSync(join(calendarioDir(), "registro.jsonl"), "utf8");
  } catch {
    return out;
  }
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    try {
      const r = JSON.parse(linea) as Record<string, unknown>;
      if (r.tipo !== "publicado" || typeof r.mediaId !== "string") continue;
      out.set(r.mediaId, {
        piezaId: typeof r.piezaId === "string" ? r.piezaId : undefined,
        duracionMs: typeof r.duracionMs === "number" ? r.duracionMs : undefined,
        nombreMotor: typeof r.nombreMotor === "string" ? r.nombreMotor : undefined,
        predictedScore: typeof r.predictedScore === "number" ? r.predictedScore : undefined,
        publicadoEn: typeof r.publicadoEn === "string" ? r.publicadoEn : undefined,
      });
    } catch {
      // línea corrupta: se ignora.
    }
  }
  return out;
}

/**
 * Posts propios de los últimos 35 días cruzados con `registro.jsonl` por `mediaId`;
 * los que no están en el registro son `manual`. Las stories no se miden (expiran a
 * las 24 h). Un error de red al listar se propaga: sin lista no hay qué medir.
 */
export async function postsConocidos(now: Date, get?: GraphGetFn, igUserId?: string): Promise<PostInfo[]> {
  const media = await fetchOwnMedia(new Date(now.getTime() - 35 * DIA_MS), get, igUserId);
  const registro = leerRegistro();
  const out: PostInfo[] = [];
  for (const m of media) {
    if (m.media_product_type === "STORY") continue;
    const reg = registro.get(m.id);
    // La hora que mide Meta es la del post; el registro solo respalda si no se puede leer.
    const publicado = new Date(m.timestamp);
    const fecha = Number.isNaN(publicado.getTime()) && reg?.publicadoEn ? new Date(reg.publicadoEn) : publicado;
    if (Number.isNaN(fecha.getTime())) continue;
    out.push({
      mediaId: m.id, publicado: fecha, productType: m.media_product_type,
      origen: reg ? "motor" : "manual",
      piezaId: reg?.piezaId, duracionMs: reg?.duracionMs, nombreMotor: reg?.nombreMotor, predictedScore: reg?.predictedScore,
    });
  }
  return out;
}

/** ¿El error significa que el post ya no existe o no se puede leer (borrado en Instagram)? */
function postInexistente(err: unknown): boolean {
  if (err instanceof GraphError && err.code === 100) return true;
  return /does not exist|no existe|cannot be loaded/i.test(msgOf(err));
}

/** Estado de fallos de un post: `valor` es JSON `{ n, ultimo }`; un valor ilegible cuenta como sin fallos. */
function leerFallos(mediaId: string): { n: number; ultimo: number } {
  const fila = openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get(claveFallos(mediaId)) as { valor: string } | undefined;
  try {
    const v = JSON.parse(fila?.valor ?? "null") as { n?: unknown; ultimo?: unknown } | null;
    if (v && typeof v.n === "number" && typeof v.ultimo === "number") return { n: v.n, ultimo: v.ultimo };
  } catch {
    // valor corrupto: se ignora.
  }
  return { n: 0, ultimo: 0 };
}
const fallosSeguidos = (mediaId: string): number => leerFallos(mediaId).n;

/** Suma un fallo solo si el anterior fue hace ≥ 24 h (pasadas cada hora no deben agotar el cupo). */
function anotarFallo(mediaId: string, now: Date): number {
  const { n, ultimo } = leerFallos(mediaId);
  if (n > 0 && now.getTime() - ultimo < DIA_MS) return n;
  const nuevo = n + 1;
  openDb().prepare("INSERT OR REPLACE INTO calendario_estado (clave, valor) VALUES (?, ?)").run(claveFallos(mediaId), JSON.stringify({ n: nuevo, ultimo: now.getTime() }));
  return nuevo;
}

function limpiarFallos(mediaId: string): void {
  openDb().prepare("DELETE FROM calendario_estado WHERE clave = ?").run(claveFallos(mediaId));
}

/** Nombre de archivo seguro dentro de `metrics/` (sin separadores, sin `..`, sin pisar `calibration.json`). */
const nombreSeguro = (n: string): boolean => /^[\w][\w.-]*$/.test(n) && !n.includes("..") && n !== "calibration";

/**
 * Formato exacto de `src/score/record.ts` (tasas por 1.000 de alcance con 1 decimal).
 * Con alcance < 50, o sin saved/shares, no hay tasa fiable: devuelve `undefined` y no se escribe archivo.
 */
export function metricaCalibracion(i: Instantanea, nombre: string, predictedScore: number): (Metric & { recordedAt: string; likes: number | null }) | undefined {
  const reach = i.reach;
  // Con poco alcance las tasas por 1.000 son ruido. 50 = `umbralAlcanceTasas` de config.json.
  if (typeof reach !== "number" || !Number.isFinite(reach) || reach < ALCANCE_MINIMO_CALIBRACION) return undefined;
  // Como record.ts, que exige saves y shares: una métrica descartada no se inventa como 0.
  const saves = i.saved;
  const shares = i.shares;
  if (typeof saves !== "number" || typeof shares !== "number") return undefined;
  return {
    name: nombre,
    predictedScore,
    recordedAt: i.tomadaEn,
    saves,
    shares,
    reach,
    likes: i.likes ?? null,
    savesPerK: +((saves / reach) * 1000).toFixed(1),
    sharesPerK: +((shares / reach) * 1000).toFixed(1),
  };
}

export interface DepsInstantaneas {
  fetch?: typeof fetchMediaInsights;
  posts?: PostInfo[];
  /** Carpeta de `<nombre>.json` (por defecto `<KB>/_metricas/calibracion`, R51). */
  metricsDir?: string;
  /** Recalcula la calibración tras escribir métricas nuevas (por defecto solo con `metricsDir` propio). */
  refresh?: (metricsDir: string) => Promise<unknown>;
  /** Ids del listado reciente de posts (por defecto `fetchOwnMedia`), para distinguir "borrado" de "permisos". */
  listado?: () => Promise<Set<string>>;
}

/**
 * Toma la instantánea que toque de cada post: fila en SQLite (PK media_id+ventana,
 * `INSERT OR IGNORE`, así dos llamadas simultáneas no duplican), línea en
 * `_metricas/instantaneas/<día local>.jsonl` y última por post en `_metricas/posts.json`.
 * La de 7 d de una pieza del motor alimenta además la calibración.
 * Devuelve solo las instantáneas nuevas.
 */
export async function tomarInstantaneas(now: Date, deps: DepsInstantaneas = {}): Promise<Instantanea[]> {
  const pedir = deps.fetch ?? fetchMediaInsights;
  const posts = deps.posts ?? (await postsConocidos(now));
  const db = openDb();
  const nuevas: Instantanea[] = [];
  let listado: Promise<Set<string> | undefined> | undefined;
  /** ¿Seguro que el post ya no está en el listado reciente? Sin poder listar, no se sabe: no se cuenta. */
  const ausenteDelListado = async (mediaId: string): Promise<boolean> => {
    listado ??= (deps.listado ?? (async () => new Set((await fetchOwnMedia(new Date(now.getTime() - 35 * DIA_MS))).map((m) => m.id))))().catch(() => undefined);
    const ids = await listado;
    return ids !== undefined && !ids.has(mediaId);
  };
  const conocidos = new Map(posts.map((p) => [p.mediaId, p]));
  const paraCalibrar: { i: Instantanea; post: PostInfo }[] = [];

  for (const post of posts) {
    if (post.productType === "STORY") continue;
    if (fallosSeguidos(post.mediaId) >= MAX_FALLOS) continue;
    const tomadas = new Set(
      (db.prepare("SELECT ventana FROM insights WHERE media_id = ?").all(post.mediaId) as { ventana: Ventana }[]).map((f) => f.ventana),
    );
    const ventana = ventanaDebida(post.publicado, now, tomadas);
    if (!ventana) continue;

    let m: MediaInsights;
    try {
      m = await pedir(post.mediaId, post.productType);
    } catch (err) {
      // Un 100 con el post presente en el listado reciente es otro problema (permisos…): no es "borrado".
      if (postInexistente(err) && (await ausenteDelListado(post.mediaId))) {
        const n = anotarFallo(post.mediaId, now);
        console.warn(`⚠️  Insights de ${post.mediaId} (${ventana}): ${msgOf(err)} [fallo ${n}/${MAX_FALLOS}${n >= MAX_FALLOS ? ": dejo de pedirlo" : ""}]`);
      } else {
        console.warn(`⚠️  Insights de ${post.mediaId} (${ventana}): ${msgOf(err)} (se reintenta en la próxima pasada).`);
      }
      continue;
    }
    limpiarFallos(post.mediaId);

    const i: Instantanea = {
      ...m, mediaId: post.mediaId, ventana, tomadaEn: now.toISOString(),
      piezaId: post.piezaId, origen: post.origen, derivadas: derivar(m, post.duracionMs),
    };
    const r = db.prepare(
      `INSERT OR IGNORE INTO insights (media_id, ventana, tomada_en, reach, saved, shares, likes, comments, views, avg_watch_ms, total_watch_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      i.mediaId, i.ventana, i.tomadaEn, i.reach ?? null, i.saved ?? null, i.shares ?? null, i.likes ?? null,
      i.comments ?? null, i.views ?? null, i.avg_watch_ms ?? null, i.total_watch_ms ?? null,
    );
    // Otra llamada simultánea ya la guardó: no se repite nada más.
    if (Number(r.changes) === 0) continue;
    nuevas.push(i);

    try {
      const dir = join(metricasDir(), "instantaneas");
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, `${localParts(now).dia}.jsonl`), JSON.stringify(i) + "\n", "utf8");
    } catch (err) {
      console.warn(`⚠️  No pude escribir el jsonl de instantáneas: ${msgOf(err)}`);
    }
    try {
      const ruta = join(metricasDir(), "posts.json");
      const posts = leerPostsJson(ruta, conocidos);
      posts[i.mediaId] = { ...i, publicado: post.publicado.toISOString(), productType: post.productType };
      escribirAtomico(ruta, JSON.stringify(posts, null, 2) + "\n");
    } catch (err) {
      console.warn(`⚠️  No pude actualizar posts.json: ${msgOf(err)}`);
    }
    if (ventana === "7d" && Math.abs(desvioVentana(post.publicado, ventana, now)) <= DESVIO_COMPARABLE_7D_MS && post.origen === "motor" && post.nombreMotor && typeof post.predictedScore === "number") {
      paraCalibrar.push({ i, post });
    }
  }

  if (paraCalibrar.length) {
    // R51: en el servidor `metrics/` no persiste ni llega al Mac; el puente escribe en la base
    // (`_metricas/calibracion/`, viaja por git) y el Mac la copia a su metrics/ y recalcula.
    const dir = deps.metricsDir ?? join(metricasDir(), "calibracion");
    let escritas = 0;
    for (const { i, post } of paraCalibrar) {
      const nombre = post.nombreMotor!;
      if (!nombreSeguro(nombre)) {
        console.warn(`⚠️  Nombre de motor no válido para metrics/: ${nombre}`);
        continue;
      }
      const metrica = metricaCalibracion(i, nombre, post.predictedScore!);
      if (!metrica) continue;
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${nombre}.json`), JSON.stringify(metrica, null, 2) + "\n", "utf8");
        escritas++;
      } catch (err) {
        console.warn(`⚠️  No pude escribir metrics/${nombre}.json: ${msgOf(err)}`);
      }
    }
    // En la base no se recalcula (lo hace el Mac al copiarla); con un metricsDir propio, sí.
    const refresh = deps.refresh ?? (deps.metricsDir ? refreshCalibration : undefined);
    if (escritas && refresh) {
      try {
        await refresh(dir);
      } catch (err) {
        console.warn(`⚠️  No pude refrescar la calibración: ${msgOf(err)}`);
      }
    }
  }
  return nuevas;
}

/**
 * Rutas que el bot commitea tras tomar instantáneas del día `dia` (local): el jsonl del
 * día, `posts.json` y la calibración (`_metricas/calibracion/`, R51), que el Mac copia.
 */
export function rutasCommitInstantaneas(dia: string): string[] {
  return [join(metricasDir(), "instantaneas", `${dia}.jsonl`), join(metricasDir(), "posts.json"), join(metricasDir(), "calibracion")];
}

/**
 * Guarda `_metricas/cuenta.json`. Meta da solo 30 días de seguidores por día: `porDia`
 * se fusiona con lo anterior para conservar la historia. Si la consulta no trae
 * seguidores u horas de audiencia, se conserva lo último conocido.
 */
export async function guardarCuenta(now: Date, deps: { fetch?: typeof fetchAccountInsights } = {}): Promise<void> {
  // Los días de follower_count se leen en la zona de la cuenta (config.json, R39).
  const zona = zonaOnlineFollowers(leerObjeto(join(calendarioDir(), "config.json")));
  const a: AccountInsights = deps.fetch ? await deps.fetch(now) : await fetchAccountInsights(now, undefined, undefined, zona);
  const ruta = join(metricasDir(), "cuenta.json");
  const previo = leerObjeto(ruta);
  const porDiaPrevio = typeof previo.porDia === "object" && previo.porDia !== null && !Array.isArray(previo.porDia) ? (previo.porDia as Record<string, number>) : {};
  const porDia: Record<string, number> = { ...porDiaPrevio };
  for (const f of a.followerCount) porDia[f.dia] = f.valor;
  const cuenta = {
    actualizado: now.toISOString(),
    seguidores: a.followers ?? (typeof previo.seguidores === "number" ? previo.seguidores : undefined),
    porDia: Object.fromEntries(Object.entries(porDia).sort(([x], [y]) => x.localeCompare(y))),
    onlineFollowers: a.onlineFollowers ?? (typeof previo.onlineFollowers === "object" ? previo.onlineFollowers : undefined),
    reach7d: a.reach7d,
    engaged7d: a.engaged7d,
    reachNoSeguidores7d: a.reachNoSeguidores7d,
    errores: a.errores,
  };
  escribirAtomico(ruta, JSON.stringify(cuenta, null, 2) + "\n");
}
