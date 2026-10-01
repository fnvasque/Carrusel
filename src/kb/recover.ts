import { graphGet } from "../meta/client.ts";
import { getPageToken } from "../meta/messages.ts";
import { firstTime, seenBefore, seenCount, type DmEvent } from "./inbox.ts";

/**
 * DMs que llegaron mientras el bot estaba caído (reinicio, deploy, corte).
 * Meta reintenta los webhooks poco tiempo, así que al arrancar se revisan las
 * conversaciones recientes de la cuenta y se comparan con los ya vistos
 * (inbox_seen: los ids de la API de conversaciones son los mismos `mid` del webhook).
 *
 * Límite de la API (verificado 2026-09): un post o reel compartido aparece como
 * `is_unsupported` y sin contenido. Los textos (preguntas, links con @) se
 * procesan; por los posts compartidos solo se puede pedir que los reenvíes.
 */

/** Mensaje tal como lo devuelve GET /{page-id}/conversations?platform=instagram. */
export interface ConvMessage {
  id: string;
  created_time: string;
  from?: { id?: string; username?: string };
  message?: string;
  is_unsupported?: boolean;
}

export interface Missed {
  /** Mensajes de texto perdidos, del más antiguo al más nuevo (se procesan como un DM normal). */
  events: DmEvent[];
  /** Posts compartidos perdidos (ilegibles por la API), por remitente. */
  unreadable: Record<string, number>;
}

/** Solo se recupera lo de las últimas 24 h: fuera de esa ventana Instagram no deja responder. */
export const RECOVER_WINDOW_MS = 24 * 3_600_000;

/** Qué se perdió. Función pura (testeable). */
export function missedMessages(
  msgs: ConvMessage[],
  opts: { allowed: Set<string>; seen: (mid: string) => boolean; now?: number },
): Missed {
  const since = (opts.now ?? Date.now()) - RECOVER_WINDOW_MS;
  const out: Missed = { events: [], unreadable: {} };
  const fresh = msgs
    .map((m) => ({ m, at: Date.parse(m.created_time) }))
    .filter(({ m, at }) => m.from?.id && opts.allowed.has(m.from.id) && at >= since && !opts.seen(m.id))
    .sort((a, b) => a.at - b.at);
  for (const { m, at } of fresh) {
    const sender = m.from!.id!;
    const text = m.message?.trim();
    if (text && !m.is_unsupported) out.events.push({ mid: m.id, senderId: sender, timestamp: at, text, attachments: [] });
    else out.unreadable[sender] = (out.unreadable[sender] ?? 0) + 1;
  }
  return out;
}

interface Conversations {
  data?: { updated_time?: string; messages?: { data?: ConvMessage[] } }[];
}

/**
 * Revisa las conversaciones recientes y entrega lo perdido. Todo lo encontrado se
 * marca como visto (no se repite en el próximo arranque). Con una base sin
 * historial de DMs (primer arranque) solo se marca, para no reprocesar lo que ya
 * atendió otra instancia.
 */
export async function recoverMissedDms(opts: {
  allowed: Set<string>;
  onEvent: (ev: DmEvent) => void;
  onUnreadable: (sender: string, count: number) => Promise<void>;
}): Promise<{ texts: number; unreadable: number }> {
  const token = await getPageToken();
  const page = await graphGet<{ id: string }>("me", { fields: "id" }, { accessToken: token, proof: false });
  const res = await graphGet<Conversations>(
    `${page.id}/conversations`,
    { platform: "instagram", limit: "10", fields: "updated_time,messages.limit(25){id,created_time,from,message,is_unsupported}" },
    { accessToken: token, proof: false },
  );
  const msgs = (res.data ?? []).flatMap((c) => c.messages?.data ?? []);
  const bootstrap = seenCount() === 0;
  const missed = missedMessages(msgs, { allowed: opts.allowed, seen: seenBefore });
  const unreadable = Object.values(missed.unreadable).reduce((a, b) => a + b, 0);
  for (const m of msgs) if (opts.allowed.has(m.from?.id ?? "") && !seenBefore(m.id)) firstTime(m.id);
  if (bootstrap) return { texts: 0, unreadable: 0 };
  for (const ev of missed.events) opts.onEvent(ev);
  for (const [sender, n] of Object.entries(missed.unreadable)) await opts.onUnreadable(sender, n);
  return { texts: missed.events.length, unreadable };
}
