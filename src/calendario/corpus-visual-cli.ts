import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ErrorVisual } from "../render/revision.ts";
import { resumirCorpus, type ResultadoCorpus } from "./corpus-visual.ts";

/**
 * `npm run calendario:corpus-visual -- --kb <dir> [--semanas a,b,c] [--solo <id>] [--conservar <dir>]`
 * Re-renderiza cada pieza del plan de 3 semanas (sin importar hora ni estado) en una carpeta
 * temporal con la revisión visual en modo bloquear. Solo lectura sobre la base: no sube nada,
 * no escribe render.json, no avisa por Telegram, no llama a APIs de pago (fondos ai solo de caché).
 * Sale con código 1 si hay al menos una violación visual, y con 2 si `--semanas`/`--solo` no
 * coinciden con ninguna pieza. `--conservar <dir>` copia los archivos de cada pieza (también los
 * intermedios de `.trabajo/` cuando la revisión la bloquea) a `<dir>/<semana>/<id>/` para sacar cuadros.
 */

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const kb = resolve(arg("kb") ?? join(process.cwd(), "knowledge"));
const semanasPedidas = (arg("semanas") ?? "2026-10-05,2026-10-12,2026-10-19").split(",").map((s) => s.trim()).filter(Boolean);
const solo = arg("solo");
const conservar = arg("conservar") ? resolve(arg("conservar")!) : undefined;

// Antes de importar nada que lea la base o la caché de fondos.
process.env.KB_DIR = kb;
process.env.CARRUSEL_AI_SOLO_CACHE = "1";
process.env.CARRUSEL_AI_CACHE_DIR ??= join(homedir(), "Documents", "Claude", "Carrusel-render", ".cache", "ai");

const { leerSemana, semanaDir } = await import("./plan.ts");
const { ErrorClipFaltante, ErrorContenido, leerPuerta, leerSubtitulos, leerVoz, renderPieza } = await import("./render.ts");

// Las pistas (promo/audio) no se versionan: viven en el clon del render del Mac, de solo lectura.
const audioLocal = join(process.cwd(), "promo", "audio");
const audioDir =
  process.env.CALENDARIO_AUDIO_DIR?.trim() ||
  (existsSync(audioLocal) ? audioLocal : join(homedir(), "Documents", "Claude", "Carrusel-render", "promo", "audio"));
const clipsDir = process.env.CLIPS_DIR?.trim() || undefined;
const raiz = join(tmpdir(), `corpus-visual-${process.pid}`);
const avisar = async (t: string): Promise<void> => void console.warn(`⚠️  ${t}`);

const puerta = await leerPuerta();
const voz = await leerVoz(avisar);
const subtitulos = await leerSubtitulos();
const resultados: ResultadoCorpus[] = [];

for (const semana of semanasPedidas) {
  const leida = await leerSemana(semana);
  if (!leida) {
    console.warn(`⚠️  Semana ${semana} sin plan.json en ${kb}.`);
    continue;
  }
  for (const pieza of leida.plan.piezas) {
    if (solo && pieza.id !== solo) continue;
    const tmp = join(raiz, semana, pieza.id);
    await mkdir(tmp, { recursive: true });
    const t0 = Date.now();
    let r: ResultadoCorpus;
    try {
      await renderPieza({ semana, pieza, borradorPath: join(semanaDir(semana), pieza.borrador) }, tmp, {
        audioDir, puerta, voz, subtitulos, avisar, clipsDir, omitirScore: true,
      });
      r = { semana, id: pieza.id, estado: "limpia", motivos: [] };
    } catch (e) {
      if (e instanceof ErrorVisual) r = { semana, id: pieza.id, estado: "visual", motivos: e.hallazgos.map((h) => h.motivo) };
      else if (e instanceof ErrorContenido) r = { semana, id: pieza.id, estado: "otro", motivos: [`contenido: ${e.motivos.join(" ")}`] };
      else if (e instanceof ErrorClipFaltante) r = { semana, id: pieza.id, estado: "otro", motivos: [`clip faltante: ${e.message}`] };
      else r = { semana, id: pieza.id, estado: "otro", motivos: [`entorno: ${e instanceof Error ? e.message : String(e)}`] };
    }
    resultados.push(r);
    if (conservar) await cp(tmp, join(conservar, semana, pieza.id), { recursive: true });
    console.log(`${r.estado.padEnd(7)} ${semana}/${pieza.id} (${pieza.formato}) ${((Date.now() - t0) / 1000).toFixed(1)} s${r.motivos.length ? ` — ${r.motivos.join(" | ")}` : ""}`);
    await rm(tmp, { recursive: true, force: true });
  }
}
await rm(raiz, { recursive: true, force: true });

if (resultados.length === 0) {
  console.error(`❌ Ninguna pieza coincide con --semanas ${semanasPedidas.join(",")}${solo ? ` --solo ${solo}` : ""} en ${kb}.`);
  process.exit(2);
}

const { texto, violaciones } = resumirCorpus(resultados);
console.log(texto);
process.exit(violaciones > 0 ? 1 : 0);
