/**
 * One-off: encuentra notas de la base con tildes perdidas (gpt-4o emitía "\u0003" en vez
 * de "ó" y la versión anterior de cleanCall borraba el carácter: "Automatizacin").
 *
 * Detector: junta todas las palabras con tilde/ñ que aparecen en la base, les quita la
 * letra acentuada ("automatización" → "automatizacin") y marca las notas donde aparece
 * esa forma rota. También marca caracteres de control que hayan quedado.
 *
 *   KB_DIR=../knowledge npx tsx --env-file=.env scripts/kb-fix-accents.ts          (solo reporte)
 *   KB_DIR=../knowledge npx tsx --env-file=.env scripts/kb-fix-accents.ts --fix    (regenera temas)
 *
 * --fix regenera las páginas de tema afectadas con la síntesis normal (refreshTopics).
 * No commitea ni pushea: revisa el diff en la base y commitea a mano.
 * Las fichas (fuentes/) solo se reportan: regenerarlas exigiría volver a bajar el post.
 */
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { refreshTopics } from "../src/kb/pipeline.ts";
import { fuentesDir, kbDir, temasDir } from "../src/kb/store.ts";

const ACCENTED = /[áéíóúüñÁÉÍÓÚÜÑ]/g;
const WORD = /[\p{L}\d]+/gu;
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;

async function listMd(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".md")).map((f) => join(dir, f));
}

/** Formas rotas → palabra correcta, a partir de las palabras con tilde de la base. */
function brokenForms(texts: string[]): Map<string, string> {
  const words = new Set(texts.flatMap((t) => t.normalize("NFC").match(WORD) ?? []));
  const broken = new Map<string, string>();
  for (const w of words) {
    if (!w.match(ACCENTED)) continue;
    const b = w.replace(ACCENTED, "");
    // Formas muy cortas ("sí"→"s", "más"→"ms") dan falsos positivos.
    if (b.length >= 4) broken.set(b, w);
  }
  return broken;
}

async function scan(files: string[], broken: Map<string, string>) {
  const hits: { file: string; words: string[]; control: boolean }[] = [];
  for (const file of files) {
    const text = (await readFile(file, "utf8")).normalize("NFC");
    const found = [...new Set((text.match(WORD) ?? []).filter((w) => broken.has(w)))];
    const control = CONTROL.test(text);
    if (found.length || control) hits.push({ file, words: found, control });
  }
  return hits;
}

function report(title: string, hits: Awaited<ReturnType<typeof scan>>, broken: Map<string, string>) {
  console.log(`\n${title}: ${hits.length} nota(s)`);
  for (const h of hits) {
    const words = h.words.slice(0, 8).map((w) => `${w}→${broken.get(w)}`).join(", ");
    console.log(`  • ${relative(kbDir(), h.file)}${h.control ? " [caracteres de control]" : ""}${words ? `: ${words}` : ""}${h.words.length > 8 ? ` (+${h.words.length - 8})` : ""}`);
  }
}

const fix = process.argv.includes("--fix");
const fuentes = await listMd(fuentesDir());
const temas = await listMd(temasDir());
const broken = brokenForms(await Promise.all([...fuentes, ...temas].map((f) => readFile(f, "utf8"))));

const badFuentes = await scan(fuentes, broken);
const badTemas = await scan(temas, broken);
report("Fichas (fuentes/) con palabras sospechosas", badFuentes, broken);
report("Temas (temas/) con palabras sospechosas", badTemas, broken);

if (fix && badTemas.length) {
  const names = badTemas.map((h) => basename(h.file, ".md").normalize("NFC"));
  console.log(`\n→ Regenerando ${names.length} tema(s): ${names.join(", ")}`);
  await refreshTopics(names);
  report("Temas tras regenerar", await scan(temas, broken), broken);
  console.log("\nRevisa el diff en la base (git diff) y commitea a mano. Esto no pushea nada.");
} else if (badTemas.length) {
  console.log("\nCorre con --fix para regenerar esos temas.");
}
