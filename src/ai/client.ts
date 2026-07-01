import OpenAI from "openai";

/**
 * Cliente OpenAI compartido por el pipeline (análisis, generación y evaluación de
 * contenido). Lazy + guardia de API key, un único punto de configuración de modelo.
 */

let client: OpenAI | null = null;

/** Modelo de texto/multimodal a usar. Configurable por REMIX_MODEL (default gpt-4o). */
export function getModel(): string {
  return process.env.REMIX_MODEL ?? "gpt-4o";
}

/** ¿Hay API key disponible? Permite degradar gates cuando no se puede llamar al modelo. */
export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Cliente OpenAI lazy con guardia de API key. */
export function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Falta OPENAI_API_KEY. Expórtala para usar el análisis/generación/evaluación con OpenAI.",
    );
  }
  client ??= new OpenAI();
  return client;
}

/** Extrae el primer objeto JSON de un texto que puede venir con prosa alrededor. */
export function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // El modelo pudo envolver el JSON en texto/```json; toma el primer bloque {...}.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        // cae al objeto vacío
      }
    }
    return {};
  }
}
