import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, open, realpath, rm, rmdir, readdir } from "node:fs/promises";
import { realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, sep } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Servidor de medios: sirve los JPEG/MP4 de `<root>/<semana>/<id>/` para que Meta los
 * descargue al publicar. Va por el mismo `node:http` del webhook (ver `startHttp`).
 *
 *   GET|HEAD /media/<MEDIA_PUBLIC_TOKEN>/<semana>/<id>/<archivo>
 *
 * Todo lo que no sea válido (token, forma de la ruta, extensión, symlink que salga del
 * root, archivo inexistente, método) responde el MISMO 404 vacío: no confirma que la
 * ruta exista. Nunca se registra el token.
 */

export const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
};

const PREFIJO = "/media/";
const RE_SEMANA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ID = /^[a-z0-9-]{3,80}$/;
/** Nombre de archivo: sin `..`, sin separadores ni caracteres raros; la extensión se valida aparte. */
const RE_ARCHIVO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const DIAS_RETENCION = 7;

// TODO(integración): usar ocultarToken de plan.ts
/** Reemplaza el token por `***` (para logs). */
function ocultarToken(s: string, token: string): string {
  return token ? s.split(token).join("***") : s;
}

/** ¿Es una fecha de calendario real (AAAA-MM-DD)? */
function fechaValida(s: string): boolean {
  if (!RE_SEMANA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Comparación en tiempo constante: se comparan hashes (largo fijo), así tampoco se filtra el largo del token. */
function mismoToken(dado: string, real: string): boolean {
  if (!real) return false;
  const a = createHash("sha256").update(dado).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

/**
 * Ruta absoluta segura del medio pedido, o `undefined` si algo no cuadra. `pathname` es la
 * ruta CRUDA de la petición (sin query): cualquier `%`, `\`, `;`, `?`, `#`, segmento vacío o
 * `..` se rechaza sin decodificar nada, porque ningún nombre legítimo los necesita.
 */
export function resolverMedio(pathname: string, token: string, root: string): string | undefined {
  if (!pathname.startsWith(PREFIJO)) return undefined;
  const partes = pathname.slice(PREFIJO.length).split("/");
  if (partes.length !== 4) return undefined;
  const [tok, semana, id, archivo] = partes;
  if (!mismoToken(tok, token)) return undefined;
  if (!fechaValida(semana) || !RE_ID.test(id) || !RE_ARCHIVO.test(archivo) || archivo.includes("..")) return undefined;
  if (!(extname(archivo).toLowerCase() in CONTENT_TYPES) || archivo.startsWith(".")) return undefined;
  try {
    const rootReal = realpathSync(root);
    const real = realpathSync(join(rootReal, semana, id, archivo));
    if (!real.startsWith(rootReal + sep)) return undefined;
    if (!statSync(real).isFile()) return undefined;
    return real;
  } catch {
    return undefined;
  }
}

const noEncontrado = (res: ServerResponse): void => {
  if (!res.headersSent) res.writeHead(404, { "Cache-Control": "no-store" });
  res.end();
};

/** Interpreta `Range: bytes=…` de un solo tramo. `ignorar`: cabecera ausente o ilegible (se sirve completo). */
function leerRango(h: string | undefined, size: number): { start: number; end: number } | "ignorar" | "invalido" {
  if (!h) return "ignorar";
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "ignorar";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return "invalido";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return "invalido";
  return { start, end };
}

async function servir(req: IncomingMessage, res: ServerResponse, archivo: string, logRuta: string): Promise<void> {
  // Se abre una vez: si el archivo se borra mientras se sirve, el descriptor sigue válido.
  const fh = await open(archivo, "r");
  try {
    const st = await fh.stat();
    if (!st.isFile()) return noEncontrado(res);
    const rango = leerRango(req.headers.range, st.size);
    if (rango === "invalido") {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}`, "Cache-Control": "no-store" }).end();
      return;
    }
    const cabeceras: Record<string, string | number> = {
      "Content-Type": CONTENT_TYPES[extname(archivo).toLowerCase()] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };
    let status = 200;
    let opts: { start?: number; end?: number } = {};
    if (rango === "ignorar") {
      cabeceras["Content-Length"] = st.size;
    } else {
      status = 206;
      cabeceras["Content-Range"] = `bytes ${rango.start}-${rango.end}/${st.size}`;
      cabeceras["Content-Length"] = rango.end - rango.start + 1;
      opts = rango;
    }
    res.writeHead(status, cabeceras);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    console.log(`📤 medio ${status} ${logRuta}`);
    // `fh.createReadStream` cierra el descriptor al terminar; `pipeline` destruye ambos extremos si el cliente corta.
    await pipeline(fh.createReadStream({ ...opts, autoClose: true }), res);
  } finally {
    await fh.close().catch(() => {});
  }
}

/**
 * Atiende `/media/…`. Devuelve `true` si la petición era de medios (incluye los 404 propios)
 * y `false` si la ruta no es de este servidor (otro manejador decide).
 */
export function manejarMedio(req: IncomingMessage, res: ServerResponse, opts: { token: string; root: string }): boolean {
  const cruda = (req.url ?? "").split(/[?#]/, 1)[0];
  if (!cruda.startsWith(PREFIJO)) return false;
  // La query o el fragmento NO forman parte de la ruta del archivo: si vienen, la ruta cruda no cambia
  // (Meta puede agregar parámetros), pero lo que se valida es solo la parte previa.
  const archivo = req.method === "GET" || req.method === "HEAD" ? resolverMedio(cruda, opts.token, opts.root) : undefined;
  if (!archivo) {
    noEncontrado(res);
    return true;
  }
  const logRuta = ocultarToken(cruda, opts.token);
  servir(req, res, archivo, logRuta).catch((err: NodeJS.ErrnoException) => {
    // Cliente que corta, archivo borrado o error de disco: nunca debe caer el proceso.
    if (err?.code === "ENOENT") return noEncontrado(res);
    if (err?.code !== "ERR_STREAM_PREMATURE_CLOSE" && err?.code !== "ECONNRESET") {
      console.warn(`⚠️  Servidor de medios: ${ocultarToken(err?.message ?? String(err), opts.token)} (${logRuta})`);
    }
    if (!res.headersSent) res.writeHead(404).end();
    else res.destroy();
  });
  return true;
}

/**
 * Borra las carpetas `<root>/<semana>/<id>` de piezas publicadas hace MÁS de 7 días.
 * Devuelve las rutas relativas borradas (`semana/id`). Nunca toca nada fuera del root,
 * no sigue symlinks y ignora las piezas sin `publicadoEn` válido (no publicadas).
 */
export async function limpiarMedios(
  root: string,
  publicados: { semana: string; id: string; publicadoEn: string }[],
  ahora: Date,
): Promise<string[]> {
  const borradas: string[] = [];
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return borradas;
  }
  const limite = ahora.getTime() - DIAS_RETENCION * 24 * 3_600_000;
  for (const p of publicados) {
    if (!fechaValida(p.semana) || !RE_ID.test(p.id)) continue;
    const t = Date.parse(p.publicadoEn);
    if (Number.isNaN(t) || t >= limite) continue;
    const carpeta = join(rootReal, p.semana, p.id);
    try {
      const st = await lstat(carpeta);
      if (!st.isDirectory()) continue; // symlink o archivo suelto: no se toca
      const real = await realpath(carpeta);
      if (real !== carpeta || !real.startsWith(rootReal + sep)) continue;
      await rm(carpeta, { recursive: true, force: true });
      borradas.push(`${p.semana}/${p.id}`);
      // Si la semana quedó vacía, se quita (rmdir no borra carpetas con contenido).
      const dirSemana = join(rootReal, p.semana);
      if ((await readdir(dirSemana)).length === 0) await rmdir(dirSemana).catch(() => {});
    } catch {
      // No existe o no se pudo borrar: se reintenta en la próxima pasada.
    }
  }
  return borradas;
}
