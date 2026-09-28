import { createHmac } from "node:crypto";
import { metaConfig, type MetaConfig } from "./env.ts";

/**
 * Cliente mínimo de la Graph API (solo GET, sobre fetch, sin SDK). Firma cada
 * request con `appsecret_proof`, traduce los errores de Graph a mensajes en
 * español y avisa cuando el uso de la cuota pasa del 80%.
 */

/** Umbral de uso de cuota (%) a partir del cual se avisa. */
const USAGE_WARN_PCT = 80;

/** Error de la Graph API ya traducido. Conserva el código original para decidir qué hacer. */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
  }
}

interface RawGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
}

/** HMAC-SHA256 del token con el app secret (lo exige "Require app secret" y blinda tokens filtrados). */
export function appSecretProof(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Traduce un error de Graph a un mensaje accionable en español. Función pura
 * (testeable). Nunca incluye el token.
 */
export function translateGraphError(e: RawGraphError): string {
  const code = e.code;
  const original = (e.error_user_msg || e.message || "error desconocido").replace(/access_token=[^&\s]+/g, "access_token=***");
  if (/appsecret_proof/i.test(original)) {
    return "META_APP_SECRET no corresponde a la app del token. Cópiala de nuevo desde developers.facebook.com → " +
      "tu app → Configuración de la app → Básica → Clave secreta (32 caracteres), o bórrala del .env.";
  }
  // Business Discovery sobre una cuenta personal, inexistente o privada.
  if (code === 110 || e.error_subcode === 2207013 || /business discovery|professional account|business or creator/i.test(original)) {
    return "Business Discovery no pudo leer esa cuenta: solo funciona con cuentas Business o Creator públicas " +
      "(y el @usuario debe existir). Revisa --user o usa --caption/--image.";
  }
  if (code === 190) {
    return "El token de Meta venció o es inválido (dura ~60 días y se invalida si cambias la contraseña). " +
      "Genera uno nuevo en el Explorador de la API Graph (developers.facebook.com/tools/explorer), " +
      "extiéndelo a long-lived en el Depurador de tokens, pégalo en META_ACCESS_TOKEN y corre npm run meta:check.";
  }
  if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300)) {
    return `A la app le falta un permiso para esta consulta (${original}). Revisa los permisos del token con npm run meta:check.`;
  }
  if (code === 100) {
    return `Consulta inválida: falta un permiso o el campo no existe (${original}).`;
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "Meta aplicó el límite de uso de la API. Espera unos minutos (hasta una hora) y vuelve a intentar.";
  }
  return `Error de la API de Meta${code ? ` (código ${code})` : ""}: ${original}`;
}

/**
 * Mayor % de uso reportado en `X-App-Usage` o `X-Business-Use-Case-Usage`.
 * Función pura (testeable). undefined si no hay headers válidos.
 */
export function maxUsagePercent(appUsage: string | null, bucUsage: string | null): number | undefined {
  const values: number[] = [];
  const collect = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number" && /call_count|total_time|total_cputime|acc_id_util_pct/.test(k)) values.push(v);
      else if (typeof v === "object") collect(v);
    }
  };
  for (const h of [appUsage, bucUsage]) {
    if (!h) continue;
    try {
      collect(JSON.parse(h));
    } catch {
      // header mal formado: se ignora.
    }
  }
  return values.length ? Math.max(...values) : undefined;
}

/** Tiempo máximo por request (ms): una consulta colgada no debe bloquear el remix. */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * fetch con timeout y UN reintento ante fallas de red (no ante errores de Graph,
 * que son respuestas válidas). El error nunca incluye la URL, que lleva el token.
 */
async function fetchWithRetry(url: URL, attempts = 2): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      last = err;
    }
  }
  const e = last as { name?: string; cause?: { code?: string } } | undefined;
  const why = e?.name === "TimeoutError" ? `sin respuesta en ${REQUEST_TIMEOUT_MS / 1000} s` : (e?.cause?.code ?? e?.name ?? "error de red");
  throw new GraphError(`No pude conectar con la API de Meta (${why}). Revisa tu conexión y vuelve a intentar.`);
}

export interface GraphGetOptions {
  /** Token a usar en vez del de .env (p. ej. el token de app "APP_ID|APP_SECRET" para debug_token). */
  accessToken?: string;
  /** Agregar appsecret_proof (default: sí, si hay META_APP_SECRET y se usa el token de .env). */
  proof?: boolean;
  config?: MetaConfig;
}

/**
 * GET a la Graph API: `graphGet("17841…", { fields: "username" })`. Devuelve el
 * JSON de la respuesta o lanza GraphError con el mensaje traducido.
 */
export async function graphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: GraphGetOptions = {},
): Promise<T> {
  const cfg = opts.config ?? metaConfig();
  const token = opts.accessToken ?? cfg.accessToken;
  const url = new URL(`https://graph.facebook.com/${cfg.graphVersion}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  url.searchParams.set("access_token", token);
  const useProof = opts.proof ?? opts.accessToken === undefined;
  if (useProof && cfg.appSecret) url.searchParams.set("appsecret_proof", appSecretProof(token, cfg.appSecret));

  const res = await fetchWithRetry(url);

  const usage = maxUsagePercent(res.headers.get("x-app-usage"), res.headers.get("x-business-use-case-usage"));
  if (usage !== undefined && usage >= USAGE_WARN_PCT) {
    console.warn(`⚠️  Uso de la API de Meta al ${usage}% de la cuota: baja el ritmo o Meta empezará a limitar.`);
  }

  const body = (await res.json().catch(() => ({}))) as { error?: RawGraphError } & T;
  if (!res.ok || body.error) {
    const e = body.error ?? { message: `HTTP ${res.status}` };
    throw new GraphError(translateGraphError(e), e.code, e.error_subcode);
  }
  return body;
}

/**
 * POST a la Graph API con cuerpo JSON (p. ej. enviar un DM). Mismas reglas que
 * graphGet: appsecret_proof, errores traducidos y el token nunca en mensajes.
 */
export async function graphPost<T = Record<string, unknown>>(
  path: string,
  body: unknown,
  opts: GraphGetOptions = {},
): Promise<T> {
  const cfg = opts.config ?? metaConfig();
  const token = opts.accessToken ?? cfg.accessToken;
  const url = new URL(`https://graph.facebook.com/${cfg.graphVersion}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if ((opts.proof ?? true) && cfg.appSecret) url.searchParams.set("appsecret_proof", appSecretProof(token, cfg.appSecret));
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const e = err as { name?: string; cause?: { code?: string } };
    throw new GraphError(`No pude conectar con la API de Meta (${e?.cause?.code ?? e?.name ?? "error de red"}).`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: RawGraphError } & T;
  if (!res.ok || json.error) {
    const e = json.error ?? { message: `HTTP ${res.status}` };
    throw new GraphError(translateGraphError(e), e.code, e.error_subcode);
  }
  return json;
}
