"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { syncInstagramConversationsToDb } from "../../../lib/connectors/instagram";
import { deliverReply } from "../../../lib/conversations/send";

// Pull all Instagram DMs into the inbox on demand (the webhook keeps it live
// once connected + published; this is the manual "catch up" button).
export async function syncInstagramInbox() {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  let outcome: string;
  try {
    const synced = await syncInstagramConversationsToDb(db, activeMembership.lcId);
    outcome = `synced=${synced}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sync_failed";
    outcome = `error=${encodeURIComponent(/not connected|reconnect/i.test(msg) ? "instagram_not_connected" : "sync_failed")}`;
  }
  redirect(`/conversations?${outcome}`);
}

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

  // Delivery + persistence live in lib/conversations/send so the mobile API
  // (/api/mobile/v1/conversations/[id]/messages) behaves identically.
  const result = await deliverReply(db, activeMembership.lcId, conversation, body);
  if (!result.ok) redirect(`/conversations/${conversationId}?error=${result.error}`);

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
