import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync } from "../_check.ts";
import { leerRegistroPublicados, resolverPost } from "../../src/insights/lectura.ts";
import { parsearReferencia } from "../../src/insights/summary.ts";

/**
 * `lectura.ts`: registro.jsonl → líneas `publicado` con su permalink (que el scheduler
 * anota en una línea `tipo: "permalink"` al día siguiente) y `/metricas <link>` fuera
 * del listado de 35 días de Meta (adversario final 3).
 */

await checkAsync("leerRegistroPublicados: une la línea `permalink` a su `publicado` por mediaId; /metricas <link> a 37 días la encuentra", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lectura-"));
  const prev = process.env.KB_DIR;
  process.env.KB_DIR = dir;
  try {
    mkdirSync(join(dir, "_calendario"), { recursive: true });
    const link = "https://www.instagram.com/reel/DQxm9/";
    writeFileSync(join(dir, "_calendario", "registro.jsonl"), [
      { tipo: "publicado", piezaId: "mie-reel", mediaId: "m9", semana: "2026-10-12", publicadoEn: "2026-10-14T17:00:00.000Z" },
      { tipo: "story", piezaId: "mie-reel", mediaId: "s9" },
      { tipo: "permalink", piezaId: "mie-reel", semana: "2026-10-12", mediaId: "m9", permalink: link },
      { tipo: "permalink", piezaId: "huerfano", mediaId: "m404", permalink: "https://www.instagram.com/p/X/" },
    ].map((l) => JSON.stringify(l)).join("\n") + "\n{rota\n");
    const reg = leerRegistroPublicados();
    assert.equal(reg.length, 1, "solo las líneas publicado");
    assert.equal(reg[0]!.permalink, link);
    let listado = 0;
    const listar = async () => {
      listado++;
      return [];
    };
    const r = await resolverPost(parsearReferencia(link)!, reg, new Date("2026-11-20T15:00:00Z"), listar as never);
    assert.deepEqual(r, { mediaId: "m9", publicadoEn: "2026-10-14T17:00:00.000Z" });
    assert.equal(listado, 0, "no hace falta el listado de Meta");
  } finally {
    if (prev === undefined) delete process.env.KB_DIR;
    else process.env.KB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
