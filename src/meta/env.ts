/**
 * Configuración de la API de Meta (Instagram Graph API vía Facebook Login), leída
 * del `.env` de la raíz. Solo lectura: no se piden permisos de publicación.
 */

// Carga .env con el loader nativo de Node (≥ 21.7). El archivo es opcional:
// sin .env se usan las variables del entorno.
try {
  process.loadEnvFile?.();
} catch {
  // sin .env: ok.
}

/** Versión de la Graph API si no se define META_GRAPH_VERSION. */
export const DEFAULT_GRAPH_VERSION = "v26.0";

export interface MetaConfig {
  /** Token de usuario long-lived (~60 días) o de System User. Nunca se imprime. */
  accessToken: string;
  /** Id de la cuenta profesional de Instagram (no el de la Página de Facebook). */
  igUserId: string;
  appId?: string;
  /** Para `appsecret_proof` y `debug_token`. Nunca se imprime. */
  appSecret?: string;
  graphVersion: string;
}

/** Error de configuración (falta una variable): mensaje listo para mostrar al usuario. */
export class MetaConfigError extends Error {}

const clean = (v: string | undefined): string | undefined => v?.trim() || undefined;

let warnedSecret = false;

/** Config de Meta desde el entorno. Lanza MetaConfigError si falta lo indispensable. */
export function metaConfig(): MetaConfig {
  const accessToken = clean(process.env.META_ACCESS_TOKEN);
  const igUserId = clean(process.env.META_IG_USER_ID);
  const missing = [!accessToken && "META_ACCESS_TOKEN", !igUserId && "META_IG_USER_ID"].filter(Boolean);
  if (missing.length) {
    throw new MetaConfigError(
      `Falta ${missing.join(" y ")} en .env. Configura la app de Meta (ver README, "Remix de Instagram") y corre npm run meta:check.`,
    );
  }
  const appSecret = clean(process.env.META_APP_SECRET);
  if (appSecret && !/^[0-9a-f]{32}$/i.test(appSecret) && !warnedSecret) {
    warnedSecret = true;
    console.warn(
      `⚠️  META_APP_SECRET no parece una clave secreta de Meta (tiene ${appSecret.length} caracteres; son 32 hexadecimales). ` +
        "Revísala en Configuración de la app → Básica.",
    );
  }
  const version = clean(process.env.META_GRAPH_VERSION) ?? DEFAULT_GRAPH_VERSION;
  return {
    accessToken: accessToken!,
    igUserId: igUserId!,
    appId: clean(process.env.META_APP_ID),
    appSecret,
    graphVersion: version.startsWith("v") ? version : `v${version}`,
  };
}
