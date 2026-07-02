import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type OpenAI from "openai";
import type { InstagramSource, PostAnalysis, VariationDraft, SpanishVariant } from "../remix/types.ts";
import { TEMPLATE_CATALOG } from "../remix/templates-catalog.ts";
import { theme } from "../theme.ts";
import { getClient, getModel, extractJson } from "./client.ts";
import { ANDREA, formatAngle, type AudienceAngle } from "./persona.ts";

const CACHE_DIR = join(process.cwd(), ".cache", "remix");
const PILLARS = ["herramienta", "noticia", "prompt", "curiosidad"] as const;

/** Tope de imágenes que se adjuntan al modelo (control de coste/latencia). */
const MAX_IMAGES = 8;

/**
 * Reglas de marca y viralidad embebidas en el prompt de generación. Resumen del
 * filtro .context/04-quality-gate-viral.md para que las variaciones puntúen alto
 * en `scoreCarousel`.
 */
const BRAND_RULES = `
Marca ia.es: identidad CLARA/editorial. Fondo crema claro (lo pinta la plantilla), tipografía serif para titulares, texto tinta oscura. Acentos de marca: cian #22D3EE (primario) + rosa #F471B5 (secundario). La palabra clave del titular va con MARCADOR (prop "highlight", 1-2 palabras): por defecto cian; puedes alternar rosa en algún slide para variar.
Pilares de contenido (prop "pillar"): "herramienta" | "noticia" | "prompt" | "curiosidad".
Reglas de contenido (concreto y demostrativo, para maximizar guardados/compartidos):
- TEXTO PLANO: el valor de cada prop es texto plano, SIN etiquetas ni markup (nada de "<highlight>", "**", "<b>", etc.). La palabra a resaltar va SOLO en la prop "highlight" (texto exacto que aparece en el título), nunca envuelta en el texto.
- El Hook (primer slide) lleva un número concreto + tensión/curiosidad. Define "highlight" (la palabra que va con marcador).
- 6 a 8 slides. Empieza con Hook y termina con Cta.
- Cada slide de desarrollo (Step/Prompt) debe ser CONCRETO y ACCIONABLE: un paso real, un ejemplo, o un prompt copiable usable HOY — nada de frases genéricas de relleno. Usa Prompt para prompts copiables. Numera los pasos (step "01"…) y pon index/total.
- Incluye al menos un slide de reframe (Lead o MythReality).
- El Cta primario pide guardar o compartir; handle por defecto "${theme.brand.handle}".
- PROHIBIDO: hype ("cambia tu vida", "increíble"), miedo ("te reemplaza"), jerga técnica cruda sin explicar (LLM, token, embedding) y clickbait ("no vas a creer").
- FONDOS: NUNCA establezcas "background" en ningún slide (ni ai, ni gradient, ni color). La plantilla ya pinta la superficie de marca clara (crema editorial) en TODOS los slides. Omite la prop "background" por completo.
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

/** Normaliza el JSON del modelo a un AudienceAngle válido. */
function normalizeAngle(raw: Record<string, unknown>): AudienceAngle {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim()) : [];
  return {
    angle: str(raw.angle),
    jobToBeDone: str(raw.jobToBeDone),
    useCases: arr(raw.useCases),
    drop: arr(raw.drop),
  };
}

/**
 * Deriva el ÁNGULO de audiencia: reencuadra el tema del post al mundo de Andrea
 * (marketing en pyme) ANTES de generar. Es el paso que hace que las variaciones se
 * escriban PARA Andrea (misma persona que juzga el gate de valor), no que traduzcan
 * el post. Si el tema es técnico/ajeno, lo reencuadra a su aplicación más útil.
 */
export async function deriveAudienceAngle(
  analysis: PostAnalysis,
  opts: { es: SpanishVariant },
): Promise<AudienceAngle> {
  const idioma = opts.es === "cl" ? "español chileno" : "español neutro latinoamericano";
  const res = await getClient().chat.completions.create({
    model: getModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `${ANDREA}\n\nEres estratega de contenido de la marca ia.es: reencuadras cualquier tema de IA al ` +
          `mundo de Andrea. Respondes SOLO con JSON válido.`,
      },
      {
        role: "user",
        content:
          `Análisis del post de referencia:\n${JSON.stringify(analysis, null, 2)}\n\n` +
          `Define el ÁNGULO para reencuadrar ESTE tema al trabajo de Andrea (marketing en una pyme, NO técnica), en ${idioma}:\n` +
          `- "angle": en 1 frase, cómo Andrea usa este tema en su trabajo.\n` +
          `- "jobToBeDone": el problema concreto de marketing que le resuelve.\n` +
          `- "useCases": 2-4 usos concretos en marketing de pyme (posts, campañas, correos, atención, etc.).\n` +
          `- "drop": qué del post original NO le sirve a Andrea (jerga técnica, casos de otro público) y hay que soltar.\n` +
          `Si el tema es técnico o para otro público, reencuádralo a la aplicación más cercana y útil para ella (no lo descartes).\n` +
          `Devuelve SOLO JSON: { "angle": string, "jobToBeDone": string, "useCases": string[], "drop": string[] }`,
      },
    ],
  });
  return normalizeAngle(extractJson(res.choices[0]?.message?.content ?? "{}"));
}

/**
 * Genera N (default 2) variaciones del post como VariationDraft, en español
 * neutro o chileno, mapeadas a las plantillas de marca y con ángulos distintos.
 * Si se pasa `angle`, TODAS las variaciones se escriben desde el ángulo de Andrea.
 * La validación final (props, plantillas, Hook/Cta) la hace emit.validateDraft.
 */
export async function generateVariations(
  analysis: PostAnalysis,
  opts: { es: SpanishVariant; count?: number; angle?: AudienceAngle },
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
          (opts.angle ? `${formatAngle(opts.angle)}\n\n${ANDREA}\n\n` : "") +
          `Plantillas disponibles (usa SOLO estas, con sus props):\n${catalog}\n\n` +
          `${BRAND_RULES}\n\n` +
          `Genera EXACTAMENTE ${count} variaciones DISTINTAS entre sí (distinto ángulo de hook o plantilla dominante, ` +
          `pero TODAS desde el ángulo de Andrea de arriba). ` +
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

/**
 * Mejora UNA variación usando el feedback del score de viralidad: re-prompt
 * dirigido con las sugerencias concretas (hook sin número/enemigo/bucle, falta
 * reframe/CTA de guardar, etc.), conservando el ángulo. Si el modelo no devuelve
 * algo válido, devuelve el draft original (degradable).
 */
export async function improveVariation(
  analysis: PostAnalysis,
  draft: VariationDraft,
  suggestions: string[],
  opts: { es: SpanishVariant; angle?: AudienceAngle },
): Promise<VariationDraft> {
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
          "Eres editor de contenido de la marca ia.es. Mejoras una variación de carrusel para que " +
          "suba su puntaje de viralidad, corrigiendo debilidades concretas. Respondes SOLO con JSON válido.",
      },
      {
        role: "user",
        content:
          `Contexto del análisis original:\n${JSON.stringify(analysis, null, 2)}\n\n` +
          (opts.angle ? `${formatAngle(opts.angle)}\n\n${ANDREA}\n\n` : "") +
          `Plantillas disponibles (usa SOLO estas, con sus props):\n${catalog}\n\n` +
          `${BRAND_RULES}\n\n` +
          `Esta es la variación ACTUAL (mejórala, NO empieces de cero):\n${JSON.stringify(draft, null, 2)}\n\n` +
          `Debilidades a CORREGIR (del indicador de viralidad), todas obligatorias:\n` +
          suggestions.map((s) => `- ${s}`).join("\n") +
          `\n\nDevuelve UNA sola variación mejorada que CONSERVE el "angle" y el espíritu, en ${idioma}, ` +
          `corrigiendo cada debilidad listada. Mismo shape JSON: ` +
          `{ "variations": [ { "name": string, "angle": string, ` +
          `"pillar": "herramienta"|"noticia"|"prompt"|"curiosidad", "slides": [ { "template": <nombre>, ` +
          `"pillar"?: <pilar>, "props": { ...props en español... }, ` +
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
  return variations[0] ?? draft;
}
