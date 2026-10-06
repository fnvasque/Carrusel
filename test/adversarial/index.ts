/** Runner de los tests adversariales: importa todo test/adversarial/*.ts salvo este y cierra. */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { done } from "../_check.ts";

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).sort()) {
  if (!f.endsWith(".ts") || f === "index.ts" || f.startsWith("_")) continue;
  await import(pathToFileURL(join(dir, f)).href);
}
await done();
