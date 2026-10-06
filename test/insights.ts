import "./insights/client.ts";
import "./insights/derive.ts";
import "./insights/snapshots.ts";
import "./insights/summary.ts";
import { done } from "./_check.ts";

// Cada archivo de test/insights/*.ts se importa aquí y registra sus `check`.

await done();
