"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { sendCampaignNow, sendCampaignTest } from "../../../lib/email/campaigns";

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

  // Audience resolution and delivery live in lib/email/campaigns so the mobile
  // endpoint sends to exactly the same list. sendCampaignNow never throws, so
  // the redirects below stay outside any try/catch.
  const result = await sendCampaignNow(getDb(), activeMembership.lcId, id);
  if (!result.ok) redirect(`/email/${id}?error=${result.error}`);
  redirect(`/email/${id}?sent=true`);
}

export async function sendTestEmail(id: string) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect(`/email/${id}?error=not_allowed`);
  if (!user.email) redirect(`/email/${id}?error=no_test_recipient`);

  const result = await sendCampaignTest(getDb(), activeMembership.lcId, id, user.email);
  if (!result.ok) redirect(result.error === "not_found" ? "/email" : `/email/${id}?error=${result.error}`);
  redirect(`/email/${id}?tested=${encodeURIComponent(user.email)}`);
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
