/** Números del proyecto: sesiones, tokens, versiones de archivos, renders y código. */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { SesionResumen } from "./sesiones.ts";

export interface Numeros {
  dias: number;
  inicio: string;
  fin: string;
  sesiones: number;
  mensajesUsuario: number;
  subagentes: number;
  herramientas: number;
  tokensSalida: number;
  tokensTotales: number;
  versiones: Record<string, number>;
  renders: number;
  lineasCodigo: number;
  archivosCodigo: number;
}

const SALTAR = new Set(["node_modules", ".git", "dist", "caso"]);
const CODIGO = new Set([".ts", ".tsx", ".js", ".mjs", ".py", ".css", ".html"]);
const RENDER = new Set([".mp4", ".png"]);

interface Archivo {
  ruta: string;
  partes: string[]; // carpetas + nombre, relativo al proyecto
}

function recorrer(raiz: string, rel: string[] = []): Archivo[] {
  const salida: Archivo[] = [];
  for (const e of readdirSync(join(raiz, ...rel), { withFileTypes: true })) {
    if (SALTAR.has(e.name)) continue;
    if (e.isDirectory()) salida.push(...recorrer(raiz, [...rel, e.name]));
    else if (e.isFile()) salida.push({ ruta: join(raiz, ...rel, e.name), partes: [...rel, e.name] });
  }
  return salida;
}

const dia = (iso: string): number => Date.parse(iso.slice(0, 10));

export function numerosCaso(proyecto: string, sesiones: SesionResumen[]): Numeros {
  const inicios = sesiones.map((s) => s.inicio).filter(Boolean).sort();
  const fines = sesiones.map((s) => s.fin).filter(Boolean).sort();
  const inicio = inicios[0] ?? "";
  const fin = fines[fines.length - 1] ?? "";
  const dias = inicio && fin ? Math.max(1, Math.round((dia(fin) - dia(inicio)) / 86_400_000) + 1) : 1;

  let tokensSalida = 0;
  let tokensTotales = 0;
  let herramientas = 0;
  for (const s of sesiones) {
    tokensSalida += s.tokens.salida;
    tokensTotales += s.tokens.salida + s.tokens.entrada + s.tokens.cacheLeida + s.tokens.cacheCreada;
    herramientas += Object.values(s.herramientas).reduce((a, b) => a + b, 0);
  }

  const grupos = new Map<string, number>();
  let renders = 0;
  let lineasCodigo = 0;
  let archivosCodigo = 0;
  for (const a of recorrer(proyecto)) {
    const nombre = a.partes[a.partes.length - 1]!;
    const ext = extname(nombre);
    const base = nombre.slice(0, nombre.length - ext.length).replace(/_v\d+$/, "");
    const clave = [...a.partes.slice(0, -1), base].join("/") + ext;
    grupos.set(clave, (grupos.get(clave) ?? 0) + 1);
    if (RENDER.has(ext) && a.partes.slice(0, -1).some((p) => p === "out" || p === "output")) renders++;
    if (CODIGO.has(ext)) {
      archivosCodigo++;
      const txt = readFileSync(a.ruta, "utf8");
      lineasCodigo += txt === "" ? 0 : txt.replace(/\n$/, "").split("\n").length;
    }
  }
  const versiones: Record<string, number> = {};
  for (const [clave, n] of grupos) {
    if (n < 2) continue;
    versiones[clave.slice(0, clave.length - extname(clave).length)] = n;
  }

  return {
    dias,
    inicio,
    fin,
    sesiones: sesiones.length,
    mensajesUsuario: sesiones.reduce((a, s) => a + s.mensajesUsuario.length, 0),
    subagentes: sesiones.reduce((a, s) => a + s.subagentes, 0),
    herramientas,
    tokensSalida,
    tokensTotales,
    versiones,
    renders,
    lineasCodigo,
    archivosCodigo,
  };
}
