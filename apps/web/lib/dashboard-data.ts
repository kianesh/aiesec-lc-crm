import { schema } from "@aiesec/db";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./db";

export type DashboardData = {
  contacts: number;
  unreadConversations: number;
  scheduledPosts: number;
  sentCampaigns: number;
  expaStatus: "connected" | "disconnected" | "error" | null;
  expaLastSyncedAt: Date | null;
};

export async function getDashboardData(lcId: string): Promise<DashboardData> {
  const db = getDb();
  const now = new Date();

  const [[contacts], [scheduledPosts], [sentCampaigns], [unread], [expa]] = await Promise.all([
    db.select({ value: count() }).from(schema.contacts).where(eq(schema.contacts.lcId, lcId)),
    db
      .select({ value: count() })
      .from(schema.socialPosts)
      .where(and(eq(schema.socialPosts.lcId, lcId), eq(schema.socialPosts.status, "scheduled"), gte(schema.socialPosts.scheduledFor, now))),
    db
      .select({ value: count() })
      .from(schema.emailCampaigns)
      .where(and(eq(schema.emailCampaigns.lcId, lcId), sql`${schema.emailCampaigns.sentAt} is not null`)),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.conversations.unreadCount}), 0)::int` })
      .from(schema.conversations)
      .where(eq(schema.conversations.lcId, lcId)),
    db
      .select({
        status: schema.integrations.status,
        lastSyncedAt: schema.integrations.lastSyncedAt
      })
      .from(schema.integrations)
      .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, "expa")))
      .limit(1)
  ]);

  return {
    contacts: contacts?.value ?? 0,
    unreadConversations: unread?.value ?? 0,
    scheduledPosts: scheduledPosts?.value ?? 0,
    sentCampaigns: sentCampaigns?.value ?? 0,
    expaStatus: expa?.status ?? null,
    expaLastSyncedAt: expa?.lastSyncedAt ?? null
  };
}
