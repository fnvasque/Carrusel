import { relative } from "node:path";
import { ask } from "./ask.ts";
import { reindex } from "./indexer.ts";
import { addPost } from "./pipeline.ts";
import { findInstagramUrl, shortcodeFromUrl } from "./shortcode.ts";
import { findFichaById, findLastSave, removeOrphanGalleries, revertSave } from "./store.ts";
import { STAGE_LABEL, type AddInput } from "./types.ts";

/**
 * CLI de la base de conocimiento:
 *   npm run kb:add "<url-instagram>" -- --user=cuenta [--nota="por qué me interesa"] [--image=captura.png ...]
 *   npm run kb:add -- --image=captura1.png --image=captura2.png   (solo capturas)
 *   npm run kb:ask "¿qué herramientas guardé para editar video?"
 *   npm run kb:undo                    (deshace el último guardado)
 *   npm run kb:undo "<url o shortcode>" (deshace el último guardado de ese post)
 *   npm run kb:reindex [-- --full]     (reconstruye el índice desde el Markdown)
 */

// Carga .env si existe (Node ≥ 21.7). Sin .env se usan las variables del entorno.
try {
  process.loadEnvFile?.();
} catch {
  // sin .env: ok.
}

function parseArgs(argv: string[]): AddInput {
  const input: AddInput = { images: [] };
  for (const arg of argv) {
    if (arg.startsWith("--nota=")) input.note = arg.slice("--nota=".length);
    else if (arg.startsWith("--image=")) input.images!.push(arg.slice("--image=".length));
    else if (arg.startsWith("--caption=")) input.caption = arg.slice("--caption=".length);
    else if (arg.startsWith("--user=")) input.user = arg.slice("--user=".length).replace(/^@/, "").trim() || undefined;
    else if (arg === "--no-commit") input.commit = false;
    else if (!arg.startsWith("--") && !input.url) input.url = findInstagramUrl(arg) ?? arg;
  }
  return input;
}


async function cmdAdd(argv: string[]): Promise<void> {
  const input = parseArgs(argv);
  if (!input.url && !input.images?.length && !input.caption) {
    console.error('Uso: npm run kb:add "<url-instagram>" -- --user=cuenta [--nota="..."] [--image=captura.png] [--no-commit]');
    console.error("     (--user: cuenta dueña del post, Business/Creator; no hace falta si el link la trae)");
    console.error("     npm run kb:add -- --image=captura.png [--caption=\"...\"]   (solo capturas)");
    process.exit(1);
  }
  input.onProgress = (stage, detail) => console.log(`${STAGE_LABEL[stage]}${detail ? `: ${detail}` : ""}`);

  const r = await addPost(input);
  const e = r.ficha.extraction;
  console.log(`\n✅ ${r.created ? "Guardado" : "Actualizado"}: ${e.title}`);
  console.log(
    `   Tema: ${r.topicsUpdated[0]}${r.newTopic ? " (nuevo)" : ""}` +
      (r.topicMergedFrom ? ` (el modelo propuso "${r.topicMergedFrom}", se unió al existente)` : ""),
  );
  console.log(`   ${e.summary}`);
  if (e.tools.length) console.log(`   Herramientas: ${e.tools.map((t) => t.name).join(" · ")}`);
  if (r.ficha.partial) console.log("   ⚠️  Contenido parcial: complementa con capturas (--image=).");
  console.log(`   Archivo: ${relative(process.cwd(), r.path)}${r.commit ? ` · commit ${r.commit}` : ""}`);
}

async function cmdAsk(argv: string[]): Promise<void> {
  const question = argv.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!question) {
    console.error('Uso: npm run kb:ask "<pregunta>"');
    process.exit(1);
  }
  const r = await ask(question);
  console.log(`\n${r.answer}`);
  if (r.sources.length) {
    console.log("\nFuentes:");
    for (const s of r.sources) {
      const meta = [s.author, s.savedAt ? `guardado ${s.savedAt}` : undefined].filter(Boolean).join(" · ");
      console.log(`  [${s.n}] ${s.title}${meta ? ` — ${meta}` : ""}`);
      console.log(`      Obsidian: [[${s.baseName}]]${s.url ? ` · ${s.url}` : ""}`);
    }
  }
}

async function cmdReindex(argv: string[]): Promise<void> {
  const r = await reindex(argv.includes("--full"));
  console.log(`🔎 Índice al día: ${r.total} fichas · ${r.indexed} (re)indexadas · ${r.removed} quitadas.`);
}

async function cmdUndo(argv: string[]): Promise<void> {
  const target = argv.find((a) => !a.startsWith("--"));
  let path: string | undefined;
  if (target) {
    const id = shortcodeFromUrl(findInstagramUrl(target) ?? target) ?? target.trim();
    const ficha = await findFichaById(id);
    if (!ficha) throw new Error(`No encontré una ficha con id "${id}".`);
    path = ficha.path;
  }
  const save = await findLastSave(path);
  if (!save) throw new Error("No encontré guardados para deshacer (¿la base está en un repo git con commits kb:?).");
  const sha = await revertSave(save);
  const orphans = await removeOrphanGalleries();
  const r = await reindex();
  console.log(`↩️  Deshecho: ${save.subject.replace(/^kb: /, "")}`);
  console.log(`   commit ${sha}${orphans ? ` · ${orphans} galería(s) borrada(s)` : ""} · índice: ${r.total} fichas`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "ask") return cmdAsk(rest);
  if (cmd === "reindex") return cmdReindex(rest);
  if (cmd === "undo") return cmdUndo(rest);
  return cmdAdd(cmd === "add" ? rest : process.argv.slice(2));
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
