import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { parsePlan, semanaDir, urlPublica, type Pieza, type RenderEntry, type SemanaLeida } from "../../src/calendario/plan.ts";
import {
  ErrorQa, crearEscritorRender, leerBorradorSeguro, leerPuerta, pendientes, procesar, sincronizarPendiente, tomarCandado,
  type Deps, type PiezaPendiente,
} from "../../src/calendario/render.ts";
import { avisarTelegram } from "../../src/calendario/telegram-directo.ts";

/**
 * Render en el Mac (`npm run calendario:render`) sin Chromium ni red: `pendientes`,
 * `procesar` con `deps` falsos y carpetas temporales, el candado, el borrador fuera
 * de la semana, la escritura de render.json en una base git temporal y el aviso
 * directo por Telegram. El render real (Chromium + ffmpeg) va en test:reel.
 */

const SEMANA = "2026-10-12";
const TOKEN = "tok-SECRETO-123";
const ENV = { base: "https://medios.example", token: TOKEN, host: "srv", dir: "carrusel/media" };

function pieza(id: string, dia: string, hora: string, formato: "reel" | "carrusel" = "reel"): Record<string, unknown> {
  return {
    id, dia, hora, formato, arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "herramienta",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador: `${id}.json`, estado: "planificado",
  };
}

function semana(piezas: Record<string, unknown>[], render: Record<string, RenderEntry> = {}, estado: SemanaLeida["estado"] = {}, s = SEMANA): SemanaLeida {
  const plan = parsePlan(JSON.stringify({ semana: s, zona: "America/Santiago", experimento: null, piezas, ...(piezas.length ? {} : { motivo: "nada" }) }));
  return { semana: s, plan, render, estado };
}

// Lunes 12-oct-2026 10:00 en Chile (UTC-3) = 13:00Z.
const AHORA = new Date("2026-10-12T13:00:00Z");

check("pendientes: solo planificadas, sin render ok, cuya hora aún no pasó", () => {
  const s = semana(
    [
      pieza("lun-reel-uno", "2026-10-12", "14:00"),
      pieza("lun-pasada", "2026-10-12", "09:30"),
      pieza("mar-render-ok", "2026-10-13", "14:00", "carrusel"),
      pieza("mie-publicado", "2026-10-14", "14:00"),
      pieza("jue-saltado", "2026-10-15", "14:00"),
      pieza("vie-fallido", "2026-10-16", "14:00", "carrusel"),
      pieza("sab-reel", "2026-10-17", "14:00"),
    ],
    {
      "mar-render-ok": { estado: "renderizado", en: "x" },
      "vie-fallido": { estado: "fallido", motivo: "score", en: "x" },
    },
    { "mie-publicado": { estado: "publicado" }, "jue-saltado": { estado: "saltado" } },
  );
  const p = pendientes([s, semana([], {}, {}, "2026-10-19")], AHORA);
  assert.deepEqual(p.map((x) => x.pieza.id), ["lun-reel-uno", "sab-reel"]);
  assert.equal(p[0].semana, SEMANA);
  assert.equal(p[0].borradorPath, join(semanaDir(SEMANA), "lun-reel-uno.json"));
});

check("pendientes: la hora exacta ya cuenta como pasada (no se renderiza tarde)", () => {
  const s = semana([pieza("lun-justo", "2026-10-12", "10:00")]);
  assert.deepEqual(pendientes([s], AHORA), []);
});

check("pendientes: ordena por hora de publicación entre semanas", () => {
  const a = semana([pieza("sab-tarde", "2026-10-17", "14:00"), pieza("mar-antes", "2026-10-13", "14:00")]);
  const b = semana([pieza("lun-siguiente", "2026-10-19", "08:00")], {}, {}, "2026-10-19");
  assert.deepEqual(pendientes([b, a], AHORA).map((x) => x.pieza.id), ["mar-antes", "sab-tarde", "lun-siguiente"]);
});

check("urlPublica codifica cada segmento y nunca deja //", () => {
  const u = urlPublica("https://m.example//", "a b", SEMANA, "lun-x", "01.jpg");
  assert.equal(u, "https://m.example/media/a%20b/2026-10-12/lun-x/01.jpg");
  assert.ok(!u.replace("https://", "").includes("//"));
});

// --- procesar ---

interface Registro {
  render: string[];
  rsync: [string, string][];
  verificar: string[];
  escritos: [string, string, RenderEntry][];
  avisos: string[];
  confirmados: string[];
  logs: string[];
}

function pend(id: string, formato: "reel" | "carrusel" = "reel", dia = "2026-10-13"): PiezaPendiente {
  const p = parsePlan(JSON.stringify({ semana: SEMANA, zona: "America/Santiago", experimento: null, piezas: [pieza(id, dia, "14:00", formato)] })).piezas[0] as Pieza;
  return { semana: SEMANA, pieza: p, borradorPath: join("/no/existe", `${id}.json`) };
}

function falsos(over: Partial<Deps> = {}): { deps: Deps; reg: Registro } {
  const reg: Registro = { render: [], rsync: [], verificar: [], escritos: [], avisos: [], confirmados: [], logs: [] };
  const deps: Deps = {
    render: async (p, tmp) => {
      reg.render.push(p.pieza.id);
      const archivos = p.pieza.formato === "reel" ? ["reel.mp4", "cover.jpg", "story.jpg"] : ["01.jpg", "02.jpg", "story.jpg"];
      for (const a of archivos) writeFileSync(join(tmp, a), "x");
      return { archivos, duracionMs: p.pieza.formato === "reel" ? 42_000 : undefined };
    },
    rsync: async (local, remoto) => {
      reg.rsync.push([local, remoto]);
    },
    verificar: async (url) => {
      reg.verificar.push(url);
      return true;
    },
    escribirRender: async (s, id, e) => {
      reg.escritos.push([s, id, e]);
    },
    confirmar: async (s) => {
      reg.confirmados.push(s);
    },
    avisar: async (t) => {
      reg.avisos.push(t);
    },
    ahora: () => AHORA,
    log: (t) => reg.logs.push(t),
    ...over,
  };
  return { deps, reg };
}

function conOut<T>(fn: (out: string) => Promise<T>): Promise<T> {
  const out = mkdtempSync(join(tmpdir(), "cal-render-"));
  return fn(out).finally(() => rmSync(out, { recursive: true, force: true }));
}

await checkAsync("procesar: render + rsync + verificar ok → renderizado con medios (reel y carrusel)", () =>
  conOut(async (out) => {
    const { deps, reg } = falsos();
    const r = await procesar([pend("lun-reel-x"), pend("mar-carrusel-y", "carrusel")], out, ENV, deps);
    assert.deepEqual(r, { ok: 2, fallidas: 0, pendientes: 0 });
    assert.equal(reg.rsync[0][0], join(out, SEMANA, "lun-reel-x"));
    assert.equal(reg.rsync[0][1], `srv:carrusel/media/${SEMANA}/lun-reel-x/`);
    const [s, id, e] = reg.escritos[0];
    assert.equal(s, SEMANA);
    assert.equal(id, "lun-reel-x");
    assert.equal(e.estado, "renderizado");
    const u = (a: string, i = "lun-reel-x") => urlPublica(ENV.base, TOKEN, SEMANA, i, a);
    assert.deepEqual(e.medios, { urls: [u("reel.mp4")], cover: u("cover.jpg"), story: u("story.jpg"), duracionMs: 42_000 });
    const c = reg.escritos[1][2];
    assert.deepEqual(c.medios, {
      urls: [u("01.jpg", "mar-carrusel-y"), u("02.jpg", "mar-carrusel-y")],
      cover: u("01.jpg", "mar-carrusel-y"),
      story: u("story.jpg", "mar-carrusel-y"),
    });
    assert.equal(reg.verificar.length, 6, "verifica cada archivo subido");
    assert.deepEqual(reg.confirmados, [SEMANA], "una sola escritura por semana y corrida");
    assert.ok(existsSync(join(out, SEMANA, "lun-reel-x", "reel.mp4")));
    assert.ok(reg.logs.some((l) => l.includes("[1/2] lun-reel-x") && l.includes("renderizando")), reg.logs.join("\n"));
    assert.ok(!reg.logs.join("\n").includes(TOKEN));
  }),
);

await checkAsync("procesar: el render lanza → fallido con motivo y sigue con la siguiente", () =>
  conOut(async (out) => {
    let n = 0;
    const base = falsos();
    const { deps, reg } = falsos({
      render: async (p, tmp) => {
        if (n++ === 0) throw new Error("Chromium se cayó");
        return base.deps.render(p, tmp);
      },
    });
    const r = await procesar([pend("lun-roto"), pend("mar-bien", "carrusel")], out, ENV, deps);
    assert.deepEqual(r, { ok: 1, fallidas: 1, pendientes: 0 });
    assert.equal(reg.escritos[0][1], "lun-roto");
    assert.equal(reg.escritos[0][2].estado, "fallido");
    assert.match(reg.escritos[0][2].motivo ?? "", /Chromium se cayó/);
    assert.equal(reg.escritos[1][2].estado, "renderizado");
    assert.ok(!existsSync(join(out, SEMANA, "lun-roto")), "sin carpeta final");
    assert.deepEqual(readdirSync(join(out, SEMANA)).filter((f) => f.includes(".tmp-")), [], "sin temporales");
    assert.equal(reg.rsync.length, 1);
  }),
);

await checkAsync("procesar: QA falla → fallido con los motivos (y el token nunca en el motivo)", () =>
  conOut(async (out) => {
    const { deps, reg } = falsos({
      render: async () => {
        throw new ErrorQa(["El reel está sin audio.", `Score 60 < 75: añade un número (${TOKEN})`]);
      },
    });
    const r = await procesar([pend("lun-qa")], out, ENV, deps);
    assert.deepEqual(r, { ok: 0, fallidas: 1, pendientes: 0 });
    const e = reg.escritos[0][2];
    assert.equal(e.estado, "fallido");
    assert.match(e.motivo ?? "", /sin audio/);
    assert.match(e.motivo ?? "", /Score 60 < 75/);
    assert.ok(!(e.motivo ?? "").includes(TOKEN));
  }),
);

await checkAsync("procesar: rsync falla → no escribe, avisa sin token, deja la carpeta; la siguiente corrida solo reintenta la subida", () =>
  conOut(async (out) => {
    const { deps, reg } = falsos({
      rsync: async () => {
        throw new Error(`ssh: connect to host srv port 22: Connection refused (${TOKEN})`);
      },
    });
    const r1 = await procesar([pend("lun-sube")], out, ENV, deps);
    assert.deepEqual(r1, { ok: 0, fallidas: 0, pendientes: 1 });
    assert.deepEqual(reg.escritos, []);
    assert.equal(reg.avisos.length, 1);
    assert.match(reg.avisos[0], /lun-sube/);
    assert.ok(!reg.avisos[0].includes(TOKEN), reg.avisos[0]);
    assert.ok(existsSync(join(out, SEMANA, "lun-sube", "reel.mp4")), "la carpeta final queda en disco");

    const segunda = falsos();
    const r2 = await procesar([pend("lun-sube")], out, ENV, segunda.deps);
    assert.deepEqual(r2, { ok: 1, fallidas: 0, pendientes: 0 });
    assert.deepEqual(segunda.reg.render, [], "no vuelve a renderizar");
    assert.equal(segunda.reg.rsync.length, 1);
    assert.equal(segunda.reg.escritos[0][2].medios?.duracionMs, 42_000, "la duración sale del manifiesto en disco");
  }),
);

await checkAsync("procesar: verificar devuelve false → igual que rsync fallido (sin escribir, aviso con token oculto)", () =>
  conOut(async (out) => {
    const { deps, reg } = falsos({ verificar: async (url) => !url.endsWith("cover.jpg") });
    const r = await procesar([pend("lun-verif")], out, ENV, deps);
    assert.deepEqual(r, { ok: 0, fallidas: 0, pendientes: 1 });
    assert.deepEqual(reg.escritos, []);
    assert.equal(reg.avisos.length, 1);
    assert.match(reg.avisos[0], /cover\.jpg/);
    assert.ok(reg.avisos[0].includes("/media/***/"), reg.avisos[0]);
    assert.ok(!reg.avisos[0].includes(TOKEN));
    assert.ok(existsSync(join(out, SEMANA, "lun-verif")));
  }),
);

await checkAsync("procesar: carpeta temporal a medias → se borra y se renderiza entera", () =>
  conOut(async (out) => {
    const resto = join(out, SEMANA, "lun-medias.tmp-99999");
    mkdirSync(resto, { recursive: true });
    writeFileSync(join(resto, "reel.mp4"), "a medias");
    const { deps, reg } = falsos();
    const r = await procesar([pend("lun-medias")], out, ENV, deps);
    assert.deepEqual(r, { ok: 1, fallidas: 0, pendientes: 0 });
    assert.deepEqual(reg.render, ["lun-medias"]);
    assert.ok(!existsSync(resto));
    assert.deepEqual(readdirSync(join(out, SEMANA)).sort(), ["lun-medias"]);
  }),
);

await checkAsync("procesar: carpeta final sin manifiesto (corrupta) → se borra y se renderiza de nuevo", () =>
  conOut(async (out) => {
    mkdirSync(join(out, SEMANA, "lun-rara"), { recursive: true });
    writeFileSync(join(out, SEMANA, "lun-rara", "reel.mp4"), "?");
    const { deps, reg } = falsos();
    await procesar([pend("lun-rara")], out, ENV, deps);
    assert.deepEqual(reg.render, ["lun-rara"]);
  }),
);

await checkAsync("procesar: la hora pasó mientras renderizaba → no se sube ni se escribe", () =>
  conOut(async (out) => {
    let t = AHORA;
    const base = falsos();
    const { deps, reg } = falsos({
      ahora: () => t,
      render: async (p, tmp) => {
        t = new Date("2026-10-13T17:01:00Z"); // 14:01 en Chile, pasada la hora de la pieza
        return base.deps.render(p, tmp);
      },
    });
    const r = await procesar([pend("mar-tarde", "reel", "2026-10-13")], out, ENV, deps);
    assert.deepEqual(r, { ok: 0, fallidas: 0, pendientes: 1 });
    assert.deepEqual(reg.rsync, []);
    assert.deepEqual(reg.escritos, []);
    assert.ok(reg.logs.some((l) => l.includes("ya pasó")), reg.logs.join("\n"));
  }),
);

await checkAsync("procesar: confirma cada semana al cambiar de semana y al final", () =>
  conOut(async (out) => {
    const { deps, reg } = falsos();
    const otra: PiezaPendiente = { ...pend("lun-otra", "reel", "2026-10-19"), semana: "2026-10-19" };
    await procesar([pend("mar-a"), otra], out, ENV, deps);
    assert.deepEqual(reg.confirmados, [SEMANA, "2026-10-19"]);
  }),
);

await checkAsync("procesar: un aviso que falla no corta la corrida", () =>
  conOut(async (out) => {
    const { deps } = falsos({
      rsync: async () => {
        throw new Error("caído");
      },
      avisar: async () => {
        throw new Error("sin red");
      },
    });
    const r = await procesar([pend("lun-a"), pend("mar-b")], out, ENV, deps);
    assert.deepEqual(r, { ok: 0, fallidas: 0, pendientes: 2 });
  }),
);

await checkAsync("procesar: destino local (sin host) para probar sin ssh", () =>
  conOut(async (out) => {
    const { deps, reg } = falsos();
    await procesar([pend("lun-local")], out, { ...ENV, host: "", dir: "/tmp/medios/" }, deps);
    assert.equal(reg.rsync[0][1], `/tmp/medios/${SEMANA}/lun-local/`);
  }),
);

// --- borrador seguro, puerta, candado ---

function conBase<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "cal-base-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  return fn(dir).finally(() => {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });
}

await checkAsync("leerBorradorSeguro: rechaza rutas fuera de la carpeta de la semana", () =>
  conBase(async (dir) => {
    const sd = semanaDir(SEMANA);
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, "ok.json"), "{}");
    writeFileSync(join(dir, "fuera.json"), "{}");
    symlinkSync(join(dir, "fuera.json"), join(sd, "enlace.json"));
    assert.equal(await leerBorradorSeguro(SEMANA, "ok.json"), "{}");
    for (const malo of ["../fuera.json", "/etc/passwd", "sub/x.json", "..", "enlace.json", "x.txt", "", "..json"]) {
      await assert.rejects(leerBorradorSeguro(SEMANA, malo), /borrador/, malo);
    }
    await assert.rejects(leerBorradorSeguro(SEMANA, "falta.json"), /no existe/i);
  }),
);

await checkAsync("leerPuerta: config.json de la base o 2.5 / 1.5 por defecto", () =>
  conBase(async (dir) => {
    assert.deepEqual(await leerPuerta(), { lecturaPalabrasPorSegundo: 2.5, lecturaMinSegundos: 1.5 });
    mkdirSync(join(dir, "_calendario"), { recursive: true });
    writeFileSync(join(dir, "_calendario", "config.json"), JSON.stringify({ puerta: { lecturaPalabrasPorSegundo: { valor: 3 }, lecturaMinSegundos: { valor: "x" } } }));
    assert.deepEqual(await leerPuerta(), { lecturaPalabrasPorSegundo: 3, lecturaMinSegundos: 1.5 });
    writeFileSync(join(dir, "_calendario", "config.json"), "{roto");
    assert.deepEqual(await leerPuerta(), { lecturaPalabrasPorSegundo: 2.5, lecturaMinSegundos: 1.5 });
  }),
);

await checkAsync("tomarCandado: dos corridas a la vez → la segunda no entra; PID muerto → se recupera", () =>
  conOut(async (out) => {
    const lock = join(out, ".lock");
    const soltar = await tomarCandado(lock);
    assert.ok(soltar);
    assert.equal(readFileSync(lock, "utf8").trim(), String(process.pid));
    assert.equal(await tomarCandado(lock), undefined, "el PID vive → sale en silencio");
    await soltar!();
    assert.ok(!existsSync(lock));
    writeFileSync(lock, "999999999\n");
    const otra = await tomarCandado(lock);
    assert.ok(otra, "candado de un PID muerto");
    await otra!();
    writeFileSync(lock, "basura");
    const tercera = await tomarCandado(lock);
    assert.ok(tercera, "candado ilegible");
    await tercera!();
  }),
);

// --- escritura de render.json en una base git temporal (remoto bare local) ---

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

await checkAsync("crearEscritorRender: lee render.json fresco tras el pull, fusiona, un commit por semana y push", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "cal-git-"));
  const prev = { KB_DIR: process.env.KB_DIR, PUSH: process.env.KB_GIT_PUSH, GIT: process.env.KB_GIT };
  try {
    const bare = join(raiz, "remoto.git");
    git(raiz, "init", "--bare", "-b", "main", bare);
    const mac = join(raiz, "mac");
    const otro = join(raiz, "otro");
    git(raiz, "clone", bare, mac);
    mkdirSync(join(mac, "_calendario", SEMANA), { recursive: true });
    writeFileSync(join(mac, "_calendario", SEMANA, "plan.json"), "{}");
    git(mac, "add", ".");
    git(mac, "commit", "-m", "plan");
    git(mac, "push", "-u", "origin", "main");
    git(raiz, "clone", bare, otro);
    // Otra máquina sube una entrada de render.json DESPUÉS de que el Mac empezó (el Mac no la tiene).
    writeFileSync(join(otro, "_calendario", SEMANA, "render.json"), JSON.stringify({ "lun-previo": { estado: "renderizado", en: "x" } }));
    git(otro, "add", ".");
    git(otro, "commit", "-m", "otro");
    git(otro, "push");

    process.env.KB_DIR = mac;
    process.env.KB_GIT_PUSH = "1";
    delete process.env.KB_GIT;
    const avisos: string[] = [];
    const esc = crearEscritorRender({ avisar: async (t) => void avisos.push(t) });
    await esc.escribirRender(SEMANA, "mar-a", { estado: "renderizado", en: "1" });
    await esc.escribirRender(SEMANA, "mie-b", { estado: "fallido", motivo: "m", en: "2" });
    await esc.confirmar(SEMANA);
    await esc.confirmar(SEMANA); // sin nada nuevo: no hace otro commit

    const final = JSON.parse(readFileSync(join(mac, "_calendario", SEMANA, "render.json"), "utf8"));
    assert.deepEqual(Object.keys(final).sort(), ["lun-previo", "mar-a", "mie-b"]);
    git(otro, "pull");
    const remoto = JSON.parse(readFileSync(join(otro, "_calendario", SEMANA, "render.json"), "utf8"));
    assert.deepEqual(Object.keys(remoto).sort(), ["lun-previo", "mar-a", "mie-b"], "subió al remoto");
    const log = git(otro, "log", "--format=%s").trim().split("\n");
    assert.equal(log[0], `calendario: render ${SEMANA} (2 piezas)`);
    assert.equal(log.filter((l) => l.startsWith("calendario: render")).length, 1);
    assert.deepEqual(avisos, []);
    // Solo render.json: plan.json nunca se toca.
    assert.equal(readFileSync(join(mac, "_calendario", SEMANA, "plan.json"), "utf8"), "{}");
    assert.deepEqual(git(mac, "show", "--name-only", "--format=", "HEAD").trim().split("\n"), [`_calendario/${SEMANA}/render.json`]);

    // El Mac se durmió tras escribir render.json y antes del commit; y un commit quedó sin push.
    process.env.KB_GIT_PUSH = "0";
    await esc.escribirRender(SEMANA, "jue-c", { estado: "renderizado", en: "3" });
    await esc.confirmar(SEMANA); // commit local, sin push
    const actual = JSON.parse(readFileSync(join(mac, "_calendario", SEMANA, "render.json"), "utf8"));
    writeFileSync(join(mac, "_calendario", SEMANA, "render.json"), JSON.stringify({ ...actual, "vie-d": { estado: "renderizado", en: "4" } }));
    process.env.KB_GIT_PUSH = "1";
    assert.equal(await sincronizarPendiente([SEMANA]), undefined);
    git(otro, "pull");
    const rec = JSON.parse(readFileSync(join(otro, "_calendario", SEMANA, "render.json"), "utf8"));
    assert.deepEqual(Object.keys(rec).sort(), ["jue-c", "lun-previo", "mar-a", "mie-b", "vie-d"]);
    assert.equal(git(mac, "status", "--porcelain").trim(), "");
    assert.equal(await sincronizarPendiente([SEMANA]), undefined, "sin nada pendiente no hace nada");
  } finally {
    for (const [k, v] of [["KB_DIR", prev.KB_DIR], ["KB_GIT_PUSH", prev.PUSH], ["KB_GIT", prev.GIT]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(raiz, { recursive: true, force: true });
  }
});

// --- Telegram directo ---

await checkAsync("avisarTelegram: manda a cada chat, oculta tokens y nunca lanza", async () => {
  const llamadas: { url: string; body: string }[] = [];
  const env = { TELEGRAM_BOT_TOKEN: "123:BOT", TELEGRAM_ALLOWED_CHAT_IDS: "11, 22,", MEDIA_PUBLIC_TOKEN: TOKEN };
  const ok = await avisarTelegram(`url https://x/media/${TOKEN}/a`, {
    env,
    fetch: (async (url: string, init: RequestInit) => {
      llamadas.push({ url, body: String(init.body) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
  });
  assert.equal(ok, true);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0].url, "https://api.telegram.org/bot123:BOT/sendMessage");
  assert.deepEqual(llamadas.map((l) => JSON.parse(l.body).chat_id), [11, 22]);
  assert.ok(!llamadas[0].body.includes(TOKEN));

  const avisos: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => void avisos.push(a.join(" "));
  try {
    const falla = await avisarTelegram("hola", {
      env,
      fetch: (async (url: string) => {
        throw new Error(`fetch failed ${url}`);
      }) as unknown as typeof fetch,
    });
    assert.equal(falla, false);
    assert.ok(avisos.length > 0);
    assert.ok(!avisos.join(" ").includes("123:BOT"), avisos.join(" "));
    assert.equal(await avisarTelegram("hola", { env: {} }), false, "sin token no hace nada");
  } finally {
    console.warn = warn;
  }
});
