"use server";

import { randomBytes } from "node:crypto";
import { schema } from "@aiesec/db";
import { and, eq, ilike, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "../../../lib/db";
import { ensureUserProfile, getMemberships } from "../../../lib/auth";
import { createClient } from "../../../lib/supabase/server";
import { connectExpaWithClientCredentials } from "../../../lib/connectors/expa";
import { DEFAULT_MATRIX } from "../../../lib/permissions";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Escape hatch from the onboarding flow (fixes the old dead-end where a user
// with no LC could never leave the LC-setup screen).
export async function signOutFromOnboarding() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

// ---------------------------------------------------------------- Profile ---

const profileSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(120),
  title: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal(""))
});

export async function saveOnboardingProfile(input: {
  fullName: string;
  title?: string;
  phone?: string;
}): Promise<ActionResult> {
  const user = await ensureUserProfile();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Check your details." };

  const db = getDb();
  await db
    .update(schema.users)
    .set({
      fullName: parsed.data.fullName.trim(),
      title: parsed.data.title?.trim() || null,
      phone: parsed.data.phone?.trim() || null
    })
    .where(eq(schema.users.id, user.id));
  return { ok: true };
}

// --------------------------------------------------------------- Join LC ---

export type LcSearchResult = {
  id: string;
  name: string;
  country: string;
  school: string | null;
  lcIdentifier: string | null;
};

export async function searchLcs(query: string): Promise<LcSearchResult[]> {
  await ensureUserProfile(); // must be signed in
  const q = query.trim();
  if (q.length < 2) return [];
  const db = getDb();
  const like = `%${q}%`;
  const rows = await db
    .select({
      id: schema.localCommittees.id,
      name: schema.localCommittees.name,
      country: schema.localCommittees.country,
      school: schema.localCommittees.school,
      lcIdentifier: schema.localCommittees.lcIdentifier
    })
    .from(schema.localCommittees)
    .where(
      or(
        ilike(schema.localCommittees.name, like),
        ilike(schema.localCommittees.lcIdentifier, like),
        ilike(schema.localCommittees.expaCommitteeId, like)
      )
    )
    .limit(10);
  return rows;
}

export async function requestToJoin(input: { lcId: string; message?: string }): Promise<ActionResult<{ lcName: string }>> {
  const user = await ensureUserProfile();
  const db = getDb();

  // Already a member? Skip straight to the dashboard.
  const memberships = await getMemberships(user.id);
  if (memberships.some((m) => m.lcId === input.lcId)) return { ok: false, error: "You're already a member of this LC." };

  const [lc] = await db
    .select({ name: schema.localCommittees.name })
    .from(schema.localCommittees)
    .where(eq(schema.localCommittees.id, input.lcId))
    .limit(1);
  if (!lc) return { ok: false, error: "That LC no longer exists." };

  // Upsert the request so re-requesting after a rejection re-opens it.
  await db
    .insert(schema.lcJoinRequests)
    .values({ lcId: input.lcId, userId: user.id, message: input.message?.slice(0, 500) || null, status: "pending" })
    .onConflictDoUpdate({
      target: [schema.lcJoinRequests.lcId, schema.lcJoinRequests.userId],
      set: { status: "pending", message: input.message?.slice(0, 500) || null, decidedBy: null, decidedAt: null, createdAt: new Date() }
    });

  return { ok: true, lcName: lc.name };
}

export async function withdrawJoinRequest(): Promise<void> {
  const user = await ensureUserProfile();
  const db = getDb();
  await db
    .delete(schema.lcJoinRequests)
    .where(and(eq(schema.lcJoinRequests.userId, user.id), eq(schema.lcJoinRequests.status, "pending")));
  redirect("/onboarding");
}

// -------------------------------------------------------------- Create LC ---

const createLcSchema = z.object({
  name: z.string().min(2, "Enter your LC name").max(120),
  school: z.string().max(160).optional().or(z.literal("")),
  country: z.string().min(2, "Enter a country").max(80),
  stateProvince: z.string().max(80).optional().or(z.literal("")),
  expaCommitteeId: z.string().max(64).optional().or(z.literal(""))
});

export async function createLc(input: {
  name: string;
  school?: string;
  country: string;
  stateProvince?: string;
  expaCommitteeId?: string;
}): Promise<ActionResult<{ lcId: string; expaConnected: boolean }>> {
  const user = await ensureUserProfile();
  const parsed = createLcSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Check the LC details." };
  const data = parsed.data;
  const db = getDb();

  const committee = data.expaCommitteeId?.trim() || null;
  let lcId: string;
  try {
    const [created] = await db
      .insert(schema.localCommittees)
      .values({
        name: data.name.trim(),
        country: data.country.trim(),
        stateProvince: data.stateProvince?.trim() || null,
        school: data.school?.trim() || null,
        // The friendly LC ID is set by an admin later in org settings. Search
        // still finds this LC by its EXPA committee id in the meantime.
        expaCommitteeId: committee,
        brandConfig: { primary: "#037ef3" }
      })
      .returning({ id: schema.localCommittees.id });
    lcId = created.id;
  } catch {
    return { ok: false, error: "Couldn’t create the LC. Please try again." };
  }

  // Creator is the LCP (top of the org) with owner permissions.
  await db.insert(schema.lcMembers).values({ lcId, userId: user.id, role: "owner", position: "lcp" });
  await db.insert(schema.expaSyncState).values({ lcId }).onConflictDoNothing();
  await db
    .insert(schema.lcPermissionSettings)
    .values({ lcId, matrix: DEFAULT_MATRIX })
    .onConflictDoNothing();

  // Best-effort: auto-connect EXPA if a committee id was supplied.
  let expaConnected = false;
  if (committee) {
    try {
      const res = await connectExpaWithClientCredentials(db, lcId, committee);
      expaConnected = res.ok;
    } catch {
      /* non-fatal — they can connect from Integrations later */
    }
  }

  return { ok: true, lcId, expaConnected };
}

// ------------------------------------------------------- Invite in onboarding ---

const inviteSchema = z.object({
  lcId: z.string().uuid(),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["owner", "admin", "member"]).default("member")
});

export async function sendOnboardingInvite(input: {
  lcId: string;
  email: string;
  role?: "owner" | "admin" | "member";
}): Promise<ActionResult<{ token: string; email: string }>> {
  const user = await ensureUserProfile();
  const parsed = inviteSchema.safeParse({ ...input, role: input.role ?? "member" });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Check the invite." };

  const db = getDb();
  // Only a member of the LC (the creator, here) may invite.
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.lcId === parsed.data.lcId)) return { ok: false, error: "You can't invite to this LC." };

  const token = randomBytes(24).toString("hex");
  await db.insert(schema.invitations).values({
    lcId: parsed.data.lcId,
    email: parsed.data.email,
    role: parsed.data.role,
    token,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  });
  return { ok: true, token, email: parsed.data.email };
}
