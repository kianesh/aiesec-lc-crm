import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { ChevronRight, FileText, Instagram, Mail, PlugZap, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getServerEnv } from "../../../lib/env";
import { StatusPill } from "./status-pill";

export const dynamic = "force-dynamic";

type SearchParams = { saved?: string; tested?: string; disconnected?: string; synced?: string; count?: string; error?: string };

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

const syncedLabel: Record<string, string> = {
  google_contacts: "Imported contacts from Google",
  notion_push: "Pushed contacts to Notion",
  notion_pull: "Imported contacts from Notion",
  instagram_conversations: "Synced Instagram conversations"
};

const CATALOG: Array<{ key: string; name: string; desc: string; icon: LucideIcon }> = [
  { key: "expa", name: "EXPA", desc: "Analytics, funnel data, and contact sync from the AIESEC platform.", icon: PlugZap },
  { key: "google", name: "Google Workspace", desc: "Calendar + Meet for booking, Forms responses, Gmail send, contacts.", icon: Mail },
  { key: "notion", name: "Notion", desc: "Two-way contact sync with a shared Notion database.", icon: FileText },
  { key: "instagram", name: "Instagram", desc: "Pull DMs into the inbox, reply, and publish posts.", icon: Instagram },
  { key: "resend", name: "Resend", desc: "Transactional & marketing email delivery + open/bounce tracking.", icon: Send }
];

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  const env = getServerEnv();

  const connectors = await db
    .select({ provider: schema.integrations.provider, status: schema.integrations.status })
    .from(schema.integrations)
    .where(eq(schema.integrations.lcId, activeMembership.lcId));

  const statusFor = (key: string): "connected" | "disconnected" | "error" => {
    if (key === "expa") return (connectors.find((c) => c.provider === "expa")?.status as never) ?? "disconnected";
    if (key === "google") return connectors.find((c) => c.provider === "google_drive") ? "connected" : "disconnected";
    if (key === "notion") return connectors.find((c) => c.provider === "notion") ? "connected" : "disconnected";
    if (key === "instagram") return connectors.find((c) => c.provider === "meta") ? "connected" : "disconnected";
    if (key === "resend") return env.RESEND_API_KEY ? "connected" : "disconnected";
    return "disconnected";
  };

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

      {searchParams.saved && <p className="success-note page-note">{searchParams.saved} connected.</p>}
      {searchParams.tested && <p className="success-note page-note">EXPA connection test succeeded.</p>}
      {searchParams.disconnected && <p className="success-note page-note">{searchParams.disconnected} disconnected.</p>}
      {searchParams.synced && (
        <p className="success-note page-note">
          {syncedLabel[searchParams.synced] ?? "Sync complete"}
          {searchParams.count ? ` — ${searchParams.count} record(s).` : "."}
        </p>
      )}
      {error && <p className="form-error page-note">{error}</p>}

      <div className="integration-tiles">
        {CATALOG.map((item) => {
          const status = statusFor(item.key);
          const Icon = item.icon;
          return (
            <Link key={item.key} href={`/integrations/${item.key}`} className="card integration-tile">
              <span className="integration-icon"><Icon size={20} /></span>
              <div className="integration-tile-body">
                <div className="integration-tile-head">
                  <h2>{item.name}</h2>
                  <StatusPill status={status} />
                </div>
                <p>{item.desc}</p>
              </div>
              <ChevronRight size={18} className="integration-tile-arrow" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
