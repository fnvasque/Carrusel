#!/usr/bin/env node
// Validador de la investigación semanal (sin dependencias: corre con node a secas).
//
//   node _investigacion/validar.mjs                 valida referencias, bloques kb:research y el último resumen
//   node _investigacion/validar.mjs --desde <sha>   además: nada cambió fuera de las zonas del agente
//
// Sale con código 1 y la lista de errores si algo no cumple. Nunca subas cambios que no pasen.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TIPOS = new Set(["software", "producto", "libro", "metodo", "persona", "lugar", "concepto", "otro"]);
const RESEARCH_START = "<!-- kb:research:start -->";
const RESEARCH_END = "<!-- kb:research:end -->";
const AUTO_START = "<!-- kb:auto:start -->";
const AUTO_END = "<!-- kb:auto:end -->";
const MAX_RESUMEN = 1000;

const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, "$2");

function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Frontmatter YAML simple y tolerante (lo que escriben el agente y Obsidian):
 * `clave: valor`, `clave: [a, b]`, listas `- x` (con o sin sangría), comentarios ` # …`.
 * Lo que no entiende (texto plegado `>`/`|`, mapas anidados) se ignora sin error.
 */
export function parseFrontmatter(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { error: "falta el frontmatter (--- … ---) al inicio" };
  const data = {};
  let key;
  for (const line of m[1].split("\n")) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(stripComment(item[1])));
      continue;
    }
    const kv = line.match(/^([\p{L}\w-]+):\s*(.*)$/u);
    if (!kv) {
      key = /^\s/.test(line) ? key : undefined; // continuación de un valor que no se interpreta
      continue;
    }
    key = kv[1];
    const v = stripComment(kv[2]).trim();
    if (/^[>|]/.test(v)) {
      data[key] = "";
      key = undefined; // texto plegado: sus líneas siguientes no son una lista
    } else {
      data[key] =
        v === "" ? [] : v.startsWith("[") && v.endsWith("]") ? v.slice(1, -1).split(",").map(unquote).filter(Boolean) : unquote(v);
    }
  }
  return { data, body: m[2] };
}

/** Quita un comentario YAML final (` # …`) que no esté dentro de comillas. */
function stripComment(v) {
  const q = v.trim()[0];
  if (q === '"' || q === "'") return v;
  const i = v.search(/\s#/);
  return i === -1 ? v : v.slice(0, i);
}

/** Errores de una nota de referencia ([] = válida). */
export function validateReferencia(text) {
  const fm = parseFrontmatter(text);
  if ("error" in fm) return [fm.error];
  const { data, body } = fm;
  const errs = [];
  if (!TIPOS.has(data.tipo)) errs.push(`tipo inválido: "${data.tipo ?? "(falta)"}" (usa: ${[...TIPOS].join(", ")})`);
  if (typeof data.nombre !== "string" || !data.nombre) errs.push("falta nombre");
  if (!validDate(data.revisado)) errs.push(`revisado inválido: "${data.revisado ?? "(falta)"}" (AAAA-MM-DD)`);
  const fuentes = Array.isArray(data.fuentes) ? data.fuentes : typeof data.fuentes === "string" ? [data.fuentes] : [];
  if (!fuentes.length) errs.push("fuentes vacío: toda nota necesita al menos una URL");
  for (const f of fuentes) if (!/^https?:\/\/\S+$/.test(f)) errs.push(`la fuente "${f}" no es una URL http(s)`);
  for (const h of ["Qué es", "Datos clave"]) {
    if (!new RegExp(`^## ${h}\\s*$`, "m").test(body)) errs.push(`falta la sección "## ${h}"`);
  }
  // Citas [n]: ni [[wikilinks]] ni [texto](url).
  const cited = [...body.matchAll(/(?<!\[)\[(\d+)\](?![\](])/g)].map((x) => Number(x[1]));
  if (!cited.length) errs.push("ninguna afirmación cita una fuente [n]");
  for (const n of new Set(cited)) if (n < 1 || n > fuentes.length) errs.push(`la cita [${n}] no tiene fuente (hay ${fuentes.length})`);
  return errs;
}

/** Errores del bloque kb:research de un tema ([] si es válido o si el tema no tiene bloque). */
export function validateTopicBlock(text) {
  const starts = text.split(RESEARCH_START).length - 1;
  const ends = text.split(RESEARCH_END).length - 1;
  if (!starts && !ends) return [];
  const s = text.indexOf(RESEARCH_START);
  const e = text.indexOf(RESEARCH_END);
  if (starts !== 1 || ends !== 1 || e < s) return ["el bloque kb:research debe abrirse y estar cerrado exactamente una vez"];
  const inner = text.slice(s + RESEARCH_START.length, e);
  const errs = [];
  if (!/^## Investigación\s*$/m.test(inner)) errs.push('el bloque kb:research debe empezar con "## Investigación"');
  const rev = inner.match(/_Revisado (\d{4}-\d{2}-\d{2})_/);
  if (!rev || !validDate(rev[1])) errs.push('falta "_Revisado AAAA-MM-DD_" válido en el bloque kb:research');
  return errs;
}

/** Errores del resumen semanal. */
export function validateResumen(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  if (!body) return ["el resumen está vacío"];
  return body.length > MAX_RESUMEN ? [`el resumen tiene ${body.length} caracteres (máximo ${MAX_RESUMEN})`] : [];
}

/** Rutas cambiadas que el agente no puede tocar. */
export function outsideAgentZones(paths) {
  return paths.filter(
    (p) => !(p.startsWith("referencias/") || p.startsWith("_investigacion/") || p === "CLAUDE.md" || p.startsWith("temas/")),
  );
}

/** Salida de `git diff --name-status --no-renames` → [{ status, path }]. */
export function parseNameStatus(out) {
  return out
    .split("\n")
    .map((l) => l.match(/^([A-Z])\d*\t(.+)$/))
    .filter(Boolean)
    .map((m) => ({ status: m[1], path: m[2] }));
}

/** Archivos de _investigacion/ que instala el usuario (scripts/kb-research-install.sh), no el agente. */
const PROTECTED = new Set(["_investigacion/validar.mjs", "_investigacion/INSTRUCCIONES.md"]);

/** Errores de zona: nada fuera de las zonas del agente; en temas/ solo se modifican los existentes. */
export function zoneErrors(changes) {
  const errs = [];
  for (const { status, path } of changes) {
    if (outsideAgentZones([path]).length) errs.push(`${path}: el agente no puede modificar este archivo`);
    else if (PROTECTED.has(path)) errs.push(`${path}: el agente no puede modificar el validador ni el manual`);
    else if (path.startsWith("temas/") && status === "D") errs.push(`${path}: el agente no puede borrar temas`);
    else if (path.startsWith("temas/") && status === "A") errs.push(`${path}: el agente no puede crear temas nuevos`);
  }
  return errs;
}

/** Zona automática (del bot) de un tema. */
export function autoZoneOf(text) {
  const s = text.indexOf(AUTO_START);
  const e = text.indexOf(AUTO_END);
  return s !== -1 && e > s ? text.slice(s + AUTO_START.length, e).trim() : undefined;
}

const mdIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);
// core.quotepath=false: sin esto git escapa las rutas con tildes ("temas/Automatizaci\303\263n…").
const git = (root, ...args) =>
  execFileSync("git", ["-c", "core.quotepath=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * Desde dónde contar los cambios del agente. Tras un `pull --rebase`, los commits
 * del bot quedan entre `desde` y los del agente: se parte del punto en común con
 * el remoto (merge-base con @{u}) si es posterior a `desde`.
 */
function agentBase(root, desde) {
  try {
    const mb = git(root, "merge-base", "HEAD", "@{u}").trim();
    git(root, "merge-base", "--is-ancestor", desde, mb);
    return mb;
  } catch {
    return desde;
  }
}

function main(root, desde) {
  const errors = [];
  const add = (file, errs) => errs.forEach((e) => errors.push(`${file}: ${e}`));
  let changes;
  let base;
  if (desde) {
    base = agentBase(root, desde);
    changes = [
      ...parseNameStatus(git(root, "diff", "--name-status", "--no-renames", base)),
      ...git(root, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean).map((path) => ({ status: "A", path })),
    ];
    errors.push(...zoneErrors(changes));
  }
  // Con --desde, el contenido se revisa solo en lo que tocó el agente (no en notas editadas por el usuario).
  const touched = (p) => !changes || changes.some((c) => c.path === p && c.status !== "D");
  for (const f of mdIn(join(root, "referencias"))) {
    if (touched(`referencias/${f}`)) add(`referencias/${f}`, validateReferencia(readFileSync(join(root, "referencias", f), "utf8")));
  }
  for (const f of mdIn(join(root, "temas"))) {
    if (touched(`temas/${f}`)) add(`temas/${f}`, validateTopicBlock(readFileSync(join(root, "temas", f), "utf8")));
  }
  const resumenes = mdIn(join(root, "_investigacion", "resumenes"));
  const last = resumenes[resumenes.length - 1];
  if (last) add(`_investigacion/resumenes/${last}`, validateResumen(readFileSync(join(root, "_investigacion", "resumenes", last), "utf8")));
  if (changes) {
    for (const { path: p } of changes.filter((c) => c.path.startsWith("temas/") && c.status === "M")) {
      if (autoZoneOf(git(root, "show", `${base}:${p}`)) !== autoZoneOf(readFileSync(join(root, p), "utf8"))) {
        errors.push(`${p}: cambió la zona kb:auto (es del bot)`);
      }
    }
  }
  if (errors.length) {
    console.error(`✗ ${errors.length} problema(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log("✓ Investigación válida.");
}

// ¿Se ejecutó como script (y no importado)? Rutas reales: en macOS /var es un enlace a /private/var.
const self = fileURLToPath(import.meta.url);
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
if (process.argv[1] && real(process.argv[1]) === real(self)) {
  const i = process.argv.indexOf("--desde");
  main(join(dirname(self), ".."), i > -1 ? process.argv[i + 1] : undefined);
}
