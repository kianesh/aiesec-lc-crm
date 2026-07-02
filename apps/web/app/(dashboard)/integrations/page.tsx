import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, CircleAlert, FileText, Instagram, Mail, PlugZap, Unplug } from "lucide-react";
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
import {
  disconnectGoogle,
  disconnectInstagram,
  disconnectNotion,
  importGoogleContacts,
  pullFromNotion,
  pushToNotion,
  syncInstagramConversations
} from "./connector-actions";

type SearchParams = {
  saved?: string;
  tested?: string;
  disconnected?: string;
  synced?: string;
  count?: string;
  error?: string;
};

const errorMessages: Record<string, string> = {
  encryption_key_missing: "Set ENCRYPTION_KEY in Vercel before storing EXPA credentials.",
  missing_expa_token: "Paste an EXPA access token the first time you connect.",
  missing_expa_connection: "Connect EXPA before testing it.",
  missing_expa_committee: "Add an EXPA committee ID before testing.",
  missing_expa_app_credentials: "Set EXPA_CLIENT_ID and EXPA_CLIENT_SECRET in Vercel before using app credentials.",
  google_not_configured: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel before connecting Google.",
  notion_not_configured: "Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in Vercel before connecting Notion.",
  instagram_not_configured: "Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Vercel before connecting Instagram.",
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

  // Google + Notion connector state
  const connectors = await db
    .select({
      provider: schema.integrations.provider,
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncedAt: schema.integrations.lastSyncedAt
    })
    .from(schema.integrations)
    .where(eq(schema.integrations.lcId, activeMembership.lcId));

  const google = connectors.find((c) => c.provider === "google_drive");
  const notion = connectors.find((c) => c.provider === "notion");
  const instagram = connectors.find((c) => c.provider === "meta");
  const googleConfig = (google?.config ?? {}) as { email?: string };
  const notionConfig = (notion?.config ?? {}) as { workspaceName?: string; databaseTitle?: string };
  const instagramConfig = (instagram?.config ?? {}) as { username?: string; platform?: string };
  const googleReady = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const notionReady = Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
  const instagramReady = Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);

  const syncedLabel: Record<string, string> = {
    google_contacts: "Imported contacts from Google",
    notion_push: "Pushed contacts to Notion",
    notion_pull: "Imported contacts from Notion",
    instagram_conversations: "Synced Instagram conversations"
  };

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Connections</span>
          <h1>Integrations</h1>
          <p>Connect LC-scoped systems and keep credentials encrypted on the server.</p>
        </div>
      </section>

      {searchParams.saved === "expa" && <p className="success-note page-note">EXPA settings saved.</p>}
      {searchParams.saved === "google" && <p className="success-note page-note">Google Workspace connected.</p>}
      {searchParams.saved === "notion" && <p className="success-note page-note">Notion connected.</p>}
      {searchParams.saved === "instagram" && <p className="success-note page-note">Instagram connected.</p>}
      {searchParams.tested && <p className="success-note page-note">EXPA connection test succeeded.</p>}
      {searchParams.disconnected && <p className="success-note page-note">{searchParams.disconnected} disconnected.</p>}
      {searchParams.synced && (
        <p className="success-note page-note">
          {syncedLabel[searchParams.synced] ?? "Sync complete"}
          {searchParams.count ? ` — ${searchParams.count} record(s).` : "."}
        </p>
      )}
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

        {/* Google Workspace connector */}
        <article className="card integration-card">
          <div className="integration-card-header">
            <span className="integration-icon"><Mail size={20} /></span>
            <div>
              <h2>Google Workspace</h2>
              <p>Gmail send, Drive attachments, Contacts import, and Calendar events.</p>
            </div>
            <StatusPill status={(google?.status as never) ?? "disconnected"} connected={Boolean(google)} />
          </div>

          <dl className="integration-meta">
            <div>
              <dt>Account</dt>
              <dd>{googleConfig.email ?? "Not connected"}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{google?.lastSyncedAt ? google.lastSyncedAt.toLocaleString() : "Never"}</dd>
            </div>
          </dl>

          {!google ? (
            <div className="form-actions">
              <a className="button primary" href="/api/integrations/google/start" aria-disabled={!canManage || !googleReady}>
                Connect Google
              </a>
            </div>
          ) : (
            <div className="integration-actions">
              <form action={importGoogleContacts}>
                <button className="button secondary" type="submit" disabled={!canManage}>Import contacts</button>
              </form>
              <form action={disconnectGoogle}>
                <button className="button ghost danger" type="submit" disabled={!canManage}>
                  <Unplug size={15} /> Disconnect
                </button>
              </form>
            </div>
          )}
          {!googleReady && <p className="muted-note">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, and register {`${"<site>"}/api/integrations/google/callback`} as an authorized redirect URI.</p>}
        </article>

        {/* Notion connector */}
        <article className="card integration-card">
          <div className="integration-card-header">
            <span className="integration-icon"><FileText size={20} /></span>
            <div>
              <h2>Notion</h2>
              <p>Two-way contact sync with a shared Notion database.</p>
            </div>
            <StatusPill status={(notion?.status as never) ?? "disconnected"} connected={Boolean(notion)} />
          </div>

          <dl className="integration-meta">
            <div>
              <dt>Workspace</dt>
              <dd>{notionConfig.workspaceName ?? "Not connected"}</dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>{notionConfig.databaseTitle ?? "None shared"}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{notion?.lastSyncedAt ? notion.lastSyncedAt.toLocaleString() : "Never"}</dd>
            </div>
          </dl>

          {!notion ? (
            <div className="form-actions">
              <a className="button primary" href="/api/integrations/notion/start" aria-disabled={!canManage || !notionReady}>
                Connect Notion
              </a>
            </div>
          ) : (
            <div className="integration-actions">
              <form action={pushToNotion}>
                <button className="button secondary" type="submit" disabled={!canManage}>Push to Notion</button>
              </form>
              <form action={pullFromNotion}>
                <button className="button secondary" type="submit" disabled={!canManage}>Pull from Notion</button>
              </form>
              <form action={disconnectNotion}>
                <button className="button ghost danger" type="submit" disabled={!canManage}>
                  <Unplug size={15} /> Disconnect
                </button>
              </form>
            </div>
          )}
          {!notionReady && <p className="muted-note">Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in Vercel, and register {`${"<site>"}/api/integrations/notion/callback`} as the redirect URI.</p>}
          {notion && !notionConfig.databaseTitle && (
            <p className="muted-note">No database detected. In Notion, share a database with this integration, then reconnect.</p>
          )}
        </article>

        {/* Instagram connector (Instagram API with Instagram Login) */}
        <article className="card integration-card">
          <div className="integration-card-header">
            <span className="integration-icon"><Instagram size={20} /></span>
            <div>
              <h2>Instagram</h2>
              <p>Pull DMs into the inbox, reply from the CRM, and publish posts.</p>
            </div>
            <StatusPill status={(instagram?.status as never) ?? "disconnected"} connected={Boolean(instagram)} />
          </div>

          <dl className="integration-meta">
            <div>
              <dt>Account</dt>
              <dd>{instagramConfig.username ? `@${instagramConfig.username}` : "Not connected"}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{instagram?.lastSyncedAt ? instagram.lastSyncedAt.toLocaleString() : "Never"}</dd>
            </div>
          </dl>

          {!instagram ? (
            <div className="form-actions">
              <a className="button primary" href="/api/integrations/instagram/start" aria-disabled={!canManage || !instagramReady}>
                Connect Instagram
              </a>
            </div>
          ) : (
            <div className="integration-actions">
              <form action={syncInstagramConversations}>
                <button className="button secondary" type="submit" disabled={!canManage}>Sync conversations</button>
              </form>
              <form action={disconnectInstagram}>
                <button className="button ghost danger" type="submit" disabled={!canManage}>
                  <Unplug size={15} /> Disconnect
                </button>
              </form>
            </div>
          )}
          {!instagramReady && (
            <p className="muted-note">
              Add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Vercel, and register
              {` <site>/api/integrations/instagram/callback`} as an OAuth redirect URI in your Meta app.
            </p>
          )}
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
