import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { UMBRAL_CORRECCION, leerPuertaCorreccion, puertaCorreccion, slidesACorregir } from "../../src/calendario/correccion-fondos.ts";
import type { Borrador } from "../../src/calendario/draft.ts";
import { semanaDir } from "../../src/calendario/plan.ts";
import { leerVisual, visualPath, type VeredictoImagen } from "../../src/calendario/visual.ts";

check("correccion-fondos: con interruptor, 30 respondidos y precisión 0,8 la puerta está activa", () => {
  assert.deepEqual(UMBRAL_CORRECCION, { respondidos: 30, precision: 0.8 });
  const p = puertaCorreccion(true, { respondidos: 30, precision: 0.8 });
  assert.equal(p.activa, true);
  assert.equal(p.respondidos, 30);
  assert.equal(p.precision, 0.8);
  assert.equal(puertaCorreccion(true, { respondidos: 34, precision: 0.86 }).motivo, "activa (precisión 0,86 con 34 respondidos)");
});

check("correccion-fondos: interruptor apagado o ausente deja la puerta inactiva", () => {
  for (const i of [false, undefined, null, "true", 1]) {
    const p = puertaCorreccion(i, { respondidos: 50, precision: 0.95 });
    assert.equal(p.activa, false);
    assert.equal(p.motivo, "apagada en config.json");
  }
});

check("correccion-fondos: menos de 30 respondidos, precisión baja o ausente la dejan inactiva", () => {
  const pocos = puertaCorreccion(true, { respondidos: 12, precision: 0.9 });
  assert.equal(pocos.activa, false);
  assert.equal(pocos.motivo, "solo 12 avisos respondidos (faltan 18)");
  assert.equal(puertaCorreccion(true, { respondidos: 29, precision: 0.99 }).activa, false);
  const baja = puertaCorreccion(true, { respondidos: 40, precision: 0.79 });
  assert.equal(baja.activa, false);
  assert.equal(baja.motivo, "precisión 0,79 < 0,8");
  assert.equal(puertaCorreccion(true, { respondidos: 40, precision: 0.72 }).motivo, "precisión 0,72 < 0,8");
  const sin = puertaCorreccion(true, { respondidos: 40 });
  assert.equal(sin.activa, false);
  assert.equal(sin.precision, undefined);
});

async function conKb(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "correccion-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

await checkAsync("correccion-fondos: leerPuertaCorreccion con config corrupto o ausente queda inactiva sin lanzar", async () => {
  await conKb(async (dir) => {
    const ausente = await leerPuertaCorreccion();
    assert.equal(ausente.activa, false);
    mkdirSync(join(dir, "_calendario"), { recursive: true });
    writeFileSync(join(dir, "_calendario", "config.json"), "{roto");
    const p = await leerPuertaCorreccion();
    assert.equal(p.activa, false);
    assert.ok(p.motivo.length > 0);
  });
});

await checkAsync("correccion-fondos: leerPuertaCorreccion suma las semanas con visual.json y respeta el interruptor", async () => {
  await conKb(async (dir) => {
    const cal = join(dir, "_calendario");
    mkdirSync(join(cal, "2026-10-19"), { recursive: true });
    mkdirSync(join(cal, "2026-10-26"), { recursive: true }); // sin visual.json: no cuenta
    writeFileSync(join(cal, "config.json"), JSON.stringify({ revisionVisual: { corregir: true } }));
    const pieza = { fase1: [], revisor: { imagenes: [], avisos: [] } };
    writeFileSync(join(cal, "2026-10-19", "visual.json"), JSON.stringify({ a: pieza }));
    const p0 = await leerPuertaCorreccion();
    assert.equal(p0.activa, false);
    assert.equal(p0.respondidos, 0);
    writeFileSync(join(cal, "config.json"), JSON.stringify({ revisionVisual: { corregir: false } }));
    assert.equal((await leerPuertaCorreccion()).motivo, "apagada en config.json");
  });
});

// --- Qué slides corregir (fase 3) ---
const bor = (slides: { template: string; background?: unknown }[]): Borrador => ({ name: "x", pillar: "herramienta", slides: slides.map((s) => ({ props: {}, ...s })) }) as unknown as Borrador;
const vd = (slide: number | undefined, o: Partial<VeredictoImagen> = {}): VeredictoImagen => ({ n: 1, que: "portada", ...(slide !== undefined ? { slide } : {}), compite: true, ajeno: false, frase: "f", ...o });

check("slidesACorregir: hook con fondo ai y aviso en la portada → [0]", () => {
  const b = bor([{ template: "Hook", background: { ai: "oficina" } }, { template: "Cta" }]);
  assert.deepEqual(slidesACorregir(b, [vd(0)], []), [0]);
  assert.deepEqual(slidesACorregir(b, [vd(0, { compite: false, ajeno: true })], []), [0]);
  assert.deepEqual(slidesACorregir(b, [vd(0, { compite: false, ajeno: false })], []), []);
});

check("slidesACorregir: una escena Clip nunca se corrige", () => {
  const b = bor([{ template: "Hook" }, { template: "Clip", background: { ai: "clip" } }]);
  assert.deepEqual(slidesACorregir(b, [vd(1, { que: "escena 2 (Clip) a 1 s" })], []), []);
});

check("slidesACorregir: un Step sin fondo ai (o con image) no se corrige", () => {
  const b = bor([{ template: "Hook" }, { template: "Step" }, { template: "Step", background: { image: "f.jpg" } }]);
  assert.deepEqual(slidesACorregir(b, [vd(1), vd(2)], []), []);
});

check("slidesACorregir: dos avisos de la misma slide cuentan una vez y el resultado va ordenado", () => {
  const b = bor([{ template: "Hook", background: { ai: "a" } }, { template: "Step", background: { ai: "b" } }, { template: "Cta", background: { ai: "c" } }]);
  assert.deepEqual(slidesACorregir(b, [vd(2), vd(1, { n: 2 }), vd(1, { n: 3, que: "escena 2 (Step) final" })], []), [1, 2]);
});

check("slidesACorregir: una slide ya quitada por el tope no se corrige", () => {
  const b = bor([{ template: "Hook", background: { ai: "a" } }, { template: "Step", background: { ai: "b" } }]);
  assert.deepEqual(slidesACorregir(b, [vd(0), vd(1)], [0]), [1]);
  assert.deepEqual(slidesACorregir(b, [vd(0)], [0]), []);
});

check("slidesACorregir: sin slide válido o fuera de rango falla seguro", () => {
  const b = bor([{ template: "Hook", background: { ai: "a" } }]);
  const malos = [vd(undefined), vd(-1), vd(1), vd(0.5), { ...vd(0), slide: "0" as unknown as number }, { ...vd(0), slide: NaN }];
  assert.deepEqual(slidesACorregir(b, malos, []), []);
});

await checkAsync("leerVisual: conserva una correccion válida y descarta la mal formada", async () => {
  await conKb(async () => {
    const sem = "2026-10-26";
    mkdirSync(semanaDir(sem), { recursive: true });
    writeFileSync(visualPath(sem), JSON.stringify({
      ok: { correccion: { en: "2026-10-26T10:00:00Z", estado: "aplicada", slides: [0, 2], motivo: "m" } },
      ok2: { correccion: { en: "x", estado: "omitida", slides: [] } },
      malaEstado: { correccion: { en: "x", estado: "rara", slides: [] } },
      malaSlides: { correccion: { en: "x", estado: "fallida", slides: [0, -1] } },
      malaEn: { correccion: { estado: "fallida", slides: [] } },
      malaMotivo: { correccion: { en: "x", estado: "fallida", slides: [], motivo: 3 } },
      noObjeto: { correccion: "sí" },
    }));
    const v = await leerVisual(sem);
    assert.deepEqual(v.ok.correccion, { en: "2026-10-26T10:00:00Z", estado: "aplicada", slides: [0, 2], motivo: "m" });
    assert.ok(v.ok2.correccion);
    for (const k of ["malaEstado", "malaSlides", "malaEn", "malaMotivo", "noObjeto"]) assert.equal("correccion" in v[k], false, k);
  });
});
