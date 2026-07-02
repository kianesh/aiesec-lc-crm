"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getInstagramAuth, sendInstagramMessage } from "../../../lib/connectors/instagram";

export async function assignConversation(id: string, formData: FormData) {
  const { activeMembership } = await requireMembership();
  const assignedTo = formData.get("assignedTo") as string | null;

  const db = getDb();
  await db
    .update(schema.conversations)
    .set({ assignedTo: assignedTo || null })
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.lcId, activeMembership.lcId)));

  redirect(`/conversations/${id}`);
}

export async function closeConversation(id: string) {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  await db
    .update(schema.conversations)
    .set({ status: "closed" })
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.lcId, activeMembership.lcId)));

  redirect(`/conversations/${id}`);
}

export async function reopenConversation(id: string) {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  await db
    .update(schema.conversations)
    .set({ status: "open" })
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.lcId, activeMembership.lcId)));

  redirect(`/conversations/${id}`);
}

export async function sendReply(conversationId: string, formData: FormData) {
  const { activeMembership } = await requireMembership();
  const body = String(formData.get("body") || "").trim();
  if (!body) redirect(`/conversations/${conversationId}`);

  const db = getDb();
  const [conversation] = await db
    .select({
      id: schema.conversations.id,
      channel: schema.conversations.channel,
      participantExternalId: schema.conversations.participantExternalId
    })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.lcId, activeMembership.lcId)))
    .limit(1);
  if (!conversation) redirect("/conversations");

  // Deliver through the real channel. Instagram DMs go via the Graph API;
  // other channels are recorded locally until their sender is wired up.
  let externalMessageId: string | null = null;
  if (conversation.channel === "instagram") {
    if (!conversation.participantExternalId) {
      redirect(`/conversations/${conversationId}?error=no_recipient`);
    }
    try {
      const { token, igUserId } = await getInstagramAuth(db, activeMembership.lcId);
      const { messageId } = await sendInstagramMessage(
        token,
        igUserId,
        conversation.participantExternalId!,
        body
      );
      externalMessageId = messageId || null;
    } catch {
      redirect(`/conversations/${conversationId}?error=send_failed`);
    }
  }

  await db.insert(schema.messages).values({
    conversationId,
    direction: "out",
    body,
    sentAt: new Date(),
    externalMessageId
  });

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: new Date(), unreadCount: 0 })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.lcId, activeMembership.lcId)));

  redirect(`/conversations/${conversationId}`);
}

export async function linkContact(conversationId: string, formData: FormData) {
  const { activeMembership } = await requireMembership();
  const contactId = formData.get("contactId") as string | null;

  const db = getDb();
  await db
    .update(schema.conversations)
    .set({ contactId: contactId || null })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.lcId, activeMembership.lcId)));

  redirect(`/conversations/${conversationId}`);
}
