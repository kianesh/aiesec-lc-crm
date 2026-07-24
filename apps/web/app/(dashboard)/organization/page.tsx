import { schema } from "@aiesec/db";
import { and, asc, eq } from "drizzle-orm";
import { Check, Network, Plug, UserCheck, UserPlus, X } from "lucide-react";
import { getMemberCapabilities, requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getSiteUrl } from "../../../lib/site-url";
import { normalizeMatrix } from "../../../lib/permissions";
import {
  approveJoinRequest,
  connectExpaNow,
  inviteMemberToLc,
  rejectJoinRequest,
  updateLcSettings,
  updateMemberOrg
} from "./actions";
import { PermissionsEditor } from "./permissions-editor";

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

// Functional portfolios the LC org is built around (LCP oversees all).
const PORTFOLIOS = ["b2c", "ogv", "ogt", "finance", "tm"] as const;
const PORTFOLIO_LABELS: Record<string, string> = {
  b2c: "B2C · Marketing",
  ogv: "oGV · Global Volunteer",
  ogt: "oGT · Global Talent",
  finance: "Finance",
  tm: "TM · Talent Management"
};

type Member = {
  id: string;
  userId: string;
  role: string;
  position: string;
  portfolio: string | null;
  managerId: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

const ORG_ERRORS: Record<string, string> = {
  not_allowed: "You don’t have permission to do that.",
  identifier_taken: "That LC ID is already in use. Pick a different one.",
  bad_matrix: "Permissions could not be saved. Try again.",
  bad_invite: "That invite couldn’t be sent. Check the email address.",
  missing_committee: "Add an EXPA committee ID first.",
  expa_no_app_creds: "EXPA app credentials aren’t configured on the server.",
  expa_token_failed: "Couldn’t reach EXPA to generate a token. Try again."
};

export default async function OrganizationPage({
  searchParams
}: {
  searchParams: { saved?: string; error?: string; expa?: string; invited?: string; invite_token?: string };
}) {
  const { activeMembership } = await requireMembership();
  const caps = await getMemberCapabilities(activeMembership.lcId, activeMembership);
  const canManage = caps.has("manage_members");
  const canManageLc = caps.has("manage_lc");
  const canManagePermissions = caps.has("manage_permissions");
  const canManageIntegrations = caps.has("manage_integrations");
  const db = getDb();

  let rows: {
    id: string; userId: string; role: string; position: string; portfolio: string | null;
    managerId: string | null; name: string | null; email: string; avatarUrl: string | null;
  }[];
  try {
    rows = await db
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
  } catch {
    return (
      <div className="content">
        <section className="page-heading"><div><span className="eyebrow">People</span><h1>Organization</h1></div></section>
        <article className="card" style={{ padding: 32, maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Finish database setup</h2>
          <p className="muted-note" style={{ lineHeight: 1.6 }}>
            The org columns aren’t created yet. Run migrations{" "}
            <code>packages/db/drizzle/0005_org_and_profile.sql</code> and{" "}
            <code>0006_portfolios.sql</code> in the Supabase SQL editor, then reload. Safe to re-run.
          </p>
        </article>
      </div>
    );
  }

  // New onboarding / permission surfaces. These depend on migration 0008; if it
  // hasn't been applied we simply hide the sections rather than break the page.
  type PendingReq = { id: string; name: string; email: string; createdAt: Date };
  let lcInfo:
    | { name: string; school: string | null; country: string; stateProvince: string | null; lcIdentifier: string | null; expaCommitteeId: string | null }
    | null = null;
  let pendingRequests: PendingReq[] = [];
  let permMatrix = normalizeMatrix(undefined);
  let expaConnected = false;
  let orgExtrasReady = false;
  try {
    const [lc] = await db
      .select({
        name: schema.localCommittees.name,
        school: schema.localCommittees.school,
        country: schema.localCommittees.country,
        stateProvince: schema.localCommittees.stateProvince,
        lcIdentifier: schema.localCommittees.lcIdentifier,
        expaCommitteeId: schema.localCommittees.expaCommitteeId
      })
      .from(schema.localCommittees)
      .where(eq(schema.localCommittees.id, activeMembership.lcId))
      .limit(1);
    lcInfo = lc ?? null;

    const reqs = await db
      .select({
        id: schema.lcJoinRequests.id,
        name: schema.users.fullName,
        email: schema.users.email,
        createdAt: schema.lcJoinRequests.createdAt
      })
      .from(schema.lcJoinRequests)
      .innerJoin(schema.users, eq(schema.lcJoinRequests.userId, schema.users.id))
      .where(and(eq(schema.lcJoinRequests.lcId, activeMembership.lcId), eq(schema.lcJoinRequests.status, "pending")))
      .orderBy(asc(schema.lcJoinRequests.createdAt));
    pendingRequests = reqs.map((r) => ({ id: r.id, name: r.name || r.email, email: r.email, createdAt: r.createdAt }));

    const [perm] = await db
      .select({ matrix: schema.lcPermissionSettings.matrix })
      .from(schema.lcPermissionSettings)
      .where(eq(schema.lcPermissionSettings.lcId, activeMembership.lcId))
      .limit(1);
    permMatrix = normalizeMatrix(perm?.matrix);

    const [expa] = await db
      .select({ status: schema.integrations.status })
      .from(schema.integrations)
      .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
      .limit(1);
    expaConnected = expa?.status === "connected";
    orgExtrasReady = true;
  } catch {
    orgExtrasReady = false;
  }

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
          {m.portfolio && <small className="org-team">{PORTFOLIO_LABELS[m.portfolio]}</small>}
        </div>
        {kids.length > 0 && <ul>{kids.map(renderNode)}</ul>}
      </li>
    );
  }

  return (
    <div className="content">
      {searchParams.saved && (
        <p className="success-note page-note">
          {searchParams.expa === "connected" ? "EXPA connected." : "Organization updated."}
        </p>
      )}
      {searchParams.invited && !searchParams.invite_token && (
        <p className="success-note page-note">Invitation emailed to {searchParams.invited}.</p>
      )}
      {searchParams.invited && searchParams.invite_token && (
        <p className="success-note page-note">
          Invite created for {searchParams.invited}. Email isn’t configured, so share this link:{" "}
          <code>{`${getSiteUrl()}/invite/${searchParams.invite_token}`}</code>
        </p>
      )}
      {searchParams.error && <p className="form-error page-note">{ORG_ERRORS[searchParams.error] ?? "Something went wrong."}</p>}

      <section className="page-heading">
        <div>
          <span className="eyebrow">People</span>
          <h1>Organization</h1>
          <p>{members.length} member{members.length === 1 ? "" : "s"} · {activeMembership.lcName}</p>
        </div>
      </section>

      {orgExtrasReady && (canManageLc || canManage || canManagePermissions) && (
        <div className="org-admin-grid">
          {/* Invite members */}
          {canManage && (
            <section className="card" style={{ padding: 20 }}>
              <span className="eyebrow">Invite members</span>
              <p className="muted-note" style={{ marginTop: 4, marginBottom: 12 }}>
                Send an email invite. They’ll join {activeMembership.lcName} after accepting.
              </p>
              <form action={inviteMemberToLc} className="settings-form">
                <label className="book-field">
                  <span>Email</span>
                  <input name="email" type="email" placeholder="teammate@aiesec.org" required />
                </label>
                <label className="book-field">
                  <span>Role</span>
                  <select name="role" defaultValue="member">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                <button type="submit" className="button primary"><UserPlus size={14} /> Send invite</button>
              </form>
            </section>
          )}

          {/* Join requests */}
          {canManage && (
            <section className="card" style={{ padding: 20 }}>
              <span className="eyebrow">Join requests</span>
              {pendingRequests.length === 0 ? (
                <p className="muted-note" style={{ marginTop: 8 }}>No pending requests.</p>
              ) : (
                <ul className="join-request-list">
                  {pendingRequests.map((r) => (
                    <li key={r.id}>
                      <div className="join-request-info">
                        <span className="org-avatar org-avatar-sm"><UserCheck size={14} /></span>
                        <span>
                          {r.name}
                          <br />
                          <small className="muted-note">{r.email}</small>
                        </span>
                      </div>
                      <div className="join-request-actions">
                        <form action={approveJoinRequest.bind(null, r.id)}>
                          <button type="submit" className="button primary" style={{ fontSize: 12 }}>
                            <Check size={13} /> Approve
                          </button>
                        </form>
                        <form action={rejectJoinRequest.bind(null, r.id)}>
                          <button type="submit" className="button ghost danger" style={{ fontSize: 12 }}>
                            <X size={13} /> Reject
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* LC settings */}
          {canManageLc && lcInfo && (
            <section className="card" style={{ padding: 20 }}>
              <span className="eyebrow">LC settings</span>
              <form action={updateLcSettings} className="settings-form" style={{ marginTop: 8 }}>
                <label className="book-field">
                  <span>LC name</span>
                  <input name="name" defaultValue={lcInfo.name} required maxLength={120} />
                </label>
                <label className="book-field">
                  <span>School / University</span>
                  <input name="school" defaultValue={lcInfo.school ?? ""} maxLength={160} />
                </label>
                <div className="settings-row">
                  <label className="book-field">
                    <span>Country</span>
                    <input name="country" defaultValue={lcInfo.country} required maxLength={80} />
                  </label>
                  <label className="book-field">
                    <span>State / Province</span>
                    <input name="stateProvince" defaultValue={lcInfo.stateProvince ?? ""} maxLength={80} />
                  </label>
                </div>
                <div className="settings-row">
                  <label className="book-field">
                    <span>LC ID</span>
                    <input name="lcIdentifier" defaultValue={lcInfo.lcIdentifier ?? ""} maxLength={64} placeholder="e.g. 1590" />
                  </label>
                  <label className="book-field">
                    <span>EXPA committee ID</span>
                    <input name="expaCommitteeId" defaultValue={lcInfo.expaCommitteeId ?? ""} maxLength={64} />
                  </label>
                </div>
                <small className="muted-note">Tip: set the LC ID to match your EXPA committee ID so members can find you easily.</small>
                <button type="submit" className="button primary">Save LC settings</button>
              </form>
              {canManageIntegrations && (
                <div className="lc-expa-connect">
                  <div>
                    <strong style={{ fontSize: 13 }}>EXPA API</strong>
                    <br />
                    <small className="muted-note">
                      {expaConnected ? "Connected — data sync enabled." : "Generate an access token to pull your EXPA data."}
                    </small>
                  </div>
                  <form action={connectExpaNow}>
                    <button type="submit" className="button secondary" style={{ fontSize: 12 }} disabled={!lcInfo.expaCommitteeId}>
                      <Plug size={13} /> {expaConnected ? "Reconnect" : "Connect EXPA"}
                    </button>
                  </form>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {orgExtrasReady && canManagePermissions && (
        <section style={{ marginBottom: 20 }}>
          <span className="eyebrow">Role permissions</span>
          <p className="muted-note" style={{ marginTop: 4, marginBottom: 8 }}>
            Choose what each position can do in this LC. The structure (LCP · LCVP · TL · Member) stays the same — the
            permissions are yours to set.
          </p>
          <article className="card" style={{ padding: 20 }}>
            <PermissionsEditor initialMatrix={permMatrix} />
          </article>
        </section>
      )}

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
            <span className="eyebrow">Portfolios</span>
            <div className="portfolio-grid">
              {PORTFOLIOS.map((pf) => {
                const people = members
                  .filter((m) => m.portfolio === pf)
                  .sort(sortMembers);
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
