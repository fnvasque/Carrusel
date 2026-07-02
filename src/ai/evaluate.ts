import type { CarouselSpec } from "../templates/types.ts";
import type { InstagramSource, PostAnalysis } from "../remix/types.ts";
import { specToReadable } from "../templates/slideText.ts";
import { getClient, getModel, hasApiKey, extractJson } from "./client.ts";
import { ANDREA } from "./persona.ts";

/**
 * Evaluadores de CONTENIDO que complementan el proxy de viralidad (score/virality.ts):
 *
 *  1) evaluateAudienceValue — el modelo LEE el carrusel como la persona objetivo
 *     ("Andrea") y puntúa, con honestidad, si le aporta valor real (0-100).
 *  2) factCheckContent — verifica los HECHOS del copy (herramientas, números,
 *     fechas, capacidades, fuentes) para no romper la promesa de marca (sin hype,
 *     sin clickbait que no cumple). Offline por defecto; web opcional vía flag.
 *
 * Ambos operan sobre un CarouselSpec (denominador común de `remix` y `generate`).
 */

export { hasApiKey };

/** Umbral de valor de audiencia para considerar el contenido "listo". */
export const AUDIENCE_THRESHOLD = 75;

// ─────────────────────────────── Tipos ───────────────────────────────

export interface AudienceDimension {
  name: string;
  score: number;
  max: number;
  notes: string[];
}

export interface AudienceResult {
  total: number;
  grade: string;
  dimensions: AudienceDimension[];
  /** Qué le falló al lector, en frases accionables para el editor (alimenta la corrección). */
  weaknesses: string[];
  /** Veredicto en 1 frase: ¿lo guardaría? por qué. */
  verdict: string;
}

export type FactSeverity = "alta" | "media" | "baja";

export interface FactIssue {
  claim: string;
  severity: FactSeverity;
  why: string;
  fix: string;
}

export interface FactCheckResult {
  /** true si no hay issues de severidad alta ni media. */
  pass: boolean;
  issues: FactIssue[];
  /** Afirmaciones concretas revisadas (para dar contexto en el reporte). */
  checked: number;
  /** true si se usó verificación web (Responses API + web_search). */
  web: boolean;
}

export interface EvaluateContext {
  analysis?: PostAnalysis;
  source?: InstagramSource;
}

// ─────────────────────────────── Persona ───────────────────────────────
// La persona ANDREA vive en persona.ts (fuente única, compartida con el generador).

function gradeOf(t: number): string {
  if (t >= 90) return "A";
  if (t >= 80) return "A-";
  if (t >= 70) return "B";
  if (t >= 60) return "C";
  return "D";
}

function ctxAnchor(ctx?: EvaluateContext): string {
  if (!ctx?.analysis && !ctx?.source) return "";
  const parts: string[] = [];
  if (ctx.source?.caption) parts.push(`Caption original: """${ctx.source.caption.slice(0, 800)}"""`);
  if (ctx.analysis) {
    parts.push(`Análisis del post de referencia (ancla; NO inventes datos que no estén aquí ni sean de conocimiento público verificable):`);
    parts.push(JSON.stringify(
      {
        hook: ctx.analysis.hook,
        narrative: ctx.analysis.narrative,
        copyPerSlide: ctx.analysis.copyPerSlide,
        pillar: ctx.analysis.pillar,
      },
      null,
      2,
    ));
  }
  return parts.join("\n");
}

// ──────────────────────── 1) Valor de audiencia ────────────────────────

const AUDIENCE_DIMS: { name: string; max: number; q: string }[] = [
  { name: "Claridad-30s", max: 25, q: "¿entendiste QUÉ es y POR QUÉ importa sin releer, en ~30s?" },
  { name: "Aplicable-hoy", max: 25, q: "¿te llevas un paso/prompt/acción concreta usable HOY en tu trabajo?" },
  { name: "Sin-hype", max: 15, q: "¿te trata como inteligente? nada de humo, miedo ni jerga cruda sin explicar." },
  { name: "Relevancia", max: 15, q: "¿te dice algo que no sabías y que te sirve a TI (no genérico)?" },
  { name: "Guardar/Compartir", max: 20, q: "¿lo guardarías o se lo mandarías a un colega? ¿por qué?" },
];

const AUDIENCE_TOTAL = AUDIENCE_DIMS.reduce((a, d) => a + d.max, 0); // 100

/** Normaliza el JSON del modelo a un AudienceResult válido. Exportada para tests. */
export function normalizeAudience(raw: Record<string, unknown>): AudienceResult {
  const byName = new Map<string, { score: number; notes: string[] }>();
  if (Array.isArray(raw.dimensions)) {
    for (const d of raw.dimensions) {
      if (typeof d !== "object" || d === null) continue;
      const o = d as Record<string, unknown>;
      const name = String(o.name ?? "");
      const score = Number(o.score);
      const notes = Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string") : [];
      if (name) byName.set(name.toLowerCase(), { score: Number.isFinite(score) ? score : 0, notes });
    }
  }
  const dimensions: AudienceDimension[] = AUDIENCE_DIMS.map((spec) => {
    // Empareja por prefijo del nombre (tolerante a variantes del modelo).
    const hit =
      byName.get(spec.name.toLowerCase()) ??
      [...byName.entries()].find(([k]) => k.startsWith(spec.name.toLowerCase().slice(0, 6)))?.[1];
    const score = Math.max(0, Math.min(spec.max, Math.round(hit?.score ?? 0)));
    return { name: spec.name, score, max: spec.max, notes: hit?.notes ?? [] };
  });
  const total = Math.max(0, Math.min(100, dimensions.reduce((a, d) => a + d.score, 0)));
  const weaknesses = Array.isArray(raw.weaknesses)
    ? raw.weaknesses.filter((x): x is string => typeof x === "string")
    : [];
  const verdict = typeof raw.verdict === "string" ? raw.verdict : "";
  return { total, grade: gradeOf(total), dimensions, weaknesses, verdict };
}

/**
 * Lee el carrusel COMO la persona objetivo y puntúa el valor real (0-100) con
 * desglose por dimensión + debilidades accionables + veredicto.
 */
export async function evaluateAudienceValue(
  spec: CarouselSpec,
  ctx?: EvaluateContext,
): Promise<AudienceResult> {
  const readable = specToReadable(spec);
  const rubric = AUDIENCE_DIMS.map((d) => `- ${d.name} (0-${d.max}): ${d.q}`).join("\n");

  const res = await getClient().chat.completions.create({
    model: getModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `${ANDREA}\n\nEres una lectora real evaluando si este contenido te aporta valor. ` +
          `Sé exigente y honesta. Respondes SOLO con JSON válido.`,
      },
      {
        role: "user",
        content:
          `Carrusel "${spec.name}" (una línea por slide):\n${readable}\n\n` +
          `Puntúa CADA dimensión desde tu experiencia como Andrea (score 0..max):\n${rubric}\n\n` +
          `En "weaknesses" escribe, como frases accionables para el editor, qué te falló y cómo arreglarlo ` +
          `(ej. "El paso 2 es genérico: dale un prompt copiable"). En "verdict", 1 frase: ¿lo guardarías? por qué.\n` +
          `Devuelve SOLO JSON: { "dimensions": [ { "name": string, "score": number, "max": number, "notes": string[] } ], ` +
          `"weaknesses": string[], "verdict": string }. Los "name" deben ser EXACTAMENTE: ${AUDIENCE_DIMS.map((d) => d.name).join(", ")}.`,
      },
    ],
  });

  return normalizeAudience(extractJson(res.choices[0]?.message?.content ?? "{}"));
}

// ──────────────────────── 2) Fact-check ────────────────────────

/** Normaliza el JSON del modelo a un FactCheckResult válido. Exportada para tests. */
export function normalizeFactCheck(raw: Record<string, unknown>, web: boolean): FactCheckResult {
  const issues: FactIssue[] = Array.isArray(raw.issues)
    ? raw.issues
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((o) => {
          const sev = String(o.severity ?? "media").toLowerCase();
          const severity: FactSeverity = sev === "alta" ? "alta" : sev === "baja" ? "baja" : "media";
          return {
            claim: String(o.claim ?? "").trim(),
            severity,
            why: String(o.why ?? "").trim(),
            fix: String(o.fix ?? "").trim(),
          };
        })
        .filter((i) => i.claim.length > 0)
    : [];
  const checked = Number.isFinite(Number(raw.checkedCount)) ? Number(raw.checkedCount) : issues.length;
  const pass = !issues.some((i) => i.severity === "alta" || i.severity === "media");
  return { pass, issues, checked, web };
}

const FACT_SYSTEM =
  "Eres un verificador de hechos riguroso para contenido de divulgación de IA en español. " +
  "No dejas pasar afirmaciones concretas sin respaldo ni datos inventados. Respondes SOLO con JSON válido.";

function factUserPrompt(readable: string, ctx?: EvaluateContext): string {
  const anchor = ctxAnchor(ctx);
  return (
    `Verifica los HECHOS de este carrusel. Revisa CADA afirmación concreta: nombre de producto/herramienta, ` +
    `número o %, fecha, precio, capacidad técnica, y toda cita o fuente citada.\n\n` +
    (anchor ? `${anchor}\n\n` : "") +
    `Carrusel:\n${readable}\n\n` +
    `Clasifica cada problema por severidad:\n` +
    `- "alta": afirmación falsa o muy probablemente inventada (herramienta que no existe, dato/fecha/precio incorrecto, capacidad que el producto NO tiene).\n` +
    `- "media": afirmación concreta NO verificable o sin respaldo, o que exagera lo que dice la fuente.\n` +
    `- "baja": plausible pero impreciso o le falta citar una fuente.\n` +
    `Para cada issue da: "claim" (el texto exacto del carrusel), "why" (por qué es problema) y "fix" ` +
    `(cómo corregirlo: corrige el dato / suaviza la afirmación / añade fuente). Si todo está correcto, "issues": [].\n` +
    `Devuelve SOLO JSON: { "issues": [ { "claim": string, "severity": "alta"|"media"|"baja", "why": string, "fix": string } ], "checkedCount": number }`
  );
}

/** Fact-check con verificación web (OpenAI Responses API + web_search). Degrada a offline si falla. */
async function factCheckWeb(readable: string, ctx?: EvaluateContext): Promise<FactCheckResult> {
  const client = getClient() as unknown as {
    responses?: { create: (args: Record<string, unknown>) => Promise<{ output_text?: string }> };
  };
  if (!client.responses?.create) return factCheckOffline(readable, ctx);
  const res = await client.responses.create({
    model: getModel(),
    tools: [{ type: "web_search_preview" }],
    input: `${FACT_SYSTEM}\n\n${factUserPrompt(readable, ctx)}\n\nBusca en la web para confirmar o refutar cada afirmación concreta antes de responder.`,
  });
  return normalizeFactCheck(extractJson(res.output_text ?? "{}"), true);
}

/** Fact-check offline: conocimiento del modelo + ancla de la fuente. */
async function factCheckOffline(readable: string, ctx?: EvaluateContext): Promise<FactCheckResult> {
  const res = await getClient().chat.completions.create({
    model: getModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FACT_SYSTEM },
      { role: "user", content: factUserPrompt(readable, ctx) },
    ],
  });
  return normalizeFactCheck(extractJson(res.choices[0]?.message?.content ?? "{}"), false);
}

/**
 * Verifica los hechos del carrusel. Offline por defecto; con opts.web usa la
 * Responses API con web_search (degrada a offline si no está disponible).
 */
export async function factCheckContent(
  spec: CarouselSpec,
  ctx?: EvaluateContext,
  opts?: { web?: boolean },
): Promise<FactCheckResult> {
  const readable = specToReadable(spec);
  if (opts?.web) {
    try {
      return await factCheckWeb(readable, ctx);
    } catch {
      // Web no disponible / falló: cae a offline para no romper el flujo.
      return factCheckOffline(readable, ctx);
    }
  }
  return factCheckOffline(readable, ctx);
}

// ──────────────────────── Gate combinado + reportes ────────────────────────

export interface ContentGateResult {
  audience: AudienceResult;
  factcheck: FactCheckResult;
  /** true si valor ≥ minAudience Y el fact-check pasa. */
  pass: boolean;
  minAudience: number;
}

/** Corre valor de audiencia + fact-check y combina el veredicto. */
export async function evaluateContent(
  spec: CarouselSpec,
  ctx?: EvaluateContext,
  opts?: { web?: boolean; minAudience?: number },
): Promise<ContentGateResult> {
  const minAudience = opts?.minAudience ?? AUDIENCE_THRESHOLD;
  const [audience, factcheck] = await Promise.all([
    evaluateAudienceValue(spec, ctx),
    factCheckContent(spec, ctx, { web: opts?.web }),
  ]);
  return {
    audience,
    factcheck,
    pass: audience.total >= minAudience && factcheck.pass,
    minAudience,
  };
}

/** Sugerencias accionables para el corrector (debilidades de valor + fixes de hechos). */
export function gateSuggestions(gate: ContentGateResult): string[] {
  const out: string[] = [];
  if (gate.audience.total < gate.minAudience) {
    out.push(...gate.audience.weaknesses);
  }
  for (const i of gate.factcheck.issues) {
    if (i.severity === "alta" || i.severity === "media") {
      out.push(`Corrige el hecho (${i.severity}): "${i.claim}" — ${i.fix || i.why}`);
    }
  }
  return out;
}

export function printAudienceReport(name: string, r: AudienceResult): void {
  const status = r.total >= AUDIENCE_THRESHOLD ? "✅ aporta valor" : "⚠️  poco valor";
  console.log(`\n👤 Valor para la audiencia — ${name}  →  ${r.total}/100  (${r.grade})  ${status}\n`);
  for (const d of r.dimensions) {
    const bar = "█".repeat(Math.round((d.score / d.max) * 10)).padEnd(10, "░");
    const notes = d.notes.length ? `  · ${d.notes.join(" · ")}` : "";
    console.log(`  ${d.name.padEnd(18)} ${bar} ${String(d.score).padStart(2)}/${d.max}${notes}`);
  }
  if (r.verdict) console.log(`\n  Veredicto de Andrea: ${r.verdict}`);
  if (r.weaknesses.length) {
    console.log("\n  Qué mejorar (según la audiencia):");
    for (const w of r.weaknesses.slice(0, 6)) console.log(`   • ${w}`);
  }
  console.log("");
}

export function printFactCheckReport(name: string, r: FactCheckResult): void {
  const mode = r.web ? "web" : "offline";
  const status = r.pass ? "✅ sin banderas" : "⛔ hechos a corregir";
  console.log(`\n🔎 Fact-check (${mode}) — ${name}  →  ${status}  (${r.checked} afirmación(es) revisada(s))\n`);
  if (!r.issues.length) {
    console.log("  Sin problemas detectados.\n");
    return;
  }
  const order: FactSeverity[] = ["alta", "media", "baja"];
  const icon: Record<FactSeverity, string> = { alta: "⛔", media: "⚠️ ", baja: "·" };
  for (const sev of order) {
    for (const i of r.issues.filter((x) => x.severity === sev)) {
      console.log(`  ${icon[sev]} [${sev}] "${i.claim}"`);
      if (i.why) console.log(`       porqué: ${i.why}`);
      if (i.fix) console.log(`       fix: ${i.fix}`);
    }
  }
  console.log("");
}
