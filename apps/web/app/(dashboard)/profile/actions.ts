"use server";

import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership, requireUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

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

// Permanently delete the signed-in user's account: their app data (membership,
// join requests, profile — via the users-row cascade) and their auth identity.
export async function deleteAccount(formData: FormData) {
  const user = await requireUser();

  // Guard: require typing the confirmation phrase so this can't fire by accident.
  const confirmation = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (confirmation !== "delete") redirect("/profile?error=confirm");

  const db = getDb();
  // Deleting the users row cascades to lc_members and lc_join_requests (FKs use
  // on delete cascade), removing this person from every LC.
  await db.delete(schema.users).where(eq(schema.users.id, user.id)).catch(() => undefined);

  // Remove the Supabase auth identity when a service-role key is available, so
  // the account is fully gone (not just re-onboardable on next sign-in).
  const admin = createAdminClient();
  if (admin) {
    await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
  }

  const supabase = createClient();
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/sign-in?deleted=1");
}
