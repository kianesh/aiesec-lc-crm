"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";

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
  await db.insert(schema.messages).values({
    conversationId,
    direction: "out",
    body,
    sentAt: new Date()
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
