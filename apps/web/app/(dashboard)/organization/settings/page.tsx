import { schema } from "@aiesec/db";
import { and, asc, eq } from "drizzle-orm";
import { Check, Plug, UserCheck, UserPlus, X } from "lucide-react";
import { getMemberCapabilities, requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { getSiteUrl } from "../../../../lib/site-url";
import { normalizeMatrix } from "../../../../lib/permissions";
import {
  approveJoinRequest,
  connectExpaNow,
  inviteMemberToLc,
  rejectJoinRequest,
  updateLcSettings
} from "../actions";
import { PermissionsEditor } from "../permissions-editor";
import { ORG_ERRORS } from "../org-shared";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage({
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

  type PendingReq = { id: string; name: string; email: string };
  let lcInfo:
    | { name: string; school: string | null; country: string; stateProvince: string | null; lcIdentifier: string | null; expaCommitteeId: string | null }
    | null = null;
  let pendingRequests: PendingReq[] = [];
  let permMatrix = normalizeMatrix(undefined);
  let expaConnected = false;
  let ready = false;
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
      .select({ id: schema.lcJoinRequests.id, name: schema.users.fullName, email: schema.users.email })
      .from(schema.lcJoinRequests)
      .innerJoin(schema.users, eq(schema.lcJoinRequests.userId, schema.users.id))
      .where(and(eq(schema.lcJoinRequests.lcId, activeMembership.lcId), eq(schema.lcJoinRequests.status, "pending")))
      .orderBy(asc(schema.lcJoinRequests.createdAt));
    pendingRequests = reqs.map((r) => ({ id: r.id, name: r.name || r.email, email: r.email }));

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
    ready = true;
  } catch {
    ready = false;
  }

  if (!canManage && !canManageLc && !canManagePermissions) {
    return (
      <div className="content">
        <section className="page-heading"><div><span className="eyebrow">Organization</span><h1>Settings</h1></div></section>
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted-note">You don’t have permission to manage this LC’s settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      {searchParams.saved && (
        <p className="success-note page-note">{searchParams.expa === "connected" ? "EXPA connected." : "Saved."}</p>
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
          <span className="eyebrow">Organization</span>
          <h1>Settings</h1>
          <p>Manage {activeMembership.lcName} — members, permissions and LC details.</p>
        </div>
      </section>

      {!ready && (
        <p className="form-error page-note">
          Run migration <code>0008_onboarding_join_permissions.sql</code> in Supabase to enable invites, join requests and
          permissions.
        </p>
      )}

      <div className="org-admin-grid">
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
                      <span>{r.name}<br /><small className="muted-note">{r.email}</small></span>
                    </div>
                    <div className="join-request-actions">
                      <form action={approveJoinRequest.bind(null, r.id)}>
                        <button type="submit" className="button primary" style={{ fontSize: 12 }}><Check size={13} /> Approve</button>
                      </form>
                      <form action={rejectJoinRequest.bind(null, r.id)}>
                        <button type="submit" className="button ghost danger" style={{ fontSize: 12 }}><X size={13} /> Reject</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

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

      {canManagePermissions && (
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
    </div>
  );
}
