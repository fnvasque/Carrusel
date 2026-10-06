import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { closeDb, openDb } from "../../src/kb/db.ts";
import type { MediaInsights } from "../../src/insights/client.ts";
import { metricaCalibracion, tomarInstantaneas, type Instantanea, type PostInfo } from "../../src/insights/snapshots.ts";

async function conBase<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "adv3-"));
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

const H = 3_600_000;
const PUB = new Date("2026-10-12T22:30:00Z");
const post = (extra: Partial<PostInfo> = {}): PostInfo => ({
  mediaId: "m1", publicado: PUB, productType: "REELS", piezaId: "lun-reel-x", origen: "motor",
  duracionMs: 20000, nombreMotor: "lun-reel-x-motor", predictedScore: 82, ...extra,
});
const ins = (extra: Partial<MediaInsights> = {}): MediaInsights => ({
  reach: 200, saved: 10, shares: 4, likes: 30, comments: 2, views: 500, avg_watch_ms: 6000, total_watch_ms: 90000, descartadas: [], ...extra,
});
const silencio = async <T>(fn: () => Promise<T>): Promise<T> => {
  const w = console.warn;
  console.warn = () => {};
  try { return await fn(); } finally { console.warn = w; }
};

// Brief T3, Step 2: "actualiza `_metricas/posts.json` (última por post)"; spec: "posts.json — última
// instantánea por post". Mandato: "`posts.json` corrupto en disco". Tras la reparación, m1 (con fila en
// SQLite y su PostInfo en la lista) desaparece de posts.json para siempre.
await checkAsync("adversario T3: posts.json corrupto se 'reconstruye' perdiendo la última instantánea de los demás posts", () =>
  conBase(async (dir) => {
    openDb();
    const fetch = async () => ins();
    const p1 = post({ mediaId: "m1", publicado: PUB });
    const p2 = post({ mediaId: "m2", publicado: new Date(PUB.getTime() + 20 * H) });
    await silencio(() => tomarInstantaneas(new Date(PUB.getTime() + 24 * H), { fetch, posts: [p1, p2], metricsDir: join(dir, "m"), refresh: async () => null }));
    const ruta = join(dir, "_metricas", "posts.json");
    assert.ok(JSON.parse(readFileSync(ruta, "utf8")).m1, "m1 debía estar antes de corromper");
    writeFileSync(ruta, "{ \"m1\": { trunc", "utf8");
    // Pasada siguiente: toca la 24 h de m2 (m1 no tiene ventana debida hasta las 71 h; m2 cumple 24 h a las 44 h).
    await silencio(() => tomarInstantaneas(new Date(PUB.getTime() + 44 * H), { fetch, posts: [p1, p2], metricsDir: join(dir, "m"), refresh: async () => null }));
    const posts = JSON.parse(readFileSync(ruta, "utf8"));
    assert.ok(posts.m2, "m2 presente");
    assert.ok(posts.m1, "m1 (con instantánea en SQLite) desapareció de posts.json");
  }));

// Brief T3, Step 1: "La comparación entre piezas usa solo `7d` con desvío ≤ 6 h; las tardías de 7 d más
// allá de eso quedan fuera del bucle." Spec "Mejora 3 — Bucle de feedback", tabla: "Instantánea 7 d →
// `metrics/*.json` | Calibración del score". Bot caído 3 días: la "7d" se toma a los 10 d y entra igual.
await checkAsync("adversario T3: una 7d tardía (desvío 72 h > 6 h) alimenta metrics/ y la calibración", () =>
  conBase(async (dir) => {
    openDb();
    const metricsDir = join(dir, "metrics-out");
    let refrescos = 0;
    const now = new Date(PUB.getTime() + (168 + 72) * H);
    const r = await silencio(() => tomarInstantaneas(now, { fetch: async () => ins(), posts: [post()], metricsDir, refresh: async () => { refrescos++; return null; } }));
    assert.equal(r[0]?.ventana, "7d");
    assert.equal(existsSync(join(metricsDir, "lun-reel-x-motor.json")), false, "escribió metrics/ con una 7d tardía");
    assert.equal(refrescos, 0, "refrescó la calibración con una 7d tardía");
  }));

// Spec, "Manejo de errores": "Métrica que Meta deja de soportar: se descarta esa métrica". El brief exige
// el formato de record.ts, que se niega a registrar sin saves/shares ("Faltan métricas: --saves, --shares
// y --reach (>0) son obligatorias"). Con `saved` descartado, el puente inventa saves 0 / savesPerK 0.
check("adversario T3: métrica 'saved' descartada por Meta se escribe como saves 0 en la calibración", () => {
  const i = {
    mediaId: "m1", ventana: "7d", tomadaEn: "2026-10-19T22:30:00.000Z", origen: "motor", derivadas: {},
    ...ins({ saved: undefined, descartadas: ["saved"] }),
  } as Instantanea;
  const m = metricaCalibracion(i, "x", 82);
  assert.ok(m === undefined || m.savesPerK !== 0, `inventó savesPerK=${m?.savesPerK} con 'saved' ausente`);
});
