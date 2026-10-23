import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync } from "../_check.ts";
import { parsePlan, semanaDir, type SemanaLeida } from "../../src/calendario/plan.ts";
import { MANIFIESTO } from "../../src/calendario/render.ts";
import { revisarRenderizadas, type DepsRevision } from "../../src/calendario/revision-fondos.ts";
import type { Cuadro } from "../../src/calendario/cuadros-visuales.ts";
import type { PresupuestoSemana, RevisionPieza, VisualJson, VisualPieza } from "../../src/calendario/visual.ts";

/**
 * Orquestación de la revisión de fondos en el Mac con deps falsas: sin modelo, sin
 * ffmpeg, sin Telegram. Base temporal (KB_DIR) con plan y borradores; outRoot temporal
 * con la carpeta final y su manifiesto.
 */

const SEMANA = "2026-10-26";
// Lunes 26-oct-2026 12:00 en Chile (UTC-3) = 15:00Z.
const AHORA = new Date("2026-10-26T15:00:00Z");

function pieza(id: string, dia: string, hora: string, formato: "reel" | "carrusel" = "reel"): Record<string, unknown> {
  return {
    id, dia, hora, formato, arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "herramienta",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador: `${id}.json`, estado: "planificado",
  };
}

// Reel: Hook (ai) de 4 s + Cta (ai) de 0,9 s → portada + Hook a 1 s y final + Cta a 0 s y final = 5 cuadros.
const BORRADOR = {
  name: "x", pillar: "herramienta",
  slides: [
    { template: "Hook", props: { title: "Tres atajos para tu correo" }, background: { ai: "oficina" } },
    { template: "Cta", props: { title: "Guárdalo", subtitle: "y pruébalo hoy" }, background: { ai: "escritorio" } },
  ],
};
const ESCENAS = [{ start: 0, dur: 4 }, { start: 4, dur: 0.9 }];

interface Mundo {
  semanas: SemanaLeida[];
  out: string;
  visual: Map<string, VisualJson>;
  reg: { revisar: { n: number }[][]; extraer: Cuadro[][]; fotos: { ruta: string; caption: string; botones: { texto: string; data: string }[][] }[]; logs: string[] };
}

async function conMundo(
  piezas: Record<string, unknown>[],
  fn: (m: Mundo, deps: (o?: Partial<DepsRevision>) => DepsRevision) => Promise<void>,
  opts: { visual?: Record<string, unknown> } = {},
): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), "rev-fondos-base-"));
  const out = mkdtempSync(join(tmpdir(), "rev-fondos-out-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = base;
  try {
    const sd = semanaDir(SEMANA);
    mkdirSync(sd, { recursive: true });
    const planRaw = { semana: SEMANA, zona: "America/Santiago", experimento: null, piezas };
    writeFileSync(join(sd, "plan.json"), JSON.stringify(planRaw));
    for (const p of piezas) {
      writeFileSync(join(sd, `${p.id}.json`), JSON.stringify(BORRADOR));
      const final = join(out, SEMANA, p.id as string);
      mkdirSync(final, { recursive: true });
      writeFileSync(join(final, "reel.mp4"), "x");
      writeFileSync(join(final, "cover.jpg"), "x");
      writeFileSync(join(final, MANIFIESTO), JSON.stringify({ archivos: ["reel.mp4", "cover.jpg"], duracionMs: 4900, escenas: ESCENAS }));
    }
    const semanas: SemanaLeida[] = [{ semana: SEMANA, plan: parsePlan(JSON.stringify(planRaw)), render: {}, estado: {} }];
    const visual = new Map<string, VisualJson>();
    if (opts.visual) visual.set(SEMANA, structuredClone(opts.visual) as VisualJson);
    const m: Mundo = { semanas, out, visual, reg: { revisar: [], extraer: [], fotos: [], logs: [] } };
    const deps = (o: Partial<DepsRevision> = {}): DepsRevision => ({
      revisar: async (imagenes) => {
        m.reg.revisar.push(imagenes.map((i) => ({ n: i.n })));
        const r: RevisionPieza = {
          en: AHORA.toISOString(), modelo: "gpt-4o", estado: "revisado", usd: 0.01,
          imagenes: imagenes.map((i) => ({ n: i.n, que: i.que, compite: i.n === 1, ajeno: false, frase: `frase ${i.n}` })),
        };
        return r;
      },
      llamar: async () => {
        throw new Error("no debe llamarse");
      },
      extraer: async (_final, destino, cuadros) => {
        m.reg.extraer.push(cuadros);
        mkdirSync(destino, { recursive: true });
        return cuadros.map((c) => {
          const ruta = join(destino, `${c.n}.jpg`);
          writeFileSync(ruta, "jpg");
          return { n: c.n, ruta, que: c.que };
        });
      },
      enviarFoto: async (ruta, caption, botones) => {
        assert.ok(existsSync(ruta), "la foto existe al mandarla");
        m.reg.fotos.push({ ruta, caption, botones });
        return true;
      },
      escribirVisual: async (semana, id, e) => {
        const v = visual.get(semana) ?? {};
        (v as Record<string, VisualPieza | PresupuestoSemana>)[id] = structuredClone(e);
        visual.set(semana, v);
      },
      leerVisual: async (semana) => structuredClone(visual.get(semana) ?? {}),
      log: (t) => m.reg.logs.push(t),
      ahora: () => AHORA,
      env: { OPENAI_API_KEY: "sk-test" },
      ...o,
    });
    await fn(m, deps);
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(base, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
}

const MANANA = (id: string) => pieza(id, "2026-10-27", "14:00");

await checkAsync("revisarRenderizadas: un «compite» manda 1 foto con 2 botones y escribe revisor y _presupuesto", () =>
  conMundo([MANANA("mar-reel-uno")], async (m, deps) => {
    const r = await revisarRenderizadas(m.semanas, m.out, deps());
    assert.equal(m.reg.revisar.length, 1);
    assert.equal(m.reg.extraer[0].length, 5, "5 cuadros pedidos");
    assert.equal(m.reg.fotos.length, 1);
    const f = m.reg.fotos[0];
    assert.match(f.caption, /mar-reel-uno · portada/);
    assert.match(f.caption, /fondo-compite/);
    assert.deepEqual(f.botones.map((fila) => fila.map((b) => b.texto)), [["Tenía razón", "No"]]);
    assert.equal(f.botones[0][0].data, `cal-visual:${SEMANA}:mar-reel-uno:1:si`);
    assert.equal(f.botones[0][1].data, `cal-visual:${SEMANA}:mar-reel-uno:1:no`);
    const v = m.visual.get(SEMANA)!;
    assert.equal(v["mar-reel-uno"].revisor?.estado, "revisado");
    assert.deepEqual(v._presupuesto, { imagenes: 5, usd: 0.01 });
    assert.deepEqual(r, { revisadas: 1, sinRevisar: 0, avisos: 1, usd: 0.01 });
    assert.ok(!existsSync(join(m.out, ".revision", SEMANA, "mar-reel-uno")), "los cuadros se borran");
  }),
);

await checkAsync("revisarRenderizadas: conserva fase1 y una segunda corrida no vuelve a revisar ni avisar", () =>
  conMundo(
    [MANANA("mar-reel-uno")],
    async (m, deps) => {
      await revisarRenderizadas(m.semanas, m.out, deps());
      assert.equal(m.visual.get(SEMANA)!["mar-reel-uno"].fase1?.length, 1, "fase1 intacta");
      const r2 = await revisarRenderizadas(m.semanas, m.out, deps());
      assert.equal(m.reg.revisar.length, 1);
      assert.equal(m.reg.fotos.length, 1);
      assert.deepEqual(r2, { revisadas: 0, sinRevisar: 0, avisos: 0, usd: 0 });
    },
    { visual: { "mar-reel-uno": { fase1: [{ tipo: "tilde", motivo: "m", en: "x" }] } } },
  ),
);

await checkAsync("revisarRenderizadas: con 118 imágenes en la semana y una pieza que pide 5, se revisan 2", () =>
  conMundo(
    [MANANA("mar-reel-uno")],
    async (m, deps) => {
      await revisarRenderizadas(m.semanas, m.out, deps());
      assert.equal(m.reg.extraer[0].length, 2);
      assert.equal(m.reg.revisar[0].length, 2);
      assert.deepEqual(m.visual.get(SEMANA)!._presupuesto, { imagenes: 120, usd: 1.01 });
    },
    { visual: { _presupuesto: { imagenes: 118, usd: 1 } } },
  ),
);

await checkAsync("revisarRenderizadas: con 120 imágenes queda «sin revisar» y no hay llamada", () =>
  conMundo(
    [MANANA("mar-reel-uno")],
    async (m, deps) => {
      const r = await revisarRenderizadas(m.semanas, m.out, deps());
      assert.equal(m.reg.extraer.length, 0);
      assert.equal(m.reg.revisar.length, 0);
      const rev = m.visual.get(SEMANA)!["mar-reel-uno"].revisor!;
      assert.equal(rev.estado, "sin revisar");
      assert.match(rev.motivo ?? "", /120 imágenes/);
      assert.deepEqual(rev.imagenes, []);
      assert.equal(rev.usd, 0);
      assert.deepEqual(m.visual.get(SEMANA)!._presupuesto, { imagenes: 120, usd: 1 });
      assert.equal(r.sinRevisar, 1);
    },
    { visual: { _presupuesto: { imagenes: 120, usd: 1 } } },
  ),
);

await checkAsync("revisarRenderizadas: con US$5 gastados queda «sin revisar»", () =>
  conMundo(
    [MANANA("mar-reel-uno")],
    async (m, deps) => {
      await revisarRenderizadas(m.semanas, m.out, deps());
      assert.equal(m.reg.revisar.length, 0);
      assert.match(m.visual.get(SEMANA)!["mar-reel-uno"].revisor?.motivo ?? "", /US\$5/);
    },
    { visual: { _presupuesto: { imagenes: 3, usd: 5 } } },
  ),
);

await checkAsync("revisarRenderizadas: el tope semanal vale entre piezas de la misma corrida", () =>
  conMundo(
    [MANANA("mar-reel-uno"), pieza("mie-reel-dos", "2026-10-28", "14:00")],
    async (m, deps) => {
      await revisarRenderizadas(m.semanas, m.out, deps());
      assert.deepEqual(m.reg.extraer.map((c) => c.length), [5, 2]);
      assert.deepEqual(m.visual.get(SEMANA)!._presupuesto, { imagenes: 120, usd: 0.02 });
    },
    { visual: { _presupuesto: { imagenes: 113, usd: 0 } } },
  ),
);

await checkAsync("revisarRenderizadas: si revisar devuelve «sin revisar», no se manda foto y la clave no queda en el motivo", () =>
  conMundo([MANANA("mar-reel-uno")], async (m, deps) => {
    const r = await revisarRenderizadas(m.semanas, m.out, deps({
      revisar: async () => ({ en: "x", modelo: "gpt-4o", estado: "sin revisar", motivo: "falló la llamada al modelo: Incorrect API key provided: sk-proj-SECRETA123", imagenes: [], usd: 0 }),
    }));
    assert.equal(m.reg.fotos.length, 0);
    const rev = m.visual.get(SEMANA)!["mar-reel-uno"].revisor!;
    assert.equal(rev.estado, "sin revisar");
    assert.ok(!rev.motivo!.includes("SECRETA"), rev.motivo);
    assert.ok(!m.reg.logs.join("\n").includes("SECRETA"));
    assert.deepEqual(m.visual.get(SEMANA)!._presupuesto, { imagenes: 0, usd: 0 }, "sin costo no cuenta imágenes");
    assert.equal(r.sinRevisar, 1);
  }),
);

await checkAsync("revisarRenderizadas: una pieza cuya hora pasó se omite", () =>
  conMundo([pieza("lun-pasada", "2026-10-26", "08:00")], async (m, deps) => {
    await revisarRenderizadas(m.semanas, m.out, deps());
    assert.equal(m.reg.revisar.length, 0);
    assert.equal(m.reg.extraer.length, 0);
    assert.equal(m.visual.get(SEMANA), undefined);
  }),
);

await checkAsync("revisarRenderizadas: si extraer lanza, la pieza no se anota (solo log) y la siguiente sigue", () =>
  conMundo([MANANA("mar-reel-uno"), pieza("mie-reel-dos", "2026-10-28", "14:00")], async (m, deps) => {
    let n = 0;
    const base = deps();
    await revisarRenderizadas(m.semanas, m.out, deps({
      extraer: async (final, destino, cuadros) => {
        if (n++ === 0) throw new Error("ffmpeg se cayó");
        return base.extraer(final, destino, cuadros);
      },
    }));
    const v = m.visual.get(SEMANA)!;
    assert.equal(v["mar-reel-uno"], undefined);
    assert.equal(v["mie-reel-dos"].revisor?.estado, "revisado");
    assert.ok(m.reg.logs.some((l) => /mar-reel-uno/.test(l) && /ffmpeg se cayó/.test(l)));
    assert.ok(!existsSync(join(m.out, ".revision", SEMANA, "mar-reel-uno")));
  }),
);

await checkAsync("revisarRenderizadas: sin OPENAI_API_KEY loguea una vez y no toca visual.json", () =>
  conMundo([MANANA("mar-reel-uno"), pieza("mie-reel-dos", "2026-10-28", "14:00")], async (m, deps) => {
    const r = await revisarRenderizadas(m.semanas, m.out, deps({ env: {} }));
    assert.equal(m.visual.get(SEMANA), undefined);
    assert.equal(m.reg.revisar.length, 0);
    assert.equal(m.reg.logs.filter((l) => /OPENAI_API_KEY/.test(l)).length, 1);
    assert.deepEqual(r, { revisadas: 0, sinRevisar: 0, avisos: 0, usd: 0 });
  }),
);

await checkAsync("revisarRenderizadas: compite y ajeno a la vez → un solo aviso fondo-compite; solo ajeno → fondo-ajeno; foto fallida solo se loguea", () =>
  conMundo([MANANA("mar-reel-uno")], async (m, deps) => {
    let llamadas = 0;
    const r = await revisarRenderizadas(m.semanas, m.out, deps({
      revisar: async (imagenes) => ({
        en: "x", modelo: "gpt-4o", estado: "revisado", usd: 0.02,
        imagenes: imagenes.map((i) => ({ n: i.n, que: i.que, compite: i.n === 1, ajeno: i.n <= 2, frase: "f" })),
      }),
      enviarFoto: async (ruta, caption, botones) => {
        m.reg.fotos.push({ ruta, caption, botones });
        return llamadas++ === 0;
      },
    }));
    assert.equal(m.reg.fotos.length, 2);
    assert.match(m.reg.fotos[0].caption, /\(fondo-compite\)/);
    assert.match(m.reg.fotos[1].caption, /\(fondo-ajeno\)/);
    assert.ok(m.reg.fotos[1].ruta.endsWith("2.jpg"));
    assert.equal(r.avisos, 1);
    assert.ok(m.reg.logs.some((l) => /no llegó/.test(l)));
    assert.equal(m.visual.get(SEMANA)!["mar-reel-uno"].revisor?.estado, "revisado");
  }),
);

await checkAsync("revisarRenderizadas: nada lanza aunque fallen escribirVisual, enviarFoto y revisar", () =>
  conMundo([MANANA("mar-reel-uno")], async (m, deps) => {
    const r = await revisarRenderizadas(m.semanas, m.out, deps({
      escribirVisual: async () => {
        throw new Error("disco lleno");
      },
      enviarFoto: async () => {
        throw new Error("red");
      },
    }));
    assert.equal(r.revisadas, 1);
    assert.ok(m.reg.logs.some((l) => /disco lleno/.test(l)));
    const r2 = await revisarRenderizadas(m.semanas, m.out, deps({
      revisar: async () => {
        throw new Error("boom");
      },
    }));
    assert.equal(r2.revisadas, 0);
  }),
);
