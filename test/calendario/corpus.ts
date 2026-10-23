import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, checkAsync } from "../_check.ts";
import { resumirCorpus, type ResultadoCorpus } from "../../src/calendario/corpus-visual.ts";
import { ErrorSinCacheIa, generateBackground } from "../../src/ai/openaiImage.ts";
import { resolveBackground } from "../../src/render/background.ts";

check("corpus: resumirCorpus cuenta solo las visuales y lista las otras con su motivo", () => {
  const r: ResultadoCorpus[] = [
    { semana: "2026-10-05", id: "a", estado: "limpia", motivos: [] },
    { semana: "2026-10-05", id: "b", estado: "visual", motivos: ["texto cortado"] },
    { semana: "2026-10-12", id: "c", estado: "otro", motivos: ["clip faltante: x.mp4"] },
  ];
  const { texto, violaciones } = resumirCorpus(r);
  assert.equal(violaciones, 1);
  assert.match(texto, /2026-10-05\/b: texto cortado/);
  assert.match(texto, /OTRO 2026-10-12\/c: clip faltante: x\.mp4/);
  assert.doesNotMatch(texto, /OTRO .*\/b/);
  assert.equal(resumirCorpus([]).violaciones, 0);
});

await checkAsync("corpus: solo-caché sin caché lanza ErrorSinCacheIa sin pedir OPENAI_API_KEY; el fondo cae al por defecto", async () => {
  const prev = { ...process.env };
  process.env.CARRUSEL_AI_SOLO_CACHE = "1";
  process.env.CARRUSEL_AI_CACHE_DIR = mkdtempSync(join(tmpdir(), "cache-ia-"));
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(generateBackground("prompt que no está en caché"), (e) => e instanceof ErrorSinCacheIa);
    assert.equal(await resolveBackground({ ai: "otro prompt" }), undefined);
  } finally {
    for (const k of ["CARRUSEL_AI_SOLO_CACHE", "CARRUSEL_AI_CACHE_DIR", "OPENAI_API_KEY"]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});
