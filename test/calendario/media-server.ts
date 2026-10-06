import assert from "node:assert/strict";
import { request, type Server } from "node:http";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { check, checkAsync } from "../_check.ts";
import { CONTENT_TYPES, limpiarMedios, manejarMedio, resolverMedio } from "../../src/calendario/media-server.ts";
import { startHttp } from "../../src/kb/inbox.ts";

const TOKEN = "t0ken-largo-de-prueba-0123456789abcdef";
const base = mkdtempSync(join(tmpdir(), "media-"));
const root = join(base, "root");
mkdirSync(join(root, "2026-10-12", "lun-reel-x"), { recursive: true });
mkdirSync(join(root, "2026-10-12", "mar-carrusel-y"), { recursive: true });
const mp4 = Buffer.alloc(1000, 7);
writeFileSync(join(root, "2026-10-12", "lun-reel-x", "reel.mp4"), mp4);
writeFileSync(join(root, "2026-10-12", "mar-carrusel-y", "slide-1.jpg"), Buffer.from("jpegdata"));
writeFileSync(join(root, "2026-10-12", "lun-reel-x", "nota.txt"), "no");
writeFileSync(join(base, "secreto.txt"), "secreto");
writeFileSync(join(base, "secreto.jpg"), "secreto");
mkdirSync(join(base, "afuera"));
writeFileSync(join(base, "afuera", "x.jpg"), "afuera");
symlinkSync(join(base, "secreto.jpg"), join(root, "2026-10-12", "lun-reel-x", "enlace.jpg"));
symlinkSync(join(base, "afuera"), join(root, "2026-10-12", "dir-enlace"));

const ok = `/media/${TOKEN}/2026-10-12/lun-reel-x/reel.mp4`;
const res = (p: string, tok = TOKEN) => resolverMedio(p, tok, root);

check("CONTENT_TYPES: jpg, jpeg y mp4", () => {
  assert.equal(CONTENT_TYPES[".jpg"], "image/jpeg");
  assert.equal(CONTENT_TYPES[".jpeg"], "image/jpeg");
  assert.equal(CONTENT_TYPES[".mp4"], "video/mp4");
});

check("resolverMedio: ruta válida queda dentro del root", () => {
  const r = res(ok);
  assert.ok(r?.endsWith(join("2026-10-12", "lun-reel-x", "reel.mp4")), String(r));
  assert.ok(res(`/media/${TOKEN}/2026-10-12/mar-carrusel-y/slide-1.jpg`));
});

check("resolverMedio: token malo, vacío o prefijo → undefined", () => {
  assert.equal(res(ok.replace(TOKEN, "otro-token")), undefined);
  assert.equal(res(ok.replace(TOKEN, TOKEN.slice(0, 10))), undefined);
  assert.equal(res(ok.replace(TOKEN, TOKEN + "x")), undefined);
  assert.equal(res(`/media//2026-10-12/lun-reel-x/reel.mp4`, ""), undefined);
  assert.equal(res(ok, ""), undefined);
});

check("resolverMedio: traversal en todas sus formas → undefined", () => {
  const T = `/media/${TOKEN}`;
  const malos = [
    `${T}/../secreto.jpg`, `${T}/2026-10-12/../../secreto.jpg`, `${T}/2026-10-12/lun-reel-x/../../../secreto.jpg`,
    `${T}/%2e%2e/secreto.jpg`, `${T}/2026-10-12/%2e%2e/%2e%2e/secreto.jpg`, `${T}/2026-10-12/lun-reel-x%2Freel.mp4`,
    `${T}/2026-10-12%2Flun-reel-x/reel.mp4`, `${T}//2026-10-12/lun-reel-x/reel.mp4`, `${T}/2026-10-12//lun-reel-x/reel.mp4`,
    `${T}/2026-10-12/lun-reel-x//reel.mp4`, `${T}/2026-10-12/lun-reel-x/reel.mp4/`, `${T}/2026-10-12/lun-reel-x/`,
    `${T}/2026-10-12/lun-reel-x/..\\..\\secreto.jpg`, `${T}/2026-10-12\\lun-reel-x/reel.mp4`,
    `${T}/%c0%ae%c0%ae/secreto.jpg`, `${T}/2026-10-12/lun-reel-x/%c0%ae%c0%ae%c0%afsecreto.jpg`,
    `${T}/2026-10-12/lun-reel-x/reel.mp4;x.txt`, `${T}/2026-10-12/lun-reel-x/reel.mp4?x=1`, `${T}/2026-10-12/lun-reel-x/reel.mp4#a`,
    `${T}/2026-10-12/lun-reel-x/reel.mp4%00.txt`, `${T}/2026-10-12/lun-reel-x/reel.mp4\0`,
    `${T}/2026-10-12/lun-reel-x/nota.txt`, `${T}/2026-10-12/lun-reel-x/reel`, `${T}/2026-10-12/lun-reel-x/.mp4`,
    `${T}/2026-10-12/lun-reel-x/a..mp4`, `${T}/2026-10-12/lun-reel-x/reel.MP4.txt`,
    `${T}/2026-13-45/lun-reel-x/reel.mp4`, `${T}/semana/lun-reel-x/reel.mp4`, `${T}/2026-10-12/ab/reel.mp4`,
    `${T}/2026-10-12/LUN/reel.mp4`, `${T}/2026-10-12/${"a".repeat(81)}/reel.mp4`, `${T}/2026-10-12/lun-reel-x`,
    `/media/${TOKEN}`, `/otra/${TOKEN}/2026-10-12/lun-reel-x/reel.mp4`, `media/${TOKEN}/2026-10-12/lun-reel-x/reel.mp4`,
    `/media/${TOKEN}/2026-10-12/lun-reel-x/reel.mp4/extra`, "", "/", "/media/",
  ];
  for (const p of malos) assert.equal(res(p), undefined, `debía rechazar ${JSON.stringify(p)}`);
});

check("resolverMedio: symlink que apunta fuera del root → undefined", () => {
  assert.equal(res(`/media/${TOKEN}/2026-10-12/lun-reel-x/enlace.jpg`), undefined);
  assert.equal(res(`/media/${TOKEN}/2026-10-12/dir-enlace/x.jpg`), undefined);
});

check("resolverMedio: archivo inexistente → undefined", () => {
  assert.equal(res(`/media/${TOKEN}/2026-10-12/lun-reel-x/no.mp4`), undefined);
});

// --- servidor real ---
interface Resp { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }
function pedir(port: number, path: string, method = "GET", headers: Record<string, string> = {}): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, path, method, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    r.on("error", reject);
    r.end();
  });
}
const cerrar = (s: Server) => new Promise<void>((r) => { s.close(() => r()); s.closeAllConnections(); });
async function levantar(): Promise<{ s: Server; port: number }> {
  const s = startHttp(0, [(req, rs) => manejarMedio(req, rs, { token: TOKEN, root })]);
  await new Promise((r) => s.once("listening", r));
  return { s, port: (s.address() as AddressInfo).port };
}

await checkAsync("servidor: GET 200 con tipo, largo y no-store; HEAD; rangos", async () => {
  const { s, port } = await levantar();
  try {
    const g = await pedir(port, ok);
    assert.equal(g.status, 200);
    assert.equal(g.headers["content-type"], "video/mp4");
    assert.equal(g.headers["content-length"], "1000");
    assert.equal(g.headers["cache-control"], "no-store");
    assert.equal(g.headers["accept-ranges"], "bytes");
    assert.deepEqual(g.body, mp4);
    const j = await pedir(port, `/media/${TOKEN}/2026-10-12/mar-carrusel-y/slide-1.jpg`);
    assert.equal(j.headers["content-type"], "image/jpeg");
    const h = await pedir(port, ok, "HEAD");
    assert.equal(h.status, 200);
    assert.equal(h.headers["content-length"], "1000");
    assert.equal(h.body.length, 0);
    const r = await pedir(port, ok, "GET", { Range: "bytes=0-99" });
    assert.equal(r.status, 206);
    assert.equal(r.headers["content-range"], "bytes 0-99/1000");
    assert.equal(r.body.length, 100);
    const r2 = await pedir(port, ok, "GET", { Range: "bytes=990-" });
    assert.equal(r2.status, 206);
    assert.equal(r2.body.length, 10);
    const r3 = await pedir(port, ok, "GET", { Range: "bytes=-5" });
    assert.equal(r3.status, 206);
    assert.equal(r3.headers["content-range"], "bytes 995-999/1000");
    const r4 = await pedir(port, ok, "GET", { Range: "bytes=900-5000" });
    assert.equal(r4.headers["content-range"], "bytes 900-999/1000");
    const bad = await pedir(port, ok, "GET", { Range: "bytes=999999999-" });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers["content-range"], "bytes */1000");
    assert.equal((await pedir(port, ok, "GET", { Range: "lo-que-sea" })).status, 200);
    assert.equal((await pedir(port, ok, "GET", { Range: "bytes=50-10" })).status, 416);
  } finally { await cerrar(s); }
});

await checkAsync("servidor: 404 uniforme (token malo, traversal, symlink, método) y /health intacto", async () => {
  const { s, port } = await levantar();
  try {
    const caminos = [
      ok.replace(TOKEN, "malo"), `/media/${TOKEN}/%2e%2e/secreto.jpg`, `/media/${TOKEN}/2026-10-12/lun-reel-x/enlace.jpg`,
      `/media/${TOKEN}/2026-10-12/lun-reel-x/nota.txt`, `/media/${TOKEN}/2026-10-12/lun-reel-x/no-existe.mp4`, `/media/`, `/otra-cosa`,
    ];
    const cuerpos = new Set<string>();
    for (const c of caminos) {
      const r = await pedir(port, c);
      assert.equal(r.status, 404, c);
      cuerpos.add(r.body.toString() + JSON.stringify(r.headers["content-type"]));
    }
    assert.equal((await pedir(port, ok, "POST")).status, 404);
    assert.equal((await pedir(port, ok, "DELETE")).status, 404);
    assert.equal(cuerpos.size, 1, "los 404 deben ser indistinguibles");
    const h = await pedir(port, "/health");
    assert.equal(h.status, 200);
    assert.equal(h.body.toString(), "ok");
  } finally { await cerrar(s); }
});

await checkAsync("servidor: 1000 requests paralelos a un 404 sin caerse", async () => {
  const { s, port } = await levantar();
  try {
    for (let lote = 0; lote < 4; lote++) {
      const rs = await Promise.all(Array.from({ length: 250 }, () => pedir(port, `/media/malo/2026-10-12/lun-reel-x/reel.mp4`)));
      assert.ok(rs.every((r) => r.status === 404));
    }
    assert.equal((await pedir(port, "/health")).status, 200);
  } finally { await cerrar(s); }
});

await checkAsync("servidor: cliente que corta a mitad y archivo borrado no tumban el proceso", async () => {
  const grande = join(root, "2026-10-12", "lun-reel-x", "grande.mp4");
  writeFileSync(grande, Buffer.alloc(30 * 1024 * 1024, 1));
  let caidas = 0;
  const h = () => { caidas++; };
  process.on("unhandledRejection", h);
  process.on("uncaughtException", h);
  const { s, port } = await levantar();
  try {
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => {
        const r = request({ host: "127.0.0.1", port, path: `/media/${TOKEN}/2026-10-12/lun-reel-x/grande.mp4`, agent: false }, (res) => {
          res.once("data", () => { res.destroy(); resolve(); });
        });
        r.on("error", () => resolve());
        r.end();
      });
    }
    // Se borra mientras se sirve.
    const p = pedir(port, `/media/${TOKEN}/2026-10-12/lun-reel-x/grande.mp4`);
    await rm(grande, { force: true });
    await p.catch(() => {});
    assert.equal((await pedir(port, `/media/${TOKEN}/2026-10-12/lun-reel-x/grande.mp4`)).status, 404);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await pedir(port, "/health")).status, 200);
    assert.equal(caidas, 0);
  } finally {
    process.off("unhandledRejection", h);
    process.off("uncaughtException", h);
    await cerrar(s);
  }
});

await checkAsync("servidor: el log oculta el token", async () => {
  const lineas: string[] = [];
  const [log, warn] = [console.log, console.warn];
  console.log = console.warn = (...a: unknown[]) => { lineas.push(a.join(" ")); };
  try {
    const { s, port } = await levantar();
    try {
      await pedir(port, ok);
      await pedir(port, ok.replace("reel.mp4", "no.mp4"));
    } finally { await cerrar(s); }
  } finally { console.log = log; console.warn = warn; }
  assert.ok(!lineas.some((l) => l.includes(TOKEN)), "el token apareció en un log");
});

// --- limpieza ---
await checkAsync("limpiarMedios: borra solo publicadas hace > 7 d, nunca fuera del root", async () => {
  const r2 = join(base, "root2");
  for (const [s, id] of [["2026-09-28", "viejo-pub"], ["2026-10-05", "reciente-pub"], ["2026-09-28", "no-publicado"], ["2026-09-28", "otro-viejo"]]) {
    mkdirSync(join(r2, s, id), { recursive: true });
    writeFileSync(join(r2, s, id, "reel.mp4"), "x");
  }
  const ahora = new Date("2026-10-10T12:00:00Z");
  const borradas = await limpiarMedios(r2, [
    { semana: "2026-09-28", id: "viejo-pub", publicadoEn: "2026-10-02T12:00:00Z" },       // 8 d
    { semana: "2026-10-05", id: "reciente-pub", publicadoEn: "2026-10-06T12:00:00Z" },    // 4 d
    { semana: "2026-09-28", id: "otro-viejo", publicadoEn: "2026-10-03T12:00:00Z" },      // 7 d justos: no
    { semana: "..", id: "afuera", publicadoEn: "2020-01-01T00:00:00Z" },
    { semana: "2026-09-28", id: "../../afuera", publicadoEn: "2020-01-01T00:00:00Z" },
    { semana: "2026-09-28", id: "fantasma", publicadoEn: "2020-01-01T00:00:00Z" },
    { semana: "2026-09-28", id: "no-publicado", publicadoEn: "no-es-fecha" },
  ], ahora);
  assert.deepEqual(borradas, ["2026-09-28/viejo-pub"]);
  assert.ok(!existsSync(join(r2, "2026-09-28", "viejo-pub")));
  assert.ok(existsSync(join(r2, "2026-10-05", "reciente-pub")));
  assert.ok(existsSync(join(r2, "2026-09-28", "no-publicado")));
  assert.ok(existsSync(join(r2, "2026-09-28", "otro-viejo")));
  assert.ok(existsSync(join(base, "afuera", "x.jpg")));
});

await checkAsync("limpiarMedios: no sigue symlinks que salen del root", async () => {
  const r3 = join(base, "root3");
  mkdirSync(join(r3, "2026-09-28"), { recursive: true });
  symlinkSync(join(base, "afuera"), join(r3, "2026-09-28", "ln-externo"));
  const borradas = await limpiarMedios(r3, [{ semana: "2026-09-28", id: "ln-externo", publicadoEn: "2020-01-01T00:00:00Z" }], new Date());
  assert.deepEqual(borradas, []);
  assert.ok(existsSync(join(base, "afuera", "x.jpg")));
});
