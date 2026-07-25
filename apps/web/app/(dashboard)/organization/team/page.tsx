import { schema } from "@aiesec/db";
import { asc, eq } from "drizzle-orm";
import { Network } from "lucide-react";
import { getMemberCapabilities, requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { updateMemberOrg } from "../actions";
import {
  initials,
  Member,
  ORG_ERRORS,
  PORTFOLIO_LABELS,
  PORTFOLIOS,
  POSITION_BADGE,
  POSITION_LABELS,
  sortMembers
} from "../org-shared";

export const dynamic = "force-dynamic";

export default async function OrganizationTeamPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { activeMembership } = await requireMembership();
  const caps = await getMemberCapabilities(activeMembership.lcId, activeMembership);
  const canManage = caps.has("manage_members");
  const db = getDb();

  let rows: Member[];
  try {
    const raw = await db
      .select({
        id: schema.lcMembers.id,
        userId: schema.lcMembers.userId,
        role: schema.lcMembers.role,
        position: schema.lcMembers.position,
        portfolio: schema.lcMembers.portfolio,
        managerId: schema.lcMembers.managerId,
        name: schema.users.fullName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl
      })
      .from(schema.lcMembers)
      .innerJoin(schema.users, eq(schema.lcMembers.userId, schema.users.id))
      .where(eq(schema.lcMembers.lcId, activeMembership.lcId))
      .orderBy(asc(schema.users.fullName));
    rows = raw.map((r) => ({ ...r, name: r.name || r.email }));
  } catch {
    return (
      <div className="content">
        <section className="page-heading"><div><span className="eyebrow">People</span><h1>Team</h1></div></section>
        <article className="card" style={{ padding: 32, maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Finish database setup</h2>
          <p className="muted-note" style={{ lineHeight: 1.6 }}>
            Run migrations <code>0005_org_and_profile.sql</code> and <code>0006_portfolios.sql</code> in the Supabase SQL
            editor, then reload. Safe to re-run.
          </p>
        </article>
      </div>
    );
  }

  const members = rows;
  const byId = new Map(members.map((m) => [m.id, m]));
  const childrenOf = new Map<string | null, Member[]>();
  for (const m of members) {
    const key = m.managerId && byId.has(m.managerId) ? m.managerId : null;
    const list = childrenOf.get(key) ?? [];
    list.push(m);
    childrenOf.set(key, list);
  }
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
          {m.portfolio && <small className="org-team">{PORTFOLIO_LABELS[m.portfolio]}</small>}
        </div>
        {kids.length > 0 && <ul>{kids.map(renderNode)}</ul>}
      </li>
    );
  }

  return (
    <div className="content">
      {searchParams.saved && <p className="success-note page-note">Team updated.</p>}
      {searchParams.error && <p className="form-error page-note">{ORG_ERRORS[searchParams.error] ?? "Something went wrong."}</p>}

      <section className="page-heading">
        <div>
          <span className="eyebrow">People</span>
          <h1>Team</h1>
          <p>{members.length} member{members.length === 1 ? "" : "s"} · {activeMembership.lcName}</p>
        </div>
      </section>

      {members.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Network size={26} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
          <p className="muted-note">No members yet. Invite teammates from Organization → Settings.</p>
        </div>
      ) : (
        <>
          <article className="card" style={{ padding: 24, overflowX: "auto" }}>
            <div className="org-tree">
              <ul>{roots.map(renderNode)}</ul>
            </div>
          </article>

          <section style={{ marginTop: 20 }}>
            <span className="eyebrow">Portfolios</span>
            <div className="portfolio-grid">
              {PORTFOLIOS.map((pf) => {
                const people = members.filter((m) => m.portfolio === pf).sort(sortMembers);
                const lead = people.find((m) => m.position === "lcvp");
                return (
                  <article className="card portfolio-card" key={pf}>
                    <header>
                      <strong>{PORTFOLIO_LABELS[pf]}</strong>
                      <em>{people.length}</em>
                    </header>
                    {lead && (
                      <div className="portfolio-lead">
                        <span className="org-avatar org-avatar-sm">{lead.avatarUrl ? <img src={lead.avatarUrl} alt="" /> : initials(lead.name)}</span>
                        <span>{lead.name}<br /><small className="muted-note">LCVP</small></span>
                      </div>
                    )}
                    {people.length === 0 ? (
                      <p className="muted-note" style={{ fontSize: 12 }}>No one assigned yet.</p>
                    ) : (
                      <ul className="portfolio-members">
                        {people.filter((m) => m.position !== "lcvp").map((m) => (
                          <li key={m.id}>
                            <span>{m.name}</span>
                            <small className={POSITION_BADGE[m.position] ?? "badge badge-grey"}>{POSITION_LABELS[m.position]}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section style={{ marginTop: 20 }}>
            <span className="eyebrow">Team roster</span>
            <table className="data-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Position</th>
                  <th>Portfolio</th>
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
                            <select name="portfolio" defaultValue={m.portfolio ?? ""}>
                              <option value="">— Portfolio —</option>
                              {PORTFOLIOS.map((pf) => <option key={pf} value={pf}>{PORTFOLIO_LABELS[pf]}</option>)}
                            </select>
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
                          <td>{m.portfolio ? PORTFOLIO_LABELS[m.portfolio] : <span className="muted-note">—</span>}</td>
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
