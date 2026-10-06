import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync, done } from "../_check.ts";
import { startHttp } from "../../src/kb/inbox.ts";
import { manejarMedio } from "../../src/calendario/media-server.ts";
import { leerSemana, urlPublica } from "../../src/calendario/plan.ts";
import { addDays, localParts, weekMonday } from "../../src/calendario/time.ts";
import {
  crearEscritorRender, leerPuerta, pendientes, procesar, renderPieza, rsyncReal, verificarReal,
} from "../../src/calendario/render.ts";

/**
 * Flujo completo del render en el Mac con Chromium y ffmpeg reales (npm run test:reel):
 * base git temporal (remoto bare local), un reel y un carrusel de verdad, un borrador
 * con ruta fuera de la semana, rsync en modo local a una carpeta que sirve el mismo
 * servidor de medios del bot (startHttp + manejarMedio) y render.json subido al remoto.
 * No toca knowledge/, ni ssh, ni Telegram. Las carpetas temporales quedan para mirarlas.
 */

const TOKEN = "f00dfeed0123456789abcdef";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  assert.equal(r.status, 0, String(r.stderr));
}
function dims(f: string): string {
  return execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", f], { encoding: "utf8" }).trim();
}

const raiz = mkdtempSync(join(tmpdir(), "cal-render-media-"));
console.log(`(carpetas en ${raiz})`);
const dia = localParts(new Date(Date.now() + 2 * 86_400_000)).dia;
const semana = weekMonday(new Date(Date.now() + 2 * 86_400_000));
const otroDia = addDays(dia, 1);

function pieza(id: string, d: string, formato: "reel" | "carrusel", borrador = `${id}.json`): Record<string, unknown> {
  return {
    id, dia: d, hora: "14:00", formato, arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "herramienta",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador, estado: "planificado",
  };
}

const borrador = (formato: "reel" | "carrusel") => ({
  name: "3 IAs gratis para estudiar",
  angle: "tutorial",
  pillar: "herramienta",
  ...(formato === "reel" ? { audio: "tono.m4a" } : {}),
  slides: [
    { template: "Hook", props: { title: "Deja de pagar: 3 IAs gratis para estudiar", highlight: "gratis" } },
    { template: "Lead", props: { title: "Por qué todavía estudias sin IA", highlight: "todavía", body: "El 80 % no lo sabe." } },
    { template: "Step", props: { step: "01", heading: "Abre NotebookLM", highlight: "NotebookLM", body: "Sube 5 apuntes en PDF y escribe: resume en 10 puntos." } },
    { template: "Step", props: { step: "02", heading: "Pide un resumen", highlight: "resumen", body: "Escribe: hazme 5 preguntas de repaso." } },
    { template: "Prompt", props: { title: "Copia este prompt", prompt: "Explícame este tema como a un niño de 10 años" } },
    { template: "Stat", props: { value: "3 h", label: "ahorras por semana", context: "Gratis, en 10 minutos." } },
    { template: "Cta", props: { title: "Guárdalo para tu prueba", highlight: "Guárdalo", reason: "Cada semana, IA útil.", handle: "ia.punto.es" } },
  ],
});

// Base git temporal con un remoto bare local.
const bare = join(raiz, "remoto.git");
git(raiz, "init", "--bare", "-b", "main", bare);
const kb = join(raiz, "kb");
git(raiz, "clone", bare, kb);
const sd = join(kb, "_calendario", semana);
mkdirSync(sd, { recursive: true });
writeFileSync(join(kb, "fuera.json"), JSON.stringify(borrador("reel")));
writeFileSync(join(sd, "plan.json"), JSON.stringify({
  semana, zona: "America/Santiago", experimento: null,
  piezas: [
    pieza("prueba-reel", dia, "reel"),
    pieza("prueba-carrusel", otroDia, "carrusel"),
    pieza("prueba-fuera", otroDia, "reel", "../fuera.json"),
  ].map((p, i) => (i === 2 ? { ...p, hora: "16:00" } : p)),
}));
writeFileSync(join(sd, "prueba-reel.json"), JSON.stringify(borrador("reel")));
writeFileSync(join(sd, "prueba-carrusel.json"), JSON.stringify(borrador("carrusel")));
git(kb, "add", ".");
git(kb, "commit", "-m", "plan de prueba");
git(kb, "push", "-u", "origin", "main");

const audioDir = join(raiz, "audio");
mkdirSync(audioDir);
ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=60", join(audioDir, "tono.m4a")]);

const medios = join(raiz, "servidor-media");
mkdirSync(medios);
const server = startHttp(0, [(req, res) => manejarMedio(req, res, { token: TOKEN, root: medios })]);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const prev = { KB_DIR: process.env.KB_DIR, KB_GIT_PUSH: process.env.KB_GIT_PUSH };
process.env.KB_DIR = kb;
process.env.KB_GIT_PUSH = "1";
const outRoot = join(raiz, "output-calendario");
const avisos: string[] = [];

try {
  await checkAsync("render en el Mac: reel + carrusel reales, rsync local, URL servida, render.json en el remoto", async () => {
    const s = await leerSemana(semana);
    assert.ok(s);
    const pend = pendientes([s], new Date());
    assert.deepEqual(pend.map((p) => p.pieza.id), ["prueba-reel", "prueba-carrusel", "prueba-fuera"]);
    const puerta = await leerPuerta();
    const escritor = crearEscritorRender({ avisar: async (t) => void avisos.push(t) });
    const r = await procesar(pend, outRoot, { base, token: TOKEN, host: "", dir: medios }, {
      render: (p, tmp) => renderPieza(p, tmp, { audioDir, puerta }),
      rsync: rsyncReal,
      verificar: verificarReal,
      escribirRender: escritor.escribirRender,
      confirmar: escritor.confirmar,
      avisar: async (t) => void avisos.push(t),
    });
    assert.deepEqual(r, { ok: 2, fallidas: 1, pendientes: 0 }, avisos.join(" | "));
    assert.deepEqual(avisos, []);

    // Archivos subidos (sin el manifiesto) con las medidas de la spec.
    const reel = join(medios, semana, "prueba-reel");
    assert.deepEqual(readdirSync(reel).sort(), ["cover.jpg", "reel.mp4", "story.jpg"]);
    assert.equal(dims(join(reel, "reel.mp4")), "1080x1920");
    assert.equal(dims(join(reel, "cover.jpg")), "1080x1920");
    assert.equal(dims(join(reel, "story.jpg")), "1080x1920");
    const audio = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", join(reel, "reel.mp4")], { encoding: "utf8" });
    assert.match(audio, /audio/);
    const car = join(medios, semana, "prueba-carrusel");
    const archivos = readdirSync(car).sort();
    assert.deepEqual(archivos, ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg", "06.jpg", "07.jpg", "story.jpg"]);
    assert.equal(dims(join(car, "01.jpg")), "1080x1350");
    assert.equal(dims(join(car, "story.jpg")), "1080x1920");

    // render.json llegó al remoto, con las URLs que el servidor sirve.
    const clon = join(raiz, "clon");
    git(raiz, "clone", bare, clon);
    const rj = JSON.parse(readFileSync(join(clon, "_calendario", semana, "render.json"), "utf8"));
    assert.equal(rj["prueba-reel"].estado, "renderizado");
    assert.deepEqual(rj["prueba-reel"].medios.archivos, ["reel.mp4"]);
    assert.ok(!JSON.stringify(rj).includes(TOKEN), "R48: render.json sin el token");
    assert.ok(rj["prueba-reel"].medios.duracionMs > 5000);
    assert.equal(rj["prueba-carrusel"].medios.archivos.length, 7);
    assert.equal(rj["prueba-fuera"].estado, "fallido");
    assert.match(rj["prueba-fuera"].motivo, /borrador/i);
    const head = await fetch(urlPublica(base, TOKEN, semana, "prueba-reel", rj["prueba-reel"].medios.cover), { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(git(clon, "log", "-1", "--format=%s").trim(), `calendario: render ${semana} (3 piezas)`);
    assert.ok(existsSync(join(clon, "_calendario", semana, "plan.json")));

    // Segunda corrida: nada pendiente.
    const s2 = await leerSemana(semana);
    assert.deepEqual(pendientes([s2!], new Date()), []);
  });
} finally {
  server.close();
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

await done();
