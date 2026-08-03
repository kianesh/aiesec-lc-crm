import type {
  DashboardFunnelRowDto,
  DashboardInstagramDto,
  DashboardResponse,
  FunnelStage,
  Programme
} from "@aiesec/api-contract";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonOk } from "../../../../../lib/api/respond";
import { getInstagramAuth, getInstagramInsights } from "../../../../../lib/connectors/instagram";
import { readIntegration } from "../../../../../lib/connectors/store";
import { getDashboardData } from "../../../../../lib/dashboard-data";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

const STAGE_ORDER: FunnelStage[] = [
  "sign_up",
  "applied",
  "matched",
  "approved",
  "realized",
  "finished",
  "completed"
];

function opportunities(summary: Record<string, unknown> | null) {
  return (summary?.opportunities ?? {}) as { openOgx?: number; openIgx?: number };
}

/**
 * Latest snapshot's funnel with conversion between stages.
 *
 * Mirrors the web widget: a leading empty stage is dropped because EXPA leaves
 * sign_up at 0 for most committees, while an interior zero is kept — a
 * mid-funnel drop to nothing is the thing an LC most needs to see.
 */
function funnelRows(summary: Record<string, unknown> | null): DashboardFunnelRowDto[] {
  if (!summary) return [];
  const funnel = (summary.funnel ?? {}) as Record<string, number>;
  let previous: number | null = null;
  const rows: DashboardFunnelRowDto[] = [];
  for (const stage of STAGE_ORDER) {
    const value = Number(funnel[stage] ?? 0);
    rows.push({
      stage,
      value,
      conversionFromPrevious: previous !== null && previous > 0 ? value / previous : null
    });
    if (value > 0 || previous !== null) previous = value;
  }
  while (rows.length > 0 && rows[0]!.value === 0) rows.shift();
  return rows;
}

// Reuses the exact aggregation the web dashboard renders from, so the two
// surfaces can never disagree about the numbers.
export const GET = authed(
  async (_request, session) => {
    const data = await getDashboardData(session.membership.lcId);

    // Instagram is a third-party round trip, so it must never be able to fail
    // the whole dashboard — every step degrades to null.
    let instagram: DashboardInstagramDto | null = null;
    try {
      const db = getDb();
      const connected = await readIntegration(db, session.membership.lcId, "meta");
      if (connected) {
        const { token, igUserId } = await getInstagramAuth(db, session.membership.lcId);
        const insights = await getInstagramInsights(token, igUserId);
        instagram = {
          username: insights.username,
          followers: insights.followers,
          mediaCount: insights.mediaCount,
          reach7d: insights.reach7d,
          recentMedia: insights.recentMedia.slice(0, 6).map((media) => ({
            id: media.id,
            caption: media.caption,
            mediaType: media.mediaType,
            permalink: media.permalink,
            thumbnailUrl: media.thumbnailUrl,
            timestamp: media.timestamp,
            likeCount: media.likeCount,
            commentsCount: media.commentsCount,
            views: media.insights?.views ?? null,
            reach: media.insights?.reach ?? null
          }))
        };
      }
    } catch {
      instagram = null;
    }

    const body: DashboardResponse = {
      lcId: session.membership.lcId,
      lcName: session.membership.lcName,
      stats: {
        contacts: data.contacts,
        unreadConversations: data.unreadConversations,
        openConversations: data.openConversations,
        scheduledPosts: data.scheduledPosts,
        sentCampaigns: data.sentCampaigns,
        draftCampaigns: data.draftCampaigns
      },
      pipeline: data.pipeline.map((row) => ({ stage: row.stage as FunnelStage, value: row.value })),
      programmes: data.programmes.map((row) => ({ programme: row.programme as Programme, value: row.value })),
      recentContacts: data.recentContacts.map((contact) => ({
        id: contact.id,
        fullName: contact.fullName,
        type: contact.type as DashboardResponse["recentContacts"][number]["type"],
        funnelStage: (contact.funnelStage as FunnelStage | null) ?? null,
        programme: (contact.programme as Programme | null) ?? null,
        updatedAt: contact.updatedAt.toISOString()
      })),
      recentConversations: data.recentConversations.map((conversation) => ({
        id: conversation.id,
        name: conversation.name,
        channel: conversation.channel as DashboardResponse["recentConversations"][number]["channel"],
        status: conversation.status as DashboardResponse["recentConversations"][number]["status"],
        lastMessageAt: iso(conversation.lastMessageAt),
        unreadCount: conversation.unreadCount
      })),
      upcomingPosts: data.upcomingPosts.map((post) => ({
        id: post.id,
        title: post.title,
        platforms: post.platforms,
        scheduledFor: iso(post.scheduledFor)
      })),
      expa: {
        status: data.expaStatus,
        lastSyncedAt: iso(data.expaLastSyncedAt),
        funnel: funnelRows(data.expaSnapshot?.summary ?? null),
        accepted: Number((data.expaSnapshot?.summary as { accepted?: number } | null)?.accepted ?? 0),
        openOgx: Number(opportunities(data.expaSnapshot?.summary ?? null).openOgx ?? 0),
        openIgx: Number(opportunities(data.expaSnapshot?.summary ?? null).openIgx ?? 0),
        trend: data.expaTrend
      },
      instagram
    };

    return jsonOk(body);
  },
  { capability: "view_analytics" }
);
