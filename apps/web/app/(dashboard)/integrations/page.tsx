import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, CircleAlert, PlugZap, Unplug } from "lucide-react";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getServerEnv } from "../../../lib/env";
import { hasEncryptionKey } from "../../../lib/secret-crypto";
import {
  connectExpaWithAppCredentials,
  disconnectExpaIntegration,
  saveExpaIntegration,
  testExpaIntegration
} from "./actions";

type SearchParams = {
  saved?: string;
  tested?: string;
  disconnected?: string;
  error?: string;
};

const errorMessages: Record<string, string> = {
  encryption_key_missing: "Set ENCRYPTION_KEY in Vercel before storing EXPA credentials.",
  missing_expa_token: "Paste an EXPA access token the first time you connect.",
  missing_expa_connection: "Connect EXPA before testing it.",
  missing_expa_committee: "Add an EXPA committee ID before testing.",
  missing_expa_app_credentials: "Set EXPA_CLIENT_ID and EXPA_CLIENT_SECRET in Vercel before using app credentials.",
  not_allowed: "Only owners and admins can manage integrations."
};

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  const [row] = await db
    .select({
      integrationId: schema.integrations.id,
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncedAt: schema.integrations.lastSyncedAt,
      lcCommitteeId: schema.localCommittees.expaCommitteeId
    })
    .from(schema.localCommittees)
    .leftJoin(
      schema.integrations,
      and(eq(schema.integrations.lcId, schema.localCommittees.id), eq(schema.integrations.provider, "expa"))
    )
    .where(eq(schema.localCommittees.id, activeMembership.lcId))
    .limit(1);

  const config = row?.config as { committeeId?: string } | null;
  const committeeId = config?.committeeId ?? row?.lcCommitteeId ?? "";
  const isConnected = Boolean(row?.integrationId);
  const encryptionReady = hasEncryptionKey();
  const env = getServerEnv();
  const appCredentialsReady = Boolean(env.EXPA_CLIENT_ID && env.EXPA_CLIENT_SECRET);
  const canManage = activeMembership.role !== "member";
  const error = searchParams.error ? errorMessages[searchParams.error] ?? searchParams.error : null;

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Connections</span>
          <h1>Integrations</h1>
          <p>Connect LC-scoped systems and keep credentials encrypted on the server.</p>
        </div>
      </section>

      {searchParams.saved && <p className="success-note page-note">EXPA settings saved.</p>}
      {searchParams.tested && <p className="success-note page-note">EXPA connection test succeeded.</p>}
      {searchParams.disconnected && <p className="success-note page-note">EXPA disconnected.</p>}
      {error && <p className="form-error page-note">{error}</p>}

      <section className="integrations-grid">
        <article className="card integration-card">
          <div className="integration-card-header">
            <span className="integration-icon"><PlugZap size={20} /></span>
            <div>
              <h2>EXPA</h2>
              <p>Use an EXPA access token to unlock analytics and future sync jobs.</p>
            </div>
            <StatusPill status={row?.status ?? "disconnected"} connected={isConnected} />
          </div>

          <dl className="integration-meta">
            <div>
              <dt>Committee ID</dt>
              <dd>{committeeId || "Not set"}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{row?.lastSyncedAt ? row.lastSyncedAt.toLocaleString() : "Never"}</dd>
            </div>
            <div>
              <dt>Credential storage</dt>
              <dd>{encryptionReady ? "Ready" : "Missing ENCRYPTION_KEY"}</dd>
            </div>
          </dl>

          <form className="stacked-form" action={saveExpaIntegration}>
            <label>
              EXPA committee ID
              <input name="committeeId" defaultValue={committeeId} placeholder="1234" required disabled={!canManage} />
            </label>
            <label>
              EXPA access token
              <input
                name="accessToken"
                type="password"
                placeholder={isConnected ? "Leave blank to keep current token" : "Paste access token"}
                disabled={!canManage}
              />
            </label>
            <div className="form-actions">
              <button className="button primary" type="submit" disabled={!canManage}>
                {isConnected ? "Update EXPA" : "Connect EXPA"}
              </button>
            </div>
          </form>

          <form className="credential-action-form" action={connectExpaWithAppCredentials}>
            <div>
              <strong>Have only the EXPA client ID and secret?</strong>
              <p>Use the server-side app credentials in Vercel to request an EXPA access token, then store that token encrypted.</p>
            </div>
            <label>
              Committee ID
              <input name="committeeId" defaultValue={committeeId} placeholder="1234" required disabled={!canManage} />
            </label>
            <button className="button secondary" type="submit" disabled={!canManage || !appCredentialsReady}>
              Connect with app credentials
            </button>
          </form>

          {isConnected && (
            <div className="integration-actions">
              <form action={testExpaIntegration}>
                <button className="button secondary" type="submit" disabled={!canManage}>Test connection</button>
              </form>
              <form action={disconnectExpaIntegration}>
                <button className="button ghost danger" type="submit" disabled={!canManage}>
                  <Unplug size={15} /> Disconnect
                </button>
              </form>
            </div>
          )}

          {!appCredentialsReady && <p className="muted-note">Add EXPA_CLIENT_ID and EXPA_CLIENT_SECRET in Vercel to use app credential connection.</p>}
          {!canManage && <p className="muted-note">Ask an owner or admin to manage integration credentials.</p>}
        </article>

        <article className="card compact-card">
          <h2>Next Systems</h2>
          {["Mailgun email sending", "Meta inbox and publishing", "Notion document sync", "Google Drive assets"].map((item) => (
            <div className="scope-row" key={item}>
              <CheckCircle2 size={14} />
              <span>{item}</span>
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}

function StatusPill({ status, connected }: { status: "connected" | "disconnected" | "error"; connected: boolean }) {
  if (!connected) return <span className="status-pill">Disconnected</span>;
  if (status === "error") {
    return (
      <span className="status-pill error">
        <CircleAlert size={13} /> Error
      </span>
    );
  }

  return (
    <span className="status-pill success">
      <CheckCircle2 size={13} /> Connected
    </span>
  );
}
