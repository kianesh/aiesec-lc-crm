import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, CalendarClock, FileText, Instagram, Mail, PlugZap, Plus, Send, Trash2, Unplug } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { getServerEnv } from "../../../../lib/env";
import { getSiteUrl } from "../../../../lib/site-url";
import { hasEncryptionKey } from "../../../../lib/secret-crypto";
import { getGoogleAccessToken, getGoogleForm, listGoogleFormResponses } from "../../../../lib/connectors/google";
import { connectExpaWithAppCredentials, disconnectExpaIntegration, saveExpaIntegration, testExpaIntegration } from "../actions";
import {
  disconnectGoogle,
  disconnectInstagram,
  disconnectNotion,
  importGoogleFormResponses,
  pullFromNotion,
  pushToNotion,
  removeGoogleForm,
  saveGoogleForm,
  syncInstagramConversations
} from "../connector-actions";
import { StatusPill } from "../status-pill";

export const dynamic = "force-dynamic";

const PROVIDERS = ["expa", "google", "notion", "instagram", "resend"] as const;
type Provider = (typeof PROVIDERS)[number];

const META: Record<Provider, { name: string; icon: typeof Mail; desc: string }> = {
  expa: { name: "EXPA", icon: PlugZap, desc: "Analytics, funnel data, and contact sync from the AIESEC platform." },
  google: { name: "Google Workspace", icon: Mail, desc: "Calendar + Meet for booking, Forms responses, Gmail send." },
  notion: { name: "Notion", icon: FileText, desc: "Two-way contact sync with a shared Notion database." },
  instagram: { name: "Instagram", icon: Instagram, desc: "Pull DMs into the inbox, reply, and publish posts." },
  resend: { name: "Resend", icon: Send, desc: "Transactional & marketing email delivery + open/bounce tracking." }
};

const errorMessages: Record<string, string> = {
  not_allowed: "Only owners and admins can manage integrations.",
  encryption_key_missing: "Set ENCRYPTION_KEY in Vercel before storing credentials.",
  missing_form: "Paste a Google Form link or ID.",
  not_connected: "Connect Google before tracking a form.",
  google_not_configured: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel before connecting.",
  notion_not_configured: "Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in Vercel before connecting.",
  instagram_not_configured: "Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Vercel before connecting.",
  missing_expa_token: "Paste an EXPA access token the first time you connect.",
  missing_expa_committee: "Add an EXPA committee ID before testing.",
  missing_expa_connection: "Connect EXPA before testing it."
};

export default async function IntegrationDetailPage({
  params,
  searchParams
}: {
  params: { provider: string };
  searchParams: { saved?: string; tested?: string; synced?: string; count?: string; error?: string };
}) {
  if (!PROVIDERS.includes(params.provider as Provider)) notFound();
  const provider = params.provider as Provider;
  const { activeMembership } = await requireMembership();
  const canManage = activeMembership.role !== "member";
  const db = getDb();
  const env = getServerEnv();
  const meta = META[provider];
  const Icon = meta.icon;

  const connectors = await db
    .select({
      provider: schema.integrations.provider,
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncedAt: schema.integrations.lastSyncedAt
    })
    .from(schema.integrations)
    .where(eq(schema.integrations.lcId, activeMembership.lcId));

  const error = searchParams.error ? errorMessages[searchParams.error] ?? searchParams.error : null;

  return (
    <div className="content">
      <Link href="/integrations" className="button ghost" style={{ marginBottom: 16, display: "inline-flex" }}>
        <ArrowLeft size={14} /> All integrations
      </Link>

      <section className="page-heading">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="integration-icon" style={{ width: 48, height: 48 }}><Icon size={22} /></span>
          <div>
            <h1 style={{ fontSize: 26 }}>{meta.name}</h1>
            <p>{meta.desc}</p>
          </div>
        </div>
      </section>

      {searchParams.saved && <p className="success-note page-note">Saved.</p>}
      {searchParams.tested && <p className="success-note page-note">Connection test succeeded.</p>}
      {searchParams.synced && <p className="success-note page-note">Synced{searchParams.count ? ` — ${searchParams.count} record(s).` : "."}</p>}
      {error && <p className="form-error page-note">{error}</p>}
      {!canManage && <p className="muted-note">Ask an owner or admin to manage integration credentials.</p>}

      {provider === "expa" && await renderExpa(db, activeMembership.lcId, canManage)}
      {provider === "google" && await renderGoogle(db, activeMembership.lcId, connectors, env, canManage)}
      {provider === "notion" && renderNotion(connectors, env, canManage)}
      {provider === "instagram" && renderInstagram(connectors, env, canManage)}
      {provider === "resend" && renderResend(env)}
    </div>
  );
}

// ---- EXPA --------------------------------------------------------------- //
async function renderExpa(db: ReturnType<typeof getDb>, lcId: string, canManage: boolean) {
  const [row] = await db
    .select({
      integrationId: schema.integrations.id,
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncedAt: schema.integrations.lastSyncedAt,
      lcCommitteeId: schema.localCommittees.expaCommitteeId
    })
    .from(schema.localCommittees)
    .leftJoin(schema.integrations, and(eq(schema.integrations.lcId, schema.localCommittees.id), eq(schema.integrations.provider, "expa")))
    .where(eq(schema.localCommittees.id, lcId))
    .limit(1);

  const committeeId = (row?.config as { committeeId?: string } | null)?.committeeId ?? row?.lcCommitteeId ?? "";
  const isConnected = Boolean(row?.integrationId);
  const env = getServerEnv();
  const appReady = Boolean(env.EXPA_CLIENT_ID && env.EXPA_CLIENT_SECRET);

  return (
    <article className="card" style={{ padding: 24 }}>
      <div className="integration-card-header" style={{ marginBottom: 16 }}>
        <strong>Connection</strong>
        <StatusPill status={(row?.status as never) ?? "disconnected"} />
      </div>
      <dl className="integration-meta">
        <div><dt>Committee ID</dt><dd>{committeeId || "Not set"}</dd></div>
        <div><dt>Last checked</dt><dd>{row?.lastSyncedAt ? row.lastSyncedAt.toLocaleString() : "Never"}</dd></div>
        <div><dt>Credential storage</dt><dd>{hasEncryptionKey() ? "Ready" : "Missing ENCRYPTION_KEY"}</dd></div>
      </dl>

      <form className="stacked-form" action={saveExpaIntegration}>
        <label>EXPA committee ID<input name="committeeId" defaultValue={committeeId} placeholder="1234" required disabled={!canManage} /></label>
        <label>EXPA access token<input name="accessToken" type="password" placeholder={isConnected ? "Leave blank to keep current token" : "Paste access token"} disabled={!canManage} /></label>
        <div className="form-actions"><button className="button primary" type="submit" disabled={!canManage}>{isConnected ? "Update EXPA" : "Connect EXPA"}</button></div>
      </form>

      <form className="credential-action-form" action={connectExpaWithAppCredentials}>
        <div>
          <strong>Have only the EXPA client ID and secret?</strong>
          <p>Use the server-side app credentials in Vercel to request a token, then store it encrypted.</p>
        </div>
        <label>Committee ID<input name="committeeId" defaultValue={committeeId} placeholder="1234" required disabled={!canManage} /></label>
        <button className="button secondary" type="submit" disabled={!canManage || !appReady}>Connect with app credentials</button>
      </form>

      {isConnected && (
        <div className="integration-actions">
          <form action={testExpaIntegration}><button className="button secondary" type="submit" disabled={!canManage}>Test connection</button></form>
          <form action={disconnectExpaIntegration}><button className="button ghost danger" type="submit" disabled={!canManage}><Unplug size={15} /> Disconnect</button></form>
        </div>
      )}
      {!appReady && <p className="muted-note">Add EXPA_CLIENT_ID and EXPA_CLIENT_SECRET in Vercel to use app-credential connection.</p>}
    </article>
  );
}

// ---- Google (incl. Forms) ---------------------------------------------- //
async function renderGoogle(
  db: ReturnType<typeof getDb>,
  lcId: string,
  connectors: { provider: string; status: string; config: unknown; lastSyncedAt: Date | null }[],
  env: ReturnType<typeof getServerEnv>,
  canManage: boolean
) {
  const google = connectors.find((c) => c.provider === "google_drive");
  const config = (google?.config ?? {}) as { email?: string; forms?: { id: string; title: string }[] };
  const ready = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const forms = config.forms ?? [];

  // Best-effort: fetch recent responses for each tracked form.
  const formData: Array<{ id: string; title: string; rows: { responseId: string; answers: Record<string, string> }[]; error?: boolean }> = [];
  if (google && forms.length) {
    try {
      const token = await getGoogleAccessToken(db, lcId);
      for (const f of forms) {
        try {
          const form = await getGoogleForm(token, f.id);
          const responses = await listGoogleFormResponses(token, form);
          formData.push({ id: f.id, title: form.title, rows: responses.slice(-8).reverse() });
        } catch {
          formData.push({ id: f.id, title: f.title, rows: [], error: true });
        }
      }
    } catch {
      for (const f of forms) formData.push({ id: f.id, title: f.title, rows: [], error: true });
    }
  }

  return (
    <>
      <article className="card" style={{ padding: 24 }}>
        <div className="integration-card-header" style={{ marginBottom: 16 }}>
          <strong>Connection</strong>
          <StatusPill status={google ? "connected" : "disconnected"} />
        </div>
        <dl className="integration-meta">
          <div><dt>Account</dt><dd>{config.email ?? "Not connected"}</dd></div>
          <div><dt>Last synced</dt><dd>{google?.lastSyncedAt ? google.lastSyncedAt.toLocaleString() : "Never"}</dd></div>
        </dl>
        {!google ? (
          <div className="form-actions"><a className="button primary" href="/api/integrations/google/start" aria-disabled={!canManage || !ready}>Connect Google</a></div>
        ) : (
          <div className="integration-actions">
            <form action={disconnectGoogle}><button className="button ghost danger" type="submit" disabled={!canManage}><Unplug size={15} /> Disconnect</button></form>
          </div>
        )}
        <p className="muted-note" style={{ marginTop: 12 }}>
          <CalendarClock size={13} style={{ verticalAlign: "-2px" }} /> The connected account powers the Appointments booking page — calendar events, Google Meet links, and availability.
        </p>
        {!ready && <p className="muted-note">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, and register &lt;site&gt;/api/integrations/google/callback as an authorized redirect URI.</p>}
      </article>

      {google && (
        <section style={{ marginTop: 20 }}>
          <span className="eyebrow">Google Forms — interest submissions</span>
          <article className="card" style={{ padding: 24, marginTop: 8 }}>
            <form action={saveGoogleForm} className="form-inline">
              <input name="formId" placeholder="Paste a Google Form link or ID (from your Linktree form)" disabled={!canManage} />
              <button className="button primary" type="submit" disabled={!canManage}><Plus size={14} /> Track form</button>
            </form>
            {forms.length === 0 && <p className="muted-note" style={{ marginTop: 12 }}>Track your interest form to pull submissions into Contacts. Each response can be imported as a candidate.</p>}
          </article>

          {formData.map((f) => {
            const importWithId = importGoogleFormResponses.bind(null, f.id);
            const removeWithId = removeGoogleForm.bind(null, f.id);
            const cols = f.rows.length ? Object.keys(f.rows[0].answers).slice(0, 4) : [];
            return (
              <article className="card" style={{ padding: 20, marginTop: 12 }} key={f.id}>
                <div className="integration-card-header" style={{ marginBottom: 12 }}>
                  <strong>{f.title}</strong>
                  <div className="integration-actions" style={{ marginTop: 0 }}>
                    <form action={importWithId}><button className="button secondary" type="submit" disabled={!canManage}>Import to contacts</button></form>
                    <form action={removeWithId}><button className="button ghost danger" type="submit" disabled={!canManage}><Trash2 size={14} /></button></form>
                  </div>
                </div>
                {f.error ? (
                  <p className="muted-note">Couldn’t load responses. Reconnect Google (the Forms permission may be new) and try again.</p>
                ) : f.rows.length === 0 ? (
                  <p className="muted-note">No responses yet.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                      <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>
                        {f.rows.map((r) => (
                          <tr key={r.responseId}>{cols.map((c) => <td key={c}>{r.answers[c] || <span className="muted-note">—</span>}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

// ---- Notion ------------------------------------------------------------- //
function renderNotion(
  connectors: { provider: string; status: string; config: unknown; lastSyncedAt: Date | null }[],
  env: ReturnType<typeof getServerEnv>,
  canManage: boolean
) {
  const notion = connectors.find((c) => c.provider === "notion");
  const config = (notion?.config ?? {}) as { workspaceName?: string; databaseTitle?: string };
  const ready = Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
  return (
    <article className="card" style={{ padding: 24 }}>
      <div className="integration-card-header" style={{ marginBottom: 16 }}>
        <strong>Connection</strong>
        <StatusPill status={notion ? "connected" : "disconnected"} />
      </div>
      <dl className="integration-meta">
        <div><dt>Workspace</dt><dd>{config.workspaceName ?? "Not connected"}</dd></div>
        <div><dt>Database</dt><dd>{config.databaseTitle ?? "None shared"}</dd></div>
        <div><dt>Last synced</dt><dd>{notion?.lastSyncedAt ? notion.lastSyncedAt.toLocaleString() : "Never"}</dd></div>
      </dl>
      {!notion ? (
        <div className="form-actions"><a className="button primary" href="/api/integrations/notion/start" aria-disabled={!canManage || !ready}>Connect Notion</a></div>
      ) : (
        <div className="integration-actions">
          <form action={pushToNotion}><button className="button secondary" type="submit" disabled={!canManage}>Push to Notion</button></form>
          <form action={pullFromNotion}><button className="button secondary" type="submit" disabled={!canManage}>Pull from Notion</button></form>
          <form action={disconnectNotion}><button className="button ghost danger" type="submit" disabled={!canManage}><Unplug size={15} /> Disconnect</button></form>
        </div>
      )}
      {!ready && <p className="muted-note">Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in Vercel, and register &lt;site&gt;/api/integrations/notion/callback as the redirect URI.</p>}
      {notion && !config.databaseTitle && <p className="muted-note">No database detected. Share a database with the integration in Notion, then reconnect.</p>}
    </article>
  );
}

// ---- Instagram ---------------------------------------------------------- //
function renderInstagram(
  connectors: { provider: string; status: string; config: unknown; lastSyncedAt: Date | null }[],
  env: ReturnType<typeof getServerEnv>,
  canManage: boolean
) {
  const instagram = connectors.find((c) => c.provider === "meta");
  const config = (instagram?.config ?? {}) as { username?: string };
  const ready = Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
  // The EXACT redirect_uri the connect flow sends to Instagram. It must be
  // registered byte-for-byte (Instagram → API setup with Instagram login →
  // Business login settings → Valid OAuth Redirect URIs).
  const redirectUri = `${getSiteUrl()}/api/integrations/instagram/callback`;
  return (
    <article className="card" style={{ padding: 24 }}>
      <div className="integration-card-header" style={{ marginBottom: 16 }}>
        <strong>Connection</strong>
        <StatusPill status={instagram ? "connected" : "disconnected"} />
      </div>
      <dl className="integration-meta">
        <div><dt>Account</dt><dd>{config.username ? `@${config.username}` : "Not connected"}</dd></div>
        <div><dt>Last synced</dt><dd>{instagram?.lastSyncedAt ? instagram.lastSyncedAt.toLocaleString() : "Never"}</dd></div>
      </dl>
      {!instagram ? (
        <div className="form-actions"><a className="button primary" href="/api/integrations/instagram/start" aria-disabled={!canManage || !ready}>Connect Instagram</a></div>
      ) : (
        <div className="integration-actions">
          <form action={syncInstagramConversations}><button className="button secondary" type="submit" disabled={!canManage}>Sync conversations</button></form>
          <form action={disconnectInstagram}><button className="button ghost danger" type="submit" disabled={!canManage}><Unplug size={15} /> Disconnect</button></form>
        </div>
      )}
      <div className="redirect-uri-box">
        <span className="eyebrow">Redirect URI — register this exact value</span>
        <code>{redirectUri}</code>
        <p className="muted-note">
          Paste it under <strong>App → Instagram → API setup with Instagram login → Business login settings →
          Valid OAuth Redirect URIs</strong> (not the Facebook Login field). It must match exactly — https, no trailing slash.
        </p>
      </div>
      {!ready && <p className="muted-note">Add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Vercel first.</p>}
    </article>
  );
}

// ---- Resend (env-configured) ------------------------------------------- //
function renderResend(env: ReturnType<typeof getServerEnv>) {
  const ready = Boolean(env.RESEND_API_KEY);
  return (
    <article className="card" style={{ padding: 24 }}>
      <div className="integration-card-header" style={{ marginBottom: 16 }}>
        <strong>Configuration</strong>
        <StatusPill status={ready ? "connected" : "disconnected"} />
      </div>
      <dl className="integration-meta">
        <div><dt>API key</dt><dd>{ready ? "Set" : "Missing RESEND_API_KEY"}</dd></div>
        <div><dt>Default sender</dt><dd>{env.RESEND_FROM_EMAIL ?? "Not set"}</dd></div>
        <div><dt>Delivery webhook</dt><dd>{env.RESEND_WEBHOOK_SECRET ? "Verified" : "Not configured"}</dd></div>
      </dl>
      <p className="muted-note">
        Resend is configured via environment variables (server-side): set <code>RESEND_API_KEY</code>, a verified
        <code> RESEND_FROM_EMAIL</code>, and optionally <code>RESEND_WEBHOOK_SECRET</code> for open/bounce tracking.
        Send email from the <Link href="/email" className="dash-link">Email</Link> hub.
      </p>
    </article>
  );
}
