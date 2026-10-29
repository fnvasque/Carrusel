import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { localParts } from "../calendario/time.ts";
import { esPedidoPartir, hashRemitente, type DmEvent } from "./inbox.ts";
import { commitPaths, kbDir } from "./store.ts";

/**
 * Conteo de los DMs «PARTIR» de desconocidos (el cierre de las piezas). Se guarda solo la
 * fecha y un hash del remitente: nunca el IGSID ni el texto del DM. El bot no responde.
 */

const RUTA = "_metricas/dms.jsonl";

/** Una línea del registro (JSON + salto de línea). */
export function lineaDm(fechaIso: string, remitente: string): string {
  return JSON.stringify({ fecha: fechaIso, palabra: "PARTIR", remitente }) + "\n";
}

/** ¿Ese remitente ya está contado ese día? `dia` es AAAA-MM-DD en hora de Chile. */
export function yaContado(contenido: string, remitente: string, dia: string): boolean {
  for (const linea of contenido.split("\n")) {
    if (!linea.trim()) continue;
    try {
      const r = JSON.parse(linea) as { fecha?: string; remitente?: string };
      if (r.remitente === remitente && r.fecha && localParts(new Date(r.fecha)).dia === dia) return true;
    } catch { /* línea corrupta: se ignora */ }
  }
  return false;
}

/**
 * Agrega el DM al registro y lo commitea. Un mismo remitente cuenta una vez por día de Chile.
 * No serializa por sí sola: el bot la llama dentro de su `serial()` (la misma cola que
 * protege los demás commits a la base).
 */
export async function registrarPartir(remitente: string, ahora = new Date()): Promise<"nuevo" | "repetido"> {
  const archivo = join(kbDir(), RUTA);
  const previo = await readFile(archivo, "utf8").catch(() => "");
  if (yaContado(previo, remitente, localParts(ahora).dia)) return "repetido";
  await mkdir(dirname(archivo), { recursive: true });
  await appendFile(archivo, lineaDm(ahora.toISOString(), remitente));
  await commitPaths([archivo], "metricas: DM PARTIR");
  return "nuevo";
}

export interface DepsPartir {
  registrar: (remitenteHash: string) => Promise<"nuevo" | "repetido">;
  avisar: (texto: string) => Promise<void>;
  secret: string;
}

/** Atiende un DM de un desconocido: si pide PARTIR, lo cuenta y avisa. Nunca lanza ni responde por DM. */
export async function manejarPartir(ev: DmEvent, deps: DepsPartir): Promise<void> {
  if (!esPedidoPartir(ev)) return;
  try {
    let estado: "nuevo" | "repetido" = "nuevo";
    try {
      estado = await deps.registrar(hashRemitente(ev.senderId, deps.secret));
    } catch (err) {
      // Sin IGSID ni texto en el log.
      console.error(`❌ No pude registrar un DM PARTIR: ${err instanceof Error ? err.message : "error"}`);
    }
    if (estado === "nuevo") {
      await deps.avisar("📩 Alguien escribió PARTIR por DM en Instagram: respóndele en la app.");
    }
  } catch (err) {
    console.error(`❌ Aviso de DM PARTIR: ${err instanceof Error ? err.message : "error"}`);
  }
}
