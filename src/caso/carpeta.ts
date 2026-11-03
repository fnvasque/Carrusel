import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Crea `<proyecto>/caso/` (auto-ignorada por git) con sus subcarpetas. Idempotente.
 * Lanza si ya hay un `caso/.gitignore` que no es exactamente `*`: la carpeta podría
 * terminar commiteada en el repo del proyecto.
 */
export function carpetaCaso(proyecto: string): string {
  const dir = join(proyecto, "caso");
  mkdirSync(dir, { recursive: true });
  for (const s of ["trabajo", "imagenes", "clips", "salida"]) mkdirSync(join(dir, s), { recursive: true });
  const gi = join(dir, ".gitignore");
  if (!existsSync(gi)) writeFileSync(gi, "*\n");
  else if (readFileSync(gi, "utf8").trim() !== "*") {
    throw new Error(
      `${gi} existe y no contiene solo «*»: la carpeta caso/ podría subirse al repositorio del proyecto. ` +
        "Déjalo con una sola línea «*» (o mueve esa carpeta) y vuelve a intentarlo.",
    );
  }
  return dir;
}

/**
 * true si `ruta` es un archivo cuya ruta real queda dentro de una carpeta de caso: subiendo
 * desde el archivo, la carpeta `caso` MÁS CERCANA debe tener la marca que escribe
 * `carpetaCaso` (`.gitignore` con exactamente `*`). Así un proyecto que se llama `caso`
 * (o cualquier carpeta madre con ese nombre) no cuenta, y un enlace simbólico que apunta
 * fuera tampoco. Guarda de `tapar`, que reescribe el archivo en su lugar.
 */
export function dentroDeCaso(ruta: string): boolean {
  let real: string;
  try {
    real = realpathSync(ruta);
    if (!statSync(real).isFile()) return false;
  } catch {
    return false;
  }
  for (let dir = dirname(real); dir !== dirname(dir); dir = dirname(dir)) {
    if (basename(dir) !== "caso") continue;
    // Solo la más cercana decide: si no tiene la marca, no se sigue buscando hacia arriba.
    try {
      return readFileSync(join(dir, ".gitignore"), "utf8").trim() === "*";
    } catch {
      return false;
    }
  }
  return false;
}
