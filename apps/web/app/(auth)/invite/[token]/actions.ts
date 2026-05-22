"use server";

import { schema } from "@aiesec/db";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../../../../lib/db";
import { ensureUserProfile } from "../../../../lib/auth";

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const user = await ensureUserProfile();
  const db = getDb();

  const [invite] = await db
    .select()
    .from(schema.invitations)
    .where(and(eq(schema.invitations.token, token), isNull(schema.invitations.acceptedAt)))
    .limit(1);

  if (!invite) redirect(`/invite/${token}?error=invalid`);
  if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    redirect(`/invite/${token}?error=email_mismatch`);
  }
  if (invite.expiresAt < new Date()) redirect(`/invite/${token}?error=expired`);

  await db
    .insert(schema.lcMembers)
    .values({
      lcId: invite.lcId,
      userId: user.id,
      role: invite.role,
      invitedBy: null
    })
    .onConflictDoNothing();

  await db
    .update(schema.invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invitations.id, invite.id));

  redirect("/dashboard");
}
