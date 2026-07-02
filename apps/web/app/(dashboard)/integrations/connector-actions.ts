"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getGoogleAccessToken, listGoogleContacts } from "../../../lib/connectors/google";
import { importContactsFromNotion, pushContactsToNotion } from "../../../lib/connectors/notion";
import { getInstagramAuth, listInstagramConversations } from "../../../lib/connectors/instagram";
import { deleteIntegration } from "../../../lib/connectors/store";

async function requireManager() {
  const ctx = await requireMembership();
  if (ctx.activeMembership.role === "member") redirect("/integrations?error=not_allowed");
  return ctx;
}

export async function disconnectGoogle() {
  const { user, activeMembership } = await requireManager();
  const db = getDb();
  await deleteIntegration(db, activeMembership.lcId, "google_drive");
  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.google.disconnected",
    entityType: "integration",
    metadata: { provider: "google_drive" }
  });
  redirect("/integrations?disconnected=google");
}

export async function disconnectNotion() {
  const { user, activeMembership } = await requireManager();
  const db = getDb();
  await deleteIntegration(db, activeMembership.lcId, "notion");
  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.notion.disconnected",
    entityType: "integration",
    metadata: { provider: "notion" }
  });
  redirect("/integrations?disconnected=notion");
}

// Pull Google Contacts into the CRM, upserting by email.
export async function importGoogleContacts() {
  const { activeMembership } = await requireManager();
  const db = getDb();
  let outcome: string;
  try {
    const token = await getGoogleAccessToken(db, activeMembership.lcId);
    const people = await listGoogleContacts(token);
    let imported = 0;
    for (const person of people) {
      if (person.email) {
        const [existing] = await db
          .select({ id: schema.contacts.id })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.lcId, activeMembership.lcId), eq(schema.contacts.email, person.email)))
          .limit(1);
        if (existing) {
          await db
            .update(schema.contacts)
            .set({ fullName: person.fullName, phone: person.phone, updatedAt: new Date() })
            .where(eq(schema.contacts.id, existing.id));
          imported++;
          continue;
        }
      }
      await db.insert(schema.contacts).values({
        lcId: activeMembership.lcId,
        fullName: person.fullName,
        email: person.email,
        phone: person.phone,
        source: "google_drive"
      });
      imported++;
    }
    outcome = `synced=google_contacts&count=${imported}`;
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message : "google_sync_failed")}`;
  }
  redirect(`/integrations?${outcome}`);
}

export async function disconnectInstagram() {
  const { user, activeMembership } = await requireManager();
  const db = getDb();
  await deleteIntegration(db, activeMembership.lcId, "meta");
  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "integration.instagram.disconnected",
    entityType: "integration",
    metadata: { provider: "meta", platform: "instagram" }
  });
  redirect("/integrations?disconnected=instagram");
}

// Backfill Instagram DM threads (and recent messages) into the inbox. The
// webhook handles new messages live; this catches threads that predate the
// connection or were missed. Conversations are keyed by the lead's IG id so
// webhook + sync converge on the same row.
export async function syncInstagramConversations() {
  const { activeMembership } = await requireManager();
  const db = getDb();
  let outcome: string;
  try {
    const { token, igUserId } = await getInstagramAuth(db, activeMembership.lcId);
    const threads = await listInstagramConversations(token, igUserId);
    let synced = 0;

    for (const thread of threads) {
      const threadId = thread.participantId;
      if (!threadId) continue;

      const sorted = [...thread.messages].sort(
        (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
      );
      const lastAt = sorted.length ? new Date(sorted[sorted.length - 1].createdTime) : new Date();

      let [conversation] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.lcId, activeMembership.lcId),
            eq(schema.conversations.externalThreadId, threadId)
          )
        )
        .limit(1);

      if (!conversation) {
        [conversation] = await db
          .insert(schema.conversations)
          .values({
            lcId: activeMembership.lcId,
            channel: "instagram",
            status: "open",
            externalThreadId: threadId,
            participantExternalId: threadId,
            participantName: thread.participantUsername,
            lastMessageAt: lastAt
          })
          .returning({ id: schema.conversations.id });
      } else {
        await db
          .update(schema.conversations)
          .set({ participantName: thread.participantUsername, lastMessageAt: lastAt })
          .where(eq(schema.conversations.id, conversation.id));
      }

      for (const m of sorted) {
        const [existing] = await db
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(eq(schema.messages.externalMessageId, m.id))
          .limit(1);
        if (existing) continue;
        await db.insert(schema.messages).values({
          conversationId: conversation.id,
          direction: m.from === igUserId ? "out" : "in",
          body: m.text,
          sentAt: new Date(m.createdTime),
          externalMessageId: m.id
        });
      }
      synced++;
    }
    outcome = `synced=instagram_conversations&count=${synced}`;
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message : "instagram_sync_failed")}`;
  }
  redirect(`/integrations?${outcome}`);
}

export async function pushToNotion() {
  const { activeMembership } = await requireManager();
  const db = getDb();
  let outcome: string;
  try {
    const { pushed } = await pushContactsToNotion(db, activeMembership.lcId);
    outcome = `synced=notion_push&count=${pushed}`;
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message : "notion_push_failed")}`;
  }
  redirect(`/integrations?${outcome}`);
}

export async function pullFromNotion() {
  const { activeMembership } = await requireManager();
  const db = getDb();
  let outcome: string;
  try {
    const { imported } = await importContactsFromNotion(db, activeMembership.lcId);
    outcome = `synced=notion_pull&count=${imported}`;
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message : "notion_pull_failed")}`;
  }
  redirect(`/integrations?${outcome}`);
}
