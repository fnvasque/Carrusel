import { check, checkAsync, done } from "./_check.ts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitYVerificar, deshacerCommit, programar, type DepsProgramar } from "../src/publicar/programar.ts";
import { leerManifiesto } from "../src/calendario/render.ts";
import { piezasCercanas, proximoHueco, resolverCuando, semanaDe } from "../src/publicar/hueco.ts";
import type { Pieza, Plan } from "../src/calendario/plan.ts";
import { PlanSchema } from "../src/calendario/plan.ts";
import { parseBorrador } from "../src/calendario/draft.ts";
import { problemasVideo, type InfoVideo } from "../src/publicar/video.ts";
import { armarPieza, borradorDe, idDe, insertarPieza, problemasCaption } from "../src/publicar/pieza.ts";

const igual = (a: unknown, b: unknown): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};
const lanza = (fn: () => unknown, texto: string): void => {
  try {
    fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.includes(texto)) throw new Error(`mensaje sin «${texto}»: ${m}`);
    return;
  }
  throw new Error("no lanzó");
};

check("proximoHueco: 14:20 Chile + 15 min → 15:00", () => {
  igual(proximoHueco(new Date("2026-11-03T17:20:00Z")), { dia: "2026-11-03", hora: "15:00" });
});

check("proximoHueco: 14:15 Chile exactas → 14:30", () => {
  igual(proximoHueco(new Date("2026-11-03T17:15:00Z")), { dia: "2026-11-03", hora: "14:30" });
});

check("proximoHueco: domingo 23:50 cruza a lunes 00:30 y semanaDe es el lunes", () => {
  igual(proximoHueco(new Date("2026-11-09T02:50:00Z")), { dia: "2026-11-09", hora: "00:30" });
  igual(semanaDe("2026-11-09"), "2026-11-09");
  igual(semanaDe("2026-11-08"), "2026-11-02");
});

check("resolverCuando: hora que no es :00/:30 lanza", () => {
  lanza(() => resolverCuando("2026-11-05 19:15", new Date("2026-11-03T12:00:00Z")), "HH:00 o HH:30");
});

check("resolverCuando: hora pasada lanza «ya pasó»", () => {
  lanza(() => resolverCuando("2026-11-01 19:00", new Date("2026-11-03T12:00:00Z")), "ya pasó");
});

check("resolverCuando: «ahora» y fecha futura válida", () => {
  const ahora = new Date("2026-11-03T17:20:00Z");
  igual(resolverCuando("ahora", ahora), { dia: "2026-11-03", hora: "15:00" });
  igual(resolverCuando("2026-11-05 19:30", ahora), { dia: "2026-11-05", hora: "19:30" });
});

check("piezasCercanas: ventana de 120 min en el mismo día", () => {
  const p = [{ id: "a", dia: "2026-11-05", hora: "13:00" }] as Pieza[];
  igual(piezasCercanas(p, "2026-11-05", "14:30"), ["a"]);
  igual(piezasCercanas(p, "2026-11-05", "15:00"), []);
  igual(piezasCercanas(p, "2026-11-06", "13:00"), []);
});

const HOOK = "Hice este video en 2 días, sin saber animar";
const planFixture = (): Plan =>
  PlanSchema.parse({
    semana: "2026-11-02",
    zona: "America/Santiago",
    experimento: null,
    piezas: [
      {
        id: "vie-reel-otra", dia: "2026-11-06", hora: "10:00", formato: "reel", arquetipo: "atemporal", senal: "retencion",
        tema: "", pilar: "trabajo", hook: { categoria: "x", texto: "x", score: 1 }, emocion: "curiosidad", entregable: "x",
        fraseAmigo: "x", lectorFrio: { intentos: 0, resultado: "manual", notas: "" }, origen: { fichas: [], referencias: [] },
        caption: "x", borrador: "vie-reel-otra.json",
      },
    ],
  });
const piezaNueva = (id = "jue-reel-x"): Pieza =>
  armarPieza({ id, dia: "2026-11-05", hora: "19:00", hook: HOOK, caption: "Hola #ia", hoy: "2026-11-03" });

check("idDe: día de la semana, reel y slug sin tildes", () => {
  igual(idDe("2026-11-05", HOOK), "jue-reel-hice-este-video-en-2-dias-sin-saber-animar");
});

check("idDe: hook de 200 caracteres da id ≤ 80 sin guion final", () => {
  const id = idDe("2026-11-05", "palabra ".repeat(25));
  if (id.length > 80 || id.endsWith("-") || !/^[a-z0-9-]{3,80}$/.test(id)) throw new Error(id);
});

check("insertarPieza: el plan sigue válido, ordenado y la pieza queda hecha a mano", () => {
  const plan = insertarPieza(planFixture(), piezaNueva());
  PlanSchema.parse(plan);
  igual(plan.piezas.map((p) => p.id), ["jue-reel-x", "vie-reel-otra"]);
  const p = plan.piezas[0];
  if (p.parametros?.hechaAMano !== true || p.parametros.origen !== "publicar") throw new Error("parametros");
  igual(p.lectorFrio, { intentos: 0, resultado: "manual", notas: "Pieza publicada con /publicar (2026-11-03), fuera del planificador." });
  igual([p.hook.score, p.estado, p.borrador], [0, "planificado", "jue-reel-x.json"]);
});

check("insertarPieza: no muta el plan y un id repetido lanza", () => {
  const plan = planFixture();
  const nuevo = insertarPieza(plan, piezaNueva());
  igual(plan.piezas.length, 1);
  lanza(() => insertarPieza(nuevo, piezaNueva()), "id repetido: jue-reel-x");
});

check("borradorDe: pasa parseBorrador", () => {
  const b = parseBorrador(JSON.stringify(borradorDe("jue-reel-x", HOOK)));
  igual([b.name, b.pillar, b.angle, b.slides.length], ["jue-reel-x", "trabajo", HOOK, 1]);
});

check("problemasCaption: largo y exceso de hashtags", () => {
  igual(problemasCaption("a".repeat(2201)).length, 1);
  igual(problemasCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ")).length, 1);
  igual(problemasCaption("Hola #ia"), []);
});

const infoV = (o: Partial<InfoVideo> = {}): InfoVideo => ({ ancho: 1080, alto: 1920, duracionMs: 30000, codec: "h264", tieneAudio: true, ...o });

check("problemasVideo: horizontal da error «vertical»", () => {
  const r = problemasVideo(infoV({ ancho: 1920, alto: 1080 }));
  if (!r.errores.some((e) => e.includes("vertical"))) throw new Error(JSON.stringify(r));
});

check("problemasVideo: 1080x1920 de 30 s h264 no da errores ni avisos", () => {
  igual(problemasVideo(infoV()), { errores: [], avisos: [] });
});

check("problemasVideo: 2 s da error; 3 s y 900 s pasan", () => {
  igual(problemasVideo(infoV({ duracionMs: 2000 })).errores.length, 1);
  igual(problemasVideo(infoV({ duracionMs: 3000 })).errores.length, 0);
  igual(problemasVideo(infoV({ duracionMs: 900000 })).errores.length, 0);
  igual(problemasVideo(infoV({ duracionMs: 901000 })).errores.length, 1);
});

check("problemasVideo: 120 s da aviso (no error); 90 s no avisa", () => {
  const r = problemasVideo(infoV({ duracionMs: 120000 }));
  igual(r.errores, []);
  igual(r.avisos.length, 1);
  igual(problemasVideo(infoV({ duracionMs: 90000 })).avisos, []);
});

check("problemasVideo: 1080x1350 da aviso de aspecto; 1080x1900 (±2 %) no", () => {
  const r = problemasVideo(infoV({ alto: 1350 }));
  igual(r.errores, []);
  igual(r.avisos.length, 1);
  if (!r.avisos[0].includes("9:16")) throw new Error(r.avisos[0]);
  igual(problemasVideo(infoV({ alto: 1900 })).avisos, []);
});

check("problemasVideo: vp9 da error; hevc pasa", () => {
  igual(problemasVideo(infoV({ codec: "vp9" })).errores.length, 1);
  igual(problemasVideo(infoV({ codec: "hevc" })).errores, []);
});

// ---------- programar (deps falsas: sin ffmpeg, red ni git) ----------
const AHORA = new Date("2026-11-03T17:20:00Z");
const CAPTION = "Hola, así lo hice.\n\n#ia #trabajo";
const infoOk: InfoVideo = { ancho: 1080, alto: 1920, duracionMs: 30000, codec: "h264", tieneAudio: true };

interface Entorno { outRoot: string; kb: string; video: string; orden: string[]; eventos: string[]; deps: DepsProgramar }
function entorno(o: { semanas?: string[]; ahora?: Date; commit?: () => Promise<void>; info?: InfoVideo; candadoOcupado?: boolean; deshacer?: (msg: string) => Promise<void> } = {}): Entorno {
  const base = mkdtempSync(join(tmpdir(), "publicar-test-"));
  const outRoot = join(base, "out");
  const kb = join(base, "kb");
  mkdirSync(outRoot, { recursive: true });
  for (const s of o.semanas ?? ["2026-11-02"]) {
    const dir = join(kb, "_calendario", s);
    mkdirSync(dir, { recursive: true });
    const plan = planFixture();
    writeFileSync(join(dir, "plan.json"), JSON.stringify({ ...plan, semana: s, piezas: s === "2026-11-02" ? plan.piezas : [] }, null, 2));
  }
  const video = join(base, "video.mp4");
  writeFileSync(video, "video de mentira");
  const orden: string[] = [];
  const eventos: string[] = [];
  const deps: DepsProgramar = {
    outRoot,
    kbCalendario: kb,
    ahora: () => o.ahora ?? AHORA,
    pull: async () => void orden.push("pull"),
    commit: async (paths, msg) => {
      // Review Focus 1: al llegar al commit, la carpeta final ya tiene manifiesto válido y el plan ya trae la pieza.
      const dirSem = join(outRoot, "2026-11-02");
      const finales = existsSync(dirSem) ? readdirSync(dirSem).filter((f) => !f.startsWith(".") && !f.includes(".tmp-")) : [];
      const manifiesto = finales.length === 1 ? await leerManifiesto(join(dirSem, finales[0])) : undefined;
      const enPlan = (JSON.parse(readFileSync(join(kb, "_calendario", "2026-11-02", "plan.json"), "utf8")) as Plan).piezas.some((p) => p.id === finales[0]);
      orden.push(`commit:${manifiesto && enPlan ? "con-carpeta" : "sin-carpeta"}:${paths.length}`);
      if (!msg) throw new Error("commit sin mensaje");
      if (o.commit) await o.commit();
    },
    deshacer: async (msg) => {
      eventos.push("deshacer");
      await o.deshacer?.(msg);
    },
    candado: async () => {
      if (o.candadoOcupado) return undefined;
      eventos.push("candado");
      return async () => void eventos.push("suelta");
    },
    render: async () => (orden.push("render"), eventos.push("render"), { ok: true, salida: "ok" }),
    inspeccionar: async () => o.info ?? infoOk,
    extraer: async (_r, dir) => {
      orden.push("extraer");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "cover.jpg"), "jpeg");
      writeFileSync(join(dir, "story.jpg"), "jpeg");
      return { cover: join(dir, "cover.jpg"), story: join(dir, "story.jpg"), clave: [] };
    },
  };
  return { outRoot, kb, video, orden, eventos, deps };
}
const ARGS = { cuando: "2026-11-05 19:00", hook: HOOK, caption: CAPTION, dryRun: false };
const planDe = (e: Entorno, s = "2026-11-02"): Plan => JSON.parse(readFileSync(join(e.kb, "_calendario", s, "plan.json"), "utf8"));
const rechaza = async (p: Promise<unknown>, texto: string): Promise<void> => {
  try {
    await p;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.includes(texto)) throw new Error(`mensaje sin «${texto}»: ${m}`);
    return;
  }
  throw new Error("no lanzó");
};

await checkAsync("programar: camino feliz (carpeta + manifiesto antes del commit, plan con la pieza nueva)", async () => {
  const e = entorno();
  const r = await programar({ video: e.video, ...ARGS }, e.deps);
  igual(e.orden, ["pull", "extraer", "commit:con-carpeta:2", "render"]);
  igual([r.programada, r.semana, r.id, r.dia, r.hora], [true, "2026-11-02", "jue-reel-hice-este-video-en-2-dias-sin-saber-animar", "2026-11-05", "19:00"]);
  const m = await leerManifiesto(r.carpeta);
  igual(m?.archivos, ["reel.mp4", "cover.jpg", "story.jpg"]);
  igual(m?.duracionMs, 30000);
  igual(r.carpeta, join(e.outRoot, "2026-11-02", r.id));
  const plan = planDe(e);
  igual(plan.piezas.map((p) => p.id), [r.id, "vie-reel-otra"]);
  PlanSchema.parse(plan);
  parseBorrador(readFileSync(join(e.kb, "_calendario", "2026-11-02", `${r.id}.json`), "utf8"));
  igual(r.render, { ok: true, salida: "ok" });
});

await checkAsync("programar: dryRun no escribe nada ni llama a commit/render", async () => {
  const e = entorno();
  const antes = readFileSync(join(e.kb, "_calendario", "2026-11-02", "plan.json"), "utf8");
  const r = await programar({ video: e.video, ...ARGS, dryRun: true }, e.deps);
  igual(r.programada, false);
  igual(existsSync(r.carpeta), false);
  igual(existsSync(join(e.outRoot, "2026-11-02")), false);
  igual(readFileSync(join(e.kb, "_calendario", "2026-11-02", "plan.json"), "utf8"), antes);
  igual(e.orden, ["pull"]);
});

await checkAsync("programar: semana sin plan.json → «aún no tiene plan»", async () => {
  const e = entorno();
  await rechaza(programar({ video: e.video, ...ARGS, cuando: "2026-11-12 10:00" }, e.deps), "la semana 2026-11-09 aún no tiene plan");
  igual(e.orden, ["pull"]);
});

await checkAsync("programar: la semana sale del día resuelto («ahora» que cruza a lunes), no de hoy", async () => {
  // Domingo 23:50 en Chile → el hueco es lunes 00:30 de la semana siguiente.
  const cruza = new Date("2026-11-09T02:50:00Z");
  const sin = entorno({ semanas: ["2026-11-02"], ahora: cruza });
  await rechaza(programar({ video: sin.video, ...ARGS, cuando: "ahora" }, sin.deps), "2026-11-09 aún no tiene plan");
  const con = entorno({ semanas: ["2026-11-02", "2026-11-09"], ahora: cruza });
  const r = await programar({ video: con.video, ...ARGS, cuando: "ahora" }, con.deps);
  igual([r.semana, r.dia, r.hora], ["2026-11-09", "2026-11-09", "00:30"]);
  igual(planDe(con, "2026-11-09").piezas.length, 1);
  igual(planDe(con, "2026-11-02").piezas.length, 1);
});

await checkAsync("programar: id repetido falla antes de copiar nada y sin commit", async () => {
  const e = entorno();
  const r = await programar({ video: e.video, ...ARGS }, e.deps);
  // Mismo plan (ya con la pieza), pero sin carpeta final: solo el id repetido del plan debe frenar.
  const otro = entorno();
  writeFileSync(join(otro.kb, "_calendario", "2026-11-02", "plan.json"), readFileSync(join(e.kb, "_calendario", "2026-11-02", "plan.json")));
  await rechaza(programar({ video: otro.video, ...ARGS }, otro.deps), `id repetido: ${r.id}`);
  igual(existsSync(join(otro.outRoot, "2026-11-02")), false);
  igual(otro.orden, ["pull"]);
  // Correr dos veces lo mismo sobre el mismo entorno también lanza, sin tocar el plan.
  const antes = planDe(e);
  await rechaza(programar({ video: e.video, ...ARGS }, e.deps), "id repetido");
  igual(planDe(e), antes);
});

await checkAsync("programar: una pieza a 1 h da cercanas y se programa igual", async () => {
  const e = entorno();
  const r = await programar({ video: e.video, ...ARGS, cuando: "2026-11-06 11:00" }, e.deps);
  igual(r.cercanas, ["vie-reel-otra"]);
  igual(r.programada, true);
});

await checkAsync("programar: si commit lanza, se propaga y no hay render", async () => {
  const e = entorno({ commit: async () => { throw new Error("el plan no llegó a la base: ahead 1"); } });
  await rechaza(programar({ video: e.video, ...ARGS }, e.deps), "el plan no llegó a la base");
  igual(e.orden.includes("render"), false);
});

await checkAsync("programar: errores del video y del caption se juntan; avisos van al resultado", async () => {
  const mal = entorno({ info: { ...infoOk, ancho: 1920, alto: 1080 } });
  await rechaza(programar({ video: mal.video, ...ARGS, caption: "x".repeat(2300) }, mal.deps), "vertical");
  igual(existsSync(join(mal.outRoot, "2026-11-02")), false);
  const aviso = entorno({ info: { ...infoOk, duracionMs: 120000 } });
  const r = await programar({ video: aviso.video, ...ARGS }, aviso.deps);
  igual(r.avisos.length, 1);
});

await checkAsync("programar: hook sin letras ni números pide --id; con --id funciona", async () => {
  const e = entorno();
  await rechaza(programar({ video: e.video, ...ARGS, hook: "¡¡¡???" }, e.deps), "el hook necesita letras o números (o pasa --id)");
  const r = await programar({ video: e.video, ...ARGS, hook: "¡¡¡???", id: "jue-reel-manual" }, e.deps);
  igual(r.id, "jue-reel-manual");
});

await checkAsync("commitYVerificar: clon ahead de origin lanza «el plan no llegó a la base»", async () => {
  const llamadas: string[][] = [];
  await rechaza(
    commitYVerificar(["a.json"], "msg", {
      commitPaths: async () => "abc1234",
      git: async (args) => (llamadas.push(args), { code: 0, out: "## main...origin/main [ahead 1]\n" }),
    }),
    "el plan no llegó a la base",
  );
  igual(llamadas[0], ["status", "-sb"]);
});

await checkAsync("commitYVerificar: sin ahead pasa; commitPaths sin hash lanza", async () => {
  await commitYVerificar(["a.json"], "msg", { commitPaths: async () => "abc1234", git: async () => ({ code: 0, out: "## main...origin/main\n" }) });
  await rechaza(
    commitYVerificar(["a.json"], "msg", { commitPaths: async () => undefined, git: async () => ({ code: 0, out: "## main...origin/main\n" }) }),
    "el plan no llegó a la base",
  );
});

await checkAsync("programar: commit ahead → se revierte todo (reset, plan restaurado, sin carpeta ni borrador)", async () => {
  const e = entorno({ commit: async () => { throw new Error("el plan no llegó a la base: ## main...origin/main [ahead 1]"); } });
  const planAntes = readFileSync(join(e.kb, "_calendario", "2026-11-02", "plan.json"), "utf8");
  await rechaza(programar({ video: e.video, ...ARGS }, e.deps), "No quedó nada programado; puedes reintentar");
  igual(e.eventos, ["candado", "deshacer", "suelta"]);
  igual(readFileSync(join(e.kb, "_calendario", "2026-11-02", "plan.json"), "utf8"), planAntes);
  igual(readdirSync(join(e.kb, "_calendario", "2026-11-02")), ["plan.json"]);
  igual(readdirSync(join(e.outRoot, "2026-11-02")), []);
  // Y reintentar ya no da «id repetido».
  const r = await programar({ video: e.video, ...ARGS }, { ...e.deps, commit: async () => {} });
  igual(r.programada, true);
});

await checkAsync("programar: si el deshacer falla, el error dice qué quedó y los comandos", async () => {
  const e = entorno({
    commit: async () => { throw new Error("push roto"); },
    deshacer: async () => { throw new Error("hay commits locales ajenos"); },
  });
  try {
    await programar({ video: e.video, ...ARGS }, e.deps);
    throw new Error("no lanzó");
  } catch (x) {
    const m = (x as Error).message;
    for (const t of ["No pude deshacer todo", "commit local", "git reset --keep @{u}", "git checkout --"]) if (!m.includes(t)) throw new Error(`sin «${t}»: ${m}`);
    if (m.includes("No quedó nada programado")) throw new Error(m);
  }
});

await checkAsync("programar: candado tomado durante el trabajo y soltado antes del render; ocupado lanza; dry-run no lo toma", async () => {
  const e = entorno();
  await programar({ video: e.video, ...ARGS }, e.deps);
  igual(e.eventos, ["candado", "suelta", "render"]);
  const ocupado = entorno({ candadoOcupado: true });
  await rechaza(programar({ video: ocupado.video, ...ARGS }, ocupado.deps), "candado");
  igual(ocupado.orden, []);
  const dry = entorno();
  await programar({ video: dry.video, ...ARGS, dryRun: true }, dry.deps);
  igual(dry.eventos, []);
});

await checkAsync("deshacerCommit: solo revierte si el único commit ahead es el nuestro", async () => {
  const llamadas: string[][] = [];
  const git = (ahead: string) => async (args: string[]) => (llamadas.push(args), { code: 0, out: args[0] === "log" ? ahead : "" });
  await deshacerCommit("mi msg", git("mi msg\n"));
  igual(llamadas.map((a) => a[0]), ["log", "reset"]);
  igual(llamadas[1], ["reset", "--keep", "@{u}"]);
  llamadas.length = 0;
  await deshacerCommit("mi msg", git(""));
  igual(llamadas.map((a) => a[0]), ["log"]);
  await rechaza(deshacerCommit("mi msg", git("otro\nmi msg\n")), "no son solo el nuestro");
});

await done();
