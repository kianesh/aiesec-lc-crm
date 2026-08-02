import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { getInstagramAuth, publishInstagramImage } from "../connectors/instagram";
import type { getDb } from "../db";

type Db = ReturnType<typeof getDb>;

export type PublishError = "not_connected" | "no_image" | "publish_failed" | "not_found" | "already_published";

export type PublishResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: PublishError; message: string };

const MESSAGES: Record<PublishError, string> = {
  not_connected: "Instagram isn't connected. Reconnect it from Integrations on the web app.",
  no_image: "Instagram posts need an image. Add one before publishing.",
  publish_failed: "Instagram rejected the post. Check the image URL and caption, then try again.",
  not_found: "That post no longer exists.",
  already_published: "That post has already been published."
};

function fail(error: PublishError): PublishResult {
  return { ok: false, error, message: MESSAGES[error] };
}

/**
 * Publish an image to the LC's connected Instagram account.
 *
 * Instagram's Graph API publishes from a URL it fetches itself, so `imageUrl`
 * must be publicly reachable over HTTPS — that's why uploads land in the public
 * `social-media` Storage bucket rather than being POSTed as bytes.
 */
export async function publishImageToInstagram(
  db: Db,
  lcId: string,
  imageUrl: string,
  caption?: string
): Promise<PublishResult> {
  if (!/^https:\/\/.+/i.test(imageUrl)) return fail("no_image");

  try {
    const { token, igUserId } = await getInstagramAuth(db, lcId);
    const { mediaId } = await publishInstagramImage(token, igUserId, imageUrl, caption || undefined);
    return { ok: true, mediaId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return fail(/not connected|reconnect/i.test(message) ? "not_connected" : "publish_failed");
  }
}

/**
 * Publish a stored `social_posts` row and record the outcome on it.
 *
 * A failure flips the row to `failed` rather than leaving it `scheduled`, so
 * the queue shows what actually happened instead of silently retrying forever.
 */
export async function publishStoredPost(db: Db, lcId: string, postId: string): Promise<PublishResult> {
  const [post] = await db
    .select({
      id: schema.socialPosts.id,
      status: schema.socialPosts.status,
      content: schema.socialPosts.content,
      mediaUrls: schema.socialPosts.mediaUrls,
      externalPostIds: schema.socialPosts.externalPostIds
    })
    .from(schema.socialPosts)
    .where(and(eq(schema.socialPosts.id, postId), eq(schema.socialPosts.lcId, lcId)))
    .limit(1);

  if (!post) return fail("not_found");
  if (post.status === "published") return fail("already_published");

  const caption = (post.content as { caption?: string } | null)?.caption ?? "";
  const imageUrl = post.mediaUrls?.[0];
  if (!imageUrl) return fail("no_image");

  const result = await publishImageToInstagram(db, lcId, imageUrl, caption);

  if (!result.ok) {
    await db
      .update(schema.socialPosts)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.socialPosts.id, post.id));
    return result;
  }

  await db
    .update(schema.socialPosts)
    .set({
      status: "published",
      externalPostIds: { ...((post.externalPostIds as Record<string, unknown>) ?? {}), instagram: result.mediaId },
      updatedAt: new Date()
    })
    .where(eq(schema.socialPosts.id, post.id));

  return result;
}
