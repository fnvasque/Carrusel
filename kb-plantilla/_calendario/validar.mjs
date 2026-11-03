#!/usr/bin/env node
// Validador del calendario semanal (sin dependencias: corre con node a secas).
//
//   node _calendario/validar.mjs <semana>     valida _calendario/<semana>/plan.json y sus borradores
//   node _calendario/validar.mjs --self-test  valida config.json y el ejemplo embebido (lo usa el instalador)
//   node _calendario/validar.mjs --lector <semana> <id>
//                                             imprime el texto exacto y el mensaje para cada lector frío
//   node _calendario/validar.mjs --probar <config-candidata.json> [<validar-candidato.mjs>]
//                                             corre la regla candidata sobre todas las semanas pasadas y
//                                             dice qué piezas publicadas (y ganadoras) habría rechazado
//
// Sale con código 0 y ✓ si todo cumple; si no, con código 1 y una línea `<id>: <motivo>`
// por problema. Ante entradas raras (JSON roto, tipos equivocados, rutas hostiles)
// devuelve errores: nunca lanza una excepción sin capturar.
//
// Lo escribe el usuario (scripts/kb-calendario-install.sh); el agente planificador
// lo corre pero nunca lo modifica.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Catálogo de plantillas y sus props: copia de `TEMPLATE_CATALOG` en
 * `src/remix/templates-catalog.ts` del repo de código (un test compara ambos).
 * `StoryCover` no está: la usa solo el motor, nunca el agente.
 */
export const CATALOGO = {
  Hook: { required: ["title"], optional: ["eyebrow", "highlight", "cursiva", "mark", "subtitle", "titleSize", "swipe", "resultado", "app", "modo"] },
  Lead: { required: ["text"], optional: ["kicker", "highlight", "cursiva"] },
  Step: { required: ["heading"], optional: ["step", "highlight", "cursiva", "body", "bullets"] },
  Prompt: { required: ["heading", "prompt"], optional: ["note"] },
  Screen: { required: ["app", "prompt", "respuesta"], optional: ["heading", "nota"] },
  MythReality: { required: ["myth", "reality"], optional: ["highlight", "mythLabel", "realityLabel"] },
  Stat: { required: ["value", "label"], optional: ["context"] },
  Clip: { required: ["title", "archivo"], optional: ["highlight", "label"] },
  Cta: { required: ["title"], optional: ["highlight", "cursiva", "reason", "handle", "cta", "ctaIcon"] },
  Concepto: { required: ["titulo", "idea", "enSimple"], optional: ["numero", "highlight", "cursiva", "contraste", "rotulo"] },
};

/** Plantillas que puede usar un borrador. */
export const PLANTILLAS = new Set(Object.keys(CATALOGO));

/**
 * Props comunes que el agente sí puede poner. El resto de las de marca (color,
 * fuente, formato, índice…) las fija el motor: el look papel no se toca.
 */
const PROPS_BASE = new Set(["source", "pillar"]);

/** Tipo de cada prop que no es texto. */
const TIPO_PROP = { bullets: "lista", titleSize: "numero", swipe: "booleano" };

/** Plantilla → prop donde debe aparecer su `highlight`. */
const DONDE_HIGHLIGHT = { Hook: "title", Step: "heading", Lead: "text", Cta: "title", Clip: "title", MythReality: "reality", Concepto: "titulo" };

/** Plantilla → prop donde debe aparecer su `cursiva` (frase del titular en serif cursiva). */
const DONDE_CURSIVA = { Hook: "title", Step: "heading", Lead: "text", Cta: "title", Concepto: "titulo" };

const SENALES = ["guardados", "envios", "comentarios", "retencion", "dm"];

/**
 * Cierre de las piezas por DM (`config.cta`): la palabra que la audiencia escribe por mensaje y
 * el primer día en que se exige. Sin `cta` válido en el config, null (el validador no cambia).
 */
export function ctaDe(config) {
  const c = esObj(config) ? config.cta : undefined;
  if (!esObj(c) || !esTexto(c.palabra) || !fechaValida(c.desde)) return null;
  return { palabra: c.palabra, desde: c.desde };
}

/** ¿El texto pide la palabra del cta? Palabra completa y en mayúsculas exactas, ignorando tildes ("compartir" no cuenta). */
export function contienePalabraCta(texto, palabra) {
  if (!esTexto(texto) || !esTexto(palabra)) return false;
  const sinTildes = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esc = sinTildes(palabra).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "u").test(sinTildes(texto));
}

/** ¿Rige el cierre por DM ese día? Devuelve el cta vigente o null. */
const ctaVigente = (config, dia) => {
  const c = ctaDe(config);
  return c && typeof dia === "string" && dia >= c.desde ? c : null;
};
/** Veces que un tema puede salir en la semana sin ser derivado (con 2 reels por día no alcanzan los temas elegibles). */
const MAX_PIEZAS_POR_TEMA = 2;
/** Entradas del mix por día (piezas que se publican ese día). */
const MAX_ENTRADAS_MIX_DIA = 3;
/** Ventanas con que el bot puede comparar piezas (`config.ventanaMedicion`; el bot usa 7d si falta). */
const VENTANAS_MEDICION = ["24h", "72h", "7d", "14d", "21d", "28d"];
const FORMATOS = ["reel", "carrusel"];
const PACES = ["ensenar", "rapido", "gancho"];
/** Transición (s) entre escenas de cada ritmo (copia de `PACES[pace].transition`, timing.ts). */
const TRANSICION = { ensenar: 0.5, rapido: 0.35, gancho: 0.3 };
const RESPALDOS = ["skill", "supuesto", "base"];
const CAMPOS_BORRADOR = new Set(["name", "angle", "pillar", "slides", "pace", "audio", "logoEnCuadro0", "hookVideo"]);
const CAMPOS_SLIDE = new Set(["template", "props", "pillar", "background", "narracion"]);
const CAMPOS_FONDO = new Set(["ai", "overlay", "brandStyle"]);
/** Voces en español de Kokoro (`src/reel/voz.ts`): `config.voz` debe ser una de ellas o `false` (sin narración). */
const VOCES = ["em_alex", "em_santa", "ef_dora"];
/** Narración por escena (`slide.narracion`, solo reels): palabras mínimas y máximas (`NARRACION_PALABRAS` en draft.ts). */
const NARRACION_PALABRAS = [3, 24];
/** Palabras por segundo de la voz y margen (s) por escena narrada (`PALABRAS_POR_SEGUNDO` en voz.ts, `NARRACION_MARGEN` en timing.ts). */
const NARRACION_PPS = 2.9;
const NARRACION_MARGEN = 0.75;
/** Desde esta semana todo reel lleva `narracion` en cada slide (pivote del 2026-10-17: la IA se ve y se oye). */
export const DESDE_NARRACION = "2026-10-19";
/** Variables de experimento fijas (más cualquier parámetro de `config.puerta`). */
const VARIABLES_FIJAS = ["tema", "arquetipo", "hora", "duracion", "hook", "hookVideo"];
/** Clip de video IA detrás del hook (Kling vía Higgsfield, lo aplica el Mac): forma y tope por semana. */
const HOOK_VIDEO_PROMPT = [40, 800];
const HOOK_VIDEO_SEGUNDOS = [3, 6];
const HOOK_VIDEO_MAX_SEMANA = 1;
/** Escenas `Clip` (video generado a pantalla completa, solo reels): tope por reel, piso de duración y nombre del archivo en la caché del Mac. */
const CLIP_MAX_POR_REEL = 3;
const CLIP_MIN_SECONDS = 3.0;
const ARCHIVO_CLIP_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,120}\.mp4$/;

/** El id se usa como nombre de carpeta en el servidor. */
const ID_RE = /^[a-z0-9-]{3,80}$/;
const HORA_RE = /^([01]\d|2[0-3]):(00|30)$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const AUDIO_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,120}$/;
const HASHTAG_RE = /^#[a-z0-9_]+$/;
const MAX_SLIDES = 10;
/** Desde esta semana cada pieza se apoya en una referencia lista, el tema está en el alcance, hay candidatos.json y a lo más 1 noticia. */
export const DESDE_REFERENCIAS = "2026-10-12";
/** Una referencia sirve si se revisó a lo más hace estos días respecto del lunes de la semana. */
export const REFERENCIA_MAX_DIAS = 60;
const MOTIVOS_CANDIDATO = ["sin-referencia", "derivado", "proxima-semana"];
const MAX_CANDIDATOS = 8;

/** Props con texto de título (límite `tituloMaxPalabras`). */
const CAMPOS_TITULO = ["title", "heading", "titulo"];
/**
 * Portada pregunta-respuesta del `Hook`: «¿No sabes qué pedirle a la IA? Haz que te
 * pregunte a ti». La pregunta nombra el problema del lector y la respuesta le da la
 * salida; partida en dos, ninguna mitad se entiende sola, así que el título tiene
 * tope propio (2026-10-31: el tope de 12 obligaba a recortar la respuesta). Desde el
 * 2026-11-01 el tope general es 14 y este sube a 16, para seguir por encima.
 */
const TITULO_PREGUNTA_MAX_PALABRAS = 16;

/** ¿El título es «¿pregunta? respuesta» (abre con ¿, cierra la pregunta y sigue texto)? */
export function esPreguntaRespuesta(texto) {
  return typeof texto === "string" && /^¿[^?]+\?\s*[^\s]/.test(texto.trim());
}

/** Tope de palabras de un campo de título: el de la puerta, o el propio de la portada pregunta-respuesta. */
function topeTitulo(texto, tituloMax, campo, template) {
  const portada = campo === "title" && (template === undefined || template === "Hook");
  return portada && esPreguntaRespuesta(texto) ? Math.max(tituloMax, TITULO_PREGUNTA_MAX_PALABRAS) : tituloMax;
}
/** Props con texto de cuerpo (límite `cuerpoMaxPalabras`). */
const CAMPOS_CUERPO = ["body", "text", "subtitle", "reason", "context", "note"];
/**
 * `myth` y `reality` de MythReality se dibujan como titular (Inter 700 grande), no como
 * cuerpo: desde `DESDE_MITO_CORTO` tienen tope propio, `MITO_REALIDAD_MAX_PALABRAS`, en
 * carrusel y reel. Antes de esa fecha siguen con el tope de cuerpo (las semanas viejas
 * no ganan errores nuevos). Carrusel del 2026-10-27: una «realidad» de 26 palabras.
 */
const CAMPOS_MITO = ["myth", "reality"];
export const MITO_REALIDAD_MAX_PALABRAS = 14;
export const DESDE_MITO_CORTO = "2026-10-26";
/**
 * Carrusel explicativo (plantilla `Concepto`, pedido de Felipe 2026-10-30 con revisión
 * adversaria): una idea de IA explicada en simple en 3 a 5 láminas. Cada campo tiene su
 * tope y la lámina entera también, para que el texto largo no se vuelva un muro en el
 * celular. Fuera del tope de cuerpo general.
 */
export const CONCEPTO_MAX_PALABRAS = { titulo: 6, idea: 18, enSimple: 35, contraste: 16 };
export const CONCEPTO_LAMINA_MAX_PALABRAS = 60;
export const CONCEPTO_POR_PIEZA = [3, 5];
/** Valores de `plan.piezas[].variante`: hoy solo el carrusel explicativo. */
export const VARIANTES = ["explicativo"];
/**
 * Props que no pasan por las reglas de lenguaje (siglas, relleno, términos):
 * la cita al pie, el prompt copiable (es para pegarlo en una IA, no para leerlo)
 * y los datos de marca.
 */
const SIN_REGLAS_DE_LENGUAJE = new Set(["source", "prompt", "handle", "ctaIcon", "pillar"]);

/** Valores por defecto de la puerta si `config.puerta` no trae alguno. */
const PUERTA_DEFECTO = {
  tituloMaxPalabras: 14,
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
  ritmoReel: "ensenar",
  duracionMaxSegundos: 60,
};
/**
 * Claves de la puerta opcionales: si la config no las trae, se usa el respaldo
 * (`cuerpoMaxPalabrasCarrusel` cae en `cuerpoMaxPalabras`) y las piezas no tienen
 * que repetirlas en `parametros`. Si vienen, se validan como números > 0.
 */
const PUERTA_OPCIONAL = ["cuerpoMaxPalabrasCarrusel"];
/**
 * Desde esta semana `parametros` debe traer también `ritmoReel` y
 * `duracionMaxSegundos` (palancas de retención); las semanas anteriores no las
 * conocían y siguen válidas sin ellas.
 */
export const DESDE_PALANCAS_RETENCION = "2026-10-19";
const PARAMETROS_DESDE = { ritmoReel: DESDE_PALANCAS_RETENCION, duracionMaxSegundos: DESDE_PALANCAS_RETENCION };

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
/**
 * Como compara el motor (`highlightText`): sin distinguir mayúsculas, pero sí
 * tildes y sin normalizar la composición Unicode (por eso los textos deben venir
 * en NFC: lo exige `erroresDeBorrador`).
 */
const minus = (s) => String(s).toLowerCase();

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
/**
 * COPIA de `localParts`, `offsetMinutes` y `zonedToUtc` de
 * `src/calendario/time.ts` (repo de código): el instante real de una fecha y
 * hora de Chile, con el cambio de hora. Si la hora se repite (abril) toma la
 * primera; si no existe (septiembre), la misma hora de reloj después del salto.
 * `test/calendario/validar.ts` compara ambas en los dos cambios de hora.
 */
const ZONA = "America/Santiago";
const formatoLocal = new Map();
function partesLocales(at, zona) {
  if (!formatoLocal.has(zona)) {
    formatoLocal.set(
      zona,
      new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    );
  }
  const parts = formatoLocal.get(zona).formatToParts(at);
  const get = (t) => parts.find((x) => x.type === t).value;
  return { dia: `${get("year")}-${get("month")}-${get("day")}`, hora: `${get("hour")}:${get("minute")}` };
}
function minutosDeDesfase(at, zona) {
  const l = partesLocales(at, zona);
  const [y, m, d] = l.dia.split("-").map(Number);
  const [hh, mm] = l.hora.split(":").map(Number);
  return Math.round((Date.UTC(y, m - 1, d, hh, mm) - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}
/** Instante UTC (Date) de `dia` `hora` locales de `zona` (misma lógica que `zonedToUtc`). */
export function aUtc(dia, hora, zona = ZONA) {
  const [y, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const antes = minutosDeDesfase(new Date(guess - 12 * 3_600_000), zona);
  const despues = minutosDeDesfase(new Date(guess + 12 * 3_600_000), zona);
  const candidatos = [...new Set([antes, despues])].map((o) => guess - o * 60_000).sort((a, b) => a - b);
  for (const t of candidatos) {
    const l = partesLocales(new Date(t), zona);
    if (l.dia === dia && l.hora === hora) return new Date(t);
  }
  return new Date(guess - antes * 60_000);
}

/** Valor de un parámetro de la puerta (`config.puerta.<k>.valor`), con respaldo por defecto. */
function puerta(config, k) {
  const p = esObj(config) && esObj(config.puerta) ? config.puerta[k] : undefined;
  return esObj(p) && p.valor !== undefined ? p.valor : PUERTA_DEFECTO[k];
}
const lista = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);

/** Lee un JSON: `{ data }` o `{ error }` (nunca lanza). Un BOM inicial es error. */
function leerJson(path) {
  let text;
  try {
    if (!existsSync(path)) return { error: "no existe" };
    // lstat: un enlace simbólico podría apuntar fuera de la carpeta de la semana.
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return { error: "es un enlace simbólico (no permitido: debe ser un archivo de la carpeta)" };
    if (!st.isFile()) return { error: "no es un archivo" };
    text = readFileSync(path, "utf8");
  } catch {
    return { error: "no se pudo leer" };
  }
  if (text.charCodeAt(0) === 0xfeff) return { error: "empieza con BOM: guárdalo como UTF-8 sin BOM" };
  try {
    return { data: JSON.parse(text) };
  } catch (e) {
    // Sin repetir el mensaje del parser: trae un trozo del archivo (podría ser un token).
    return { error: `JSON inválido (línea ${lineaDelError(text, e)})` };
  }
}

/** Línea (1-based) donde falló `JSON.parse`, o "?" si el mensaje no la trae. */
function lineaDelError(text, e) {
  const msg = e instanceof Error ? e.message : "";
  const linea = msg.match(/line (\d+)/);
  if (linea) return Number(linea[1]);
  const pos = msg.match(/position (\d+)/);
  if (pos) return text.slice(0, Number(pos[1])).split("\n").length;
  return "?";
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
const TEXT_KEYS = ["title", "subtitle", "eyebrow", "heading", "body", "bullets", "text", "kicker", "quote", "reality", "myth", "reason", "note", "value", "label", "context", "prompt", "respuesta", "nota"];
const PACE_ENSENAR = { stagger: 1.8 };
const HOOK_MAX_SECONDS = 6.0;
const BULLET_LEAD = 1.0;
const BULLET_TAIL = 2.5;
/** Ritmo gancho: copia de `PACES.gancho.stagger`, `HOOK_MAX_SECONDS_GANCHO` y `GANCHO` (timing.ts). */
const PACE_GANCHO = { stagger: 0.45 };
const HOOK_MAX_SECONDS_GANCHO = 3.0;
const GANCHO = { arranque: 0.2, factorArranque: 0.85, factorMedio: 1.2, factorCierre: 1.5, minSeconds: 1.6, bulletLead: 0.6, bulletTail: 1.2 };

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
/** ¿La escena es un `Clip`? (trae `archivo`): dura al menos CLIP_MIN_SECONDS, como en el motor (`esEscenaClip`). */
const esEscenaClip = (props) => esObj(props) && esTexto(props.archivo);

export function segundosEscena(props, hold, pace = "ensenar", hook = false) {
  const s = segundosEscenaTexto(props, hold, pace, hook);
  return esEscenaClip(props) ? Math.max(CLIP_MIN_SECONDS, s) : s;
}

/** `segundosEscena` sin el piso de `Clip`. */
function segundosEscenaTexto(props, hold, pace = "ensenar", hook = false) {
  const chars = textChars(props);
  if (pace === "rapido") {
    const s = Math.min(4.8, Math.max(2.4, 1.8 + chars / 26));
    return +(s + (hold ? 0.7 : 0)).toFixed(2);
  }
  if (pace === "gancho") {
    const s = Math.min(4.5, Math.max(2.0, 1.6 + chars / 28));
    return +(hook ? Math.min(HOOK_MAX_SECONDS_GANCHO, s) : s).toFixed(2);
  }
  const text = Math.min(8, Math.max(3.5, 2.4 + chars / 16)) + (hold ? 1.0 : 0);
  const bullets = Array.isArray(props.bullets) ? props.bullets.filter((x) => typeof x === "string").length : 0;
  const forBullets = bullets > 0 ? BULLET_LEAD + PACE_ENSENAR.stagger * (bullets - 1) + BULLET_TAIL : 0;
  const s = Math.max(text, forBullets);
  return +(hook ? Math.min(HOOK_MAX_SECONDS, s) : s).toFixed(2);
}

/** Ritmo efectivo de un borrador (el del campo `pace`, o "ensenar"). */
export function ritmoDelBorrador(borrador) {
  return esObj(borrador) && PACES.includes(borrador.pace) ? borrador.pace : "ensenar";
}

/**
 * COPIA de `sceneDurations` (timing.ts): segundos de cada escena del reel. En
 * ensenar y rapido es `segundosEscena` escena a escena; en gancho aplica la
 * curva GANCHO sobre las bases (hook intacto, arranque × 0.85 antes del 20 %
 * del total, medio × 1.2, última × 1.5; piso de 1.6 s y de los bullets).
 */
export function segundosNarracion(texto) {
  if (typeof texto !== "string" || !texto.trim()) return undefined;
  return +Math.max(1.0, palabras(texto).length / NARRACION_PPS + 0.3).toFixed(2);
}

/** Alarga cada escena con `narracion` hasta que quepa su voz (`conNarracion` en timing.ts). */
function conNarracion(durs, slides) {
  return durs.map((d, i) => {
    const n = segundosNarracion(esObj(slides[i]) ? slides[i].narracion : undefined);
    return n === undefined ? d : +Math.max(d, n + NARRACION_MARGEN).toFixed(2);
  });
}

/**
 * Segundos de cada escena. Con `conVoz` false (`config.voz === false`) la `narracion` no se
 * sintetiza y no alarga nada, igual que en el motor (`renderReel.ts`, `narrar`).
 */
export function segundosEscenas(slides, pace = "ensenar", conVoz = true) {
  const texto = segundosEscenasTexto(slides, pace);
  return conVoz ? conNarracion(texto, slides) : texto;
}

/** ¿El reel se narra? Solo `config.voz === false` lo apaga (sin config, o voz sin definir, se narra). */
export const hayVoz = (config) => !(esObj(config) && config.voz === false);

/**
 * Ritmo vigente de los reels: sin voz (`config.voz === false`) es `ensenar`, decisión del
 * usuario del 2026-10-30 (en `gancho` la portada dura 3 s y la Screen del medio no alcanza a
 * leerse); con voz, `puerta.ritmoReel`.
 */
/** Voz con la que está escrito el ejemplo embebido (`--self-test` la usa si la base no tiene voz). */
export const VOZ_EJEMPLO = "em_alex";

export function ritmoVigente(config) {
  return hayVoz(config) ? puerta(config, "ritmoReel") : "ensenar";
}

/** Duración de cada escena solo por su texto (sin narración). */
function segundosEscenasTexto(slides, pace = "ensenar") {
  const props = slides.map((s) => (esObj(s) && esObj(s.props) ? s.props : {}));
  const last = props.length - 1;
  if (pace !== "gancho") return props.map((p, i) => segundosEscena(p, i === 0 || i === last, pace, i === 0));
  const base = props.map((p, i) => segundosEscena(p, false, "gancho", i === 0));
  const total = base.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return base.map((b, i) => {
    const start = cursor;
    cursor += b;
    let d = b;
    if (i === 0) d = b;
    else if (i === last) d = b * GANCHO.factorCierre;
    else if (start < total * GANCHO.arranque) d = b * GANCHO.factorArranque;
    else d = b * GANCHO.factorMedio;
    const n = Array.isArray(props[i].bullets) ? props[i].bullets.filter((x) => typeof x === "string").length : 0;
    const forBullets = n > 0 ? GANCHO.bulletLead + PACE_GANCHO.stagger * (n - 1) + GANCHO.bulletTail : 0;
    const piso = esEscenaClip(props[i]) ? CLIP_MIN_SECONDS : 0;
    return +Math.max(GANCHO.minSeconds, forBullets, piso, d).toFixed(2);
  });
}

/**
 * Duración total (s) del reel de un borrador, como la calcula el motor
 * (`reelTiming`): Σ escenas − (n − 1) × transición del ritmo. 0 si no hay slides.
 */
export function duracionReel(borrador, config) {
  if (!esObj(borrador) || !Array.isArray(borrador.slides) || borrador.slides.length === 0) return 0;
  const pace = ritmoDelBorrador(borrador);
  const d = segundosEscenas(borrador.slides, pace, hayVoz(config));
  return +(d.reduce((a, b) => a + b, 0) - (d.length - 1) * TRANSICION[pace]).toFixed(3);
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
/** Variantes: "I.A" (sin punto final) e "I. A." (con espacio). */
const SIGLA_PUNTOS_VARIANTES_RE = /(?<![\p{L}\p{N}])\p{Lu}\.\s?\p{Lu}(?:\.|(?![\p{L}\p{N}]))/gu;
/** Emojis, incluidas banderas (indicadores regionales) y keycaps (1️⃣). */
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
/** "Comenta PALABRA": la palabra clave del CTA va en mayúsculas y no es una sigla. */
const ANTES_DE_PALABRA_CLAVE = /(?<![a-z])comenta\s*["«“']?\s*$/;

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
function siglasProhibidas(texto, permitidas, enCta, palabraCta) {
  const malas = [];
  let palabraClave = false;
  for (const m of texto.matchAll(SIGLA_RE)) {
    if (permitidas.has(m[1])) continue;
    // La palabra del cta (p. ej. PARTIR) no es sigla dentro del Cta.
    if (enCta && palabraCta && m[1] === palabraCta) continue;
    // Excepción única: una palabra en mayúsculas justo después de "Comenta", en el Cta.
    if (enCta && !palabraClave && ANTES_DE_PALABRA_CLAVE.test(normalizar(texto.slice(0, m.index)))) {
      palabraClave = true;
      continue;
    }
    malas.push(m[1]);
  }
  for (const m of texto.matchAll(SIGLA_PUNTOS_RE)) malas.push(m[0]);
  for (const m of texto.matchAll(SIGLA_PUNTOS_VARIANTES_RE)) malas.push(m[0]);
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
export function reglasDeTexto(borrador, config, formato, dia) {
  return seguro(() => {
    if (!esObj(borrador) || !Array.isArray(borrador.slides)) return [];
    const errs = [];
    const tituloMax = puerta(config, "tituloMaxPalabras");
    const bulletMax = puerta(config, "bulletMaxPalabras");
    // Carrusel: tope propio (la profundidad va en los carruseles); si falta, el del cuerpo general.
    const cuerpoMaxCarrusel = puerta(config, "cuerpoMaxPalabrasCarrusel");
    const esCarrusel = formato === "carrusel" && typeof cuerpoMaxCarrusel === "number" && Number.isFinite(cuerpoMaxCarrusel) && cuerpoMaxCarrusel > 0;
    const cuerpoMax = esCarrusel ? cuerpoMaxCarrusel : puerta(config, "cuerpoMaxPalabras");
    const claveCuerpo = esCarrusel ? "cuerpoMaxPalabrasCarrusel" : "cuerpoMaxPalabras";
    const permitidas = new Set(lista(puerta(config, "siglasPermitidas")));
    const relleno = lista(puerta(config, "relleno"));
    // Antes de `cta.desde` la palabra del cta sigue siendo una sigla; sin día (uso suelto) rige.
    const cta = ctaDe(config);
    const palabraCta = cta && !(typeof dia === "string" && dia < cta.desde) ? cta.palabra : undefined;
    // Sin día (uso suelto) rige la regla vigente; con día, desde DESDE_MITO_CORTO.
    const mitoCorto = !(typeof dia === "string" && fechaValida(dia) && dia < DESDE_MITO_CORTO);
    const terminos = new Set();
    const slides = borrador.slides;
    slides.forEach((slide, i) => {
      if (!esObj(slide) || !esObj(slide.props)) return;
      const p = slide.props;
      const donde = `slide ${i + 1} (${typeof slide.template === "string" ? slide.template : "?"})`;
      for (const k of CAMPOS_TITULO) {
        if (typeof p[k] !== "string") continue;
        const n = palabras(p[k]).length;
        const max = topeTitulo(p[k], tituloMax, k, slide.template);
        if (n > max) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${max}, ${max === tituloMax ? "puerta.tituloMaxPalabras" : "portada pregunta-respuesta"})`);
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
        if (n > cuerpoMax) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${cuerpoMax}, puerta.${claveCuerpo})`);
      }
      if (slide.template === "Concepto") {
        let total = 0;
        for (const [k, max] of Object.entries(CONCEPTO_MAX_PALABRAS)) {
          if (typeof p[k] !== "string") continue;
          const n = palabras(p[k]).length;
          total += n;
          if (n > max) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${max}, CONCEPTO_MAX_PALABRAS): una idea por lámina, dicha en simple`);
        }
        if (total > CONCEPTO_LAMINA_MAX_PALABRAS) errs.push(`${donde}: la lámina suma ${total} palabras (máximo ${CONCEPTO_LAMINA_MAX_PALABRAS}, CONCEPTO_LAMINA_MAX_PALABRAS): recorta idea o contraste`);
      }
      for (const k of CAMPOS_MITO) {
        if (typeof p[k] !== "string") continue;
        const n = palabras(p[k]).length;
        if (mitoCorto) {
          if (n > MITO_REALIDAD_MAX_PALABRAS) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${MITO_REALIDAD_MAX_PALABRAS}, MITO_REALIDAD_MAX_PALABRAS): se dibuja como titular en mayúscula; una creencia contra un dato, corto`);
        } else if (n > cuerpoMax) errs.push(`${donde}: ${k} tiene ${n} palabras (máximo ${cuerpoMax}, puerta.${claveCuerpo})`);
      }
      for (const [k, texto] of textosDeLenguaje(p)) {
        for (const s of new Set(siglasProhibidas(texto, permitidas, slide.template === "Cta", palabraCta))) {
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
      const pace = ritmoDelBorrador(borrador);
      const wps = puerta(config, "lecturaPalabrasPorSegundo");
      const minS = puerta(config, "lecturaMinSegundos");
      const duraciones = segundosEscenas(slides, pace, hayVoz(config));
      slides.forEach((slide, i) => {
        if (!esObj(slide) || !esObj(slide.props)) return;
        const n = palabrasEscena(slide.props);
        const necesita = Math.max(minS, n / wps);
        const da = duraciones[i];
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
export function validarCaption(caption, config, tema, dia) {
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
    if (contieneFrase(tokens(caption), "primer comentario")) errs.push('el caption no puede mandar al "primer comentario"');
    for (const r of rellenoEn(caption, lista(puerta(config, "relleno")))) errs.push(`el caption tiene relleno "${r}" (puerta.relleno)`);
    const cta = ctaVigente(config, dia);
    if (cta && !contienePalabraCta(caption, cta.palabra)) errs.push(`el caption debe pedir ${cta.palabra} (config.cta, desde el ${cta.desde})`);
    return errs;
  });
}

// --- borrador ---------------------------------------------------------------

/** Borradores con `hookVideo` (cuentan para `config.hookVideoMaxSemana`, 1 si falta). */
export function contarHookVideo(borradores) {
  if (!Array.isArray(borradores)) return 0;
  return borradores.filter((b) => esObj(b) && b.hookVideo !== undefined).length;
}

/**
 * Frecuencia del carrusel explicativo: `config.explicativo = { desde, cadaSemanas }` (la
 * edita el usuario). Toca la semana del lunes `desde` y luego cada `cadaSemanas` semanas;
 * nunca en una semana del paquete. Sin `config.explicativo` no toca nunca.
 */
function explicativoDe(config) {
  const e = esObj(config) && esObj(config.explicativo) ? config.explicativo : undefined;
  if (!e || !fechaValida(e.desde) || diaSemana(e.desde) !== 1 || !Number.isInteger(e.cadaSemanas) || e.cadaSemanas < 1) return undefined;
  return { desde: e.desde, cadaSemanas: e.cadaSemanas };
}

/** Lunes (AAAA-MM-DD) de la semana de un día. */
const lunesDe = (dia) => sumarDias(dia, -((diaSemana(dia) + 6) % 7));

/** ¿La semana del lunes `lunes` lleva carrusel explicativo? */
export function semanaExplicativa(lunes, config) {
  const e = explicativoDe(config);
  if (!e || !fechaValida(lunes) || lunes < e.desde) return false;
  if (paqueteDe(config).semanas.includes(lunes)) return false;
  const semanas = Math.round((Date.parse(`${lunes}T00:00:00Z`) - Date.parse(`${e.desde}T00:00:00Z`)) / (7 * 864e5));
  return semanas % e.cadaSemanas === 0;
}

/**
 * Reglas de las slides `Concepto`: solo en la pieza `variante: "explicativo"`, que es un
 * carrusel de 3 a 5 Concepto en una semana que toca (`semanaExplicativa`).
 */
function erroresDeConcepto(b, p, config) {
  const slides = Array.isArray(b.slides) ? b.slides : [];
  const n = slides.filter((s) => esObj(s) && s.template === "Concepto").length;
  const errs = [];
  if (n > 0 && p.formato !== "carrusel") errs.push("Concepto solo va en carruseles (en el reel no cabe el texto largo)");
  if (p.variante !== "explicativo") {
    if (n > 0) errs.push('las slides Concepto solo van en el carrusel explicativo (plan.piezas[].variante: "explicativo")');
    return errs;
  }
  if (p.formato !== "carrusel") errs.push("variante explicativo solo para el carrusel");
  if (n < CONCEPTO_POR_PIEZA[0] || n > CONCEPTO_POR_PIEZA[1]) errs.push(`el carrusel explicativo lleva de ${CONCEPTO_POR_PIEZA[0]} a ${CONCEPTO_POR_PIEZA[1]} slides Concepto (tiene ${n}): una idea repartida en láminas`);
  if (typeof p.dia === "string" && fechaValida(p.dia) && !semanaExplicativa(lunesDe(p.dia), config)) {
    const e = explicativoDe(config);
    errs.push(e ? `esta semana no toca carrusel explicativo (config.explicativo: desde el ${e.desde}, cada ${e.cadaSemanas} semanas)` : "el carrusel explicativo no está activo (falta config.explicativo)");
  }
  return errs;
}

/** Borradores con al menos una slide `Clip` (cuentan para `config.clipsMaxSemana`, 0 si falta). */
export function contarClips(borradores) {
  if (!Array.isArray(borradores)) return 0;
  return borradores.filter((b) => esObj(b) && Array.isArray(b.slides) && b.slides.some((s) => esObj(s) && s.template === "Clip")).length;
}

/**
 * Reglas de las slides `Clip`: solo reels, `archivo` = nombre .mp4 sin rutas, ≤ CLIP_MAX_POR_REEL;
 * si la portada (slide 1) es un Clip: `logoEnCuadro0: false`, ningún Hook y sin hookVideo.
 */
function erroresDeClips(b, p) {
  const slides = Array.isArray(b.slides) ? b.slides : [];
  const clips = slides.map((s, i) => ({ s, i })).filter(({ s }) => esObj(s) && s.template === "Clip");
  if (!clips.length) return [];
  const errs = [];
  if (p.formato !== "reel") errs.push("Clip solo va en reels (el carrusel es estático)");
  if (clips.length > CLIP_MAX_POR_REEL) errs.push(`${clips.length} slides Clip (máximo ${CLIP_MAX_POR_REEL} por reel)`);
  for (const { s, i } of clips) {
    const a = esObj(s.props) ? s.props.archivo : undefined;
    if (!esTexto(a)) continue; // "falta archivo" lo dice el catálogo
    if (a.includes("..") || !ARCHIVO_CLIP_RE.test(a)) errs.push(`slide ${i + 1} (Clip): archivo ${q(a)} inválido: solo un nombre .mp4 sin rutas (letras, números, _ . -)`);
  }
  if (clips[0].i === 0) {
    if (b.logoEnCuadro0 !== false) errs.push("con un Clip de portada va logoEnCuadro0: false (el cuadro 0 es el video, sin marca)");
    if (slides.some((s) => esObj(s) && s.template === "Hook")) errs.push("con un Clip de portada el reel va sin Hook (el video es la portada)");
    if (b.hookVideo !== undefined) errs.push("hookVideo no va con un Clip de portada (el video ya es el cuadro 0)");
  }
  return errs;
}

/** Errores de `hookVideo` en un borrador (solo reels, forma, Hook sin fondo). */
function erroresDeHookVideo(b, p) {
  const v = b.hookVideo;
  if (v === undefined) return [];
  if (p.formato !== "reel") return ["hookVideo solo va en reels (el carrusel es estático)"];
  if (!esObj(v)) return ["hookVideo debe ser un objeto { prompt, segundos? }"];
  const errs = [];
  for (const k of Object.keys(v)) if (k !== "prompt" && k !== "segundos") errs.push(`hookVideo: campo desconocido ${q(k)}`);
  const [min, max] = HOOK_VIDEO_PROMPT;
  if (typeof v.prompt !== "string" || v.prompt.trim().length < min || v.prompt.length > max) errs.push(`hookVideo.prompt debe ser un texto de ${min} a ${max} caracteres (en inglés, una sola toma)`);
  const [smin, smax] = HOOK_VIDEO_SEGUNDOS;
  if (v.segundos !== undefined && !(Number.isInteger(v.segundos) && v.segundos >= smin && v.segundos <= smax)) errs.push(`hookVideo.segundos debe ser un entero entre ${smin} y ${smax}`);
  const hook = Array.isArray(b.slides) ? b.slides[0] : undefined;
  if (esObj(hook) && hook.background !== undefined) errs.push("hookVideo: el Hook no lleva background (el clip va detrás, sobre el fondo negro de marca)");
  return errs;
}

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

/**
 * `parametros` (obligatorio, R52): cada clave de `config.puerta` con el valor que se usó
 * al producir la pieza, del mismo tipo que su `valor` en config (número, true/false o
 * lista). Sin esto el bucle no puede comparar parámetros de la puerta. Se permiten
 * claves extra (la variable del experimento, `tituloPalabras`…).
 */
function erroresDeParametros(parametros, config, dia) {
  if (parametros === undefined || parametros === null) {
    return ["falta parametros (cada clave de config.puerta con el valor que usaste; ver INSTRUCCIONES.md, \"Fuente y parámetros\")"];
  }
  if (!esObj(parametros)) return ["parametros debe ser un objeto"];
  const claves = esObj(config) && esObj(config.puerta) ? Object.keys(config.puerta) : [];
  const errs = [];
  for (const k of claves) {
    const ref = puerta(config, k);
    if (!Object.hasOwn(parametros, k)) {
      if (PUERTA_OPCIONAL.includes(k)) continue;
      // Palancas nuevas: solo se exigen desde su semana (las anteriores no las conocían).
      if (PARAMETROS_DESDE[k] && typeof dia === "string" && dia < PARAMETROS_DESDE[k]) continue;
      // Semanas del paquete: esas palancas no se fijan, así que tampoco se exigen.
      if (PARAMETROS_FUERA_PAQUETE.includes(k) && enPaquete(dia, config)) continue;
      errs.push(`falta parametros.${k} (el valor de puerta.${k} que usaste)`);
      continue;
    }
    if (PARAMETROS_FUERA_PAQUETE.includes(k) && enPaquete(dia, config)) {
      const paq = paqueteDe(config);
      errs.push(`parametros.${k} no se fija en las semanas del ${paq.motivo} (${paq.semanas.join(", ")}): quítalo`);
      continue;
    }
    const v = parametros[k];
    if (Array.isArray(ref)) {
      if (!Array.isArray(v)) errs.push(`parametros.${k} debe ser una lista (como puerta.${k})`);
    } else if (typeof ref === "boolean") {
      if (typeof v !== "boolean") errs.push(`parametros.${k} debe ser true o false (como puerta.${k})`);
    } else if (typeof ref === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) errs.push(`parametros.${k} debe ser un número (como puerta.${k})`);
      else if (k === "duracionMaxSegundos" && v <= 0) errs.push(`parametros.${k} debe ser mayor que 0 (segundos)`);
    } else if (typeof ref === "string") {
      if (typeof v !== "string") errs.push(`parametros.${k} debe ser un texto (como puerta.${k})`);
      else if (k === "ritmoReel" && !PACES.includes(v)) errs.push(`parametros.ritmoReel ${q(v)} inválido (usa: ${PACES.join(", ")})`);
    }
  }
  return errs;
}

/**
 * Palancas de retención del reel (`ritmoReel` y `duracionMaxSegundos`, en la puerta desde el 2026-10-14): el
 * `pace` del borrador debe coincidir con `parametros.ritmoReel` de su pieza, y
 * el reel completo (como lo calcula el motor) no puede pasar de
 * `duracionMaxSegundos` (el de `parametros` si viene; si no, el de la puerta).
 * Solo en reels; en un carrusel `pace` se ignora.
 */
export function erroresDeRetencion(borrador, pieza, config) {
  return seguro(() => {
    if (!esObj(borrador) || !esObj(pieza) || pieza.formato !== "reel") return [];
    const errs = [];
    const params = esObj(pieza.parametros) ? pieza.parametros : {};
    const pace = ritmoDelBorrador(borrador);
    if (typeof params.ritmoReel === "string" && PACES.includes(params.ritmoReel) && params.ritmoReel !== pace) {
      errs.push(`pace ${q(borrador.pace ?? "ensenar")} del borrador no coincide con parametros.ritmoReel ${q(params.ritmoReel)} (pon el mismo en los dos)`);
    } else if (params.ritmoReel === undefined && enPaquete(pieza.dia, config)) {
      // En el paquete parametros.ritmoReel no se fija: el pace se compara con el ritmo vigente
      // (la puerta con voz; ensenar sin voz).
      const vigente = ritmoVigente(config);
      if (typeof vigente === "string" && PACES.includes(vigente) && vigente !== pace) {
        const origen = hayVoz(config) ? `puerta.ritmoReel ${q(vigente)}` : `el ritmo vigente ${q(vigente)} (sin voz, config.voz false)`;
        errs.push(`pace ${q(borrador.pace ?? "ensenar")} del borrador no coincide con ${origen} (en el ${paqueteDe(config).motivo} el ritmo es el vigente)`);
      }
    }
    // Sin voz, todo reel va en ensenar (también fuera del paquete y con parametros.ritmoReel).
    if (!hayVoz(config) && pace !== "ensenar" && !errs.some((e) => e.includes("ritmo vigente"))) {
      errs.push(`pace ${q(borrador.pace ?? "ensenar")}: sin voz (config.voz false) el reel va en ritmo "ensenar" (en gancho la portada dura 3 s y no alcanza a leerse)`);
    }
    const tope = typeof params.duracionMaxSegundos === "number" && params.duracionMaxSegundos > 0 ? params.duracionMaxSegundos : puerta(config, "duracionMaxSegundos");
    if (!Array.isArray(borrador.slides) || !borrador.slides.every((s) => esObj(s) && esObj(s.props))) return errs;
    const total = duracionReel(borrador, config);
    if (typeof tope === "number" && Number.isFinite(tope) && tope > 0 && total > tope + 1e-9) {
      const origen = typeof params.duracionMaxSegundos === "number" ? "parametros.duracionMaxSegundos" : "puerta.duracionMaxSegundos";
      errs.push(`el reel dura ${total} s (ritmo ${pace}) y el tope es ${tope} s (${origen}): quita escenas o acorta el texto`);
    }
    return errs;
  });
}

/**
 * Respuestas de la P8 que dicen «ya lo sabía» (sobre texto normalizado: minúsculas, sin
 * tildes). «Ya sabía qué/cuál/cómo/dónde/quién…» no cuenta: nombra lo que sabía y lo que no.
 * Las mismas que la causa `nada-nuevo` de `src/calendario/lector-causas.ts`.
 */
export const NADA_NUEVO_RE = [/nada\s+(de\s+)?nuevo/, /ya (lo )?sabia(?!\s+(?:que|cual(?:es)?|como|donde|quien(?:es)?)\b)/, /ya lo conocia/, /no aprendi nada/, /nada que no supiera/];

/** Una duda no bloqueante bien escrita: `NB: «cita textual» → regla` (la regla hasta el fin de línea, "; NB:" o el final). */
const NB_RE = /\bNB: «[^«»\n]+» → (?:(?!;\s*NB\b)[^\n])*?\S(?=\s*(?:;\s*NB\b|\n|$))/g;

/**
 * `lectorFrio.notas`: texto. Cada duda que el planificador declare no
 * bloqueante va como `NB: «cita textual del lector» → regla que aplica`
 * (ver lector-frio.md). Validación de forma: todo "NB" debe tener esa forma y
 * no se puede declarar algo "no bloquea"/"no bloqueante" fuera de un NB.
 */
function erroresDeNotas(notas) {
  const formato = 'cada duda no bloqueante va como NB: «cita» → regla (cita textual del lector y la regla de lector-frio.md que aplica)';
  if (typeof notas !== "string") return [`lectorFrio.notas debe ser texto; ${formato}`];
  const total = (notas.match(/\bNB\b/g) ?? []).length;
  const bien = notas.match(NB_RE) ?? [];
  if (bien.length !== total) return [`lectorFrio.notas: hay ${total - bien.length} NB mal escrito(s); ${formato}`];
  for (const nb of bien) {
    const m = /^NB: «([^«»\n]+)» → (.*)$/s.exec(nb);
    // Solo el lector completo bloquea por «nada nuevo»; en el con prisa la P8 es NB (desde 2026-10-23, backtest).
    if (m && /^completo p8\b/.test(normalizar(m[2]).trim()) && NADA_NUEVO_RE.some((r) => r.test(normalizar(m[1])))) {
      return [`lectorFrio.notas: un NB de la P8 del lector completo no puede citar «nada nuevo» ni «ya lo sabía» (en el completo eso bloquea, no es NB); si el lector nombra algo que la pieza no enseña, cítalo`];
    }
  }
  const fueraDeNB = notas.replace(NB_RE, "");
  if (/no bloque/i.test(normalizar(fueraDeNB))) return [`lectorFrio.notas declara algo no bloqueante sin el formato; ${formato}`];
  return [];
}

/**
 * Desde este día el hook sale de 8 a 10 candidatos y lo elige un juez separado. Valor por
 * defecto: manda `config.paquete.desde` si viene (ver `paqueteDe`).
 */
export const DESDE_CALIDAD = "2026-10-26";
export const PATRONES_HOOK = ["en-juego", "error-comun", "dato-contrario", "antes-despues", "pregunta-del-jefe", "resultado"];
const CANDIDATOS_MIN = 8;
const CANDIDATOS_MAX = 10;
const PATRONES_MIN = 3;

/** Series válidas desde `paquete.desde` (el público profesional; `gratis-vs-pago` deja de valer). */
export const SERIES_CALIDAD = ["hazlo-con-ia", "criterio", "lo-probe-por-ti"];
/**
 * Series válidas del config: `config.series` si es una lista de slugs no vacía; si no,
 * las series de calidad por defecto.
 */
export function seriesDe(config) {
  const l = esObj(config) ? config.series : undefined;
  return Array.isArray(l) && l.length > 0 && l.every((s) => typeof s === "string" && SLUG_SERIE_RE.test(s)) ? l : SERIES_CALIDAD;
}
const SLUG_SERIE_RE = /^[a-z0-9-]{3,40}$/;
/**
 * Lunes de las semanas del paquete calidad-contenido: sin experimento propio y sin tocar
 * duración ni ritmo del reel. Valor por defecto: manda `config.paquete.semanas` si viene.
 */
export const SEMANAS_PAQUETE = ["2026-10-26", "2026-11-02"];
export const MOTIVO_PAQUETE = "paquete calidad-contenido";
const PARAMETROS_FUERA_PAQUETE = ["duracionMaxSegundos", "ritmoReel"];

/**
 * Fechas del paquete: `config.paquete` (opcional, lo edita el usuario para correr el paquete
 * sin tocar el código) o, campo a campo, las constantes de arriba. Un campo inválido cae al
 * valor por defecto (`validarConfig` ya lo reporta).
 */
function paqueteDe(config) {
  const p = esObj(config) && esObj(config.paquete) ? config.paquete : {};
  return {
    desde: fechaValida(p.desde) ? p.desde : DESDE_CALIDAD,
    semanas: Array.isArray(p.semanas) && p.semanas.length > 0 && p.semanas.every(fechaValida) ? p.semanas : SEMANAS_PAQUETE,
    motivo: esTexto(p.motivo) ? p.motivo : MOTIVO_PAQUETE,
  };
}

/** Un día cae en una semana del paquete (lunes a domingo). */
const enPaquete = (dia, config) => typeof dia === "string" && paqueteDe(config).semanas.some((l) => dia >= l && dia <= sumarDias(l, 6));

/** El hook exige candidatos y juez desde `paquete.desde` (comparación de AAAA-MM-DD). */
const exigeJuez = (p, config) => typeof p.dia === "string" && p.dia >= paqueteDe(config).desde;

/** Candidato elegido por el juez (`elegido` es 1-based: el número de la lista), o undefined si falta o no sirve. */
function candidatoElegido(hook) {
  if (!esObj(hook) || !Array.isArray(hook.candidatos) || !esObj(hook.juez)) return undefined;
  const i = hook.juez.elegido;
  return Number.isInteger(i) && i >= 1 && i <= hook.candidatos.length && esObj(hook.candidatos[i - 1]) ? hook.candidatos[i - 1] : undefined;
}

/**
 * Errores del hook con candidatos y juez (piezas desde `paquete.desde`): de 8 a 10
 * candidatos de al menos 3 patrones, `juez.elegido` válido (1-based: el número de la lista que ve el juez), `hook.texto` igual al
 * título elegido y `hook.score` igual a la nota del juez. Con `borrador`, además
 * los de `erroresDeHookBorrador` (la portada repite el candidato elegido).
 */
export function erroresDeHookJuez(p, borrador, config) {
  const errs = [];
  const h = esObj(p) ? p.hook : undefined;
  if (!esObj(h)) return errs; // "hook incompleto" ya lo dice erroresDePieza
  const cands = h.candidatos;
  if (!Array.isArray(cands)) errs.push(`hook.candidatos falta: desde el ${paqueteDe(config).desde} el hook sale de ${CANDIDATOS_MIN} a ${CANDIDATOS_MAX} candidatos`);
  else {
    if (cands.length < CANDIDATOS_MIN || cands.length > CANDIDATOS_MAX) errs.push(`hook.candidatos tiene ${cands.length}: deben ser ${CANDIDATOS_MIN} a ${CANDIDATOS_MAX} candidatos`);
    const patrones = new Set();
    cands.forEach((c, i) => {
      if (!esObj(c) || !esTexto(c.title)) return errs.push(`hook.candidatos[${i}] inválido: { patron, title, subtitle?, resultado? }`);
      if (!PATRONES_HOOK.includes(c.patron)) errs.push(`hook.candidatos[${i}].patron ${q(c.patron)} inválido (PATRONES_HOOK: ${PATRONES_HOOK.join(", ")})`);
      else patrones.add(c.patron);
      for (const k of ["subtitle", "resultado"]) if (c[k] !== undefined && !esTexto(c[k])) errs.push(`hook.candidatos[${i}].${k} debe ser texto`);
    });
    errs.push(...titulosLargos(cands, config));
    if (patrones.size < PATRONES_MIN) errs.push(`hook.candidatos usa ${patrones.size} patrón(es): se piden al menos ${PATRONES_MIN} patrones distintos (${PATRONES_HOOK.join(", ")})`);
  }
  const j = h.juez;
  if (!esObj(j)) errs.push("hook.juez falta: { elegido, nota, respuestas }");
  else {
    if (!Number.isInteger(j.elegido) || (Array.isArray(cands) && (j.elegido < 1 || j.elegido > cands.length))) errs.push(`hook.juez.elegido ${q(j.elegido)} inválido: número (desde 1) del candidato en hook.candidatos, el mismo que responde el juez`);
    if (typeof j.nota !== "number" || !Number.isFinite(j.nota) || j.nota < 0 || j.nota > 10) errs.push(`hook.juez.nota ${q(j.nota)} inválida (0 a 10)`);
    else if (h.score !== j.nota) errs.push(`hook.score debe ser la nota del juez (score ${q(h.score)}, nota ${q(j.nota)})`);
    if (!esTexto(j.respuestas)) errs.push("hook.juez.respuestas falta: la respuesta JSON del juez, tal cual");
    else {
      let r;
      try { r = JSON.parse(j.respuestas); } catch { r = undefined; }
      if (!esObj(r)) errs.push("hook.juez.respuestas debe ser el JSON del juez pegado tal cual (con elegido, nota y porCandidato), no un resumen");
      else {
        if (r.elegido !== j.elegido) errs.push(`hook.juez.respuestas: el elegido del juez (${q(r.elegido)}) no coincide con hook.juez.elegido (${q(j.elegido)})`);
        if (r.nota !== j.nota) errs.push(`hook.juez.respuestas: la nota del juez (${q(r.nota)}) no coincide con hook.juez.nota (${q(j.nota)})`);
        if (typeof p.dia === "string" && p.dia >= DESDE_PORTADA_LECTOR) errs.push(...vetoDelJuez(r, j.elegido));
      }
    }
  }
  const el = candidatoElegido(h);
  if (el && esTexto(el.title) && h.texto !== el.title) errs.push(`hook.texto ${q(h.texto)} debe ser el título del candidato elegido (${q(el.title)})`);
  if (esObj(borrador)) errs.push(...erroresDeHookBorrador(p, borrador));
  return errs;
}

/**
 * Desde este día la portada le habla al lector y la promesa va en el título: el juez
 * responde `soloTitulo` (qué consigues y con qué IA, leyendo solo el título) y no
 * puede elegir un candidato con "no sé" ahí ni uno que no pararía el pulgar. Motivo:
 * el 2026-10-30 el juez aprobó con 8 «Nunca supe qué pedirle a la IA» y «“¿Cómo va tu
 * área?” Informe listo», que el lector con prisa (solo el título) no entendió.
 */
export const DESDE_PORTADA_LECTOR = "2026-10-31";

/** Veto de la respuesta del juez sobre su propio elegido (ver DESDE_PORTADA_LECTOR). */
export function vetoDelJuez(r, elegido) {
  const pc = esObj(r.porCandidato) ? r.porCandidato[String(elegido)] : undefined;
  if (!esObj(pc) || !esTexto(pc.soloTitulo)) return [`hook.juez.respuestas: falta porCandidato.${elegido}.soloTitulo (desde el ${DESDE_PORTADA_LECTOR} el juez dice qué consigues y con qué IA leyendo solo el título)`];
  const errs = [];
  if (/^\s*no s[eé](?!\p{L})/iu.test(pc.soloTitulo)) errs.push(`hook.juez: el elegido tiene "no sé" en soloTitulo: el título solo no dice qué consigues; escribe candidatos con la promesa en el título y vuelve a pasar el juez`);
  if (pc.pulgar !== "sí") errs.push(`hook.juez: el elegido no pararía el pulgar (pulgar ${q(pc.pulgar)}); el juez no puede elegirlo`);
  return errs;
}

/**
 * Candidatos cuyo `title` pasa `puerta.tituloMaxPalabras`: si el juez elige uno, el
 * validador rechaza la portada, así que nunca llegan al juez (`--juez` se niega).
 */
export function titulosLargos(cands, config) {
  if (!Array.isArray(cands)) return [];
  const max = puerta(config, "tituloMaxPalabras");
  const errs = [];
  cands.forEach((c, i) => {
    if (!esObj(c) || !esTexto(c.title)) return;
    const n = palabras(c.title).length;
    const tope = topeTitulo(c.title, max, "title");
    if (n > tope) errs.push(`hook.candidatos[${i}].title tiene ${n} palabras (máximo ${tope}, ${tope === max ? "puerta.tituloMaxPalabras" : "portada pregunta-respuesta"}): acórtalo antes de pasarlo al juez`);
  });
  return errs;
}

/**
 * Desde este día cada pieza declara sus promesas: lo que la portada, el subtítulo o la
 * voz prometen (un número, «cómo», un resultado) y la slide donde se cumple. El ensayo
 * del 2026-10-24 perdió 3 de 6 piezas en el lector frío por P6 de promesa incumplida.
 */
export const DESDE_PROMESAS = "2026-10-26";
const exigePromesas = (p) => typeof p.dia === "string" && p.dia >= DESDE_PROMESAS;

/**
 * Piezas que se entienden (spec 2026-10-31): desde esta semana cada pieza trae `guion` (un paso
 * por escena, dirigido al lector) y las de `por-donde-partir`, `momento` y `capacidad` del banco
 * `_calendario/momentos.md`. Las semanas anteriores no lo conocían.
 */
export const DESDE_ENTENDER = "2026-11-09";
const GUION_PALABRAS = [2, 20];
/** Días mínimos entre dos piezas con la misma combinación momento × capacidad (4 semanas). */
const MOMENTO_DIAS_SIN_REPETIR = 35;
const SERIE_CON_MOMENTO = "por-donde-partir";

/** Errores de `pieza.guion` contra las slides del borrador (desde DESDE_ENTENDER). */
export function erroresDeGuion(pieza, borrador) {
  return seguro(() => {
    if (!esObj(pieza) || typeof pieza.dia !== "string" || pieza.dia < DESDE_ENTENDER) return [];
    const g = pieza.guion;
    if (!Array.isArray(g)) return [`falta guion: desde el ${DESDE_ENTENDER} cada pieza trae un paso por escena, dirigido al lector, escrito antes de las escenas`];
    const errs = [];
    const n = esObj(borrador) && Array.isArray(borrador.slides) ? borrador.slides.length : undefined;
    if (n !== undefined && g.length !== n) errs.push(`guion tiene ${g.length} pasos y el borrador ${n} slides: uno por slide`);
    g.forEach((x, i) => {
      const k = esTexto(x) ? palabras(x).length : 0;
      if (k < GUION_PALABRAS[0] || k > GUION_PALABRAS[1]) errs.push(`guion[${i + 1}] debe decir el paso de esa escena en ${GUION_PALABRAS[0]} a ${GUION_PALABRAS[1]} palabras (tiene ${k})`);
    });
    return errs;
  });
}

/**
 * Banco de `momentos.md`: ids de `## Momentos` y, por capacidad de `## Capacidades`, sus
 * referencias de respaldo (lista vacía = «ninguno todavía», no se usa).
 */
export function leerBanco(md) {
  const momentos = new Set();
  const capacidades = new Map();
  let seccion = "";
  for (const linea of String(md).split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(linea);
    if (h) {
      seccion = normalizar(h[1]);
      continue;
    }
    const m = /^-\s+`([a-z0-9-]+)`:/.exec(linea);
    if (!m) continue;
    if (seccion === "momentos") momentos.add(m[1]);
    else if (seccion === "capacidades") {
      const respaldo = linea.split(/respaldo:/)[1] ?? "";
      capacidades.set(m[1], [...respaldo.matchAll(/`(referencias\/[^`]+\.md)`/g)].map((x) => x[1]));
    }
  }
  return { momentos, capacidades };
}

/** Etapas del coaching (`_investigacion/alcance.json → etapas`), en orden. */
export const ETAPAS = ["perder-el-miedo", "adoptar", "liderar", "revalorizarse"];
const DIAS_HOJA = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0 };

/**
 * Hoja de ruta (`_calendario/hoja-de-ruta.md`, del usuario): un `## AAAA-MM-DD · <etapa> · <nombre>`
 * por lunes y, debajo, una línea `- lun|mie|vie: <título o ángulo> — `referencias/x.md`` por pieza.
 * Las secciones que no empiezan con fecha (p. ej. «Reserva») no son semanas. Devuelve las semanas
 * por lunes y los errores de formato (el validador los da como aviso: la escribe el usuario).
 */
export function leerHojaDeRuta(md) {
  const semanas = new Map();
  const errores = [];
  let actual;
  for (const linea of String(md).split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(linea);
    if (h) {
      actual = undefined;
      const partes = h[1].split("·").map((x) => x.trim());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(partes[0])) continue;
      const [lunes, etapa, nombre] = partes;
      if (!fechaValida(lunes) || diaSemana(lunes) !== 1) errores.push(`${lunes}: la semana se escribe con su lunes`);
      else if (!ETAPAS.includes(etapa)) errores.push(`${lunes}: etapa ${q(etapa)} no es una de ${ETAPAS.join(", ")}`);
      else if (semanas.has(lunes)) errores.push(`${lunes}: semana repetida`);
      else {
        actual = { lunes, etapa, nombre: nombre ?? "", piezas: [] };
        semanas.set(lunes, actual);
      }
      continue;
    }
    if (!actual) continue;
    const m = /^-\s+([a-z]{3}):\s*(.+?)\s*$/.exec(linea);
    if (!m) continue;
    if (!(m[1] in DIAS_HOJA)) {
      errores.push(`${actual.lunes}: día ${q(m[1])} inválido (lun, mar, mie, jue, vie, sab o dom)`);
      continue;
    }
    const dia = sumarDias(actual.lunes, (DIAS_HOJA[m[1]] + 6) % 7);
    if (actual.piezas.some((p) => p.dia === dia)) {
      errores.push(`${actual.lunes}: el ${m[1]} está dos veces (vale la primera línea)`);
      continue;
    }
    const referencias = [...m[2].matchAll(/`(referencias\/[^`]+\.md)`/g)].map((x) => x[1]);
    const guia = m[2].split(" — ")[0].trim();
    if (!referencias.length) errores.push(`${actual.lunes}: el ${m[1]} no cita ninguna referencia`);
    actual.piezas.push({ dia, guia, referencias });
  }
  return { semanas, errores };
}

/**
 * Avisos de la hoja de ruta para una semana: formato roto, un día que la hoja guía sin pieza, o
 * una pieza de ese día que no cita ninguna de sus referencias en `origen.referencias` (puede
 * apartarse, pero lo anota en `aprendizajes.md`). Sin hoja o sin la semana en ella no hay nada que avisar.
 */
export function avisosDeHojaDeRuta(plan, hoja) {
  if (!hoja || !esObj(plan) || !Array.isArray(plan.piezas)) return [];
  const out = hoja.errores.map((e) => `hoja-de-ruta.md: ${e}`);
  const semana = hoja.semanas.get(plan.semana);
  if (!semana) return out;
  for (const g of semana.piezas) {
    const p = plan.piezas.find((x) => esObj(x) && x.dia === g.dia);
    if (!p) {
      out.push(`${g.dia}: la hoja de ruta guía ese día (etapa ${semana.etapa}: ${q(g.guia)}) y no hay pieza; si la moviste, anota por qué en aprendizajes.md`);
      continue;
    }
    const citadas = esObj(p.origen) && Array.isArray(p.origen.referencias) ? p.origen.referencias : [];
    if (!g.referencias.some((r) => citadas.includes(r))) {
      out.push(`${typeof p.id === "string" ? p.id : g.dia}: se aparta de la hoja de ruta (etapa ${semana.etapa}: ${q(g.guia)}); si es a propósito, anota por qué en aprendizajes.md`);
    }
  }
  return out;
}

/**
 * Errores de `momento` y `capacidad` de una pieza de `por-donde-partir` (desde DESDE_ENTENDER):
 * existen en el banco, la capacidad tiene respaldo y una de sus referencias está en
 * `origen.referencias`, y la combinación no salió en las semanas `previos` de los últimos 35
 * días. `banco` undefined = falta `momentos.md`.
 */
export function erroresDeMomento(pieza, banco, previos = []) {
  return seguro(() => {
    if (!esObj(pieza) || pieza.serie !== SERIE_CON_MOMENTO || typeof pieza.dia !== "string" || pieza.dia < DESDE_ENTENDER) return [];
    if (!banco) return ["falta _calendario/momentos.md (el banco de momentos y capacidades): corre scripts/kb-calendario-install.sh"];
    const errs = [];
    if (!esTexto(pieza.momento)) errs.push(`falta momento: en ${SERIE_CON_MOMENTO} cada pieza parte de un momento de momentos.md`);
    else if (!banco.momentos.has(pieza.momento)) errs.push(`momento ${q(pieza.momento)} no está en momentos.md (propón los nuevos en aprendizajes.md)`);
    if (!esTexto(pieza.capacidad)) errs.push(`falta capacidad: en ${SERIE_CON_MOMENTO} cada pieza muestra una capacidad de momentos.md`);
    else if (!banco.capacidades.has(pieza.capacidad)) errs.push(`capacidad ${q(pieza.capacidad)} no está en momentos.md`);
    else {
      const respaldo = banco.capacidades.get(pieza.capacidad);
      const refs = esObj(pieza.origen) && Array.isArray(pieza.origen.referencias) ? pieza.origen.referencias : [];
      if (respaldo.length === 0) errs.push(`capacidad ${q(pieza.capacidad)} está sin respaldo en momentos.md: no se usa hasta que la base tenga una referencia gratis (pídela en candidatos.json)`);
      else if (!respaldo.some((r) => refs.includes(r))) errs.push(`capacidad ${q(pieza.capacidad)}: origen.referencias debe citar una de su respaldo (${respaldo.join(", ")})`);
    }
    if (esTexto(pieza.momento) && esTexto(pieza.capacidad) && fechaValida(pieza.dia)) {
      const dia = Date.parse(`${pieza.dia}T00:00:00Z`);
      for (const prev of Array.isArray(previos) ? previos : []) {
        if (!esObj(prev) || !fechaValida(prev.semana) || !Array.isArray(prev.piezas)) continue;
        const dias = (dia - Date.parse(`${prev.semana}T00:00:00Z`)) / 86_400_000;
        if (dias <= 0 || dias >= MOMENTO_DIAS_SIN_REPETIR) continue;
        const otra = prev.piezas.find((x) => esObj(x) && x.momento === pieza.momento && x.capacidad === pieza.capacidad);
        if (otra) errs.push(`la combinación ${pieza.momento} × ${pieza.capacidad} ya salió en ${q(otra.id)} (semana ${prev.semana}): no se repite en 4 semanas`);
      }
    }
    return errs;
  });
}

/** Forma de `promesas`: lista no vacía de `{ promesa, slide }` (slide 1-based). */
export function erroresDePromesas(promesas) {
  if (!Array.isArray(promesas) || promesas.length === 0) return [`falta promesas: desde el ${DESDE_PROMESAS} cada pieza lista [{ "promesa": "…", "slide": n }] con lo que promete la portada o la voz y la slide donde se cumple`];
  const errs = [];
  promesas.forEach((x, i) => {
    if (!esObj(x) || !esTexto(x.promesa)) errs.push(`promesas[${i}].promesa falta: la frase que promete, copiada de la pieza`);
    if (!esObj(x) || !Number.isInteger(x.slide) || x.slide < 1) errs.push(`promesas[${i}].slide ${q(esObj(x) ? x.slide : x)} inválida: número de la slide (desde 1) donde se cumple`);
  });
  return errs;
}

/**
 * Solo la portada del borrador contra el candidato elegido (si no hay elegido válido, nada:
 * eso lo dice `erroresDeHookJuez`). Con un `Clip` de portada (reel sin Hook) su `title` es
 * el título elegido y el elegido no trae `subtitle` ni `resultado` (el Clip no los muestra);
 * si no, el Hook del borrador repite título, subtítulo y resultado del elegido.
 */
export function erroresDeHookBorrador(p, borrador) {
  const el = esObj(p) ? candidatoElegido(p.hook) : undefined;
  if (!el || !esObj(borrador) || !Array.isArray(borrador.slides)) return [];
  const errs = [];
  const portada = borrador.slides[0];
  if (esObj(portada) && portada.template === "Clip") {
    const pr = esObj(portada.props) ? portada.props : {};
    if (el.title !== pr.title) errs.push(`el Clip de portada debe repetir el título del candidato elegido: title ${q(pr.title)} ≠ ${q(el.title)}`);
    for (const k of ["subtitle", "resultado"]) {
      if (el[k] !== undefined) errs.push(`con un Clip de portada el candidato elegido no lleva ${k} (el Clip no lo muestra): quítalo del candidato o usa un Hook de portada`);
    }
    return errs;
  }
  const hook = borrador.slides.find((s) => esObj(s) && s.template === "Hook");
  if (!esObj(hook) || !esObj(hook.props)) return errs;
  const pr = hook.props;
  const cmp = (campo, esperado, real) => {
    if (esperado !== real) errs.push(`el Hook del borrador debe repetir el candidato elegido: ${campo} ${q(real)} ≠ ${q(esperado)}`);
  };
  cmp("title", el.title, pr.title);
  cmp("subtitle", el.subtitle, pr.subtitle);
  if (el.resultado !== undefined) cmp("resultado", el.resultado, pr.resultado);
  return errs;
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
  else {
    const ctaP = ctaVigente(config, p.dia);
    if (ctaP && p.senal !== "dm") errs.push(`senal ${q(p.senal)}: desde el ${ctaP.desde} toda pieza va con senal "dm" (el cierre es Escríbeme ${ctaP.palabra})`);
  }
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
  if (exigeJuez(p, config)) errs.push(...erroresDeHookJuez(p, undefined, config));
  if (exigePromesas(p)) errs.push(...erroresDePromesas(p.promesas));
  if (!esObj(p.lectorFrio) || p.lectorFrio.resultado !== "ok") {
    errs.push(`lectorFrio.resultado debe ser exactamente "ok" (es ${q(esObj(p.lectorFrio) ? p.lectorFrio.resultado : p.lectorFrio)})`);
  } else {
    if (!Number.isInteger(p.lectorFrio.intentos) || p.lectorFrio.intentos < 1) {
      errs.push(`lectorFrio.intentos ${q(p.lectorFrio.intentos)} inválido (entero ≥ 1)`);
    }
    errs.push(...erroresDeNotas(p.lectorFrio.notas));
  }
  if (!esObj(p.origen) || ![p.origen.fichas, p.origen.referencias].every((x) => Array.isArray(x) && x.every((v) => typeof v === "string"))) {
    errs.push("origen inválido: { fichas: [...], referencias: [...] }");
  } else if (p.origen.fichas.length + p.origen.referencias.length === 0) errs.push("origen vacío: cita al menos una ficha o referencia de la base");
  if (p.derivadoDe !== undefined && p.derivadoDe !== null && !esTexto(p.derivadoDe)) errs.push("derivadoDe debe ser null o el id de la pieza ganadora");
  if (exigeJuez(p, config)) {
    const validas = seriesDe(config);
    // Con `config.series` cada pieza lleva serie (reel o carrusel); sin él, la serie sigue siendo opcional.
    if (esObj(config) && config.series !== undefined && (p.serie === undefined || p.serie === null)) errs.push(`falta serie: desde el ${paqueteDe(config).desde} cada pieza lleva una de ${validas.join(", ")}`);
    else if (p.serie !== undefined && p.serie !== null && !validas.includes(p.serie)) errs.push(`serie ${q(p.serie)} no vale desde el ${paqueteDe(config).desde}: usa ${validas.join(", ")}${esObj(config) && config.series !== undefined ? "" : " o null"}`);
  } else if (p.serie !== undefined && p.serie !== null && !(typeof p.serie === "string" && /^[a-z0-9-]{3,40}$/.test(p.serie))) errs.push("serie debe ser un slug (p. ej. hazlo-con-ia, lo-probe-por-ti) o null");
  if (p.variante !== undefined && !VARIANTES.includes(p.variante)) errs.push(`variante ${q(p.variante)} inválida (usa: ${VARIANTES.join(", ")}, o no la pongas)`);
  if (p.estado !== undefined && p.estado !== "planificado") errs.push(`estado ${q(p.estado)}: el planificador solo escribe "planificado"`);
  errs.push(...erroresDeParametros(p.parametros, config, p.dia));
  errs.push(...validarCaption(p.caption, config, typeof p.tema === "string" ? p.tema : undefined, p.dia));
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

/**
 * Gesto que debe pedir la pastilla del Cta según la señal objetivo: alguna de
 * estas raíces (sin tildes) en cualquier posición de una palabra del texto
 * ("Reenvíaselo" cuenta como envío). `retencion` acepta guardar o enviar.
 */
const RAICES_GUARDAR = ["guard"];
const RAICES_ENVIAR = ["envia", "manda", "compart", "pasa", "dile", "etiqueta"];
const GESTO_PASTILLA = {
  guardados: RAICES_GUARDAR,
  envios: RAICES_ENVIAR,
  comentarios: ["comenta", "escribe", "responde"],
  retencion: [...RAICES_GUARDAR, ...RAICES_ENVIAR],
  dm: ["escrib"],
};
const SUGERIDA_PASTILLA = { guardados: "Guárdalo", envios: "Envíaselo a alguien", comentarios: "Comenta PALABRA", retencion: "Guárdalo", dm: "Escríbeme PARTIR" };

/**
 * Errores de `handle` y de la pastilla (`cta`) del Cta. Sin `cta` el motor
 * dibuja "Link en bio →" (`pillContent` en `src/templates/Cta.tsx`), que no
 * pide el gesto de la señal; y el motor ya antepone la @ al handle.
 */
function erroresDePastilla(props, senal) {
  const errs = [];
  if (typeof props.handle === "string" && props.handle.startsWith("@")) {
    errs.push(`handle ${q(props.handle)} sin @: el motor la agrega (escribe ${q(props.handle.replace(/^@+/, ""))})`);
  }
  const sugerida = SUGERIDA_PASTILLA[senal];
  if (!esTexto(props.cta)) {
    errs.push(`falta cta (el texto de la pastilla): sin él el motor dibuja "Link en bio →"${sugerida ? `; para ${senal} usa p. ej. "${sugerida}"` : ""}`);
  } else if (GESTO_PASTILLA[senal]) {
    const ts = tokens(props.cta);
    if (!GESTO_PASTILLA[senal].some((r) => ts.some((t) => t.includes(r)))) {
      errs.push(`la pastilla ${q(props.cta)} no pide el gesto de la señal ${senal} (p. ej. "${sugerida}")`);
    }
  }
  return errs;
}

/** Palabras máximas del `resultado` del Hook (una notificación o una respuesta corta, legible en 1 s). */
const RESULTADO_MAX_PALABRAS = 20;
const MODOS_RESULTADO = ["aviso", "respuesta"];
/**
 * Desde esta semana el Hook del reel va sin tarjeta de resultado (la plantilla la
 * ignora en reel) y sin subtítulos quemados: la IA se ve en la escena 2 (`Screen`).
 * Regla `reel-sin-subtitulos` de reglas.json (pedido de Felipe, 2026-10-29).
 */
export const DESDE_REEL_SIN_TARJETA = "2026-11-02";

/**
 * Reel con Hook de portada desde DESDE_REEL_SIN_TARJETA: la slide 2 (la que sigue al
 * Hook) es una `Screen` con `app`, `prompt` y `respuesta`: reemplaza a la tarjeta de
 * resultado (la IA se ve antes del segundo 5). Con un Clip de portada no aplica (el
 * video ya es la IA haciéndolo).
 */
function erroresDeScreenTrasHook(b, p) {
  if (p.formato !== "reel" || typeof p.dia !== "string" || !fechaValida(p.dia) || p.dia < DESDE_REEL_SIN_TARJETA) return [];
  const [s1, s2] = b.slides;
  if (!esObj(s1) || s1.template !== "Hook") return [];
  const pide = `desde el ${DESDE_REEL_SIN_TARJETA} la slide 2 del reel es una Screen (justo después del Hook) con app, prompt y respuesta: la portada ya no muestra la tarjeta de resultado y la IA tiene que verse antes del segundo 5`;
  if (!esObj(s2) || s2.template !== "Screen") return [`slide 2: ${pide}; mueve o agrega la Screen ahí (es ${q(esObj(s2) ? s2.template : s2)})`];
  const props = esObj(s2.props) ? s2.props : {};
  const faltan = ["app", "prompt", "respuesta"].filter((k) => !esTexto(props[k]));
  return faltan.length ? [`slide 2: ${pide}; a la Screen le falta ${faltan.join(", ")}`] : [];
}

/**
 * `resultado` del Hook (el resultado en el primer cuadro): en reels, obligatorio
 * desde DESDE_NARRACION hasta antes de DESDE_REEL_SIN_TARJETA, con `app`;
 * ≤ RESULTADO_MAX_PALABRAS; `modo` aviso o respuesta. Si viene, siempre se valida.
 */
function erroresDeResultado(props, p) {
  const errs = [];
  const r = props.resultado;
  const exigido = p.formato === "reel" && typeof p.dia === "string" && fechaValida(p.dia) && p.dia >= DESDE_NARRACION && p.dia < DESDE_REEL_SIN_TARJETA;
  if (r === undefined) return exigido ? [`falta resultado: desde el ${DESDE_NARRACION} el Hook del reel muestra en el primer cuadro lo que la IA ya hizo (resultado + app)`] : [];
  if (!esTexto(r)) errs.push("resultado debe ser un texto no vacío (lo que se ve en pantalla cuando la IA terminó)");
  else if (palabras(r).length > RESULTADO_MAX_PALABRAS) errs.push(`resultado tiene ${palabras(r).length} palabras (máximo ${RESULTADO_MAX_PALABRAS}: se lee de un vistazo)`);
  if (!esTexto(props.app)) errs.push("con resultado va app (la IA que lo produjo: ChatGPT, NotebookLM…)");
  if (props.modo !== undefined && !MODOS_RESULTADO.includes(props.modo)) errs.push(`modo ${q(props.modo)} inválido (usa: ${MODOS_RESULTADO.join(", ")})`);
  return errs;
}

/**
 * `narracion` de un slide: solo en reels; desde DESDE_NARRACION, obligatoria en
 * cada escena del reel (3–24 palabras, NFC). El carrusel no la lleva.
 */
function erroresDeNarracion(s, p) {
  const v = s.narracion;
  if (p.formato !== "reel") return v === undefined ? [] : ["narracion solo va en reels (el carrusel no tiene voz)"];
  const exigida = typeof p.dia === "string" && fechaValida(p.dia) && p.dia >= DESDE_NARRACION;
  if (v === undefined) return exigida ? [`falta narracion: desde el ${DESDE_NARRACION} cada escena del reel dice en voz lo que se ve (${NARRACION_PALABRAS[0]}–${NARRACION_PALABRAS[1]} palabras)`] : [];
  if (typeof v !== "string" || !v.trim()) return ["narracion debe ser un texto no vacío (lo que dice la voz en esa escena)"];
  const errs = [];
  const n = palabras(v).length;
  if (n < NARRACION_PALABRAS[0] || n > NARRACION_PALABRAS[1]) errs.push(`narracion tiene ${n} palabras (debe tener de ${NARRACION_PALABRAS[0]} a ${NARRACION_PALABRAS[1]})`);
  if (v !== v.normalize("NFC")) errs.push("narracion no está en Unicode NFC (tildes compuestas): reescríbela con tildes normales");
  return errs;
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
  if (exigeJuez(p, config)) errs.push(...erroresDeHookBorrador(p, b));
  errs.push(...erroresDeHookVideo(b, p));
  errs.push(...erroresDeClips(b, p));
  errs.push(...erroresDeConcepto(b, p, config));
  if (!Array.isArray(b.slides)) {
    errs.push("slides debe ser una lista de slides");
    return errs;
  }
  const n = b.slides.length;
  if (n > MAX_SLIDES) errs.push(`el borrador tiene ${n} slides (máximo ${MAX_SLIDES}, límite de la API de Instagram)`);
  if (n < 2) errs.push(`el borrador tiene ${n} slides (mínimo 2: Hook y Cta)`);
  if (exigePromesas(p) && Array.isArray(p.promesas)) {
    p.promesas.forEach((x, i) => {
      if (esObj(x) && Number.isInteger(x.slide) && x.slide > n) errs.push(`promesas[${i}].slide ${x.slide} no existe: el borrador tiene ${n} slides`);
    });
  }
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
      // El motor compara el highlight sin normalizar: todo texto debe venir en NFC.
      else if ([v].flat().some((x) => typeof x === "string" && x !== x.normalize("NFC"))) {
        errs.push(`${donde} (${t}): ${k} no está en Unicode NFC (tildes compuestas): reescríbelo con tildes normales`);
      }
    }
    for (const k of cat.required) {
      const v = s.props[k];
      if (v === undefined || (typeof v === "string" && !v.trim())) errs.push(`${donde} (${t}): falta ${k}`);
    }
    if (esTexto(s.props.source)) hayFuente = true;
    errs.push(...erroresDeNarracion(s, p).map((e) => `${donde} (${t}): ${e}`));
    if (t === "Cta") errs.push(...erroresDePastilla(s.props, p.senal).map((e) => `${donde} (Cta): ${e}`));
    // highlight: el motor lo busca sin distinguir mayúsculas, pero con tildes exactas.
    const campo = DONDE_HIGHLIGHT[t];
    const hl = s.props.highlight;
    if (t === "Hook" && !esTexto(hl)) errs.push(`${donde} (Hook): falta highlight (la palabra clave que se pinta en lima)`);
    else if (campo && hl !== undefined && typeof s.props[campo] === "string" && typeof hl === "string") {
      if (!hl.trim() || !minus(s.props[campo]).includes(minus(hl))) {
        errs.push(`${donde} (${t}): el highlight ${q(hl)} no aparece tal cual en ${campo} (mismas tildes)`);
      }
    }
    // cursiva: frase del titular en serif cursiva; el motor la busca igual que el highlight.
    const campoCursiva = DONDE_CURSIVA[t];
    const cu = s.props.cursiva;
    if (campoCursiva && cu !== undefined && typeof s.props[campoCursiva] === "string" && typeof cu === "string") {
      if (!cu.trim() || !minus(s.props[campoCursiva]).includes(minus(cu))) {
        errs.push(`${donde} (${t}): la cursiva ${q(cu)} no aparece tal cual en ${campoCursiva} (mismas tildes)`);
      }
    }
    if (t === "Hook") errs.push(...erroresDeResultado(s.props, p).map((e) => `${donde} (Hook): ${e}`));
    if (s.background !== undefined) {
      const bg = s.background;
      if (!esObj(bg)) errs.push(`${donde} (${t}): background debe ser un objeto { ai }`);
      else {
        for (const k of Object.keys(bg)) if (!CAMPOS_FONDO.has(k)) errs.push(`${donde} (${t}): background.${k} no permitido (solo fondos ai; el look papel pone el resto)`);
        if (!esTexto(bg.ai)) errs.push(`${donde} (${t}): background.ai debe ser un texto (la descripción de la imagen)`);
        else if (t !== "Hook" && t !== "Cta") errs.push(`${donde} (${t}): fondo ai solo en Hook o Cta`);
        if (bg.brandStyle !== undefined && bg.brandStyle !== true) errs.push(`${donde} (${t}): brandStyle ${q(bg.brandStyle)} no permitido (el fondo ai siempre lleva el estilo de marca)`);
        if (bg.overlay !== undefined && !(typeof bg.overlay === "number" && bg.overlay >= 0 && bg.overlay <= 1)) errs.push(`${donde} (${t}): background.overlay debe ser un número entre 0 y 1`);
      }
    }
  });
  errs.push(...erroresDeScreenTrasHook(b, p));
  const plantillas = b.slides.map((s) => (esObj(s) ? s.template : undefined));
  if (plantillas[0] !== "Hook" && plantillas[0] !== "Clip") errs.push("la primera slide debe ser un Hook (la promesa va en la portada) o un Clip (el video es la portada)");
  if (plantillas.filter((t) => t === "Hook").length > 1) errs.push("solo puede haber un Hook");
  if (n >= 2 && plantillas[n - 1] !== "Cta") errs.push("la última slide debe ser un Cta (un solo gesto)");
  const ctaV = ctaVigente(config, p.dia);
  if (ctaV) {
    for (const s of b.slides) {
      if (!esObj(s) || s.template !== "Cta" || !esObj(s.props)) continue;
      if (!contienePalabraCta(s.props.title, ctaV.palabra) && !contienePalabraCta(s.props.cta, ctaV.palabra)) {
        errs.push(`el Cta debe pedir ${ctaV.palabra} (en el título o la pastilla; config.cta, desde el ${ctaV.desde})`);
      }
    }
  }
  if (!hayFuente) errs.push("falta source: cita al pie la ficha o referencia de origen en alguna slide");
  return errs;
}

/** Errores de los campos de planificación de una pieza, sin mirar su borrador ([] = válida). */
export function validarPieza(pieza, config) {
  return seguro(() => (esObj(pieza) ? erroresDePieza(pieza, config) : ["la pieza no es un objeto"]));
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
    errs.push(...reglasDeTexto(borrador, config, pieza.formato, pieza.dia));
    errs.push(...erroresDeRetencion(borrador, pieza, config));
    errs.push(...erroresDeGuion(pieza, borrador));
    return errs;
  });
}

/**
 * Errores de las rutas de `origen` (fichas y referencias): cada una relativa a
 * `raiz` (la raíz de la base), un archivo que existe y cuya ruta real (siguiendo
 * enlaces simbólicos) queda dentro de la base. Si `origen` no tiene la forma
 * correcta no dice nada (eso ya lo reporta `validarPieza`).
 */
export function erroresDeOrigen(pieza, raiz) {
  return seguro(() => {
    if (!esObj(pieza) || !esObj(pieza.origen) || typeof raiz !== "string") return [];
    let base;
    try {
      base = realpathSync(raiz);
    } catch {
      return [`origen: no se encontró la raíz de la base (${q(raiz)})`];
    }
    const errs = [];
    for (const campo of ["fichas", "referencias"]) {
      const rutas = pieza.origen[campo];
      if (!Array.isArray(rutas)) continue;
      for (const r of rutas) {
        if (typeof r !== "string") continue;
        const fuera = `origen.${campo}: ${q(r)} está fuera de la base (usa una ruta relativa a la raíz de la base, sin "..")`;
        if (!r.trim() || isAbsolute(r) || r.includes("\\") || r.split("/").includes("..")) {
          errs.push(fuera);
          continue;
        }
        let real;
        try {
          real = realpathSync(join(base, normalize(r)));
        } catch {
          errs.push(`origen.${campo}: ${q(r)} no existe en la base (cita solo fichas o referencias que existen)`);
          continue;
        }
        // Ruta real: un enlace simbólico dentro de la base podría apuntar afuera.
        if (real !== base && !real.startsWith(base + sep)) errs.push(fuera);
        else if (!statSync(real).isFile()) errs.push(`origen.${campo}: ${q(r)} no es un archivo (cita la ficha o referencia, no una carpeta)`);
      }
    }
    return errs;
  });
}

// --- referencias, alcance y candidatos --------------------------------------

/** Clave de comparación de un tema: sin `[[ ]]`, sin tildes, en minúsculas. */
export const claveTema = (t) => tokens(String(t).replace(/\[\[|\]\]/g, " ")).join(" ");

/** Ruta real de `r` dentro de `base` (sin "..", absolutas ni enlaces que salgan), o undefined. */
function dentroDeBase(base, r) {
  if (typeof r !== "string" || !r.trim() || isAbsolute(r) || r.includes("\\") || r.split("/").includes("..")) return undefined;
  try {
    const real = realpathSync(join(base, normalize(r)));
    return (real === base || real.startsWith(base + sep)) && statSync(real).isFile() ? real : undefined;
  } catch {
    return undefined;
  }
}

/** Frontmatter mínimo de una referencia: `revisado`, `aprendiz` y la lista `temas` (en línea o con guiones). */
function frontmatterReferencia(text) {
  const m = String(text).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return undefined;
  const lineas = m[1].split("\n");
  const quitar = (v) => v.trim().replace(/^(['"])(.*)\1$/, "$2");
  let revisado;
  let aprendiz;
  const temas = [];
  for (let i = 0; i < lineas.length; i++) {
    const kv = lineas[i].match(/^([\p{L}\w-]+):\s*(.*)$/u);
    if (!kv) continue;
    if (kv[1] === "revisado") revisado = quitar(kv[2]);
    if (kv[1] === "aprendiz") aprendiz = quitar(kv[2].replace(/\s#.*$/, ""));
    if (kv[1] === "temas") {
      const v = kv[2].trim();
      if (v.startsWith("[") && v.endsWith("]")) temas.push(...v.slice(1, -1).split(/,(?![^\[]*\]\])/).map(quitar).filter(Boolean));
      else for (let j = i + 1; j < lineas.length && /^\s*-\s+/.test(lineas[j]); j++) temas.push(quitar(lineas[j].replace(/^\s*-\s+/, "")));
    }
  }
  return { revisado, aprendiz, temas, body: m[2] };
}

/** Texto de `## Para la audiencia` hasta la siguiente sección `## ` (undefined si no está). */
function paraLaAudiencia(body) {
  const lineas = body.split("\n");
  const i = lineas.findIndex((l) => /^## Para la audiencia\s*$/.test(l));
  if (i === -1) return undefined;
  const fin = lineas.findIndex((l, j) => j > i && /^## /.test(l));
  return lineas.slice(i + 1, fin === -1 ? undefined : fin).join("\n");
}

/**
 * Por qué una referencia NO está lista para una pieza del tema `tema` en la semana
 * `semana` (undefined = lista): con el tema en `temas`, `revisado` de hace ≤ 60 días
 * y `## Para la audiencia` que no dice "No aplica a la cuenta". Una nota con
 * `aprendiz: pendiente` (el lector aprendiz no entendió su idea) tampoco está lista.
 */
export function motivoReferenciaNoLista(text, tema, semana) {
  const fm = frontmatterReferencia(text);
  if (!fm) return "no tiene frontmatter";
  if (!fm.temas.some((t) => claveTema(t) === claveTema(tema))) return `no es del tema ${tema} (su frontmatter temas no lo incluye)`;
  if (!fechaValida(fm.revisado)) return "no tiene revisado válido";
  if (fm.revisado < sumarDias(semana, -REFERENCIA_MAX_DIAS)) return `revisado ${fm.revisado} tiene más de ${REFERENCIA_MAX_DIAS} días`;
  const s = paraLaAudiencia(fm.body);
  if (s === undefined || !s.trim()) return 'no tiene "## Para la audiencia"';
  if (/^No aplica a la cuenta\b/m.test(s)) return 'su "## Para la audiencia" dice que no aplica a la cuenta';
  if (fm.aprendiz === "pendiente") return "aprendiz: pendiente (el lector aprendiz no entendió su idea; la investigación la completa en otra corrida)";
  return undefined;
}

/** `_investigacion/alcance.json` de la base: { dentro, despues, fuera } con claves de tema, o undefined si no existe o es ilegible. */
export function leerAlcance(raiz) {
  try {
    const a = JSON.parse(readFileSync(join(raiz, "_investigacion", "alcance.json"), "utf8"));
    if (!esObj(a)) return undefined;
    const set = (k) => new Set(lista(a[k]).map(claveTema));
    return { dentro: set("dentro"), despues: set("despues"), fuera: set("fuera") };
  } catch {
    return undefined;
  }
}

const enAlcance = (alcance, tema) => alcance.dentro.has(claveTema(tema)) || alcance.despues.has(claveTema(tema));

/**
 * Errores de sustancia de una pieza (semanas desde `DESDE_REFERENCIAS`): al menos una
 * referencia lista en `origen.referencias` y, si hay `alcance.json`, tema en `dentro`
 * o `despues`. Las rutas inseguras o inexistentes ya las reporta `erroresDeOrigen`.
 */
export function erroresDeReferencias(pieza, raiz, semana, alcance = leerAlcance(raiz)) {
  return seguro(() => {
    if (!esObj(pieza) || typeof raiz !== "string" || !fechaValida(semana) || semana < DESDE_REFERENCIAS) return [];
    const errs = [];
    if (typeof pieza.tema === "string" && alcance && !enAlcance(alcance, pieza.tema)) {
      errs.push(`tema ${pieza.tema} no está en "dentro" ni "despues" de _investigacion/alcance.json`);
    }
    const refs = esObj(pieza.origen) && Array.isArray(pieza.origen.referencias) ? pieza.origen.referencias.filter((r) => typeof r === "string") : [];
    if (!refs.length) return [...errs, "origen.referencias vacío: toda pieza se apoya en al menos una referencia lista (Paso 3)"];
    let base;
    try {
      base = realpathSync(raiz);
    } catch {
      return errs;
    }
    const motivos = [];
    for (const r of refs) {
      const real = dentroDeBase(base, r);
      if (!real) continue;
      const m = motivoReferenciaNoLista(readFileSync(real, "utf8"), String(pieza.tema ?? ""), semana);
      if (m === undefined) return errs;
      motivos.push(`${r}: ${m}`);
    }
    errs.push(`ninguna referencia lista en origen.referencias${motivos.length ? ` (${motivos.join("; ")})` : ""}`);
    return errs;
  });
}

/** Errores de `_calendario/candidatos.json` para la semana `semana` (el que escribe el planificador en el Paso 8). */
export function validarCandidatos(data, semana, alcance) {
  return seguro(() => {
    if (!esObj(data)) return ["candidatos.json debe ser un objeto { generado, temas }"];
    const errs = [];
    if (!fechaValida(data.generado)) errs.push(`candidatos.json: generado ${q(data.generado)} inválido (AAAA-MM-DD)`);
    else if (fechaValida(semana) && data.generado < semana) errs.push(`candidatos.json: generado ${data.generado} es de una semana anterior; escribe el de ${semana} (Paso 8)`);
    if (!Array.isArray(data.temas) || !data.temas.length) return [...errs, "candidatos.json: temas debe ser una lista con al menos un tema"];
    if (data.temas.length > MAX_CANDIDATOS) errs.push(`candidatos.json: ${data.temas.length} temas (máximo ${MAX_CANDIDATOS})`);
    const vistos = new Set();
    data.temas.forEach((t, i) => {
      const n = `candidatos.json: temas[${i}]`;
      if (!esObj(t)) return errs.push(`${n} no es un objeto`);
      if (typeof t.tema !== "string" || !/^\[\[[^\]]+\]\]$/.test(t.tema.trim())) errs.push(`${n}.tema ${q(t.tema)} debe ser "[[<Tema>]]"`);
      else {
        if (vistos.has(claveTema(t.tema))) errs.push(`${n}.tema ${t.tema} repetido`);
        vistos.add(claveTema(t.tema));
        if (alcance && !enAlcance(alcance, t.tema)) errs.push(`${n}.tema ${t.tema} no está en "dentro" ni "despues" de _investigacion/alcance.json`);
      }
      if (!MOTIVOS_CANDIDATO.includes(t.motivo)) errs.push(`${n}.motivo ${q(t.motivo)} inválido (usa: ${MOTIVOS_CANDIDATO.join(", ")})`);
      if (!esTexto(t.detalle)) errs.push(`${n}.detalle vacío: di qué necesitas que la investigación traiga`);
    });
    return errs;
  });
}

// --- lector frío ------------------------------------------------------------

/** Etiquetas por defecto de `MythReality` (las de `src/templates/MythReality.tsx`; un test las compara). */
const ETIQUETA_MITO = "Lo que se cree";
const ETIQUETA_REALIDAD = "Lo que pasa";
/** Rótulo por defecto del bloque de explicación de `Concepto` (el de `src/templates/Concepto.tsx`; un test los compara). */
const ROTULO_EN_SIMPLE = "En simple";
/** Etiqueta de la tarjeta de `Prompt` (`ETIQUETA_PROMPT` de `src/templates/Prompt.tsx`). */
const VENTANA_PROMPT = ["Copia esto"];
/** Etiqueta del mensaje de la persona en `Screen` (`src/templates/Screen.tsx`). */
const ETIQUETA_TU = "Tú";
/** "DESLIZA →" del Hook, solo en carrusel (`src/templates/Hook.tsx`). */
const DESLIZA = "Desliza →";

/**
 * COPIA de `pillContent` de `src/templates/Cta.tsx` (solo el texto): la
 * pastilla por defecto y sin emoji. `test/calendario/validar.ts` compara ambas.
 */
const EMOJI_PASTILLA = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
export function textoPastilla(cta) {
  const raw = cta ?? "Link en bio →";
  return String(raw).replace(EMOJI_PASTILLA, "").replace(/\s+/g, " ").trim();
}

/** Pista bajo la burbuja del Cta con «PARTIR» (`DM_PISTA` de `src/templates/Cta.tsx`). */
const DM_PISTA = "Por mensaje o en comentarios. Te respondo yo.";
/** COPIA de `pideDm` de `src/templates/Cta.tsx`: el Cta pide «PARTIR» (en la pastilla o en el título) y se pinta como mensaje directo. */
const pideDmLector = (...textos) => textos.some((t) => typeof t === "string" && /\bPARTIR\b/.test(t));

/** Texto de una prop si es texto no vacío (o un número, como un `step` 1). */
const txt = (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * El título con su `highlight` marcado entre ** ** (así ve el lector la palabra
 * pintada en lima). Si el highlight no aparece, va aparte.
 */
function conDestacado(titulo, hl) {
  const h = txt(hl);
  if (!titulo) return h ? [`**${h}**`] : [];
  if (!h) return [titulo];
  const i = minus(titulo).indexOf(minus(h));
  if (i < 0) return [titulo, `**${h}**`];
  return [`${titulo.slice(0, i)}**${titulo.slice(i, i + h.length)}**${titulo.slice(i + h.length)}`];
}

/** "Etiqueta: texto" como el panel de `MythReality`; con etiqueta "" solo el texto (igual que el componente). */
function conEtiqueta(etiqueta, defecto, texto) {
  const t = txt(texto);
  if (!t) return undefined;
  const e = typeof etiqueta === "string" ? etiqueta.trim() : defecto;
  return e ? `${e}: ${t}` : t;
}

/**
 * Líneas visibles de una slide. `prisa` = solo lo que se ve de un vistazo:
 * título con highlight, número de paso, prompt copiable, mito/realidad con sus
 * etiquetas y valor + label del dato. `source` nunca entra (es la cita al pie).
 */
function lineasSlide(template, p, prisa, formato) {
  const L = [];
  const add = (...xs) => {
    for (const x of xs.flat()) if (txt(x)) L.push(txt(x));
  };
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => `- ${x.trim()}`) : []);
  switch (template) {
    case "Hook":
      if (!prisa) add(p.eyebrow);
      // En reel el Hook no pinta la tarjeta de respuesta (src/templates/Hook.tsx): el lector no la ve.
      if (formato !== "reel" && txt(p.resultado)) add(`${txt(p.app) ?? "IA"} (${p.modo === "respuesta" ? "respuesta" : "aviso, ahora"}): ${txt(p.resultado)}`);
      add(conDestacado(txt(p.title), p.highlight));
      if (!prisa) {
        add(p.subtitle);
        if (p.swipe !== false && formato !== "reel") add(DESLIZA);
      }
      break;
    case "Lead":
      if (!prisa) add(p.kicker);
      add(conDestacado(txt(p.text), p.highlight));
      break;
    case "Step":
      add(p.step, conDestacado(txt(p.heading), p.highlight));
      if (!prisa) add(p.body, lista(p.bullets));
      break;
    case "Prompt":
      add(p.heading);
      if (!prisa) add(VENTANA_PROMPT);
      add(p.prompt);
      if (!prisa) add(p.note);
      break;
    case "Screen":
      if (!prisa) add(p.heading, p.app);
      add(`${ETIQUETA_TU}: ${txt(p.prompt) ?? ""}`.trim(), `${txt(p.app) ?? "IA"}: ${txt(p.respuesta) ?? ""}`.trim());
      if (!prisa) add(p.nota);
      break;
    case "MythReality":
      add(conEtiqueta(p.mythLabel, ETIQUETA_MITO, p.myth), conEtiqueta(p.realityLabel, ETIQUETA_REALIDAD, p.reality));
      break;
    case "Concepto":
      add(p.numero, conDestacado(txt(p.titulo), p.highlight));
      if (!prisa) add(p.idea);
      add(p.contraste);
      if (!prisa) add(conEtiqueta(typeof p.rotulo === "string" ? p.rotulo.replace(/:\s*$/, "") : p.rotulo, ROTULO_EN_SIMPLE, p.enSimple));
      break;
    case "Stat":
      add(p.value, p.label);
      if (!prisa) add(p.context);
      break;
    case "Clip":
      add("[video]");
      if (!prisa) add(p.label);
      add(conDestacado(txt(p.title), p.highlight));
      break;
    case "Cta":
      add(conDestacado(txt(p.title), p.highlight));
      // Con «PARTIR» se pinta la caja de mensaje: título, razón, burbuja «PARTIR» y la pista; ni pastilla ni @handle.
      if (pideDmLector(textoPastilla(typeof p.cta === "string" ? p.cta : undefined), txt(p.title))) {
        if (!prisa) add(p.reason);
        add("PARTIR");
        if (!prisa) add(DM_PISTA);
        break;
      }
      if (!prisa) add(p.reason, textoPastilla(typeof p.cta === "string" ? p.cta : undefined), txt(p.handle) ? `@${txt(p.handle)}` : undefined);
      break;
    default:
      break;
  }
  return L;
}

/**
 * Texto exacto que recibe cada lector frío, slide por slide y en orden:
 * `{ completo, conPrisa }`. Lo genera el código para que nadie lo arme a mano
 * (ni filtre el tema, el plan o la cita de la fuente). `formato` ("reel" o
 * "carrusel", por defecto carrusel como el componente) decide si el Hook
 * muestra "Desliza →". Con `conVoz` false (`config.voz === false`) no van las líneas «Voz:»:
 * el reel sale sin narración y el lector tiene que ver lo mismo. Nunca lanza.
 */
export function textosLector(borrador, formato, conVoz = true) {
  const armar = (prisa) => {
    try {
      if (!esObj(borrador) || !Array.isArray(borrador.slides)) return "";
      return borrador.slides
        .map((s, i) => {
          const lineas = esObj(s) && esObj(s.props) && typeof s.template === "string" ? lineasSlide(s.template, s.props, prisa, formato) : [];
          // En el reel la voz se oye en los dos perfiles (con prisa también escucha).
          if (formato === "reel" && conVoz && esObj(s) && txt(s.narracion)) lineas.push(`Voz: «${txt(s.narracion)}»`);
          return [`Slide ${i + 1}:`, ...lineas].join("\n");
        })
        .join("\n\n");
    } catch {
      return "";
    }
  };
  return { completo: armar(false), conPrisa: armar(true) };
}

/**
 * Mensaje completo para el subagente de un lector: la sección "Para el lector"
 * de `lector-frio.md` COPIADA (nunca su ruta: con la ruta, el lector tendría
 * `plan.json` al lado) y el texto que le toca.
 */
export function mensajeLector(seccionLector, perfil, texto) {
  return [
    `Responde como el perfil ${perfil === "conPrisa" ? '"con prisa"' : "completo"} de estas instrucciones. No abras ni busques ningún archivo: todo lo que necesitas está en este mensaje.`,
    "",
    seccionLector.trim(),
    "",
    "## Texto",
    "",
    texto,
  ].join("\n");
}

/**
 * Mensaje completo para el subagente juez: la sección "Para el juez" de
 * `guia-hooks.md` COPIADA y los candidatos numerados desde 1 (solo title,
 * subtitle y, fuera del reel, resultado: sin patrón, tema ni entregable, para no sesgarlo).
 */
export function mensajeJuez(seccion, candidatos, formato) {
  const items = candidatos.map((c, i) => {
    const lineas = [`${i + 1}. ${c.title}`];
    if (c.subtitle) lineas.push(`   Subtítulo: ${c.subtitle}`);
    // En el reel la tarjeta de resultado no se pinta (DESDE_REEL_SIN_TARJETA): el juez ve solo lo que se ve.
    if (c.resultado && formato !== "reel") lineas.push(`   Resultado en pantalla: ${c.resultado}`);
    return lineas.join("\n");
  });
  return [
    "Responde como el juez de estas instrucciones. No abras ni busques ningún archivo: todo lo que necesitas está en este mensaje.",
    "",
    seccion.trim(),
    "",
    "## Candidatos",
    "",
    items.join("\n\n"),
  ].join("\n");
}

/** La sección "## Para el juez" de `guia-hooks.md` (hasta el siguiente "## "). */
export function seccionDelJuez(md) {
  const i = md.indexOf("## Para el juez");
  if (i < 0) return undefined;
  const fin = md.indexOf("\n## ", i + 3);
  return md.slice(i, fin < 0 ? undefined : fin).trim();
}

/** La sección "## Para el lector" de `lector-frio.md` (hasta el siguiente "## "). */
export function seccionDelLector(md) {
  const i = md.indexOf("## Para el lector");
  if (i < 0) return undefined;
  const fin = md.indexOf("\n## ", i + 3);
  return md.slice(i, fin < 0 ? undefined : fin).trim();
}

// --- plan -------------------------------------------------------------------

/**
 * Errores del plan de la semana: fechas dentro de la semana (lunes a domingo),
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
    if (plan.caidas !== undefined) {
      // Piezas que no pasaron el lector frío y se quitaron: el bucle agrupa sus fallos por causa.
      if (!Array.isArray(plan.caidas)) errs.push("plan: caidas debe ser una lista de { id, intentos, notas }");
      else {
        plan.caidas.forEach((c, i) => {
          if (!esObj(c) || !esTexto(c.id)) errs.push(`plan: caidas[${i}] necesita id (texto)`);
          else if (c.notas !== undefined && typeof c.notas !== "string") errs.push(`plan: caidas[${i}].notas debe ser texto`);
          else if (c.intentos !== undefined && (!Number.isInteger(c.intentos) || c.intentos < 1)) errs.push(`plan: caidas[${i}].intentos debe ser un entero ≥ 1`);
        });
      }
    }
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
    // Entradas del mix ya usadas por una pieza (varias piezas por día: cada una toma una entrada distinta).
    const usadas = new Set();
    const [desde, hasta] = esObj(config) && Array.isArray(config.ventanaHoras) ? config.ventanaHoras : ["08:00", "23:00"];
    const conHora = [];
    /** Por tema (clave normalizada): piezas que lo usan, con su día. */
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
      const horaOk = typeof p.hora === "string" && HORA_RE.test(p.hora);
      if (!horaOk) errs.push(`${id}: hora ${q(p.hora)} inválida (HH:MM en :00 o :30, hora de Chile)`);
      else if (p.hora < desde || p.hora > hasta) errs.push(`${id}: hora ${p.hora} fuera de la ventana ${desde}–${hasta} (config.ventanaHoras)`);
      // Tiempo real (con el cambio de hora de Chile), no reloj local.
      if (diaOk && horaOk) conHora.push({ id, min: instanteSeguro(p.dia, p.hora, esObj(config) ? config.zona : undefined) });
      if (diaOk) {
        const dia = diaSemana(p.dia);
        const delDia = mix.map((x, k) => ({ x, k })).filter(({ x }) => x.dia === dia);
        const libres = delDia.filter(({ k }) => !usadas.has(k));
        const enExperimento = esObj(exp) && exp.variable === "arquetipo" && Array.isArray(exp.piezas) && exp.piezas.includes(p.id);
        if (!delDia.length) errs.push(`${id}: config.mix no tiene entrada para ese día`);
        else if (!libres.length) errs.push(`${id}: config.mix solo tiene ${delDia.length} entrada(s) para ese día y ya están tomadas por otras piezas`);
        else {
          // La entrada que mejor calza: misma hora, formato, arquetipo y serie; luego formato, arquetipo y serie;
          // luego misma hora y formato y arquetipo; luego formato y arquetipo;
          // luego misma hora y formato; luego mismo formato; si no, la primera libre.
          const calza = (f) => libres.find(({ x }) => f(x));
          const mismaSerie = (x) => (x.serie ?? null) === (p.serie ?? null);
          const m =
            calza((x) => x.hora === p.hora && x.formato === p.formato && x.arquetipo === p.arquetipo && mismaSerie(x)) ??
            calza((x) => x.formato === p.formato && x.arquetipo === p.arquetipo && mismaSerie(x)) ??
            calza((x) => x.hora === p.hora && x.formato === p.formato && x.arquetipo === p.arquetipo) ??
            calza((x) => x.formato === p.formato && x.arquetipo === p.arquetipo) ??
            calza((x) => x.hora === p.hora && x.formato === p.formato) ??
            calza((x) => x.formato === p.formato) ??
            libres[0];
          usadas.add(m.k);
          const slot = typeof m.x.hora === "string" ? ` (${m.x.hora})` : "";
          if (p.formato !== m.x.formato) errs.push(`${id}: formato ${q(p.formato)} no sigue el mix (ese día va ${m.x.formato}${slot})`);
          if (p.arquetipo !== m.x.arquetipo && !enExperimento) errs.push(`${id}: arquetipo ${q(p.arquetipo)} no sigue el mix (ese día va ${m.x.arquetipo}${slot})`);
          if (typeof m.x.serie === "string" && p.serie !== m.x.serie) errs.push(`${id}: serie ${q(p.serie ?? null)} no sigue el mix (ese día va ${m.x.serie}${slot})`);
        }
      }
      if (typeof p.tema === "string") {
        const clave = tokens(p.tema).join(" ");
        const esDerivado = esTexto(p.derivadoDe);
        const previas = temas.get(clave) ?? [];
        if (previas.length && !esDerivado) {
          // Con varias piezas por día un tema puede salir 2 veces en la semana (otro ángulo), nunca el mismo día.
          if (previas.length >= MAX_PIEZAS_POR_TEMA) errs.push(`${id}: tema repetido en la semana (${p.tema}); un tema sale a lo más ${MAX_PIEZAS_POR_TEMA} veces (salvo derivados con derivadoDe)`);
          else if (diaOk && previas.some((v) => v.dia === p.dia)) errs.push(`${id}: tema repetido el mismo día (${p.tema}, también en ${previas.find((v) => v.dia === p.dia).id}); la segunda pieza de un tema va otro día`);
        }
        temas.set(clave, [...previas, { id, dia: p.dia }]);
      }
    });
    if (semanaOk && semana >= DESDE_REFERENCIAS) {
      const noticias = plan.piezas.filter((p) => esObj(p) && p.pilar === "noticia").length;
      if (noticias > 1) errs.push(`plan: ${noticias} piezas con pilar "noticia" (a lo más 1 por semana)`);
    }
    const sep = esObj(config) && typeof config.separacionMinHoras === "number" ? config.separacionMinHoras : 20;
    conHora.sort((a, b) => a.min - b.min);
    for (let i = 1; i < conHora.length; i++) {
      const h = +((conHora[i].min - conHora[i - 1].min) / 60).toFixed(2);
      if (h < sep) errs.push(`${conHora[i].id}: está a ${h} h de ${conHora[i - 1].id} (mínimo ${sep} h, config.separacionMinHoras)`);
    }
    const paq = paqueteDe(config);
    if (semanaOk && paq.semanas.includes(semana)) {
      if (plan.piezas.length === 0 && (exp === null || exp === undefined)) {
        // sin piezas no hay nada que medir: experimento null, como fuera del paquete
      } else if (!(esObj(exp) && exp.variable === null && exp.motivo === paq.motivo)) {
        errs.push(`plan: la semana ${semana} es del ${paq.motivo} y no lleva experimento: usa experimento { "variable": null, "motivo": "${paq.motivo}" }`);
      }
    } else if (exp === null || exp === undefined) {
      if (plan.piezas.length > 0) errs.push("plan: falta experimento (una variable por semana)");
    } else if (!esObj(exp)) errs.push("plan: experimento debe ser un objeto o null");
    else {
      const variables = [...VARIABLES_FIJAS, ...(esObj(config) && esObj(config.puerta) ? Object.keys(config.puerta) : [])];
      if (!variables.includes(exp.variable)) errs.push(`plan: experimento.variable ${q(exp.variable)} no permitida (usa: ${variables.join(", ")})`);
      if (!esTexto(exp.hipotesis)) errs.push("plan: falta experimento.hipotesis");
      if (!Array.isArray(exp.piezas)) errs.push("plan: experimento.piezas debe ser una lista de ids");
      else for (const x of exp.piezas) if (!vistos.has(x)) errs.push(`plan: experimento.piezas: ${q(x)} no es una pieza del plan`);
      if (exp.confusores !== undefined && !(Array.isArray(exp.confusores) && exp.confusores.every(esTexto))) {
        errs.push("plan: experimento.confusores debe ser una lista de nombres (hora, formato, clip, hookVideo o una clave de parametros)");
      }
    }
    return errs;
  });
}

/**
 * Desde esta semana un confusor que el validador detecta y que no está en
 * `experimento.confusores` es error; antes, solo aviso.
 */
export const DESDE_CONFUSORES = "2026-10-26";
/** Claves de `parametros` que describen la pieza y varían solas (no son palancas). */
const NO_CONFUSORES = new Set(["tituloPalabras"]);

/**
 * Lo que cambia entre las piezas del experimento y su control además de la
 * variable declarada. Control: las piezas de la misma semana fuera del
 * experimento y del mismo formato. Se miran
 * `formato`, `hora`, cada clave de `parametros` y, con `borradores` (id →
 * borrador), si llevan `hookVideo` o slides `Clip`. Un confusor es una clave
 * cuyos valores no son los mismos en los dos lados. `sinControl` indica que no
 * hubo control en la semana (se compara contra semanas anteriores y no se revisa);
 * `sinContraste`, que la variable declarada vale lo mismo en los dos lados.
 */
export function confusoresDelExperimento(plan, borradores = new Map()) {
  const vacio = { confusores: [], sinControl: false, sinContraste: false };
  if (!esObj(plan) || !Array.isArray(plan.piezas) || !esObj(plan.experimento)) return vacio;
  const exp = plan.experimento;
  if (typeof exp.variable !== "string" || !Array.isArray(exp.piezas)) return vacio;
  const piezas = plan.piezas.filter((p) => esObj(p) && typeof p.id === "string");
  const dentro = piezas.filter((p) => exp.piezas.includes(p.id));
  if (!dentro.length) return vacio;
  const formatos = new Set(dentro.map((p) => p.formato));
  const control = piezas.filter((p) => !exp.piezas.includes(p.id) && formatos.has(p.formato));
  if (!control.length) return { ...vacio, sinControl: true };
  const b = (p) => (borradores instanceof Map && esObj(borradores.get(p.id)) ? borradores.get(p.id) : undefined);
  // hookVideo y Clip solo se comparan si se leyeron todos los borradores (uno ilegible no es "sin clip").
  const conBorradores = [...dentro, ...control].every((p) => b(p));
  const rasgos = (p) => {
    const r = { formato: p.formato, hora: p.hora };
    if (esObj(p.parametros)) for (const [k, v] of Object.entries(p.parametros)) if (!NO_CONFUSORES.has(k)) r[k] = v;
    const borr = b(p);
    if (conBorradores) {
      r.hookVideo = borr.hookVideo !== undefined;
      r.clip = contarClips([borr]) > 0;
    }
    return r;
  };
  const rd = dentro.map(rasgos);
  const rc = control.map(rasgos);
  const claves = [...new Set([...rd, ...rc].flatMap((r) => Object.keys(r)))];
  const valores = (rs, k) => [...new Set(rs.map((r) => (r[k] === undefined ? "—" : typeof r[k] === "string" ? r[k] : q(r[k]))))].sort();
  const distintos = (k) => valores(rd, k).join("|") !== valores(rc, k).join("|");
  const confusores = claves
    .filter((k) => k !== exp.variable && distintos(k))
    .map((k) => ({ clave: k, experimento: valores(rd, k), control: valores(rc, k) }));
  return { confusores, sinControl: false, sinContraste: claves.includes(exp.variable) && !distintos(exp.variable) };
}

/** Minutos UTC de una hora local; si la zona no es válida, usa America/Santiago. */
function instanteSeguro(dia, hora, zona) {
  try {
    return aUtc(dia, hora, typeof zona === "string" && zona ? zona : ZONA).getTime() / 60_000;
  } catch {
    return aUtc(dia, hora, ZONA).getTime() / 60_000;
  }
}

// --- config -----------------------------------------------------------------

/** Errores de `config.json` (lo edita el usuario). */
export function validarConfig(config) {
  return seguro(() => {
    if (!esObj(config)) return ["config.json debe ser un objeto"];
    const errs = [];
    if (!esTexto(config.zona)) errs.push("zona debe ser un texto (America/Santiago)");
    if (!Array.isArray(config.mix) || config.mix.length < 3 || config.mix.length > 7 * MAX_ENTRADAS_MIX_DIA) {
      errs.push(`mix debe tener de 3 a ${7 * MAX_ENTRADAS_MIX_DIA} entradas (una por pieza y día; hasta ${MAX_ENTRADAS_MIX_DIA} por día)`);
    } else {
      const porDia = new Map();
      const horas = new Set();
      config.mix.forEach((m, i) => {
        if (!esObj(m) || !Number.isInteger(m.dia) || m.dia < 0 || m.dia > 6 || !FORMATOS.includes(m.formato) || !esTexto(m.arquetipo)) {
          errs.push(`mix[${i}] inválido: { dia: 0-6 (0 = domingo), formato: reel|carrusel, arquetipo, hora?, serie? }`);
          return;
        }
        if (m.serie !== undefined && !seriesDe(config).includes(m.serie)) errs.push(`mix[${i}].serie ${q(m.serie)} inválida: usa ${seriesDe(config).join(", ")}`);
        if (m.hora !== undefined && !(typeof m.hora === "string" && HORA_RE.test(m.hora))) errs.push(`mix[${i}].hora ${q(m.hora)} inválida (HH:MM en :00 o :30)`);
        const n = (porDia.get(m.dia) ?? 0) + 1;
        porDia.set(m.dia, n);
        if (n > MAX_ENTRADAS_MIX_DIA) errs.push(`mix: día ${m.dia} tiene más de ${MAX_ENTRADAS_MIX_DIA} entradas`);
        if (typeof m.hora === "string") {
          const k = `${m.dia}|${m.hora}`;
          if (horas.has(k)) errs.push(`mix: día ${m.dia} repite la hora ${m.hora}`);
          horas.add(k);
        }
      });
      // Con más de una entrada el mismo día, cada una lleva su hora (si no, el planificador no sabe cuál va primero).
      for (const [dia, n] of porDia) {
        if (n > 1 && config.mix.some((m) => esObj(m) && m.dia === dia && typeof m.hora !== "string")) errs.push(`mix: día ${dia} tiene ${n} entradas y alguna sin hora (con varias piezas por día, cada entrada lleva su hora)`);
      }
    }
    if (config.series !== undefined && !(Array.isArray(config.series) && config.series.length > 0 && config.series.every((s) => typeof s === "string" && SLUG_SERIE_RE.test(s)))) {
      errs.push("series debe ser una lista no vacía de slugs (p. ej. por-donde-partir, lo-que-construi)");
    }
    // Cierre por DM (opcional): mal escrito, ctaDe lo ignora y la puerta quedaría abierta; por eso es error.
    const cta = config.cta;
    if (cta !== undefined && !(esObj(cta) && esTexto(cta.palabra) && cta.palabra === cta.palabra.toUpperCase() && fechaValida(cta.desde))) {
      errs.push('cta debe ser { "palabra": "PARTIR" (en mayúsculas), "desde": "AAAA-MM-DD" (primer día en que se exige) }');
    }
    if (!esObj(config.horasPorDefecto) || !Object.values(config.horasPorDefecto).every((h) => typeof h === "string" && HORA_RE.test(h))) {
      errs.push("horasPorDefecto: cada hora en HH:MM con :00 o :30");
    }
    const v = config.ventanaHoras;
    if (!Array.isArray(v) || v.length !== 2 || !v.every((h) => typeof h === "string" && HHMM_RE.test(h)) || v[0] >= v[1]) errs.push('ventanaHoras debe ser ["HH:MM", "HH:MM"]');
    for (const k of ["separacionMinHoras", "fondosIAMaxSemana", "scoreMin", "umbralAlcanceTasas"]) {
      if (typeof config[k] !== "number" || !Number.isFinite(config[k]) || config[k] < 0) errs.push(`${k} debe ser un número ≥ 0`);
    }
    if (config.hookVideoMaxSemana !== undefined && !(Number.isInteger(config.hookVideoMaxSemana) && config.hookVideoMaxSemana >= 0)) {
      errs.push("hookVideoMaxSemana debe ser un entero ≥ 0 (0 = sin clips de video)");
    }
    if (config.clipsMaxSemana !== undefined && !(Number.isInteger(config.clipsMaxSemana) && config.clipsMaxSemana >= 0)) {
      errs.push("clipsMaxSemana debe ser un entero ≥ 0 (reels con slides Clip por semana; 0 o ausente = ninguno)");
    }
    // Ventana de medición y semanas de experimento (opcionales; las lee el bot para el bucle y el resumen).
    const vm = config.ventanaMedicion;
    const vmValor = esObj(vm) ? vm.valor : vm;
    if (vm !== undefined && !VENTANAS_MEDICION.includes(vmValor)) {
      errs.push(`ventanaMedicion.valor ${q(vmValor)} inválido (usa: ${VENTANAS_MEDICION.join(", ")})`);
    }
    const se = config.semanasExperimento;
    const seValor = esObj(se) ? se.valor : se;
    if (se !== undefined && !(Number.isInteger(seValor) && seValor >= 1 && seValor <= 12)) {
      errs.push("semanasExperimento.valor debe ser un entero entre 1 y 12 (semanas hasta evaluar un experimento)");
    }
    // Fechas del paquete calidad-contenido (opcional; sin él valen DESDE_CALIDAD y SEMANAS_PAQUETE).
    const paq = config.paquete;
    if (paq !== undefined) {
      if (!esObj(paq)) errs.push('paquete debe ser { "desde": "AAAA-MM-DD" (lunes), "semanas": ["AAAA-MM-DD" (lunes), …], "motivo": "texto" }');
      else {
        const lunes = (d) => fechaValida(d) && diaSemana(d) === 1;
        if (!lunes(paq.desde)) errs.push(`paquete.desde ${q(paq.desde)} debe ser un lunes (AAAA-MM-DD): el primer día del paquete`);
        if (!Array.isArray(paq.semanas) || !paq.semanas.length || !paq.semanas.every(lunes)) errs.push("paquete.semanas debe ser una lista de lunes (AAAA-MM-DD): las semanas del paquete, sin experimento propio");
        if (!esTexto(paq.motivo)) errs.push("paquete.motivo debe ser un texto (el motivo que lleva el experimento de esas semanas)");
      }
    }
    const ex = config.explicativo;
    if (ex !== undefined && !(esObj(ex) && fechaValida(ex.desde) && diaSemana(ex.desde) === 1 && Number.isInteger(ex.cadaSemanas) && ex.cadaSemanas >= 1 && ex.cadaSemanas <= 8)) {
      errs.push('explicativo debe ser { "desde": "AAAA-MM-DD" (lunes), "cadaSemanas": 1-8 }: cada cuántas semanas el carrusel va explicativo');
    }
    if (!Array.isArray(config.pilares) || !config.pilares.length || !config.pilares.every(esTexto)) errs.push("pilares debe ser una lista de textos");
    if (!Array.isArray(config.hashtagsBase) || !config.hashtagsBase.every((h) => typeof h === "string" && HASHTAG_RE.test(h))) {
      errs.push("hashtagsBase debe ser una lista de hashtags en minúsculas (#ia)");
    } else if (config.hashtagsBase.length > 5) errs.push("hashtagsBase no puede tener más de 5");
    if (!Array.isArray(config.terminosTecnicos) || !config.terminosTecnicos.every(esTexto)) errs.push("terminosTecnicos debe ser una lista de textos");
    if (!Array.isArray(config.audios) || !config.audios.every((a) => typeof a === "string" && AUDIO_RE.test(a) && !a.includes(".."))) {
      errs.push("audios debe ser una lista de nombres de pista (sin rutas)");
    }
    if (config.voz !== undefined && config.voz !== false && !VOCES.includes(config.voz)) {
      errs.push(`voz ${q(config.voz)} inválida (usa: ${VOCES.join(", ")}, o false para reels sin narración)`);
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
        else if (k === "ritmoReel" && !PACES.includes(p.valor)) errs.push(`puerta.ritmoReel.valor ${q(p.valor)} inválido (usa: ${PACES.join(", ")})`);
      }
      for (const k of PUERTA_OPCIONAL) {
        const p = config.puerta[k];
        if (p === undefined) continue;
        if (!esObj(p)) errs.push(`puerta.${k} debe ser { valor, respaldo }`);
        else {
          if (!RESPALDOS.includes(p.respaldo)) errs.push(`puerta.${k}.respaldo debe ser ${RESPALDOS.join(" | ")}`);
          if (!(typeof p.valor === "number" && Number.isFinite(p.valor) && p.valor > 0)) errs.push(`puerta.${k}.valor tiene un tipo inválido (número mayor que 0)`);
        }
      }
    }
    return errs;
  });
}

// --- semana -----------------------------------------------------------------

/**
 * Momento × capacidad de toda la semana: lee `momentos.md` y los `plan.json` de las semanas
 * anteriores (carpetas hermanas; las ilegibles se ignoran) y no deja repetir una combinación
 * dentro de la semana.
 */
function erroresDeMomentosSemana(plan, dir) {
  const cal = join(dir, "..");
  let banco;
  try {
    banco = leerBanco(readFileSync(join(cal, "momentos.md"), "utf8"));
  } catch {
    banco = undefined;
  }
  const previos = [];
  try {
    for (const x of readdirSync(cal)) {
      if (!fechaValida(x) || x >= plan.semana) continue;
      const l = leerJson(join(cal, x, "plan.json"));
      if (!("error" in l) && esObj(l.data)) previos.push({ semana: x, piezas: l.data.piezas });
    }
  } catch {
    // sin carpetas hermanas legibles no hay con qué comparar
  }
  const out = [];
  const vistas = new Map();
  for (const p of plan.piezas) {
    if (!esObj(p)) continue;
    const id = typeof p.id === "string" ? p.id : "?";
    out.push(...erroresDeMomento(p, banco, previos).map((e) => `${id}: ${e}`));
    if (p.serie === SERIE_CON_MOMENTO && esTexto(p.momento) && esTexto(p.capacidad)) {
      const k = `${p.momento} × ${p.capacidad}`;
      if (vistas.has(k)) out.push(`${id}: la combinación ${k} se repite en la semana (ya está en ${q(vistas.get(k))})`);
      else vistas.set(k, id);
    }
  }
  return out;
}

/**
 * Valida la carpeta de una semana (`_calendario/<semana>/`): plan, cada
 * borrador, que existan las rutas de `origen` (relativas a la raíz de la base,
 * dos carpetas arriba, u `opts.raiz`), tope de fondos ai y score léxico. `opts.score(borrador)` devuelve
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
    const porId = new Map();
    // Raíz de la base: <base>/_calendario/<semana>. `opts.raiz` la fija; null no revisa origen.
    const raiz = opts?.raiz === null ? undefined : typeof opts?.raiz === "string" ? opts.raiz : join(dir, "..", "..");
    const score = typeof opts?.score === "function" ? opts.score : undefined;
    const alcance = raiz ? leerAlcance(raiz) : undefined;
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
      porId.set(p.id, b.data);
      out.push(...validarBorrador(p, b.data, config).map((e) => `${id}: ${e}`));
      if (raiz) {
        out.push(...erroresDeOrigen(p, raiz).map((e) => `${id}: ${e}`));
        out.push(...erroresDeReferencias(p, raiz, plan.semana, alcance).map((e) => `${id}: ${e}`));
      }
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
    if (raiz && fechaValida(plan.semana) && plan.semana >= DESDE_ENTENDER) out.push(...erroresDeMomentosSemana(plan, dir));
    if (raiz) {
      let hoja;
      try {
        hoja = leerHojaDeRuta(readFileSync(join(raiz, "_calendario", "hoja-de-ruta.md"), "utf8"));
      } catch {
        hoja = undefined;
      }
      avisos.push(...avisosDeHojaDeRuta(plan, hoja));
    }
    const fondos = contarFondosIA(borradores);
    if (fondos > config.fondosIAMaxSemana) out.push(`semana: ${fondos} fondos ai (máximo ${config.fondosIAMaxSemana}, config.fondosIAMaxSemana)`);
    const clips = contarHookVideo(borradores);
    const maxClips = config.hookVideoMaxSemana ?? HOOK_VIDEO_MAX_SEMANA;
    if (clips > maxClips) out.push(`semana: ${clips} reels con hookVideo (máximo ${maxClips}, config.hookVideoMaxSemana)`);
    if (semanaExplicativa(plan.semana, config)) {
      const carruseles = plan.piezas.filter((p) => esObj(p) && p.formato === "carrusel");
      const expl = carruseles.filter((p) => p.variante === "explicativo").length;
      if (carruseles.length > 0 && expl !== 1) out.push(`semana: toca carrusel explicativo (config.explicativo) y hay ${expl}: un carrusel de la semana va con variante "explicativo"`);
    }
    const conClip = contarClips(borradores);
    const maxConClip = Number.isInteger(config.clipsMaxSemana) ? config.clipsMaxSemana : 0;
    if (conClip > maxConClip) out.push(`semana: ${conClip} reels con Clip (máximo ${maxConClip}, config.clipsMaxSemana)`);
    if (raiz && fechaValida(plan.semana) && plan.semana >= DESDE_REFERENCIAS) {
      const c = leerJson(join(raiz, "_calendario", "candidatos.json"));
      if ("error" in c) out.push(`semana: _calendario/candidatos.json ${c.error} (escríbelo en el Paso 8, también con 0 piezas)`);
      else out.push(...validarCandidatos(c.data, plan.semana, alcance).map((e) => `semana: ${e}`));
    }
    const exp = plan.experimento;
    if (esObj(exp) && typeof exp.variable === "string") {
      const { confusores, sinControl, sinContraste } = confusoresDelExperimento(plan, porId);
      const declarados = Array.isArray(exp.confusores) ? exp.confusores : [];
      const exige = fechaValida(plan.semana) && plan.semana >= DESDE_CONFUSORES;
      for (const c of confusores) {
        if (declarados.includes(c.clave)) continue;
        const msg = `experimento ${q(exp.variable)} mezcla ${c.clave} (experimento ${c.experimento.join(", ")}; control ${c.control.join(", ")}): iguálalo o agrégalo a experimento.confusores`;
        (exige ? out : avisos).push(`plan: ${msg}`);
      }
      if (sinControl) avisos.push(`plan: experimento ${q(exp.variable)} sin control del mismo formato en la semana: se compara con semanas anteriores y no se revisan confusores`);
      if (sinContraste) avisos.push(`plan: experimento ${q(exp.variable)}: la variable vale lo mismo en el experimento y en el control`);
    }
    if (sinScore) avisos.push(`score léxico no evaluado en ${sinScore} pieza(s): falta el repo de código al lado; lo revisa el Mac antes de renderizar`);
    return out;
  });
  if (!Array.isArray(opts?.avisos)) for (const a of avisos) console.warn(`⚠ ${a}`);
  return errs;
}

// --- ejemplo embebido -------------------------------------------------------

/**
 * Semana de ejemplo (2026-11-02, primera del paquete pivote-coaching: mix de 3, series
 * por-donde-partir y lo-que-construi, señal dm y cierre PARTIR) y el borrador de su primera
 * pieza. `INSTRUCCIONES.md` muestra el plan como esqueleto y la primera pieza con su borrador
 * como ejemplo completo (un test lo verifica). `--self-test` los valida con la config instalada.
 */
export const EJEMPLO = {
  "plan": {
    "semana": "2026-11-02",
    "zona": "America/Santiago",
    "experimento": {
      "variable": null,
      "motivo": "paquete pivote-coaching"
    },
    "piezas": [
      {
        "id": "lun-reel-pdfs-a-podcast",
        "dia": "2026-11-02",
        "hora": "09:00",
        "formato": "reel",
        "arquetipo": "tutorial",
        "senal": "dm",
        "tema": "[[Aprendizaje con IA]]",
        "pilar": "trabajo",
        "serie": "por-donde-partir",
        "hook": {
          "categoria": "identificación",
          "texto": "Mis 6 informes pendientes: ahora los escucho",
          "score": 8,
          "candidatos": [
            {
              "patron": "resultado",
              "title": "Mis 6 informes pendientes: ahora los escucho",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "antes-despues",
              "title": "De 6 informes sin leer a escucharlos",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "en-juego",
              "title": "Mi primera tarea para la IA",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "error-comun",
              "title": "Yo no sabía qué pedirle a la IA",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "pregunta-del-jefe",
              "title": "«¿Leíste el informe?» Lo escuché",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "resultado",
              "title": "Le pregunté a la IA cómo ayudarme",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "antes-despues",
              "title": "Antes los acumulaba; ahora los escucho",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            },
            {
              "patron": "en-juego",
              "title": "Por dónde partí con la IA",
              "resultado": "Resumen de audio listo: mis 6 informes pendientes."
            }
          ],
          "juez": {
            "elegido": 1,
            "nota": 8,
            "respuestas": "{\"elegido\":1,\"nota\":8,\"porCandidato\":{\"1\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"soloTitulo\":\"escuchar mis informes pendientes en vez de leerlos\",\"teLlevas\":\"escuchar los informes que no alcanzo a leer\"},\"2\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"escuchar informes\"},\"3\":{\"pulgar\":\"no\",\"importa\":\"sí\",\"teLlevas\":\"no sé cuál tarea\"},\"4\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"qué pedirle, pero no sé qué me llevo\"},\"5\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"llegar a la reunión con el informe escuchado\"},\"6\":{\"pulgar\":\"sí\",\"importa\":\"no\",\"teLlevas\":\"una pregunta para la IA\"},\"7\":{\"pulgar\":\"no\",\"importa\":\"sí\",\"teLlevas\":\"escuchar en vez de acumular\"},\"8\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"por dónde partir, pero no sé con qué\"}}}"
          }
        },
        "emocion": [
          "alivio",
          "curiosidad"
        ],
        "entregable": "una primera tarea para la IA si no sabes por dónde partir: preguntarle a Gemini Notebook cómo te ayuda con tus informes y pedirle el resumen de audio en español para escucharlos",
        "fraseAmigo": "yo no sabía qué pedirle a la IA, así que le pregunté cómo me ayudaba con mis informes; ahora me los resume en audio y los escucho camino al trabajo",
        "momento": "leer-documento-largo",
        "capacidad": "texto-a-audio",
        "guion": [
          "el problema: tienes informes pendientes y no alcanzas a leerlos",
          "pregúntale a Gemini Notebook cómo te ayuda con tus informes",
          "por qué funciona: la IA te dice qué sabe hacer",
          "sube tus informes a un cuaderno en notebook.google",
          "pide el resumen de audio en español",
          "escríbeme PARTIR y te ayudo con los tuyos"
        ],
        "promesas": [
          {
            "promesa": "Mis 6 informes pendientes: ahora los escucho",
            "slide": 5
          },
          {
            "promesa": "Resumen de audio listo: mis 6 informes pendientes",
            "slide": 5
          }
        ],
        "lectorFrio": {
          "intentos": 2,
          "resultado": "ok",
          "notas": "v1: el lector con prisa no vio qué herramienta era; se nombró en la pantalla del Hook.\nNB: «no sé qué es un cuaderno» → completo P3: explicado en la pieza (slide 4: subí los 6 PDF a un cuaderno; la voz dice que es un cuaderno nuevo)"
        },
        "origen": {
          "fichas": [
            "fuentes/2026-10-04-dm-ejemplo.md"
          ],
          "referencias": [
            "referencias/notebooklm.md"
          ]
        },
        "derivadoDe": null,
        "caption": "Aprendizaje con IA: no sabía qué pedirle a la IA, le pregunté cómo me ayudaba y ahora escucho mis 6 informes pendientes.\n\nEscríbeme PARTIR por mensaje o en los comentarios y te ayudo con tu caso.\n\n#ia #inteligenciaartificial #herramientasia #notebooklm",
        "borrador": "lun-reel-pdfs-a-podcast.json",
        "estado": "planificado",
        "parametros": {
          "tituloMaxPalabras": 14,
          "bulletMaxPalabras": 12,
          "cuerpoMaxPalabras": 30,
          "cuerpoMaxPalabrasCarrusel": 50,
          "terminosTecnicosMax": 1,
          "siglasPermitidas": [
            "GPT",
            "PDF",
            "IA",
            "DM"
          ],
          "relleno": [
            "increíble",
            "brutal",
            "realmente",
            "básicamente",
            "la verdad",
            "muy"
          ],
          "hookUmbral": 7,
          "lecturaPalabrasPorSegundo": 2.5,
          "lecturaMinSegundos": 1.5,
          "reescriturasMax": 3,
          "logoEnCuadro0": true,
          "tituloPalabras": 7
        }
      },
      {
        "id": "mie-reel-mis-agentes-y-1-guardado",
        "dia": "2026-11-04",
        "hora": "09:00",
        "formato": "reel",
        "arquetipo": "atemporal",
        "senal": "dm",
        "tema": "[[Automatización con IA]]",
        "pilar": "trabajo",
        "serie": "lo-que-construi",
        "hook": {
          "categoria": "storytelling",
          "texto": "Armé agentes que publican solos: 1 guardado",
          "score": 8,
          "candidatos": [
            {
              "patron": "resultado",
              "title": "Mis agentes planifican la semana solos",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "dato-contrario",
              "title": "Armé agentes que publican solos: 1 guardado",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "error-comun",
              "title": "Mi error: automatizar antes de saber qué decir",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "antes-despues",
              "title": "De 2 reels al día a 3 por semana",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "en-juego",
              "title": "27 piezas automáticas y nadie las guardó",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "resultado",
              "title": "Lo que aprendí armando agentes de IA",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "dato-contrario",
              "title": "La máquina funcionaba; el mensaje no",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            },
            {
              "patron": "error-comun",
              "title": "Automaticé todo menos lo importante",
              "resultado": "Semana planificada: 3 piezas, todas validadas."
            }
          ],
          "juez": {
            "elegido": 2,
            "nota": 8,
            "respuestas": "{\"elegido\":2,\"nota\":8,\"porCandidato\":{\"1\":{\"pulgar\":\"no\",\"importa\":\"no\",\"teLlevas\":\"que tiene agentes\"},\"2\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"soloTitulo\":\"saber qué pasó al automatizar la publicación con agentes de IA\",\"teLlevas\":\"que automatizar no basta si nadie lo guarda\"},\"3\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"pensar qué decir antes de automatizar\"},\"4\":{\"pulgar\":\"no\",\"importa\":\"no\",\"teLlevas\":\"un cambio de frecuencia\"},\"5\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"que el volumen no sirve solo\"},\"6\":{\"pulgar\":\"no\",\"importa\":\"sí\",\"teLlevas\":\"aprendizajes\"},\"7\":{\"pulgar\":\"sí\",\"importa\":\"no\",\"teLlevas\":\"una frase\"},\"8\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"no automatizar todo\"}}}"
          }
        },
        "emocion": [
          "curiosidad",
          "validación"
        ],
        "entregable": "lo que aprendí armando agentes que planifican y publican esta cuenta: con 27 piezas y 1 guardado, lo que faltaba no era automatizar más sino saber a quién le hablaba; y cada vez que algo fallaba igual, sumar una regla a las instrucciones en vez de corregir a mano",
        "fraseAmigo": "armé un sistema que escribe y publica solo; funcionó, pero nadie guardaba nada, porque le faltaba saber a quién le hablaba",
        "promesas": [
          {
            "promesa": "Armé agentes que publican solos",
            "slide": 2
          },
          {
            "promesa": "1 guardado",
            "slide": 3
          }
        ],
        "lectorFrio": {
          "intentos": 1,
          "resultado": "ok",
          "notas": "los dos lectores entendieron qué aprendí y nombraron algo nuevo en la 8 a la primera"
        },
        "origen": {
          "fichas": [],
          "referencias": [
            "referencias/ingenieria-de-arnes.md",
            "referencias/building-effective-agents.md"
          ]
        },
        "derivadoDe": null,
        "caption": "Automatización con IA: armé un sistema que planifica y publica esta cuenta. 27 piezas, 1 guardado, y lo que aprendí.\n\nEscríbeme PARTIR por mensaje o en los comentarios y te ayudo con tu caso.\n\n#ia #inteligenciaartificial #herramientasia",
        "borrador": "mie-reel-mis-agentes-y-1-guardado.json",
        "estado": "planificado",
        "parametros": {
          "tituloMaxPalabras": 14,
          "bulletMaxPalabras": 12,
          "cuerpoMaxPalabras": 30,
          "cuerpoMaxPalabrasCarrusel": 50,
          "terminosTecnicosMax": 1,
          "siglasPermitidas": [
            "GPT",
            "PDF",
            "IA",
            "DM"
          ],
          "relleno": [
            "increíble",
            "brutal",
            "realmente",
            "básicamente",
            "la verdad",
            "muy"
          ],
          "hookUmbral": 7,
          "lecturaPalabrasPorSegundo": 2.5,
          "lecturaMinSegundos": 1.5,
          "reescriturasMax": 3,
          "logoEnCuadro0": true,
          "tituloPalabras": 7
        }
      },
      {
        "id": "vie-carrusel-mis-3-primeros-pedidos",
        "dia": "2026-11-06",
        "hora": "13:00",
        "formato": "carrusel",
        "arquetipo": "lista",
        "senal": "dm",
        "tema": "[[Liderazgo y gestión de equipos]]",
        "pilar": "trabajo",
        "serie": "con-tu-equipo",
        "hook": {
          "categoria": "identificación",
          "texto": "No sabía qué pedirle a ChatGPT como jefe: partí con 3",
          "score": 8,
          "candidatos": [
            {
              "patron": "resultado",
              "title": "Mis 3 primeros pedidos a ChatGPT como jefe",
              "subtitle": "Los que publicó OpenAI para quien lidera un equipo"
            },
            {
              "patron": "en-juego",
              "title": "No sabía qué pedirle a ChatGPT como jefe: partí con 3",
              "subtitle": "Informe semanal, feedback difícil y carga del equipo"
            },
            {
              "patron": "error-comun",
              "title": "Mi error: pedirle a ChatGPT «ayúdame con esto»",
              "subtitle": "Los 3 pedidos que sí me sirvieron como jefe"
            },
            {
              "patron": "pregunta-del-jefe",
              "title": "«¿Ya usas IA?» Así empecé yo",
              "subtitle": "3 pedidos de jefe para tu primera semana"
            },
            {
              "patron": "antes-despues",
              "title": "De no saber qué pedir a 3 pedidos fijos",
              "subtitle": "Para el informe, el feedback y la carga del equipo"
            },
            {
              "patron": "resultado",
              "title": "Mi informe semanal al jefe, armado con ChatGPT",
              "subtitle": "Y otros 2 pedidos para empezar"
            },
            {
              "patron": "en-juego",
              "title": "Lo que le pido a ChatGPT antes de un feedback difícil",
              "subtitle": "Y 2 pedidos más para partir como jefe"
            },
            {
              "patron": "error-comun",
              "title": "No partí por una herramienta: partí por 3 pedidos",
              "subtitle": "Los de la guía de OpenAI para jefes"
            }
          ],
          "juez": {
            "elegido": 2,
            "nota": 8,
            "respuestas": "{\"elegido\":2,\"nota\":8,\"porCandidato\":{\"1\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"3 pedidos\"},\"2\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"soloTitulo\":\"3 pedidos para partir con ChatGPT como jefe\",\"teLlevas\":\"por dónde partir como jefe, con 3 pedidos concretos\"},\"3\":{\"pulgar\":\"sí\",\"importa\":\"no\",\"teLlevas\":\"no pedir «ayúdame»\"},\"4\":{\"pulgar\":\"no\",\"importa\":\"sí\",\"teLlevas\":\"cómo empezó él\"},\"5\":{\"pulgar\":\"no\",\"importa\":\"sí\",\"teLlevas\":\"3 pedidos\"},\"6\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"el informe semanal\"},\"7\":{\"pulgar\":\"sí\",\"importa\":\"sí\",\"teLlevas\":\"preparar un feedback\"},\"8\":{\"pulgar\":\"sí\",\"importa\":\"no\",\"teLlevas\":\"no partir por una herramienta\"}}}"
          }
        },
        "emocion": [
          "alivio",
          "identificación"
        ],
        "entregable": "los 3 pedidos de la guía oficial de OpenAI con que partí como jefe: el informe semanal al jefe con logros, bloqueos y pedidos; 2 o 3 formas de dar un feedback difícil, con pros y contras; y marcar en la planilla de horas a quien pase de 45 horas por 2 semanas",
        "fraseAmigo": "si no sabes qué pedirle a ChatGPT como jefe, parte por lo que ya haces cada semana: el informe para tu jefe, un feedback difícil y revisar la carga del equipo",
        "promesas": [
          {
            "promesa": "No sabía qué pedirle a ChatGPT como jefe",
            "slide": 2
          },
          {
            "promesa": "partí con 3",
            "slide": 3
          },
          {
            "promesa": "Informe semanal, feedback difícil y carga del equipo",
            "slide": 5
          }
        ],
        "lectorFrio": {
          "intentos": 1,
          "resultado": "ok",
          "notas": "los dos lectores entendieron el entregable y nombraron algo nuevo en la 8 a la primera"
        },
        "origen": {
          "fichas": [],
          "referencias": [
            "referencias/chatgpt-para-managers.md"
          ]
        },
        "derivadoDe": null,
        "caption": "Liderazgo con IA: no sabía qué pedirle a ChatGPT como jefe y partí con 3 pedidos de la guía de OpenAI.\n\nEscríbeme PARTIR por mensaje o en los comentarios y te ayudo con tu caso.\n\n#ia #inteligenciaartificial #herramientasia",
        "borrador": "vie-carrusel-mis-3-primeros-pedidos.json",
        "estado": "planificado",
        "parametros": {
          "tituloMaxPalabras": 14,
          "bulletMaxPalabras": 12,
          "cuerpoMaxPalabras": 30,
          "cuerpoMaxPalabrasCarrusel": 50,
          "terminosTecnicosMax": 1,
          "siglasPermitidas": [
            "GPT",
            "PDF",
            "IA",
            "DM"
          ],
          "relleno": [
            "increíble",
            "brutal",
            "realmente",
            "básicamente",
            "la verdad",
            "muy"
          ],
          "hookUmbral": 7,
          "lecturaPalabrasPorSegundo": 2.5,
          "lecturaMinSegundos": 1.5,
          "reescriturasMax": 3,
          "logoEnCuadro0": true,
          "tituloPalabras": 11
        }
      }
    ]
  },
  "borrador": {
    "name": "lun-reel-pdfs-a-podcast",
    "angle": "mi primera tarea para la IA: le pregunté cómo me ayudaba con mis informes pendientes y ahora los escucho",
    "pillar": "trabajo",
    "pace": "gancho",
    "audio": "lima-01.mp3",
    "logoEnCuadro0": true,
    "slides": [
      {
        "template": "Hook",
        "props": {
          "title": "Mis 6 informes pendientes: ahora los escucho",
          "highlight": "los escucho",
          "resultado": "Resumen de audio listo: mis 6 informes pendientes.",
          "app": "Gemini Notebook",
          "modo": "aviso"
        },
        "narracion": "Si no sabes por dónde partir con la IA, yo partí por aquí."
      },
      {
        "template": "Screen",
        "props": {
          "app": "Gemini Notebook",
          "prompt": "¿Cómo me ayudas con estos 6 informes?",
          "respuesta": "Puedo resumirlos en audio, hacerte tarjetas o responder citando cada informe."
        },
        "narracion": "Le escribí esto a Gemini Notebook, la herramienta de Google para estudiar tus documentos, y me ofreció tres caminos."
      },
      {
        "template": "Lead",
        "props": {
          "text": "No sabía qué pedirle a la IA, así que le pregunté.",
          "highlight": "le pregunté"
        },
        "narracion": "Tenía seis informes sin leer y ninguna idea de qué pedirle a la IA."
      },
      {
        "template": "Step",
        "props": {
          "step": "1",
          "heading": "Subí mis informes a un cuaderno",
          "body": "En notebook.google, con los 6 PDF."
        },
        "narracion": "Primero creé un cuaderno nuevo y subí ahí los seis informes en PDF."
      },
      {
        "template": "Step",
        "props": {
          "step": "2",
          "heading": "Pedí el resumen de audio",
          "body": "En español latinoamericano."
        },
        "narracion": "Después elegí el español latinoamericano y pedí el resumen de audio. Lo escuché caminando."
      },
      {
        "template": "Cta",
        "props": {
          "title": "¿Qué informes tienes pendientes? Te ayudo con los tuyos",
          "highlight": "pendientes",
          "cta": "Escríbeme PARTIR",
          "source": "Fuente: notebook.google"
        },
        "narracion": "¿No sabes cuál sería tu primera tarea? Escríbeme y te cuento."
      }
    ]
  }
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

// --- probar una regla -------------------------------------------------------

/** Pieza de un error de `validarSemana` (`"<id>: …"`); los de plan, semana o config son de la semana entera. */
const piezaDeError = (e) => {
  const m = /^([a-z0-9-]{3,80}): /.exec(e);
  return m && !["plan", "semana"].includes(m[1]) ? m[1] : "(semana)";
};

/**
 * Prueba una regla antes de aplicarla: valida cada semana pasada de `dir`
 * (`_calendario/`) con la config y el validador vigentes y con los candidatos, y
 * devuelve lo que cambia. Como las reglas de hoy ya rechazan cosas de semanas viejas,
 * solo cuentan los errores **nuevos** (los que la candidata agrega) y los que
 * **desaparecen** (los que dejaría pasar). No revisa `origen` ni referencias (dependen
 * de la fecha, no de la regla). `opts.validarCandidato` es el `validarSemana` de otro
 * `validar.mjs` (por defecto, este); `opts.score` se usa solo si cambia `scoreMin`.
 * `opts.ganadoras`: claves `"<semana>/<id>"` (de `bucle.json`). Nunca lanza.
 */
export function probarRegla(dir, configActual, configCandidata, opts = {}) {
  const validarCandidato = typeof opts.validarCandidato === "function" ? opts.validarCandidato : validarSemana;
  const ganadoras = new Set(Array.isArray(opts.ganadoras) ? opts.ganadoras : []);
  const out = { semanas: [], piezas: 0, publicadas: 0, ganadoras: 0, rechazadas: [], liberadas: [], errores: [] };
  const ec = validarConfig(configCandidata);
  if (ec.length) {
    out.errores = ec.map((e) => `config candidata: ${e}`);
    return out;
  }
  // El score léxico es caro (un proceso por pieza): solo si la candidata mueve scoreMin, y una vez por borrador.
  const cambiaScore = esObj(configActual) && configActual.scoreMin !== configCandidata.scoreMin;
  const cache = new Map();
  const score = cambiaScore && typeof opts.score === "function"
    ? (b) => {
        const k = JSON.stringify(b);
        if (!cache.has(k)) cache.set(k, opts.score(b));
        return cache.get(k);
      }
    : undefined;
  let semanas = [];
  try {
    semanas = readdirSync(dir).filter((x) => fechaValida(x) && existsSync(join(dir, x, "plan.json"))).sort();
  } catch (e) {
    out.errores.push(`no se pudo leer ${dir}: ${e instanceof Error ? e.message : e}`);
    return out;
  }
  for (const semana of semanas) {
    const sd = join(dir, semana);
    const plan = leerJson(join(sd, "plan.json"));
    if ("error" in plan || !esObj(plan.data) || !Array.isArray(plan.data.piezas)) continue;
    out.semanas.push(semana);
    const estado = leerJson(join(sd, "estado.json"));
    const publicada = (id) => !("error" in estado) && esObj(estado.data) && esObj(estado.data[id]) && estado.data[id].estado === "publicado";
    for (const p of plan.data.piezas) {
      if (!esObj(p)) continue;
      out.piezas++;
      if (publicada(p.id)) out.publicadas++;
      if (ganadoras.has(`${semana}/${p.id}`)) out.ganadoras++;
    }
    const correr = (fn, config) => {
      try {
        return fn(sd, config, { raiz: null, avisos: [], ...(score ? { score } : {}) });
      } catch (e) {
        return [`(semana): el validador lanzó: ${e instanceof Error ? e.message : e}`];
      }
    };
    // Sin score, validarSemana no lo evalúa: los dos lados quedan parejos.
    const antes = new Set(correr(validarSemana, configActual));
    const despues = new Set(correr(validarCandidato, configCandidata));
    const agrupar = (errs, lista) => {
      const porPieza = new Map();
      for (const e of errs) porPieza.set(piezaDeError(e), [...(porPieza.get(piezaDeError(e)) ?? []), e]);
      for (const [id, es] of porPieza) {
        lista.push({ semana, id, publicada: id !== "(semana)" && publicada(id), ganadora: ganadoras.has(`${semana}/${id}`), errores: es });
      }
    };
    agrupar([...despues].filter((e) => !antes.has(e)), out.rechazadas);
    agrupar([...antes].filter((e) => !despues.has(e)), out.liberadas);
  }
  return out;
}

/** Ganadoras de `bucle.json` (`ganadores` y `ganadoresVistos`) como `"<semana>/<id>"`. */
export function ganadorasDeBucle(bucle) {
  const out = new Set();
  if (!esObj(bucle)) return [];
  for (const g of Array.isArray(bucle.ganadores) ? bucle.ganadores : []) {
    if (esObj(g) && typeof g.semana === "string" && typeof g.piezaId === "string") out.add(`${g.semana}/${g.piezaId}`);
  }
  if (esObj(bucle.ganadoresVistos)) for (const k of Object.keys(bucle.ganadoresVistos)) out.add(k);
  return [...out].sort();
}

/** Informe de `probarRegla` para la consola; la última línea es la que cita la `Propuesta:`. */
export function informePrueba(r) {
  if (r.errores.length) return r.errores.map((e) => `✗ ${e}`).join("\n");
  const pub = r.rechazadas.filter((x) => x.publicada);
  const gan = r.rechazadas.filter((x) => x.ganadora);
  const lineas = [`Prueba sobre ${r.semanas.length} semana(s) (${r.semanas[0] ?? "—"} … ${r.semanas.at(-1) ?? "—"}): ${r.piezas} piezas, ${r.publicadas} publicadas, ${r.ganadoras} ganadora(s).`];
  const fila = (x) => `  ${x.ganadora ? "★" : x.publicada ? "•" : " "} ${x.semana}/${x.id}${x.ganadora ? " (GANADORA)" : x.publicada ? " (publicada)" : ""}\n${x.errores.map((e) => `      ${e}`).join("\n")}`;
  if (r.rechazadas.length) lineas.push(`✗ La candidata agrega errores en ${r.rechazadas.length} pieza(s) o semana(s):`, ...r.rechazadas.map(fila));
  else lineas.push("✓ La candidata no rechaza nada que hoy pase.");
  if (r.liberadas.length) lineas.push(`↺ Dejaría pasar errores de hoy en ${r.liberadas.length} pieza(s) o semana(s):`, ...r.liberadas.map(fila));
  const piezasPub = new Set(pub.map((x) => `${x.semana}/${x.id}`)).size;
  const piezasGan = new Set(gan.map((x) => `${x.semana}/${x.id}`)).size;
  lineas.push(
    `Para la Propuesta: probada sobre ${r.semanas.length} semanas (${r.semanas[0] ?? "—"} a ${r.semanas.at(-1) ?? "—"}): rechazaría ${piezasPub} de ${r.publicadas} publicadas y ${piezasGan} de ${r.ganadoras} ganadoras` +
      (r.liberadas.length ? `; liberaría ${r.liberadas.length}` : "") + ".",
  );
  return lineas.join("\n");
}

/** `--probar <config.json> [<validar.mjs>]`: imprime `informePrueba`. Sale 0 aunque rechace (es un informe). */
async function imprimirPrueba(here, configActual, args, fallar) {
  const uso = "uso: node _calendario/validar.mjs --probar <config-candidata.json> [<validar-candidato.mjs>]";
  const json = args.find((a) => a.endsWith(".json"));
  const mjs = args.find((a) => a.endsWith(".mjs"));
  if (!json && !mjs) fallar([uso]);
  let configCandidata = configActual;
  if (json) {
    // La candidata la escribe el agente donde quiera (p. ej. un temporal): se lee tal cual, sin la restricción de carpeta.
    let texto;
    try {
      texto = readFileSync(json, "utf8");
    } catch {
      fallar([`${uso} (no se pudo leer ${json})`]);
    }
    try {
      configCandidata = JSON.parse(texto);
    } catch (e) {
      fallar([`${json} no es JSON válido: ${e instanceof Error ? e.message : e}`]);
    }
  }
  let validarCandidato;
  if (mjs) {
    try {
      const mod = await import(pathToFileURL(isAbsolute(mjs) ? mjs : join(process.cwd(), mjs)).href);
      validarCandidato = mod.validarSemana;
    } catch (e) {
      fallar([`no se pudo cargar ${mjs}: ${e instanceof Error ? e.message : e}`]);
    }
    if (typeof validarCandidato !== "function") fallar([`${mjs} no exporta validarSemana`]);
  }
  const bucle = leerJson(join(here, "..", "_metricas", "bucle.json"));
  const repo = repoDeCodigo(join(here, ".."));
  const r = probarRegla(here, configActual, configCandidata, {
    validarCandidato,
    ganadoras: "error" in bucle ? [] : ganadorasDeBucle(bucle.data),
    score: repo ? (b) => { try { return scoreConRepo(repo, b); } catch { return undefined; } } : undefined,
  });
  if (r.errores.length) fallar(r.errores);
  console.log(informePrueba(r));
}

/**
 * La pieza `id` de `<semana>/plan.json` para `--lector` y `--juez`: valida semana e id y,
 * si algo falla, llama a `fallar` (sale con 1) con `uso` o la lista de ids de la semana.
 */
function piezaDelPlan(here, semana, id, fallar, uso) {
  if (!fechaValida(semana)) fallar([`${uso} (semana ${q(semana)} inválida)`]);
  if (typeof id !== "string" || !ID_RE.test(id)) fallar([`${uso} (id ${q(id)} inválido)`]);
  const plan = leerJson(join(here, semana, "plan.json"));
  if ("error" in plan) fallar([`${semana}/plan.json ${plan.error}`]);
  const piezas = esObj(plan.data) && Array.isArray(plan.data.piezas) ? plan.data.piezas.filter(esObj) : [];
  const p = piezas.find((x) => x.id === id);
  if (!p) {
    const ids = piezas.map((x) => x.id).filter((x) => typeof x === "string");
    fallar([`no hay ninguna pieza con id ${q(id)} en ${semana}/plan.json (ids: ${ids.length ? ids.join(", ") : "ninguno"})`]);
  }
  return p;
}

/** `--lector <semana> <id>`: los dos textos y el mensaje exacto para cada subagente. */
function imprimirLector(here, semana, id, fallar, config) {
  const p = piezaDelPlan(here, semana, id, fallar, "uso: node _calendario/validar.mjs --lector <semana AAAA-MM-DD> <id>");
  const b = leerJson(join(here, semana, `${id}.json`));
  if ("error" in b) fallar([`${semana}/${id}.json ${b.error}`]);
  let md;
  try {
    md = readFileSync(join(here, "lector-frio.md"), "utf8");
  } catch {
    fallar(["no se pudo leer el cuestionario del lector frío (lector-frio.md junto a validar.mjs)"]);
  }
  const seccion = seccionDelLector(md);
  if (!seccion) fallar(['lector-frio.md no tiene la sección "## Para el lector"']);
  const { completo, conPrisa } = textosLector(b.data, p.formato, hayVoz(config));
  const bloque = (titulo, cuerpo) => `=== ${titulo} ===\n${cuerpo}\n=== FIN ===\n`;
  console.log(
    [
      bloque("TEXTO LECTOR COMPLETO", completo),
      bloque("TEXTO LECTOR CON PRISA", conPrisa),
      bloque("MENSAJE PARA EL SUBAGENTE LECTOR COMPLETO (pégalo tal cual)", mensajeLector(seccion, "completo", completo)),
      bloque("MENSAJE PARA EL SUBAGENTE LECTOR CON PRISA (pégalo tal cual)", mensajeLector(seccion, "conPrisa", conPrisa)),
    ].join("\n"),
  );
}

/** `--juez <semana> <id>`: el mensaje exacto para el subagente juez del hook. */
function imprimirJuez(here, semana, id, fallar, config) {
  const p = piezaDelPlan(here, semana, id, fallar, "uso: node _calendario/validar.mjs --juez <semana AAAA-MM-DD> <id>");
  const cands = esObj(p.hook) ? p.hook.candidatos : undefined;
  if (!Array.isArray(cands) || !cands.length || !cands.every((c) => esObj(c) && esTexto(c.title))) fallar([`${id}: hook.candidatos falta o es inválido en ${semana}/plan.json`]);
  const largos = titulosLargos(cands, config);
  if (largos.length) fallar(largos.map((e) => `${id}: ${e}`));
  let md;
  try {
    md = readFileSync(join(here, "guia-hooks.md"), "utf8");
  } catch {
    fallar(["no se pudo leer la guía de hooks (guia-hooks.md junto a validar.mjs)"]);
  }
  const seccion = seccionDelJuez(md);
  if (!seccion) fallar(['guia-hooks.md no tiene la sección "## Para el juez"']);
  console.log(`=== MENSAJE PARA EL SUBAGENTE JUEZ (pégalo tal cual) ===\n${mensajeJuez(seccion, cands, p.formato)}\n=== FIN ===\n`);
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
      // El ejemplo está escrito con voz (ritmo gancho): sin voz se valida con la voz del ejemplo.
      const c = { ...config, ...(hayVoz(config) ? {} : { voz: VOZ_EJEMPLO }), audios: [...config.audios, EJEMPLO.borrador.audio] };
      errs.push(...validarPlan(EJEMPLO.plan, c).map((e) => `ejemplo: ${e}`));
      errs.push(...validarBorrador(EJEMPLO.plan.piezas[0], EJEMPLO.borrador, c).map((e) => `ejemplo: ${e}`));
    }
    if (errs.length) fallar(errs);
    if (!hayVoz(config)) console.log("ℹ config.voz es false: el ejemplo está escrito con voz (gancho); sin voz los reels van en ensenar, con 4 o 5 escenas en 35 s.");
    if (!config.audios.length) console.warn("⚠ config.audios está vacío: el planificador no escribirá reels (solo carruseles) hasta que agregues a _calendario/config.json los nombres de las pistas de promo/audio/.");
    console.log("✓ Autoprueba del calendario: config.json y ejemplo válidos.");
    return;
  }
  if (args[0] === "--lector") {
    imprimirLector(here, args[1], args[2], fallar, config);
    return;
  }
  if (args[0] === "--juez") {
    imprimirJuez(here, args[1], args[2], fallar, config);
    return;
  }
  if (args[0] === "--probar") return imprimirPrueba(here, config, args.slice(1), fallar);
  const semana = args[0];
  if (!fechaValida(semana)) fallar([`uso: node _calendario/validar.mjs <semana AAAA-MM-DD> | --self-test | --lector <semana> <id> | --juez <semana> <id> | --probar <config.json> [<validar.mjs>] (recibí ${q(semana)})`]);
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
  const interno = (e) => {
    console.error(`✗ error interno del validador: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  };
  try {
    Promise.resolve(main(process.argv.slice(2))).catch(interno);
  } catch (e) {
    interno(e);
  }
}
