import { updateSocialPostSchema } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { SOCIAL_POST_COLUMNS, toSocialPostDto } from "../../../../../../lib/social/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

export const GET = authed<Params>(async (_request, session, { params }) => {
  const db = getDb();
  const [row] = await db
    .select(SOCIAL_POST_COLUMNS)
    .from(schema.socialPosts)
    .leftJoin(schema.users, eq(schema.users.id, schema.socialPosts.createdBy))
    .where(and(eq(schema.socialPosts.id, params.id), eq(schema.socialPosts.lcId, session.membership.lcId)))
    .limit(1);

  if (!row) return jsonError("not_found", "That post no longer exists.");
  return jsonOk(toSocialPostDto(row));
});

export const PATCH = authed<Params>(
  async (request, session, { params }) => {
    const payload = await request.json().catch(() => null);
    if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

    const parsed = updateSocialPostSchema.safeParse(payload);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    const db = getDb();
    const lcId = session.membership.lcId;
    const scope = and(eq(schema.socialPosts.id, params.id), eq(schema.socialPosts.lcId, lcId));

    const [existing] = await db
      .select({ id: schema.socialPosts.id, status: schema.socialPosts.status, content: schema.socialPosts.content })
      .from(schema.socialPosts)
      .where(scope)
      .limit(1);
    if (!existing) return jsonError("not_found", "That post no longer exists.");

    // Editing a published post would misrepresent what actually went out on
    // Instagram, which we can't retract from here.
    if (existing.status === "published") {
      return jsonError("conflict", "This post has already been published and can't be edited.");
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.platforms !== undefined) updates.platforms = input.platforms;
    if (input.mediaUrls !== undefined) updates.mediaUrls = input.mediaUrls;
    if (input.caption !== undefined) {
      updates.content = { ...((existing.content as Record<string, unknown>) ?? {}), caption: input.caption };
    }
    if (input.scheduledFor !== undefined) {
      updates.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
      // Clearing the date sends it back to draft; setting one schedules it.
      // A previously-failed post gets another chance either way.
      updates.status = input.scheduledFor ? "scheduled" : "draft";
    }

    await db.update(schema.socialPosts).set(updates).where(scope);

    const [row] = await db
      .select(SOCIAL_POST_COLUMNS)
      .from(schema.socialPosts)
      .leftJoin(schema.users, eq(schema.users.id, schema.socialPosts.createdBy))
      .where(scope)
      .limit(1);

    if (!row) return jsonError("not_found", "That post no longer exists.");
    return jsonOk(toSocialPostDto(row));
  },
  { capability: "send_campaigns" }
);

export const DELETE = authed<Params>(
  async (_request, session, { params }) => {
    const db = getDb();
    const deleted = await db
      .delete(schema.socialPosts)
      .where(and(eq(schema.socialPosts.id, params.id), eq(schema.socialPosts.lcId, session.membership.lcId)))
      .returning({ id: schema.socialPosts.id });

    if (deleted.length === 0) return jsonError("not_found", "That post no longer exists.");
    return jsonOk({ ok: true });
  },
  { capability: "send_campaigns" }
);
