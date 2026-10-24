import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import {
  MARGEN_CORRECCION_MS, MAX_CORRECCIONES_POR_CORRIDA, SIN_CACHE, SIN_CACHE_VOZ, SIN_MARGEN_TRAS_SUBIR, nombresCorregidos, UMBRAL_CORRECCION, corregirFondos, fondosAiConservados, leerPuertaCorreccion, narracionesDelReel, puertaCorreccion, recuperarCorreccionesCortadas, slidesACorregir,
  type DepsCorreccion, type PuertaCorreccion,
} from "../../src/calendario/correccion-fondos.ts";
import type { Borrador } from "../../src/calendario/draft.ts";
import { parsePlan, semanaDir, type RenderEntry, type SemanaLeida } from "../../src/calendario/plan.ts";
import { ErrorContenido, MANIFIESTO, armarMedios, baseArchivo, type EnvRender } from "../../src/calendario/render.ts";
import { resolverMedio } from "../../src/calendario/media-server.ts";
import { revisarRenderizadas, type DepsRevision } from "../../src/calendario/revision-fondos.ts";
import { claveFila } from "../../src/calendario/scheduler.ts";
import { previewEntregado, previewsPendientes } from "../../src/calendario/telegram.ts";
import { ErrorVisual } from "../../src/render/revision.ts";
import { HECHO, RESPALDO } from "../../src/calendario/hook-video.ts";
import { fondoEnCache, generateBackground, rutaCacheFondo } from "../../src/ai/openaiImage.ts";
import { applyBrandStyle } from "../../src/render/background.ts";
import { enCacheVoz, rutaCacheVoz, sintetizar, VOZ_DEFECTO } from "../../src/reel/voz.ts";
import { leerVisual, visualPath, type RevisionPieza, type VeredictoImagen, type VisualJson, type VisualPieza } from "../../src/calendario/visual.ts";

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

await checkAsync("correccion-fondos: leerPuertaCorreccion compara la precisión sin redondear (159 de 200 = 0,795 → inactiva)", async () => {
  await conKb(async (dir) => {
    const cal = join(dir, "_calendario");
    const sem = "2026-10-19";
    mkdirSync(join(cal, sem), { recursive: true });
    writeFileSync(join(cal, "config.json"), JSON.stringify({ revisionVisual: { corregir: true } }));
    const imagenes = Array.from({ length: 200 }, (_, i) => ({ n: i + 1, que: "x", compite: true, ajeno: false, frase: "" }));
    writeFileSync(join(cal, sem, "visual.json"), JSON.stringify({ p: { revisor: { en: "x", modelo: "m", estado: "revisado", usd: 0, imagenes } } }));
    const lineas = imagenes.map((v, i) => JSON.stringify({ id: "p", n: v.n, respuesta: i < 159 ? "si" : "no", en: "2026-10-20T10:00:00Z" }));
    writeFileSync(join(cal, sem, "visual-respuestas.jsonl"), `${lineas.join("\n")}\n`);
    const p = await leerPuertaCorreccion();
    assert.equal(p.respondidos, 200);
    assert.equal(p.activa, false, p.motivo);
    assert.match(p.motivo, /precisión 0,79 < 0,8/);
    // 160 de 200 = 0,8 justo: activa.
    const lineas2 = imagenes.map((v, i) => JSON.stringify({ id: "p", n: v.n, respuesta: i < 160 ? "si" : "no", en: "2026-10-20T10:00:00Z" }));
    writeFileSync(join(cal, sem, "visual-respuestas.jsonl"), `${lineas2.join("\n")}\n`);
    assert.equal((await leerPuertaCorreccion()).activa, true);
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

// --- Re-render corregido y nueva subida (Task 3) ---
// Base temporal (KB_DIR) con plan y borrador; outRoot temporal con la carpeta final ya
// subida; rsync «sube» a una carpeta local (el servidor); deps falsas sin Chromium ni red.

const SEM = "2026-10-26";
// Lunes 26-oct-2026 12:00 en Chile (UTC-3) = 15:00Z.
const T0 = new Date("2026-10-26T15:00:00Z");
const EN_ORIGINAL = "2026-10-26T13:00:00.000Z";
const ENV_C: EnvRender = { base: "https://media.test/m", token: "tok123", host: "", dir: "" };
const ARCH = ["reel.mp4", "cover.jpg", "story.jpg"];
/** Pendiente 2: la versión corregida va con nombres nuevos (`cover.jpg` → `cover-c1.jpg`). */
const ARCH_C1 = ["reel-c1.mp4", "cover-c1.jpg", "story-c1.jpg"];
/** Lo que vería el bot en el servidor con unos medios de render.json: el contenido de cada archivo. */
const servidorSegun = (m: MundoC, id: string, medios: RenderEntry["medios"]): string[] => {
  const nombres = [...(medios?.archivos ?? []), medios?.cover, medios?.story].filter((a): a is string => !!a);
  return nombres.map((a) => (existsSync(join(m.server, SEM, id, a)) ? leer(join(m.server, SEM, id, a)) : `falta ${a}`));
};
const PUERTA_ON: PuertaCorreccion = { activa: true, motivo: "activa", respondidos: 30, precision: 0.9 };

function piezaPlan(id: string, hora: string): Record<string, unknown> {
  return {
    id, dia: SEM, hora, formato: "reel", arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "herramienta",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador: `${id}.json`, estado: "planificado",
  };
}
const BOR_AI = {
  name: "x", pillar: "herramienta",
  slides: [
    { template: "Hook", props: { title: "Tres atajos para tu correo" }, background: { ai: "oficina" } },
    { template: "Cta", props: { title: "Guárdalo", subtitle: "y pruébalo hoy" }, background: { ai: "escritorio" } },
  ],
};
// Solo la portada con fondo ai: tres piezas caben en el tope de 3 fondos ai por semana.
const BOR_UNO = { ...BOR_AI, slides: [BOR_AI.slides[0], { template: "Cta", props: BOR_AI.slides[1].props }] };
const revisorCon = (imagenes: VeredictoImagen[]): RevisionPieza => ({ en: T0.toISOString(), modelo: "gpt-4o", estado: "revisado", imagenes, usd: 0.01 });
const AVISO_PORTADA = revisorCon([{ n: 1, que: "portada", slide: 0, compite: true, ajeno: false, frase: "compite" }, { n: 2, que: "escena 2 (Cta) a 0 s", slide: 1, compite: false, ajeno: false, frase: "ok" }]);

interface MundoC {
  out: string;
  server: string;
  semanas: SemanaLeida[];
  visual: Map<string, Record<string, VisualPieza>>;
  reloj: { t: number };
  reg: { render: { id: string; quitar: { slide: number; motivo: string }[] }[]; rsync: { local: string; remoto: string; contenido: string }[]; verificar: string[]; render_json: [string, string, RenderEntry][]; avisos: string[]; logs: string[] };
}

const leer = (f: string): string => readFileSync(f, "utf8");

async function conMundoC(
  piezas: Record<string, unknown>[],
  visualInicial: Record<string, VisualPieza>,
  fn: (m: MundoC, deps: (o?: Partial<DepsCorreccion>) => DepsCorreccion) => Promise<void>,
  estado: SemanaLeida["estado"] = {},
  bor: unknown = BOR_AI,
): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), "corr-base-"));
  const out = mkdtempSync(join(tmpdir(), "corr-out-"));
  const server = mkdtempSync(join(tmpdir(), "corr-server-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = base;
  try {
    const sd = semanaDir(SEM);
    mkdirSync(sd, { recursive: true });
    const planRaw = { semana: SEM, zona: "America/Santiago", experimento: null, piezas };
    writeFileSync(join(sd, "plan.json"), JSON.stringify(planRaw));
    const render: Record<string, RenderEntry> = {};
    for (const p of piezas) {
      const id = p.id as string;
      writeFileSync(join(sd, `${id}.json`), JSON.stringify(bor));
      const final = join(out, SEM, id);
      mkdirSync(final, { recursive: true });
      for (const a of ARCH) writeFileSync(join(final, a), "viejo");
      writeFileSync(join(final, MANIFIESTO), JSON.stringify({ archivos: ARCH, duracionMs: 4900 }));
      mkdirSync(join(server, SEM, id), { recursive: true });
      for (const a of ARCH) writeFileSync(join(server, SEM, id, a), "viejo");
      render[id] = { estado: "renderizado", medios: { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg", duracionMs: 4900 }, en: EN_ORIGINAL };
    }
    const semanas: SemanaLeida[] = [{ semana: SEM, plan: parsePlan(JSON.stringify(planRaw)), render, estado }];
    const visual = new Map<string, Record<string, VisualPieza>>([[SEM, structuredClone(visualInicial)]]);
    const reloj = { t: T0.getTime() };
    const m: MundoC = { out, server, semanas, visual, reloj, reg: { render: [], rsync: [], verificar: [], render_json: [], avisos: [], logs: [] } };
    const deps = (o: Partial<DepsCorreccion> = {}): DepsCorreccion => ({
      render: async (p, tmp, quitar) => {
        m.reg.render.push({ id: p.pieza.id, quitar });
        assert.ok(p.semana === SEM || p.semana === "2026-11-02", p.semana); // SEM2 solo en los tests del tope
        assert.equal(p.borradorPath, join(semanaDir(p.semana), p.pieza.borrador));
        mkdirSync(tmp, { recursive: true });
        for (const a of ARCH) writeFileSync(join(tmp, a), "nuevo");
        return { archivos: [...ARCH], duracionMs: 4900, escenas: [{ start: 0, dur: 4 }, { start: 4, dur: 0.9 }] };
      },
      rsync: async (local, remoto) => {
        // Copia como el rsync real (sin el manifiesto ni --delete) a la carpeta «servidor»:
        // todo archivo de la carpeta local, con su nombre; lo que ya estaba en el servidor queda.
        const destino = join(server, remoto);
        mkdirSync(destino, { recursive: true });
        const archivos = readdirSync(local).filter((a) => !a.startsWith("."));
        for (const a of archivos) writeFileSync(join(destino, a), leer(join(local, a)));
        const cover = archivos.find((a) => /^cover(-c\d+)?\.jpg$/.test(a));
        m.reg.rsync.push({ local, remoto, contenido: cover ? leer(join(local, cover)) : "" });
      },
      verificar: async (url) => {
        m.reg.verificar.push(url);
        return true;
      },
      escribirRender: async (s, id, e) => void m.reg.render_json.push([s, id, structuredClone(e)]),
      escribirVisual: async (s, id, e) => {
        const v = visual.get(s) ?? {};
        v[id] = structuredClone(e);
        visual.set(s, v);
      },
      leerVisual: async (s) => structuredClone(visual.get(s) ?? {}) as VisualJson,
      avisar: async (t) => {
        m.reg.avisos.push(t);
        return true;
      },
      log: (t) => m.reg.logs.push(t),
      ahora: () => new Date(reloj.t),
      // Los fondos ai que el re-render conserva están en caché (I3 tiene sus propios tests).
      enCache: () => true,
      ...o,
    });
    await fn(m, deps);
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    for (const d of [base, out, server]) rmSync(d, { recursive: true, force: true });
  }
}

const restos = (out: string, id: string): string[] => readdirSync(join(out, SEM)).filter((f) => f.startsWith(`${id}.`));

await checkAsync("corregirFondos: pieza a 2 h → re-render sin la slide 0, sube con nombres nuevos, verifica, render.json con en nuevo apuntando a ellos y correccion aplicada", () =>
  conMundoC([piezaPlan("lun-reel-dos", "14:00")], { "lun-reel-dos": { revisor: AVISO_PORTADA, fase1: [] } }, async (m, deps) => {
    assert.equal(MARGEN_CORRECCION_MS, 30 * 60_000);
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-dos" }], m.out, ENV_C, PUERTA_ON, deps());
    assert.deepEqual(r, { aplicadas: 1, fallidas: 0, omitidas: 0 });
    assert.equal(m.reg.render.length, 1);
    assert.deepEqual(m.reg.render[0].quitar.map((q) => q.slide), [0]);
    assert.match(m.reg.render[0].quitar[0].motivo, /revisor visual/);
    assert.equal(m.reg.rsync.length, 1);
    assert.equal(m.reg.rsync[0].local, join(m.out, SEM, "lun-reel-dos"));
    assert.equal(m.reg.rsync[0].remoto, `/${SEM}/lun-reel-dos/`);
    // Pendiente 2: la versión corregida sube con nombres nuevos; los originales siguen intactos.
    for (const a of ARCH_C1) assert.equal(leer(join(m.server, SEM, "lun-reel-dos", a)), "nuevo", a);
    for (const a of ARCH) assert.equal(leer(join(m.server, SEM, "lun-reel-dos", a)), "viejo", a);
    assert.equal(m.reg.verificar.length, ARCH.length);
    assert.ok(m.reg.verificar.every((u) => u.startsWith("https://media.test/m/")));
    assert.deepEqual(m.reg.verificar.map((u) => u.slice(u.lastIndexOf("/") + 1)).sort(), [...ARCH_C1].sort(), "verifica los nombres nuevos");
    assert.equal(m.reg.render_json.length, 1);
    const [s, id, e] = m.reg.render_json[0];
    assert.equal(s, SEM);
    assert.equal(id, "lun-reel-dos");
    assert.equal(e.estado, "renderizado");
    assert.ok(e.en > EN_ORIGINAL, "en posterior al original");
    assert.deepEqual(e.medios, { archivos: ["reel-c1.mp4"], cover: "cover-c1.jpg", story: "story-c1.jpg", duracionMs: 4900 });
    assert.deepEqual(servidorSegun(m, "lun-reel-dos", e.medios), ["nuevo", "nuevo", "nuevo"], "render.json nuevo → archivos nuevos");
    assert.deepEqual(servidorSegun(m, "lun-reel-dos", m.semanas[0].render["lun-reel-dos"].medios), ["viejo", "viejo", "viejo"], "render.json viejo → archivos viejos");
    const v = m.visual.get(SEM)!["lun-reel-dos"];
    assert.equal(v.correccion?.estado, "aplicada");
    assert.deepEqual(v.correccion?.slides, [0]);
    assert.ok(v.revisor, "conserva el revisor");
    assert.deepEqual(v.fase1, [], "conserva fase1");
    // Carpeta final = render nuevo (solo los nombres nuevos), con manifiesto; sin previa ni tmp.
    const final = join(m.out, SEM, "lun-reel-dos");
    assert.equal(leer(join(final, "cover-c1.jpg")), "nuevo");
    assert.deepEqual(readdirSync(final).sort(), [MANIFIESTO, ...ARCH_C1].sort());
    assert.deepEqual(JSON.parse(leer(join(final, MANIFIESTO))).archivos, ARCH_C1);
    assert.deepEqual(restos(m.out, "lun-reel-dos"), [], "sin .prev- ni .tmp-corr-");
    assert.equal(m.reg.avisos.length, 0);

    // Review Focus 5: con el render.json reescrito, el preview vuelve a salir exactamente una vez.
    // I2: con el criterio real del bot (`previewEntregado`: guarda la HORA de entrega y compara
    // `renderEn > v`), no un `en` exacto. El original se entregó a las T0 − 1 h (después de su render).
    const entregas = new Map<string, string>([[claveFila(SEM, "lun-reel-dos"), "2026-10-26T14:00:00.000Z"]]);
    const enviado = (k: string, en: string): boolean => previewEntregado(en, entregas.get(k));
    assert.equal(previewsPendientes(m.semanas, T0, enviado).length, 0, "el original ya tenía preview");
    const tras: SemanaLeida[] = [{ ...m.semanas[0], render: { ...m.semanas[0].render, [id]: e } }];
    const p1 = previewsPendientes(tras, T0, enviado);
    assert.equal(p1.length, 1, "un preview nuevo");
    assert.equal(p1[0].pieza.id, "lun-reel-dos");
    entregas.set(claveFila(SEM, "lun-reel-dos"), new Date(new Date(e.en).getTime() + 60_000).toISOString());
    assert.equal(previewsPendientes(tras, T0, enviado).length, 0, "y solo uno");
  }),
);

await checkAsync("corregirFondos: pieza a 20 min → omitida «sin margen antes de la hora», sin render", () =>
  conMundoC([piezaPlan("lun-reel-cerca", "12:30")], { "lun-reel-cerca": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    m.reloj.t = new Date("2026-10-26T15:10:00Z").getTime(); // 12:10 local: faltan 20 min
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-cerca" }], m.out, ENV_C, PUERTA_ON, deps());
    assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 1 });
    assert.equal(m.reg.render.length, 0);
    assert.equal(m.reg.rsync.length, 0);
    assert.equal(m.reg.render_json.length, 0);
    const c = m.visual.get(SEM)!["lun-reel-cerca"].correccion;
    assert.equal(c?.estado, "omitida");
    assert.equal(c?.motivo, "sin margen antes de la hora");
    assert.deepEqual(c?.slides, [0]);
    assert.ok(m.visual.get(SEM)!["lun-reel-cerca"].revisor, "conserva el revisor");
  }),
);

await checkAsync("corregirFondos: la hora cruza el margen durante el render → omitida antes de rsync, original restaurado, render.json intacto", () =>
  conMundoC([piezaPlan("lun-reel-lento", "14:00")], { "lun-reel-lento": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const base = deps();
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-lento" }], m.out, ENV_C, PUERTA_ON, {
      ...base,
      render: async (p, tmp, quitar) => {
        const x = await base.render(p, tmp, quitar);
        m.reloj.t = new Date("2026-10-26T16:40:00Z").getTime(); // 13:40 local: faltan 20 min
        return x;
      },
    });
    assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 1 });
    assert.equal(m.reg.render.length, 1);
    assert.equal(m.reg.rsync.length, 0, "no sube");
    assert.equal(m.reg.render_json.length, 0, "render.json no se toca");
    const final = join(m.out, SEM, "lun-reel-lento");
    assert.equal(leer(join(final, "cover.jpg")), "viejo", "queda el original");
    assert.ok(existsSync(join(final, MANIFIESTO)));
    assert.deepEqual(restos(m.out, "lun-reel-lento"), []);
    assert.equal(leer(join(m.server, SEM, "lun-reel-lento", "cover.jpg")), "viejo");
    const c = m.visual.get(SEM)!["lun-reel-lento"].correccion;
    assert.equal(c?.estado, "omitida");
    assert.equal(c?.motivo, "sin margen antes de la hora");
  }),
);

// Pendiente 2 (cambio de contrato a propósito): antes el caso (c) quedaba «aplicada» porque la
// subida pisaba los mismos nombres; ahora los corregidos van con nombres nuevos y render.json sigue
// apuntando a los originales, así que se publica el original: «omitida», sin aviso.
await checkAsync("corregirFondos: la hora cruza el margen durante la subida → omitida, render.json intacto, se publica el original y el Mac vuelve a él", () =>
  conMundoC([piezaPlan("lun-reel-subida", "14:00")], { "lun-reel-subida": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const base = deps();
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-subida" }], m.out, ENV_C, PUERTA_ON, {
      ...base,
      rsync: async (l, rem) => {
        await base.rsync(l, rem);
        m.reloj.t = new Date("2026-10-26T16:45:00Z").getTime();
      },
    });
    assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 1 });
    assert.equal(m.reg.render_json.length, 0, "render.json no se reescribe sin margen (no manda un preview nuevo)");
    assert.equal(m.reg.rsync.length, 1, "no vuelve a subir nada");
    const final = join(m.out, SEM, "lun-reel-subida");
    assert.equal(leer(join(final, "cover.jpg")), "viejo", "el Mac vuelve al original, el que nombra render.json");
    assert.ok(existsSync(join(final, MANIFIESTO)));
    assert.deepEqual(restos(m.out, "lun-reel-subida"), []);
    assert.deepEqual(servidorSegun(m, "lun-reel-subida", m.semanas[0].render["lun-reel-subida"].medios), ["viejo", "viejo", "viejo"], "el bot publica el original, entero");
    const c = m.visual.get(SEM)!["lun-reel-subida"].correccion;
    assert.equal(c?.estado, "omitida", "la corrección no se publica");
    assert.equal(c?.motivo, SIN_MARGEN_TRAS_SUBIR);
    assert.equal(m.reg.avisos.length, 0);
  }),
);

// Pendiente 2 (cambio de contrato): ya no se re-sube el original al fallar; nunca se pisó.
await checkAsync("corregirFondos: rsync falla → fallida, original restaurado en el Mac, sin re-subida (el servidor nunca perdió el original), un aviso, render.json intacto", () =>
  conMundoC([piezaPlan("lun-reel-rsync", "14:00")], { "lun-reel-rsync": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const base = deps();
    let n = 0;
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-rsync" }], m.out, ENV_C, PUERTA_ON, {
      ...base,
      rsync: async (l, rem) => {
        n++;
        if (n === 1) {
          // Subida a medias: un archivo nuevo alcanzó a llegar (con su nombre nuevo).
          writeFileSync(join(m.server, rem, "cover-c1.jpg"), leer(join(l, "cover-c1.jpg")));
          throw new Error("rsync terminó con código 12");
        }
        await base.rsync(l, rem);
      },
    });
    assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 });
    assert.equal(m.reg.render_json.length, 0);
    const final = join(m.out, SEM, "lun-reel-rsync");
    assert.equal(leer(join(final, "cover.jpg")), "viejo", "original restaurado en el Mac");
    assert.deepEqual(servidorSegun(m, "lun-reel-rsync", m.semanas[0].render["lun-reel-rsync"].medios), ["viejo", "viejo", "viejo"], "el servidor sigue con el original que nombra render.json");
    assert.equal(n, 1, "sin segunda subida");
    assert.deepEqual(restos(m.out, "lun-reel-rsync"), []);
    assert.equal(m.reg.avisos.length, 1);
    assert.match(m.reg.avisos[0], /código 12/);
    const c = m.visual.get(SEM)!["lun-reel-rsync"].correccion;
    assert.equal(c?.estado, "fallida");
    assert.match(c?.motivo ?? "", /código 12/);
  }),
);

await checkAsync("corregirFondos: verificar en false o re-render con ErrorVisual/ErrorContenido → fallida, original intacto, un aviso cada una", () =>
  conMundoC([piezaPlan("lun-reel-ver", "14:00"), piezaPlan("lun-reel-vis", "15:00"), piezaPlan("lun-reel-con", "16:00")],
    { "lun-reel-ver": { revisor: AVISO_PORTADA }, "lun-reel-vis": { revisor: AVISO_PORTADA }, "lun-reel-con": { revisor: AVISO_PORTADA } },
    async (m, deps) => {
      const base = deps();
      const r = await corregirFondos(m.semanas, ["lun-reel-ver", "lun-reel-vis", "lun-reel-con"].map((id) => ({ semana: SEM, id })), m.out, ENV_C, PUERTA_ON, {
        ...base,
        render: async (p, tmp, q) => {
          if (p.pieza.id === "lun-reel-vis") throw new ErrorVisual([{ tipo: "tilde", motivo: "tilde pisa" }]);
          if (p.pieza.id === "lun-reel-con") throw new ErrorContenido(["Score 60 < 75."]);
          return base.render(p, tmp, q);
        },
        verificar: async (u) => !u.includes("lun-reel-ver/cover-c1.jpg"),
      });
      assert.deepEqual(r, { aplicadas: 0, fallidas: 3, omitidas: 0 });
      assert.equal(m.reg.render_json.length, 0);
      assert.equal(m.reg.avisos.length, 3);
      for (const id of ["lun-reel-ver", "lun-reel-vis", "lun-reel-con"]) {
        assert.equal(leer(join(m.out, SEM, id, "cover.jpg")), "viejo", id);
        assert.equal(leer(join(m.server, SEM, id, "cover.jpg")), "viejo", id);
        assert.deepEqual(restos(m.out, id), [], id);
        assert.equal(m.visual.get(SEM)![id].correccion?.estado, "fallida", id);
      }
      assert.match(m.visual.get(SEM)!["lun-reel-vis"].correccion?.motivo ?? "", /tilde pisa/);
      assert.match(m.visual.get(SEM)!["lun-reel-con"].correccion?.motivo ?? "", /Score 60/);
    }, {}, BOR_UNO),
);

await checkAsync("corregirFondos: puerta inactiva → no hace nada y lo loguea una vez", () =>
  conMundoC([piezaPlan("lun-reel-a", "14:00"), piezaPlan("lun-reel-b", "15:00")], { "lun-reel-a": { revisor: AVISO_PORTADA }, "lun-reel-b": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const antes = structuredClone(m.visual.get(SEM));
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-a" }, { semana: SEM, id: "lun-reel-b" }], m.out, ENV_C,
      { activa: false, motivo: "apagada en config.json", respondidos: 0 }, deps());
    assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 0 });
    assert.equal(m.reg.render.length + m.reg.rsync.length + m.reg.render_json.length + m.reg.avisos.length, 0);
    assert.deepEqual(m.visual.get(SEM), antes);
    assert.deepEqual(m.reg.logs.filter((l) => l.includes("fase 3 inactiva")), ["🖼️  fase 3 inactiva: apagada en config.json"]);
  }),
);

const PROMPT_HOOK = "una persona chilena abre su correo en un notebook en una oficina luminosa";
const FILTROS: { caso: string; entrada: VisualPieza; estado?: SemanaLeida["estado"]; sinManifiesto?: boolean; id?: string; ajustar?: (m: MundoC) => void; log?: RegExp }[] = [
  { caso: "correccion previa", entrada: { revisor: AVISO_PORTADA, correccion: { en: "x", estado: "fallida", slides: [0] } } },
  { caso: "sin revisor", entrada: {} },
  { caso: "revisor «sin revisar»", entrada: { revisor: { ...AVISO_PORTADA, estado: "sin revisar" } } },
  { caso: "sin slides a corregir", entrada: { revisor: revisorCon([{ n: 1, que: "portada", slide: 0, compite: false, ajeno: false, frase: "ok" }]) } },
  { caso: "publicada", entrada: { revisor: AVISO_PORTADA }, estado: { "lun-filtro": { estado: "publicado" } } },
  { caso: "saltada", entrada: { revisor: AVISO_PORTADA }, estado: { "lun-filtro": { estado: "saltado" } } },
  { caso: "sin manifiesto", entrada: { revisor: AVISO_PORTADA }, sinManifiesto: true },
  { caso: "sin pieza en el plan", entrada: { revisor: AVISO_PORTADA }, id: "lun-no-existe" },
  // Fix 1: hook de video Kling (pagado). Re-renderizar la carpeta lo borraría.
  { caso: "borrador con hookVideo", entrada: { revisor: AVISO_PORTADA }, log: /hook de video/,
    ajustar: () => writeFileSync(join(semanaDir(SEM), "lun-filtro.json"), JSON.stringify({ ...BOR_AI, hookVideo: { prompt: PROMPT_HOOK } })) },
  { caso: "carpeta final con la marca HECHO del hook de video", entrada: { revisor: AVISO_PORTADA }, log: /hook de video/,
    ajustar: (m) => writeFileSync(join(m.out, SEM, "lun-filtro", HECHO), "{}") },
  { caso: "carpeta final con el RESPALDO del hook de video", entrada: { revisor: AVISO_PORTADA }, log: /hook de video/,
    ajustar: (m) => writeFileSync(join(m.out, SEM, "lun-filtro", RESPALDO), "x") },
  // Fix 3: sin render.json «renderizado» con medios (la subida de procesar quedó pendiente).
  { caso: "sin entrada en render.json", entrada: { revisor: AVISO_PORTADA }, ajustar: (m) => void delete m.semanas[0].render["lun-filtro"] },
  { caso: "render.json renderizado sin medios", entrada: { revisor: AVISO_PORTADA },
    ajustar: (m) => void (m.semanas[0].render["lun-filtro"] = { estado: "renderizado", en: EN_ORIGINAL }) },
];
for (const f of FILTROS) {
  await checkAsync(`corregirFondos: ${f.caso} → no hace nada`, () =>
    conMundoC([piezaPlan("lun-filtro", "14:00")], { "lun-filtro": f.entrada, ...(f.id ? { [f.id]: f.entrada } : {}) }, async (m, deps) => {
      if (f.sinManifiesto) rmSync(join(m.out, SEM, "lun-filtro", MANIFIESTO));
      f.ajustar?.(m);
      const final = join(m.out, SEM, "lun-filtro");
      const archivosAntes = readdirSync(final).sort();
      const antes = structuredClone(m.visual.get(SEM));
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: f.id ?? "lun-filtro" }], m.out, ENV_C, PUERTA_ON, deps());
      assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 0 });
      assert.equal(m.reg.render.length + m.reg.rsync.length + m.reg.render_json.length + m.reg.avisos.length, 0);
      assert.deepEqual(m.visual.get(SEM), antes);
      assert.deepEqual(readdirSync(final).sort(), archivosAntes, "la carpeta final no se toca");
      if (f.log) assert.ok(m.reg.logs.some((l) => f.log!.test(l)), m.reg.logs.join(" | "));
    }, f.estado ?? {}),
  );
}

await checkAsync("corregirFondos: la correccion se fusiona sobre la entrada pendiente del escritor (aún no en disco)", () =>
  conMundoC([piezaPlan("lun-reel-pend", "14:00")], {}, async (m, deps) => {
    const pendiente: VisualPieza = { revisor: AVISO_PORTADA, fase1: [{ tipo: "zona", motivo: "m", en: "0" }] };
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-pend" }], m.out, ENV_C, PUERTA_ON,
      deps({ visualPendiente: (s, id) => (s === SEM && id === "lun-reel-pend" ? structuredClone(pendiente) : undefined) }));
    assert.equal(r.aplicadas, 1);
    const v = m.visual.get(SEM)!["lun-reel-pend"];
    assert.deepEqual(v.revisor, pendiente.revisor);
    assert.deepEqual(v.fase1, pendiente.fase1);
    assert.equal(v.correccion?.estado, "aplicada");
  }),
);

// I1: la recuperación salió de `corregirFondos` (corría después de la revisión) a
// `recuperarCorreccionesCortadas`, que render-cli llama antes de `procesar`.
await checkAsync("recuperarCorreccionesCortadas: una corrida cortada a mitad del swap (sin final, con .prev-) se recupera sin subir nada; el servidor nunca perdió el original", () =>
  conMundoC([piezaPlan("lun-reel-corte", "14:00")], { "lun-reel-corte": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const final = join(m.out, SEM, "lun-reel-corte");
    renameSync(final, join(m.out, SEM, "lun-reel-corte.prev-99999"));
    mkdirSync(join(m.out, SEM, "lun-reel-corte.tmp-corr-99999"));
    writeFileSync(join(m.server, SEM, "lun-reel-corte", "cover-c1.jpg"), "nuevo"); // la subida alcanzó a empezar
    // Corre siempre (sin puerta): deshace lo de una corrida anterior, pero no corrige.
    const r = await recuperarCorreccionesCortadas(m.semanas, m.out, ENV_C, deps());
    assert.deepEqual(r, { restauradas: 1 });
    assert.equal(m.reg.render.length, 0);
    assert.equal(leer(join(final, "cover.jpg")), "viejo");
    assert.ok(existsSync(join(final, MANIFIESTO)));
    assert.deepEqual(restos(m.out, "lun-reel-corte"), []);
    assert.equal(leer(join(m.server, SEM, "lun-reel-corte", "cover.jpg")), "viejo", "el original del servidor, intacto");
    assert.equal(m.reg.rsync.length, 0, "la recuperación ya no sube nada");
    assert.equal(m.reg.render_json.length, 0);
    assert.match(m.reg.avisos.join(" "), /el servidor conserva los archivos originales/);
  }),
);

await checkAsync("corregirFondos: nunca lanza aunque fallen escribirVisual, avisar y log", () =>
  conMundoC([piezaPlan("lun-reel-err", "14:00")], { "lun-reel-err": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-err" }], m.out, ENV_C, PUERTA_ON, deps({
      rsync: async () => { throw new Error("sin red"); },
      escribirVisual: async () => { throw new Error("disco"); },
      avisar: async () => { throw new Error("telegram"); },
      log: () => { throw new Error("log"); },
    }));
    assert.equal(r.fallidas, 1);
    assert.equal(leer(join(m.out, SEM, "lun-reel-err", "cover.jpg")), "viejo");
  }),
);

// Review Focus 2: después de una corrección aplicada, la revisión de fondos no vuelve a mirar la pieza.
await checkAsync("revisarRenderizadas: una pieza con correccion (aplicada) no se revisa ni llama al modelo", () =>
  conMundoC([piezaPlan("lun-reel-hecha", "14:00")], {}, async (m) => {
    const entrada: VisualPieza = { revisor: AVISO_PORTADA, correccion: { en: T0.toISOString(), estado: "aplicada", slides: [0] } };
    // En disco (corrida siguiente) y como pendiente del escritor (misma corrida).
    for (const fuente of ["disco", "pendiente"] as const) {
      let llamadas = 0;
      const deps: DepsRevision = {
        revisar: async () => {
          llamadas++;
          throw new Error("no debe revisar");
        },
        llamar: async () => {
          llamadas++;
          throw new Error("no debe llamar");
        },
        extraer: async () => {
          llamadas++;
          return [];
        },
        enviarFoto: async () => true,
        escribirVisual: async () => {
          llamadas++;
        },
        leerVisual: async () => (fuente === "disco" ? { "lun-reel-hecha": structuredClone(entrada) } : {}) as VisualJson,
        visualPendiente: (_s, id) => (fuente === "pendiente" && id === "lun-reel-hecha" ? structuredClone(entrada) : undefined),
        log: () => {},
        ahora: () => T0,
        env: { OPENAI_API_KEY: "sk-test" },
      };
      // Sin revisor (como lo deja procesar si se colara una revisión): igual se salta por la correccion.
      if (fuente === "pendiente") delete entrada.revisor;
      const r = await revisarRenderizadas(m.semanas, m.out, deps);
      assert.equal(llamadas, 0, fuente);
      assert.equal(r.revisadas, 0, fuente);
    }
  }),
);

// Fix 2: si borrar la previa falla tras una corrección (aplicada o caso (c)), la corrida siguiente no la revierte.
// Pendiente 2: el caso (c) ya no descarta la previa (restaura el original), así que solo queda «aplicada».
for (const caso of ["aplicada"] as const) {
  await checkAsync(`corregirFondos: el borrado de la previa falla (${caso}) → la corrida siguiente no revierte nada`, () =>
    conMundoC([piezaPlan("lun-reel-borra", "14:00")], { "lun-reel-borra": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      const base = deps();
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-borra" }], m.out, ENV_C, PUERTA_ON, {
        ...base,
        borrar: async () => {
          throw new Error("EBUSY");
        },
      });
      assert.equal(r.aplicadas, 1);
      assert.equal(r.fallidas, 0);
      const final = join(m.out, SEM, "lun-reel-borra");
      assert.equal(leer(join(final, "cover-c1.jpg")), "nuevo", caso);
      assert.ok(!restos(m.out, "lun-reel-borra").some((f) => /\.prev-/.test(f)), "no queda una .prev- reconocible");
      // Corrida siguiente (la recuperación, que va antes de procesar): nada vuelve atrás.
      m.reloj.t = T0.getTime();
      const rsyncs = m.reg.rsync.length;
      await recuperarCorreccionesCortadas(m.semanas, m.out, ENV_C, deps());
      assert.equal(leer(join(final, "cover-c1.jpg")), "nuevo", "la final sigue corregida");
      assert.equal(leer(join(m.server, SEM, "lun-reel-borra", "cover-c1.jpg")), "nuevo", "el servidor sigue corregido");
      assert.equal(m.reg.rsync.length, rsyncs, "sin re-subir el original");
      assert.deepEqual(restos(m.out, "lun-reel-borra"), [], "la recuperación limpia el resto descartado");
    }),
  );
}

// --- Arreglos de la revisión final ---

// I1: escenario A. La corrida anterior se cortó durante el rsync de la corrección: la final ya es
// la corregida, la .prev el original y el servidor tiene archivos nuevos; el veredicto y la
// corrección (en el buffer) se perdieron. La corrida siguiente recupera ANTES de revisar: la
// revisión mira el original (no cobra por la versión corregida) y la corrección vuelve a correr.
await checkAsync("I1: corte durante la subida → la corrida siguiente restaura el original antes de revisar y la corrección vuelve a correr", () =>
  conMundoC([piezaPlan("lun-reel-a", "14:00")], {}, async (m, deps) => {
    const carpeta = join(m.out, SEM);
    const final = join(carpeta, "lun-reel-a");
    renameSync(final, join(carpeta, "lun-reel-a.prev-4242"));
    mkdirSync(final);
    for (const a of ARCH_C1) writeFileSync(join(final, a), "nuevo");
    writeFileSync(join(final, MANIFIESTO), JSON.stringify({ archivos: ARCH_C1, duracionMs: 4900 }));
    writeFileSync(join(m.server, SEM, "lun-reel-a", "cover-c1.jpg"), "nuevo");
    const orden: string[] = [];
    // Corrida siguiente, en el orden de render-cli: recuperar → (procesar) → revisar → corregir.
    const rec = await recuperarCorreccionesCortadas(m.semanas, m.out, ENV_C, deps());
    assert.equal(rec.restauradas, 1);
    orden.push(`revisar:${leer(join(final, "cover.jpg"))}`); // lo que vería extraerCuadros
    // Pendiente 2: nada que re-subir; el original del servidor nunca se pisó.
    assert.equal(m.reg.rsync.length, 0);
    assert.equal(leer(join(m.server, SEM, "lun-reel-a", "cover.jpg")), "viejo", "el servidor conserva el original");
    assert.deepEqual(restos(m.out, "lun-reel-a"), []);
    m.visual.set(SEM, { "lun-reel-a": { revisor: AVISO_PORTADA } }); // la revisión de esta corrida marca la portada
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-a" }], m.out, ENV_C, PUERTA_ON, deps());
    assert.deepEqual(r, { aplicadas: 1, fallidas: 0, omitidas: 0 });
    assert.deepEqual(orden, ["revisar:viejo"], "la revisión ve el original restaurado");
    assert.equal(leer(join(m.server, SEM, "lun-reel-a", "cover-c1.jpg")), "nuevo");
    assert.equal(m.reg.render_json[0][2].medios?.cover, "cover-c1.jpg");
    assert.equal(m.reg.avisos.filter((a) => /quedó a medias/.test(a)).length, 1);
  }),
);

// I1: escenario B. Cortada y luego re-planificada: render.json ya no la tiene como renderizada,
// así que procesar la renderizará fresca. La recuperación restaura en el Mac pero no re-sube la
// .prev vieja (y como corre antes de procesar, nunca pisa el render fresco).
await checkAsync("I1: corte + re-planificación → la recuperación no re-sube la .prev vieja", () =>
  conMundoC([piezaPlan("lun-reel-b", "14:00")], {}, async (m, deps) => {
    const carpeta = join(m.out, SEM);
    renameSync(join(carpeta, "lun-reel-b"), join(carpeta, "lun-reel-b.prev-4242"));
    delete m.semanas[0].render["lun-reel-b"];
    const rec = await recuperarCorreccionesCortadas(m.semanas, m.out, ENV_C, deps());
    assert.equal(rec.restauradas, 1);
    assert.equal(m.reg.rsync.length, 0, "no re-sube contenido de un borrador anterior");
    assert.match(m.reg.avisos.join(" "), /render.json no la tiene como renderizada: se vuelve a renderizar/);
  }),
);

check("I1: render-cli recupera después de tomar el candado y antes de procesar, y no con --dry-run", () => {
  const src = readFileSync(join(import.meta.dirname, "../../src/calendario/render-cli.ts"), "utf8");
  const candado = src.indexOf("await tomarCandado(");
  const rec = src.indexOf("await recuperarCorreccionesCortadas(");
  const proc = src.indexOf("await procesar(");
  const revisar = src.indexOf("await revisarYCorregir(");
  assert.ok(candado > 0 && rec > candado && proc > rec && revisar > proc, `${candado} < ${rec} < ${proc} < ${revisar}`);
  assert.match(src.slice(src.lastIndexOf("\n", rec) - 40, rec), /if \(!dryRun\) \{\s*$/, "solo sin --dry-run");
});

await checkAsync("I1: corregirFondos ya no recupera, y no corrige una pieza que aún tiene una .prev-", () =>
  conMundoC([piezaPlan("lun-reel-c", "14:00")], { "lun-reel-c": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const carpeta = join(m.out, SEM);
    mkdirSync(join(carpeta, "lun-reel-c.prev-4242"));
    writeFileSync(join(carpeta, "lun-reel-c.prev-4242", MANIFIESTO), JSON.stringify({ archivos: ARCH }));
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-c" }], m.out, ENV_C, PUERTA_ON, deps());
    assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 0 });
    assert.equal(m.reg.render.length + m.reg.rsync.length, 0);
    assert.ok(existsSync(join(carpeta, "lun-reel-c.prev-4242")), "la .prev no la toca corregirFondos");
    assert.ok(m.reg.logs.some((l) => /\.prev- de una corrida anterior/.test(l)));
  }),
);

// I2: el criterio del bot, extraído sin cambiar su comportamiento.
check("I2: previewEntregado es el criterio del bot (hora de entrega v; un render posterior vuelve a avisar)", () => {
  const bot = (renderEn: string, v: string | undefined): boolean => Boolean(v) && !(typeof renderEn === "string" && renderEn > v!);
  const casos: [string, string | undefined][] = [
    ["2026-10-26T13:00:00.000Z", undefined], ["2026-10-26T13:00:00.000Z", ""], ["2026-10-26T13:00:00.000Z", "2026-10-26T14:00:00.000Z"],
    ["2026-10-26T15:00:00.000Z", "2026-10-26T14:00:00.000Z"], ["2026-10-26T14:00:00.000Z", "2026-10-26T14:00:00.000Z"], [undefined as unknown as string, "x"],
  ];
  for (const [en, v] of casos) assert.equal(previewEntregado(en, v), bot(en, v), `${en} / ${v}`);
  assert.equal(previewEntregado("2026-10-26T15:00:00.000Z", "2026-10-26T14:00:00.000Z"), false);
  const botSrc = readFileSync(join(import.meta.dirname, "../../src/kb/bot.ts"), "utf8");
  assert.match(botSrc, /previewEntregado\(renderEn, leerClaveDb\(K_PREVIEW \+ k\)\)/, "bot.ts usa la función exportada");
});

// I2: la carrera. procesar subió el original; el bot entrega su preview mientras la corrección
// re-renderiza y sube. La corrección fija `en` después y confirma su semana de inmediato (antes de
// la pieza siguiente), así que el preview de la versión corregida sale, y una sola vez.
await checkAsync("I2: el bot entrega el preview del original durante la corrección → la corregida igual tiene su preview (uno), y la semana se confirma enseguida", () =>
  conMundoC([piezaPlan("lun-reel-p", "14:00"), piezaPlan("lun-reel-q", "15:00")],
    { "lun-reel-p": { revisor: AVISO_PORTADA }, "lun-reel-q": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      const base = deps();
      const eventos: string[] = [];
      const entregas = new Map<string, string>();
      const enviado = (k: string, en: string): boolean => previewEntregado(en, entregas.get(k));
      const avanza = (min: number): void => void (m.reloj.t += min * 60_000);
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-p" }, { semana: SEM, id: "lun-reel-q" }], m.out, ENV_C, PUERTA_ON, {
        ...base,
        render: async (p, tmp, q) => {
          eventos.push(`render:${p.pieza.id}`);
          avanza(2);
          return base.render(p, tmp, q);
        },
        rsync: async (l, rem) => {
          avanza(1);
          // El bot entrega el preview del original (render.json aún sin la corrección) a esta hora.
          if (rem.includes("lun-reel-p")) {
            for (const x of previewsPendientes(m.semanas, new Date(m.reloj.t), enviado)) entregas.set(claveFila(x.semana, x.pieza.id), new Date(m.reloj.t).toISOString());
          }
          avanza(1);
          await base.rsync(l, rem);
        },
        escribirRender: async (s2, id, e) => {
          eventos.push(`render.json:${id}`);
          await base.escribirRender(s2, id, e);
        },
        confirmar: async (s2) => void eventos.push(`confirmar:${s2}`),
      });
      assert.equal(r.aplicadas, 2);
      assert.deepEqual(eventos, [
        "render:lun-reel-p", `render.json:lun-reel-p`, `confirmar:${SEM}`,
        "render:lun-reel-q", `render.json:lun-reel-q`, `confirmar:${SEM}`,
      ], "cada corrección se confirma antes de la siguiente");
      const [, , e] = m.reg.render_json[0];
      const k = claveFila(SEM, "lun-reel-p");
      assert.ok(entregas.has(k), "el bot entregó el preview del original durante la corrección");
      assert.ok(e.en > entregas.get(k)!, "en de la corregida posterior a esa entrega");
      const tras: SemanaLeida[] = [{ ...m.semanas[0], render: { ...m.semanas[0].render, "lun-reel-p": e } }];
      const ahora = new Date(m.reloj.t);
      assert.deepEqual(previewsPendientes(tras, ahora, enviado).filter((x) => x.pieza.id === "lun-reel-p").length, 1, "un preview de la corregida");
      entregas.set(k, ahora.toISOString());
      assert.equal(previewsPendientes(tras, ahora, enviado).filter((x) => x.pieza.id === "lun-reel-p").length, 0, "y solo uno");
    }, {}, BOR_UNO),
);

await checkAsync("I2: tras confirmar, visual.json se relee del disco (la pieza siguiente no usa un caché viejo)", () =>
  conMundoC([piezaPlan("lun-reel-r", "14:00"), piezaPlan("lun-reel-s", "15:00")], { "lun-reel-r": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    // La revisión de s solo llega al «disco» con el confirmar de la corrección de r.
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-r" }, { semana: SEM, id: "lun-reel-s" }], m.out, ENV_C, PUERTA_ON, deps({
      confirmar: async () => void (m.visual.get(SEM)!["lun-reel-s"] = { revisor: AVISO_PORTADA }),
    }));
    assert.equal(r.aplicadas, 2);
  }, {}, BOR_UNO),
);

// I3: el re-render nunca genera imágenes.
await checkAsync("I3: un fondo ai que se conserva y no está en caché → fallida «fondo ai sin caché», sin re-render ni subida", () =>
  conMundoC([piezaPlan("lun-reel-cache", "14:00")], { "lun-reel-cache": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const pedidos: string[] = [];
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-cache" }], m.out, ENV_C, PUERTA_ON, deps({
      enCache: (x) => {
        pedidos.push(x);
        return false;
      },
    }));
    assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 });
    assert.deepEqual(pedidos, [applyBrandStyle("escritorio")], "solo la Cta conservada, con el estilo de marca");
    assert.equal(m.reg.render.length + m.reg.rsync.length + m.reg.render_json.length, 0);
    const c = m.visual.get(SEM)!["lun-reel-cache"].correccion;
    assert.equal(c?.estado, "fallida");
    assert.ok(c?.motivo?.startsWith(SIN_CACHE), c?.motivo);
    assert.equal(SIN_CACHE, "fondo ai sin caché: no se regenera");
    assert.match(c?.motivo ?? "", /slide 2/);
    assert.equal(m.reg.avisos.length, 1);
    assert.equal(leer(join(m.out, SEM, "lun-reel-cache", "cover.jpg")), "viejo");
    assert.deepEqual(restos(m.out, "lun-reel-cache"), []);
  }),
);

check("I3: fondosAiConservados quita los del tope y los corregidos; sin fondos ai conservados no pide nada", () => {
  const b = bor([{ template: "Hook", background: { ai: "a" } }, { template: "Step" }, { template: "Cta", background: { ai: "c" } }]);
  assert.deepEqual(fondosAiConservados(b, [0], "reel").map((f) => f.prompt), [applyBrandStyle("c")]);
  assert.deepEqual(fondosAiConservados(b, [0, 2], "carrusel"), []);
  assert.equal(b.slides[0].background !== undefined, true, "no muta el borrador");
});

await checkAsync("I3: la comprobación por defecto usa la misma clave que generateBackground (CARRUSEL_AI_CACHE_DIR)", async () => {
  const cache = mkdtempSync(join(tmpdir(), "corr-cache-"));
  const prevDir = process.env.CARRUSEL_AI_CACHE_DIR;
  const prevSolo = process.env.CARRUSEL_AI_SOLO_CACHE;
  process.env.CARRUSEL_AI_CACHE_DIR = cache;
  process.env.CARRUSEL_AI_SOLO_CACHE = "1";
  try {
    const prompt = applyBrandStyle("escritorio");
    assert.equal(fondoEnCache(prompt), false);
    await assert.rejects(generateBackground(prompt), /fuera de caché/);
    writeFileSync(rutaCacheFondo(prompt), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.equal(fondoEnCache(prompt), true);
    assert.match(await generateBackground(prompt), /^data:image\/png;base64,/, "generateBackground lee ese mismo archivo");
    // Y corregirFondos sin `enCache` inyectado usa esa comprobación: con el archivo, aplica.
    await conMundoC([piezaPlan("lun-reel-real", "14:00")], { "lun-reel-real": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-real" }], m.out, ENV_C, PUERTA_ON, deps({ enCache: undefined }));
      assert.deepEqual(r, { aplicadas: 1, fallidas: 0, omitidas: 0 });
    });
    rmSync(rutaCacheFondo(prompt));
    await conMundoC([piezaPlan("lun-reel-real", "14:00")], { "lun-reel-real": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-real" }], m.out, ENV_C, PUERTA_ON, deps({ enCache: undefined }));
      assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 });
      assert.equal(m.reg.render.length, 0);
    });
  } finally {
    if (prevDir === undefined) delete process.env.CARRUSEL_AI_CACHE_DIR;
    else process.env.CARRUSEL_AI_CACHE_DIR = prevDir;
    if (prevSolo === undefined) delete process.env.CARRUSEL_AI_SOLO_CACHE;
    else process.env.CARRUSEL_AI_SOLO_CACHE = prevSolo;
    rmSync(cache, { recursive: true, force: true });
  }
});

// Minor (pendiente 2: ya no hay re-subida en ningún camino de fallo, con o sin hora).
await checkAsync("Minor: la subida falla y la hora ya pasó → no re-sube nada, solo lo avisa", () =>
  conMundoC([piezaPlan("lun-reel-tarde", "14:00")], { "lun-reel-tarde": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    let n = 0;
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-tarde" }], m.out, ENV_C, PUERTA_ON, deps({
      rsync: async () => {
        n++;
        m.reloj.t = new Date("2026-10-26T17:01:00Z").getTime(); // 14:01 local: la hora pasó durante la subida
        throw new Error("rsync terminó con código 30");
      },
    }));
    assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 });
    assert.equal(n, 1, "no hay segunda subida");
    assert.equal(leer(join(m.out, SEM, "lun-reel-tarde", "cover.jpg")), "viejo", "el Mac vuelve al original");
    assert.equal(m.reg.avisos.length, 1);
    assert.match(m.reg.avisos[0], /los archivos originales del servidor siguen intactos/);
  }),
);

// --- Pendiente 1: precondición de caché de voz (como I3 con las imágenes) ---
const NARR_HOOK = "Tres atajos para tu correo que ahorran tiempo";
const NARR_CTA = "Guárdalo y pruébalo hoy mismo en tu oficina";
const BOR_VOZ = { ...BOR_AI, slides: [{ ...BOR_AI.slides[0], narracion: NARR_HOOK }, { ...BOR_AI.slides[1], narracion: `  ${NARR_CTA.replace(/ /g, "   ")} ` }] };

await checkAsync("Voz: una línea de la narración sin caché → fallida «voz sin caché», sin re-render ni subida", () =>
  conMundoC([piezaPlan("lun-reel-voz", "14:00")], { "lun-reel-voz": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const pedidos: [string, string][] = [];
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-voz" }], m.out, ENV_C, PUERTA_ON, deps({
      voz: async () => "ef_dora",
      enCacheVoz: (texto, voz) => {
        pedidos.push([texto, voz]);
        return texto === NARR_HOOK;
      },
    }));
    assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 });
    assert.deepEqual(pedidos, [[NARR_HOOK, "ef_dora"], [NARR_CTA, "ef_dora"]], "cada línea, ya normalizada como la narra el motor, con la voz del render");
    assert.equal(m.reg.render.length + m.reg.rsync.length + m.reg.render_json.length, 0, "sin render ni gasto");
    const c = m.visual.get(SEM)!["lun-reel-voz"].correccion;
    assert.equal(c?.estado, "fallida");
    assert.equal(SIN_CACHE_VOZ, "voz sin caché: no se regenera");
    assert.ok(c?.motivo?.startsWith(SIN_CACHE_VOZ), c?.motivo);
    assert.match(c?.motivo ?? "", /escena 2/);
    assert.equal(m.reg.avisos.length, 1);
    assert.equal(leer(join(m.out, SEM, "lun-reel-voz", "cover.jpg")), "viejo");
  }, {}, BOR_VOZ),
);

await checkAsync("Voz: todas las líneas en caché → la corrección se aplica", () =>
  conMundoC([piezaPlan("lun-reel-voz2", "14:00")], { "lun-reel-voz2": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    let n = 0;
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-voz2" }], m.out, ENV_C, PUERTA_ON, deps({ enCacheVoz: () => (n++, true) }));
    assert.deepEqual(r, { aplicadas: 1, fallidas: 0, omitidas: 0 });
    assert.equal(n, 2);
    assert.equal(m.reg.render.length, 1);
  }, {}, BOR_VOZ),
);

await checkAsync("Voz: con la voz apagada o en un carrusel no se comprueba nada", async () => {
  for (const caso of ["voz false", "carrusel"] as const) {
    const pieza = { ...piezaPlan("lun-voz-off", "14:00"), ...(caso === "carrusel" ? { formato: "carrusel" } : {}) };
    await conMundoC([pieza], { "lun-voz-off": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      let n = 0;
      await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-voz-off" }], m.out, ENV_C, PUERTA_ON, deps({
        ...(caso === "voz false" ? { voz: async () => false as const } : {}),
        enCacheVoz: () => (n++, false),
      }));
      assert.equal(n, 0, caso);
      assert.equal(m.reg.render.length, 1, `${caso}: re-renderiza`);
      assert.notEqual(m.visual.get(SEM)!["lun-voz-off"].correccion?.motivo?.startsWith(SIN_CACHE_VOZ), true, caso);
    }, {}, BOR_VOZ);
  }
  assert.deepEqual(narracionesDelReel(BOR_VOZ as unknown as Borrador, "carrusel"), []);
  assert.deepEqual(narracionesDelReel(BOR_VOZ as unknown as Borrador, "reel"), [{ slide: 0, texto: NARR_HOOK }, { slide: 1, texto: NARR_CTA }]);
});

await checkAsync("Voz: la comprobación por defecto usa la misma clave que sintetizar (CARRUSEL_VOZ_CACHE_DIR), sin llamar a Kokoro", async () => {
  const cache = mkdtempSync(join(tmpdir(), "corr-voz-"));
  const prevDir = process.env.CARRUSEL_VOZ_CACHE_DIR;
  const prevKokoro = process.env.CARRUSEL_KOKORO_DIR;
  process.env.CARRUSEL_VOZ_CACHE_DIR = cache;
  process.env.CARRUSEL_KOKORO_DIR = join(cache, "sin-kokoro"); // sin venv: si no sale de la caché, lanza
  const escribir = (texto: string): void => {
    const { wav, meta } = rutaCacheVoz(texto, VOZ_DEFECTO, 1.0);
    writeFileSync(wav, "RIFF");
    writeFileSync(meta, JSON.stringify({ texto, voz: VOZ_DEFECTO, velocidad: 1, segundos: 2.5 }));
  };
  try {
    assert.equal(enCacheVoz(NARR_HOOK), false);
    await assert.rejects(sintetizar(NARR_HOOK), /no está instalado/);
    escribir(NARR_HOOK);
    assert.equal(enCacheVoz(`  ${NARR_HOOK}  `), true, "normaliza el texto como sintetizar");
    assert.equal(enCacheVoz(NARR_HOOK, "ef_dora"), false, "la voz es parte de la clave");
    assert.equal(enCacheVoz(NARR_HOOK, VOZ_DEFECTO, 1.2), false, "la velocidad también");
    const n = await sintetizar(NARR_HOOK);
    assert.equal(n.path, rutaCacheVoz(NARR_HOOK).wav, "sintetizar lee ese mismo archivo");
    assert.equal(n.segundos, 2.5);
    // corregirFondos sin `enCacheVoz` ni `voz` inyectados: VOZ_DEFECTO y esa comprobación.
    await conMundoC([piezaPlan("lun-reel-vreal", "14:00")], { "lun-reel-vreal": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-vreal" }], m.out, ENV_C, PUERTA_ON, deps({ enCacheVoz: undefined }));
      assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 }, "falta la línea de la Cta");
      assert.equal(m.reg.render.length, 0);
    }, {}, BOR_VOZ);
    escribir(NARR_CTA);
    await conMundoC([piezaPlan("lun-reel-vreal", "14:00")], { "lun-reel-vreal": { revisor: AVISO_PORTADA } }, async (m, deps) => {
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-vreal" }], m.out, ENV_C, PUERTA_ON, deps({ enCacheVoz: undefined }));
      assert.deepEqual(r, { aplicadas: 1, fallidas: 0, omitidas: 0 });
    }, {}, BOR_VOZ);
  } finally {
    if (prevDir === undefined) delete process.env.CARRUSEL_VOZ_CACHE_DIR;
    else process.env.CARRUSEL_VOZ_CACHE_DIR = prevDir;
    if (prevKokoro === undefined) delete process.env.CARRUSEL_KOKORO_DIR;
    else process.env.CARRUSEL_KOKORO_DIR = prevKokoro;
    rmSync(cache, { recursive: true, force: true });
  }
});

// --- Pendiente 2: nombres nuevos en la corrección (sin mezclar archivos viejos y nuevos) ---
check("nombresCorregidos: versión siguiente a la del original, correspondencia uno a uno por nombre base", () => {
  assert.deepEqual(nombresCorregidos(["reel.mp4", "cover.jpg", "story.jpg"], ARCH), [["reel.mp4", "reel-c1.mp4"], ["cover.jpg", "cover-c1.jpg"], ["story.jpg", "story-c1.jpg"]]);
  assert.deepEqual(nombresCorregidos(["01.jpg", "02.jpg", "story.jpg"], ["02.jpg", "01.jpg", "story.jpg"]).map(([, a]) => a), ["01-c1.jpg", "02-c1.jpg", "story-c1.jpg"]);
  // Una segunda corrección (no debería ocurrir: `correccion` previa) no rompe: pasa a -c2.
  assert.deepEqual(nombresCorregidos(["reel.mp4", "cover.jpg", "story.jpg"], ARCH_C1).map(([, a]) => a), ["reel-c2.mp4", "cover-c2.jpg", "story-c2.jpg"]);
  assert.throws(() => nombresCorregidos(["reel.mp4", "cover.jpg"], ARCH), /cambió los archivos/);
  assert.throws(() => nombresCorregidos(["01.jpg", "02.jpg", "03.jpg", "story.jpg"], ["01.jpg", "02.jpg", "story.jpg"]), /cambió los archivos/);
  assert.throws(() => nombresCorregidos(["cover.jpg", "cover-c1.jpg", "reel.mp4"], ["cover.jpg", "story.jpg", "reel.mp4"]), /cambió los archivos/);
  // Los nombres nuevos pasan los filtros del Mac (render.ts), del bot (telegram.ts) y del servidor de medios.
  const root = mkdtempSync(join(tmpdir(), "corr-medios-"));
  try {
    mkdirSync(join(root, SEM, "lun-x"), { recursive: true });
    for (const a of ["01-c1.jpg", "10-c1.jpg", "reel-c1.mp4", "cover-c1.jpg", "story-c1.jpg"]) {
      assert.match(a, /^[a-z0-9][a-z0-9._-]*\.(jpg|mp4)$/, "ARCHIVO_RE de render.ts");
      assert.match(a, /^[A-Za-z0-9._-]+$/, "ARCHIVO_RE de telegram.ts");
      writeFileSync(join(root, SEM, "lun-x", a), "x");
      assert.ok(resolverMedio(`/media/tok/${SEM}/lun-x/${a}`, "tok", root), `el servidor de medios sirve ${a}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("armarMedios: reconoce los nombres con versión (carrusel ordenado por slide; reel con cover y story)", () => {
  assert.deepEqual(armarMedios("carrusel", { archivos: ["10-c1.jpg", "02-c1.jpg", "01-c1.jpg", "story-c1.jpg"] }), { archivos: ["01-c1.jpg", "02-c1.jpg", "10-c1.jpg"], cover: "01-c1.jpg", story: "story-c1.jpg" });
  assert.deepEqual(armarMedios("reel", { archivos: ARCH_C1, duracionMs: 4900 }), { archivos: ["reel-c1.mp4"], cover: "cover-c1.jpg", story: "story-c1.jpg", duracionMs: 4900 });
  assert.deepEqual(armarMedios("reel", { archivos: ARCH }), { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg" }, "sin versión, como siempre");
  assert.equal(baseArchivo("cover-c12.jpg"), "cover.jpg");
  assert.equal(baseArchivo("lun-reel.mp4"), "lun-reel.mp4");
});

await checkAsync("Pendiente 2: un bot que lee render.json antes de reescribirlo publica un conjunto coherente de archivos viejos, legibles durante y después de la subida", () =>
  conMundoC([piezaPlan("lun-reel-bot", "14:00")], { "lun-reel-bot": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const id = "lun-reel-bot";
    const viejo = m.semanas[0].render[id].medios; // lo que el bot leyó al empezar a publicar (/publicar)
    const vistas: string[][] = [];
    const base = deps();
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id }], m.out, ENV_C, PUERTA_ON, {
      ...base,
      // rsync que sube archivo por archivo; el bot mira el servidor entre cada uno.
      rsync: async (local, remoto) => {
        const destino = join(m.server, remoto);
        for (const a of readdirSync(local).filter((x) => !x.startsWith("."))) {
          vistas.push(servidorSegun(m, id, viejo));
          writeFileSync(join(destino, a), leer(join(local, a)));
        }
        vistas.push(servidorSegun(m, id, viejo));
      },
    });
    assert.equal(r.aplicadas, 1);
    assert.equal(vistas.length, ARCH.length + 1);
    for (const v of vistas) assert.deepEqual(v, ["viejo", "viejo", "viejo"], "durante la subida, el render.json viejo da solo archivos viejos");
    assert.deepEqual(servidorSegun(m, id, viejo), ["viejo", "viejo", "viejo"], "y después también");
    assert.deepEqual(servidorSegun(m, id, m.reg.render_json[0][2].medios), ["nuevo", "nuevo", "nuevo"], "el render.json nuevo da solo archivos nuevos");
  }),
);

await checkAsync("Pendiente 2: una pieza cuyo original ya trae sufijo (-c1) se corrige a -c2 sin romper", () =>
  conMundoC([piezaPlan("lun-reel-c2", "14:00")], { "lun-reel-c2": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const final = join(m.out, SEM, "lun-reel-c2");
    rmSync(final, { recursive: true });
    mkdirSync(final);
    for (const a of ARCH_C1) writeFileSync(join(final, a), "viejo");
    writeFileSync(join(final, MANIFIESTO), JSON.stringify({ archivos: ARCH_C1, duracionMs: 4900 }));
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-c2" }], m.out, ENV_C, PUERTA_ON, deps());
    assert.equal(r.aplicadas, 1);
    assert.deepEqual(m.reg.render_json[0][2].medios, { archivos: ["reel-c2.mp4"], cover: "cover-c2.jpg", story: "story-c2.jpg", duracionMs: 4900 });
    assert.deepEqual(readdirSync(final).sort(), [MANIFIESTO, "cover-c2.jpg", "reel-c2.mp4", "story-c2.jpg"]);
  }),
);

await checkAsync("Pendiente 2: la revisión de fondos lee una carpeta corregida (-c1) por su manifiesto, no por nombres fijos", () =>
  conMundoC([piezaPlan("lun-reel-rev", "14:00")], {}, async (m) => {
    const final = join(m.out, SEM, "lun-reel-rev");
    rmSync(final, { recursive: true });
    mkdirSync(final);
    for (const a of ARCH_C1) writeFileSync(join(final, a), "nuevo");
    writeFileSync(join(final, MANIFIESTO), JSON.stringify({ archivos: ARCH_C1, duracionMs: 4900, escenas: [{ start: 0, dur: 4 }, { start: 4, dur: 0.9 }] }));
    const pedidos: string[] = [];
    const deps: DepsRevision = {
      revisar: async () => { throw new Error("no llega"); },
      llamar: async () => { throw new Error("no llega"); },
      extraer: async (_f, _d, cuadros) => {
        pedidos.push(...cuadros.map((c) => c.archivo));
        throw new Error("corte de prueba");
      },
      enviarFoto: async () => true,
      escribirVisual: async () => {},
      leerVisual: async () => ({}) as VisualJson,
      log: () => {},
      ahora: () => T0,
      env: { OPENAI_API_KEY: "sk-test" },
    };
    await revisarRenderizadas(m.semanas, m.out, deps);
    assert.ok(pedidos.length > 0, "llegó a extraer");
    assert.ok(pedidos.every((a) => ARCH_C1.includes(a)), pedidos.join(", "));
  }),
);

// --- Pendiente 3: tope de correcciones por corrida, por hora ---
// El tope semanal de 3 fondos ai deja a lo más 3 candidatas por semana: para pasar el tope de la
// corrida hace falta una segunda semana en la misma base.
const SEM2 = "2026-11-02";
function agregarSemana(m: MundoC, ids: [string, string][]): void {
  const sd = semanaDir(SEM2);
  mkdirSync(sd, { recursive: true });
  const piezas = ids.map(([id, hora]) => ({ ...piezaPlan(id, hora), dia: SEM2 }));
  const planRaw = { semana: SEM2, zona: "America/Santiago", experimento: null, piezas };
  writeFileSync(join(sd, "plan.json"), JSON.stringify(planRaw));
  const render: Record<string, RenderEntry> = {};
  const visual: Record<string, VisualPieza> = {};
  for (const [id] of ids) {
    writeFileSync(join(sd, `${id}.json`), JSON.stringify(BOR_UNO));
    const final = join(m.out, SEM2, id);
    mkdirSync(final, { recursive: true });
    for (const a of ARCH) writeFileSync(join(final, a), "viejo");
    writeFileSync(join(final, MANIFIESTO), JSON.stringify({ archivos: ARCH, duracionMs: 4900 }));
    mkdirSync(join(m.server, SEM2, id), { recursive: true });
    for (const a of ARCH) writeFileSync(join(m.server, SEM2, id, a), "viejo");
    render[id] = { estado: "renderizado", medios: { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg", duracionMs: 4900 }, en: EN_ORIGINAL };
    visual[id] = { revisor: AVISO_PORTADA };
  }
  m.semanas.push({ semana: SEM2, plan: parsePlan(JSON.stringify(planRaw)), render, estado: {} });
  m.visual.set(SEM2, visual);
}
const CINCO = (): { semana: string; id: string }[] => [
  // Desordenadas a propósito: la semana siguiente primero y la de hoy al revés.
  { semana: SEM2, id: "lun-sig-b" }, { semana: SEM2, id: "lun-sig-a" },
  { semana: SEM, id: "lun-c" }, { semana: SEM, id: "lun-a" }, { semana: SEM, id: "lun-b" },
];
const conCinco = (fn: (m: MundoC, deps: (o?: Partial<DepsCorreccion>) => DepsCorreccion) => Promise<void>): Promise<void> =>
  conMundoC([piezaPlan("lun-a", "14:00"), piezaPlan("lun-b", "15:00"), piezaPlan("lun-c", "16:00")],
    { "lun-a": { revisor: AVISO_PORTADA }, "lun-b": { revisor: AVISO_PORTADA }, "lun-c": { revisor: AVISO_PORTADA } },
    async (m, deps) => {
      agregarSemana(m, [["lun-sig-a", "10:00"], ["lun-sig-b", "11:00"]]);
      await fn(m, deps);
    }, {}, BOR_UNO);

await checkAsync("Tope: a lo más 3 re-renders por corrida, la más próxima primero; las demás no se tocan ni se anotan y se loguea una vez", () =>
  conCinco(async (m, deps) => {
    assert.equal(MAX_CORRECCIONES_POR_CORRIDA, 3);
    const r = await corregirFondos(m.semanas, CINCO(), m.out, ENV_C, PUERTA_ON, deps());
    assert.deepEqual(r, { aplicadas: 3, fallidas: 0, omitidas: 0 });
    assert.deepEqual(m.reg.render.map((x) => x.id), ["lun-a", "lun-b", "lun-c"], "por hora");
    for (const id of ["lun-sig-a", "lun-sig-b"]) {
      assert.equal(m.visual.get(SEM2)![id].correccion, undefined, `${id} sin anotar`);
      assert.equal(leer(join(m.out, SEM2, id, "cover.jpg")), "viejo", `${id} intacta`);
      assert.deepEqual(readdirSync(join(m.server, SEM2, id)).sort(), [...ARCH].sort(), `${id} sin subir`);
    }
    const tope = m.reg.logs.filter((l) => /tope de 3 re-renders/.test(l));
    assert.equal(tope.length, 1, m.reg.logs.join(" | "));
    assert.match(tope[0], /lun-sig-a/);
    // Corrida siguiente: las que quedaron se corrigen (las ya corregidas tienen `correccion`).
    m.reg.render.length = 0;
    const r2 = await corregirFondos(m.semanas, CINCO(), m.out, ENV_C, PUERTA_ON, deps());
    assert.deepEqual(r2, { aplicadas: 2, fallidas: 0, omitidas: 0 });
    assert.deepEqual(m.reg.render.map((x) => x.id), ["lun-sig-a", "lun-sig-b"]);
  }),
);

await checkAsync("Tope: los re-renders fallidos (render o subida) cuentan", () =>
  conCinco(async (m, deps) => {
    const base = deps();
    const r = await corregirFondos(m.semanas, CINCO(), m.out, ENV_C, PUERTA_ON, {
      ...base,
      render: async (p, tmp, q) => {
        if (p.pieza.id === "lun-a") {
          m.reg.render.push({ id: p.pieza.id, quitar: q });
          throw new ErrorContenido(["Score 60 < 75."]);
        }
        return base.render(p, tmp, q);
      },
      rsync: async (l, rem) => {
        if (rem.includes("lun-b")) throw new Error("rsync terminó con código 12");
        await base.rsync(l, rem);
      },
    });
    assert.deepEqual(r, { aplicadas: 1, fallidas: 2, omitidas: 0 });
    assert.deepEqual(m.reg.render.map((x) => x.id), ["lun-a", "lun-b", "lun-c"]);
    assert.equal(m.visual.get(SEM2)!["lun-sig-a"].correccion, undefined);
  }),
);

await checkAsync("Tope: una precondición de caché que falla antes de renderizar no cuenta", () =>
  conCinco(async (m, deps) => {
    // lun-a lleva narración y su voz no está en caché: fallida sin re-render.
    writeFileSync(join(semanaDir(SEM), "lun-a.json"), JSON.stringify({ ...BOR_UNO, slides: [{ ...BOR_UNO.slides[0], narracion: NARR_HOOK }, BOR_UNO.slides[1]] }));
    const r = await corregirFondos(m.semanas, CINCO(), m.out, ENV_C, PUERTA_ON, deps({ enCacheVoz: () => false }));
    assert.deepEqual(r, { aplicadas: 3, fallidas: 1, omitidas: 0 });
    assert.equal(m.visual.get(SEM)!["lun-a"].correccion?.estado, "fallida");
    assert.deepEqual(m.reg.render.map((x) => x.id), ["lun-b", "lun-c", "lun-sig-a"]);
    assert.equal(m.visual.get(SEM2)!["lun-sig-b"].correccion, undefined, "la quinta queda para la próxima");
  }),
);
