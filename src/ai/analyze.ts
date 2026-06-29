import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import type { InstagramSource, PostAnalysis, VariationDraft, SpanishVariant } from "../remix/types.ts";
import { TEMPLATE_CATALOG } from "../remix/templates-catalog.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "remix");
const PILLARS = ["herramienta", "noticia", "prompt", "curiosidad"] as const;

/** Tope de imágenes que se adjuntan al modelo (control de coste/latencia). */
const MAX_IMAGES = 8;

let client: OpenAI | null = null;

/** Modelo multimodal a usar. Configurable por REMIX_MODEL (default gpt-4o). */
function getModel(): string {
  return process.env.REMIX_MODEL ?? "gpt-4o";
}

/** Cliente OpenAI lazy con guardia de API key (mismo patrón que openaiImage.ts). */
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Falta OPENAI_API_KEY. Expórtala para usar el remix (analiza el post y genera las variaciones).",
    );
  }
  client ??= new OpenAI();
  return client;
}

/**
 * Reglas de marca y viralidad embebidas en el prompt de generación. Resumen del
 * filtro .context/04-quality-gate-viral.md para que las variaciones puntúen alto
 * en `scoreCarousel`.
 */
const BRAND_RULES = `
Marca ia.es: fondo navy #0B1020, acento cian #22D3EE. La palabra clave del titular SIEMPRE va en cian vía la prop "highlight" (1-2 palabras).
Pilares de contenido (prop "pillar"): "herramienta" | "noticia" | "prompt" | "curiosidad".
Reglas de viralidad (para maximizar guardados/compartidos):
- El Hook (primer slide) debe tener un número concreto + un enemigo/tensión (no, deja de, mentira, gratis...) + un bucle abierto (#3, por qué, lo que nadie...). Define "highlight".
- 6 a 8 slides en total. Empieza con Hook y termina con Cta.
- Incluye al menos un slide de reframe (Lead o MythReality): dispara el compartir.
- Slides de desarrollo (Step/Prompt/MythReality) llevan index/total (barra de progreso) y pasos numerados (step "01", o mythLabel "Nº1").
- El Cta primario debe pedir guardar o compartir, e incluir un handle.
- PROHIBIDO: hype ("cambia tu vida", "increíble"), miedo ("te reemplaza"), jerga técnica cruda (LLM, token, embedding) y clickbait ("no vas a creer").
- Fondos: usa "background.ai" con un prompt en inglés que reproduzca el TEMA/COMPOSICIÓN del estilo visual original PERO re-skineado al look navy + cian rim light, editorial, mucho espacio negativo. overlay 0.4-0.55. No copies el branding ajeno.
`.trim();

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isPillar(v: unknown): v is PostAnalysis["pillar"] {
  return typeof v === "string" && (PILLARS as readonly string[]).includes(v);
}

/** Rellena/normaliza el JSON del modelo a un PostAnalysis válido. */
function normalizeAnalysis(raw: Record<string, unknown>, source: InstagramSource): PostAnalysis {
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    hook: typeof raw.hook === "string" ? raw.hook : source.caption.slice(0, 80),
    narrative: asStringArray(raw.narrative),
    pillar: isPillar(raw.pillar) ? raw.pillar : "curiosidad",
    format: raw.format === "reel" ? "reel" : "post",
    copyPerSlide: Array.isArray(raw.copyPerSlide)
      ? (raw.copyPerSlide as unknown[])
          .filter((x): x is { role?: unknown; text?: unknown } => typeof x === "object" && x !== null)
          .map((x) => ({ role: String(x.role ?? "slide"), text: String(x.text ?? "") }))
      : [],
    visualStyle: typeof raw.visualStyle === "string" ? raw.visualStyle : "",
    languageDetected: typeof raw.languageDetected === "string" ? raw.languageDetected : "desconocido",
    tone: typeof raw.tone === "string" ? raw.tone : "",
    viralityHooks: asStringArray(raw.viralityHooks),
    confidence:
      raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
        ? raw.confidence
        : source.partial
          ? "low"
          : "medium",
  };
}

/**
 * Analiza un post de IG (caption + thumbnail) con un modelo multimodal y devuelve
 * un PostAnalysis estructurado. Cacheado por hash de la entrada.
 */
export async function analyzePost(source: InstagramSource): Promise<PostAnalysis> {
  // Imágenes a analizar: mediaDataUris (carrusel/frames), con fallback al thumbnail.
  const images = (source.mediaDataUris?.length ? source.mediaDataUris : source.thumbnailDataUri ? [source.thumbnailDataUri] : []).slice(0, MAX_IMAGES);
  if (!source.caption && !images.length) {
    throw new Error("No hay caption ni imagen para analizar.");
  }

  const cacheKey = sha(`${source.caption}|${images.join("|") || "noimg"}|${getModel()}`);
  const cacheFile = join(CACHE_DIR, `analysis-${cacheKey}.json`);
  if (existsSync(cacheFile)) {
    try {
      return JSON.parse(await readFile(cacheFile, "utf8")) as PostAnalysis;
    } catch {
      // caché corrupta: re-analizar.
    }
  }

  const multi = images.length > 1;
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text:
        `Analiza este post de Instagram (tipo: ${source.type}). ` +
        (multi
          ? `Se adjuntan ${images.length} imágenes: ${source.type === "reel" ? "frames del video en orden" : "todas las slides del carrusel en orden"}. Analiza la estructura SLIDE POR SLIDE y devuelve una entrada en copyPerSlide por cada slide/frame observado.\n`
          : ``) +
        `Caption:\n"""${source.caption || "(sin caption)"}"""\n` +
        `Hashtags: ${source.hashtags.join(" ") || "(ninguno)"}\n\n` +
        `Devuelve SOLO un JSON con este shape exacto:\n` +
        `{ "hook": string, "narrative": string[], "pillar": "herramienta"|"noticia"|"prompt"|"curiosidad", ` +
        `"format": "post"|"reel", "copyPerSlide": [{"role": string, "text": string}], "visualStyle": string, ` +
        `"languageDetected": string, "tone": string, "viralityHooks": string[], "confidence": "low"|"medium"|"high" }`,
    },
  ];
  for (const img of images) {
    userContent.push({ type: "image_url", image_url: { url: img } });
  }

  const res = await getClient().chat.completions.create({
    model: getModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres analista de contenido viral de Instagram. Identificas hook, estructura narrativa, " +
          "pilar de contenido, formato, copy por slide y estilo visual. Respondes SOLO con JSON válido.",
      },
      { role: "user", content: userContent },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  const analysis = normalizeAnalysis(parsed, source);

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(analysis, null, 2), "utf8");
  return analysis;
}

/** Normaliza la salida del modelo a VariationDraft[] válidos (shape mínimo). */
function normalizeVariations(raw: unknown): VariationDraft[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && Array.isArray((raw as { variations?: unknown }).variations)
      ? (raw as { variations: unknown[] }).variations
      : [];
  const out: VariationDraft[] = [];
  for (const v of arr) {
    if (typeof v !== "object" || v === null) continue;
    const o = v as Record<string, unknown>;
    const slides = Array.isArray(o.slides) ? o.slides : [];
    out.push({
      name: typeof o.name === "string" ? o.name : "variacion",
      angle: typeof o.angle === "string" ? o.angle : "",
      pillar: isPillar(o.pillar) ? o.pillar : "curiosidad",
      slides: slides
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          template: String(s.template) as VariationDraft["slides"][number]["template"],
          props: (typeof s.props === "object" && s.props !== null ? s.props : {}) as Record<
            string,
            string | string[] | number | boolean
          >,
          pillar: isPillar(s.pillar) ? s.pillar : undefined,
          background:
            typeof s.background === "object" && s.background !== null
              ? (s.background as VariationDraft["slides"][number]["background"])
              : undefined,
        })),
    });
  }
  return out;
}

/**
 * Genera N (default 2) variaciones del post como VariationDraft, en español
 * neutro o chileno, mapeadas a las plantillas de marca y con ángulos distintos.
 * La validación final (props, plantillas, Hook/Cta) la hace emit.validateDraft.
 */
export async function generateVariations(
  analysis: PostAnalysis,
  opts: { es: SpanishVariant; count?: number },
): Promise<VariationDraft[]> {
  const count = opts.count ?? 2;
  const idioma =
    opts.es === "cl"
      ? "español chileno (modismos naturales de Chile, sin caer en exceso)"
      : "español neutro latinoamericano";

  const catalog = Object.entries(TEMPLATE_CATALOG)
    .map(([name, spec]) => `- ${name}: required ${JSON.stringify(spec.required)}, optional ${JSON.stringify(spec.optional)}`)
    .join("\n");

  const res = await getClient().chat.completions.create({
    model: getModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres editor de contenido de la marca ia.es. Transformas (no copias) un post de referencia en " +
          "variaciones propias, mapeadas a plantillas de carrusel. Respondes SOLO con JSON válido.",
      },
      {
        role: "user",
        content:
          `Análisis del post de referencia:\n${JSON.stringify(analysis, null, 2)}\n\n` +
          `Plantillas disponibles (usa SOLO estas, con sus props):\n${catalog}\n\n` +
          `${BRAND_RULES}\n\n` +
          `Genera EXACTAMENTE ${count} variaciones DISTINTAS entre sí (distinto ángulo de hook o plantilla dominante). ` +
          `Todo el copy en ${idioma}. NUNCA dejes texto en el idioma original.\n` +
          `Devuelve SOLO un JSON: { "variations": [ { "name": string, "angle": string, ` +
          `"pillar": "herramienta"|"noticia"|"prompt"|"curiosidad", "slides": [ { "template": <nombre>, ` +
          `"pillar"?: <pilar>, "props": { ...props de la plantilla en español... }, ` +
          `"background"?: { "ai"?: string, "gradient"?: string, "color"?: string, "overlay"?: number } } ] } ] }`,
      },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  const variations = normalizeVariations(parsed);
  if (!variations.length) {
    throw new Error("El modelo no devolvió variaciones válidas. Reintenta o ajusta el input.");
  }
  return variations;
}
