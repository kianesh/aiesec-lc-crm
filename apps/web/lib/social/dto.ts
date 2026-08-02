import type { SocialPostDto, SocialPostStatus } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { iso } from "../api/respond";

// Shared between the social list and detail routes. Lives here rather than in a
// route file because Next only allows HTTP handlers and route config to be
// exported from route.ts.

export const SOCIAL_POST_COLUMNS = {
  id: schema.socialPosts.id,
  title: schema.socialPosts.title,
  content: schema.socialPosts.content,
  platforms: schema.socialPosts.platforms,
  mediaUrls: schema.socialPosts.mediaUrls,
  status: schema.socialPosts.status,
  scheduledFor: schema.socialPosts.scheduledFor,
  createdAt: schema.socialPosts.createdAt,
  updatedAt: schema.socialPosts.updatedAt,
  externalPostIds: schema.socialPosts.externalPostIds,
  authorName: schema.users.fullName,
  authorEmail: schema.users.email
} as const;

export type SocialPostRow = {
  id: string;
  title: string | null;
  content: unknown;
  platforms: string[];
  mediaUrls: string[];
  status: SocialPostStatus;
  scheduledFor: Date | null;
  createdAt: Date;
  updatedAt: Date;
  externalPostIds: unknown;
  authorName: string | null;
  authorEmail: string | null;
};

export function toSocialPostDto(row: SocialPostRow): SocialPostDto {
  const external = (row.externalPostIds ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    title: row.title,
    caption: (row.content as { caption?: string } | null)?.caption ?? "",
    platforms: row.platforms ?? [],
    mediaUrls: row.mediaUrls ?? [],
    status: row.status,
    scheduledFor: iso(row.scheduledFor),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorName: row.authorName ?? row.authorEmail ?? null,
    externalPostIds: Object.fromEntries(
      Object.entries(external).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))
    )
  };
}
