import { z } from "zod";

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "linkedin"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn"
};

export const SOCIAL_POST_STATUSES = ["draft", "scheduled", "published", "failed"] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export const SOCIAL_POST_STATUS_LABELS: Record<SocialPostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed"
};

/** Instagram truncates captions at 2,200 characters. */
export const INSTAGRAM_CAPTION_LIMIT = 2200;

/** The public Supabase Storage bucket the composer uploads photos to. */
export const SOCIAL_MEDIA_BUCKET = "social-media";

// ------------------------------------------------------------------ DTOs --

export type SocialPostDto = {
  id: string;
  title: string | null;
  caption: string;
  platforms: string[];
  mediaUrls: string[];
  status: SocialPostStatus;
  /** ISO 8601 */
  scheduledFor: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
  authorName: string | null;
  /** Present once published, e.g. { instagram: "178..." }. */
  externalPostIds: Record<string, string>;
};

export type SocialListResponse = {
  posts: SocialPostDto[];
  total: number;
  counts: Record<SocialPostStatus, number>;
  /** Whether this LC can actually publish to Instagram right now. */
  instagramConnected: boolean;
  canManage: boolean;
};

export type PublishPostResponse = {
  ok: boolean;
  mediaId: string | null;
};

// -------------------------------------------------------------- requests --

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const socialListQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(SOCIAL_POST_STATUSES).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type SocialListQuery = z.infer<typeof socialListQuerySchema>;

export const createSocialPostSchema = z.object({
  title: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().max(200).nullable().optional()
  ),
  caption: z.string().trim().min(1, "Add a caption").max(INSTAGRAM_CAPTION_LIMIT),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1, "Pick at least one platform"),
  /** Public HTTPS URLs — Instagram fetches these itself, so they can't be local files. */
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  /** ISO 8601. Present means "scheduled", absent means "draft". */
  scheduledFor: z.string().datetime().nullable().optional()
});

export type CreateSocialPostInput = z.input<typeof createSocialPostSchema>;

export const updateSocialPostSchema = createSocialPostSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export type UpdateSocialPostInput = z.input<typeof updateSocialPostSchema>;
