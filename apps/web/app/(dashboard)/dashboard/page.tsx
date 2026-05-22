import { Activity, CalendarDays, Inbox, Mail, PlugZap, Users } from "lucide-react";
import { requireMembership } from "../../../lib/auth";
import { getDashboardData } from "../../../lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { activeMembership } = await requireMembership();
  const data = await getDashboardData(activeMembership.lcId);

  const kpis = [
    { label: "Contacts", value: data.contacts, icon: Users, href: "/contacts" },
    { label: "Unread conversations", value: data.unreadConversations, icon: Inbox, href: "/conversations" },
    { label: "Scheduled posts", value: data.scheduledPosts, icon: CalendarDays, href: "/social" },
    { label: "Sent campaigns", value: data.sentCampaigns, icon: Mail, href: "/email" }
  ];

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Operations Home</span>
          <h1>Dashboard</h1>
          <p>Live LC health from your database and integrations. Empty cards mean there is no synced or created data yet.</p>
        </div>
        <div className="heading-actions">
          <span className="sync-chip"><span /> {data.expaStatus === "connected" ? `EXPA · ${formatSync(data.expaLastSyncedAt)}` : "EXPA · not connected"}</span>
          <a className="button primary" href="/integrations">Connect integrations</a>
        </div>
      </section>

      <section className="kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <a className="card kpi-card" href={kpi.href} key={kpi.label}>
              <div>
                <span className="eyebrow">{kpi.label}</span>
                <Icon size={14} />
              </div>
              <strong>{kpi.value.toLocaleString()}</strong>
              <p>{kpi.value === 0 ? "No records yet" : "From your LC workspace"}</p>
              <span className="sparkline sparkline-blue" />
            </a>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <article className="card placeholder-card">
          <Activity size={22} />
          <h2>EXPA funnel is ready for real sync data</h2>
          <p>
            The EXPA client wrapper now exists under <code>@aiesec/integration-expa</code>. Once OAuth credentials are configured,
            the sync job can write applications, opportunities, and people into this LC.
          </p>
          {data.expaStatus === "connected" ? (
            <a className="button primary" href="/expa">Open EXPA analytics</a>
          ) : (
            <a className="button secondary" href="/integrations">Connect EXPA</a>
          )}
        </article>

        <aside className="right-rail">
          <article className="card compact-card">
            <div className="card-header">
              <h2>Next setup steps</h2>
            </div>
            {[
              "Invite LC teammates from Settings",
              "Connect EXPA from Integrations",
              "Import contacts or wait for EXPA sync"
            ].map((item) => (
              <div className="scope-row" key={item}>
                <PlugZap size={14} />
                <span>{item}</span>
              </div>
            ))}
          </article>
        </aside>
      </section>
    </div>
  );
}

function formatSync(value: Date | null) {
  if (!value) return "connected";
  return `synced ${value.toLocaleDateString()}`;
}
