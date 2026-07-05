"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";

const orgSchema = z.object({
  position: z.enum(["lcp", "lcvp", "team_leader", "member"]),
  team: z.string().max(80).optional().or(z.literal("")),
  managerId: z.string().uuid().optional().or(z.literal(""))
});

// Update a member's org position / team / reports-to. Owners & admins only.
export async function updateMemberOrg(memberId: string, formData: FormData) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/organization?error=not_allowed");

  const input = orgSchema.parse({
    position: formData.get("position"),
    team: formData.get("team") || undefined,
    managerId: formData.get("managerId") || undefined
  });

  // Never let a member manage themselves (would break the tree).
  const managerId = input.managerId && input.managerId !== memberId ? input.managerId : null;

  const db = getDb();
  await db
    .update(schema.lcMembers)
    .set({ position: input.position, team: input.team || null, managerId })
    .where(and(eq(schema.lcMembers.id, memberId), eq(schema.lcMembers.lcId, activeMembership.lcId)));

  redirect("/organization?saved=1");
}
