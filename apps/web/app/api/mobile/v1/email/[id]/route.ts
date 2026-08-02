import type { EmailCampaignDetailDto, EmailCampaignStatsDto } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq, sql } from "drizzle-orm";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, iso, jsonError, jsonOk } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { htmlToPreview, readStats, resolveRecipients } from "../../../../../../lib/email/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

export const GET = authed<Params>(async (_request, session, { params }) => {
  const db = getDb();
  const lcId = session.membership.lcId;

  const [campaign] = await db
    .select()
    .from(schema.emailCampaigns)
    .where(and(eq(schema.emailCampaigns.id, params.id), eq(schema.emailCampaigns.lcId, lcId)))
    .limit(1);

  if (!campaign) return jsonError("not_found", "That campaign no longer exists.");

  const [audience, [audienceList], recipientRows] = await Promise.all([
    // What it *would* send to now — the stored stats only describe past sends.
    resolveRecipients(db, lcId, campaign),
    campaign.audienceSegmentId
      ? db
          .select({ name: schema.smartLists.name })
          .from(schema.smartLists)
          .where(eq(schema.smartLists.id, campaign.audienceSegmentId))
          .limit(1)
      : Promise.resolve([undefined]),
    db
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) filter (where status in ('sent','delivered','opened','clicked'))::int`,
        delivered: sql<number>`count(*) filter (where status in ('delivered','opened','clicked'))::int`,
        opened: sql<number>`count(*) filter (where ${schema.emailCampaignRecipients.openedAt} is not null)::int`,
        clicked: sql<number>`count(*) filter (where status = 'clicked')::int`,
        bounced: sql<number>`count(*) filter (where ${schema.emailCampaignRecipients.bouncedAt} is not null)::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`
      })
      .from(schema.emailCampaignRecipients)
      .where(eq(schema.emailCampaignRecipients.campaignId, campaign.id))
  ]);

  const counts = recipientRows[0];
  const detailedStats: EmailCampaignStatsDto = {
    recipients: counts?.total ?? 0,
    sent: counts?.sent ?? 0,
    delivered: counts?.delivered ?? 0,
    opened: counts?.opened ?? 0,
    clicked: counts?.clicked ?? 0,
    bounced: counts?.bounced ?? 0,
    failed: counts?.failed ?? 0
  };

  const canSendCapability = session.capabilities.has("send_campaigns");
  const isDraft = campaign.status === "draft";
  const sendBlockedReason = !canSendCapability
    ? "Your role can't send campaigns in this LC."
    : !isDraft
      ? `This campaign is ${campaign.status}. Only drafts can be sent.`
      : audience.length === 0
        ? "No contacts match this campaign's audience."
        : null;

  const body: EmailCampaignDetailDto = {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    status: campaign.status,
    sentAt: iso(campaign.sentAt),
    scheduledFor: iso(campaign.scheduledFor),
    updatedAt: campaign.updatedAt.toISOString(),
    stats: readStats(campaign.stats),
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
    bodyHtml: campaign.bodyHtml,
    bodyPreview: htmlToPreview(campaign.bodyHtml),
    audienceName: audienceList?.name ?? null,
    audienceSize: audience.length,
    detailedStats,
    canSend: sendBlockedReason === null,
    sendBlockedReason
  };

  return jsonOk(body);
});
