import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import {
  estadoEfectivo, leerSemana, listarSemanas, mediosPublicos, ocultarToken, parsePlan, semanaDir, urlPublica,
  type EstadoEntry, type Pieza, type Plan, type RenderEntry,
} from "../../src/calendario/plan.ts";
import { closeDb, openDb } from "../../src/kb/db.ts";

function pieza(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lun-reel-agentes-claude-code",
    dia: "2026-10-12", hora: "19:30",
    formato: "reel", arquetipo: "tutorial", senal: "guardados",
    tema: "[[Automatización con IA]]", pilar: "herramienta",
    hook: { categoria: "curiosidad", texto: "Esta IA gratis te resume 6 PDFs en un podcast", score: 9 },
    emocion: "alivio",
    entregable: "prompt copiable de 4 líneas para resumir PDFs",
    fraseAmigo: "hay una IA gratis que te resume 6 PDFs en un podcast",
    lectorFrio: { intentos: 2, resultado: "ok", notas: "v1 confundió 'agente' con persona" },
    origen: { fichas: ["fuentes/2026-10-04-dm-x.md"], referencias: ["referencias/claude-code.md"] },
    derivadoDe: null,
    caption: "primera línea con la keyword…\n\n#ia #claudecode #automatizacion",
    borrador: "lun-reel-agentes-claude-code.json",
    estado: "planificado",
    ...extra,
  };
}
function plan(piezas: Record<string, unknown>[] = [pieza()], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    semana: "2026-10-12", zona: "America/Santiago",
    experimento: { variable: "hora", hipotesis: "19:30 rinde más que 12:30 en reels", piezas: ["lun-reel-agentes-claude-code"] },
    piezas, ...extra,
  });
}

check("parsePlan acepta el ejemplo de la spec", () => {
  const p = parsePlan(plan());
  assert.equal(p.piezas.length, 1);
  assert.equal(p.piezas[0].hook.score, 9);
  assert.equal(p.experimento?.variable, "hora");
});
// R46: plan.ts acepta todo plan que validar.mjs acepta.
check("parsePlan (R46): emocion texto o lista; sin estado → planificado; sin derivadoDe → null; latido sin experimento → null", () => {
  const lista = parsePlan(plan([pieza({ emocion: ["curiosidad", "alivio"] })]));
  assert.deepEqual(lista.piezas[0].emocion, ["curiosidad", "alivio"]);
  const sinEstado = { ...pieza() };
  delete sinEstado.estado;
  delete sinEstado.derivadoDe;
  const p = parsePlan(plan([sinEstado])).piezas[0];
  assert.equal(p.estado, "planificado");
  assert.equal(p.derivadoDe, null);
  assert.equal(estadoEfectivo(p), "planificado");
  const latido = parsePlan(JSON.stringify({ semana: "2026-10-12", zona: "America/Santiago", piezas: [], motivo: "sin piezas" }));
  assert.equal(latido.experimento, null);
  assert.deepEqual(latido.piezas, []);
  // Lo que validar.mjs rechaza, plan.ts también: emoción vacía o con algo que no es texto.
  assert.throws(() => parsePlan(plan([pieza({ emocion: [] })])), /emocion/);
  assert.throws(() => parsePlan(plan([pieza({ emocion: ["curiosidad", 3] })])), /emocion/);
});
check("parsePlan rechaza formato story y dice la ruta del campo", () => {
  assert.throws(() => parsePlan(plan([pieza({ formato: "story" })])), /piezas\.0\.formato/);
});
check("parsePlan rechaza hora sin cero inicial o fuera de :00/:30", () => {
  assert.throws(() => parsePlan(plan([pieza({ hora: "7:30" })])), /hora/);
  assert.throws(() => parsePlan(plan([pieza({ hora: "19:15" })])), /hora/);
  assert.throws(() => parsePlan(plan([pieza({ hora: "24:00" })])), /hora/);
});
check("parsePlan rechaza fechas inexistentes", () => {
  assert.throws(() => parsePlan(plan([pieza({ dia: "2026-02-30" })])), /dia/);
  assert.throws(() => parsePlan(plan([pieza({ dia: "2026-13-01" })])), /dia/);
  assert.throws(() => parsePlan(plan([pieza()], { semana: "2026-02-30" })), /semana/);
});
check("parsePlan rechaza una señal fuera de la lista", () => {
  assert.throws(() => parsePlan(plan([pieza({ senal: "likes" })])), /senal/);
});
check("parsePlan rechaza ids repetidos y nombra el id", () => {
  assert.throws(
    () => parsePlan(plan([pieza(), pieza({ dia: "2026-10-13" })])),
    /lun-reel-agentes-claude-code/,
  );
});
check("parsePlan rechaza ids que escapan de la carpeta", () => {
  for (const id of ["../x", "a/b", "", "..", "Lun", "a_b", "ab", "a".repeat(81)]) {
    assert.throws(() => parsePlan(plan([pieza({ id })])), /id/, id);
  }
});
check("parsePlan acepta ids en los límites de 3 y 80 caracteres", () => {
  for (const id of ["abc", "a-1", "a".repeat(80)]) assert.equal(parsePlan(plan([pieza({ id })])).piezas[0].id, id);
});
check("parsePlan rechaza JSON malformado con mensaje claro", () => {
  assert.throws(() => parsePlan("{no es json"), /JSON/);
});
check("parsePlan: piezas vacío con motivo es válido (latido del agente)", () => {
  const p = parsePlan(plan([], { experimento: null, motivo: "Nada publicable esta semana" }));
  assert.deepEqual(p.piezas, []);
  assert.equal(p.motivo, "Nada publicable esta semana");
});
check("parsePlan: campos extra se descartan y __proto__ no contamina", () => {
  const raw = plan([pieza({ intruso: 1 })]).replace('"piezas":', '"__proto__":{"polluted":true},"piezas":');
  const p = parsePlan(raw) as Plan & { intruso?: unknown };
  assert.equal((p.piezas[0] as unknown as Record<string, unknown>).intruso, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(p, "__proto__"), false);
});

const base = pieza() as unknown as Pieza;
const render = (estado: RenderEntry["estado"]): RenderEntry => ({ estado, en: "2026-10-12T10:00:00Z" });
const est = (estado: EstadoEntry["estado"]): EstadoEntry => ({ estado });

check("estadoEfectivo: sin render ni estado → planificado", () => {
  assert.equal(estadoEfectivo(base), "planificado");
});
check("estadoEfectivo: render renderizado / fallido", () => {
  assert.equal(estadoEfectivo(base, render("renderizado")), "renderizado");
  assert.equal(estadoEfectivo(base, render("fallido")), "fallido");
});
check("estadoEfectivo: el estado del bot gana al render", () => {
  assert.equal(estadoEfectivo(base, render("renderizado"), est("publicado")), "publicado");
  assert.equal(estadoEfectivo(base, render("renderizado"), est("saltado")), "saltado");
});
check("estadoEfectivo: el estado del plan se ignora si hay otra fuente", () => {
  const p = { ...base, estado: "publicado" } as Pieza;
  assert.equal(estadoEfectivo(p, render("renderizado")), "renderizado");
  assert.equal(estadoEfectivo(p), "publicado");
});

check("urlPublica codifica cada segmento y no deja //", () => {
  assert.equal(
    urlPublica("https://x.example/", "tok", "2026-10-12", "lun-reel", "cover 1.jpg"),
    "https://x.example/media/tok/2026-10-12/lun-reel/cover%201.jpg",
  );
  assert.equal(urlPublica("https://x.example///", "tok", "s", "i", "a/b?c.jpg"), "https://x.example/media/tok/s/i/a%2Fb%3Fc.jpg");
  assert.ok(!urlPublica("https://x.example/", "t/k", "s", "i", "a").replace("https://", "").includes("//"));
  assert.throws(() => urlPublica("https://x.example", "tok", "s", "", "a"));
});
check("ocultarToken reemplaza todas las apariciones y no hace nada con token vacío", () => {
  assert.equal(ocultarToken("a SECRETO b SECRETO", "SECRETO"), "a *** b ***");
  assert.equal(ocultarToken("nada", ""), "nada");
  const u = urlPublica("https://x.example", "se cr/eto", "s", "i", "a.jpg");
  assert.ok(!ocultarToken(u, "se cr/eto").includes("cr%2Feto"));
  assert.ok(ocultarToken(u, "se cr/eto").includes("/***/"));
});

function conBase<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "cal-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  return fn(dir).finally(() => {
    closeDb();
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });
}

await checkAsync("leerSemana / listarSemanas: lee plan, tolera archivos opcionales corruptos", () =>
  conBase(async () => {
    assert.deepEqual(await listarSemanas(), []);
    assert.equal(await leerSemana("2026-10-12"), undefined);
    mkdirSync(semanaDir("2026-10-12"), { recursive: true });
    mkdirSync(semanaDir("2026-10-05"), { recursive: true });
    mkdirSync(join(semanaDir("2026-10-12"), "..", "no-es-semana"), { recursive: true });
    writeFileSync(join(semanaDir("2026-10-12"), "plan.json"), plan(), "utf8");
    writeFileSync(join(semanaDir("2026-10-12"), "estado.json"), "{corrupto", "utf8");
    writeFileSync(join(semanaDir("2026-10-12"), "render.json"), JSON.stringify({
      "lun-reel-agentes-claude-code": { estado: "renderizado", en: "2026-10-12T10:00:00Z", medios: { archivos: ["a.mp4"] } },
      basura: 5,
    }), "utf8");
    assert.deepEqual(await listarSemanas(), ["2026-10-05", "2026-10-12"]);
    const s = await leerSemana("2026-10-12");
    assert.ok(s);
    assert.equal(s.semana, "2026-10-12");
    assert.deepEqual(Object.keys(s.estado), []);
    assert.equal(s.render["lun-reel-agentes-claude-code"].estado, "renderizado");
    assert.equal(s.render["basura"], undefined);
    assert.equal(s.render["constructor"], undefined);
    assert.equal(await leerSemana("../etc"), undefined);
  }),
);

// R48: render.json guarda nombres de archivo; un render.json viejo (`medios.urls`) se sigue leyendo.
await checkAsync("leerSemana (R48): medios.urls del formato viejo → nombres de archivo; mediosPublicos arma las URLs con el token", () =>
  conBase(async () => {
    mkdirSync(semanaDir("2026-10-12"), { recursive: true });
    writeFileSync(join(semanaDir("2026-10-12"), "plan.json"), plan(), "utf8");
    const viejo = "https://m.example/media/tok-viejo/2026-10-12/lun-reel-agentes-claude-code";
    writeFileSync(join(semanaDir("2026-10-12"), "render.json"), JSON.stringify({
      "lun-reel-agentes-claude-code": {
        estado: "renderizado", en: "2026-10-12T10:00:00Z",
        medios: { urls: [`${viejo}/reel.mp4`], cover: `${viejo}/cover.jpg`, story: `${viejo}/story%201.jpg`, duracionMs: 9000 },
      },
    }), "utf8");
    const s = await leerSemana("2026-10-12");
    const m = s!.render["lun-reel-agentes-claude-code"].medios!;
    assert.deepEqual(m, { archivos: ["reel.mp4"], cover: "cover.jpg", story: "story 1.jpg", duracionMs: 9000 });
    assert.ok(!JSON.stringify(m).includes("tok-viejo"));
    const pub = mediosPublicos(m, "https://nuevo.example/", "tok-nuevo", "2026-10-12", "lun-reel-agentes-claude-code");
    const u = (a: string) => urlPublica("https://nuevo.example/", "tok-nuevo", "2026-10-12", "lun-reel-agentes-claude-code", a);
    assert.deepEqual(pub, { urls: [u("reel.mp4")], cover: u("cover.jpg"), story: u("story 1.jpg"), duracionMs: 9000 });
    // Sin base o sin token no hay URLs (el publish lo rechaza con su motivo).
    assert.deepEqual(mediosPublicos(m, "", "tok", "2026-10-12", "x").urls, []);
    assert.deepEqual(mediosPublicos(m, "https://n.example", undefined, "2026-10-12", "x").urls, []);
  }),
);

await checkAsync("db: reabrir no borra insights ni publicaciones", () =>
  conBase(async () => {
    let db = openDb();
    db.prepare("INSERT INTO publicaciones (pieza_id, tipo, paso, actualizado) VALUES (?, ?, ?, ?)").run("p1", "post", "contenedor", "2026-10-12T00:00:00Z");
    db.prepare("INSERT INTO insights (media_id, ventana, tomada_en, reach) VALUES (?, ?, ?, ?)").run("m1", "24h", "2026-10-13T00:00:00Z", 10);
    db.prepare("INSERT INTO calendario_estado (clave, valor) VALUES (?, ?)").run("k", "v");
    closeDb();
    db = openDb();
    assert.equal((db.prepare("SELECT intentos FROM publicaciones WHERE pieza_id = 'p1'").get() as { intentos: number }).intentos, 0);
    assert.equal((db.prepare("SELECT reach FROM insights WHERE media_id = 'm1'").get() as { reach: number }).reach, 10);
    assert.equal((db.prepare("SELECT valor FROM calendario_estado WHERE clave = 'k'").get() as { valor: string }).valor, "v");
    closeDb();
    db = openDb(); // tercera apertura, mismo resultado
    assert.equal((db.prepare("SELECT count(*) AS n FROM publicaciones").get() as { n: number }).n, 1);
  }),
);
