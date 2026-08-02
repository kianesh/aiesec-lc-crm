import {
  createSocialPostSchema,
  socialListQuerySchema,
  type SocialListResponse,
  type SocialPostStatus
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";
import { SOCIAL_POST_COLUMNS, toSocialPostDto } from "../../../../../lib/social/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

export const GET = authed(async (request, session) => {
  const url = new URL(request.url);
  const parsed = socialListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodError(parsed.error);
  const { status, limit, offset } = parsed.data;

  const db = getDb();
  const lcId = session.membership.lcId;

  const filters: SQL[] = [eq(schema.socialPosts.lcId, lcId)];
  if (status) filters.push(eq(schema.socialPosts.status, status));
  const where = and(...filters);

  const [rows, [totalRow], statusRows, [instagram]] = await Promise.all([
    db
      .select(SOCIAL_POST_COLUMNS)
      .from(schema.socialPosts)
      .leftJoin(schema.users, eq(schema.users.id, schema.socialPosts.createdBy))
      .where(where)
      // Soonest-scheduled first would bury drafts; most-recently-touched is
      // what a queue screen actually wants.
      .orderBy(desc(schema.socialPosts.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.socialPosts).where(where),
    db
      .select({ status: schema.socialPosts.status, value: count() })
      .from(schema.socialPosts)
      .where(eq(schema.socialPosts.lcId, lcId))
      .groupBy(schema.socialPosts.status),
    db
      .select({ status: schema.integrations.status })
      .from(schema.integrations)
      .where(and(eq(schema.integrations.lcId, lcId), eq(schema.integrations.provider, "meta")))
      .limit(1)
  ]);

  const counts = { draft: 0, scheduled: 0, published: 0, failed: 0 } as Record<SocialPostStatus, number>;
  for (const row of statusRows) counts[row.status] = row.value;

  const body: SocialListResponse = {
    posts: rows.map(toSocialPostDto),
    total: totalRow?.value ?? 0,
    counts,
    instagramConnected: instagram?.status === "connected",
    canManage: session.capabilities.has("send_campaigns")
  };

  return jsonOk(body);
});

export const POST = authed(
  async (request, session) => {
    const payload = await request.json().catch(() => null);
    if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

    const parsed = createSocialPostSchema.safeParse(payload);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    const db = getDb();
    const [created] = await db
      .insert(schema.socialPosts)
      .values({
        lcId: session.membership.lcId,
        title: input.title ?? null,
        platforms: input.platforms,
        content: { caption: input.caption },
        mediaUrls: input.mediaUrls ?? [],
        // A date means scheduled; no date means it's still a draft.
        status: input.scheduledFor ? "scheduled" : "draft",
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        createdBy: session.userId
      })
      .returning({ id: schema.socialPosts.id });

    if (!created) return jsonError("server_error", "Could not create the post.");

    const [row] = await db
      .select(SOCIAL_POST_COLUMNS)
      .from(schema.socialPosts)
      .leftJoin(schema.users, eq(schema.users.id, schema.socialPosts.createdBy))
      .where(eq(schema.socialPosts.id, created.id))
      .limit(1);

    if (!row) return jsonError("server_error", "Could not create the post.");
    return jsonOk(toSocialPostDto(row), { status: 201 });
  },
  { capability: "send_campaigns" }
);
