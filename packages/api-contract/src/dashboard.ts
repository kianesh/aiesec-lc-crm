import type { ConversationChannel, ConversationStatus, ContactType, FunnelStage, Programme } from "./enums";

export type StageCountDto = { stage: FunnelStage; value: number };
export type ProgrammeCountDto = { programme: Programme; value: number };

export type RecentContactDto = {
  id: string;
  fullName: string;
  type: ContactType;
  funnelStage: FunnelStage | null;
  programme: Programme | null;
  /** ISO 8601 */
  updatedAt: string;
};

export type RecentConversationDto = {
  id: string;
  name: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  /** ISO 8601 */
  lastMessageAt: string | null;
  unreadCount: number;
};

export type UpcomingPostDto = {
  id: string;
  title: string | null;
  platforms: string[];
  /** ISO 8601 */
  scheduledFor: string | null;
};

export type DashboardResponse = {
  lcId: string;
  lcName: string;
  stats: {
    contacts: number;
    unreadConversations: number;
    openConversations: number;
    scheduledPosts: number;
    sentCampaigns: number;
    draftCampaigns: number;
  };
  pipeline: StageCountDto[];
  programmes: ProgrammeCountDto[];
  recentContacts: RecentContactDto[];
  recentConversations: RecentConversationDto[];
  upcomingPosts: UpcomingPostDto[];
  expa: {
    status: "connected" | "disconnected" | "error" | null;
    /** ISO 8601 */
    lastSyncedAt: string | null;
    /** Latest snapshot's funnel, ordered; empty until a sync has run. */
    funnel: DashboardFunnelRowDto[];
    accepted: number;
    openOgx: number;
    openIgx: number;
    /** One point per stored snapshot, oldest first. */
    trend: DashboardExpaTrendPointDto[];
  };
  /** Null when Instagram isn't connected or its insights can't be read. */
  instagram: DashboardInstagramDto | null;
};

export type DashboardFunnelRowDto = {
  stage: FunnelStage;
  value: number;
  /** Share of the previous non-empty stage, or null for the first one. */
  conversionFromPrevious: number | null;
};

export type DashboardExpaTrendPointDto = {
  /** ISO 8601 */
  at: string;
  applied: number;
  approved: number;
  realized: number;
};

export type DashboardInstagramMediaDto = {
  id: string;
  caption: string | null;
  mediaType: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  /** ISO 8601 */
  timestamp: string | null;
  likeCount: number;
  commentsCount: number;
  /** Plays for video/reels; null for stills, which have no views metric. */
  views: number | null;
  reach: number | null;
};

export type DashboardInstagramDto = {
  username: string | null;
  followers: number | null;
  mediaCount: number | null;
  reach7d: number | null;
  recentMedia: DashboardInstagramMediaDto[];
};
