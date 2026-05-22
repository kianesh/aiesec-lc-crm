import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getDb } from "./db";

export type Membership = {
  lcId: string;
  lcName: string;
  role: "owner" | "admin" | "member";
};

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function ensureUserProfile() {
  const user = await requireUser();
  const db = getDb();

  await db
    .insert(schema.users)
    .values({
      id: user.id,
      email: user.email ?? "",
      fullName: user.user_metadata.full_name as string | undefined,
      avatarUrl: user.user_metadata.avatar_url as string | undefined
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        email: user.email ?? "",
        fullName: user.user_metadata.full_name as string | undefined,
        avatarUrl: user.user_metadata.avatar_url as string | undefined
      }
    });

  return user;
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const db = getDb();
  const rows = await db
    .select({
      lcId: schema.localCommittees.id,
      lcName: schema.localCommittees.name,
      role: schema.lcMembers.role
    })
    .from(schema.lcMembers)
    .innerJoin(schema.localCommittees, eq(schema.lcMembers.lcId, schema.localCommittees.id))
    .where(eq(schema.lcMembers.userId, userId));

  return rows;
}

export async function requireMembership() {
  const user = await ensureUserProfile();
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) redirect("/onboarding");
  return { user, memberships, activeMembership: memberships[0] };
}
