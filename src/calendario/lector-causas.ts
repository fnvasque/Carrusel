import type { Plan } from "./plan.ts";

/**
 * Fallos del lector frío agrupados por causa (`bucle.json → lectorFrio`). Lee
 * `plan.json → piezas[].lectorFrio.notas` y `plan.json → caidas` de las últimas semanas y
 * cuenta, por causa, cuántas veces obligó a reescribir, cuántas dudas no bloqueantes (NB)
 * hubo, en qué piezas y con qué desenlace. Así el planificador ve qué falla una y otra vez
 * (unas 20 respuestas por semana) sin esperar a la estadística de Instagram.
 *
 * Taxonomía determinista, sin LLM: cada causa tiene la pregunta del cuestionario
 * (`lector-frio.md`) a la que pertenece y palabras clave. Un NB trae su pregunta (`P3`,
 * `P6`…) y solo se compara con las causas de esa pregunta; un fallo (`vN: …` con N menor
 * que `intentos`, o cualquier nota de una pieza caída) se compara con todas.
 */

export type CausaId =
  | "tema-confuso"
  | "sin-entregable"
  | "dato-sin-contexto"
  | "termino-sin-explicar"
  | "emocion"
  | "sin-accion"
  | "accion-distinta"
  | "contradiccion"
  | "promesa-incumplida"
  | "pasos-incompletos"
  | "confuso"
  | "portada-sin-resultado"
  | "nada-nuevo"
  | "sin-hilo"
  | "otro";

interface DefCausa {
  id: CausaId;
  pregunta?: number;
  descripcion: string;
  /** Sobre el texto normalizado (minúsculas, sin tildes). */
  claves: RegExp[];
}

/**
 * «Ya lo sabía» de la P8 (mismos patrones que `NADA_NUEVO_RE` de validar.mjs, que bloquea
 * citarlos en un NB de la P8). «Ya sabía qué/cuál/cómo/dónde/quién…» no cuenta: es de otra
 * pregunta (el lector nombra lo que sabía y lo que no).
 */
export const NADA_NUEVO_RE: RegExp[] = [/nada\s+(de\s+)?nuevo/, /ya (lo )?sabia(?!\s+(?:que|cual(?:es)?|como|donde|quien(?:es)?)\b)/, /ya lo conocia/, /no aprendi nada/, /nada que no supiera/];

/** En orden de prioridad dentro de cada pregunta: un NB toma la primera que calce y, si ninguna, la última de su pregunta. */
export const CAUSAS: DefCausa[] = [
  { id: "portada-sin-resultado", pregunta: 7, descripcion: "La slide 1 no dice qué te llevas (P7: «no sé», el tema a secas o una promesa vaga)", claves: [/\bla 7\b/, /pregunta 7/, /\bp7\b/, /primer cuadro/] },
  { id: "tema-confuso", pregunta: 1, descripcion: "No se entiende de qué trata o las partes no se conectan", claves: [/no se conecta/, /dos reels/, /de golpe/, /a medias/, /cortada/, /de que trata/] },
  { id: "sin-entregable", pregunta: 2, descripcion: "El lector no sabe qué se lleva ni qué hacer después", claves: [/que se llevaba/, /que (me |te )?llevo/, /que hacer\b/, /para que servia/, /entregable/] },
  { id: "dato-sin-contexto", pregunta: 3, descripcion: "Una cifra o estudio sin decir quién lo midió ni qué compara", claves: [/cifra/, /\bdatos?\b/, /estudio/, /\bmidi/, /\bmedido/, /\d ?%/, /\b\d[\d.,]* (puntos|veces|horas|dolares|profesionales|consultores|sesiones|correos|personas)\b/, /\b\d[\d.,]* ?\/ ?\d/] },
  { id: "termino-sin-explicar", pregunta: 3, descripcion: "Una palabra, marca o herramienta que el lector no entendió", claves: [/no (se |la |lo )?entend/, /no (se |la |lo )?entiend/, /sin explicar/, /no (se |estaba )explic/, /no (sabia|se sabe|sabe|se|supo|supieron) (bien )?(que|cual) (es|son|era|eran|significa|incluia)\b/, /sin saber que/, /no me dice nada/, /no lo conocia/, /suena tecnic/, /formal/, /no se que es/] },
  { id: "emocion", pregunta: 4, descripcion: "La primera slide despierta desconfianza o incomodidad", claves: [/desconf/, /apurad/, /raro/, /se siente/, /me pregunto si/] },
  { id: "sin-accion", pregunta: 5, descripcion: "El lector no haría nada al terminar («nada», pasar de largo; «no aprendí nada» es de la P8)", claves: [/(?<!aprendi\s)\bnada\b(?!\s*,?\s*(de\s+)?nuevo)(?!\s+que\s+no\s+supiera)/, /de largo/, /paso entero/] },
  { id: "accion-distinta", pregunta: 5, descripcion: "La acción que haría no es la de la señal objetivo", claves: [/respond\w* guardar/, /guardar con senal/, /\bguardar/, /envi/, /coment/, /mandar/] },
  { id: "contradiccion", pregunta: 6, descripcion: "Dos partes de la pieza se contradicen", claves: [/contradic/, /chocaba/, /\bchoca\b/, /se pelean/, /no coincid/, /\bno son\b \d/] },
  { id: "promesa-incumplida", pregunta: 6, descripcion: "El título promete algo (un número, «gratis», un resultado) que la pieza no entrega", claves: [/promet/, /promesa/, /no llegaba/, /no se cumpl/, /solo (habia|aparece|una|uno|muestra|\d)/, /contra \d+ pasos/, /no los nombra/, /nunca (dice|vi|muestra)/, /no cerraba/] },
  { id: "pasos-incompletos", pregunta: 6, descripcion: "Faltan pasos para conseguir el entregable (dónde, cómo, con qué)", claves: [/no (supo|sabe|se sabe|sabria) (decirle )?(como|de donde|donde|que numero|cual|con que)/, /pasos sin/, /donde (escribir|pegar|mirar)/, /que boton/, /falta el \d/, /no (dice|explica) (como|donde)/, /como se activa/, /no pudo seguir/, /hay que activar/, /\bcomo\b.*\?/] },
  { id: "confuso", pregunta: 6, descripcion: "Otra confusión o duda sobre la pieza", claves: [/no (supe|se si)/, /confus/, /dud/] },
  { id: "nada-nuevo", pregunta: 8, descripcion: "El lector ya sabía lo que la pieza enseña", claves: NADA_NUEVO_RE },
  // Sin `pregunta`: la P9 es nueva (2026-10-31) y su NB del con prisa no bloquea; se reconoce por sus palabras en los fallos.
  { id: "sin-hilo", descripcion: "Contada de corrido no es la frase de amigo o no dice qué hacer primero (P9)", claves: [/\bla 9\b/, /pregunta 9/, /\bp9\b/, /de corrido/, /(haria|hacer|hago) primero/, /frase de amigo/] },
];

const OTRO: DefCausa = { id: "otro", descripcion: "Fallo sin causa reconocida: revisa la cita", claves: [] };
const DEF = new Map<CausaId, DefCausa>([...CAUSAS, OTRO].map((c) => [c.id, c]));

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Causas de un fallo (todas las que calcen; `otro` si ninguna). */
export function causasDeFallo(texto: string): CausaId[] {
  const t = norm(texto);
  const ids = CAUSAS.filter((c) => c.claves.some((r) => r.test(t))).map((c) => c.id);
  return ids.length ? ids : ["otro"];
}

/** Causa de una duda no bloqueante de la pregunta `pregunta`: la primera de esa pregunta que calce, o la última de ella. */
export function causaDeDuda(pregunta: number, cita: string): CausaId {
  const deLaPregunta = CAUSAS.filter((c) => c.pregunta === pregunta);
  if (!deLaPregunta.length) return "otro";
  const t = norm(cita);
  return (deLaPregunta.find((c) => c.claves.some((r) => r.test(t))) ?? deLaPregunta[deLaPregunta.length - 1]!).id;
}

export interface Hallazgo {
  tipo: "fallo" | "duda";
  causa: CausaId;
  /** Texto del fallo o cita textual del lector (NB). */
  texto: string;
  lector?: "completo" | "con prisa";
}

/** `NB: «cita» → completo P3: …` (mismo formato que exige validar.mjs). */
const NB_RE = /\bNB: «([^«»\n]+)» → (completo|con prisa) P(\d)\b/g;
/** Inicio de un intento: `v1:`, `v1-v3:`, `v4 (criterio nuevo…):`. */
const VERSION_RE = /\bv(\d+)(?:-v?(\d+))?(?: \([^)\n]*\))?:/g;
/** Donde empieza la corrección dentro de un intento (lo que se hizo, no lo que falló). */
const ARREGLO_RE = /(?:^|[;.])\s*(?:en v\d+\s+)?(?:se|tras)\b|;\s+(?:el|la|los|las)\s[^;]*?\b(?:pas[oó] a|pasaron a|dice|dicen|nombra|cambi[oó])\b/i;
/** Intentos que no describen un fallo del lector. */
const NO_LECTOR_RE = /\bvalidador\b|recortes? de duraci/i;
/** Una frase sin ninguna de estas marcas describe el arreglo o lo que pasó, no un fallo. */
const MARCA_FALLO_RE = /\b(?:no|sin|ni|nada|nadie|ninguno)\b|confus|contradic|promet|promesa|dud|vag[oa]s?\b|objet|choca|pelean|de largo|entero|\bleyo\b|\bleyeron\b|suena/i;
const MAX_TEXTO = 200;

const recortar = (s: string): string => {
  const t = s.replace(/\s+/g, " ").trim().replace(/[;.,:]+$/, "");
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO)}…` : t;
};

function hallazgosDeFallo(texto: string): Hallazgo[] {
  if (NO_LECTOR_RE.test(texto)) return [];
  const corte = texto.search(ARREGLO_RE);
  const fallo = corte >= 0 ? texto.slice(0, corte) : texto;
  const out: Hallazgo[] = [];
  for (const frase of fallo.split(/;\s+|,\s+y\s+|\.\s+/)) {
    if (!frase.trim() || !MARCA_FALLO_RE.test(frase)) continue;
    const lector = /con prisa/i.test(frase) ? "con prisa" : /\bcompleto\b/i.test(frase) ? "completo" : undefined;
    for (const causa of causasDeFallo(frase)) out.push({ tipo: "fallo", causa, texto: recortar(frase), ...(lector ? { lector } : {}) });
  }
  return out;
}

/**
 * Hallazgos de `lectorFrio.notas`. Los NB son dudas; los intentos `vN: …` con N menor
 * que `intentos` (o todos, si la pieza cayó) son fallos. El último intento describe lo que
 * pasó, no lo que falló. Una pieza caída sin `vN` cuenta sus notas enteras como un fallo.
 */
export function hallazgosDeNotas(notas: unknown, intentos: unknown, cayo = false): Hallazgo[] {
  if (typeof notas !== "string" || !notas.trim()) return [];
  const out: Hallazgo[] = [];
  for (const m of notas.matchAll(NB_RE)) {
    out.push({ tipo: "duda", causa: causaDeDuda(Number(m[3]), m[1]!), texto: recortar(m[1]!), lector: m[2] as "completo" | "con prisa" });
  }
  const tope = typeof intentos === "number" && Number.isInteger(intentos) ? intentos : Infinity;
  const versiones = [...notas.matchAll(VERSION_RE)];
  if (!versiones.length) {
    if (cayo) out.push(...hallazgosDeFallo(notas.replace(/\bNB: «[^«»\n]+» → [^\n]*/g, "")));
    return out;
  }
  versiones.forEach((m, i) => {
    const desde = Number(m[1]);
    if (!cayo && desde >= tope) return;
    const inicio = m.index! + m[0].length;
    const fin = Math.min(versiones[i + 1]?.index ?? notas.length, ...[notas.indexOf("\n", inicio), notas.indexOf("NB:", inicio)].filter((x) => x >= 0));
    out.push(...hallazgosDeFallo(notas.slice(inicio, fin)));
  });
  return out;
}

const ID_PIEZA_RE = /\b(?:lun|mar|mie|jue|vie|sab|dom)(?:-pm)?-(?:reel|carrusel)-[a-z0-9-]+[a-z0-9]/g;

/**
 * Piezas que no pasaron el lector frío y se quitaron del plan. La fuente es
 * `plan.json → caidas`; para semanas anteriores a ese campo, los ids que `motivo` nombra en
 * una frase con «no pasó/pasaron el lector frío» y que ya no están en `piezas`.
 */
export function caidasDePlan(plan: Plan): { id: string; intentos?: number; notas?: string }[] {
  const enPlan = new Set((plan.piezas ?? []).map((p) => p.id));
  const out = new Map<string, { id: string; intentos?: number; notas?: string }>();
  for (const c of Array.isArray(plan.caidas) ? plan.caidas : []) {
    if (c && typeof c.id === "string" && !enPlan.has(c.id)) out.set(c.id, c);
  }
  for (const frase of (typeof plan.motivo === "string" ? plan.motivo : "").split(/(?<=[.;])\s+/)) {
    if (!/no pas(?:o|ó|aron)/i.test(frase) || !/lector fr[ií]o/i.test(frase)) continue;
    for (const id of frase.match(ID_PIEZA_RE) ?? []) if (!enPlan.has(id) && !out.has(id)) out.set(id, { id });
  }
  return [...out.values()];
}

export type Desenlace = "cayó" | "pasó tras reescribir" | "pasó con duda";

export interface CausaLector {
  causa: CausaId;
  /** Pregunta del cuestionario (`lector-frio.md`) a la que pertenece. */
  pregunta?: number;
  descripcion: string;
  /** Veces que obligó a reescribir (un intento de una pieza cuenta una vez por causa). */
  fallos: number;
  /** Dudas no bloqueantes (NB) de esta causa. */
  dudas: number;
  /** `"<semana>/<id>"` y cómo terminó: cayó, pasó tras reescribir o pasó solo con dudas. */
  piezas: { pieza: string; desenlace: Desenlace }[];
  /** La cita más reciente de un fallo (si no hay, de una duda). */
  ejemplo: string;
}

export interface ResumenLector {
  semanas: string[];
  /** Piezas que pasaron por el lector (las del plan más las caídas). */
  piezas: number;
  aLaPrimera: number;
  reescritas: number;
  caidas: number;
  /** Caídas sin notas: se sabe que cayeron, no por qué. */
  caidasSinNotas: string[];
  causas: CausaLector[];
}

export const SEMANAS_LECTOR = 4;

/** Resumen por causa de las últimas `semanas` semanas con plan (por defecto 4). Puro. */
export function resumirLectorFrio(planes: Plan[], semanas = SEMANAS_LECTOR): ResumenLector {
  const ultimas = [...planes].filter((p) => p && typeof p.semana === "string").sort((a, b) => a.semana.localeCompare(b.semana)).slice(-semanas);
  const resumen: ResumenLector = { semanas: ultimas.map((p) => p.semana), piezas: 0, aLaPrimera: 0, reescritas: 0, caidas: 0, caidasSinNotas: [], causas: [] };
  const porCausa = new Map<CausaId, { fallos: Set<string>; dudas: number; piezas: Map<string, Desenlace>; ejemploFallo?: string; ejemploDuda?: string }>();
  const anotar = (pieza: string, hs: Hallazgo[], cayo: boolean): void => {
    for (const h of hs) {
      const g = porCausa.get(h.causa) ?? { fallos: new Set<string>(), dudas: 0, piezas: new Map<string, Desenlace>() };
      porCausa.set(h.causa, g);
      const desenlace: Desenlace = cayo ? "cayó" : h.tipo === "fallo" ? "pasó tras reescribir" : "pasó con duda";
      const previo = g.piezas.get(pieza);
      // Un fallo pesa más que una duda en la misma pieza.
      if (!previo || previo === "pasó con duda") g.piezas.set(pieza, desenlace);
      if (h.tipo === "fallo") {
        // Un intento cuenta una vez por causa: la clave es el texto del fallo.
        g.fallos.add(`${pieza}#${h.texto}`);
        g.ejemploFallo = h.texto;
      } else {
        g.dudas++;
        g.ejemploDuda = h.texto;
      }
    }
  };
  for (const plan of ultimas) {
    for (const p of plan.piezas ?? []) {
      const lf = p.lectorFrio;
      if (!lf || typeof lf !== "object") continue;
      resumen.piezas++;
      if (lf.intentos === 1) resumen.aLaPrimera++;
      else if (Number.isInteger(lf.intentos) && lf.intentos > 1) resumen.reescritas++;
      anotar(`${plan.semana}/${p.id}`, hallazgosDeNotas(lf.notas, lf.intentos), false);
    }
    for (const c of caidasDePlan(plan)) {
      resumen.piezas++;
      resumen.caidas++;
      const hs = hallazgosDeNotas(c.notas, c.intentos, true);
      if (!hs.some((h) => h.tipo === "fallo")) resumen.caidasSinNotas.push(`${plan.semana}/${c.id}`);
      anotar(`${plan.semana}/${c.id}`, hs, true);
    }
  }
  resumen.causas = [...porCausa]
    .map(([causa, g]) => {
      const d = DEF.get(causa)!;
      return {
        causa, ...(d.pregunta ? { pregunta: d.pregunta } : {}), descripcion: d.descripcion, fallos: g.fallos.size, dudas: g.dudas,
        piezas: [...g.piezas].map(([pieza, desenlace]) => ({ pieza, desenlace })),
        ejemplo: g.ejemploFallo ?? g.ejemploDuda ?? "",
      };
    })
    .sort((a, b) => b.fallos - a.fallos || b.dudas - a.dudas || a.causa.localeCompare(b.causa));
  return resumen;
}
