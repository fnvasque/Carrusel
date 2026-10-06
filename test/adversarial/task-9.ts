/**
 * Adversario T9 (servidor de medios + limpieza a los 7 días). Solo los ataques que el código NO resiste.
 * Respaldo: brief T9, Step 1 — "`limpiarMedios` borra solo carpetas con `publicadoEn` hace > 7 d; …
 * no borra piezas no publicadas".
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAsync } from "../_check.ts";
import { limpiarMedios } from "../../src/calendario/media-server.ts";

const base = mkdtempSync(join(tmpdir(), "adv-t9-"));

function sembrar(nombre: string): string {
  const root = join(base, nombre);
  mkdirSync(join(root, "2026-10-05", "lun-reel-x"), { recursive: true });
  writeFileSync(join(root, "2026-10-05", "lun-reel-x", "reel.mp4"), "x");
  return root;
}

await checkAsync("adversario T9: limpiarMedios con `ahora` inválido borra una pieza publicada ayer", async () => {
  // Publicada hace 1 día respecto de hoy: con un reloj ilegible no hay forma de saber que pasaron > 7 d.
  const root = sembrar("ahora-invalido");
  const ayer = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const borradas = await limpiarMedios(root, [{ semana: "2026-10-05", id: "lun-reel-x", publicadoEn: ayer }], new Date("no-es-fecha"));
  assert.deepEqual(borradas, [], "con Invalid Date `limite` es NaN y `t >= NaN` es false: borra todo lo publicado");
  assert.ok(existsSync(join(root, "2026-10-05", "lun-reel-x", "reel.mp4")));
});

await checkAsync("adversario T9: limpiarMedios trata `publicadoEn` basura (\"1\", \"2026\") como fecha de publicación y borra", async () => {
  // Date.parse es permisivo: "1" → 2001-01-01, "2026" → 2026-01-01. Ninguno es un instante de publish
  // (el docstring promete ignorar "las piezas sin publicadoEn válido (no publicadas)").
  const root = sembrar("publicado-basura");
  mkdirSync(join(root, "2026-10-05", "mar-carrusel-y"), { recursive: true });
  writeFileSync(join(root, "2026-10-05", "mar-carrusel-y", "slide-1.jpg"), "x");
  const borradas = await limpiarMedios(
    root,
    [
      { semana: "2026-10-05", id: "lun-reel-x", publicadoEn: "1" },
      { semana: "2026-10-05", id: "mar-carrusel-y", publicadoEn: "2026" },
    ],
    new Date("2026-10-06T12:00:00Z"),
  );
  assert.deepEqual(borradas, []);
});
