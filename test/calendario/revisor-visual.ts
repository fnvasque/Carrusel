import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync, check } from "../_check.ts";
import { PREGUNTAS_REVISOR, PRECIOS_USD_POR_MTOK, costoUsd, revisarFondos, type LlamarModelo } from "../../src/calendario/revisor-visual.ts";

const dir = mkdtempSync(join(tmpdir(), "revisor-"));
const imgs = [1, 2].map((n) => {
  const ruta = join(dir, `${n}.jpg`);
  writeFileSync(ruta, Buffer.from([0xff, 0xd8, 0xff, n]));
  return { n, ruta, que: `slide ${n}` };
});
const ctx = { id: "lun-x", formato: "carrusel", textos: ["Título único ZZ", "Texto visible QQ"] };
const usage = { prompt_tokens: 1000, completion_tokens: 200 };
const ahora = () => new Date("2026-10-23T10:00:00Z");

check("revisor: costoUsd usa la tabla y el más caro para modelos desconocidos", () => {
  assert.equal(costoUsd("gpt-4o", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }), 12.5);
  const max = Math.max(...Object.values(PRECIOS_USD_POR_MTOK).map((p) => 1 * p.entrada + 1 * p.salida));
  assert.equal(costoUsd("modelo-raro", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }), max);
});

await checkAsync("revisor: JSON correcto da revisado con veredictos y usd medido", async () => {
  const llamar: LlamarModelo = async () => ({
    contenido: JSON.stringify({ imagenes: [
      { n: 1, compite: false, ajeno: false, frase: "ok" },
      { n: 2, compite: true, ajeno: false, frase: "x".repeat(300) },
    ] }),
    usage,
  });
  const r = await revisarFondos(imgs, ctx, { llamar, ahora });
  assert.equal(r.estado, "revisado");
  assert.equal(r.en, "2026-10-23T10:00:00.000Z");
  assert.equal(r.modelo, "gpt-4o");
  assert.equal(r.imagenes.length, 2);
  assert.equal(r.imagenes[1]!.compite, true);
  assert.equal(r.imagenes[1]!.que, "slide 2");
  assert.ok(r.imagenes[1]!.frase.length <= 200);
  assert.equal(r.usd, costoUsd("gpt-4o", usage));
});

await checkAsync("revisor: falta una imagen o JSON inválido da sin revisar con usd", async () => {
  for (const contenido of [
    JSON.stringify({ imagenes: [{ n: 1, compite: false, ajeno: false, frase: "ok" }] }),
    JSON.stringify({ imagenes: [{ n: 1, compite: false, ajeno: false, frase: "ok" }, { n: 3, compite: false, ajeno: false, frase: "ok" }] }),
    JSON.stringify({ imagenes: [{ n: 1, compite: "no", ajeno: false, frase: "ok" }, { n: 2, compite: false, ajeno: false, frase: "ok" }] }),
    "no es json",
  ]) {
    const r = await revisarFondos(imgs, ctx, { llamar: async () => ({ contenido, usage }), ahora });
    assert.equal(r.estado, "sin revisar");
    assert.ok(r.motivo && r.motivo.length > 0);
    assert.ok(r.usd > 0);
  }
});

await checkAsync("revisor: si llamar lanza, sin revisar con usd 0", async () => {
  const r = await revisarFondos(imgs, ctx, { llamar: async () => { throw new Error("boom"); }, ahora });
  assert.equal(r.estado, "sin revisar");
  assert.equal(r.usd, 0);
  assert.match(r.motivo ?? "", /boom/);
});

await checkAsync("revisor: el mensaje lleva las dos preguntas, una image_url por imagen y los textos", async () => {
  let enviado: { modelo: string; mensajes: unknown[] } | undefined;
  const llamar: LlamarModelo = async (a) => { enviado = a; return { contenido: "{}", usage }; };
  await revisarFondos(imgs, ctx, { llamar, modelo: "gpt-4o-mini", ahora });
  const s = JSON.stringify(enviado!.mensajes);
  assert.equal(enviado!.modelo, "gpt-4o-mini");
  for (const p of PREGUNTAS_REVISOR) assert.ok(s.includes(JSON.stringify(p).slice(1, -1)));
  assert.equal((s.match(/"type":"image_url"/g) ?? []).length, 2);
  assert.ok(s.includes("data:image/jpeg;base64,"));
  assert.ok(s.includes('"detail":"high"'));
  assert.ok(s.includes("Título único ZZ") && s.includes("Texto visible QQ"));
});

await checkAsync("revisor: imagen ilegible da sin revisar sin llamar", async () => {
  let llamado = false;
  const r = await revisarFondos([{ n: 1, ruta: join(dir, "no-existe.jpg"), que: "a" }], ctx, { llamar: async () => { llamado = true; return { contenido: "{}", usage }; }, ahora });
  assert.equal(r.estado, "sin revisar");
  assert.equal(llamado, false);
  assert.equal(r.usd, 0);
});

rmSync(dir, { recursive: true, force: true });
