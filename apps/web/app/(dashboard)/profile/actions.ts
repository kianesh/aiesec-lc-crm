"use server";

import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { createClient } from "../../../lib/supabase/server";

const profileSchema = z.object({
  fullName: z.string().min(1).max(120),
  title: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  bio: z.string().max(600).optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal(""))
});

export async function updateProfile(formData: FormData) {
  const { user } = await requireMembership();
  const input = profileSchema.parse({
    fullName: formData.get("fullName"),
    title: formData.get("title") || undefined,
    phone: formData.get("phone") || undefined,
    bio: formData.get("bio") || undefined,
    avatarUrl: formData.get("avatarUrl") || undefined
  });

  const db = getDb();
  await db
    .update(schema.users)
    .set({
      fullName: input.fullName,
      title: input.title || null,
      phone: input.phone || null,
      bio: input.bio || null,
      avatarUrl: input.avatarUrl || null
    })
    .where(eq(schema.users.id, user.id));

  // Keep Supabase auth metadata in sync so the sign-in profile re-sync doesn't
  // overwrite the edited name/avatar.
  try {
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { full_name: input.fullName, avatar_url: input.avatarUrl || null }
    });
  } catch {
    /* non-fatal */
  }

  redirect("/profile?saved=1");
}
