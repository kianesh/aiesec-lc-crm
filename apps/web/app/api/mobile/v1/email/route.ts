import { emailListQuerySchema, type EmailCampaignListItemDto, type EmailListResponse } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonOk, zodError } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";
import { readStats } from "../../../../../lib/email/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

export const GET = authed(async (request, session) => {
  const url = new URL(request.url);
  const parsed = emailListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodError(parsed.error);
  const { status, limit, offset } = parsed.data;

  const db = getDb();
  const lcId = session.membership.lcId;

  const filters: SQL[] = [eq(schema.emailCampaigns.lcId, lcId)];
  if (status) filters.push(eq(schema.emailCampaigns.status, status));
  const where = and(...filters);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.emailCampaigns.id,
        name: schema.emailCampaigns.name,
        subject: schema.emailCampaigns.subject,
        status: schema.emailCampaigns.status,
        sentAt: schema.emailCampaigns.sentAt,
        scheduledFor: schema.emailCampaigns.scheduledFor,
        updatedAt: schema.emailCampaigns.updatedAt,
        stats: schema.emailCampaigns.stats
      })
      .from(schema.emailCampaigns)
      .where(where)
      .orderBy(desc(schema.emailCampaigns.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.emailCampaigns).where(where)
  ]);

  const campaigns: EmailCampaignListItemDto[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    status: row.status,
    sentAt: iso(row.sentAt),
    scheduledFor: iso(row.scheduledFor),
    updatedAt: row.updatedAt.toISOString(),
    stats: readStats(row.stats)
  }));

  const body: EmailListResponse = {
    campaigns,
    total: totalRow?.value ?? 0,
    canManage: session.capabilities.has("send_campaigns")
  };

  return jsonOk(body);
});
