import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync } from "../_check.ts";
import { leerSemana } from "../../src/calendario/plan.ts";
import { addDays, localParts, weekMonday } from "../../src/calendario/time.ts";
import { leerPuerta, pendientes, procesar, renderPieza } from "../../src/calendario/render.ts";

/**
 * Adversario T8 con Chromium y ffmpeg (npm run test:reel). Sin red real: la API de
 * imágenes es un servidor HTTP local (OPENAI_BASE_URL) que cuenta las generaciones.
 *
 * Constraints: «Fondos `ai`: tope 3 por semana»; spec, decisión «Fondos con IA»:
 * «tope 3 imágenes IA por semana … Se generan en el Mac (gpt-image-1 …); el costo
 * entra al registro de costos». La spec ya asume que el validador en la nube puede no
 * correr (spec, «Pieza con score < 75 tras render (el validador en la nube no pudo
 * correr el score)») y por eso el Mac revalida el score; el tope de fondos `ai`, que es
 * lo que cuesta dinero y se genera en el Mac, no se revalida: una semana con 4 fondos
 * `ai` que llega al render genera (y paga) las 4 imágenes.
 */

const raiz = mkdtempSync(join(tmpdir(), "adv-t8-ai-"));
const nonce = `adv-t8-${process.pid}-${Date.now()}`;

// PNG 1024×1536 de relleno para las respuestas falsas de gpt-image-1.
const png = join(raiz, "fondo.png");
const r0 = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x334455:s=1024x1536", "-frames:v", "1", png]);
assert.equal(r0.status, 0, String(r0.stderr));
const b64 = readFileSync(png).toString("base64");

const generaciones: string[] = [];
const api = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    if (req.url?.includes("/images/generations")) {
      try {
        generaciones.push(String(JSON.parse(body).prompt));
      } catch {
        generaciones.push("?");
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ created: 0, data: [{ b64_json: b64 }] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
});
await new Promise<void>((r) => api.listen(0, "127.0.0.1", () => r()));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}/v1`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function pieza(id: string, d: string): Record<string, unknown> {
  return {
    id, dia: d, hora: "14:00", formato: "carrusel", arquetipo: "lista", senal: "guardados", tema: "t", pilar: "herramienta",
    hook: { categoria: "c", texto: "x", score: 9 }, emocion: "e", entregable: "e", fraseAmigo: "f",
    lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
    derivadoDe: null, caption: "c", borrador: `${id}.json`, estado: "planificado",
  };
}

// Carrusel válido (score ≥ 75) con fondo `ai` en Hook y en Cta: 2 por pieza, 4 en la semana.
const borrador = (n: number) => ({
  name: "3 IAs gratis para estudiar",
  angle: "tutorial",
  pillar: "herramienta",
  slides: [
    { template: "Hook", props: { title: "Deja de pagar: 3 IAs gratis para estudiar", highlight: "gratis" }, background: { ai: `escritorio con apuntes ${nonce} ${n}a` } },
    { template: "Lead", props: { title: "Por qué todavía estudias sin IA", highlight: "todavía", body: "El 80 % no lo sabe." } },
    { template: "Step", props: { step: "01", heading: "Abre NotebookLM", highlight: "NotebookLM", body: "Sube 5 apuntes en PDF y escribe: resume en 10 puntos." } },
    { template: "Step", props: { step: "02", heading: "Pide un resumen", highlight: "resumen", body: "Escribe: hazme 5 preguntas de repaso." } },
    { template: "Prompt", props: { title: "Copia este prompt", prompt: "Explícame este tema como a un niño de 10 años" } },
    { template: "Stat", props: { value: "3 h", label: "ahorras por semana", context: "Gratis, en 10 minutos." } },
    { template: "Cta", props: { title: "Guárdalo para tu prueba", highlight: "Guárdalo", reason: "Cada semana, IA útil.", handle: "ia.punto.es" }, background: { ai: `biblioteca de noche ${nonce} ${n}b` } },
  ],
});

const base = new Date(Date.now() + 2 * 86_400_000);
const dia = localParts(base).dia;
const semana = weekMonday(base);
const bare = join(raiz, "remoto.git");
git(raiz, "init", "--bare", "-b", "main", bare);
const kb = join(raiz, "kb");
git(raiz, "clone", bare, kb);
const sd = join(kb, "_calendario", semana);
mkdirSync(sd, { recursive: true });
writeFileSync(join(sd, "plan.json"), JSON.stringify({
  semana, zona: "America/Santiago", experimento: null,
  piezas: [pieza("adv-ai-uno", dia), pieza("adv-ai-dos", addDays(dia, 1))],
}));
writeFileSync(join(sd, "adv-ai-uno.json"), JSON.stringify(borrador(1)));
writeFileSync(join(sd, "adv-ai-dos.json"), JSON.stringify(borrador(2)));
git(kb, "add", ".");
git(kb, "commit", "-m", "plan");

const prev = { KB_DIR: process.env.KB_DIR, KB_GIT: process.env.KB_GIT, OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_BASE_URL: process.env.OPENAI_BASE_URL };
process.env.KB_DIR = kb;
process.env.KB_GIT = "0";
process.env.OPENAI_API_KEY = "sk-falsa-adversario";
process.env.OPENAI_BASE_URL = apiBase;

try {
  await checkAsync("adversario T8: semana con 4 fondos ai que llega al render → el Mac genera más de 3 imágenes IA", async () => {
    const s = await leerSemana(semana);
    assert.ok(s);
    const pend = pendientes([s], new Date());
    assert.equal(pend.length, 2);
    const puerta = await leerPuerta();
    const escritos: Record<string, string> = {};
    await procesar(pend, join(raiz, "out"), { base: "http://127.0.0.1:1", token: "t0k3n-adv", host: "", dir: join(raiz, "media") }, {
      render: (p, tmp) => renderPieza(p, tmp, { audioDir: raiz, puerta }),
      rsync: async () => {},
      verificar: async () => true,
      escribirRender: async (_s, id, e) => void (escritos[id] = `${e.estado} ${e.motivo ?? ""}`),
      avisar: async () => {},
      log: () => {},
    });
    assert.ok(generaciones.length <= 3, `${generaciones.length} imágenes IA generadas en la semana (tope 3); render: ${JSON.stringify(escritos)}`);
  });
} finally {
  api.close();
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // La caché de .cache/ai/ guarda las imágenes falsas por hash del prompt (con nonce): se borran.
  const { createHash } = await import("node:crypto");
  for (const p of generaciones) {
    for (const q of ["medium"]) {
      const key = createHash("sha256").update(`${p}|1024x1536|${q}`).digest("hex");
      rmSync(join(process.cwd(), ".cache", "ai", `${key}.png`), { force: true });
    }
  }
}
