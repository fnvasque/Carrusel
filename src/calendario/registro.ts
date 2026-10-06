import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { calendarioDir, semanaDir, type EstadoEntry } from "./plan.ts";

/**
 * Escrituras del bot en `_calendario/` (zona de escritura del bot, desviación 1):
 * `registro.jsonl` (solo agrega líneas) y `<semana>/estado.json` (fusiona por id).
 * Nadie más escribe estos archivos, así que un `git pull` no puede chocar con ellos.
 */

export const registroPath = (): string => join(calendarioDir(), "registro.jsonl");
export const estadoPath = (semana: string): string => join(semanaDir(semana), "estado.json");

const ID_RE = /^[a-z0-9-]{3,80}$/;

/** Agrega una línea JSON a `_calendario/registro.jsonl`. */
export async function anotarRegistro(linea: Record<string, unknown>): Promise<void> {
  await mkdir(calendarioDir(), { recursive: true });
  await appendFile(registroPath(), `${JSON.stringify(linea)}\n`, "utf8");
}

// Serializa las escrituras de estado.json (el tick y los comandos de Telegram
// pueden escribir a la vez): leer-fusionar-escribir nunca se intercala.
let cola: Promise<unknown> = Promise.resolve();

/**
 * Fusiona `e` en la entrada `id` de `<semana>/estado.json` (las demás piezas no se
 * tocan; `story` se fusiona campo a campo). `publicado` es final: un estado
 * posterior distinto no lo pisa (los demás campos, p. ej. `permalink`, sí se
 * guardan). Escritura atómica (temporal + rename).
 */
export async function escribirEstado(semana: string, id: string, e: Partial<EstadoEntry>): Promise<void> {
  if (!ID_RE.test(id)) throw new Error(`Id de pieza inválido: ${id}`);
  const archivo = estadoPath(semana); // lanza si la semana no es AAAA-MM-DD
  const tarea = cola.then(async () => {
    let actual: Record<string, EstadoEntry> = {};
    try {
      const raw: unknown = JSON.parse(await readFile(archivo, "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) actual = raw as Record<string, EstadoEntry>;
    } catch {
      // falta o corrupto: se parte de cero (leerSemana ya lo ignoraba).
    }
    const prev: Partial<EstadoEntry> = Object.prototype.hasOwnProperty.call(actual, id) ? actual[id] : {};
    const nuevo: Partial<EstadoEntry> = { ...prev, ...e };
    if (e.story) nuevo.story = { ...prev.story, ...e.story };
    if (prev.estado === "publicado" && e.estado && e.estado !== "publicado") nuevo.estado = "publicado";
    if (!nuevo.estado) throw new Error(`estado.json: la pieza ${id} no tiene estado`);
    actual[id] = nuevo as EstadoEntry;
    await mkdir(semanaDir(semana), { recursive: true });
    const tmp = `${archivo}.tmp-${process.pid}`;
    await writeFile(tmp, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
    await rename(tmp, archivo);
  });
  cola = tarea.catch(() => undefined);
  return tarea;
}
