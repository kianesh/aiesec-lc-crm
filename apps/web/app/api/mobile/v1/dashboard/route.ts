import type { DashboardResponse, FunnelStage, Programme } from "@aiesec/api-contract";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonOk } from "../../../../../lib/api/respond";
import { getDashboardData } from "../../../../../lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

// Reuses the exact aggregation the web dashboard renders from, so the two
// surfaces can never disagree about the numbers.
export const GET = authed(
  async (_request, session) => {
    const data = await getDashboardData(session.membership.lcId);

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
        lastSyncedAt: iso(data.expaLastSyncedAt)
      }
    };

    return jsonOk(body);
  },
  { capability: "view_analytics" }
);
