import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import type { RevisionPieza, VeredictoImagen } from "./visual.ts";

/** Las dos preguntas fijas del revisor (spec de revisión visual, sin cambios). */
export const PREGUNTAS_REVISOR = [
  "¿El fondo compite con el texto, o deja alguna parte del texto difícil de leer?",
  "¿El fondo tiene que ver con lo que dice la pieza?",
] as const;

/** USD por millón de tokens. */
export const PRECIOS_USD_POR_MTOK: Record<string, { entrada: number; salida: number }> = {
  "gpt-4o": { entrada: 2.5, salida: 10 },
  "gpt-4o-mini": { entrada: 0.15, salida: 0.6 },
};

type Usage = { prompt_tokens: number; completion_tokens: number };

/** Costo medido de una llamada. Un modelo fuera de la tabla usa el precio más caro. */
export function costoUsd(modelo: string, usage: Usage): number {
  let p = PRECIOS_USD_POR_MTOK[modelo];
  if (!p) {
    p = Object.values(PRECIOS_USD_POR_MTOK).reduce((a, b) => (b.entrada + b.salida > a.entrada + a.salida ? b : a));
  }
  return (usage.prompt_tokens * p.entrada + usage.completion_tokens * p.salida) / 1_000_000;
}

export interface ContextoPieza { id: string; formato: string; textos: string[] }

export type LlamarModelo = (args: { modelo: string; mensajes: unknown[] }) => Promise<{ contenido: string; usage: Usage }>;

const MAX_FRASE = 200;

const SISTEMA =
  "Eres revisor visual de piezas de Instagram. Recibes imágenes numeradas (fotogramas de una pieza) y el texto que dice la pieza. " +
  "Para CADA imagen respondes dos preguntas:\n" +
  `1. ${PREGUNTAS_REVISOR[0]} (campo "compite": true si compite o dificulta la lectura)\n` +
  `2. ${PREGUNTAS_REVISOR[1]} (campo "ajeno": true si el fondo NO tiene que ver con lo que dice la pieza)\n` +
  'Responde SOLO con JSON: {"imagenes":[{"n":1,"compite":false,"ajeno":false,"frase":"…"}]}, ' +
  "con una entrada por imagen (el mismo n que se te indica) y una frase en español de 25 palabras como máximo.";

function sinRevisar(modelo: string, en: string, motivo: string, usd: number): RevisionPieza {
  return { en, modelo, estado: "sin revisar", motivo, imagenes: [], usd };
}

/** Una llamada con todas las imágenes de la pieza (data URI JPEG, detail "high"). Nunca lanza. */
export async function revisarFondos(
  imagenes: { n: number; ruta: string; que: string }[],
  ctx: ContextoPieza,
  deps: { llamar: LlamarModelo; modelo?: string; ahora?: () => Date },
): Promise<RevisionPieza> {
  const modelo = deps.modelo ?? process.env.REVISOR_VISUAL_MODEL ?? "gpt-4o";
  const en = (deps.ahora ?? (() => new Date()))().toISOString();
  try {
    const partes: unknown[] = [
      { type: "text", text: `Pieza ${ctx.id} (${ctx.formato}). Texto visible:\n${ctx.textos.map((t) => `- ${t}`).join("\n")}\n\nImágenes: ${imagenes.map((i) => `n=${i.n} (${i.que})`).join("; ")}` },
    ];
    for (const i of imagenes) {
      let buf: Buffer;
      try {
        buf = await readFile(i.ruta);
      } catch (e) {
        return sinRevisar(modelo, en, `no se pudo leer la imagen ${i.n}: ${(e as Error).message}`, 0);
      }
      partes.push({ type: "text", text: `Imagen n=${i.n}:` });
      partes.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}`, detail: "high" } });
    }
    const mensajes = [
      { role: "system", content: SISTEMA },
      { role: "user", content: partes },
    ];
    let r: Awaited<ReturnType<LlamarModelo>>;
    try {
      r = await deps.llamar({ modelo, mensajes });
    } catch (e) {
      return sinRevisar(modelo, en, `falló la llamada al modelo: ${(e as Error).message}`, 0);
    }
    const usd = costoUsd(modelo, r.usage);
    let json: unknown;
    try {
      json = JSON.parse(r.contenido);
    } catch {
      return sinRevisar(modelo, en, "respuesta del modelo no es JSON válido", usd);
    }
    const lista = (json as { imagenes?: unknown } | null)?.imagenes;
    if (!Array.isArray(lista)) return sinRevisar(modelo, en, "respuesta sin lista «imagenes»", usd);
    const veredictos: VeredictoImagen[] = [];
    for (const i of imagenes) {
      const hallados = lista.filter((x) => (x as { n?: unknown } | null)?.n === i.n) as Record<string, unknown>[];
      if (hallados.length !== 1) return sinRevisar(modelo, en, `falta o se repite la imagen ${i.n} en la respuesta`, usd);
      const v = hallados[0]!;
      if (typeof v.compite !== "boolean" || typeof v.ajeno !== "boolean" || typeof v.frase !== "string") {
        return sinRevisar(modelo, en, `veredicto mal formado para la imagen ${i.n}`, usd);
      }
      veredictos.push({ n: i.n, que: i.que, compite: v.compite, ajeno: v.ajeno, frase: v.frase.slice(0, MAX_FRASE) });
    }
    if (lista.length !== imagenes.length) return sinRevisar(modelo, en, "la respuesta trae imágenes de más", usd);
    return { en, modelo, estado: "revisado", imagenes: veredictos, usd };
  } catch (e) {
    return sinRevisar(modelo, en, `error inesperado: ${(e as Error).message}`, 0);
  }
}

let cliente: OpenAI | null = null;

/** Implementación real de LlamarModelo (cliente lazy; sin clave lanza «falta OPENAI_API_KEY»). */
export const llamarOpenAI: LlamarModelo = async ({ modelo, mensajes }) => {
  if (!process.env.OPENAI_API_KEY) throw new Error("falta OPENAI_API_KEY");
  cliente ??= new OpenAI();
  // Acotado: la revisión corre con el candado del render tomado.
  const res = await cliente.chat.completions.create(
    {
      model: modelo,
      response_format: { type: "json_object" },
      messages: mensajes as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    },
    { timeout: 60_000, maxRetries: 1 },
  );
  return {
    contenido: res.choices[0]?.message?.content ?? "",
    usage: { prompt_tokens: res.usage?.prompt_tokens ?? 0, completion_tokens: res.usage?.completion_tokens ?? 0 },
  };
};
