import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hallazgosSensibles } from "./filtro.ts";

export type EstadoAprobacion = "sin-historia" | "sin-aprobar" | "editada" | "aprobada";

export function hashHistoria(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/** Aprueba la historia actual: guarda su hash. Rechaza si aún contiene datos sensibles. */
export function aprobar(dirCaso: string): { hash: string } {
  const archivo = join(dirCaso, "historia.md");
  if (!existsSync(archivo)) throw new Error(`No hay historia.md en ${dirCaso}`);
  const texto = readFileSync(archivo, "utf8");
  const hallazgos = hallazgosSensibles(texto);
  if (hallazgos.length) {
    // Sin valores completos: el mensaje termina en logs. Solo una pista enmascarada.
    const cuenta = new Map<string, number>();
    for (const h of hallazgos) cuenta.set(h.tipo, (cuenta.get(h.tipo) ?? 0) + 1);
    const resumen = [...cuenta].map(([t, n]) => `${t}: ${n}`).join(", ");
    const lista = hallazgos.map((h) => `- ${h.tipo}: ${h.original.slice(0, 3)}…`).join("\n");
    throw new Error(`La historia aún contiene datos sensibles (${resumen}); edítala y vuelve a aprobar:\n${lista}`);
  }
  const hash = hashHistoria(texto);
  writeFileSync(join(dirCaso, "aprobado.json"), JSON.stringify({ hash, fecha: new Date().toISOString() }, null, 2) + "\n");
  return { hash };
}

export function estadoAprobacion(dirCaso: string): EstadoAprobacion {
  const historia = join(dirCaso, "historia.md");
  if (!existsSync(historia)) return "sin-historia";
  let guardado: unknown;
  try {
    guardado = (JSON.parse(readFileSync(join(dirCaso, "aprobado.json"), "utf8")) as { hash?: unknown }).hash;
  } catch {
    return "sin-aprobar";
  }
  if (typeof guardado !== "string") return "sin-aprobar";
  return guardado === hashHistoria(readFileSync(historia, "utf8")) ? "aprobada" : "editada";
}
