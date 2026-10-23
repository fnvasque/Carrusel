import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import {
  MARGEN_CORRECCION_MS, UMBRAL_CORRECCION, corregirFondos, leerPuertaCorreccion, puertaCorreccion, slidesACorregir,
  type DepsCorreccion, type PuertaCorreccion,
} from "../../src/calendario/correccion-fondos.ts";
import type { Borrador } from "../../src/calendario/draft.ts";
import { parsePlan, semanaDir, type RenderEntry, type SemanaLeida } from "../../src/calendario/plan.ts";
import { ErrorContenido, MANIFIESTO, type EnvRender } from "../../src/calendario/render.ts";
import { revisarRenderizadas, type DepsRevision } from "../../src/calendario/revision-fondos.ts";
import { claveFila } from "../../src/calendario/scheduler.ts";
import { previewsPendientes } from "../../src/calendario/telegram.ts";
import { ErrorVisual } from "../../src/render/revision.ts";
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
        assert.equal(p.semana, SEM);
        assert.equal(p.borradorPath, join(semanaDir(SEM), p.pieza.borrador));
        mkdirSync(tmp, { recursive: true });
        for (const a of ARCH) writeFileSync(join(tmp, a), "nuevo");
        return { archivos: [...ARCH], duracionMs: 4900, escenas: [{ start: 0, dur: 4 }, { start: 4, dur: 0.9 }] };
      },
      rsync: async (local, remoto) => {
        // Copia como el rsync real (sin el manifiesto) a la carpeta «servidor».
        const destino = join(server, remoto);
        mkdirSync(destino, { recursive: true });
        for (const a of ARCH) if (existsSync(join(local, a))) writeFileSync(join(destino, a), leer(join(local, a)));
        m.reg.rsync.push({ local, remoto, contenido: leer(join(local, "cover.jpg")) });
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

await checkAsync("corregirFondos: pieza a 2 h → re-render sin la slide 0, sube, verifica, render.json con en nuevo y correccion aplicada", () =>
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
    assert.equal(leer(join(m.server, SEM, "lun-reel-dos", "cover.jpg")), "nuevo");
    assert.equal(m.reg.verificar.length, ARCH.length);
    assert.ok(m.reg.verificar.every((u) => u.startsWith("https://media.test/m/")));
    assert.equal(m.reg.render_json.length, 1);
    const [s, id, e] = m.reg.render_json[0];
    assert.equal(s, SEM);
    assert.equal(id, "lun-reel-dos");
    assert.equal(e.estado, "renderizado");
    assert.ok(e.en > EN_ORIGINAL, "en posterior al original");
    assert.deepEqual(e.medios, { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story.jpg", duracionMs: 4900 });
    const v = m.visual.get(SEM)!["lun-reel-dos"];
    assert.equal(v.correccion?.estado, "aplicada");
    assert.deepEqual(v.correccion?.slides, [0]);
    assert.ok(v.revisor, "conserva el revisor");
    assert.deepEqual(v.fase1, [], "conserva fase1");
    // Carpeta final = render nuevo, con manifiesto; sin previa ni tmp.
    const final = join(m.out, SEM, "lun-reel-dos");
    assert.equal(leer(join(final, "cover.jpg")), "nuevo");
    assert.ok(existsSync(join(final, MANIFIESTO)));
    assert.deepEqual(restos(m.out, "lun-reel-dos"), [], "sin .prev- ni .tmp-corr-");
    assert.equal(m.reg.avisos.length, 0);

    // Review Focus 5: con el render.json reescrito, el preview vuelve a salir exactamente una vez.
    const enviados = new Set<string>([`${claveFila(SEM, "lun-reel-dos")}|${EN_ORIGINAL}`]);
    const enviado = (k: string, en: string): boolean => enviados.has(`${k}|${en}`);
    assert.equal(previewsPendientes(m.semanas, T0, enviado).length, 0, "el original ya tenía preview");
    const tras: SemanaLeida[] = [{ ...m.semanas[0], render: { ...m.semanas[0].render, [id]: e } }];
    const p1 = previewsPendientes(tras, T0, enviado);
    assert.equal(p1.length, 1, "un preview nuevo");
    assert.equal(p1[0].pieza.id, "lun-reel-dos");
    enviados.add(`${claveFila(SEM, "lun-reel-dos")}|${e.en}`);
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

await checkAsync("corregirFondos: la hora cruza el margen durante la subida → omitida, render.json intacto, el Mac queda igual que el servidor", () =>
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
    assert.equal(m.reg.rsync.length, 1, "no vuelve a subir el original tan cerca de la hora");
    const final = join(m.out, SEM, "lun-reel-subida");
    assert.equal(leer(join(final, "cover.jpg")), leer(join(m.server, SEM, "lun-reel-subida", "cover.jpg")), "Mac = servidor");
    assert.ok(existsSync(join(final, MANIFIESTO)));
    assert.deepEqual(restos(m.out, "lun-reel-subida"), []);
    const c = m.visual.get(SEM)!["lun-reel-subida"].correccion;
    assert.equal(c?.estado, "omitida");
    assert.match(c?.motivo ?? "", /^sin margen antes de la hora/);
    assert.equal(m.reg.avisos.length, 1, "avisa que el preview no muestra lo que se publicará");
  }),
);

await checkAsync("corregirFondos: rsync falla → fallida, original restaurado y re-subido, un aviso, render.json intacto", () =>
  conMundoC([piezaPlan("lun-reel-rsync", "14:00")], { "lun-reel-rsync": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const base = deps();
    let n = 0;
    const r = await corregirFondos(m.semanas, [{ semana: SEM, id: "lun-reel-rsync" }], m.out, ENV_C, PUERTA_ON, {
      ...base,
      rsync: async (l, rem) => {
        n++;
        if (n === 1) {
          // Subida a medias: un archivo nuevo alcanzó a llegar.
          writeFileSync(join(m.server, rem, "cover.jpg"), leer(join(l, "cover.jpg")));
          throw new Error("rsync terminó con código 12");
        }
        await base.rsync(l, rem);
      },
    });
    assert.deepEqual(r, { aplicadas: 0, fallidas: 1, omitidas: 0 });
    assert.equal(m.reg.render_json.length, 0);
    const final = join(m.out, SEM, "lun-reel-rsync");
    assert.equal(leer(join(final, "cover.jpg")), "viejo", "original restaurado en el Mac");
    assert.equal(leer(join(m.server, SEM, "lun-reel-rsync", "cover.jpg")), "viejo", "y re-subido al servidor");
    assert.equal(n, 2);
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
        verificar: async (u) => !u.includes("lun-reel-ver/cover.jpg"),
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

const FILTROS: { caso: string; entrada: VisualPieza; estado?: SemanaLeida["estado"]; sinManifiesto?: boolean; id?: string }[] = [
  { caso: "correccion previa", entrada: { revisor: AVISO_PORTADA, correccion: { en: "x", estado: "fallida", slides: [0] } } },
  { caso: "sin revisor", entrada: {} },
  { caso: "revisor «sin revisar»", entrada: { revisor: { ...AVISO_PORTADA, estado: "sin revisar" } } },
  { caso: "sin slides a corregir", entrada: { revisor: revisorCon([{ n: 1, que: "portada", slide: 0, compite: false, ajeno: false, frase: "ok" }]) } },
  { caso: "publicada", entrada: { revisor: AVISO_PORTADA }, estado: { "lun-filtro": { estado: "publicado" } } },
  { caso: "saltada", entrada: { revisor: AVISO_PORTADA }, estado: { "lun-filtro": { estado: "saltado" } } },
  { caso: "sin manifiesto", entrada: { revisor: AVISO_PORTADA }, sinManifiesto: true },
  { caso: "sin pieza en el plan", entrada: { revisor: AVISO_PORTADA }, id: "lun-no-existe" },
];
for (const f of FILTROS) {
  await checkAsync(`corregirFondos: ${f.caso} → no hace nada`, () =>
    conMundoC([piezaPlan("lun-filtro", "14:00")], { "lun-filtro": f.entrada, ...(f.id ? { [f.id]: f.entrada } : {}) }, async (m, deps) => {
      if (f.sinManifiesto) rmSync(join(m.out, SEM, "lun-filtro", MANIFIESTO));
      const antes = structuredClone(m.visual.get(SEM));
      const r = await corregirFondos(m.semanas, [{ semana: SEM, id: f.id ?? "lun-filtro" }], m.out, ENV_C, PUERTA_ON, deps());
      assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 0 });
      assert.equal(m.reg.render.length + m.reg.rsync.length + m.reg.render_json.length + m.reg.avisos.length, 0);
      assert.deepEqual(m.visual.get(SEM), antes);
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

await checkAsync("corregirFondos: una corrida cortada a mitad del swap (sin final, con .prev-) se recupera y el servidor queda con el original", () =>
  conMundoC([piezaPlan("lun-reel-corte", "14:00")], { "lun-reel-corte": { revisor: AVISO_PORTADA } }, async (m, deps) => {
    const final = join(m.out, SEM, "lun-reel-corte");
    renameSync(final, join(m.out, SEM, "lun-reel-corte.prev-99999"));
    mkdirSync(join(m.out, SEM, "lun-reel-corte.tmp-corr-99999"));
    writeFileSync(join(m.server, SEM, "lun-reel-corte", "cover.jpg"), "nuevo"); // la subida alcanzó a empezar
    // Puerta inactiva: la recuperación corre igual (deshace lo de una corrida anterior), pero no corrige.
    const r = await corregirFondos(m.semanas, [], m.out, ENV_C, { activa: false, motivo: "apagada en config.json", respondidos: 0 }, deps());
    assert.deepEqual(r, { aplicadas: 0, fallidas: 0, omitidas: 0 });
    assert.equal(leer(join(final, "cover.jpg")), "viejo");
    assert.ok(existsSync(join(final, MANIFIESTO)));
    assert.deepEqual(restos(m.out, "lun-reel-corte"), []);
    assert.equal(leer(join(m.server, SEM, "lun-reel-corte", "cover.jpg")), "viejo", "re-subido el original");
    assert.equal(m.reg.render_json.length, 0);
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
