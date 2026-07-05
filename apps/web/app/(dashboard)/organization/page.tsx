import { schema } from "@aiesec/db";
import { asc, eq } from "drizzle-orm";
import { Network } from "lucide-react";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { updateMemberOrg } from "./actions";

export const dynamic = "force-dynamic";

const POSITION_LABELS: Record<string, string> = {
  lcp: "LCP",
  lcvp: "LCVP",
  team_leader: "Team Leader",
  member: "Member"
};
const POSITION_ORDER: Record<string, number> = { lcp: 0, lcvp: 1, team_leader: 2, member: 3 };
const POSITION_BADGE: Record<string, string> = {
  lcp: "badge badge-blue",
  lcvp: "badge badge-violet",
  team_leader: "badge badge-teal",
  member: "badge badge-grey"
};

type Member = {
  id: string;
  userId: string;
  role: string;
  position: string;
  team: string | null;
  managerId: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

export default async function OrganizationPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { activeMembership } = await requireMembership();
  const canManage = activeMembership.role !== "member";
  const db = getDb();

  const rows = await db
    .select({
      id: schema.lcMembers.id,
      userId: schema.lcMembers.userId,
      role: schema.lcMembers.role,
      position: schema.lcMembers.position,
      team: schema.lcMembers.team,
      managerId: schema.lcMembers.managerId,
      name: schema.users.fullName,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl
    })
    .from(schema.lcMembers)
    .innerJoin(schema.users, eq(schema.lcMembers.userId, schema.users.id))
    .where(eq(schema.lcMembers.lcId, activeMembership.lcId))
    .orderBy(asc(schema.users.fullName));

  const members: Member[] = rows.map((r) => ({ ...r, name: r.name || r.email }));
  const byId = new Map(members.map((m) => [m.id, m]));
  const childrenOf = new Map<string | null, Member[]>();
  for (const m of members) {
    // Treat a manager that isn't in this LC as a root.
    const key = m.managerId && byId.has(m.managerId) ? m.managerId : null;
    const list = childrenOf.get(key) ?? [];
    list.push(m);
    childrenOf.set(key, list);
  }
  const sortMembers = (a: Member, b: Member) =>
    (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9) || a.name.localeCompare(b.name);
  for (const list of childrenOf.values()) list.sort(sortMembers);
  const roots = (childrenOf.get(null) ?? []).slice();

  function renderNode(m: Member) {
    const kids = childrenOf.get(m.id) ?? [];
    return (
      <li key={m.id}>
        <div className="org-node">
          <span className="org-avatar">{m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : initials(m.name)}</span>
          <strong>{m.name}</strong>
          <span className={POSITION_BADGE[m.position] ?? "badge badge-grey"}>{POSITION_LABELS[m.position]}</span>
          {m.team && <small className="org-team">{m.team}</small>}
        </div>
        {kids.length > 0 && <ul>{kids.map(renderNode)}</ul>}
      </li>
    );
  }

  return (
    <div className="content">
      {searchParams.saved && <p className="success-note page-note">Organization updated.</p>}
      {searchParams.error === "not_allowed" && <p className="form-error page-note">Only owners and admins can edit the org.</p>}

      <section className="page-heading">
        <div>
          <span className="eyebrow">People</span>
          <h1>Organization</h1>
          <p>{members.length} member{members.length === 1 ? "" : "s"} · {activeMembership.lcName}</p>
        </div>
      </section>

      {members.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Network size={26} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
          <p className="muted-note">No members yet. Invite teammates from Settings.</p>
        </div>
      ) : (
        <>
          <article className="card" style={{ padding: 24, overflowX: "auto" }}>
            <div className="org-tree">
              <ul>{roots.map(renderNode)}</ul>
            </div>
          </article>

          <section style={{ marginTop: 20 }}>
            <span className="eyebrow">Team roster</span>
            <table className="data-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Position</th>
                  <th>Team</th>
                  <th>Reports to</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {[...members].sort(sortMembers).map((m) => {
                  const saveWithId = updateMemberOrg.bind(null, m.id);
                  const others = members.filter((o) => o.id !== m.id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="org-avatar org-avatar-sm">{m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : initials(m.name)}</span>
                          <span>{m.name}<br /><small className="muted-note">{m.email}</small></span>
                        </div>
                      </td>
                      {canManage ? (
                        <td colSpan={4} style={{ padding: 0 }}>
                          <form action={saveWithId} className="org-roster-form">
                            <select name="position" defaultValue={m.position}>
                              {Object.entries(POSITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <input name="team" defaultValue={m.team ?? ""} placeholder="Team / function" />
                            <select name="managerId" defaultValue={m.managerId ?? ""}>
                              <option value="">— No manager —</option>
                              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            <button className="button secondary" type="submit">Save</button>
                          </form>
                        </td>
                      ) : (
                        <>
                          <td><span className={POSITION_BADGE[m.position] ?? "badge badge-grey"}>{POSITION_LABELS[m.position]}</span></td>
                          <td>{m.team ?? <span className="muted-note">—</span>}</td>
                          <td>{m.managerId ? byId.get(m.managerId)?.name ?? "—" : <span className="muted-note">—</span>}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
