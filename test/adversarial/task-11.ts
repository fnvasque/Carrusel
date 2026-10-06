import assert from "node:assert/strict";
import { check } from "../_check.ts";
import type { Pieza } from "../../src/calendario/plan.ts";
import { formatPreview } from "../../src/calendario/telegram.ts";

/**
 * Adversario T11 (calendario en el bot): funciones puras de telegram.ts. Sin red.
 * Solo quedan los ataques que fallan; los resistidos van en el reporte.
 */

const pz = (id: string, caption: string): Pieza => ({
  id, dia: "2026-10-12", hora: "10:00", formato: "reel", arquetipo: "tutorial", senal: "guardados", tema: "t", pilar: "p",
  hook: { categoria: "curiosidad", texto: "h", score: 80 }, emocion: "e", entregable: "e", fraseAmigo: "f",
  lectorFrio: { intentos: 1, resultado: "ok", notas: "" }, origen: { fichas: [], referencias: [] },
  derivadoDe: null, caption, borrador: `${id}.json`, estado: "planificado",
});

const SURROGATE_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

check("adversario T11: formatPreview corta un emoji por la mitad al truncar a 1024 (deja un surrogate suelto: texto UTF-8 inválido para Telegram)", () => {
  // Brief T11: `formatPreview` → "texto ≤ 1024 (límite de caption de Telegram)", "preview truncado con … a 1024";
  // mandato: con caption de 5 000 caracteres y emojis "el resultado debe ser ≤ 1024" y válido para Telegram.
  // `truncar` hace `s.slice(0, 1023)` en unidades UTF-16: si el corte cae entre las dos mitades de un emoji,
  // queda un surrogate alto suelto antes de "…". Telegram rechaza el texto (no es UTF-8 válido) y el preview
  // (sendPhoto y su respaldo sendMessage con el mismo caption) no llega.
  const malos: number[] = [];
  for (let off = 0; off < 11; off++) {
    const caption = "x".repeat(off) + "<b>&</b> 🚀".repeat(500);
    const r = formatPreview(pz("reel-x", caption), { urls: ["u"], cover: "c" });
    assert.ok(r.caption.length <= 1024);
    if (SURROGATE_SUELTO.test(r.caption)) malos.push(off);
  }
  assert.deepEqual(malos, [], `caption con surrogate suelto para desplazamientos ${malos.join(", ")}`);
});
