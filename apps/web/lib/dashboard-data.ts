import { schema } from "@aiesec/db";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./db";

export type StageCount = { stage: string; value: number };
export type ProgrammeCount = { programme: string; value: number };

export type RecentContact = {
  id: string;
  fullName: string;
  type: string;
  funnelStage: string | null;
  programme: string | null;
  updatedAt: Date;
};

export type RecentConversation = {
  id: string;
  name: string;
  channel: string;
  status: string;
  lastMessageAt: Date | null;
  unreadCount: number;
};

export type UpcomingPost = {
  id: string;
  title: string | null;
  platforms: string[];
  scheduledFor: Date | null;
};

export type DashboardData = {
  contacts: number;
  unreadConversations: number;
  openConversations: number;
  scheduledPosts: number;
  sentCampaigns: number;
  draftCampaigns: number;
  pipeline: StageCount[];
  programmes: ProgrammeCount[];
  recentContacts: RecentContact[];
  recentConversations: RecentConversation[];
  upcomingPosts: UpcomingPost[];
  expaStatus: "connected" | "disconnected" | "error" | null;
  expaLastSyncedAt: Date | null;
  expaSnapshot: { periodStart: Date; periodEnd: Date; summary: Record<string, unknown> } | null;
};

const STAGE_ORDER = ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"];

export async function getDashboardData(lcId: string): Promise<DashboardData> {
  const db = getDb();
  const now = new Date();

  const [
    [contacts],
    [scheduledPosts],
    [sentCampaigns],
    [draftCampaigns],
    [unread],
    [openConvos],
    pipelineRows,
    programmeRows,
    recentContacts,
    recentConversations,
    upcomingPosts,
    [expa],
    [snapshot]
  ] = await Promise.all([
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
      .select({ value: count() })
      .from(schema.emailCampaigns)
      .where(and(eq(schema.emailCampaigns.lcId, lcId), eq(schema.emailCampaigns.status, "draft"))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.conversations.unreadCount}), 0)::int` })
      .from(schema.conversations)
      .where(eq(schema.conversations.lcId, lcId)),
    db
      .select({ value: count() })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.lcId, lcId), eq(schema.conversations.status, "open"))),
    db
      .select({ stage: schema.contacts.funnelStage, value: count() })
      .from(schema.contacts)
      .where(eq(schema.contacts.lcId, lcId))
      .groupBy(schema.contacts.funnelStage),
    db
      .select({ programme: schema.contacts.programme, value: count() })
      .from(schema.contacts)
      .where(eq(schema.contacts.lcId, lcId))
      .groupBy(schema.contacts.programme),
    db
      .select({
        id: schema.contacts.id,
        fullName: schema.contacts.fullName,
        type: schema.contacts.type,
        funnelStage: schema.contacts.funnelStage,
        programme: schema.contacts.programme,
        updatedAt: schema.contacts.updatedAt
      })
      .from(schema.contacts)
      .where(eq(schema.contacts.lcId, lcId))
      .orderBy(desc(schema.contacts.updatedAt))
      .limit(6),
    db
      .select({
        id: schema.conversations.id,
        participantName: schema.conversations.participantName,
        contactFullName: schema.contacts.fullName,
        channel: schema.conversations.channel,
        status: schema.conversations.status,
        lastMessageAt: schema.conversations.lastMessageAt,
        unreadCount: schema.conversations.unreadCount
      })
      .from(schema.conversations)
      .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
      .where(eq(schema.conversations.lcId, lcId))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(6),
    db
      .select({
        id: schema.socialPosts.id,
        title: schema.socialPosts.title,
        platforms: schema.socialPosts.platforms,
        scheduledFor: schema.socialPosts.scheduledFor
      })
      .from(schema.socialPosts)
      .where(and(eq(schema.socialPosts.lcId, lcId), gte(schema.socialPosts.scheduledFor, now)))
      .orderBy(schema.socialPosts.scheduledFor)
      .limit(5),
    db
      .select({ status: schema.integrations.status, lastSyncedAt: schema.integrations.lastSyncedAt })
      .from(schema.integrations)
      .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, "expa")))
      .limit(1),
    db
      .select({
        periodStart: schema.expaAnalyticsSnapshots.periodStart,
        periodEnd: schema.expaAnalyticsSnapshots.periodEnd,
        summary: schema.expaAnalyticsSnapshots.summary
      })
      .from(schema.expaAnalyticsSnapshots)
      .where(eq(schema.expaAnalyticsSnapshots.lcId, lcId))
      .orderBy(desc(schema.expaAnalyticsSnapshots.periodEnd))
      .limit(1)
  ]);

  const stageMap = new Map(pipelineRows.map((r) => [r.stage ?? "unstaged", r.value]));
  const pipeline: StageCount[] = STAGE_ORDER.map((stage) => ({ stage, value: stageMap.get(stage) ?? 0 }));

  return {
    contacts: contacts?.value ?? 0,
    unreadConversations: unread?.value ?? 0,
    openConversations: openConvos?.value ?? 0,
    scheduledPosts: scheduledPosts?.value ?? 0,
    sentCampaigns: sentCampaigns?.value ?? 0,
    draftCampaigns: draftCampaigns?.value ?? 0,
    pipeline,
    programmes: programmeRows.map((r) => ({ programme: r.programme ?? "other", value: r.value })),
    recentContacts,
    recentConversations: recentConversations.map((c) => ({
      id: c.id,
      name: c.participantName ?? c.contactFullName ?? "Unknown",
      channel: c.channel,
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount
    })),
    upcomingPosts,
    expaStatus: expa?.status ?? null,
    expaLastSyncedAt: expa?.lastSyncedAt ?? null,
    expaSnapshot: snapshot
      ? { periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, summary: snapshot.summary as Record<string, unknown> }
      : null
  };
}
