import assert from "node:assert/strict";
import { check, checkAsync } from "../_check.ts";
import { GraphError } from "../../src/meta/client.ts";
import {
  parseInsights, unsupportedMetric, invalidMetrics, fetchOwnMedia, fetchMediaInsights, fetchAccountInsights,
  POST_METRICS, REEL_METRICS, type GraphGetFn,
} from "../../src/insights/client.ts";

type Call = { path: string; params: Record<string, string | number | undefined> };

/** `get` falso: registra llamadas y responde con `fn` (que puede lanzar). */
function fake(fn: (path: string, params: Call["params"], n: number) => unknown): { get: GraphGetFn; calls: Call[] } {
  const calls: Call[] = [];
  const get = (async (path: string, params: Call["params"] = {}) => {
    calls.push({ path, params });
    return fn(path, params, calls.length);
  }) as GraphGetFn;
  return { get, calls };
}
const metricsOf = (c: Call) => String(c.params.metric).split(",");
const insightsBody = (metrics: string[]) => ({ data: metrics.map((name, i) => ({ name, values: [{ value: i + 1 }] })) });

// --- parseInsights ---
check("parseInsights lee values[0].value y total_value.value", () => {
  assert.deepEqual(
    parseInsights({ data: [{ name: "reach", values: [{ value: 12 }] }, { name: "saved", total_value: { value: 3 } }] }),
    { reach: 12, saved: 3 },
  );
});
check("parseInsights ignora entradas sin número y formas raras", () => {
  assert.deepEqual(parseInsights({ data: [] }), {});
  assert.deepEqual(parseInsights({}), {});
  assert.deepEqual(parseInsights(null), {});
  assert.deepEqual(parseInsights({ data: [{ name: "a", values: [] }, { name: "b", values: [{ value: null }] }, { name: "c", values: [{ value: "12" }] }, { name: "d" }, { values: [{ value: 1 }] }, null, 7] }), {});
});
check("parseInsights: métrica duplicada conserva la primera", () => {
  assert.deepEqual(parseInsights({ data: [{ name: "reach", values: [{ value: 1 }] }, { name: "reach", values: [{ value: 9 }] }] }), { reach: 1 });
});

// --- unsupportedMetric ---
check("unsupportedMetric: nombra la métrica pedida", () => {
  const e = new GraphError("(#100) The Media Insights API does not support the views metric for this media", 100);
  assert.equal(unsupportedMetric(e, ["reach", "views"]), "views");
});
check("unsupportedMetric: posición metric[N] sin nombrar la métrica", () => {
  const e = new GraphError("(#100) metric[3] must be one of the following values: reach, saved", 100);
  assert.equal(unsupportedMetric(e, ["reach", "saved", "shares", "likes"]), "likes");
});
check("unsupportedMetric: cuota, token y mensaje sin métrica no cuentan", () => {
  assert.equal(unsupportedMetric(new GraphError("límite de uso de reach invalid", 4), ["reach"]), undefined);
  assert.equal(unsupportedMetric(new GraphError("token reach invalid", 190), ["reach"]), undefined);
  assert.equal(unsupportedMetric(new GraphError("La métrica no está soportada", 100), ["reach", "views"]), undefined);
  assert.equal(unsupportedMetric(new GraphError("metric[9] must be one of", 100), ["reach"]), undefined);
  assert.equal(unsupportedMetric("algo raro", ["reach"]), undefined);
});

// --- fetchMediaInsights ---
await checkAsync("fetchMediaInsights: reintenta sin views y mapea avg_watch_ms", async () => {
  const { get, calls } = fake((_p, params) => {
    const ms = String(params.metric).split(",");
    if (ms.includes("views")) throw new GraphError("(#100) The Media Insights API does not support the views metric for this media", 100);
    return insightsBody(ms);
  });
  const r = await fetchMediaInsights("1", "REELS", get);
  assert.deepEqual(r.descartadas, ["views"]);
  assert.equal(calls.length, 2);
  assert.ok(!metricsOf(calls[1]!).includes("views"));
  assert.equal(calls[0]!.path, "1/insights");
  const ms = metricsOf(calls[1]!);
  assert.equal(r.avg_watch_ms, ms.indexOf("ig_reels_avg_watch_time") + 1);
  assert.equal(r.views, undefined);
  assert.equal(r.reach, ms.indexOf("reach") + 1);
});
await checkAsync("fetchMediaInsights: post usa POST_METRICS y no pide métricas de reel", async () => {
  const { get, calls } = fake((_p, params) => insightsBody(String(params.metric).split(",")));
  const r = await fetchMediaInsights("2", "FEED", get);
  assert.deepEqual(metricsOf(calls[0]!), POST_METRICS);
  assert.deepEqual(r.descartadas, []);
  assert.ok(REEL_METRICS.includes("ig_reels_avg_watch_time") && REEL_METRICS.includes("ig_reels_video_view_total_time"));
});
await checkAsync("fetchMediaInsights: dos métricas inválidas → dos reintentos", async () => {
  const bad = new Set(["views", "shares"]);
  const { get, calls } = fake((_p, params) => {
    const ms = String(params.metric).split(",");
    const b = ms.find((m) => bad.has(m));
    if (b) throw new GraphError(`(#100) ${b} is not supported`, 100);
    return insightsBody(ms);
  });
  const r = await fetchMediaInsights("1", "REELS", get);
  assert.equal(calls.length, 3);
  assert.deepEqual([...r.descartadas].sort(), ["shares", "views"]);
});
await checkAsync("fetchMediaInsights: error que no nombra métrica (190) se relanza", async () => {
  const { get, calls } = fake(() => { throw new GraphError("token vencido", 190); });
  await assert.rejects(fetchMediaInsights("1", "REELS", get), /token vencido/);
  assert.equal(calls.length, 1);
});
await checkAsync("fetchMediaInsights: cuota (código 4) no es métrica inválida", async () => {
  const { get, calls } = fake(() => { throw new GraphError("Meta aplicó el límite de uso: reach is invalid", 4); });
  await assert.rejects(fetchMediaInsights("1", "REELS", get), /límite/);
  assert.equal(calls.length, 1);
});
await checkAsync("fetchMediaInsights: metric[N] sin nombrar descarta la posición", async () => {
  const { get, calls } = fake((_p, params) => {
    const ms = String(params.metric).split(",");
    if (ms.length === POST_METRICS.length) throw new GraphError("(#100) metric[3] must be one of the following values: reach, saved", 100);
    return insightsBody(ms);
  });
  const r = await fetchMediaInsights("1", "FEED", get);
  assert.deepEqual(r.descartadas, [POST_METRICS[3]]);
  assert.equal(calls.length, 2);
});
await checkAsync("fetchMediaInsights: tope de llamadas = métricas + 1 aunque todas fallen", async () => {
  const { get, calls } = fake((_p, params) => {
    const ms = String(params.metric).split(",");
    throw new GraphError(`${ms[0]} is not supported`, 100);
  });
  await assert.rejects(fetchMediaInsights("1", "REELS", get));
  assert.ok(calls.length <= REEL_METRICS.length + 1, `llamadas: ${calls.length}`);
});
await checkAsync("fetchMediaInsights: data vacío devuelve todo undefined", async () => {
  const { get } = fake(() => ({ data: [] }));
  const r = await fetchMediaInsights("1", "FEED", get);
  assert.equal(r.reach, undefined);
  assert.deepEqual(r.descartadas, []);
});

// --- fetchOwnMedia ---
const item = (id: string, ts: string) => ({ id, media_type: "IMAGE", media_product_type: "FEED", timestamp: ts });
await checkAsync("fetchOwnMedia: pagina con cursor y se detiene al pasar `since`", async () => {
  const pages: Record<string, unknown> = {
    "": { data: [item("a", "2026-10-05T10:00:00+0000"), item("b", "2026-10-04T10:00:00+0000")], paging: { cursors: { after: "C1" }, next: "x" } },
    C1: { data: [item("c", "2026-10-03T10:00:00+0000"), item("d", "2026-09-01T10:00:00+0000")], paging: { cursors: { after: "C2" }, next: "y" } },
    C2: { data: [item("e", "2026-08-01T10:00:00+0000")], paging: { cursors: { after: "C3" }, next: "z" } },
  };
  const { get, calls } = fake((_p, params) => pages[String(params.after ?? "")]);
  const r = await fetchOwnMedia(new Date("2026-10-01T00:00:00Z"), get, "IG1");
  assert.deepEqual(r.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.path, "IG1/media");
  assert.match(String(calls[0]!.params.fields), /media_product_type/);
});
await checkAsync("fetchOwnMedia: página vacía o cursor repetido no hace bucle", async () => {
  const a = fake((_p, params) => (params.after ? { data: [], paging: { cursors: { after: "C1" }, next: "x" } } : { data: [item("a", "2026-10-05T10:00:00+0000")], paging: { cursors: { after: "C1" }, next: "x" } }));
  assert.equal((await fetchOwnMedia(new Date("2026-01-01"), a.get, "IG")).length, 1);
  assert.equal(a.calls.length, 2);
  const b = fake((_p, _q, n) => ({ data: [item(`m${n}`, "2026-10-05T10:00:00+0000")], paging: { cursors: { after: "SAME" }, next: "x" } }));
  const r = await fetchOwnMedia(new Date("2026-01-01"), b.get, "IG");
  assert.ok(b.calls.length <= 2, `llamadas: ${b.calls.length}`);
  assert.equal(r.length, b.calls.length);
});
await checkAsync("fetchOwnMedia: tope de 20 páginas", async () => {
  const { get, calls } = fake((_p, _q, n) => ({ data: [item(`m${n}`, "2026-10-05T10:00:00+0000")], paging: { cursors: { after: `C${n}` }, next: "x" } }));
  await fetchOwnMedia(new Date("2026-01-01"), get, "IG");
  assert.equal(calls.length, 20);
});
await checkAsync("fetchOwnMedia: timestamps desordenados no pierden ni duplican", async () => {
  const { get } = fake(() => ({ data: [item("a", "2026-10-02T10:00:00+0000"), item("old", "2026-01-01T10:00:00+0000"), item("b", "2026-10-05T10:00:00+0000"), item("a", "2026-10-02T10:00:00+0000")] }));
  const r = await fetchOwnMedia(new Date("2026-10-01T00:00:00Z"), get, "IG");
  assert.deepEqual(r.map((m) => m.id), ["a", "b"]);
});
await checkAsync("fetchOwnMedia: error de red en la página 2 se propaga (no devuelve lista parcial)", async () => {
  const { get } = fake((_p, _q, n) => {
    if (n === 2) throw new GraphError("No pude conectar con la API de Meta (ETIMEDOUT).");
    return { data: [item("a", "2026-10-05T10:00:00+0000")], paging: { cursors: { after: "C1" }, next: "x" } };
  });
  await assert.rejects(fetchOwnMedia(new Date("2026-01-01"), get, "IG"), /No pude conectar/);
});
await checkAsync("fetchOwnMedia: sin data devuelve []", async () => {
  const { get } = fake(() => ({}));
  assert.deepEqual(await fetchOwnMedia(new Date("2026-01-01"), get, "IG"), []);
});

// --- fetchAccountInsights ---
const NOW = new Date("2026-10-06T12:00:00Z");
function accountFake(overrides: { online?: () => unknown } = {}) {
  return fake((path, params) => {
    if (path === "IG") return { followers_count: 42 };
    const metric = String(params.metric);
    if (metric === "follower_count") return { data: [{ name: "follower_count", values: [{ value: 1, end_time: "2026-10-04T07:00:00+0000" }, { value: 3, end_time: "2026-10-05T07:00:00+0000" }] }] };
    if (metric === "online_followers") return overrides.online ? overrides.online() : { data: [{ name: "online_followers", values: [{ value: { "0": 1, "14": 20 } }] }] };
    if (params.breakdown === "follow_type") {
      return { data: [{ name: "reach", total_value: { value: 100, breakdowns: [{ dimension_keys: ["follow_type"], results: [{ dimension_values: ["FOLLOWER"], value: 30 }, { dimension_values: ["NON_FOLLOWER"], value: 70 }] }] } }] };
    }
    return { data: [{ name: "reach", total_value: { value: 100 } }, { name: "accounts_engaged", total_value: { value: 9 } }] };
  });
}
// Adversario final 4 + R39: el día de follower_count es `end_time − 1 s` en la zona de la cuenta.
await checkAsync("fetchAccountInsights: follower_count → día real = end_time − 1 s en la zona de la cuenta (America/Los_Angeles por defecto)", async () => {
  const { get } = fake((_path, params) => (String(params.metric) === "follower_count"
    ? { data: [{ name: "follower_count", values: [
      { value: 1, end_time: "2026-10-13T07:00:00+0000" }, // fin del lunes 12 (PDT)
      { value: 5, end_time: "2026-10-14T07:00:00+0000" }, // fin del martes 13
      { value: 2, end_time: "2026-11-03T08:00:00+0000" }, // fin del lunes 2 de noviembre (PST, tras el cambio de hora)
    ] }] }
    : {}));
  const r = await fetchAccountInsights(NOW, get, "IG");
  assert.deepEqual(r.followerCount, [{ dia: "2026-10-12", valor: 1 }, { dia: "2026-10-13", valor: 5 }, { dia: "2026-11-02", valor: 2 }]);
  // Con otra zona configurada (config.json → zonaOnlineFollowers), el día se calcula en esa zona.
  const utc = await fetchAccountInsights(NOW, get, "IG", "UTC");
  assert.deepEqual(utc.followerCount.map((f) => f.dia), ["2026-10-13", "2026-10-14", "2026-11-03"]);
});

await checkAsync("fetchAccountInsights: arma todos los campos", async () => {
  const { get, calls } = accountFake();
  const r = await fetchAccountInsights(NOW, get, "IG");
  assert.equal(r.followers, 42);
  // end_time marca el FIN del día de Meta (07:00 UTC del día siguiente): el día real es el anterior.
  assert.deepEqual(r.followerCount, [{ dia: "2026-10-03", valor: 1 }, { dia: "2026-10-04", valor: 3 }]);
  assert.deepEqual(r.onlineFollowers, { "0": 1, "14": 20 });
  assert.equal(r.reach7d, 100);
  assert.equal(r.engaged7d, 9);
  assert.equal(r.reachNoSeguidores7d, 70);
  assert.deepEqual(r.errores, []);
  const fc = calls.find((c) => c.params.metric === "follower_count")!;
  assert.equal(Number(fc.params.until) - Number(fc.params.since), 30 * 86400);
  assert.equal(fc.params.period, "day");
});
await checkAsync("fetchAccountInsights: online_followers falla (< 100 seguidores) y el resto sigue", async () => {
  const { get } = accountFake({ online: () => { throw new GraphError("(#100) not enough followers", 100); } });
  const r = await fetchAccountInsights(NOW, get, "IG");
  assert.equal(r.onlineFollowers, undefined);
  assert.ok(r.errores.some((e) => e.includes("100 seguidores")));
  assert.equal(r.followers, 42);
  assert.equal(r.reach7d, 100);
  assert.equal(r.reachNoSeguidores7d, 70);
});
await checkAsync("fetchAccountInsights: todo falla → sin lanzar, con errores", async () => {
  const { get } = fake(() => { throw new GraphError("boom", 1); });
  const r = await fetchAccountInsights(NOW, get, "IG");
  assert.equal(r.followers, undefined);
  assert.deepEqual(r.followerCount, []);
  assert.ok(r.errores.length >= 4);
});
await checkAsync("fetchAccountInsights: respuestas raras (data vacío, value null) no rompen", async () => {
  const { get } = fake(() => ({ data: [{ name: "reach", total_value: { value: null, breakdowns: [] } }, { name: "follower_count", values: [] }] }));
  const r = await fetchAccountInsights(NOW, get, "IG");
  assert.equal(r.reach7d, undefined);
  assert.equal(r.reachNoSeguidores7d, undefined);
  assert.deepEqual(r.followerCount, []);
});

// --- ronda de fix 1 ---
check("invalidMetrics: deprecación nombra la muerta antes de la palabra clave y su reemplazo después", () => {
  const e = new GraphError("the views metric is no longer supported. Please use the reach metric instead", 100);
  assert.deepEqual(invalidMetrics(e, ["reach", "views"]), ["views"]);
});
check("invalidMetrics: lista de válidas sin índice descarta todas las no listadas de una vez", () => {
  const e = new GraphError("Param metric must be one of the following values: reach, saved", 100);
  assert.deepEqual(invalidMetrics(e, ["reach", "saved", "views", "shares"]), ["views", "shares"]);
});
check("invalidMetrics: lista que no incluye ninguna pedida no es confiable", () => {
  const e = new GraphError("metric must be one of the following values: foo, bar", 100);
  assert.deepEqual(invalidMetrics(e, ["reach", "saved"]), []);
});
check("invalidMetrics: español", () => {
  assert.deepEqual(invalidMetrics(new GraphError("La métrica views ya no es compatible", 100), ["reach", "views"]), ["views"]);
  assert.deepEqual(invalidMetrics(new GraphError("La API no admite la métrica views", 100), ["reach", "views"]), ["views"]);
});
check("invalidMetrics: cuota y permisos nunca cuentan, ni en español", () => {
  assert.deepEqual(invalidMetrics(new GraphError("views ya no disponible", 4), ["views"]), []);
  assert.deepEqual(invalidMetrics(new GraphError("views no admite permiso", 10), ["views"]), []);
});
await checkAsync("con igUserId explícito no se lee metaConfig() (sin .env)", async () => {
  const guardado = { t: process.env.META_ACCESS_TOKEN, i: process.env.META_IG_USER_ID };
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_IG_USER_ID;
  try {
    const { get } = fake(() => ({ data: [] }));
    assert.deepEqual(await fetchOwnMedia(new Date(0), get, "IG"), []);
    assert.deepEqual((await fetchAccountInsights(NOW, get, "IG")).followerCount, []);
  } finally {
    if (guardado.t !== undefined) process.env.META_ACCESS_TOKEN = guardado.t;
    if (guardado.i !== undefined) process.env.META_IG_USER_ID = guardado.i;
  }
});
