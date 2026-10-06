/**
 * Adversario T2: cliente de insights. Solo tests que fallan contra c7b5dca.
 * Todo con un `get` falso; cero red.
 */
import assert from "node:assert/strict";
import { checkAsync } from "../_check.ts";
import { GraphError } from "../../src/meta/client.ts";
import { fetchMediaInsights, POST_METRICS, type GraphGetFn } from "../../src/insights/client.ts";

const fakeGet = (fn: (metric: string[]) => unknown): { get: GraphGetFn; calls: string[][] } => {
  const calls: string[][] = [];
  const get = (async (_path: string, params?: Record<string, string | number | undefined>) => {
    const metric = String(params?.metric ?? "").split(",");
    calls.push(metric);
    return fn(metric);
  }) as unknown as GraphGetFn;
  return { get, calls };
};
const ok = { data: [{ name: "reach", values: [{ value: 9 }] }, { name: "saved", values: [{ value: 2 }] }] };
const silenciar = async <T>(f: () => Promise<T>): Promise<T> => {
  const w = console.warn;
  console.warn = () => {};
  try {
    return await f();
  } finally {
    console.warn = w;
  }
};

// Spec "Mejora 2": si Meta devuelve "metric not supported" se quita ESA métrica y se
// reintenta. Brief: unsupportedMetric = "Métrica que Meta dice no soportar en este error".
// Los avisos de deprecación de Meta nombran la métrica muerta y su reemplazo; el código
// toma la primera de la lista pedida que aparezca (reach) y descarta una métrica válida.
await checkAsync("adversario T2: aviso que nombra la métrica muerta y su reemplazo descarta el reemplazo (reach)", async () => {
  const { get } = fakeGet((m) => {
    if (m.includes("views")) {
      throw new GraphError("(#100) Starting from version v27.0, the views metric is no longer supported. Please use the reach metric instead.", 100);
    }
    return ok;
  });
  const r = await silenciar(() => fetchMediaInsights("1", "FEED", get));
  assert.deepEqual(r.descartadas, ["views"]);
  assert.equal(r.reach, 9);
});

// Spec "Manejo de errores": "Métrica que Meta deja de soportar: se descarta esa métrica y
// se registra; nunca falla la instantánea completa". Un "must be one of the following
// values" SIN índice lista las válidas: el código descarta reach, saved, ... (las válidas,
// una por llamada) hasta quedarse solo con views y relanza: la instantánea falla entera.
await checkAsync("adversario T2: 'must be one of' sin índice descarta las métricas válidas y termina relanzando", async () => {
  const validas = POST_METRICS.filter((m) => m !== "views");
  const { get, calls } = fakeGet((m) => {
    if (m.includes("views")) throw new GraphError(`(#100) Param metric must be one of the following values: ${validas.join(", ")}`, 100);
    return ok;
  });
  const r = await silenciar(() => fetchMediaInsights("1", "FEED", get));
  assert.deepEqual(r.descartadas, ["views"]);
  assert.equal(r.reach, 9);
  assert.ok(calls.length <= 2, `llamadas: ${calls.length}`);
});

// Mandato T2: "mensaje en otro idioma". translateGraphError usa `error_user_msg`
// (localizado al idioma del usuario) antes que `message`; con un mensaje en español que
// SÍ nombra la métrica, la lista de palabras clave solo en inglés no la reconoce y la
// instantánea falla entera (spec: "nunca falla la instantánea completa").
await checkAsync("adversario T2: error en español que nombra la métrica no soportada falla la instantánea completa", async () => {
  const { get } = fakeGet((m) => {
    if (m.includes("views")) {
      throw new GraphError(
        "Consulta inválida: falta un permiso o el campo no existe (La API de estadísticas de medios no admite la métrica views para este tipo de producto.)",
        100,
      );
    }
    return ok;
  });
  const r = await silenciar(() => fetchMediaInsights("1", "FEED", get));
  assert.deepEqual(r.descartadas, ["views"]);
  assert.equal(r.reach, 9);
});
