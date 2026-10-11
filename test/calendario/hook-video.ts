import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { parseBorrador } from "../../src/calendario/draft.ts";
import {
  HECHO, KLING, RESPALDO, SUFIJO_PROMPT, aplicarHook, hookVideoError, pendientesHook, type DepsAplicar, type HookVideo,
} from "../../src/calendario/hook-video.ts";
import { parsePlan, type RenderEntry, type SemanaLeida } from "../../src/calendario/plan.ts";

/**
 * Hook con video IA: forma de `hookVideo`, qué reels esperan su clip y la
 * aplicación (mezcla → QA → reemplazo → subida → HEAD) con dependencias falsas.
 * La mezcla real con ffmpeg se prueba a mano con `scripts/reel-hook-video.sh`.
 */

const SEMANA = "2026-10-12";
const ENV = { base: "https://medios.example", token: "tok-SECRETO", host: "", dir: "" };
const PROMPT = "Cinematic slow dolly-in on a team of Chilean coworkers in silence at a meeting in Santiago.";
// Lunes 12-oct-2026 10:00 en Chile (UTC-3).
const AHORA = new Date("2026-10-12T13:00:00Z");
const OK: RenderEntry = { estado: "renderizado", medios: { archivos: ["reel.mp4"], duracionMs: 1000 }, en: "x" };

function pieza(id: string, dia: string, hora: string, formato: "reel" | "carrusel" = "reel"): Record<string, unknown> {
  return {
    id, dia, hora, formato, arquetipo: "compartible", senal: "envios", tema: "t", pilar: "curiosidad",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador: `${id}.json`, estado: "planificado",
  };
}

function semana(piezas: Record<string, unknown>[], render: Record<string, RenderEntry>, estado: SemanaLeida["estado"] = {}): SemanaLeida {
  return { semana: SEMANA, plan: parsePlan(JSON.stringify({ semana: SEMANA, zona: "America/Santiago", experimento: null, piezas })), render, estado };
}

/** Carpeta de salida temporal con `reel.mp4` en las piezas dadas. */
function salida(ids: string[]): string {
  const out = mkdtempSync(join(tmpdir(), "hook-video-"));
  for (const id of ids) {
    mkdirSync(join(out, SEMANA, id), { recursive: true });
    writeFileSync(join(out, SEMANA, id, "reel.mp4"), "original");
  }
  return out;
}

check("hookVideo: forma válida e inválida (prompt corto, segundos fuera de rango, campos extra)", () => {
  assert.equal(hookVideoError({ prompt: PROMPT }), undefined);
  assert.equal(hookVideoError({ prompt: PROMPT, segundos: 6 }), undefined);
  assert.match(hookVideoError({ prompt: "corto" })!, /prompt/);
  assert.match(hookVideoError({ prompt: PROMPT, segundos: 2 })!, /segundos/);
  assert.match(hookVideoError({ prompt: PROMPT, segundos: 4.5 })!, /segundos/);
  assert.match(hookVideoError({ prompt: PROMPT, url: "x" })!, /desconocido/);
  assert.match(hookVideoError("x")!, /objeto/);
});

check("hookVideo: parseBorrador lo conserva y rechaza uno mal formado", () => {
  const b = { name: "dom-reel-x", pillar: "curiosidad", slides: [{ template: "Hook", props: { title: "t" } }], hookVideo: { prompt: PROMPT } };
  assert.deepEqual(parseBorrador(JSON.stringify(b)).hookVideo, { prompt: PROMPT });
  assert.throws(() => parseBorrador(JSON.stringify({ ...b, hookVideo: { prompt: "x" } })), /hookVideo/);
});

await checkAsync("pendientesHook: solo reels renderizados/programados con hookVideo, lejos de su hora, sin marca", async () => {
  const ids = ["lun-cerca", "mar-ok", "mie-programado", "jue-sin-hook", "vie-hecho", "sab-publicado", "dom-sin-render", "lun-carrusel"];
  const out = salida(ids);
  try {
    writeFileSync(join(out, SEMANA, "vie-hecho", HECHO), "{}");
    const s = semana(
      [
        pieza("lun-cerca", "2026-10-12", "10:30"), // a 30 min: dentro del margen
        pieza("mar-ok", "2026-10-13", "14:00"),
        pieza("mie-programado", "2026-10-14", "14:00"),
        pieza("jue-sin-hook", "2026-10-15", "14:00"),
        pieza("vie-hecho", "2026-10-16", "14:00"),
        pieza("sab-publicado", "2026-10-17", "14:00"),
        pieza("dom-sin-render", "2026-10-18", "14:00"),
        pieza("lun-carrusel", "2026-10-13", "16:00", "carrusel"),
      ],
      { "lun-cerca": OK, "mar-ok": OK, "mie-programado": OK, "jue-sin-hook": OK, "vie-hecho": OK, "sab-publicado": OK, "lun-carrusel": OK },
      { "mie-programado": { estado: "programado" }, "sab-publicado": { estado: "publicado" } },
    );
    const hooks: Record<string, HookVideo> = { "mar-ok": { prompt: PROMPT, segundos: 4 } };
    const leer = async (_s: string, p: { id: string }) => hooks[p.id] ?? (p.id === "jue-sin-hook" ? undefined : { prompt: PROMPT });
    const r = await pendientesHook([s], AHORA, out, leer);
    assert.deepEqual(r.map((x) => x.id), ["mar-ok", "mie-programado"]);
    assert.equal(r[0].prompt, PROMPT + SUFIJO_PROMPT);
    assert.equal(r[0].segundos, 4);
    assert.deepEqual(r[0].kling, { ...KLING, duration: 4 });
    assert.equal(r[1].segundos, 5);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

function deps(over: Partial<DepsAplicar> = {}): DepsAplicar & { subidas: string[] } {
  const subidas: string[] = [];
  return {
    subidas,
    mezclar: async (_reel, clip, salida) => copyFile(clip, salida),
    qa: async () => ({ ok: true, motivos: [] }),
    rsync: async (local) => {
      subidas.push(...readFileSync(join(local, "reel.mp4"), "utf8").split("\n"));
      assert.deepEqual(readdirSync(local), ["reel.mp4"]);
    },
    verificar: async () => true,
    ahora: () => AHORA,
    ...over,
  };
}

await checkAsync("aplicarHook: respalda el original, reemplaza reel.mp4, sube solo ese archivo y marca la pieza", async () => {
  const out = salida(["mar-ok"]);
  const clip = join(out, "clip.mp4");
  writeFileSync(clip, "con-hook");
  try {
    const d = deps();
    const p = { semana: SEMANA, id: "mar-ok", dia: "2026-10-13", hora: "14:00", prompt: PROMPT, segundos: 5, kling: { ...KLING, duration: 5 } };
    await aplicarHook(p, clip, out, ENV, d);
    const final = join(out, SEMANA, "mar-ok");
    assert.equal(readFileSync(join(final, "reel.mp4"), "utf8"), "con-hook");
    assert.equal(readFileSync(join(final, RESPALDO), "utf8"), "original");
    assert.ok(existsSync(join(final, HECHO)));
    assert.deepEqual(d.subidas, ["con-hook"]);
    // Reintento: mezcla desde el respaldo, no sobre el reel que ya tiene hook.
    let base = "";
    await aplicarHook(p, clip, out, ENV, deps({ mezclar: async (reel, c, s) => { base = readFileSync(reel, "utf8"); await copyFile(c, s); } }));
    assert.equal(base, "original");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

await checkAsync("aplicarHook: QA que falla o servidor que no sirve → lanza y no marca; cerca de la hora no toca nada", async () => {
  const out = salida(["mar-ok"]);
  const clip = join(out, "clip.mp4");
  writeFileSync(clip, "con-hook");
  const final = join(out, SEMANA, "mar-ok");
  const p = { semana: SEMANA, id: "mar-ok", dia: "2026-10-13", hora: "14:00", prompt: PROMPT, segundos: 5, kling: { ...KLING, duration: 5 } };
  try {
    await assert.rejects(aplicarHook(p, clip, out, ENV, deps({ qa: async () => ({ ok: false, motivos: ["cuadro 0 negro"] }) })), /QA.*cuadro 0 negro/);
    assert.equal(readFileSync(join(final, "reel.mp4"), "utf8"), "original");
    assert.ok(!existsSync(join(final, ".tmp-hook.mp4")));
    await assert.rejects(aplicarHook(p, clip, out, ENV, deps({ verificar: async () => false })), /no sirve/);
    assert.ok(!existsSync(join(final, HECHO)));
    await assert.rejects(aplicarHook({ ...p, dia: "2026-10-12", hora: "10:30" }, clip, out, ENV, deps()), /Falta menos/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
