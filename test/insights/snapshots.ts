import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { closeDb, openDb } from "../../src/kb/db.ts";
import { GraphError } from "../../src/meta/client.ts";
import type { GraphGetFn, MediaInsights } from "../../src/insights/client.ts";
import { guardarCuenta, metricaCalibracion, postsConocidos, tomarInstantaneas, type Instantanea, type PostInfo } from "../../src/insights/snapshots.ts";

async function conBase<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "snap-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

const PUB = new Date("2026-10-12T22:30:00Z");
const AHORA_24H = new Date("2026-10-13T22:30:00Z");
const AHORA_7D = new Date("2026-10-19T22:30:00Z");
const motor = (extra: Partial<PostInfo> = {}): PostInfo => ({
  mediaId: "m1", publicado: PUB, productType: "REELS", piezaId: "lun-reel-x", origen: "motor",
  duracionMs: 20000, nombreMotor: "lun-reel-x-motor", predictedScore: 82, ...extra,
});
const ins = (extra: Partial<MediaInsights> = {}): MediaInsights => ({
  reach: 200, saved: 10, shares: 4, likes: 30, comments: 2, views: 500, avg_watch_ms: 6000, total_watch_ms: 90000, descartadas: [], ...extra,
});
const jsonl = (p: string): unknown[] => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const count = (sql: string): number => (openDb().prepare(sql).get() as { c: number }).c;

check("metricaCalibracion: formato exacto de record.ts, tasas con 1 decimal", () => {
  const i = { mediaId: "m1", ventana: "7d", tomadaEn: "2026-10-19T22:30:00.000Z", origen: "motor", derivadas: {}, ...ins({ reach: 333, saved: 10, shares: 4, likes: 7 }) } as Instantanea;
  const m = metricaCalibracion(i, "x", 82);
  assert.deepEqual(m, {
    name: "x", predictedScore: 82, recordedAt: "2026-10-19T22:30:00.000Z",
    saves: 10, shares: 4, reach: 333, likes: 7, savesPerK: 30, sharesPerK: 12,
  });
  assert.deepEqual(Object.keys(m!), ["name", "predictedScore", "recordedAt", "saves", "shares", "reach", "likes", "savesPerK", "sharesPerK"]);
});
check("metricaCalibracion: reach 0 o ausente no produce métrica; likes ausente es null", () => {
  const base = { mediaId: "m1", ventana: "7d", tomadaEn: "t", origen: "motor", derivadas: {}, descartadas: [] as string[] } as const;
  assert.equal(metricaCalibracion({ ...base, reach: 0, saved: 1 } as Instantanea, "x", 80), undefined);
  assert.equal(metricaCalibracion({ ...base, saved: 1 } as Instantanea, "x", 80), undefined);
  assert.equal(metricaCalibracion({ ...base, reach: 100, saved: 1, shares: 1 } as Instantanea, "x", 80)!.likes, null);
});

await checkAsync("tomarInstantaneas: escribe fila, jsonl, posts.json y puente a calibración (7d); idempotente", () =>
  conBase(async (dir) => {
    openDb();
    const metricsDir = join(dir, "metrics-out");
    const llamadas: string[] = [];
    const fetch = async (id: string) => { llamadas.push(id); return ins(); };
    const refrescos: string[] = [];
    const deps = { fetch, posts: [motor()], metricsDir, refresh: async (d: string) => { refrescos.push(d); return null; } };

    const r24 = await tomarInstantaneas(AHORA_24H, deps);
    assert.equal(r24.length, 1);
    assert.equal(r24[0].ventana, "24h");
    assert.equal(r24[0].derivadas.retencion, 0.3);
    assert.ok(!existsSync(metricsDir), "24h no alimenta la calibración");
    assert.deepEqual(refrescos, []);

    assert.deepEqual(await tomarInstantaneas(AHORA_24H, deps), []);
    assert.equal(llamadas.length, 1);

    const r7 = await tomarInstantaneas(AHORA_7D, deps);
    assert.equal(r7[0].ventana, "7d");
    const filas = openDb().prepare("SELECT ventana, reach FROM insights ORDER BY ventana").all() as { ventana: string; reach: number }[];
    assert.deepEqual(filas.map((f) => f.ventana), ["24h", "7d"]);
    assert.equal(filas[0].reach, 200);

    assert.equal(jsonl(join(dir, "_metricas", "instantaneas", "2026-10-13.jsonl")).length, 1);
    assert.equal(jsonl(join(dir, "_metricas", "instantaneas", "2026-10-19.jsonl")).length, 1);
    const posts = JSON.parse(readFileSync(join(dir, "_metricas", "posts.json"), "utf8"));
    assert.equal(posts.m1.ventana, "7d");

    const calib = JSON.parse(readFileSync(join(metricsDir, "lun-reel-x-motor.json"), "utf8"));
    assert.equal(calib.predictedScore, 82);
    assert.equal(calib.savesPerK, 50);
    assert.deepEqual(refrescos, [metricsDir]);
  }));

await checkAsync("tomarInstantaneas: el jsonl usa el día local de Chile, no el UTC", () =>
  conBase(async (dir) => {
    openDb();
    // 2026-10-14 02:30 UTC = 2026-10-13 23:30 en Chile (UTC-3)
    const ahora = new Date("2026-10-14T02:30:00Z");
    await tomarInstantaneas(ahora, { fetch: async () => ins(), posts: [motor({ publicado: new Date("2026-10-13T02:30:00Z") })], metricsDir: join(dir, "m") });
    assert.ok(existsSync(join(dir, "_metricas", "instantaneas", "2026-10-13.jsonl")));
  }));

await checkAsync("tomarInstantaneas: un post que lanza no impide los demás", () =>
  conBase(async (dir) => {
    openDb();
    const fetch = async (id: string) => { if (id === "malo") throw new Error("red caída"); return ins(); };
    const r = await tomarInstantaneas(AHORA_24H, { fetch, posts: [motor({ mediaId: "malo" }), motor({ mediaId: "bueno", origen: "manual", piezaId: undefined })], metricsDir: join(dir, "m") });
    assert.deepEqual(r.map((x) => x.mediaId), ["bueno"]);
    assert.equal(r[0].origen, "manual");
    // un fallo de red no cuenta como "post borrado": se reintenta
    const r2 = await tomarInstantaneas(AHORA_24H, { fetch: async () => ins(), posts: [motor({ mediaId: "malo" })], metricsDir: join(dir, "m") });
    assert.equal(r2.length, 1);
  }));

await checkAsync("tomarInstantaneas: post borrado en Instagram deja de pedirse tras 3 fallos seguidos", () =>
  conBase(async (dir) => {
    openDb();
    let n = 0;
    const fetch = async (): Promise<MediaInsights> => { n++; throw new GraphError("(#100) Object with ID 'm1' does not exist", 100); };
    const deps = { fetch, posts: [motor()], metricsDir: join(dir, "m"), listado: async () => new Set<string>() };
    for (let k = 0; k < 6; k++) await tomarInstantaneas(new Date(AHORA_24H.getTime() + k * 25 * 3_600_000), deps);
    assert.equal(n, 3);
    const fila = openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get("insights_fallos:m1") as { valor: string };
    assert.equal(JSON.parse(fila.valor).n, 3);
    assert.equal(count("SELECT COUNT(*) AS c FROM insights"), 0);
  }));

await checkAsync("tomarInstantaneas: un éxito reinicia la cuenta de fallos", () =>
  conBase(async (dir) => {
    openDb();
    let falla = true;
    const fetch = async (): Promise<MediaInsights> => { if (falla) throw new GraphError("does not exist", 100); return ins(); };
    const deps = { fetch, posts: [motor()], metricsDir: join(dir, "m"), listado: async () => new Set<string>() };
    await tomarInstantaneas(AHORA_24H, deps);
    await tomarInstantaneas(new Date(AHORA_24H.getTime() + 25 * 3_600_000), deps);
    assert.equal(openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get("insights_fallos:m1") !== undefined, true);
    falla = false;
    assert.equal((await tomarInstantaneas(new Date(AHORA_24H.getTime() + 26 * 3_600_000), deps)).length, 1);
    assert.equal(openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get("insights_fallos:m1"), undefined);
  }));

await checkAsync("tomarInstantaneas: reach 0 en 7d no escribe calibración; los manuales tampoco", () =>
  conBase(async (dir) => {
    openDb();
    const metricsDir = join(dir, "m");
    await tomarInstantaneas(AHORA_7D, { fetch: async () => ins({ reach: 0 }), posts: [motor()], metricsDir });
    await tomarInstantaneas(AHORA_7D, { fetch: async () => ins(), posts: [motor({ mediaId: "m2", origen: "manual", nombreMotor: undefined })], metricsDir });
    assert.ok(!existsSync(metricsDir));
    const row = openDb().prepare("SELECT reach FROM insights WHERE media_id = 'm1'").get() as { reach: number };
    assert.equal(row.reach, 0);
  }));

await checkAsync("tomarInstantaneas: nombreMotor hostil no escribe fuera de metricsDir", () =>
  conBase(async (dir) => {
    openDb();
    const metricsDir = join(dir, "m");
    await tomarInstantaneas(AHORA_7D, { fetch: async () => ins(), posts: [motor({ nombreMotor: "../evil" })], metricsDir });
    assert.ok(!existsSync(join(dir, "evil.json")));
  }));

await checkAsync("tomarInstantaneas: posts.json corrupto se reconstruye; metrics/ sin permiso no rompe la instantánea", () =>
  conBase(async (dir) => {
    openDb();
    mkdirSync(join(dir, "_metricas"), { recursive: true });
    writeFileSync(join(dir, "_metricas", "posts.json"), "{corrupto", "utf8");
    // `metricsDir` es un archivo normal: mkdir/escritura dentro fallan siempre (también como root).
    const metricsDir = join(dir, "ro");
    writeFileSync(metricsDir, "no soy una carpeta", "utf8");
    const r = await tomarInstantaneas(AHORA_7D, { fetch: async () => ins(), posts: [motor()], metricsDir, refresh: async () => null });
    assert.equal(r.length, 1);
    assert.equal(JSON.parse(readFileSync(join(dir, "_metricas", "posts.json"), "utf8")).m1.ventana, "7d");
    assert.equal(count("SELECT COUNT(*) AS c FROM insights"), 1);
  }));

await checkAsync("tomarInstantaneas: dos llamadas simultáneas no duplican filas ni líneas", () =>
  conBase(async (dir) => {
    openDb();
    const deps = { fetch: async () => { await new Promise((r) => setTimeout(r, 10)); return ins(); }, posts: [motor()], metricsDir: join(dir, "m") };
    const [a, b] = await Promise.all([tomarInstantaneas(AHORA_24H, deps), tomarInstantaneas(AHORA_24H, deps)]);
    assert.equal(a.length + b.length, 1);
    assert.equal(count("SELECT COUNT(*) AS c FROM insights"), 1);
    assert.equal(jsonl(join(dir, "_metricas", "instantaneas", "2026-10-13.jsonl")).length, 1);
  }));

await checkAsync("postsConocidos: cruza registro.jsonl, marca manuales, omite stories y tolera líneas rotas", () =>
  conBase(async (dir) => {
    mkdirSync(join(dir, "_calendario"), { recursive: true });
    writeFileSync(join(dir, "_calendario", "registro.jsonl"), [
      JSON.stringify({ tipo: "publicado", piezaId: "lun-reel-x", mediaId: "m1", semana: "2026-10-12", publicadoEn: "2026-10-12T22:30:00Z", duracionMs: 20000, nombreMotor: "n", predictedScore: 81 }),
      "{rota",
      JSON.stringify({ tipo: "otro", mediaId: "m9" }),
      "",
    ].join("\n"), "utf8");
    const get = (async () => ({
      data: [
        { id: "m1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-12T22:31:00+0000" },
        { id: "m2", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-10T12:00:00+0000" },
        { id: "m3", media_type: "IMAGE", media_product_type: "STORY", timestamp: "2026-10-13T12:00:00+0000" },
      ],
    })) as unknown as GraphGetFn;
    const posts = await postsConocidos(new Date("2026-10-14T00:00:00Z"), get, "ig1");
    assert.deepEqual(posts.map((p) => p.mediaId), ["m1", "m2"]);
    assert.equal(posts[0].origen, "motor");
    assert.equal(posts[0].piezaId, "lun-reel-x");
    assert.equal(posts[0].duracionMs, 20000);
    assert.equal(posts[0].predictedScore, 81);
    assert.equal(posts[0].publicado.toISOString(), "2026-10-12T22:31:00.000Z");
    assert.equal(posts[1].origen, "manual");
    assert.equal(posts[1].piezaId, undefined);
  }));

await checkAsync("postsConocidos: sin registro.jsonl todo es manual", () =>
  conBase(async () => {
    const get = (async () => ({ data: [{ id: "m2", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-10T12:00:00+0000" }] })) as unknown as GraphGetFn;
    const posts = await postsConocidos(new Date("2026-10-14T00:00:00Z"), get, "ig1");
    assert.equal(posts[0].origen, "manual");
  }));

await checkAsync("guardarCuenta: fusiona porDia con lo anterior y anota errores", () =>
  conBase(async (dir) => {
    const ahora = new Date("2026-10-14T05:00:00Z");
    const fetch = async () => ({ followers: 4, followerCount: [{ dia: "2026-10-12", valor: 1 }, { dia: "2026-10-13", valor: 0 }], reach7d: 30, errores: ["online_followers no disponible"] });
    await guardarCuenta(ahora, { fetch });
    const f = join(dir, "_metricas", "cuenta.json");
    const a = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(a.seguidores, 4);
    assert.equal(a.actualizado, ahora.toISOString());
    assert.equal(a.onlineFollowers, undefined);
    assert.deepEqual(a.errores, ["online_followers no disponible"]);
    // 30 días después Meta ya no devuelve el 12: se conserva
    await guardarCuenta(new Date("2026-11-14T05:00:00Z"), { fetch: async () => ({ followerCount: [{ dia: "2026-11-13", valor: 2 }], errores: [] }) });
    const b = JSON.parse(readFileSync(f, "utf8"));
    assert.deepEqual(b.porDia, { "2026-10-12": 1, "2026-10-13": 0, "2026-11-13": 2 });
    assert.equal(b.seguidores, 4);
    // cuenta.json corrupto no rompe
    writeFileSync(f, "{rota", "utf8");
    await guardarCuenta(ahora, { fetch });
    assert.equal(JSON.parse(readFileSync(f, "utf8")).seguidores, 4);
  }));

await checkAsync("tomarInstantaneas: un 100 por permisos con el post en el listado no apaga la medición", () =>
  conBase(async (dir) => {
    openDb();
    let n = 0;
    const fetch = async (): Promise<MediaInsights> => { n++; throw new GraphError("(#100) Object with ID 'm1' does not exist, cannot be loaded due to missing permissions", 100); };
    const deps = { fetch, posts: [motor()], metricsDir: join(dir, "m"), listado: async () => new Set(["m1"]) };
    for (let k = 0; k < 6; k++) await tomarInstantaneas(new Date(AHORA_24H.getTime() + k * 25 * 3_600_000), deps);
    assert.equal(n, 6, "sigue pidiendo en cada pasada");
    assert.equal(openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get("insights_fallos:m1"), undefined);
  }));

await checkAsync("tomarInstantaneas: los fallos de 'borrado' deben estar separados por 24 h para sumar", () =>
  conBase(async (dir) => {
    openDb();
    let n = 0;
    const fetch = async (): Promise<MediaInsights> => { n++; throw new GraphError("does not exist", 100); };
    const deps = { fetch, posts: [motor()], metricsDir: join(dir, "m"), listado: async () => new Set<string>() };
    for (let k = 0; k < 10; k++) await tomarInstantaneas(new Date(AHORA_24H.getTime() + k * 3_600_000), deps);
    assert.equal(n, 10, "10 pasadas en 10 h son un solo fallo");
    const v = JSON.parse((openDb().prepare("SELECT valor FROM calendario_estado WHERE clave = ?").get("insights_fallos:m1") as { valor: string }).valor);
    assert.equal(v.n, 1);
  }));

await checkAsync("tomarInstantaneas: una 7d tomada el día 12 no alimenta la calibración (pero sí se guarda)", () =>
  conBase(async (dir) => {
    openDb();
    const metricsDir = join(dir, "m");
    let refrescos = 0;
    const r = await tomarInstantaneas(new Date(PUB.getTime() + 12 * 86_400_000), { fetch: async () => ins(), posts: [motor()], metricsDir, refresh: async () => { refrescos++; return null; } });
    assert.equal(r[0].ventana, "7d");
    assert.ok(!existsSync(metricsDir));
    assert.equal(refrescos, 0);
    assert.equal(count("SELECT COUNT(*) AS c FROM insights"), 1);
    // con 6 h de desvío todavía entra
    await tomarInstantaneas(new Date(PUB.getTime() + 168 * 3_600_000 + 6 * 3_600_000), { fetch: async () => ins(), posts: [motor({ mediaId: "m2" })], metricsDir, refresh: async () => null });
    assert.ok(existsSync(join(metricsDir, "lun-reel-x-motor.json")));
  }));

await checkAsync("tomarInstantaneas: posts.json corrupto se reconstruye desde la tabla insights con los demás posts", () =>
  conBase(async (dir) => {
    openDb();
    const deps = { fetch: async () => ins(), metricsDir: join(dir, "m"), refresh: async () => null };
    const p1 = motor({ mediaId: "m1" });
    const p2 = motor({ mediaId: "m2", publicado: new Date(PUB.getTime() + 20 * 3_600_000) });
    await tomarInstantaneas(AHORA_24H, { ...deps, posts: [p1, p2] });
    writeFileSync(join(dir, "_metricas", "posts.json"), "{ trunc", "utf8");
    await tomarInstantaneas(new Date(PUB.getTime() + 44 * 3_600_000), { ...deps, posts: [p1, p2] });
    const posts = JSON.parse(readFileSync(join(dir, "_metricas", "posts.json"), "utf8"));
    assert.deepEqual(Object.keys(posts).sort(), ["m1", "m2"]);
    assert.equal(posts.m1.reach, 200);
  }));

check("metricaCalibracion: reach < 50 no se calibra; con saved o shares ausentes tampoco", () => {
  const base = { mediaId: "m1", ventana: "7d", tomadaEn: "t", origen: "motor", derivadas: {}, descartadas: [] as string[] } as const;
  assert.equal(metricaCalibracion({ ...base, reach: 49, saved: 5, shares: 1 } as Instantanea, "x", 80), undefined);
  assert.ok(metricaCalibracion({ ...base, reach: 50, saved: 5, shares: 1 } as Instantanea, "x", 80));
  assert.equal(metricaCalibracion({ ...base, reach: 200, shares: 1 } as Instantanea, "x", 80), undefined);
  assert.equal(metricaCalibracion({ ...base, reach: 200, saved: 1 } as Instantanea, "x", 80), undefined);
  assert.ok(metricaCalibracion({ ...base, reach: 200, saved: 0, shares: 0 } as Instantanea, "x", 80), "0 real sí vale");
});
