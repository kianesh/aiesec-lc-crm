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
  };
};
