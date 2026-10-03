import OpenAI from "openai";
import { OPENAI_OPTS } from "./types.ts";

/**
 * Proveedor de cada modelo: los nombres con "/" (p. ej. "deepseek/deepseek-v4.1-flash")
 * van por OpenRouter (OPENROUTER_API_KEY), el resto directo a OpenAI. Si el modelo
 * principal falla, se repite con KB_FALLBACK_MODEL (así un proveedor caído o lento
 * nunca hace perder un guardado).
 */

export const viaOpenRouter = (model: string): boolean => model.includes("/");

/** Tiempo máximo de una llamada por OpenRouter antes de pasar al respaldo. */
const OPENROUTER_TIMEOUT_MS = Number(process.env.KB_OPENROUTER_TIMEOUT_MS) || 90_000;

let openai: OpenAI | null = null;
let openrouter: OpenAI | null = null;

export function clientFor(model: string): OpenAI {
  if (viaOpenRouter(model)) {
    if (!process.env.OPENROUTER_API_KEY) throw new Error(`Falta OPENROUTER_API_KEY en .env (el modelo ${model} va por OpenRouter).`);
    openrouter ??= new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      timeout: OPENROUTER_TIMEOUT_MS,
      maxRetries: 0,
    });
    return openrouter;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY. Agrégala a .env.");
  openai ??= new OpenAI(OPENAI_OPTS);
  return openai;
}

/**
 * Campos extra del request. OpenRouter: costo real en `usage.cost` y solo
 * proveedores que respetan el esquema estricto de la respuesta.
 */
export function extraFor(model: string): Record<string, unknown> {
  return viaOpenRouter(model) ? { usage: { include: true }, provider: { require_parameters: true } } : {};
}

export const fallbackModel = (): string | undefined => process.env.KB_FALLBACK_MODEL?.trim() || undefined;

/** Corre `run` con el modelo principal y, si falla, una vez con el de respaldo. */
export async function withFallback<T>(
  primary: string,
  run: (model: string) => Promise<T>,
  { fallback = fallbackModel(), what = "la llamada", log = console }: { fallback?: string; what?: string; log?: Pick<Console, "warn"> } = {},
): Promise<T> {
  try {
    return await run(primary);
  } catch (err) {
    if (!fallback || fallback === primary) throw err;
    log.warn(`⚠️  ${primary} falló en ${what} (${err instanceof Error ? err.message.slice(0, 160) : err}); uso ${fallback}.`);
    return run(fallback);
  }
}
