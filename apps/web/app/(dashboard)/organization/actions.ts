"use server";

import { randomBytes } from "node:crypto";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability, requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { connectExpaWithClientCredentials } from "../../../lib/connectors/expa";
import { inviteEmailHtml, sendTransactionalEmail } from "../../../lib/email";
import { getSiteUrl } from "../../../lib/site-url";
import { ALL_CAPABILITIES, DEFAULT_MATRIX, POSITIONS, normalizeMatrix, type Capability, type Position } from "../../../lib/permissions";

const orgSchema = z.object({
  position: z.enum(["lcp", "lcvp", "team_leader", "member"]),
  portfolio: z.enum(["b2c", "ogv", "ogt", "finance", "tm"]).optional().or(z.literal("")),
  managerId: z.string().uuid().optional().or(z.literal(""))
});

// Update a member's org position / portfolio / reports-to. Requires manage_members.
export async function updateMemberOrg(memberId: string, formData: FormData) {
  const { activeMembership } = await requireCapability("manage_members", "/organization/team");

  const input = orgSchema.parse({
    position: formData.get("position"),
    portfolio: formData.get("portfolio") || undefined,
    managerId: formData.get("managerId") || undefined
  });

  // Never let a member manage themselves (would break the tree).
  const managerId = input.managerId && input.managerId !== memberId ? input.managerId : null;
  // LCP oversees all portfolios, so it carries none.
  const portfolio = input.position === "lcp" ? null : input.portfolio || null;

  const db = getDb();
  await db
    .update(schema.lcMembers)
    .set({ position: input.position, portfolio, managerId })
    .where(and(eq(schema.lcMembers.id, memberId), eq(schema.lcMembers.lcId, activeMembership.lcId)));

  redirect("/organization/team?saved=1");
}

// ------------------------------------------------------------ LC settings ---

const lcSettingsSchema = z.object({
  name: z.string().min(2).max(120),
  school: z.string().max(160).optional().or(z.literal("")),
  country: z.string().min(2).max(80),
  stateProvince: z.string().max(80).optional().or(z.literal("")),
  lcIdentifier: z.string().max(64).optional().or(z.literal("")),
  expaCommitteeId: z.string().max(64).optional().or(z.literal(""))
});

export async function updateLcSettings(formData: FormData) {
  const { activeMembership } = await requireCapability("manage_lc", "/organization/settings");

  const input = lcSettingsSchema.parse({
    name: formData.get("name"),
    school: formData.get("school") || undefined,
    country: formData.get("country"),
    stateProvince: formData.get("stateProvince") || undefined,
    lcIdentifier: formData.get("lcIdentifier") || undefined,
    expaCommitteeId: formData.get("expaCommitteeId") || undefined
  });

  const db = getDb();
  const committee = input.expaCommitteeId?.trim() || null;
  try {
    await db
      .update(schema.localCommittees)
      .set({
        name: input.name.trim(),
        school: input.school?.trim() || null,
        country: input.country.trim(),
        stateProvince: input.stateProvince?.trim() || null,
        lcIdentifier: input.lcIdentifier?.trim() || null,
        expaCommitteeId: committee
      })
      .where(eq(schema.localCommittees.id, activeMembership.lcId));
  } catch {
    // Most likely the lc_identifier unique constraint.
    redirect("/organization/settings?error=identifier_taken");
  }

  redirect("/organization/settings?saved=1");
}

// ------------------------------------------------------- Invite members ---

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member")
});

export async function inviteMemberToLc(formData: FormData) {
  const { user, activeMembership } = await requireCapability("manage_members", "/organization/settings");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || "member"
  });
  if (!parsed.success) redirect("/organization/settings?error=bad_invite");
  const input = parsed.data;

  const db = getDb();
  const token = randomBytes(24).toString("hex");
  await db.insert(schema.invitations).values({
    lcId: activeMembership.lcId,
    email: input.email,
    role: input.role,
    token,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  });

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "invitation.created",
    entityType: "invitation",
    metadata: { email: input.email, role: input.role, via: "organization" }
  });

  const inviteUrl = `${getSiteUrl()}/invite/${token}`;
  const emailResult = await sendTransactionalEmail({
    to: input.email,
    subject: `You're invited to ${activeMembership.lcName} on AIESEC CRM`,
    html: inviteEmailHtml({ lcName: activeMembership.lcName, role: input.role, inviteUrl })
  });

  // When email isn't configured, hand back the link so the admin can share it.
  const params = new URLSearchParams({ invited: input.email });
  if (!emailResult.sent) params.set("invite_token", token);
  redirect(`/organization/settings?${params.toString()}`);
}

// --------------------------------------------------------- Join requests ---

export async function approveJoinRequest(requestId: string) {
  const { user, activeMembership } = await requireCapability("manage_members", "/organization/settings");
  const db = getDb();

  const [req] = await db
    .select({ id: schema.lcJoinRequests.id, userId: schema.lcJoinRequests.userId, status: schema.lcJoinRequests.status })
    .from(schema.lcJoinRequests)
    .where(and(eq(schema.lcJoinRequests.id, requestId), eq(schema.lcJoinRequests.lcId, activeMembership.lcId)))
    .limit(1);
  if (!req || req.status !== "pending") return;

  await db
    .insert(schema.lcMembers)
    .values({ lcId: activeMembership.lcId, userId: req.userId, role: "member", position: "member", invitedBy: user.id })
    .onConflictDoNothing();

  await db
    .update(schema.lcJoinRequests)
    .set({ status: "approved", decidedBy: user.id, decidedAt: new Date() })
    .where(eq(schema.lcJoinRequests.id, requestId));

  revalidatePath("/organization/settings");
}

export async function rejectJoinRequest(requestId: string) {
  const { user, activeMembership } = await requireCapability("manage_members", "/organization/settings");
  const db = getDb();
  await db
    .update(schema.lcJoinRequests)
    .set({ status: "rejected", decidedBy: user.id, decidedAt: new Date() })
    .where(and(eq(schema.lcJoinRequests.id, requestId), eq(schema.lcJoinRequests.lcId, activeMembership.lcId)));
  revalidatePath("/organization/settings");
}

// ---------------------------------------------------- Permission matrix ---

export async function savePermissionMatrix(formData: FormData) {
  const { activeMembership } = await requireCapability("manage_permissions", "/organization/settings");

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(String(formData.get("matrix") || "{}"));
  } catch {
    redirect("/organization/settings?error=bad_matrix");
  }

  // Editable positions are LCVP / TL / Member. LCP always keeps full access.
  const incoming = normalizeMatrix(parsed);
  const matrix: Record<Position, Capability[]> = {
    lcp: [...ALL_CAPABILITIES],
    lcvp: incoming.lcvp ?? DEFAULT_MATRIX.lcvp,
    team_leader: incoming.team_leader ?? DEFAULT_MATRIX.team_leader,
    member: incoming.member ?? DEFAULT_MATRIX.member
  };

  const db = getDb();
  await db
    .insert(schema.lcPermissionSettings)
    .values({ lcId: activeMembership.lcId, matrix, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.lcPermissionSettings.lcId, set: { matrix, updatedAt: new Date() } });

  redirect("/organization/settings?saved=1");
}

// ------------------------------------------------------------ EXPA connect ---

export async function connectExpaNow() {
  const { activeMembership } = await requireCapability("manage_integrations", "/organization/settings");
  const db = getDb();
  const [lc] = await db
    .select({ committeeId: schema.localCommittees.expaCommitteeId })
    .from(schema.localCommittees)
    .where(eq(schema.localCommittees.id, activeMembership.lcId))
    .limit(1);

  if (!lc?.committeeId) redirect("/organization/settings?error=missing_committee");

  const res = await connectExpaWithClientCredentials(db, activeMembership.lcId, lc.committeeId);
  if (!res.ok) {
    const map: Record<string, string> = {
      missing_app_credentials: "expa_no_app_creds",
      encryption_key_missing: "expa_no_app_creds",
      missing_committee: "missing_committee",
      token_failed: "expa_token_failed"
    };
    redirect(`/organization?error=${map[res.reason] ?? "expa_token_failed"}`);
  }
  redirect("/organization/settings?saved=1&expa=connected");
}
