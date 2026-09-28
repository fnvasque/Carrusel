import { pathToFileURL } from "node:url";
import { graphGet } from "./client.ts";
import { metaConfig } from "./env.ts";

/**
 * `npm run meta:check`: verifica que la conexión con Meta funciona — cuenta de
 * Instagram, vencimiento y permisos del token. Sale con código ≠ 0 si algo falla.
 * Nunca imprime el token ni el app secret.
 */

/** Permisos de solo lectura que necesita el proyecto. */
export const REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

/** Permisos extra para recibir y responder DMs (solo si el webhook está configurado). */
export const DM_SCOPES = ["instagram_manage_messages", "pages_manage_metadata"];

/** Días de margen antes del vencimiento a partir de los cuales se avisa. */
const EXPIRY_WARN_DAYS = 10;

interface DebugToken {
  data?: { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; app_id?: string };
}

/** Días que faltan hasta `expiresAt` (epoch en s). Función pura. 0 = no expira (System User). */
export function daysLeft(expiresAt: number | undefined, now = Date.now()): number | undefined {
  if (expiresAt === undefined) return undefined;
  if (expiresAt === 0) return Infinity;
  return Math.floor((expiresAt * 1000 - now) / 86_400_000);
}

async function main(): Promise<void> {
  let ok = true;
  const cfg = metaConfig();
  console.log(`🔌 Graph API ${cfg.graphVersion} · IG user ${cfg.igUserId}`);

  // 1) Cuenta de Instagram.
  const me = await graphGet<{ username?: string; followers_count?: number; media_count?: number }>(cfg.igUserId, {
    fields: "username,followers_count,media_count",
  });
  console.log(`✓ Cuenta: @${me.username} · ${me.followers_count ?? "?"} seguidores · ${me.media_count ?? "?"} posts`);

  // 2) Token: vencimiento y permisos. Se consulta con el token de app (APP_ID|APP_SECRET);
  // si no hay secret o no sirve, el propio token puede consultarse a sí mismo.
  {
    let dbg: DebugToken | undefined;
    if (cfg.appId && cfg.appSecret) {
      try {
        dbg = await graphGet<DebugToken>(
          "debug_token",
          { input_token: cfg.accessToken },
          { accessToken: `${cfg.appId}|${cfg.appSecret}`, proof: false },
        );
      } catch {
        console.error("✗ META_APP_ID|META_APP_SECRET no es un token de app válido: revisa la Clave secreta (32 caracteres).");
        ok = false;
      }
    } else {
      console.warn("⚠️  Sin META_APP_ID/META_APP_SECRET: reviso el token con el propio token (sin appsecret_proof).");
    }
    dbg ??= await graphGet<DebugToken>("debug_token", { input_token: cfg.accessToken }, { proof: false });
    const d = dbg.data ?? {};
    if (!d.is_valid) {
      console.error("✗ El token no es válido. Genera uno nuevo (ver README) y actualiza META_ACCESS_TOKEN.");
      ok = false;
    }
    const left = daysLeft(d.expires_at);
    if (left === Infinity) console.log("✓ Token: no expira (System User).");
    else if (left !== undefined) {
      const date = new Date(d.expires_at! * 1000).toISOString().slice(0, 10);
      console.log(`${left < EXPIRY_WARN_DAYS ? "⚠️ " : "✓"} Token vence el ${date} (en ${left} días).`);
      if (left < EXPIRY_WARN_DAYS) {
        console.warn("   Renuévalo pronto: Explorador de la API Graph → token nuevo → Depurador de tokens → Extender.");
        ok = false;
      }
    }
    const scopes = d.scopes ?? [];
    console.log(`  Permisos: ${scopes.join(", ") || "(ninguno)"}`);
    const needed = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ? [...REQUIRED_SCOPES, ...DM_SCOPES] : REQUIRED_SCOPES;
    const missing = needed.filter((s) => !scopes.includes(s));
    if (missing.length) {
      console.error(`✗ Faltan permisos: ${missing.join(", ")}. Vuelve a generar el token marcándolos.`);
      ok = false;
    }
  }

  if (!ok) process.exit(1);
  console.log("\n✅ Meta listo para la ingesta del remix.");
}

// Solo corre como script (npm run meta:check), no al importarlo desde los tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
