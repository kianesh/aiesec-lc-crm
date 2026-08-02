import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { getInstagramAuth, sendInstagramMessage } from "../connectors/instagram";
import type { getDb } from "../db";

type Db = ReturnType<typeof getDb>;

export type ReplyTarget = {
  id: string;
  channel: "email" | "instagram" | "facebook" | "whatsapp";
  participantExternalId: string | null;
};

export type ReplyResult =
  | { ok: true; messageId: string; sentAt: Date; delivered: boolean; deliveryError: string | null }
  | { ok: false; error: "no_recipient" | "send_failed" };

/**
 * Whether a reply on this conversation can actually leave the building.
 *
 * Instagram DMs go out through the Graph API. The other channels are still
 * inbound-only: a reply is recorded on the thread so the CRM history stays
 * complete, but nothing is delivered upstream yet. Surfacing that honestly
 * beats a composer that silently drops messages.
 */
export function replyCapability(channel: ReplyTarget["channel"], participantExternalId: string | null) {
  if (channel === "instagram") {
    return participantExternalId
      ? { canReply: true, reason: null }
      : { canReply: false, reason: "This Instagram thread has no reachable sender ID." };
  }
  return {
    canReply: true,
    reason: `${channel === "email" ? "Email" : channel === "facebook" ? "Facebook" : "WhatsApp"} replies are saved to the CRM timeline but not delivered yet.`
  };
}

/**
 * Deliver + persist an outbound reply. Shared by the web server action and the
 * mobile API so both surfaces behave identically.
 */
export async function deliverReply(
  db: Db,
  lcId: string,
  conversation: ReplyTarget,
  body: string
): Promise<ReplyResult> {
  let externalMessageId: string | null = null;
  let delivered = false;
  let deliveryError: string | null = null;

  if (conversation.channel === "instagram") {
    if (!conversation.participantExternalId) return { ok: false, error: "no_recipient" };
    try {
      const { token, igUserId } = await getInstagramAuth(db, lcId);
      const { messageId } = await sendInstagramMessage(token, igUserId, conversation.participantExternalId, body);
      externalMessageId = messageId || null;
      delivered = true;
    } catch {
      return { ok: false, error: "send_failed" };
    }
  } else {
    deliveryError = "channel_not_connected";
  }

  const sentAt = new Date();
  const [message] = await db
    .insert(schema.messages)
    .values({ conversationId: conversation.id, direction: "out", body, sentAt, externalMessageId })
    .returning({ id: schema.messages.id });

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: sentAt, unreadCount: 0 })
    .where(and(eq(schema.conversations.id, conversation.id), eq(schema.conversations.lcId, lcId)));

  return { ok: true, messageId: message?.id ?? "", sentAt, delivered, deliveryError };
}
