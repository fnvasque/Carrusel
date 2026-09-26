import type { Extraction } from "./types.ts";

/**
 * Corrección determinista de nombres propios mal transcritos ("Cloud" → "Claude").
 * El modelo propone los pares en `nameFixes`; aquí se aplican en toda la ficha y
 * la transcripción, para que no dependa de que el modelo lo haga en cada campo.
 */

type Fix = { wrong: string; right: string };

/** Campos de la extracción que NO se tocan (texto literal de imágenes, metadatos). */
const SKIP_KEYS = new Set(["imageTexts", "nameFixes", "tags", "language", "confidence"]);

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string, flags = "giu"): RegExp => new RegExp(`(?<![\\p{L}\\d])${escapeRe(w)}(?![\\p{L}\\d])`, flags);

/**
 * Filtra las correcciones confiables: el nombre correcto debe aparecer en la
 * evidencia (caption, texto de imágenes, comentarios) y el "incorrecto" NO
 * (si aparece ahí, es una palabra legítima del post, p. ej. "Google Cloud").
 */
export function validFixes(fixes: Fix[] | undefined, evidence: string): Fix[] {
  return (fixes ?? [])
    .map((f) => ({ wrong: f.wrong.trim(), right: f.right.trim() }))
    .filter((f) =>
      f.wrong.length >= 3 && f.right &&
      f.wrong.toLowerCase() !== f.right.toLowerCase() &&
      wordRe(f.right, "iu").test(evidence) &&
      !wordRe(f.wrong, "iu").test(evidence),
    );
}

export function fixText(text: string, fixes: Fix[]): string {
  return fixes.reduce((t, f) => t.replace(wordRe(f.wrong), f.right), text);
}

function fixDeep<T>(value: T, fixes: Fix[]): T {
  if (typeof value === "string") return fixText(value, fixes) as T;
  if (Array.isArray(value)) return value.map((v) => fixDeep(v, fixes)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SKIP_KEYS.has(k) ? v : fixDeep(v, fixes);
    return out as T;
  }
  return value;
}

/** Aplica las correcciones válidas a la extracción y a la transcripción. */
export function applyNameFixes(
  extraction: Extraction,
  transcript: string | undefined,
  evidence: string,
): { extraction: Extraction; transcript: string | undefined } {
  const fixes = validFixes(extraction.nameFixes, evidence);
  if (!fixes.length) return { extraction, transcript };
  return {
    extraction: fixDeep(extraction, fixes),
    transcript: transcript === undefined ? undefined : fixText(transcript, fixes),
  };
}

/** Dominio de una URL sin "www." (o undefined si no es una URL válida). */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Deja el link de una herramienta solo si su dominio aparece en el post
 * (caption, texto de imágenes, transcripción o comentarios): el modelo tiende a
 * completar links "probables" que el post nunca mostró.
 */
export function groundToolUrls(extraction: Extraction, evidence: string): Extraction {
  const text = evidence.toLowerCase();
  const tools = extraction.tools.map((t) => {
    const host = t.url ? hostOf(t.url) : undefined;
    return host && text.includes(host) ? t : { ...t, url: null };
  });
  return { ...extraction, tools };
}
