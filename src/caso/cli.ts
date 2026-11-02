/**
 * CLI de /caso. Sin lógica propia: parsea argumentos y llama a los módulos de src/caso.
 *
 *   npm --prefix ~/Documents/Claude/Carrusel run caso -- <sub> <proyecto-absoluto> …
 *
 * Todo lo que escribe va a <proyecto>/caso/. Los errores salen como un mensaje en
 * español y código 1 (sin stack).
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { aprobar, estadoAprobacion } from "./aprobacion.ts";
import { carpetaCaso, dentroDeCaso } from "./carpeta.ts";
import { usarChromiumDeCache } from "./chromium.ts";
import { taparSensible, type Tapado } from "./filtro.ts";
import { armarMusica, copiarImagen, generarCaso, parsearTramos, recortarClip } from "./generar.ts";
import { numerosCaso } from "./numeros.ts";
import { lineaCarpetas, listarSesiones, type SesionResumen } from "./sesiones.ts";
import { trozarSesion } from "./trozos.ts";

const USO = `Uso: npm run caso -- <subcomando> <proyecto> …  (proyecto = ruta absoluta)

  sesiones <proyecto> [--sesiones-de <carpeta>]          lista las conversaciones de Claude
  trozar   <proyecto> <id…> [--sesiones-de <carpeta>]    escribe caso/trabajo/<id>-NN.md
  numeros  <proyecto> <id…> [--sesiones-de <carpeta>]    escribe caso/numeros.json
  tapar    <archivo>                                     tapa datos sensibles (solo dentro de caso/)
  imagen   <proyecto> <ruta>                             copia una imagen a caso/imagenes/
  clip     <proyecto> <video> <desde> <hasta> <nombre>   recorta un clip a caso/clips/
  musica   <proyecto> <audio> <nombre> <desde-hasta…>    une tramos de una canción en caso/clips/<nombre>.m4a
  aprobar  <proyecto>                                    marca caso/historia.md como aprobada
  generar  <proyecto> [--solo-pdf]                       genera caso.pdf, carrusel y reel

--sesiones-de: carpeta cuyas conversaciones se leen, si no es el mismo proyecto
(por ejemplo, las sesiones están en la carpeta madre).`;

class ErrorUso extends Error {}

/** Ruta absoluta: las relativas se resuelven contra INIT_CWD (donde se llamó npm). */
function rutaAbsoluta(p: string | undefined, que: string): string {
  if (!p) throw new ErrorUso(`Falta ${que}.`);
  if (isAbsolute(p)) return resolve(p);
  const base = process.env.INIT_CWD;
  if (!base) throw new ErrorUso(`${que} debe ser una ruta absoluta (recibí «${p}»).`);
  return resolve(base, p);
}

/** Separa banderas (`--x valor`, `--solo-pdf`) de los argumentos posicionales. */
function leerArgs(argv: string[]): { pos: string[]; sesionesDe?: string; soloPdf: boolean } {
  const pos: string[] = [];
  let sesionesDe: string | undefined;
  let soloPdf = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--solo-pdf") soloPdf = true;
    else if (a === "--sesiones-de") {
      sesionesDe = argv[++i];
      if (!sesionesDe) throw new ErrorUso("--sesiones-de necesita una carpeta.");
    } else if (a.startsWith("--")) throw new ErrorUso(`Opción desconocida: ${a}`);
    else pos.push(a);
  }
  return { pos, sesionesDe, soloPdf };
}

const corto = (s: string, max = 120): string => {
  const l = s.replace(/\s+/g, " ").trim();
  return l.length > max ? l.slice(0, max) + "…" : l;
};

const fecha = (iso: string): string => (iso ? iso.slice(0, 16).replace("T", " ") : "?");

/** Sesiones pedidas por id (o por un prefijo que identifique solo una). */
function elegir(sesiones: SesionResumen[], ids: string[]): SesionResumen[] {
  if (!ids.length) throw new ErrorUso("Indica al menos un id de sesión (míralos con `sesiones`).");
  return ids.map((id) => {
    const exacta = sesiones.find((s) => s.id === id);
    if (exacta) return exacta;
    const c = sesiones.filter((s) => s.id.startsWith(id));
    if (c.length === 1) return c[0]!;
    throw new Error(c.length ? `El id «${id}» calza con ${c.length} sesiones: usa más caracteres.` : `No hay una sesión con id «${id}».`);
  });
}

function resumenTapados(t: Tapado[]): string {
  if (!t.length) return "nada";
  const c = new Map<string, number>();
  for (const x of t) c.set(x.tipo, (c.get(x.tipo) ?? 0) + 1);
  return [...c].map(([k, n]) => `${k}: ${n}`).join(", ");
}

async function main(argv: string[]): Promise<void> {
  const [sub, ...resto] = argv;
  if (!sub || sub === "-h" || sub === "--help" || sub === "ayuda") {
    console.log(USO);
    return;
  }
  const { pos, sesionesDe, soloPdf } = leerArgs(resto);

  if (sub === "tapar") {
    const archivo = rutaAbsoluta(pos[0], "el archivo a tapar");
    if (!existsSync(archivo)) throw new Error(`No existe el archivo ${archivo}`);
    // tapar reescribe el archivo en su lugar: solo dentro de <proyecto>/caso/.
    if (!dentroDeCaso(archivo)) throw new Error(`tapar solo reescribe archivos dentro de la carpeta caso/ de un proyecto (recibí ${archivo}).`);
    const r = taparSensible(readFileSync(archivo, "utf8"));
    writeFileSync(archivo, r.texto);
    // Solo tipo y cantidad: ni pistas ni valores, que quedarían en la conversación.
    console.log(`Tapado en ${archivo}: ${resumenTapados(r.tapados)}`);
    return;
  }

  const proyecto = rutaAbsoluta(pos[0], "la ruta del proyecto");
  if (!existsSync(proyecto) || !statSync(proyecto).isDirectory()) throw new Error(`No existe la carpeta del proyecto ${proyecto}`);
  const origen = sesionesDe ? rutaAbsoluta(sesionesDe, "la carpeta de --sesiones-de") : proyecto;

  switch (sub) {
    case "sesiones": {
      const ss = await listarSesiones(origen);
      console.log(`${ss.length} sesiones de ${origen}\n`);
      for (const s of ss) {
        console.log(`${s.id}  ${fecha(s.inicio)} → ${fecha(s.fin)}  ${Math.round(s.bytes / 1024)} KB  ${s.mensajesUsuario.length} mensajes`);
        const carpetas = lineaCarpetas(s, origen);
        if (carpetas) console.log(`  ${carpetas}`);
        for (const m of s.mensajesUsuario.slice(0, 3)) console.log(`  > ${corto(taparSensible(m).texto)}`);
        console.log("");
      }
      return;
    }
    case "trozar": {
      const elegidas = elegir(await listarSesiones(origen), pos.slice(1));
      const trabajo = join(carpetaCaso(proyecto), "trabajo");
      for (const s of elegidas) {
        // Trozos de una corrida anterior de esta sesión: se borran para no mezclar versiones.
        for (const f of readdirSync(trabajo)) if (f.startsWith(`${s.id}-`) && f.endsWith(".md")) rmSync(join(trabajo, f));
        let n = 0;
        for await (const trozo of trozarSesion(s.archivo)) {
          n++;
          // Los trozos van a subagentes: se tapan antes de escribirlos.
          const salida = join(trabajo, `${s.id}-${String(n).padStart(2, "0")}.md`);
          writeFileSync(salida, taparSensible(trozo).texto);
          console.log(salida);
        }
        if (!n) console.log(`(la sesión ${s.id} no tiene conversación que trozar)`);
      }
      return;
    }
    case "numeros": {
      const elegidas = elegir(await listarSesiones(origen), pos.slice(1));
      const n = numerosCaso(proyecto, elegidas);
      const salida = join(carpetaCaso(proyecto), "numeros.json");
      writeFileSync(salida, JSON.stringify(n, null, 2) + "\n");
      for (const [k, v] of Object.entries(n)) console.log(`${k.padEnd(16)} ${typeof v === "object" ? JSON.stringify(v) : v}`);
      console.log(`\nGuardado en ${salida}`);
      return;
    }
    case "imagen": {
      // Una ruta relativa de imagen o video se entiende dentro del proyecto.
      const ruta = pos[1] ? resolve(proyecto, pos[1]) : rutaAbsoluta(undefined, "la ruta de la imagen");
      if (!existsSync(ruta)) throw new Error(`No existe el archivo ${ruta}`);
      console.log(copiarImagen(ruta, carpetaCaso(proyecto)));
      return;
    }
    case "clip": {
      const [, video, desde, hasta, nombre] = pos;
      if (!video || desde === undefined || hasta === undefined || !nombre) throw new ErrorUso("clip necesita <video> <desde> <hasta> <nombre> (segundos).");
      const videoAbs = resolve(proyecto, video);
      if (!existsSync(videoAbs)) throw new Error(`No existe el archivo ${videoAbs}`);
      console.log(await recortarClip(videoAbs, Number(desde), Number(hasta), carpetaCaso(proyecto), nombre));
      return;
    }
    case "musica": {
      const [, audio, nombre, ...tramos] = pos;
      if (!audio || !nombre || !tramos.length) throw new ErrorUso("musica necesita <audio> <nombre> y al menos un tramo desde-hasta (segundos).");
      const audioAbs = resolve(proyecto, audio);
      if (!existsSync(audioAbs)) throw new Error(`No existe el archivo ${audioAbs}`);
      console.log(await armarMusica(audioAbs, parsearTramos(tramos), carpetaCaso(proyecto), nombre));
      return;
    }
    case "aprobar": {
      const dir = carpetaCaso(proyecto);
      const { hash } = aprobar(dir);
      console.log(`Historia aprobada (${hash.slice(0, 12)}). Estado: ${estadoAprobacion(dir)}`);
      return;
    }
    case "generar": {
      usarChromiumDeCache();
      const r = await generarCaso(carpetaCaso(proyecto), { soloPdf });
      console.log(`PDF: ${r.pdf}`);
      if (r.carrusel.length) console.log(`Carrusel (${r.carrusel.length}):\n${r.carrusel.map((p) => `  ${p}`).join("\n")}`);
      if (r.reel) console.log(`Reel: ${r.reel}`);
      if (r.avisos.length) console.log(`Avisos:\n${r.avisos.map((a) => `  - ${a}`).join("\n")}`);
      return;
    }
    default:
      throw new ErrorUso(`Subcomando desconocido: ${sub}`);
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Error: ${msg}`);
  if (e instanceof ErrorUso) console.error(`\n${USO}`);
  process.exit(1);
});
