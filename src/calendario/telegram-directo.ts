import { ocultarToken } from "./plan.ts";

/**
 * Aviso por Telegram desde el Mac. El Mac no corre el bot (el único bot vive en el
 * servidor; dos bots chocarían con un 409), así que manda un `sendMessage` directo
 * con el token de `.env` a cada chat de `TELEGRAM_ALLOWED_CHAT_IDS`.
 */

const LIMITE = 4000; // Telegram corta en 4096 caracteres.

/** Quita del texto el token del bot y el de medios (en claro o codificados). */
function limpiar(s: string, env: NodeJS.ProcessEnv): string {
  let out = s;
  for (const t of [env.TELEGRAM_BOT_TOKEN, env.MEDIA_PUBLIC_TOKEN]) if (t) out = ocultarToken(out, t);
  return out;
}

/**
 * Manda `texto` a cada chat permitido. Devuelve true si llegó a al menos uno.
 * Nunca lanza y nunca escribe un token en la consola ni en el mensaje.
 */
export async function avisarTelegram(
  texto: string,
  opts: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chats = (env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
  if (!token || !chats.length) return false;
  const hacer = opts.fetch ?? fetch;
  const cuerpo = limpiar(texto, env).slice(0, LIMITE);
  let alguno = false;
  for (const chat_id of chats) {
    try {
      const res = await hacer(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: cuerpo, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) alguno = true;
      else console.warn(`⚠️  Telegram respondió ${res.status} al avisar al chat ${chat_id}.`);
    } catch (e) {
      console.warn(`⚠️  No pude avisar por Telegram: ${limpiar(e instanceof Error ? e.message : String(e), env)}`);
    }
  }
  return alguno;
}
