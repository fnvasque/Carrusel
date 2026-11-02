/**
 * Encuentra y resume las sesiones de Claude Code de un proyecto
 * (`~/.claude/projects/<ruta codificada>/*.jsonl`), incluidas las de sus worktrees.
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { createInterface } from "node:readline";
import { taparSensible } from "./filtro.ts";

export interface SesionResumen {
  id: string;
  archivo: string;
  bytes: number;
  inicio: string;
  fin: string;
  mensajesUsuario: string[];
  archivosTocados: string[];
  herramientas: Record<string, number>;
  subagentes: number;
  tokens: { salida: number; entrada: number; cacheLeida: number; cacheCreada: number };
  modelos: string[];
}

/** Claude Code nombra la carpeta de un proyecto reemplazando todo lo no alfanumérico por `-`. */
export function codificarRuta(abs: string): string {
  return abs.replace(/[^A-Za-z0-9]/g, "-");
}

function dirProyectos(): string {
  return process.env.CASO_PROJECTS_DIR ?? join(homedir(), ".claude/projects");
}

/** Carpeta exacta del proyecto más las de sus worktrees de Claude. Lanza si no hay ninguna. */
export function carpetasDeSesiones(proyecto: string, projectsDir: string = dirProyectos()): string[] {
  const base = codificarRuta(proyecto);
  const prefijoWorktree = `${base}--claude-worktrees-`;
  let nombres: string[] = [];
  if (existsSync(projectsDir)) {
    nombres = readdirSync(projectsDir).filter((n) => {
      if (n !== base && !n.startsWith(prefijoWorktree)) return false;
      return statSync(join(projectsDir, n)).isDirectory();
    });
  }
  if (nombres.length === 0) {
    throw new Error(`No encontré conversaciones de Claude para ${proyecto} (busqué ${projectsDir})`);
  }
  return nombres.sort().map((n) => join(projectsDir, n));
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Texto de un mensaje de usuario, o "" si no es un mensaje escrito por la persona.
 * - string: tal cual, salvo que empiece con `<` (comandos, recordatorios).
 * - arreglo de bloques (prompts con capturas): si trae algún `tool_result` es salida de
 *   herramienta y no cuenta; si no, se unen los bloques de texto (los que empiezan con `<`
 *   se saltan) y cada imagen queda como «[imagen adjunta]». Nunca se copia la imagen.
 */
export function textoUsuario(content: unknown): string {
  if (typeof content === "string") return content.startsWith("<") ? "" : content;
  if (!Array.isArray(content)) return "";
  if (content.some((b) => esObj(b) && b.type === "tool_result")) return "";
  const partes: string[] = [];
  for (const b of content) {
    if (!esObj(b)) continue;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim() && !b.text.startsWith("<")) partes.push(b.text);
    else if (b.type === "image") partes.push("[imagen adjunta]");
  }
  return partes.join("\n");
}

export async function resumirSesion(archivo: string): Promise<SesionResumen> {
  const r: SesionResumen = {
    id: basename(archivo, ".jsonl"),
    archivo,
    bytes: statSync(archivo).size,
    inicio: "",
    fin: "",
    mensajesUsuario: [],
    archivosTocados: [],
    herramientas: {},
    subagentes: 0,
    tokens: { salida: 0, entrada: 0, cacheLeida: 0, cacheCreada: 0 },
    modelos: [],
  };
  const tocados = new Set<string>();
  const modelos = new Set<string>();
  const rl = createInterface({ input: createReadStream(archivo, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const linea of rl) {
    let o: unknown;
    try {
      o = JSON.parse(linea);
    } catch {
      continue; // línea vacía o truncada
    }
    if (!esObj(o)) continue;
    const ts = typeof o.timestamp === "string" ? o.timestamp : "";
    if (ts) {
      if (!r.inicio || ts < r.inicio) r.inicio = ts;
      if (!r.fin || ts > r.fin) r.fin = ts;
    }
    const msg = esObj(o.message) ? o.message : undefined;
    if (!msg) continue;
    if (o.type === "user") {
      const t = textoUsuario(msg.content);
      if (t) r.mensajesUsuario.push(t);
    } else if (o.type === "assistant") {
      if (typeof msg.model === "string") modelos.add(msg.model);
      if (esObj(msg.usage)) {
        r.tokens.entrada += num(msg.usage.input_tokens);
        r.tokens.salida += num(msg.usage.output_tokens);
        r.tokens.cacheLeida += num(msg.usage.cache_read_input_tokens);
        r.tokens.cacheCreada += num(msg.usage.cache_creation_input_tokens);
      }
      if (!Array.isArray(msg.content)) continue;
      for (const b of msg.content) {
        if (!esObj(b) || b.type !== "tool_use" || typeof b.name !== "string") continue;
        r.herramientas[b.name] = (r.herramientas[b.name] ?? 0) + 1;
        if (b.name === "Agent" || b.name === "Task") r.subagentes++;
        if (esObj(b.input)) {
          for (const k of ["file_path", "path"]) {
            const v = b.input[k];
            if (typeof v === "string" && v) tocados.add(v);
          }
        }
      }
    }
  }
  r.archivosTocados = [...tocados];
  r.modelos = [...modelos];
  return r;
}

/** Todas las sesiones del proyecto (y sus worktrees), ordenadas por inicio. */
export async function listarSesiones(
  proyecto: string,
  opts: { projectsDir?: string } = {},
): Promise<SesionResumen[]> {
  const archivos = carpetasDeSesiones(proyecto, opts.projectsDir).flatMap((d) =>
    readdirSync(d)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => join(d, n)),
  );
  const sesiones = await Promise.all(archivos.map(resumirSesion));
  return sesiones.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Primeras carpetas (relativas a `base`) de los archivos que tocó la sesión: ayuda a ver de qué proyecto es. */
function carpetasTocadas(s: Pick<SesionResumen, "archivosTocados">, base: string): string[] {
  const c = new Map<string, number>();
  for (const f of s.archivosTocados) {
    const rel = relative(base, f);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    const primera = rel.includes(sep) ? rel.split(sep)[0]! : "(raíz)";
    c.set(primera, (c.get(primera) ?? 0) + 1);
  }
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`);
}

/** Línea `carpetas: …` que muestra `sesiones` (null si la sesión no tocó carpetas del proyecto). */
export function lineaCarpetas(s: Pick<SesionResumen, "archivosTocados">, base: string): string | null {
  const carpetas = carpetasTocadas(s, base);
  // Los nombres de carpeta pueden ser de clientes o traer correos: se tapan como el resto.
  return carpetas.length ? taparSensible(`carpetas: ${carpetas.join(", ")}`).texto : null;
}
