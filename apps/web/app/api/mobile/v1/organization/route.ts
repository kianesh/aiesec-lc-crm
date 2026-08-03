import type { OrganizationResponse, OrgMemberDto } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { asc, eq } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonError, jsonOk } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

// The LC roster and the reports-to links that build the org chart. Read-only:
// editing positions, portfolios and the permission matrix stays on the web app,
// so this route has no write half.
export const GET = authed(async (_request, session) => {
  const db = getDb();
  const lcId = session.membership.lcId;

  const [[lc], memberRows] = await Promise.all([
    db
      .select({
        id: schema.localCommittees.id,
        name: schema.localCommittees.name,
        country: schema.localCommittees.country,
        stateProvince: schema.localCommittees.stateProvince,
        school: schema.localCommittees.school,
        lcIdentifier: schema.localCommittees.lcIdentifier,
        expaCommitteeId: schema.localCommittees.expaCommitteeId
      })
      .from(schema.localCommittees)
      .where(eq(schema.localCommittees.id, lcId))
      .limit(1),
    db
      .select({
        id: schema.lcMembers.id,
        userId: schema.lcMembers.userId,
        role: schema.lcMembers.role,
        position: schema.lcMembers.position,
        portfolio: schema.lcMembers.portfolio,
        team: schema.lcMembers.team,
        managerId: schema.lcMembers.managerId,
        joinedAt: schema.lcMembers.joinedAt,
        name: schema.users.fullName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl
      })
      .from(schema.lcMembers)
      .innerJoin(schema.users, eq(schema.lcMembers.userId, schema.users.id))
      .where(eq(schema.lcMembers.lcId, lcId))
      .orderBy(asc(schema.users.fullName))
  ]);

  if (!lc) return jsonError("not_found", "That Local Committee no longer exists.");

  const memberIds = new Set(memberRows.map((row) => row.id));

  const members: OrgMemberDto[] = memberRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    // Someone invited but not yet through onboarding has no full name.
    name: row.name || row.email,
    email: row.email,
    avatarUrl: row.avatarUrl,
    role: row.role,
    position: row.position,
    portfolio: row.portfolio,
    team: row.team,
    // Drop links pointing at a member outside this LC (or since removed), so
    // the app can build the tree without orphan nodes disappearing from it.
    managerId: row.managerId && memberIds.has(row.managerId) ? row.managerId : null,
    joinedAt: iso(row.joinedAt)
  }));

  const body: OrganizationResponse = {
    lc,
    members,
    canManageMembers: session.capabilities.has("manage_members")
  };

  return jsonOk(body);
});
