"use server";

import { schema } from "@aiesec/db";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import {
  getGoogleAccessToken,
  getGoogleForm,
  listGoogleFormResponses,
  parseFormId
} from "../../../lib/connectors/google";
import { importContactsFromNotion, pushContactsToNotion } from "../../../lib/connectors/notion";
import { syncInstagramConversationsToDb } from "../../../lib/connectors/instagram";
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
  redirect("/integrations/google?disconnected=google");
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
  redirect("/integrations/notion?disconnected=notion");
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
  redirect("/integrations/instagram?disconnected=instagram");
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
    const result = await syncInstagramConversationsToDb(db, activeMembership.lcId);
    // Instagram returning threads that all get skipped is indistinguishable
    // from an empty inbox unless we say so — it usually means the token is
    // missing instagram_business_manage_messages.
    outcome =
      result.synced === 0 && result.skippedNoParticipant > 0
        ? `error=${encodeURIComponent(
            `Instagram returned ${result.fetched} conversation(s) but none included participant details. Reconnect Instagram so the token includes instagram_business_manage_messages.`
          )}`
        : `synced=instagram_conversations&count=${result.synced}`;
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message : "instagram_sync_failed")}`;
  }
  redirect(`/integrations/instagram?${outcome}`);
}

// Track a Google Form (by id or URL) so its interest submissions show in the CRM.
export async function saveGoogleForm(formData: FormData) {
  const { activeMembership } = await requireManager();
  const raw = String(formData.get("formId") || "").trim();
  if (!raw) redirect("/integrations/google?error=missing_form");
  const formId = parseFormId(raw);

  const db = getDb();
  let outcome: string;
  try {
    const token = await getGoogleAccessToken(db, activeMembership.lcId);
    const form = await getGoogleForm(token, formId);
    const [row] = await db
      .select({ id: schema.integrations.id, config: schema.integrations.config })
      .from(schema.integrations)
      .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "google_drive")))
      .limit(1);
    if (!row) redirect("/integrations/google?error=not_connected");
    const config = (row.config ?? {}) as { forms?: { id: string; title: string }[] };
    const forms = (config.forms ?? []).filter((f) => f.id !== form.formId);
    forms.push({ id: form.formId, title: form.title });
    await db.update(schema.integrations).set({ config: { ...config, forms } }).where(eq(schema.integrations.id, row.id));
    outcome = "saved=form";
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message.slice(0, 60) : "form_failed")}`;
  }
  redirect(`/integrations/google?${outcome}`);
}

export async function removeGoogleForm(formId: string) {
  const { activeMembership } = await requireManager();
  const db = getDb();
  const [row] = await db
    .select({ id: schema.integrations.id, config: schema.integrations.config })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "google_drive")))
    .limit(1);
  if (row) {
    const config = (row.config ?? {}) as { forms?: { id: string; title: string }[] };
    const forms = (config.forms ?? []).filter((f) => f.id !== formId);
    await db.update(schema.integrations).set({ config: { ...config, forms } }).where(eq(schema.integrations.id, row.id));
  }
  redirect("/integrations/google?saved=form");
}

// Pull a tracked form's responses into contacts (source=import), matching name/
// email/phone answers by question wording and de-duping by email.
export async function importGoogleFormResponses(formId: string) {
  const { user, activeMembership } = await requireManager();
  const db = getDb();
  let outcome: string;
  try {
    const token = await getGoogleAccessToken(db, activeMembership.lcId);
    const form = await getGoogleForm(token, formId);
    const responses = await listGoogleFormResponses(token, form);

    const pick = (answers: Record<string, string>, kws: string[]) => {
      const hit = Object.entries(answers).find(([q]) => kws.some((k) => q.toLowerCase().includes(k)));
      return hit?.[1]?.trim() || null;
    };

    let imported = 0;
    for (const r of responses) {
      const email = pick(r.answers, ["email", "e-mail"]);
      const fullName = pick(r.answers, ["name", "full name"]) || email || "Form respondent";
      const phone = pick(r.answers, ["phone", "number", "whatsapp"]);

      const values = { fullName, email, phone, nationality: pick(r.answers, ["nationality", "country"]) };
      const existing = email
        ? await db
            .select({ id: schema.contacts.id })
            .from(schema.contacts)
            .where(and(eq(schema.contacts.lcId, activeMembership.lcId), sql`lower(${schema.contacts.email}) = lower(${email})`))
            .limit(1)
        : [];

      if (existing.length) {
        await db.update(schema.contacts).set({ ...values, updatedAt: new Date() }).where(eq(schema.contacts.id, existing[0].id));
      } else {
        const [created] = await db
          .insert(schema.contacts)
          .values({ lcId: activeMembership.lcId, type: "candidate", source: "import", ...values })
          .returning({ id: schema.contacts.id });
        await db.insert(schema.contactActivities).values({
          contactId: created.id,
          lcId: activeMembership.lcId,
          type: "created",
          metadata: { source: "google_form", formId, formTitle: form.title },
          createdBy: user.id
        });
      }
      imported++;
    }
    outcome = `synced=form_responses&count=${imported}`;
  } catch (err) {
    outcome = `error=${encodeURIComponent(err instanceof Error ? err.message.slice(0, 60) : "form_sync_failed")}`;
  }
  redirect(`/integrations/google?${outcome}`);
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
  redirect(`/integrations/notion?${outcome}`);
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
  redirect(`/integrations/notion?${outcome}`);
}
