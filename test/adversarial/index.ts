import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { done } from "../_check.ts";

// Importa todo test/adversarial/*.ts (menos este archivo); cada uno registra sus `check`.
const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && n !== "index.ts").sort()) {
  await import(pathToFileURL(join(dir, f)).href);
}

await done();
