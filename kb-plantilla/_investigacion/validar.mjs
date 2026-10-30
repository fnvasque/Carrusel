#!/usr/bin/env node
// Validador de la investigación semanal (sin dependencias: corre con node a secas).
//
//   node _investigacion/validar.mjs                 valida referencias, bloques kb:research y el último resumen
//   node _investigacion/validar.mjs --desde <sha>   además: nada cambió fuera de las zonas del agente
//   node _investigacion/validar.mjs --aprendiz <slug>  imprime el mensaje exacto para el subagente lector aprendiz
//   node _investigacion/validar.mjs --cobertura     referencias y conexiones listas por etapa, y preguntas pendientes
//
// Sale con código 1 y la lista de errores si algo no cumple. Nunca subas cambios que no pasen.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TIPOS = new Set(["software", "producto", "libro", "metodo", "persona", "lugar", "concepto", "otro", "conexion"]);
const RESEARCH_START = "<!-- kb:research:start -->";
const RESEARCH_END = "<!-- kb:research:end -->";
const AUTO_START = "<!-- kb:auto:start -->";
const AUTO_END = "<!-- kb:auto:end -->";
const MAX_RESUMEN = 1000;
/** Desde esta fecha de `revisado`, toda referencia lleva `## Para la audiencia` (las anteriores se completan al revisarlas). Es anterior al día del cambio (2026-10-09 UTC): las corridas de esa noche en Chile fechan 2026-10-08. */
export const DESDE_AUDIENCIA = "2026-10-05";
/** Rótulos obligatorios de `## Para la audiencia` cuando la referencia aplica a la cuenta. */
export const ROTULOS_AUDIENCIA = ["Por qué importa", "Qué se puede hacer", "Para quién", "Límites"];
/** Desde este `revisado`, `## Para la audiencia` suma el rótulo «Lo que no sabe un usuario frecuente» (el público ya usa IA a diario: sofisticación = criterio, no funciones). */
export const DESDE_NOVEDAD = "2026-10-25";
export const ROTULO_NOVEDAD = "Lo que no sabe un usuario frecuente";
const NO_APLICA_RE = /^No aplica a la cuenta\b/m;
/**
 * Desde este `revisado` (pivote a coaching, 2026-10-29) toda nota que aplica a la cuenta lleva `etapa`,
 * `aprendiz` y los rótulos de ROTULOS_ETAPAS. Es el día anterior a la instalación: las corridas nocturnas
 * fechan con la hora de Chile.
 */
export const DESDE_ETAPAS = "2026-10-28";
/** Etapas del camino de coaching, en orden (las describe `alcance.json → etapas`). */
export const ETAPAS = ["perder-el-miedo", "adoptar", "liderar", "revalorizarse"];
export const ROTULO_DICHO = "Dicho simple";
export const ROTULO_EMPIEZA = "Lo que no sabe quien está empezando";
export const ROTULOS_ETAPAS = [ROTULO_DICHO, "Por qué importa", "Qué se puede hacer", ROTULO_EMPIEZA, "Para quién", "Límites"];
/** Tope del texto de «Dicho simple»: una idea, no un párrafo. */
export const MAX_DICHO = 400;
/** Meta de cobertura por etapa (referencias y conexiones listas). */
export const META_REFERENCIAS = 8;
export const META_CONEXIONES = 3;
/** Una nota está vigente para el planificador hasta 60 días después de `revisado`. */
const VIGENCIA_DIAS = 60;
const CITA_RE = /(?<!\[)\[\d+\](?![\](])/;

/** Valor de frontmatter como lista (un texto suelto cuenta como lista de uno). */
const lista = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);

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
        v === "" ? [] : v.startsWith("[") && v.endsWith("]") ? partirLista(v.slice(1, -1)).map(unquote).filter(Boolean) : unquote(v);
    }
  }
  return { data, body: m[2] };
}

/** Parte una lista inline por comas, sin cortar dentro de comillas ni de `[[…]]` («[[b|Uno, dos]]»). */
function partirLista(s) {
  const partes = [];
  let actual = "";
  let comilla = "";
  let enlace = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comilla) {
      if (c === comilla) comilla = "";
    } else if (c === '"' || c === "'") {
      if (!actual.trim()) comilla = c;
    } else if (s.startsWith("[[", i)) {
      enlace++;
    } else if (s.startsWith("]]", i) && enlace) {
      enlace--;
    } else if (c === "," && !enlace) {
      partes.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
  }
  partes.push(actual.trim());
  return partes;
}

/** Quita un comentario YAML final (` # …`) que no esté dentro de comillas. */
function stripComment(v) {
  const q = v.trim()[0];
  if (q === '"' || q === "'") return v;
  const i = v.search(/\s#/);
  return i === -1 ? v : v.slice(0, i);
}

/**
 * Errores de una nota de referencia ([] = válida). `ctx` (opcional, lo arma `contexto(root)`) permite
 * comprobar contra la base: ids de `etapa`, que existan las notas de `conecta` y las preguntas de `responde`.
 * Sin `ctx` solo se revisa la forma.
 */
export function validateReferencia(text, ctx = {}) {
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
  if (validDate(data.revisado) && data.revisado >= DESDE_AUDIENCIA) errs.push(...validateAudiencia(body, data.revisado));
  const aud = seccion(body, "Para la audiencia");
  if (validDate(data.revisado) && data.revisado >= DESDE_ETAPAS && aud !== undefined && !NO_APLICA_RE.test(aud)) {
    const etapas = lista(data.etapa);
    if (!etapas.length) errs.push(`falta "etapa" (una o más de: ${ETAPAS.join(", ")}; obligatoria desde revisado ${DESDE_ETAPAS})`);
    if (ctx.etapas) {
      for (const e of etapas) if (!ctx.etapas.includes(e)) errs.push(`la etapa "${e}" no está en alcance.json → etapas (${ctx.etapas.join(", ")})`);
    }
    if (data.aprendiz !== data.revisado) {
      errs.push(`"aprendiz" es la fecha en que la nota pasó el lector aprendiz y debe ser igual a revisado (${data.revisado}); es "${data.aprendiz ?? "(falta)"}"`);
    }
  }
  if (ctx.preguntas) {
    for (const r of lista(data.responde)) {
      if (!ctx.preguntas.includes(r)) errs.push(`responde: "${r}" no está en _investigacion/preguntas.md (cópiala tal cual, sin el "- ")`);
    }
  }
  if (data.tipo === "conexion") errs.push(...validateConexion(data, body, fuentes, ctx));
  return errs;
}

/** `[[slug|Nombre]]`, `'[[slug]]'` o `slug` → `slug`. */
export function slugDeEnlace(s) {
  const t = unquote(String(s)).trim();
  const m = t.match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
  return (m ? m[1] : t).trim();
}

/** Dominio registrable aproximado: `blog.hbs.edu` → `hbs.edu`, `www.bbc.co.uk` → `bbc.co.uk`. */
const dominio = (u) => {
  try {
    const partes = new URL(u).hostname.replace(/^www\./, "").split(".");
    const n = partes.length >= 3 && partes.at(-1).length === 2 && /^(com|co|org|gob|gov|edu|ac|net)$/.test(partes.at(-2)) ? 3 : 2;
    return partes.slice(-n).join(".");
  } catch {
    return undefined;
  }
};
const normalizarUrl = (u) => String(u).trim().replace(/\/+$/, "");

/** Una conexión une ≥ 3 referencias (no conexiones) con fuentes de ≥ 2 dominios y explica cómo se conectan. */
function validateConexion(data, body, fuentes, ctx) {
  const errs = [];
  const conecta = [...new Set(lista(data.conecta).map(slugDeEnlace).filter(Boolean))];
  if (conecta.length < 3) errs.push(`una conexión une al menos 3 referencias distintas en "conecta" (tiene ${conecta.length})`);
  if (ctx.slugPropio && conecta.includes(ctx.slugPropio)) errs.push("una conexión no puede conectarse a sí misma");
  if (ctx.slugs) {
    for (const c of conecta) {
      if (c !== ctx.slugPropio && !ctx.slugs.has(c)) errs.push(`conecta "[[${c}]]": no existe referencias/${c}.md (o es otra conexión)`);
    }
  }
  const dominios = new Set(fuentes.map(dominio).filter(Boolean));
  if (dominios.size < 2) errs.push(`las fuentes de una conexión vienen de al menos 2 dominios distintos (tiene ${dominios.size})`);
  if (ctx.fuentesDe) {
    const propias = new Set(fuentes.map(normalizarUrl));
    for (const c of conecta) {
      const suyas = ctx.fuentesDe.get(c);
      if (suyas && !suyas.some((u) => propias.has(normalizarUrl(u)))) {
        errs.push(`conecta "[[${c}]]": la conexión no cita ninguna de sus fuentes (copia en "fuentes" la URL original de lo que tomas de esa nota)`);
      }
    }
  }
  const como = seccion(body, "Cómo se conectan");
  if (como === undefined) errs.push('falta la sección "## Cómo se conectan"');
  else if (new Set([...como.matchAll(/(?<!\[)\[(\d+)\](?![\](])/g)].map((x) => x[1])).size < 2) {
    errs.push('"## Cómo se conectan" cita al menos 2 fuentes distintas [n]: es donde se cruzan');
  }
  return errs;
}

/** Texto de una sección `## <titulo>` hasta la siguiente `## ` (undefined si no está). */
export function seccion(body, titulo) {
  const lineas = body.replace(/\r\n/g, "\n").split("\n");
  const i = lineas.findIndex((l) => new RegExp(`^## ${titulo}\\s*$`).test(l));
  if (i === -1) return undefined;
  const fin = lineas.findIndex((l, j) => j > i && /^## /.test(l));
  return lineas.slice(i + 1, fin === -1 ? undefined : fin).join("\n");
}

/**
 * Errores de `## Para la audiencia`: o dice "No aplica a la cuenta: <motivo>", o
 * lleva los cuatro rótulos (`- **Por qué importa:** …`) y al menos una cita [n].
 * Con `revisado >= DESDE_NOVEDAD` exige además `- **Lo que no sabe un usuario frecuente:** …`.
 */
export function validateAudiencia(body, revisado) {
  const s = seccion(body, "Para la audiencia");
  if (s === undefined) return ['falta la sección "## Para la audiencia" (obligatoria desde revisado ' + DESDE_AUDIENCIA + ")"];
  if (NO_APLICA_RE.test(s)) return [];
  if (revisado !== undefined && revisado >= DESDE_ETAPAS) return validateAudienciaEtapas(s);
  const errs = [];
  for (const r of ROTULOS_AUDIENCIA) {
    if (!new RegExp(`^- \\*\\*${r}:\\*\\*\\s*\\S`, "m").test(s)) errs.push(`"## Para la audiencia" sin "- **${r}:** …" (o escribe "No aplica a la cuenta: <motivo>")`);
  }
  if (revisado !== undefined && revisado >= DESDE_NOVEDAD && !new RegExp(`^- \\*\\*${ROTULO_NOVEDAD}:\\*\\*\\s*\\S`, "m").test(s)) {
    errs.push(`"## Para la audiencia" sin "- **${ROTULO_NOVEDAD}:** …" (obligatorio desde revisado ${DESDE_NOVEDAD}; o escribe "No aplica a la cuenta: <motivo>")`);
  }
  if (!/(?<!\[)\[\d+\](?![\](])/.test(s)) errs.push('"## Para la audiencia" no cita ninguna fuente [n]: lo que se puede hacer debe estar verificado');
  return errs;
}

/** Desde DESDE_ETAPAS: los seis rótulos de ROTULOS_ETAPAS, y «Dicho simple» con cita y ≤ MAX_DICHO caracteres. */
function validateAudienciaEtapas(s) {
  const errs = [];
  for (const r of ROTULOS_ETAPAS) {
    if (!new RegExp(`^- \\*\\*${r}:\\*\\*[ \\t]*\\S`, "m").test(s)) {
      errs.push(`"## Para la audiencia" sin "- **${r}:** …" con texto (obligatorio desde revisado ${DESDE_ETAPAS}; o escribe "No aplica a la cuenta: <motivo>")`);
    }
  }
  const dicho = rotulo(s, ROTULO_DICHO);
  if (dicho !== undefined) {
    if (!CITA_RE.test(dicho)) errs.push(`"${ROTULO_DICHO}" no cita su fuente [n]`);
    if (dicho.length > MAX_DICHO) errs.push(`"${ROTULO_DICHO}" tiene ${dicho.length} caracteres (máximo ${MAX_DICHO}: una sola idea)`);
  }
  if (!CITA_RE.test(s)) errs.push('"## Para la audiencia" no cita ninguna fuente [n]: lo que se puede hacer debe estar verificado');
  return errs;
}

/**
 * Texto de un rótulo `- **<r>:** …` de una sección, con sus líneas de continuación (sub-viñetas o
 * texto sangrado) hasta el siguiente rótulo. undefined si no está.
 */
function rotulo(s, r) {
  const lineas = s.split("\n");
  const i = lineas.findIndex((l) => l.startsWith(`- **${r}:**`));
  if (i === -1) return undefined;
  const partes = [lineas[i].slice(`- **${r}:**`.length).trim()];
  for (const l of lineas.slice(i + 1)) {
    if (/^- \*\*/.test(l) || /^#/.test(l)) break;
    if (l.trim()) partes.push(l.trim());
  }
  return partes.join("\n");
}

/** Texto de «Dicho simple» en el cuerpo de una nota (undefined si no lo tiene). */
export function dichoSimple(body) {
  const s = seccion(body, "Para la audiencia");
  return s === undefined ? undefined : rotulo(s, ROTULO_DICHO);
}

/** Errores de `_investigacion/alcance.json` (del usuario): listas `dentro`, `despues`, `fuera` de temas, sin repetir. */
export function validateAlcance(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return [`no es JSON válido (${e instanceof Error ? e.message : e})`];
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return ["debe ser un objeto { dentro, despues, fuera }"];
  const errs = [];
  const vistos = new Map();
  for (const k of ["dentro", "despues", "fuera"]) {
    const v = data[k];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && x.trim())) {
      errs.push(`"${k}" debe ser una lista de nombres de tema`);
      continue;
    }
    for (const t of v) {
      const key = claveTema(t);
      if (vistos.has(key)) errs.push(`el tema "${t}" está en "${vistos.get(key)}" y en "${k}"`);
      else vistos.set(key, k);
    }
  }
  if (data.etapas !== undefined) {
    if (data.etapas === null || typeof data.etapas !== "object" || Array.isArray(data.etapas)) errs.push('"etapas" debe ser un objeto { id: descripción }');
    else {
      for (const [id, desc] of Object.entries(data.etapas)) {
        if (id.startsWith("_")) continue;
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errs.push(`etapas: el id "${id}" va en minúsculas con guiones`);
        if (typeof desc !== "string" || !desc.trim()) errs.push(`etapas: "${id}" necesita una descripción`);
      }
    }
  }
  return errs;
}

/**
 * Preguntas de `_investigacion/preguntas.md`: líneas `- AAAA-MM-DD · <etapa> · <pregunta>` con fecha
 * válida y una etapa de ETAPAS, sin el "- ". La línea de ejemplo (`AAAA-MM-DD`) no cuenta.
 */
export function parsePreguntas(text) {
  return lineasPreguntas(text).validas;
}

/** Líneas de viñeta de preguntas.md separadas en válidas e inválidas (para avisar al usuario). */
export function lineasPreguntas(text) {
  const validas = [];
  const invalidas = [];
  for (const l of String(text).split("\n")) {
    const vin = l.match(/^\s*-\s+(.+?)\s*$/);
    if (!vin || vin[1].startsWith("AAAA-MM-DD")) continue;
    const m = vin[1].match(/^(\d{4}-\d{2}-\d{2}) · ([^·]+?) · .+$/);
    if (m && validDate(m[1]) && ETAPAS.includes(m[2])) validas.push(vin[1]);
    else invalidas.push(vin[1]);
  }
  return { validas, invalidas };
}

/** Clave de comparación de un tema: sin `[[ ]]`, sin tildes, en minúsculas. */
export const claveTema = (t) =>
  String(t).replace(/\[\[|\]\]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

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
const PROTECTED = new Set([
  "_investigacion/validar.mjs",
  "_investigacion/INSTRUCCIONES.md",
  "_investigacion/alcance.json",
  "_investigacion/pedidos.md",
  "_investigacion/preguntas.md",
  "_investigacion/lector-aprendiz.md",
]);

/** Errores de zona: nada fuera de las zonas del agente; en temas/ solo se modifican los existentes. */
export function zoneErrors(changes) {
  const errs = [];
  for (const { status, path } of changes) {
    if (outsideAgentZones([path]).length) errs.push(`${path}: el agente no puede modificar este archivo`);
    else if (PROTECTED.has(path)) errs.push(`${path}: el agente no puede modificar el validador, el manual, el alcance, los pedidos, las preguntas ni el lector aprendiz (son del usuario)`);
    else if (path.startsWith("_investigacion/resumenes/") && status !== "A") {
      errs.push(`${path}: no sobrescribas un resumen ya publicado (el bot ya lo envió); usa <HOY>-2.md, <HOY>-3.md…`);
    }
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

/** Orden cronológico de resúmenes: AAAA-MM-DD.md antes que AAAA-MM-DD-2.md. */
const summaryKey = (f) => {
  const m = f.match(/^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/);
  return m ? `${m[1]}-${(m[2] ?? "1").padStart(4, "0")}` : f;
};
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

/** Contexto de la base para validateReferencia: etapas de alcance.json, slugs de referencias que no son conexiones y preguntas. */
export function contexto(root) {
  const ctx = { preguntas: [], slugs: new Set(), fuentesDe: new Map() };
  const alcance = join(root, "_investigacion", "alcance.json");
  if (existsSync(alcance)) {
    try {
      const etapas = JSON.parse(readFileSync(alcance, "utf8")).etapas;
      if (etapas && typeof etapas === "object" && !Array.isArray(etapas)) ctx.etapas = Object.keys(etapas).filter((k) => !k.startsWith("_"));
    } catch {
      // validateAlcance ya informa el JSON roto.
    }
  }
  const preguntas = join(root, "_investigacion", "preguntas.md");
  if (existsSync(preguntas)) ctx.preguntas = parsePreguntas(readFileSync(preguntas, "utf8"));
  for (const f of mdIn(join(root, "referencias"))) {
    const fm = parseFrontmatter(readFileSync(join(root, "referencias", f), "utf8"));
    if (!("error" in fm) && fm.data.tipo !== "conexion") {
      ctx.slugs.add(f.slice(0, -3));
      ctx.fuentesDe.set(f.slice(0, -3), lista(fm.data.fuentes));
    }
  }
  return ctx;
}

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Cobertura por etapa (cada nota cuenta en la primera etapa de su `etapa:`): referencias y conexiones listas (válidas, aplican a la cuenta, `revisado` desde
 * DESDE_ETAPAS y de hace ≤ 60 días respecto de `hoy`) y preguntas que ninguna nota lista en `responde`.
 */
export function cobertura(root, hoy) {
  const ctx = contexto(root);
  const etapas = ctx.etapas ?? ETAPAS;
  const cuenta = new Map(etapas.map((e) => [e, { referencias: 0, conexiones: 0 }]));
  const respondidas = new Set();
  for (const f of mdIn(join(root, "referencias"))) {
    const text = readFileSync(join(root, "referencias", f), "utf8");
    const fm = parseFrontmatter(text);
    if ("error" in fm) continue;
    const { data, body } = fm;
    for (const r of lista(data.responde)) respondidas.add(r);
    const aud = seccion(body, "Para la audiencia");
    const lista_ =
      validDate(data.revisado) && data.revisado >= DESDE_ETAPAS && diasEntre(data.revisado, hoy) <= VIGENCIA_DIAS &&
      aud !== undefined && !NO_APLICA_RE.test(aud) && !validateReferencia(text, { ...ctx, slugPropio: f.slice(0, -3) }).length;
    if (!lista_) continue;
    // Cuenta en su primera etapa: declarar varias no infla la cobertura.
    const c = cuenta.get(lista(data.etapa)[0]);
    if (c) c[data.tipo === "conexion" ? "conexiones" : "referencias"]++;
  }
  return {
    etapas: etapas.map((etapa) => {
      const { referencias, conexiones } = cuenta.get(etapa);
      return { etapa, referencias, conexiones, falta: referencias < META_REFERENCIAS || conexiones < META_CONEXIONES };
    }),
    preguntasPendientes: ctx.preguntas.filter((p) => !respondidas.has(p)),
    preguntasInvalidas: existsSync(join(root, "_investigacion", "preguntas.md"))
      ? lineasPreguntas(readFileSync(join(root, "_investigacion", "preguntas.md"), "utf8")).invalidas
      : [],
  };
}

const sinCitas = (t) =>
  t
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\s?(?<!\[)\[\d+\](?![\](])/g, "")
    .replace(/\s?\(?https?:\/\/\S+\)?/g, "");

/**
 * Mensaje exacto para el subagente lector aprendiz: la sección "## Para el lector" de lector-aprendiz.md
 * y solo «Dicho simple» y «Qué se puede hacer» de la nota, sin citas, URLs, nombre ni tema.
 */
export function mensajeAprendiz(nota, lector) {
  const fm = parseFrontmatter(nota);
  if ("error" in fm) throw new Error(fm.error);
  const aud = seccion(fm.body, "Para la audiencia");
  const dicho = aud === undefined ? undefined : rotulo(aud, ROTULO_DICHO);
  const hacer = aud === undefined ? undefined : rotulo(aud, "Qué se puede hacer");
  if (dicho === undefined || hacer === undefined) throw new Error(`la nota no tiene "- **${ROTULO_DICHO}:**" y "- **Qué se puede hacer:**" en "## Para la audiencia"`);
  const para = seccion(lector, "Para el lector");
  if (para === undefined) throw new Error('lector-aprendiz.md no tiene "## Para el lector"');
  return [
    "=== MENSAJE PARA EL LECTOR APRENDIZ ===",
    para.trim(),
    "",
    "### El texto",
    "",
    sinCitas(dicho),
    "",
    sinCitas(hacer),
    "=== FIN ===",
  ].join("\n");
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
  const ctx = contexto(root);
  for (const f of mdIn(join(root, "referencias"))) {
    if (touched(`referencias/${f}`)) {
      add(`referencias/${f}`, validateReferencia(readFileSync(join(root, "referencias", f), "utf8"), { ...ctx, slugPropio: f.slice(0, -3) }));
    }
  }
  for (const f of mdIn(join(root, "temas"))) {
    if (touched(`temas/${f}`)) add(`temas/${f}`, validateTopicBlock(readFileSync(join(root, "temas", f), "utf8")));
  }
  const alcance = join(root, "_investigacion", "alcance.json");
  if (existsSync(alcance)) add("_investigacion/alcance.json", validateAlcance(readFileSync(alcance, "utf8")));
  const resumenes = mdIn(join(root, "_investigacion", "resumenes")).sort((a, b) => summaryKey(a).localeCompare(summaryKey(b)));
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
const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

if (process.argv[1] && real(process.argv[1]) === real(self)) {
  const root = join(dirname(self), "..");
  const arg = (f) => {
    const i = process.argv.indexOf(f);
    return i > -1 ? process.argv[i + 1] ?? "" : undefined;
  };
  if (arg("--aprendiz") !== undefined) {
    const slug = arg("--aprendiz").replace(/\.md$/, "").replace(/^referencias\//, "");
    try {
      console.log(mensajeAprendiz(readFileSync(join(root, "referencias", `${slug}.md`), "utf8"), readFileSync(join(root, "_investigacion", "lector-aprendiz.md"), "utf8")));
    } catch (e) {
      console.error(`✗ ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  } else if (process.argv.includes("--cobertura")) {
    const c = cobertura(root, hoyChile());
    for (const e of c.etapas) {
      console.log(`${e.etapa} · ${e.referencias}/${META_REFERENCIAS} referencias · ${e.conexiones}/${META_CONEXIONES} conexiones${e.falta ? " · FALTA" : " · ok"}`);
    }
    console.log(c.preguntasPendientes.length ? `Preguntas pendientes:\n${c.preguntasPendientes.map((p) => `  - ${p}`).join("\n")}` : "Preguntas pendientes: ninguna");
    if (c.preguntasInvalidas.length) {
      console.log(`Líneas de preguntas.md que no se entienden (formato "- AAAA-MM-DD · <etapa> · <pregunta>", etapa en minúsculas: ${ETAPAS.join(", ")}); nómbralas en el resumen:\n${c.preguntasInvalidas.map((p) => `  - ${p}`).join("\n")}`);
    }
  } else {
    main(root, arg("--desde"));
  }
}
