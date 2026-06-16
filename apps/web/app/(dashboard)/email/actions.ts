"use server";

import { schema } from "@aiesec/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";

const campaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  fromName: z.string().min(1).default("AIESEC"),
  fromEmail: z.string().email(),
  bodyHtml: z.string().default(""),
  audienceSegmentId: z.string().uuid().optional().or(z.literal("")),
  scheduledFor: z.string().optional()
});

export async function createCampaign(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/email?error=not_allowed");

  const input = campaignSchema.parse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    fromName: formData.get("fromName") || "AIESEC",
    fromEmail: formData.get("fromEmail"),
    bodyHtml: formData.get("bodyHtml") || "",
    audienceSegmentId: formData.get("audienceSegmentId") || undefined,
    scheduledFor: formData.get("scheduledFor") || undefined
  });

  const db = getDb();
  const [campaign] = await db
    .insert(schema.emailCampaigns)
    .values({
      lcId: activeMembership.lcId,
      name: input.name,
      subject: input.subject,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      bodyHtml: input.bodyHtml,
      audienceSegmentId: input.audienceSegmentId || null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      status: "draft",
      createdBy: user.id
    })
    .returning({ id: schema.emailCampaigns.id });

  redirect(`/email/${campaign.id}`);
}

export async function updateCampaign(id: string, formData: FormData) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect(`/email/${id}?error=not_allowed`);

  const input = campaignSchema.parse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    fromName: formData.get("fromName") || "AIESEC",
    fromEmail: formData.get("fromEmail"),
    bodyHtml: formData.get("bodyHtml") || "",
    audienceSegmentId: formData.get("audienceSegmentId") || undefined,
    scheduledFor: formData.get("scheduledFor") || undefined
  });

  const db = getDb();
  await db
    .update(schema.emailCampaigns)
    .set({
      name: input.name,
      subject: input.subject,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      bodyHtml: input.bodyHtml,
      audienceSegmentId: input.audienceSegmentId || null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      updatedAt: new Date()
    })
    .where(and(eq(schema.emailCampaigns.id, id), eq(schema.emailCampaigns.lcId, activeMembership.lcId)));

  redirect(`/email/${id}?updated=true`);
}

export async function deleteCampaign(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/email?error=not_allowed");

  const db = getDb();
  await db
    .delete(schema.emailCampaigns)
    .where(
      and(
        eq(schema.emailCampaigns.id, id),
        eq(schema.emailCampaigns.lcId, activeMembership.lcId),
        eq(schema.emailCampaigns.status, "draft")
      )
    );

  redirect("/email");
}

export async function sendCampaign(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect(`/email/${id}?error=not_allowed`);

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.emailCampaigns)
    .where(and(eq(schema.emailCampaigns.id, id), eq(schema.emailCampaigns.lcId, activeMembership.lcId)))
    .limit(1);

  if (!campaign || campaign.status !== "draft") redirect(`/email/${id}?error=not_sendable`);

  // Build recipient list
  let contacts: { id: string; email: string; fullName: string }[] = [];
  if (campaign.audienceSegmentId) {
    const [list] = await db
      .select()
      .from(schema.smartLists)
      .where(eq(schema.smartLists.id, campaign.audienceSegmentId))
      .limit(1);

    if (list) {
      const f = list.filters as Record<string, string[]>;
      let query = db
        .select({ id: schema.contacts.id, email: schema.contacts.email, fullName: schema.contacts.fullName })
        .from(schema.contacts)
        .where(and(eq(schema.contacts.lcId, activeMembership.lcId), isNotNull(schema.contacts.email)));

      contacts = (await query).filter((c): c is { id: string; email: string; fullName: string } => {
        if (!c.email) return false;
        if (f.type?.length && !f.type.includes((c as unknown as { type: string }).type)) return false;
        return true;
      });
    }
  } else {
    const rows = await db
      .select({ id: schema.contacts.id, email: schema.contacts.email, fullName: schema.contacts.fullName })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.lcId, activeMembership.lcId), isNotNull(schema.contacts.email)));
    contacts = rows.filter((c): c is { id: string; email: string; fullName: string } => Boolean(c.email));
  }

  if (contacts.length === 0) redirect(`/email/${id}?error=no_recipients`);

  await db
    .update(schema.emailCampaigns)
    .set({ status: "sending" })
    .where(eq(schema.emailCampaigns.id, id));

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0;

    for (const contact of contacts) {
      const { data } = await resend.emails.send({
        from: `${campaign.fromName} <${campaign.fromEmail}>`,
        to: [contact.email],
        subject: campaign.subject,
        html: campaign.bodyHtml
      });

      await db.insert(schema.emailCampaignRecipients).values({
        campaignId: id,
        contactId: contact.id,
        email: contact.email,
        status: "sent",
        resendMessageId: data?.id ?? null,
        sentAt: new Date()
      });
      sent++;
    }

    await db
      .update(schema.emailCampaigns)
      .set({ status: "sent", sentAt: new Date(), stats: { sent }, updatedAt: new Date() })
      .where(eq(schema.emailCampaigns.id, id));

    redirect(`/email/${id}?sent=true`);
  } catch {
    await db
      .update(schema.emailCampaigns)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.emailCampaigns.id, id));
    redirect(`/email/${id}?error=send_failed`);
  }
}

export async function duplicateCampaign(id: string) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/email?error=not_allowed");

  const db = getDb();
  const [original] = await db
    .select()
    .from(schema.emailCampaigns)
    .where(and(eq(schema.emailCampaigns.id, id), eq(schema.emailCampaigns.lcId, activeMembership.lcId)))
    .limit(1);

  if (!original) redirect("/email");

  const [copy] = await db
    .insert(schema.emailCampaigns)
    .values({
      lcId: activeMembership.lcId,
      name: `${original.name} (copy)`,
      subject: original.subject,
      fromName: original.fromName,
      fromEmail: original.fromEmail,
      bodyHtml: original.bodyHtml,
      audienceSegmentId: original.audienceSegmentId,
      status: "draft",
      createdBy: user.id
    })
    .returning({ id: schema.emailCampaigns.id });

  redirect(`/email/${copy.id}`);
}
