#!/usr/bin/env node
// Validador del calendario semanal (sin dependencias: corre con node a secas).
//
//   node _calendario/validar.mjs <semana>     valida _calendario/<semana>/plan.json y sus borradores
//   node _calendario/validar.mjs --self-test  valida config.json y el ejemplo embebido (lo usa el instalador)
//
// Sale con código 0 y ✓ si todo cumple; si no, con código 1 y una línea `<id>: <motivo>`
// por problema. Ante entradas raras (JSON roto, tipos equivocados, rutas hostiles)
// devuelve errores: nunca lanza una excepción sin capturar.
//
// Lo escribe el usuario (scripts/kb-calendario-install.sh); el agente planificador
// lo corre pero nunca lo modifica.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Catálogo de plantillas y sus props: copia de `TEMPLATE_CATALOG` en
 * `src/remix/templates-catalog.ts` del repo de código (un test compara ambos).
 * `StoryCover` no está: la usa solo el motor, nunca el agente.
 */
export const CATALOGO = {
  Hook: { required: ["title"], optional: ["eyebrow", "highlight", "mark", "subtitle", "titleSize", "swipe"] },
  Lead: { required: ["text"], optional: ["kicker", "highlight"] },
  Step: { required: ["heading"], optional: ["step", "highlight", "body", "bullets"] },
  Prompt: { required: ["heading", "prompt"], optional: ["note"] },
  MythReality: { required: ["myth", "reality"], optional: ["mythLabel", "realityLabel"] },
  Stat: { required: ["value", "label"], optional: ["context"] },
  Cta: { required: ["title"], optional: ["highlight", "reason", "handle", "cta", "ctaIcon"] },
};

/** Plantillas que puede usar un borrador. */
export const PLANTILLAS = new Set(Object.keys(CATALOGO));

/**
 * Props comunes que el agente sí puede poner. El resto de las de marca (color,
 * fuente, formato, índice…) las fija el motor: el look lima no se toca.
 */
const PROPS_BASE = new Set(["source", "pillar"]);

/** Tipo de cada prop que no es texto. */
const TIPO_PROP = { bullets: "lista", titleSize: "numero", swipe: "booleano" };

/** Plantilla → prop donde debe aparecer su `highlight`. */
const DONDE_HIGHLIGHT = { Hook: "title", Step: "heading", Lead: "text", Cta: "title" };

const SENALES = ["guardados", "envios", "comentarios", "retencion"];
const FORMATOS = ["reel", "carrusel"];
const PACES = ["ensenar", "rapido"];
const RESPALDOS = ["skill", "supuesto", "base"];
const CAMPOS_BORRADOR = new Set(["name", "angle", "pillar", "slides", "pace", "audio", "logoEnCuadro0"]);
const CAMPOS_SLIDE = new Set(["template", "props", "pillar", "background"]);
const CAMPOS_FONDO = new Set(["ai", "overlay", "brandStyle"]);
/** Variables de experimento fijas (más cualquier parámetro de `config.puerta`). */
const VARIABLES_FIJAS = ["tema", "arquetipo", "hora", "duracion", "hook"];

/** El id se usa como nombre de carpeta en el servidor. */
const ID_RE = /^[a-z0-9-]{3,80}$/;
const HORA_RE = /^([01]\d|2[0-3]):(00|30)$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const AUDIO_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,120}$/;
const HASHTAG_RE = /^#[a-z0-9_]+$/;
const MAX_SLIDES = 10;

/** Props con texto de título (límite `tituloMaxPalabras`). */
const CAMPOS_TITULO = ["title", "heading"];
/** Props con texto de cuerpo (límite `cuerpoMaxPalabras`). */
const CAMPOS_CUERPO = ["body", "text", "subtitle", "reason", "context", "myth", "reality", "note"];
/**
 * Props que no pasan por las reglas de lenguaje (siglas, relleno, términos):
 * la cita al pie, el prompt copiable (es para pegarlo en una IA, no para leerlo)
 * y los datos de marca.
 */
const SIN_REGLAS_DE_LENGUAJE = new Set(["source", "prompt", "handle", "ctaIcon", "pillar"]);

/** Valores por defecto de la puerta si `config.puerta` no trae alguno. */
const PUERTA_DEFECTO = {
  tituloMaxPalabras: 12,
  bulletMaxPalabras: 12,
  cuerpoMaxPalabras: 30,
  terminosTecnicosMax: 1,
  siglasPermitidas: ["GPT", "PDF", "IA", "DM"],
  relleno: ["increíble", "brutal", "realmente", "básicamente", "la verdad", "muy"],
  hookUmbral: 8,
  lecturaPalabrasPorSegundo: 2.5,
  lecturaMinSegundos: 1.5,
  reescriturasMax: 3,
  logoEnCuadro0: true,
};

// --- utilidades -------------------------------------------------------------

const esObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const esTexto = (x) => typeof x === "string" && x.trim() !== "";
const q = (x) => JSON.stringify(x) ?? String(x);

/** Sin tildes y en minúsculas (para comparar palabras). */
export const normalizar = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Palabras visibles de un texto. */
const palabras = (s) => String(s).split(/\s+/).filter(Boolean);
/** Palabras normalizadas, sin puntuación (para buscar términos y relleno). */
const tokens = (s) => normalizar(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
/** Como compara el motor (`highlightText`): sin distinguir mayúsculas, pero sí tildes. */
const minus = (s) => String(s).normalize("NFC").toLowerCase();

/** ¿Aparece la frase `frase` (tokens) en `ts`? Acepta plural en la última palabra. */
function contieneFrase(ts, frase) {
  const f = tokens(frase);
  if (!f.length) return false;
  const ultima = f[f.length - 1];
  for (let i = 0; i + f.length <= ts.length; i++) {
    let ok = true;
    for (let j = 0; j < f.length && ok; j++) {
      const t = ts[i + j];
      ok = j === f.length - 1 ? t === ultima || t === `${ultima}s` || t === `${ultima}es` : t === f[j];
    }
    if (ok) return true;
  }
  return false;
}

function fechaValida(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** 0 = domingo … 6 = sábado (fecha de calendario, sin zona). */
const diaSemana = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
const sumarDias = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** Minutos de reloj local desde 1970 (para medir separación entre piezas). */
const minutosLocales = (dia, hora) => {
  const [y, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60_000;
};

/** Valor de un parámetro de la puerta (`config.puerta.<k>.valor`), con respaldo por defecto. */
function puerta(config, k) {
  const p = esObj(config) && esObj(config.puerta) ? config.puerta[k] : undefined;
  return esObj(p) && p.valor !== undefined ? p.valor : PUERTA_DEFECTO[k];
}
const lista = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);

/** Lee un JSON: `{ data }` o `{ error }` (nunca lanza). Un BOM inicial es error. */
function leerJson(path) {
  try {
    if (!existsSync(path)) return { error: "no existe" };
    if (!statSync(path).isFile()) return { error: "no es un archivo" };
    const text = readFileSync(path, "utf8");
    if (text.charCodeAt(0) === 0xfeff) return { error: "empieza con BOM: guárdalo como UTF-8 sin BOM" };
    return { data: JSON.parse(text) };
  } catch (e) {
    return { error: `no se pudo leer como JSON (${e instanceof Error ? e.message : e})` };
  }
}

/** Corre `fn` y convierte cualquier excepción en un error de la lista. */
function seguro(fn) {
  try {
    return fn();
  } catch (e) {
    return [`error interno del validador: ${e instanceof Error ? e.message : String(e)}`];
  }
}

// --- tiempo de lectura (copia del motor) ------------------------------------

/**
 * COPIA de `sceneSeconds` y `textChars` de `src/reel/timing.ts` (repo de código):
 * cuántos segundos muestra el motor cada escena del reel. Si cambias allá,
 * cambia aquí; `test/calendario/validar.ts` compara ambas en 20 escenas.
 */
const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note", "value", "label", "context", "prompt"];
const PACE_ENSENAR = { stagger: 1.8 };
const HOOK_MAX_SECONDS = 5.0;
const BULLET_LEAD = 1.0;
const BULLET_TAIL = 2.5;

function textChars(props) {
  let chars = 0;
  for (const k of TEXT_KEYS) {
    const v = props[k];
    if (typeof v === "string") chars += v.length;
    else if (Array.isArray(v)) chars += v.filter((x) => typeof x === "string").join(" ").length;
  }
  return chars;
}

/** Segundos que el motor muestra una escena (misma fórmula que `sceneSeconds`). */
export function segundosEscena(props, hold, pace = "ensenar", hook = false) {
  const chars = textChars(props);
  if (pace === "rapido") {
    const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
    return +(s + (hold ? 0.7 : 0)).toFixed(2);
  }
  const text = Math.min(8, Math.max(3.5, 2.4 + chars / 16)) + (hold ? 1.0 : 0);
  const bullets = Array.isArray(props.bullets) ? props.bullets.filter((x) => typeof x === "string").length : 0;
  const forBullets = bullets > 0 ? BULLET_LEAD + PACE_ENSENAR.stagger * (bullets - 1) + BULLET_TAIL : 0;
  const s = Math.max(text, forBullets);
  return +(hook ? Math.min(HOOK_MAX_SECONDS, s) : s).toFixed(2);
}

/** Palabras que hay que leer en una escena (las mismas props que mide el motor). */
function palabrasEscena(props) {
  let n = 0;
  for (const k of TEXT_KEYS) {
    const v = props[k];
    if (typeof v === "string") n += palabras(v).length;
    else if (Array.isArray(v)) n += v.filter((x) => typeof x === "string").reduce((a, x) => a + palabras(x).length, 0);
  }
  return n;
}

// --- reglas de texto --------------------------------------------------------

const SIGLA_RE = /(?<![\p{L}\p{N}])(\p{Lu}{2,})s?(?![\p{L}\p{N}])/gu;
const SIGLA_PUNTOS_RE = /(?<![\p{L}\p{N}])(?:\p{L}\.){2,}/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
/** "Comenta PALABRA": la palabra clave del CTA va en mayúsculas y no es una sigla. */
const ANTES_DE_PALABRA_CLAVE = /(comenta|comentame|escribe|escribeme|responde)\s*["«“']?\s*$/;

/** Textos de un slide sujetos a reglas de lenguaje: [prop, texto]. */
function textosDeLenguaje(props) {
  const out = [];
  for (const [k, v] of Object.entries(props)) {
    if (SIN_REGLAS_DE_LENGUAJE.has(k)) continue;
    if (typeof v === "string") out.push([k, v]);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") out.push([k, x]);
  }
  return out;
}

/** Siglas no permitidas en un texto (y siglas con puntos). */
function siglasProhibidas(texto, permitidas) {
  const malas = [];
  for (const m of texto.matchAll(SIGLA_RE)) {
    if (permitidas.has(m[1])) continue;
    if (ANTES_DE_PALABRA_CLAVE.test(normalizar(texto.slice(0, m.index)))) continue;
    malas.push(m[1]);
  }
  for (const m of texto.matchAll(SIGLA_PUNTOS_RE)) malas.push(m[0]);
  return malas;
}

/** Relleno presente en un texto. */
const rellenoEn = (texto, relleno) => {
  const ts = tokens(texto);
  return relleno.filter((r) => {
    const f = tokens(r);
    for (let i = 0; i + f.length <= ts.length; i++) if (f.every((w, j) => ts[i + j] === w)) return true;
    return false;
  });
};

/** Términos técnicos (de `config.terminosTecnicos`) presentes en un texto. */
const terminosEn = (texto, config) => {
  const ts = tokens(texto);
  return lista(esObj(config) ? config.terminosTecnicos : []).filter((t) => contieneFrase(ts, t));
};

/**
 * Reglas duras de texto de un borrador: longitudes, siglas, relleno, términos
 * técnicos, emojis en títulos y, si `formato` es "reel", tiempo de lectura de
 * cada escena contra lo que da el motor. No revisa la forma del borrador (eso es
 * `validarBorrador`): lo que no entiende lo salta.
 */
export function reglasDeTexto(borrador, config, formato) {
  return seguro(() => {
    if (!esObj(borrador) || !Array.isArray(borrador.slides)) return [];
    const errs = [];
    const tituloMax = puerta(config, "tituloMaxPalabras");
    const bulletMax = puerta(config, "bulletMaxPalabras");
    const cuerpoMax = puerta(config, "cuerpoMaxPalabras");
    const permitidas = new Set(lista(puerta(config, "siglasPermitidas")));
    const relleno = lista(puerta(config, "relleno"));
    const terminos = new Set();
    const slides = borrador.slides;
    slides.forEach((slide, i) => {
      if (!esObj(slide) || !esObj(slide.props)) return;
      const p = slide.props;
      const donde = `slide ${i + 1} (${typeof slide.template === "string" ? slide.template : "?"})`;
      for (const k of CAMPOS_TITULO) {
        if (typeof p[k] !== "string") continue;
        const n = palabras(p[k]).length;
        if (n > tituloMax) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${tituloMax}, puerta.tituloMaxPalabras)`);
      }
      for (const k of [...CAMPOS_TITULO, "highlight"]) {
        if (typeof p[k] === "string" && EMOJI_RE.test(p[k])) errs.push(`${donde}: ${k} lleva un emoji (los títulos van sin emojis)`);
      }
      if (Array.isArray(p.bullets)) {
        p.bullets.forEach((b, j) => {
          if (typeof b !== "string") return;
          const n = palabras(b).length;
          if (n > bulletMax) errs.push(`${donde}: el bullet ${j + 1} tiene ${n} palabras (máximo ${bulletMax}, puerta.bulletMaxPalabras)`);
        });
      }
      for (const k of CAMPOS_CUERPO) {
        if (typeof p[k] !== "string") continue;
        const n = palabras(p[k]).length;
        if (n > cuerpoMax) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${cuerpoMax}, puerta.cuerpoMaxPalabras)`);
      }
      for (const [k, texto] of textosDeLenguaje(p)) {
        for (const s of new Set(siglasProhibidas(texto, permitidas))) {
          errs.push(`${donde}: ${k} usa la sigla "${s}" (permitidas: ${[...permitidas].join(", ")}; puerta.siglasPermitidas; sin puntos)`);
        }
        for (const r of rellenoEn(texto, relleno)) errs.push(`${donde}: ${k} tiene relleno "${r}" (puerta.relleno)`);
        for (const t of terminosEn(texto, config)) terminos.add(t);
      }
    });
    const maxTerminos = puerta(config, "terminosTecnicosMax");
    if (terminos.size > maxTerminos) {
      errs.push(`la pieza usa ${terminos.size} términos técnicos (${[...terminos].join(", ")}); máximo ${maxTerminos} (puerta.terminosTecnicosMax), explicado en 3 palabras`);
    }
    if (formato === "reel") {
      const pace = PACES.includes(borrador.pace) ? borrador.pace : "ensenar";
      const wps = puerta(config, "lecturaPalabrasPorSegundo");
      const minS = puerta(config, "lecturaMinSegundos");
      const ultima = slides.length - 1;
      slides.forEach((slide, i) => {
        if (!esObj(slide) || !esObj(slide.props)) return;
        const n = palabrasEscena(slide.props);
        const necesita = Math.max(minS, n / wps);
        const da = segundosEscena(slide.props, i === 0 || i === ultima, pace, i === 0);
        if (necesita > da + 1e-9) {
          errs.push(
            `slide ${i + 1}: ${n} palabras necesitan ${necesita.toFixed(1)} segundos de lectura y el reel la muestra ${da} s (puerta.lecturaPalabrasPorSegundo = ${wps}; acorta el texto)`,
          );
        }
      });
    }
    return errs;
  });
}

// --- caption ----------------------------------------------------------------

/**
 * Reglas del caption: primera línea con una palabra (≥ 4 letras) del `tema`
 * (si se pasa), 3–5 hashtags contados en todo el texto (los de
 * `config.hashtagsBase` + 0–2 del tema), en minúsculas y sin tildes, separados
 * por espacios; sin "primer comentario" ni relleno.
 */
export function validarCaption(caption, config, tema) {
  return seguro(() => {
    if (!esTexto(caption)) return ["falta caption (texto)"];
    const errs = [];
    const primera = caption.split(/\r?\n/)[0];
    if (typeof tema === "string") {
      const delTema = tokens(tema).filter((w) => w.length >= 4);
      const enLinea = tokens(primera);
      const coincide = delTema.some((w) => enLinea.some((t) => t === w || t === `${w}s` || t === `${w}es` || w === `${t}s` || w === `${t}es`));
      if (delTema.length && !coincide) {
        errs.push(`la primera línea del caption debe llevar una palabra del tema (${delTema.join(", ")}) para el buscador de Instagram`);
      }
    }
    const total = (caption.match(/#/g) ?? []).length;
    if (total < 3 || total > 5) errs.push(`el caption tiene ${total} hashtags: deben ser 3 a 5 (config.hashtagsBase + 0-2 del tema)`);
    const vistos = new Set();
    for (const t of caption.split(/\s+/).filter((x) => x.includes("#"))) {
      if (!HASHTAG_RE.test(t)) {
        errs.push(`hashtag mal formado "${t}": en minúsculas, sin tildes ni signos, separado por espacios`);
        continue;
      }
      if (vistos.has(t)) errs.push(`hashtag repetido ${t}`);
      vistos.add(t);
    }
    for (const b of lista(esObj(config) ? config.hashtagsBase : [])) {
      if (!vistos.has(b)) errs.push(`falta el hashtag base ${b} (config.hashtagsBase)`);
    }
    if (normalizar(caption).includes("primer comentario")) errs.push('el caption no puede mandar al "primer comentario"');
    for (const r of rellenoEn(caption, lista(puerta(config, "relleno")))) errs.push(`el caption tiene relleno "${r}" (puerta.relleno)`);
    return errs;
  });
}

// --- borrador ---------------------------------------------------------------

/** Fondos `ai` válidos de una lista de borradores. */
export function contarFondosIA(borradores) {
  if (!Array.isArray(borradores)) return 0;
  let n = 0;
  for (const b of borradores) {
    if (!esObj(b) || !Array.isArray(b.slides)) continue;
    for (const s of b.slides) if (esObj(s) && esObj(s.background) && esTexto(s.background.ai)) n++;
  }
  return n;
}

/** Errores de los campos de planificación de una pieza (los que exige la puerta). */
function erroresDePieza(p, config) {
  const errs = [];
  const id = p.id;
  if (typeof id !== "string" || !ID_RE.test(id)) errs.push(`id ${q(id)} inválido: debe cumplir ^[a-z0-9-]{3,80}$ (minúsculas, números y guiones; es el nombre de la carpeta)`);
  else if (p.borrador !== `${id}.json`) errs.push(`borrador ${q(p.borrador)} inválido: debe ser exactamente "${id}.json"`);
  if (!FORMATOS.includes(p.formato)) errs.push(`formato ${q(p.formato)} inválido (usa: ${FORMATOS.join(", ")})`);
  if (!esTexto(p.arquetipo)) errs.push("falta arquetipo");
  if (p.senal === undefined || p.senal === null || p.senal === "") errs.push("falta senal (señal objetivo: sin señal no hay pieza)");
  else if (!SENALES.includes(p.senal)) errs.push(`senal ${q(p.senal)} inválida (usa: ${SENALES.join(", ")})`);
  const emo = p.emocion;
  if (!(esTexto(emo) || (Array.isArray(emo) && emo.length > 0 && emo.every(esTexto)))) errs.push("falta emocion (la emoción que busca la pieza)");
  if (!esTexto(p.entregable)) errs.push("falta entregable (qué se lleva el espectador)");
  if (!esTexto(p.fraseAmigo)) errs.push("falta fraseAmigo (cómo se lo contaría a un amigo en una línea)");
  else {
    const t = terminosEn(p.fraseAmigo, config);
    if (t.length) errs.push(`fraseAmigo usa términos técnicos (${t.join(", ")}): reescríbela como se lo dirías a alguien que no sabe de IA`);
  }
  if (!esTexto(p.tema)) errs.push("falta tema");
  const pilares = lista(esObj(config) ? config.pilares : []);
  if (!pilares.includes(p.pilar)) errs.push(`pilar ${q(p.pilar)} inválido (usa: ${pilares.join(", ")})`);
  const umbral = puerta(config, "hookUmbral");
  if (!esObj(p.hook) || !esTexto(p.hook.categoria) || !esTexto(p.hook.texto)) errs.push("hook incompleto: { categoria, texto, score }");
  else if (typeof p.hook.score !== "number" || !Number.isFinite(p.hook.score) || p.hook.score < umbral) {
    errs.push(`hook.score ${q(p.hook.score)} bajo el umbral ${umbral} (puerta.hookUmbral, en cada criterio)`);
  }
  if (!esObj(p.lectorFrio) || p.lectorFrio.resultado !== "ok") {
    errs.push(`lectorFrio.resultado debe ser exactamente "ok" (es ${q(esObj(p.lectorFrio) ? p.lectorFrio.resultado : p.lectorFrio)})`);
  } else if (!Number.isInteger(p.lectorFrio.intentos) || p.lectorFrio.intentos < 1) {
    errs.push(`lectorFrio.intentos ${q(p.lectorFrio.intentos)} inválido (entero ≥ 1)`);
  }
  if (!esObj(p.origen) || ![p.origen.fichas, p.origen.referencias].every((x) => Array.isArray(x) && x.every((v) => typeof v === "string"))) {
    errs.push("origen inválido: { fichas: [...], referencias: [...] }");
  } else if (p.origen.fichas.length + p.origen.referencias.length === 0) errs.push("origen vacío: cita al menos una ficha o referencia de la base");
  if (p.derivadoDe !== undefined && p.derivadoDe !== null && !esTexto(p.derivadoDe)) errs.push("derivadoDe debe ser null o el id de la pieza ganadora");
  if (p.estado !== undefined && p.estado !== "planificado") errs.push(`estado ${q(p.estado)}: el planificador solo escribe "planificado"`);
  if (p.parametros !== undefined && !esObj(p.parametros)) errs.push("parametros debe ser un objeto");
  errs.push(...validarCaption(p.caption, config, typeof p.tema === "string" ? p.tema : undefined));
  return errs;
}

/** Errores de tipo de una prop. */
function tipoDeProp(k, v) {
  const tipo = TIPO_PROP[k] ?? "texto";
  if (tipo === "lista") return Array.isArray(v) && v.length > 0 && v.every(esTexto) ? undefined : "debe ser una lista de textos";
  if (tipo === "numero") return typeof v === "number" && Number.isFinite(v) ? undefined : "debe ser un número";
  if (tipo === "booleano") return typeof v === "boolean" ? undefined : "debe ser true o false";
  return typeof v === "string" ? undefined : "debe ser texto";
}

/** Errores de forma del borrador (`VariationDraft` + pace/audio/logoEnCuadro0). */
function erroresDeBorrador(b, p, config) {
  const errs = [];
  for (const k of Object.keys(b)) if (!CAMPOS_BORRADOR.has(k)) errs.push(`campo desconocido en el borrador: ${q(k)}`);
  if (typeof p.id === "string" && b.name !== p.id) errs.push(`name ${q(b.name)} debe ser igual al id ("${p.id}")`);
  if (!esTexto(b.angle)) errs.push("falta angle");
  const pilares = lista(esObj(config) ? config.pilares : []);
  if (!pilares.includes(b.pillar)) errs.push(`pillar ${q(b.pillar)} inválido (usa: ${pilares.join(", ")})`);
  else if (b.pillar !== p.pilar) errs.push(`pillar "${b.pillar}" no coincide con el pilar de la pieza (${q(p.pilar)})`);
  if (b.pace !== undefined && !PACES.includes(b.pace)) errs.push(`pace ${q(b.pace)} inválido (usa: ${PACES.join(", ")})`);
  if (b.logoEnCuadro0 !== undefined && typeof b.logoEnCuadro0 !== "boolean") errs.push("logoEnCuadro0 debe ser true o false");
  const audioSeguro = typeof b.audio === "string" && AUDIO_RE.test(b.audio) && !b.audio.includes("..");
  if (p.formato === "reel") {
    if (b.audio === undefined) errs.push("el reel no tiene audio: elige una pista de config.audios");
    else if (!audioSeguro) errs.push(`audio ${q(b.audio)} inválido: solo el nombre de una pista de config.audios, sin rutas`);
    else if (!lista(esObj(config) ? config.audios : []).includes(b.audio)) errs.push(`audio "${b.audio}" no está en config.audios`);
  } else if (b.audio !== undefined && !audioSeguro) {
    errs.push(`audio ${q(b.audio)} inválido: solo el nombre de una pista, sin rutas`); // en carrusel se ignora, pero no con rutas
  }
  if (!Array.isArray(b.slides)) {
    errs.push("slides debe ser una lista de slides");
    return errs;
  }
  const n = b.slides.length;
  if (n > MAX_SLIDES) errs.push(`el borrador tiene ${n} slides (máximo ${MAX_SLIDES}, límite de la API de Instagram)`);
  if (n < 2) errs.push(`el borrador tiene ${n} slides (mínimo 2: Hook y Cta)`);
  let hayFuente = false;
  b.slides.forEach((s, i) => {
    const donde = `slide ${i + 1}`;
    if (!esObj(s)) {
      errs.push(`${donde} está vacía o no es un objeto`);
      return;
    }
    for (const k of Object.keys(s)) if (!CAMPOS_SLIDE.has(k)) errs.push(`${donde}: campo desconocido ${q(k)}`);
    if (typeof s.template !== "string" || !PLANTILLAS.has(s.template)) {
      errs.push(`${donde}: plantilla ${q(s.template)} no permitida (usa: ${[...PLANTILLAS].join(", ")})`);
      return;
    }
    const t = s.template;
    const cat = CATALOGO[t];
    if (s.pillar !== undefined && !pilares.includes(s.pillar)) errs.push(`${donde} (${t}): pillar ${q(s.pillar)} inválido`);
    if (!esObj(s.props)) {
      errs.push(`${donde} (${t}): props debe ser un objeto`);
      return;
    }
    const permitidas = new Set([...cat.required, ...cat.optional, ...PROPS_BASE]);
    for (const [k, v] of Object.entries(s.props)) {
      if (!permitidas.has(k)) {
        errs.push(`${donde} (${t}): prop ${q(k)} no permitida en ${t} (usa: ${[...permitidas].join(", ")})`);
        continue;
      }
      const e = tipoDeProp(k, v);
      if (e) errs.push(`${donde} (${t}): ${k} ${e}`);
    }
    for (const k of cat.required) {
      const v = s.props[k];
      if (v === undefined || (typeof v === "string" && !v.trim())) errs.push(`${donde} (${t}): falta ${k}`);
    }
    if (esTexto(s.props.source)) hayFuente = true;
    // highlight: el motor lo busca sin distinguir mayúsculas, pero con tildes exactas.
    const campo = DONDE_HIGHLIGHT[t];
    const hl = s.props.highlight;
    if (t === "Hook" && !esTexto(hl)) errs.push(`${donde} (Hook): falta highlight (la palabra clave que se pinta en lima)`);
    else if (campo && hl !== undefined && typeof s.props[campo] === "string" && typeof hl === "string") {
      if (!hl.trim() || !minus(s.props[campo]).includes(minus(hl))) {
        errs.push(`${donde} (${t}): el highlight ${q(hl)} no aparece tal cual en ${campo} (mismas tildes)`);
      }
    }
    if (s.background !== undefined) {
      const bg = s.background;
      if (!esObj(bg)) errs.push(`${donde} (${t}): background debe ser un objeto { ai }`);
      else {
        for (const k of Object.keys(bg)) if (!CAMPOS_FONDO.has(k)) errs.push(`${donde} (${t}): background.${k} no permitido (solo fondos ai; el look lima pone el resto)`);
        if (!esTexto(bg.ai)) errs.push(`${donde} (${t}): background.ai debe ser un texto (la descripción de la imagen)`);
        else if (t !== "Hook" && t !== "Cta") errs.push(`${donde} (${t}): fondo ai solo en Hook o Cta`);
        if (bg.brandStyle !== undefined && bg.brandStyle !== true) errs.push(`${donde} (${t}): brandStyle ${q(bg.brandStyle)} no permitido (el fondo ai siempre lleva el estilo de marca)`);
        if (bg.overlay !== undefined && !(typeof bg.overlay === "number" && bg.overlay >= 0 && bg.overlay <= 1)) errs.push(`${donde} (${t}): background.overlay debe ser un número entre 0 y 1`);
      }
    }
  });
  const plantillas = b.slides.map((s) => (esObj(s) ? s.template : undefined));
  if (plantillas[0] !== "Hook") errs.push("la primera slide debe ser un Hook (la promesa va en la portada)");
  if (plantillas.filter((t) => t === "Hook").length > 1) errs.push("solo puede haber un Hook");
  if (n >= 2 && plantillas[n - 1] !== "Cta") errs.push("la última slide debe ser un Cta (un solo gesto)");
  if (!hayFuente) errs.push("falta source: cita al pie la ficha o referencia de origen en alguna slide");
  return errs;
}

/**
 * Errores de una pieza del plan y su borrador ([] = válida). Los mensajes no
 * llevan el id: `validarSemana` lo antepone.
 */
export function validarBorrador(pieza, borrador, config) {
  return seguro(() => {
    if (!esObj(pieza)) return ["la pieza no es un objeto"];
    const errs = erroresDePieza(pieza, config);
    if (!esObj(borrador)) return [...errs, "el borrador no es un objeto JSON"];
    errs.push(...erroresDeBorrador(borrador, pieza, config));
    errs.push(...reglasDeTexto(borrador, config, pieza.formato));
    return errs;
  });
}

// --- plan -------------------------------------------------------------------

/**
 * Errores del plan de la semana: fechas dentro de la semana (sin domingo),
 * horas en :00/:30 dentro de la ventana, separación mínima, mix, temas sin
 * repetir (salvo derivados), ids únicos y experimento declarado.
 */
export function validarPlan(plan, config) {
  return seguro(() => {
    if (!esObj(plan)) return ["plan: plan.json debe ser un objeto"];
    const errs = [];
    const semana = plan.semana;
    const semanaOk = fechaValida(semana) && diaSemana(semana) === 1;
    if (!semanaOk) errs.push(`plan: semana ${q(semana)} debe ser el lunes de la semana (AAAA-MM-DD)`);
    if (esObj(config) && plan.zona !== config.zona) errs.push(`plan: zona ${q(plan.zona)} debe ser "${config.zona}"`);
    if (plan.motivo !== undefined && typeof plan.motivo !== "string") errs.push("plan: motivo debe ser texto");
    if (!Array.isArray(plan.piezas)) return [...errs, "plan: piezas debe ser una lista"];
    if (plan.piezas.length === 0 && !esTexto(plan.motivo)) errs.push("plan: sin piezas hay que explicar el motivo (campo motivo)");
    const exp = plan.experimento;
    const ids = plan.piezas.map((p) => (esObj(p) && typeof p.id === "string" ? p.id : undefined));
    const vistos = new Set();
    for (const id of ids) {
      if (id === undefined) continue;
      if (vistos.has(id)) errs.push(`${id}: id repetido`);
      vistos.add(id);
    }
    const mix = esObj(config) && Array.isArray(config.mix) ? config.mix.filter(esObj) : [];
    const [desde, hasta] = esObj(config) && Array.isArray(config.ventanaHoras) ? config.ventanaHoras : ["08:00", "23:00"];
    const conHora = [];
    const temas = new Map();
    plan.piezas.forEach((p, i) => {
      if (!esObj(p)) {
        errs.push(`pieza ${i + 1}: no es un objeto`);
        return;
      }
      const id = typeof p.id === "string" && p.id ? p.id : `pieza ${i + 1}`;
      const diaOk = fechaValida(p.dia);
      if (!diaOk) errs.push(`${id}: dia ${q(p.dia)} inválido (AAAA-MM-DD)`);
      else if (semanaOk && (p.dia < semana || p.dia > sumarDias(semana, 6))) errs.push(`${id}: dia ${p.dia} fuera de la semana ${semana}…${sumarDias(semana, 6)}`);
      else if (diaSemana(p.dia) === 0) errs.push(`${id}: el domingo es de descanso`);
      const horaOk = typeof p.hora === "string" && HORA_RE.test(p.hora);
      if (!horaOk) errs.push(`${id}: hora ${q(p.hora)} inválida (HH:MM en :00 o :30, hora de Chile)`);
      else if (p.hora < desde || p.hora > hasta) errs.push(`${id}: hora ${p.hora} fuera de la ventana ${desde}–${hasta} (config.ventanaHoras)`);
      if (diaOk && horaOk) conHora.push({ id, min: minutosLocales(p.dia, p.hora) });
      if (diaOk && diaSemana(p.dia) !== 0) {
        const m = mix.find((x) => x.dia === diaSemana(p.dia));
        if (!m) errs.push(`${id}: config.mix no tiene entrada para ese día`);
        else {
          if (p.formato !== m.formato) errs.push(`${id}: formato ${q(p.formato)} no sigue el mix (ese día va ${m.formato})`);
          const enExperimento = esObj(exp) && exp.variable === "arquetipo" && Array.isArray(exp.piezas) && exp.piezas.includes(p.id);
          if (p.arquetipo !== m.arquetipo && !enExperimento) errs.push(`${id}: arquetipo ${q(p.arquetipo)} no sigue el mix (ese día va ${m.arquetipo})`);
        }
      }
      if (typeof p.tema === "string") {
        const clave = tokens(p.tema).join(" ");
        const esDerivado = esTexto(p.derivadoDe);
        if (temas.has(clave) && !esDerivado) errs.push(`${id}: tema repetido en la semana (${p.tema}); solo se repite un tema con derivadoDe`);
        if (!temas.has(clave)) temas.set(clave, id);
      }
    });
    const sep = esObj(config) && typeof config.separacionMinHoras === "number" ? config.separacionMinHoras : 20;
    conHora.sort((a, b) => a.min - b.min);
    for (let i = 1; i < conHora.length; i++) {
      const h = (conHora[i].min - conHora[i - 1].min) / 60;
      if (h < sep) errs.push(`${conHora[i].id}: está a ${h} h de ${conHora[i - 1].id} (mínimo ${sep} h, config.separacionMinHoras)`);
    }
    if (exp === null || exp === undefined) {
      if (plan.piezas.length > 0) errs.push("plan: falta experimento (una variable por semana)");
    } else if (!esObj(exp)) errs.push("plan: experimento debe ser un objeto o null");
    else {
      const variables = [...VARIABLES_FIJAS, ...(esObj(config) && esObj(config.puerta) ? Object.keys(config.puerta) : [])];
      if (!variables.includes(exp.variable)) errs.push(`plan: experimento.variable ${q(exp.variable)} no permitida (usa: ${variables.join(", ")})`);
      if (!esTexto(exp.hipotesis)) errs.push("plan: falta experimento.hipotesis");
      if (!Array.isArray(exp.piezas)) errs.push("plan: experimento.piezas debe ser una lista de ids");
      else for (const x of exp.piezas) if (!vistos.has(x)) errs.push(`plan: experimento.piezas: ${q(x)} no es una pieza del plan`);
    }
    return errs;
  });
}

// --- config -----------------------------------------------------------------

/** Errores de `config.json` (lo edita el usuario). */
export function validarConfig(config) {
  return seguro(() => {
    if (!esObj(config)) return ["config.json debe ser un objeto"];
    const errs = [];
    if (!esTexto(config.zona)) errs.push("zona debe ser un texto (America/Santiago)");
    if (!Array.isArray(config.mix) || config.mix.length !== 6) errs.push("mix debe tener 6 entradas (lunes a sábado)");
    else {
      const dias = new Set();
      config.mix.forEach((m, i) => {
        if (!esObj(m) || !Number.isInteger(m.dia) || m.dia < 1 || m.dia > 6 || !FORMATOS.includes(m.formato) || !esTexto(m.arquetipo)) {
          errs.push(`mix[${i}] inválido: { dia: 1-6, formato: reel|carrusel, arquetipo }`);
        } else if (dias.has(m.dia)) errs.push(`mix: día ${m.dia} repetido`);
        else dias.add(m.dia);
      });
    }
    if (!esObj(config.horasPorDefecto) || !Object.values(config.horasPorDefecto).every((h) => typeof h === "string" && HORA_RE.test(h))) {
      errs.push("horasPorDefecto: cada hora en HH:MM con :00 o :30");
    }
    const v = config.ventanaHoras;
    if (!Array.isArray(v) || v.length !== 2 || !v.every((h) => typeof h === "string" && HHMM_RE.test(h)) || v[0] >= v[1]) errs.push('ventanaHoras debe ser ["HH:MM", "HH:MM"]');
    for (const k of ["separacionMinHoras", "fondosIAMaxSemana", "scoreMin", "umbralAlcanceTasas"]) {
      if (typeof config[k] !== "number" || !Number.isFinite(config[k]) || config[k] < 0) errs.push(`${k} debe ser un número ≥ 0`);
    }
    if (!Array.isArray(config.pilares) || !config.pilares.length || !config.pilares.every(esTexto)) errs.push("pilares debe ser una lista de textos");
    if (!Array.isArray(config.hashtagsBase) || !config.hashtagsBase.every((h) => typeof h === "string" && HASHTAG_RE.test(h))) {
      errs.push("hashtagsBase debe ser una lista de hashtags en minúsculas (#ia)");
    } else if (config.hashtagsBase.length > 5) errs.push("hashtagsBase no puede tener más de 5");
    if (!Array.isArray(config.terminosTecnicos) || !config.terminosTecnicos.every(esTexto)) errs.push("terminosTecnicos debe ser una lista de textos");
    if (!Array.isArray(config.audios) || !config.audios.every((a) => typeof a === "string" && AUDIO_RE.test(a) && !a.includes(".."))) {
      errs.push("audios debe ser una lista de nombres de pista (sin rutas)");
    }
    if (!esObj(config.puerta)) errs.push("falta puerta");
    else {
      for (const k of Object.keys(PUERTA_DEFECTO)) {
        const p = config.puerta[k];
        if (!esObj(p)) {
          errs.push(`puerta.${k} debe ser { valor, respaldo }`);
          continue;
        }
        if (!RESPALDOS.includes(p.respaldo)) errs.push(`puerta.${k}.respaldo debe ser ${RESPALDOS.join(" | ")}`);
        const d = PUERTA_DEFECTO[k];
        const ok = Array.isArray(d)
          ? Array.isArray(p.valor) && p.valor.every(esTexto)
          : typeof d === "number"
            ? typeof p.valor === "number" && Number.isFinite(p.valor) && p.valor > 0
            : typeof p.valor === typeof d;
        if (!ok) errs.push(`puerta.${k}.valor tiene un tipo inválido`);
      }
    }
    return errs;
  });
}

// --- semana -----------------------------------------------------------------

/**
 * Valida la carpeta de una semana (`_calendario/<semana>/`): plan, cada
 * borrador, tope de fondos ai y score léxico. `opts.score(borrador)` devuelve
 * el score o `undefined`; sin `score` no se evalúa y se avisa (no es error).
 * Los avisos van a `opts.avisos` si se pasa; si no, a la consola.
 */
export function validarSemana(dir, config, opts = {}) {
  const avisos = Array.isArray(opts?.avisos) ? opts.avisos : [];
  const errs = seguro(() => {
    const ec = validarConfig(config);
    if (ec.length) return ec.map((e) => `config.json: ${e}`);
    const leido = leerJson(join(dir, "plan.json"));
    if ("error" in leido) return [`plan: plan.json ${leido.error}`];
    const plan = leido.data;
    const out = validarPlan(plan, config);
    if (!esObj(plan) || !Array.isArray(plan.piezas)) return out;
    if (typeof plan.semana === "string" && basename(dir) !== plan.semana) {
      out.push(`plan: la carpeta "${basename(dir)}" no coincide con semana "${plan.semana}"`);
    }
    const borradores = [];
    const score = typeof opts?.score === "function" ? opts.score : undefined;
    let sinScore = 0;
    for (const p of plan.piezas) {
      if (!esObj(p)) continue;
      const id = typeof p.id === "string" ? p.id : "?";
      // Solo se abre el archivo si el nombre es seguro (id válido y borrador = <id>.json).
      if (typeof p.id !== "string" || !ID_RE.test(p.id) || p.borrador !== `${p.id}.json`) {
        out.push(...validarBorrador(p, {}, config).filter((e) => /^(id|borrador) /.test(e)).map((e) => `${id}: ${e}`));
        continue;
      }
      const b = leerJson(join(dir, p.borrador));
      if ("error" in b) {
        out.push(`${id}: ${p.borrador} ${b.error}`);
        continue;
      }
      borradores.push(b.data);
      out.push(...validarBorrador(p, b.data, config).map((e) => `${id}: ${e}`));
      let s;
      if (score) {
        try {
          s = score(b.data);
        } catch (e) {
          avisos.push(`${id}: no se pudo calcular el score (${e instanceof Error ? e.message : e})`);
        }
      }
      if (typeof s === "number" && Number.isFinite(s)) {
        if (s < config.scoreMin) out.push(`${id}: score ${s} < ${config.scoreMin}`);
      } else sinScore++;
    }
    const fondos = contarFondosIA(borradores);
    if (fondos > config.fondosIAMaxSemana) out.push(`semana: ${fondos} fondos ai (máximo ${config.fondosIAMaxSemana}, config.fondosIAMaxSemana)`);
    if (sinScore) avisos.push(`score léxico no evaluado en ${sinScore} pieza(s): falta el repo de código al lado; lo revisa el Mac antes de renderizar`);
    return out;
  });
  if (!Array.isArray(opts?.avisos)) for (const a of avisos) console.warn(`⚠ ${a}`);
  return errs;
}

// --- ejemplo embebido -------------------------------------------------------

/**
 * Pieza y borrador de ejemplo: los mismos que muestra `INSTRUCCIONES.md` (un
 * test lo verifica). `--self-test` los valida con la config instalada.
 */
export const EJEMPLO = {
  plan: {
    semana: "2026-10-12",
    zona: "America/Santiago",
    experimento: {
      variable: "hook",
      hipotesis: "en tutoriales, un hook de curiosidad retiene más que uno de lista",
      piezas: ["lun-reel-pdfs-a-podcast"],
    },
    piezas: [
      {
        id: "lun-reel-pdfs-a-podcast",
        dia: "2026-10-12",
        hora: "14:00",
        formato: "reel",
        arquetipo: "tutorial",
        senal: "guardados",
        tema: "[[Automatización con IA]]",
        pilar: "herramienta",
        hook: { categoria: "curiosidad", texto: "Convierte 6 PDFs en un podcast gratis", score: 9 },
        emocion: ["curiosidad", "alivio"],
        entregable: "prompt copiable para que el resumen en audio vaya directo a las ideas clave",
        fraseAmigo: "hay una herramienta gratis que convierte tus documentos en un podcast para escuchar caminando",
        lectorFrio: { intentos: 2, resultado: "ok", notas: "v1: el lector con prisa no vio el prompt; se nombró en el subtítulo del Hook" },
        origen: { fichas: ["fuentes/2026-10-04-dm-ejemplo.md"], referencias: ["referencias/notebooklm.md"] },
        derivadoDe: null,
        caption:
          "Automatización para estudiar: 6 PDFs convertidos en un podcast gratis.\n\nGuárdalo para tu próxima semana de lectura y prueba el prompt de la slide 5.\n\n#ia #inteligenciaartificial #herramientasia #notebooklm",
        borrador: "lun-reel-pdfs-a-podcast.json",
        estado: "planificado",
        parametros: { tituloPalabras: 7, terminosTecnicos: 0, logoEnCuadro0: true },
      },
    ],
  },
  borrador: {
    name: "lun-reel-pdfs-a-podcast",
    angle: "de una pila de PDFs pendientes a un podcast que escuchas caminando",
    pillar: "herramienta",
    pace: "ensenar",
    audio: "lima-01.mp3",
    logoEnCuadro0: true,
    slides: [
      {
        template: "Hook",
        props: { title: "Convierte 6 PDFs en un podcast gratis", highlight: "podcast", subtitle: "El truco es el prompt" },
        background: { ai: "pila de documentos de papel que se transforman en ondas de sonido" },
      },
      {
        template: "Lead",
        props: { text: "6 archivos, 1 cuaderno y cero horas frente a la pantalla.", highlight: "cero horas" },
      },
      {
        template: "Step",
        props: { step: "1", heading: "Sube tus PDFs a NotebookLM", body: "Entra a notebooklm.google.com, crea un cuaderno y arrastra los archivos." },
      },
      {
        template: "Step",
        props: { step: "2", heading: "Pide el resumen en audio", bullets: ["Toca resumen en audio", "Prueba la versión corta"] },
      },
      {
        template: "Prompt",
        props: { heading: "Pega esto antes de generarlo", prompt: "Resume estos documentos con las 3 ideas clave y un ejemplo de cada una." },
      },
      {
        template: "Cta",
        props: {
          title: "Guárdalo para tu próxima pila de lectura",
          highlight: "Guárdalo",
          handle: "@ia.punto.es",
          source: "Fuente: notebooklm.google.com",
        },
      },
    ],
  },
};

// --- CLI --------------------------------------------------------------------

/** Repo de código al lado de la base (para el score léxico), si existe. */
function repoDeCodigo(kbRoot) {
  const candidatos = process.env.CARRUSEL_DIR ? [process.env.CARRUSEL_DIR] : [join(kbRoot, ".."), join(kbRoot, "..", "carrusel")];
  for (const c of candidatos) {
    const pkg = leerJson(join(c, "package.json"));
    if (!("error" in pkg) && esObj(pkg.data) && pkg.data.name === "carrusel" && existsSync(join(c, "src", "remix", "registry.ts"))) return c;
  }
  return undefined;
}

/** Score léxico de un borrador con `scoreDraft` del repo de código (vía `npx tsx`). */
function scoreConRepo(repo, borrador) {
  const registry = pathToFileURL(join(repo, "src", "remix", "registry.ts")).href;
  const code = `Promise.all([import(${JSON.stringify(registry)}), import("node:fs")]).then(([r, fs]) => { const d = JSON.parse(fs.readFileSync(0, "utf8")); process.stdout.write("\\nSCORE=" + r.scoreDraft(d).total); });`;
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: repo, input: JSON.stringify(borrador), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
  const m = out.match(/SCORE=(-?[\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function main(args) {
  const here = dirname(self);
  const cfg = leerJson(join(here, "config.json"));
  const fallar = (errs) => {
    console.error(`✗ ${errs.length} problema(s):\n${errs.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  };
  if ("error" in cfg) fallar([`config.json: ${cfg.error}`]);
  const config = cfg.data;
  if (args[0] === "--self-test") {
    const errs = validarConfig(config).map((e) => `config.json: ${e}`);
    if (!errs.length) {
      const c = { ...config, audios: [...config.audios, EJEMPLO.borrador.audio] };
      errs.push(...validarPlan(EJEMPLO.plan, c).map((e) => `ejemplo: ${e}`));
      errs.push(...validarBorrador(EJEMPLO.plan.piezas[0], EJEMPLO.borrador, c).map((e) => `ejemplo: ${e}`));
    }
    if (errs.length) fallar(errs);
    if (!config.audios.length) console.warn("⚠ config.audios está vacío: ningún reel pasará hasta que agregues las pistas de promo/audio/.");
    console.log("✓ Autoprueba del calendario: config.json y ejemplo válidos.");
    return;
  }
  const semana = args[0];
  if (!fechaValida(semana)) fallar([`uso: node _calendario/validar.mjs <semana AAAA-MM-DD> | --self-test (recibí ${q(semana)})`]);
  const repo = repoDeCodigo(join(here, ".."));
  const score = repo
    ? (b) => {
        try {
          return scoreConRepo(repo, b);
        } catch {
          return undefined;
        }
      }
    : undefined;
  const errs = validarSemana(join(here, semana), config, { score });
  if (errs.length) fallar(errs);
  console.log(`✓ Semana ${semana} válida.`);
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
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ error interno del validador: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
