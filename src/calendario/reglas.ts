import type { Medicion } from "./bucle.ts";
import { addDays, localParts } from "./time.ts";

/**
 * Antes/después de cada regla ya aplicada (`bucle.json → reglas`). El registro
 * (`_calendario/reglas.json`) lo mantienen el usuario o la PR que aplica la regla, nunca el
 * agente: `id`, `desde` (primer día en que se **publican** piezas con la regla), `formato`
 * (`reel`, `carrusel` o `null` = ambos) y `descripcion`.
 *
 * Por cada regla y formato se comparan las piezas medidas publicadas en los 28 días antes de
 * `desde` con las publicadas desde `desde` (hasta 28 días). Reels: visionado medio en
 * segundos (`avgWatchMs`), que no depende de la duración del reel (el tope de 20 s cambió
 * la duración y con ella la retención como razón; esta va como dato secundario).
 * Carruseles: índice relativo de su señal (1 = la media de la cuenta). Con menos de
 * `MIN_PIEZAS_REGLA` piezas por lado no hay veredicto. Las reglas que entraron en la misma
 * ventana van en `simultaneas`: el efecto es del paquete, no de una sola.
 */

export interface Regla {
  id: string;
  desde: string;
  formato: "reel" | "carrusel" | null;
  descripcion: string;
  fuente?: string;
}

export const MIN_PIEZAS_REGLA = 6;
const DIAS_VENTANA = 28;
/** Cambio relativo mínimo (10 %) para decir que mejoró o empeoró. */
const CAMBIO_MINIMO = 0.1;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4 + 0;
const media = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Reglas válidas de `reglas.json` (`{ "reglas": [...] }` o la lista sola) y un aviso por cada entrada rara. */
export function leerReglas(json: unknown): { reglas: Regla[]; avisos: string[] } {
  const lista = esObj(json) ? json.reglas : json;
  const out: { reglas: Regla[]; avisos: string[] } = { reglas: [], avisos: [] };
  if (json === undefined) return out;
  if (!Array.isArray(lista)) return { ...out, avisos: ["reglas.json: debe ser { \"reglas\": [...] }"] };
  const ids = new Set<string>();
  lista.forEach((r, i) => {
    const formato = esObj(r) ? (r.formato ?? null) : undefined;
    if (!esObj(r) || typeof r.id !== "string" || !r.id.trim() || typeof r.desde !== "string" || !FECHA_RE.test(r.desde) || !(formato === null || formato === "reel" || formato === "carrusel")) {
      out.avisos.push(`reglas.json: la entrada ${i + 1} necesita id, desde (AAAA-MM-DD) y formato (reel, carrusel o null); se ignora`);
      return;
    }
    if (ids.has(r.id)) {
      out.avisos.push(`reglas.json: id repetido ${r.id}; se ignora la segunda`);
      return;
    }
    ids.add(r.id);
    out.reglas.push({ id: r.id, desde: r.desde, formato, descripcion: typeof r.descripcion === "string" ? r.descripcion : "", ...(typeof r.fuente === "string" ? { fuente: r.fuente } : {}) });
  });
  return out;
}

export interface Lado {
  n: number;
  /** Reels: visionado medio (s); carruseles: índice relativo de su señal. */
  media?: number;
  /** Reels: retención media (visionado / duración), dato secundario. */
  retencion?: number;
  piezas: string[];
}

export interface ComparacionRegla {
  id: string;
  descripcion: string;
  desde: string;
  formato: "reel" | "carrusel";
  metrica: "visionadoMedioSegundos" | "indiceRelativo";
  antes: Lado;
  despues: Lado;
  /** (después − antes) / antes; solo con n suficiente en ambos lados. */
  cambio?: number;
  veredicto: "mejoró" | "empeoró" | "sin cambio claro" | "n insuficiente";
  /** Otras reglas del mismo formato que entraron entre el inicio de `antes` y el fin de `despues`. */
  simultaneas: string[];
}

/** Día local de publicación de una medición. */
const diaDe = (x: Medicion): string | undefined => {
  const t = new Date(x.publicadoEn ?? "");
  return Number.isNaN(t.getTime()) ? undefined : localParts(t).dia;
};

/**
 * Antes/después de cada regla, por formato (una regla `null` da una fila por formato). `idx`
 * son las mediciones con su índice relativo (`rel`, como en los pesos). Puro.
 */
export function antesDespues(reglas: Regla[], idx: { m: Medicion; rel: number }[]): ComparacionRegla[] {
  const out: ComparacionRegla[] = [];
  for (const r of reglas) {
    for (const formato of r.formato ? [r.formato] : (["reel", "carrusel"] as const)) {
      const inicio = addDays(r.desde, -DIAS_VENTANA);
      const fin = addDays(r.desde, DIAS_VENTANA - 1);
      const delFormato = idx.filter(({ m }) => m.formato === formato);
      const lado = (desde: string, hasta: string): Lado => {
        const xs = delFormato.filter(({ m }) => {
          const d = diaDe(m);
          return d !== undefined && d >= desde && d <= hasta;
        });
        const valores = formato === "reel" ? xs.map(({ m }) => m.avgWatchMs).filter(esNum).map((v) => v / 1000) : xs.map(({ rel }) => rel);
        const ret = xs.map(({ m }) => m.retencion).filter(esNum);
        return {
          n: valores.length,
          ...(valores.length ? { media: r4(media(valores)) } : {}),
          ...(formato === "reel" && ret.length ? { retencion: r4(media(ret)) } : {}),
          piezas: xs.map(({ m }) => `${m.semana}/${m.piezaId}`),
        };
      };
      const antes = lado(inicio, addDays(r.desde, -1));
      const despues = lado(r.desde, fin);
      const suficiente = antes.n >= MIN_PIEZAS_REGLA && despues.n >= MIN_PIEZAS_REGLA && esNum(antes.media) && antes.media > 0 && esNum(despues.media);
      const cambio = suficiente ? r4((despues.media! - antes.media!) / antes.media!) : undefined;
      out.push({
        id: r.id, descripcion: r.descripcion, desde: r.desde, formato,
        metrica: formato === "reel" ? "visionadoMedioSegundos" : "indiceRelativo",
        antes, despues,
        ...(cambio !== undefined ? { cambio } : {}),
        veredicto: cambio === undefined ? "n insuficiente" : cambio <= -CAMBIO_MINIMO ? "empeoró" : cambio >= CAMBIO_MINIMO ? "mejoró" : "sin cambio claro",
        simultaneas: reglas.filter((o) => o.id !== r.id && (o.formato === null || o.formato === formato) && o.desde >= inicio && o.desde <= fin).map((o) => o.id),
      });
    }
  }
  return out;
}
