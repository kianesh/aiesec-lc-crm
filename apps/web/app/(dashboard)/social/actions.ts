"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getInstagramAuth, publishInstagramImage } from "../../../lib/connectors/instagram";

// Publish an image post straight to the connected Instagram account.
export async function publishToInstagram(formData: FormData) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/social/instagram?error=not_allowed");

  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  if (!/^https:\/\/.+/i.test(imageUrl)) redirect("/social/instagram?error=bad_image");

  const db = getDb();
  let outcome: string;
  try {
    const { token, igUserId } = await getInstagramAuth(db, activeMembership.lcId);
    await publishInstagramImage(token, igUserId, imageUrl, caption || undefined);
    outcome = "published=1";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    outcome = /not connected|reconnect/i.test(msg) ? "error=not_connected" : "error=publish_failed";
  }
  redirect(`/social/instagram?${outcome}`);
}

const postSchema = z.object({
  title: z.string().optional(),
  caption: z.string().min(1),
  platforms: z.array(z.string()).min(1),
  scheduledFor: z.string().optional()
});

export async function createPost(formData: FormData) {
  const { user, activeMembership } = await requireMembership();

  const input = postSchema.parse({
    title: formData.get("title") || undefined,
    caption: formData.get("caption"),
    platforms: formData.getAll("platforms").map(String).filter(Boolean),
    scheduledFor: formData.get("scheduledFor") || undefined
  });

  const db = getDb();
  await db.insert(schema.socialPosts).values({
    lcId: activeMembership.lcId,
    title: input.title || null,
    platforms: input.platforms,
    content: { caption: input.caption },
    status: input.scheduledFor ? "scheduled" : "draft",
    scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    createdBy: user.id
  });

  redirect("/social");
}

export async function updatePost(id: string, formData: FormData) {
  const { activeMembership } = await requireMembership();

  const input = postSchema.parse({
    title: formData.get("title") || undefined,
    caption: formData.get("caption"),
    platforms: formData.getAll("platforms").map(String).filter(Boolean),
    scheduledFor: formData.get("scheduledFor") || undefined
  });

  const db = getDb();
  await db
    .update(schema.socialPosts)
    .set({
      title: input.title || null,
      platforms: input.platforms,
      content: { caption: input.caption },
      status: input.scheduledFor ? "scheduled" : "draft",
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      updatedAt: new Date()
    })
    .where(and(eq(schema.socialPosts.id, id), eq(schema.socialPosts.lcId, activeMembership.lcId)));

  redirect("/social");
}

export async function deletePost(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/social?error=not_allowed");

  const db = getDb();
  await db
    .delete(schema.socialPosts)
    .where(and(eq(schema.socialPosts.id, id), eq(schema.socialPosts.lcId, activeMembership.lcId)));

  redirect("/social");
}

export async function markPublished(id: string) {
  const { activeMembership } = await requireMembership();

  const db = getDb();
  await db
    .update(schema.socialPosts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(schema.socialPosts.id, id), eq(schema.socialPosts.lcId, activeMembership.lcId)));

  redirect("/social");
}
