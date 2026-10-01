import { graphGet, graphPost } from "./client.ts";
import { metaConfig } from "./env.ts";

/**
 * Mensajes directos de la cuenta de Instagram (Messenger Platform para
 * Instagram). Enviar exige el token de la PÁGINA de Facebook vinculada y el
 * permiso instagram_manage_messages. Solo se responde dentro de la ventana de
 * 24 h desde el último mensaje del usuario (siempre se cumple al contestar un DM).
 */

/** Límite de caracteres de un DM de Instagram. */
export const MAX_DM_CHARS = 1000;

let pageToken: string | undefined;

/** Token de la Página vinculada a la cuenta de Instagram (se obtiene una vez con el token de usuario). */
export async function getPageToken(): Promise<string> {
  if (pageToken) return pageToken;
  const { igUserId } = metaConfig();
  const res = await graphGet<{ data?: { id: string; access_token?: string; instagram_business_account?: { id: string } }[] }>(
    "me/accounts",
    { fields: "id,access_token,instagram_business_account{id}" },
  );
  const page = res.data?.find((p) => p.instagram_business_account?.id === igUserId);
  if (!page?.access_token) {
    throw new Error("No encontré la Página de Facebook vinculada a la cuenta de Instagram (revisa pages_show_list y el vínculo).");
  }
  pageToken = page.access_token;
  return pageToken;
}

/** Parte un texto en mensajes ≤ MAX_DM_CHARS, por párrafos y líneas. Función pura. */
export function splitDm(text: string, max = MAX_DM_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const pieces = line.length <= max ? [line] : (line.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? []);
    for (const p of pieces) {
      if (cur && cur.length + 1 + p.length > max) {
        out.push(cur.trim());
        cur = "";
      }
      cur = cur ? `${cur}\n${p}` : p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [""];
}

/** Máximo de respuestas rápidas (botones) por mensaje en Instagram. */
const MAX_QUICK_REPLIES = 13;

/**
 * Envía un DM de texto a un usuario (por su IGSID). Los textos largos se parten.
 * `quickReplies` agrega botones de respuesta rápida al último mensaje (al tocarlo,
 * llega como un DM de texto con ese mismo texto).
 */
export async function sendDm(recipientId: string, text: string, quickReplies: string[] = []): Promise<void> {
  const token = await getPageToken();
  const parts = splitDm(text);
  for (const [i, part] of parts.entries()) {
    const qr = i === parts.length - 1 ? quickReplies.slice(0, MAX_QUICK_REPLIES) : [];
    const message = qr.length
      ? { text: part, quick_replies: qr.map((t) => ({ content_type: "text", title: t.slice(0, 20), payload: t })) }
      : { text: part };
    // Un corte de red no debe perder la respuesta (p. ej. la pregunta "¿de qué cuenta es?").
    for (let attempt = 1; ; attempt++) {
      try {
        await graphPost("me/messages", { recipient: { id: recipientId }, message }, { accessToken: token });
        break;
      } catch (err) {
        if (attempt >= 3 || !/No pude conectar/.test(err instanceof Error ? err.message : "")) throw err;
        await new Promise((r) => setTimeout(r, attempt * 3000));
      }
    }
  }
}
