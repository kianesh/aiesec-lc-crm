import { schema } from "@aiesec/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";

export type Notification = {
  id: string;
  type: "join_request";
  createdAt: Date;
  lcId: string;
  lcName: string;
  title: string;
  actorName: string;
  actorEmail: string;
  requestId: string;
};

// Roles that can act on join requests (this is the coarse gate; the finer
// per-position matrix always grants owners/LCPs manage_members too).
const MANAGER_ROLES = ["owner", "admin"] as const;

// All actionable notifications for a user across every LC they help manage.
// Currently: pending join requests. Cross-LC by design so a request never hides
// just because it's not for the user's "active" workspace.
export async function getNotifications(userId: string): Promise<Notification[]> {
  const db = getDb();
  try {
    const rows = await db
      .select({
        requestId: schema.lcJoinRequests.id,
        createdAt: schema.lcJoinRequests.createdAt,
        lcId: schema.lcJoinRequests.lcId,
        lcName: schema.localCommittees.name,
        actorName: schema.users.fullName,
        actorEmail: schema.users.email
      })
      .from(schema.lcJoinRequests)
      .innerJoin(
        schema.lcMembers,
        and(
          eq(schema.lcMembers.lcId, schema.lcJoinRequests.lcId),
          eq(schema.lcMembers.userId, userId),
          inArray(schema.lcMembers.role, [...MANAGER_ROLES])
        )
      )
      .innerJoin(schema.localCommittees, eq(schema.localCommittees.id, schema.lcJoinRequests.lcId))
      .innerJoin(schema.users, eq(schema.users.id, schema.lcJoinRequests.userId))
      .where(eq(schema.lcJoinRequests.status, "pending"))
      .orderBy(desc(schema.lcJoinRequests.createdAt));

    return rows.map((r) => ({
      id: `join-${r.requestId}`,
      type: "join_request" as const,
      createdAt: r.createdAt,
      lcId: r.lcId,
      lcName: r.lcName,
      title: "New request to join",
      actorName: r.actorName || r.actorEmail,
      actorEmail: r.actorEmail,
      requestId: r.requestId
    }));
  } catch {
    // lc_join_requests missing (migration 0008 not applied yet) — no notifications.
    return [];
  }
}

export async function getNotificationCount(userId: string): Promise<number> {
  const notifications = await getNotifications(userId);
  return notifications.length;
}

// Verify the acting user manages the LC a join request belongs to. Returns the
// request row (lcId, userId) when authorized, else null.
export async function authorizeJoinRequest(actingUserId: string, requestId: string) {
  const db = getDb();
  const [req] = await db
    .select({ lcId: schema.lcJoinRequests.lcId, userId: schema.lcJoinRequests.userId, status: schema.lcJoinRequests.status })
    .from(schema.lcJoinRequests)
    .where(eq(schema.lcJoinRequests.id, requestId))
    .limit(1);
  if (!req || req.status !== "pending") return null;

  const [membership] = await db
    .select({ role: schema.lcMembers.role })
    .from(schema.lcMembers)
    .where(and(eq(schema.lcMembers.lcId, req.lcId), eq(schema.lcMembers.userId, actingUserId)))
    .limit(1);
  if (!membership || !MANAGER_ROLES.includes(membership.role as (typeof MANAGER_ROLES)[number])) return null;

  return req;
}
