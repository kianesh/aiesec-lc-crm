import { schema } from "@aiesec/db";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getDb } from "./db";
import { effectiveCapabilities, normalizeMatrix, type Capability, type Position } from "./permissions";

export type Membership = {
  lcId: string;
  lcName: string;
  role: "owner" | "admin" | "member";
  position: Position;
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
      role: schema.lcMembers.role,
      position: schema.lcMembers.position
    })
    .from(schema.lcMembers)
    .innerJoin(schema.localCommittees, eq(schema.lcMembers.lcId, schema.localCommittees.id))
    .where(eq(schema.lcMembers.userId, userId));

  return rows.map((r) => ({ ...r, position: r.position as Position }));
}

// The most recent join request a user has that is still awaiting a decision —
// used by onboarding to show a "waiting for approval" state instead of a
// dead-end LC-creation form.
export async function getPendingJoinRequest(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: schema.lcJoinRequests.id,
      status: schema.lcJoinRequests.status,
      createdAt: schema.lcJoinRequests.createdAt,
      lcId: schema.localCommittees.id,
      lcName: schema.localCommittees.name
    })
    .from(schema.lcJoinRequests)
    .innerJoin(schema.localCommittees, eq(schema.lcJoinRequests.lcId, schema.localCommittees.id))
    .where(and(eq(schema.lcJoinRequests.userId, userId), eq(schema.lcJoinRequests.status, "pending")))
    .orderBy(desc(schema.lcJoinRequests.createdAt))
    .limit(1);
  return row ?? null;
}

// Resolve the effective capability set for a member in an LC, honoring the LC's
// customizable permission matrix (with owner/LCP as always-full safety nets).
export async function getMemberCapabilities(
  lcId: string,
  member: { role: "owner" | "admin" | "member"; position: Position }
): Promise<Set<Capability>> {
  const db = getDb();
  try {
    const [row] = await db
      .select({ matrix: schema.lcPermissionSettings.matrix })
      .from(schema.lcPermissionSettings)
      .where(eq(schema.lcPermissionSettings.lcId, lcId))
      .limit(1);
    return effectiveCapabilities(member, normalizeMatrix(row?.matrix));
  } catch {
    // Table not migrated yet — fall back to defaults so the app still works.
    return effectiveCapabilities(member, normalizeMatrix(undefined));
  }
}

export async function requireMembership() {
  // Identity only — no profile upsert on the hot path. The profile row is
  // created/refreshed at sign-in (auth callback), onboarding, and invite accept.
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) redirect("/onboarding");
  return { user, memberships, activeMembership: memberships[0] };
}

// Guard a server action / page on a specific capability. Redirects with
// ?error=not_allowed when the active member lacks it.
export async function requireCapability(capability: Capability, redirectTo = "/dashboard") {
  const ctx = await requireMembership();
  const caps = await getMemberCapabilities(ctx.activeMembership.lcId, ctx.activeMembership);
  if (!caps.has(capability)) redirect(`${redirectTo}?error=not_allowed`);
  return { ...ctx, caps };
}
