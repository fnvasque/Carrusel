import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * En este Mac el Chromium que espera Playwright no coincide con su versión: si
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE no está puesto, se busca uno en la caché de
 * Playwright (como scripts/calendario-install-mac.sh) y se deja en esa variable,
 * que es la que respeta `findChromium()`. Nunca instala nada.
 * Orden: headless shell 1217, otro headless shell (el más nuevo), Chromium completo.
 * Devuelve la ruta usada, o undefined si no encontró ninguno (Playwright usará el suyo).
 */
export function usarChromiumDeCache(cache: string = join(homedir(), "Library", "Caches", "ms-playwright")): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const bin = buscar(cache);
  if (bin) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = bin;
  return bin;
}

function buscar(cache: string): string | undefined {
  const shell = (dir: string) => join(cache, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
  if (existsSync(shell("chromium_headless_shell-1217"))) return shell("chromium_headless_shell-1217");
  if (!existsSync(cache)) return undefined;
  // Más nuevo primero, por número de versión (no por orden alfabético: 999 < 1217).
  const version = (d: string): number => Number(d.slice(d.lastIndexOf("-") + 1)) || 0;
  const dirs = readdirSync(cache).sort((a, b) => version(b) - version(a));
  for (const d of dirs.filter((x) => x.startsWith("chromium_headless_shell-"))) {
    if (existsSync(shell(d))) return shell(d);
  }
  for (const d of dirs.filter((x) => x.startsWith("chromium-"))) {
    for (const c of [
      join(cache, d, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      join(cache, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    ]) {
      if (existsSync(c)) return c;
    }
  }
  return undefined;
}
