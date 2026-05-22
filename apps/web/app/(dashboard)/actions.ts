"use server";

import { randomBytes } from "node:crypto";
import { schema } from "@aiesec/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "../../lib/supabase/server";
import { getDb } from "../../lib/db";
import { requireMembership } from "../../lib/auth";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member")
});

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export async function inviteMember(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/settings?error=not_allowed");

  const input = inviteSchema.parse({
    email: formData.get("email"),
    role: formData.get("role") || "member"
  });
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const db = getDb();

  await db.insert(schema.invitations).values({
    lcId: activeMembership.lcId,
    email: input.email,
    role: input.role,
    token,
    expiresAt
  });

  await db.insert(schema.auditLog).values({
    lcId: activeMembership.lcId,
    userId: user.id,
    action: "invitation.created",
    entityType: "invitation",
    metadata: { email: input.email, role: input.role }
  });

  redirect(`/settings?invited=${encodeURIComponent(input.email)}&token=${token}`);
}
