import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync } from "../_check.ts";
import { escribirBucle } from "../../src/calendario/bucle.ts";
import { relative, resolve } from "node:path";
import { leerSemana, listarSemanas, type RenderEntry } from "../../src/calendario/plan.ts";
import { pendientes, procesar } from "../../src/calendario/render.ts";
import { escribirEstado } from "../../src/calendario/registro.ts";
import { depsReales, tick, type SchedulerDeps } from "../../src/calendario/scheduler.ts";
import { addDays, zonedToUtc } from "../../src/calendario/time.ts";
import { fetchAccountInsights, fetchMediaInsights } from "../../src/insights/client.ts";
import { guardarCuenta, postsConocidos, tomarInstantaneas } from "../../src/insights/snapshots.ts";
import { leerRegistroPublicados, resolverPost } from "../../src/insights/lectura.ts";
import { parsearReferencia } from "../../src/insights/summary.ts";
import { kbDir } from "../../src/kb/store.ts";
import { refreshCalibration } from "../../src/score/calibration.ts";
// @ts-ignore: módulo .mjs sin dependencias (tiene validar.d.mts)
import { EJEMPLO, validarSemana } from "../../kb-plantilla/_calendario/validar.mjs";

/**
 * Adversario final (rama completa): una semana entera con los módulos reales y solo
 * I/O falso (Meta falso, reloj inyectado, commit sin red, KB_DIR temporal). Busca
 * roturas en las COSTURAS entre módulos: agente → validar.mjs → plan.ts → Mac
 * (render.json) → scheduler (estado.json, registro.jsonl) → instantáneas → bucle.json.
 * Cada check cita la línea de la spec o el ruling que respalda lo que exige.
 */

const IG = "17841400000000000";
const TOKEN_MEDIOS = "tok-medios-final";
const AUDIO = "lima-01.mp3";
const SEMANA = "2026-10-12";
const PLANTILLA = join(process.cwd(), "kb-plantilla", "_calendario");

// Entorno propio mientras corren estos checks (todos con `await`); se restaura al final del archivo.
const ENV_PREVIO = { KB_DIR: process.env.KB_DIR, KB_GIT: process.env.KB_GIT, META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN, META_IG_USER_ID: process.env.META_IG_USER_ID };
process.env.KB_GIT = "0";
process.env.META_ACCESS_TOKEN = "token-falso-final";
process.env.META_IG_USER_ID = IG;

/** Base temporal con `_calendario/config.json` (audios con la pista del ejemplo). */
function nuevaBase(prefijo: string): string {
  const dir = mkdtempSync(join(tmpdir(), `adv-final-${prefijo}-`));
  mkdirSync(join(dir, "_calendario"), { recursive: true });
  const config = JSON.parse(readFileSync(join(PLANTILLA, "config.json"), "utf8"));
  config.audios = [AUDIO];
  writeFileSync(join(dir, "_calendario", "config.json"), JSON.stringify(config, null, 2));
  process.env.KB_DIR = dir;
  return dir;
}
const config = (): Record<string, unknown> => JSON.parse(readFileSync(join(process.env.KB_DIR!, "_calendario", "config.json"), "utf8"));

// --- el "agente": plan.json + borradores a partir del ejemplo de INSTRUCCIONES.md ---

const clon = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const MIX: { dia: number; formato: "reel" | "carrusel"; arquetipo: string; slug: string; tema: string; primera: string }[] = [
  { dia: 0, formato: "reel", arquetipo: "tutorial", slug: "lun-reel-pdfs-a-podcast", tema: "[[Automatización con IA]]", primera: "Automatización para estudiar: 6 PDFs convertidos en un podcast gratis." },
  { dia: 1, formato: "carrusel", arquetipo: "lista", slug: "mar-carrusel-estudio-pdfs", tema: "[[Estudio con IA]]", primera: "Estudio sin pantallas: 6 PDFs convertidos en audio." },
  { dia: 2, formato: "reel", arquetipo: "compartible", slug: "mie-reel-podcast-amigo", tema: "[[Podcasts con IA]]", primera: "Podcasts gratis hechos con tus propios documentos." },
  { dia: 3, formato: "reel", arquetipo: "demo", slug: "jue-reel-lectura-audio", tema: "[[Lectura con IA]]", primera: "Lectura en audio: el prompt que ordena las ideas clave." },
  { dia: 4, formato: "carrusel", arquetipo: "opinion", slug: "vie-carrusel-resumenes", tema: "[[Resúmenes con IA]]", primera: "Resúmenes en audio: lo que sí sirve y lo que no." },
  { dia: 5, formato: "reel", arquetipo: "atemporal", slug: "sab-reel-productividad", tema: "[[Productividad con IA]]", primera: "Productividad al caminar: tu pila de lectura en un podcast." },
];

/** Escribe la semana como lo haría el agente (Paso 8) y devuelve el plan. */
function escribirSemanaAgente(semana: string, ajustar: (p: Record<string, unknown>, i: number) => void = () => {}): Record<string, unknown> {
  const dir = join(process.env.KB_DIR!, "_calendario", semana);
  mkdirSync(dir, { recursive: true });
  const piezas = MIX.map((m, i) => {
    const p = clon(EJEMPLO.plan.piezas[0]) as Record<string, unknown>;
    Object.assign(p, {
      id: m.slug, dia: addDays(semana, m.dia), hora: "14:00", formato: m.formato, arquetipo: m.arquetipo,
      senal: "guardados", tema: m.tema, borrador: `${m.slug}.json`,
      caption: `${m.primera}\n\nGuárdalo para tu próxima semana de lectura.\n\n#ia #inteligenciaartificial #herramientasia`,
    });
    ajustar(p, i);
    const b = clon(EJEMPLO.borrador) as Record<string, unknown> & { slides: Record<string, unknown>[] };
    b.name = m.slug;
    if (i >= 3) delete b.slides[0]!.background; // tope 3 fondos ai por semana
    writeFileSync(join(dir, `${m.slug}.json`), JSON.stringify(b, null, 2));
    return p;
  });
  const plan = {
    semana, zona: "America/Santiago",
    experimento: { variable: "hook", hipotesis: "en tutoriales, curiosidad retiene más que lista", piezas: [MIX[0]!.slug] },
    piezas,
  };
  writeFileSync(join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  return plan;
}

/** `node _calendario/validar.mjs <semana>` sin el score (el repo de código no está al lado en la nube). */
function validar(semana: string): string[] {
  return validarSemana(join(process.env.KB_DIR!, "_calendario", semana), config(), { avisos: [] }) as string[];
}

// --- Meta falso ---

interface Post { id: string; caption?: string; media_type: string; media_product_type: string; timestamp: string; permalink: string }

class MetaFalso {
  n = 0;
  media: Post[] = [];
  stories: { id: string; timestamp: string }[] = [];
  contenedores = new Map<string, { params: Record<string, unknown>; status: string }>();
  /** Insights por media_id. */
  insights = new Map<string, Record<string, number>>();
  followerCount: { end_time: string; value: number }[] = [];
  constructor(public reloj: () => Date) {}
  ts = (): string => this.reloj().toISOString().replace(/\.\d{3}Z$/, "+0000");
  post = async (path: string, params: Record<string, string | number | boolean | undefined>): Promise<Record<string, unknown>> => {
    if (path === `${IG}/media`) {
      const id = `c${++this.n}`;
      this.contenedores.set(id, { params, status: "FINISHED" });
      return { id };
    }
    if (path === `${IG}/media_publish`) {
      const c = this.contenedores.get(String(params.creation_id));
      if (!c) throw new Error("creation_id desconocido");
      c.status = "PUBLISHED";
      const id = `m${++this.n}`;
      if (c.params.media_type === "STORIES") this.stories.push({ id, timestamp: this.ts() });
      else {
        const reel = c.params.media_type === "REELS";
        this.media.unshift({
          id, caption: String(c.params.caption), media_type: reel ? "VIDEO" : "CAROUSEL_ALBUM",
          media_product_type: reel ? "REELS" : "FEED", timestamp: this.ts(), permalink: `https://www.instagram.com/p/DQx${id}/`,
        });
      }
      return { id };
    }
    throw new Error(`POST inesperado: ${path}`);
  };
  get = async <T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> => {
    const r = ((): unknown => {
      if (path === `${IG}/media`) return { data: this.media };
      if (path === `${IG}/stories`) return { data: this.stories };
      if (path === IG) return { followers_count: 4 };
      if (path === `${IG}/insights`) {
        if (params?.metric === "follower_count") return { data: [{ name: "follower_count", period: "day", values: this.followerCount }] };
        if (params?.metric === "online_followers") throw new Error("(#100) Not enough followers");
        return { data: [] };
      }
      const ins = /^(m\d+)\/insights$/.exec(path);
      if (ins) {
        const v = this.insights.get(ins[1]!);
        if (!v) throw new Error(`(#100) Media ${ins[1]} does not exist`);
        const pedidas = String(params?.metric ?? "").split(",");
        return { data: pedidas.filter((k) => k in v).map((k) => ({ name: k, period: "lifetime", values: [{ value: v[k] }] })) };
      }
      const c = this.contenedores.get(path);
      if (c && params?.fields === "status_code") return { status_code: c.status };
      const m = this.media.find((x) => x.id === path);
      if (m && params?.fields === "permalink") return { permalink: m.permalink };
      throw new Error(`GET inesperado: ${path} ${JSON.stringify(params)}`);
    })();
    return r as T;
  };
}

// --- el Mac: procesar con deps falsas (sin Chromium); render.json lo escribe solo el Mac ---

async function correrMac(ahora: Date, outRoot: string): Promise<void> {
  const semanas = [];
  for (const s of await listarSemanas()) {
    const l = await leerSemana(s);
    if (l) semanas.push(l);
  }
  const acumulado = new Map<string, Record<string, RenderEntry>>();
  await procesar(pendientes(semanas, ahora), outRoot, { base: "https://media.ejemplo.cl", token: TOKEN_MEDIOS, host: "", dir: join(outRoot, "servidor") }, {
    ahora: () => ahora,
    log: () => {},
    avisar: async () => {},
    render: async (p) => p.pieza.formato === "reel"
      ? { archivos: ["reel.mp4", "cover.jpg", "story.jpg"], duracionMs: 30_000 }
      : { archivos: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg", "06.jpg", "story.jpg"] },
    rsync: async () => {},
    verificar: async () => true,
    escribirRender: async (semana, id, e) => {
      acumulado.set(semana, { ...(acumulado.get(semana) ?? {}), [id]: e });
    },
    confirmar: async (semana) => {
      const archivo = join(process.env.KB_DIR!, "_calendario", semana, "render.json");
      const previo = existsSync(archivo) ? JSON.parse(readFileSync(archivo, "utf8")) : {};
      writeFileSync(archivo, JSON.stringify({ ...previo, ...(acumulado.get(semana) ?? {}) }, null, 2));
    },
  });
}

/** El bot pasa a `programado` lo recién renderizado (revisarCalendario de bot.ts). */
async function programar(): Promise<void> {
  for (const s of await listarSemanas()) {
    const l = await leerSemana(s);
    if (!l) continue;
    for (const p of l.plan.piezas) {
      if (l.render[p.id]?.estado === "renderizado" && !l.estado[p.id]) await escribirEstado(s, p.id, { estado: "programado" });
    }
  }
}

/** Deps del scheduler: las reales del servidor, con Meta falso, reloj inyectado y commit sin red. */
function depsBot(meta: MetaFalso, reloj: { t: Date }, modo: "auto" | "aviso", avisos: string[]): SchedulerDeps {
  const base = depsReales({ modo, avisar: async (t) => { avisos.push(t); } });
  return {
    ...base,
    graph: { get: meta.get, post: meta.post },
    igUserId: IG,
    ahora: () => reloj.t,
    dormir: async () => {},
    tokenOk: async () => true,
    commit: async () => undefined,
    mediaToken: TOKEN_MEDIOS,
  };
}

const HORA = 3_600_000;
const local = (dia: string, hora: string): Date => zonedToUtc(dia, hora);

interface Ciclo {
  meta: MetaFalso;
  metricsDir: string;
  avisos: string[];
  bucle1: Record<string, unknown>;
  bucle3: Record<string, unknown>;
  validacion: string[];
}

/** Ciclo de una semana con valores de insights por pieza (índice del mix). */
async function correrCiclo(prefijo: string, modo: "auto" | "aviso", insightsDe: (i: number, formato: string) => Record<string, number>): Promise<Ciclo> {
  const kb = nuevaBase(prefijo);
  const metricsDir = join(kb, "..", `${prefijo}-metrics-${Date.now()}`);
  const reloj = { t: local("2026-10-11", "05:30") };
  const meta = new MetaFalso(() => reloj.t);
  const avisos: string[] = [];

  // 1. Domingo 05:30: bucle.json (sin datos todavía).
  await escribirBucle(reloj.t);
  const bucle1 = JSON.parse(readFileSync(join(kb, "_metricas", "bucle.json"), "utf8"));

  // 2. Domingo 06:00: el agente escribe plan.json y borradores (emoción como texto).
  reloj.t = local("2026-10-11", "06:00");
  escribirSemanaAgente(SEMANA, (p) => { p.emocion = "curiosidad"; });
  const validacion = validar(SEMANA);

  // 3. Domingo 10:00: el Mac renderiza; el bot programa.
  reloj.t = local("2026-10-11", "10:00");
  await correrMac(reloj.t, join(kb, "..", `${prefijo}-out-${Date.now()}`));
  await programar();

  // 4-5. Dos semanas de reloj: scheduler cada 15 min, instantáneas y cuenta cada hora.
  const deps = depsBot(meta, reloj, modo, avisos);
  const fin = local("2026-10-25", "05:00").getTime();
  const piezaDe = new Map<string, number>();
  for (let t = local("2026-10-12", "00:00").getTime(); t <= fin; t += 15 * 60_000) {
    reloj.t = new Date(t);
    await tick(deps);
    // Insights de lo recién publicado.
    const registro = leerRegistroPublicados();
    for (const r of registro) {
      const mediaId = String(r.mediaId);
      if (piezaDe.has(mediaId)) continue;
      const i = MIX.findIndex((m) => m.slug === r.piezaId);
      piezaDe.set(mediaId, i);
      meta.insights.set(mediaId, insightsDe(i, MIX[i]!.formato));
    }
    if (t % HORA === 0) {
      const posts = await postsConocidos(reloj.t, meta.get, IG);
      await tomarInstantaneas(reloj.t, {
        posts, metricsDir, refresh: refreshCalibration,
        fetch: (id, tipo) => fetchMediaInsights(id, tipo, meta.get),
        listado: async () => new Set(meta.media.map((m) => m.id)),
      });
    }
  }

  // 6. Domingo siguiente + 1 (la 7 d ya existe): bucle.json.
  reloj.t = local("2026-10-25", "05:30");
  await escribirBucle(reloj.t);
  const bucle3 = JSON.parse(readFileSync(join(kb, "_metricas", "bucle.json"), "utf8"));
  return { meta, metricsDir, avisos, bucle1, bucle3, validacion };
}

/** Valores de insights: 5 piezas con alcance ≥ 50 (escala tasa) y una ganadora clara (mié). */
const insightsNormales = (i: number, formato: string): Record<string, number> => {
  const reach = [80, 60, 120, 55, 70, 90][i]!;
  const saved = [3, 1, 12, 2, 4, 3][i]!;
  return {
    reach, saved, shares: 1, likes: 5, comments: 1, views: reach * 2, total_interactions: saved + 7,
    ...(formato === "reel" ? { ig_reels_avg_watch_time: 9_000, ig_reels_video_view_total_time: 90_000 } : {}),
  };
};

let cicloAuto: Promise<Ciclo> | undefined;
const ciclo = (): Promise<Ciclo> => (cicloAuto ??= correrCiclo("auto", "auto", insightsNormales));


// =====================================================================================
// Hallazgos (cada check falla hoy).
// =====================================================================================

// Costura agente → validar.mjs → plan.ts (bot y Mac). INSTRUCCIONES Paso 7: «Debe terminar con ✓»
// y Paso 8 sube la semana; spec «Emoción por pieza … puede encadenar más de una». El ejemplo
// oficial (`emocion: ["curiosidad", "alivio"]`) pasa validar.mjs, pero `PlanSchema` exige texto:
// `leerSemana` lanza, el Mac ignora la semana («Semana … ignorada») y el scheduler no publica nada.
await checkAsync("adversario final: el ejemplo de INSTRUCCIONES.md (emocion en lista) pasa validar.mjs pero leerSemana descarta la semana entera", async () => {
  nuevaBase("emocion");
  escribirSemanaAgente(SEMANA); // emocion tal cual el ejemplo: ["curiosidad", "alivio"]
  assert.deepEqual(validar(SEMANA), [], "precondición: validar.mjs da ✓");
  let leida;
  try {
    leida = await leerSemana(SEMANA);
  } catch (e) {
    assert.fail(`validar.mjs dio ✓ pero el bot/Mac no pueden leer el plan: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
  }
  assert.equal(leida?.plan.piezas.length, 6);
});

// Misma costura, otros campos que validar.mjs deja omitir y plan.ts exige: `estado` (validar:
// «el planificador solo escribe "planificado"», opcional), `derivadoDe` (validar: «null o el id»,
// opcional) y `experimento` en el latido sin piezas (validar solo lo exige con piezas). Constraints:
// «El estado efectivo es … estadoEfectivo(plan, render, estado)» — una pieza sin estado es `planificado`.
await checkAsync("adversario final: plan que validar.mjs acepta (sin estado / sin derivadoDe / latido sin experimento) y plan.ts rechaza", async () => {
  const rechazados: string[] = [];
  const variantes: [string, (p: Record<string, unknown>) => void][] = [
    ["sin estado", (p) => { delete p.estado; }],
    ["sin derivadoDe", (p) => { delete p.derivadoDe; }],
  ];
  for (const [nombre, quitar] of variantes) {
    nuevaBase(nombre.replace(/\s/g, ""));
    escribirSemanaAgente(SEMANA, (p) => { p.emocion = "curiosidad"; quitar(p); });
    assert.deepEqual(validar(SEMANA), [], `precondición (${nombre}): validar.mjs da ✓`);
    try {
      await leerSemana(SEMANA);
    } catch {
      rechazados.push(nombre);
    }
  }
  // Latido (INSTRUCCIONES «Sin piezas publicables»), con el experimento omitido.
  nuevaBase("latido");
  const dir = join(process.env.KB_DIR!, "_calendario", SEMANA);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ semana: SEMANA, zona: "America/Santiago", piezas: [], motivo: "sin piezas" }));
  assert.deepEqual(validar(SEMANA), [], "precondición (latido): validar.mjs da ✓");
  try {
    await leerSemana(SEMANA);
  } catch {
    rechazados.push("latido sin experimento");
  }
  assert.deepEqual(rechazados, [], `validar.mjs ✓ pero plan.ts lanza en: ${rechazados.join(", ")}`);
});

// Costura scheduler (registro.jsonl) → /metricas. Spec: «Estado del día siguiente: GET
// /{media_id}?fields=permalink para guardar el link en registro.jsonl» y «/metricas <id|url>
// (todas las instantáneas de un post)» (las instantáneas llegan hasta 28 d). El scheduler guarda
// el permalink en una línea `tipo: "permalink"`, pero `/metricas` solo lee las líneas
// `tipo: "publicado"` (leerRegistroPublicados): pasado el listado de 35 días de Meta, el link de una
// pieza del motor ya no se encuentra aunque esté en el registro.
await checkAsync("adversario final: /metricas <link> no encuentra una pieza del motor cuyo permalink está en registro.jsonl", async () => {
  const c = await ciclo();
  const estado = JSON.parse(readFileSync(join(process.env.KB_DIR!, "_calendario", SEMANA, "estado.json"), "utf8"));
  const mie = estado["mie-reel-podcast-amigo"];
  assert.ok(typeof mie?.permalink === "string", "precondición: el scheduler guardó el permalink");
  assert.ok(readFileSync(join(process.env.KB_DIR!, "_calendario", "registro.jsonl"), "utf8").includes(mie.permalink), "precondición: está en registro.jsonl");
  const ahora = local("2026-11-20", "12:00"); // 37 días después: fuera del listado reciente de Meta
  const listar = async (since: Date) => c.meta.media.filter((m) => Date.parse(m.timestamp) >= since.getTime()) as never;
  const r = await resolverPost(parsearReferencia(mie.permalink)!, leerRegistroPublicados(), ahora, listar);
  assert.equal(r?.mediaId, mie.mediaId, "el link guardado en registro.jsonl no resuelve a su media_id");
});

// Costura client (cuenta.json) → bucle (seguidoresPorPieza). Spec: «follower_count diario vs.
// piezas | Detecta qué piezas traen seguidores (delta del día siguiente)»; R39: «Meta documenta
// periodos que terminan en UTC−07:00». `fetchAccountInsights` guarda cada valor con la fecha de
// su `end_time` (el FIN del día de Meta), así `porDia["2026-10-13"]` son los seguidores del 12; el
// bucle lee `porDia[dia + 1]` creyendo que es el día siguiente y entrega los del mismo día.
await checkAsync("adversario final: seguidoresPorPieza toma los seguidores del mismo día (end_time de Meta leído como el día)", async () => {
  nuevaBase("seguidores");
  const reloj = { t: local("2026-10-15", "12:00") };
  const meta = new MetaFalso(() => reloj.t);
  // Día 12 (Pacífico) → end_time 13 07:00 UTC: 1 seguidor. Día 13 → end_time 14 07:00 UTC: 5.
  meta.followerCount = [
    { end_time: "2026-10-12T07:00:00+0000", value: 0 },
    { end_time: "2026-10-13T07:00:00+0000", value: 1 },
    { end_time: "2026-10-14T07:00:00+0000", value: 5 },
    { end_time: "2026-10-15T07:00:00+0000", value: 0 },
  ];
  await guardarCuenta(reloj.t, { fetch: (n) => fetchAccountInsights(n, meta.get, IG) });
  // Pieza publicada el lunes 12 a las 14:00 de Chile (línea `publicado` del scheduler).
  writeFileSync(join(process.env.KB_DIR!, "_calendario", "registro.jsonl"), JSON.stringify({
    tipo: "publicado", piezaId: "lun-reel-pdfs-a-podcast", mediaId: "m1", semana: SEMANA, publicadoEn: local("2026-10-12", "14:00").toISOString(),
    senal: "guardados", tema: "[[Automatización con IA]]", arquetipo: "tutorial", hookCategoria: "curiosidad", formato: "reel",
  }) + "\n");
  await escribirBucle(local("2026-10-18", "05:30"));
  const b = JSON.parse(readFileSync(join(process.env.KB_DIR!, "_metricas", "bucle.json"), "utf8"));
  assert.equal(b.seguidoresPorPieza[`${SEMANA}/lun-reel-pdfs-a-podcast`], 5, `seguidores del día siguiente (13): ${JSON.stringify(b.seguidoresPorPieza)}`);
});

// Costura instantánea 7 d (bot, servidor) → calibración (score/generate/remix en el Mac). Spec:
// «cada instantánea de 7 d de una pieza del motor escribe metrics/<name>.json … Con 3 piezas
// medidas la proyección "≈ X saves/1k" empieza a salir en score, generate y remix sin tocar ese
// código». El bot corre en Docker (WORKDIR /app) y `tomarInstantaneas` escribe por defecto en
// `<cwd>/metrics` = /app/metrics: no es un volumen (se pierde con cada `docker compose up --build`)
// ni está en la base que el Mac sincroniza, así que el predictedScore nunca llega al `score` del Mac.
await checkAsync("adversario final: metrics/ de la calibración queda dentro del contenedor (ni volumen ni base sincronizada)", async () => {
  const workdir = /^WORKDIR\s+(\S+)/m.exec(readFileSync("Dockerfile", "utf8"))?.[1] ?? "/";
  const compose = readFileSync("compose.yaml", "utf8");
  const volumenes = [...compose.matchAll(/^\s*-\s*[^:\s]+:([^:\s]+)(?::ro)?\s*$/gm)].map((m) => m[1]!);
  const kbEnServidor = /KB_DIR:\s*(\S+)/.exec(compose)?.[1] ?? "";
  // Dónde escribe el bot por defecto: `join(process.cwd(), "metrics")` (snapshots.ts / calibration.ts).
  const destino = resolve(workdir, "metrics");
  const dentro = (dir: string): boolean => !relative(dir, destino).startsWith("..") && !relative(dir, destino).startsWith("/");
  assert.ok(
    volumenes.some(dentro) || (kbEnServidor !== "" && dentro(kbEnServidor)),
    `${destino} no está en ningún volumen (${volumenes.join(", ")}) ni en KB_DIR (${kbEnServidor}); kbDir local = ${kbDir()}`,
  );
});

for (const [k, v] of Object.entries(ENV_PREVIO)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
