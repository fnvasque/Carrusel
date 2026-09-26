import { relative } from "node:path";
import { addPost } from "./pipeline.ts";
import { findInstagramUrl } from "./shortcode.ts";
import type { AddInput, Stage } from "./types.ts";

/**
 * CLI de la base de conocimiento:
 *   npm run kb:add "<url-instagram>" -- --nota="por qué me interesa" [--image=captura.png ...]
 *   npm run kb:add -- --image=captura1.png --image=captura2.png   (solo capturas)
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
    else if (arg.startsWith("--cookies=")) input.cookies = arg.slice("--cookies=".length);
    else if (arg.startsWith("--cookies-from-browser=")) input.cookiesFromBrowser = arg.slice("--cookies-from-browser=".length);
    else if (arg === "--no-commit") input.commit = false;
    else if (!arg.startsWith("--") && !input.url) input.url = findInstagramUrl(arg) ?? arg;
  }
  return input;
}

const STAGE_LABEL: Record<Stage, string> = {
  descargando: "📥 Descargando el post…",
  comentarios: "💬 Comentarios",
  transcribiendo: "🎙  Transcribiendo el audio…",
  analizando: "🧠 Analizando…",
  guardando: "💾 Guardando la ficha…",
  temas: "🗂  Actualizando temas…",
  commit: "📌 Commit…",
};

async function main(): Promise<void> {
  const input = parseArgs(process.argv.slice(2));
  if (!input.url && !input.images?.length && !input.caption) {
    console.error('Uso: npm run kb:add "<url-instagram>" -- [--nota="..."] [--image=captura.png] [--no-commit]');
    console.error("     npm run kb:add -- --image=captura.png [--caption=\"...\"]   (solo capturas)");
    process.exit(1);
  }
  input.onProgress = (stage, detail) => console.log(`${STAGE_LABEL[stage]}${detail ? `: ${detail}` : ""}`);

  const r = await addPost(input);
  const e = r.ficha.extraction;
  console.log(`\n✅ ${r.created ? "Guardado" : "Actualizado"}: ${e.title}`);
  console.log(`   Tema: ${r.topicsUpdated[0]}${r.newTopic ? " (nuevo)" : ""}`);
  console.log(`   ${e.summary}`);
  if (e.tools.length) console.log(`   Herramientas: ${e.tools.map((t) => t.name).join(" · ")}`);
  if (r.ficha.partial) console.log("   ⚠️  Contenido parcial: complementa con capturas (--image=).");
  console.log(`   Archivo: ${relative(process.cwd(), r.path)}${r.commit ? ` · commit ${r.commit}` : ""}`);
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
