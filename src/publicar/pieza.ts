import type { Plan, Pieza } from "../calendario/plan.ts";
import { CAPTION_MAX, HASHTAGS_MAX, contarHashtags } from "../calendario/publish.ts";
import type { Borrador } from "../calendario/draft.ts";

const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;
const ID_MAX = 80;

/** `<lun|mar|…|dom>-reel-<slug del hook>`: sin tildes, ≤ 80 caracteres, cortado en el último guion. */
export function idDe(dia: string, hook: string): string {
  const prefijo = `${DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}-reel-`;
  let slug = hook
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tope = ID_MAX - prefijo.length;
  if (slug.length > tope) {
    const corte = slug.slice(0, tope);
    // Si el corte cae justo en un guion, la última palabra está completa; si no, se descarta la palabra a medias.
    slug = slug[tope] === "-" ? corte : corte.includes("-") ? corte.slice(0, corte.lastIndexOf("-")) : corte;
  }
  return `${prefijo}${slug.replace(/-+$/, "")}`;
}

/** Motivos por los que el caption no cabe en Instagram; vacío = ok. */
export function problemasCaption(caption: string): string[] {
  const out: string[] = [];
  if (!caption.trim()) out.push("El caption está vacío.");
  if (/\bfelipe\b|v[aá]squez/i.test(caption)) out.push("El caption menciona el nombre de Felipe; la cuenta firma como @ia.punto.es, sin nombre.");
  if (caption.length > CAPTION_MAX) out.push(`El caption tiene ${caption.length} caracteres; Instagram acepta hasta ${CAPTION_MAX}.`);
  const tags = contarHashtags(caption);
  if (tags > HASHTAGS_MAX) out.push(`El caption tiene ${tags} hashtags; Instagram acepta hasta ${HASHTAGS_MAX}.`);
  return out;
}

/** Pieza «hecha a mano» para un video ya listo, fuera del planificador. */
export function armarPieza(o: { id: string; dia: string; hora: string; hook: string; caption: string; hoy: string }): Pieza {
  return {
    id: o.id,
    dia: o.dia,
    hora: o.hora,
    formato: "reel",
    arquetipo: "atemporal",
    senal: "retencion",
    tema: "",
    pilar: "trabajo",
    hook: { categoria: "storytelling", texto: o.hook, score: 0 },
    emocion: ["curiosidad"],
    entregable: o.hook,
    fraseAmigo: o.hook,
    lectorFrio: { intentos: 0, resultado: "manual", notas: `Pieza publicada con /publicar (${o.hoy}), fuera del planificador.` },
    origen: { fichas: [], referencias: [] },
    derivadoDe: null,
    caption: o.caption,
    borrador: `${o.id}.json`,
    estado: "planificado",
    parametros: { origen: "publicar", hechaAMano: true },
  };
}

/** Borrador mínimo: un solo slide Clip con el video ya renderizado. */
export function borradorDe(id: string, hook: string): Borrador {
  return { name: id, pillar: "trabajo", angle: hook, slides: [{ template: "Clip", props: { title: hook, archivo: "reel.mp4" } }] } as Borrador;
}

/** Copia del plan con la pieza insertada, ordenada por día y hora. Nunca pisa: id repetido lanza. */
export function insertarPieza(plan: Plan, pieza: Pieza): Plan {
  if (plan.piezas.some((p) => p.id === pieza.id)) throw new Error(`id repetido: ${pieza.id}`);
  const piezas = [...plan.piezas, pieza].sort((a, b) => `${a.dia} ${a.hora}`.localeCompare(`${b.dia} ${b.hora}`));
  return { ...plan, piezas };
}
