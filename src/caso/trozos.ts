/**
 * Parte una sesión de Claude Code en trozos de texto legible para resumirla con un modelo.
 * Solo conversación: mensajes del usuario, texto de Claude y una línea por herramienta usada.
 * No incluye salidas de herramientas ni imágenes (una imagen adjunta queda como «[imagen adjunta]»).
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { textoUsuario } from "./sesiones.ts";

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function corto(s: string, max = 120): string {
  const l = s.replace(/\s+/g, " ").trim();
  return l.length > max ? l.slice(0, max) + "…" : l;
}

/** Texto legible de un mensaje, o "" si no aporta (salida de herramienta, comando, etc.). */
function bloque(o: Obj, msg: Obj): string {
  if (o.type === "user") {
    const t = textoUsuario(msg.content);
    return t ? `## Usuario\n${t}\n` : "";
  }
  if (o.type !== "assistant" || !Array.isArray(msg.content)) return "";
  const partes: string[] = [];
  for (const b of msg.content) {
    if (!esObj(b)) continue;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) partes.push(b.text);
    else if (b.type === "tool_use" && typeof b.name === "string") {
      const inp = esObj(b.input) ? b.input : {};
      const que = [inp.file_path, inp.path, inp.description].find((v) => typeof v === "string" && v) as string | undefined;
      partes.push(`· herramienta: ${b.name}${que ? " " + corto(que) : ""}`);
    }
  }
  return partes.length ? `## Claude\n${partes.join("\n")}\n` : "";
}

export async function* trozarSesion(archivo: string, maxChars = 60_000): AsyncGenerator<string> {
  let actual = "";
  const rl = createInterface({ input: createReadStream(archivo, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const linea of rl) {
    let o: unknown;
    try {
      o = JSON.parse(linea);
    } catch {
      continue; // línea vacía o truncada
    }
    if (!esObj(o) || !esObj(o.message)) continue;
    const texto = bloque(o, o.message);
    if (!texto) continue;
    if (actual && actual.length + texto.length + 1 > maxChars) {
      yield actual;
      actual = "";
    }
    actual += (actual ? "\n" : "") + texto;
  }
  if (actual) yield actual;
}
