"use server";

import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { authorizeJoinRequest } from "../../../lib/notifications";

export async function approveJoinRequest(requestId: string) {
  const { user } = await requireMembership();
  const req = await authorizeJoinRequest(user.id, requestId);
  if (!req) return;

  const db = getDb();
  await db
    .insert(schema.lcMembers)
    .values({ lcId: req.lcId, userId: req.userId, role: "member", position: "member", invitedBy: user.id })
    .onConflictDoNothing();

  await db
    .update(schema.lcJoinRequests)
    .set({ status: "approved", decidedBy: user.id, decidedAt: new Date() })
    .where(eq(schema.lcJoinRequests.id, requestId));

  revalidatePath("/notifications");
  revalidatePath("/organization/team");
  revalidatePath("/organization/settings");
}

export async function rejectJoinRequest(requestId: string) {
  const { user } = await requireMembership();
  const req = await authorizeJoinRequest(user.id, requestId);
  if (!req) return;

  const db = getDb();
  await db
    .update(schema.lcJoinRequests)
    .set({ status: "rejected", decidedBy: user.id, decidedAt: new Date() })
    .where(eq(schema.lcJoinRequests.id, requestId));

  revalidatePath("/notifications");
  revalidatePath("/organization/team");
  revalidatePath("/organization/settings");
}
