import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { Activity, ArrowRight, BarChart3, Users } from "lucide-react";
import type { ReactNode } from "react";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";

export default async function ExpaPage() {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  const [integration] = await db
    .select({
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncedAt: schema.integrations.lastSyncedAt
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.lcId, activeMembership.lcId), eq(schema.integrations.provider, "expa")))
    .limit(1);

  const config = integration?.config as { committeeId?: string } | undefined;
  const connected = integration?.status === "connected";

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">EXPA Analytics</span>
          <h1>EXPA performance</h1>
          <p>Track the LC funnel once EXPA is connected and sync jobs begin importing people, opportunities, and applications.</p>
        </div>
        <div className="heading-actions">
          <span className="sync-chip"><span /> {connected ? `Connected · ${formatDate(integration.lastSyncedAt)}` : "EXPA not connected"}</span>
          <a className="button primary" href="/integrations">{connected ? "Manage EXPA" : "Connect EXPA"}</a>
        </div>
      </section>

      {!connected && (
        <article className="card empty-state-card">
          <Activity size={24} />
          <div>
            <h2>Connect EXPA to activate this page</h2>
            <p>The dashboard shell is ready. Add your committee ID and EXPA access token from Integrations first.</p>
          </div>
          <a className="button secondary" href="/integrations">Open integrations <ArrowRight size={14} /></a>
        </article>
      )}

      <section className="kpi-grid">
        <MetricCard icon={<Users size={18} />} label="People synced" value="0" note="Waiting for sync worker" />
        <MetricCard icon={<BarChart3 size={18} />} label="Applications" value="0" note="EXPA applications endpoint ready" />
        <MetricCard icon={<Activity size={18} />} label="Opportunities" value="0" note="EXPA opportunities endpoint ready" />
        <MetricCard icon={<Activity size={18} />} label="Committee ID" value={config?.committeeId ?? "None"} note="Stored per LC" />
      </section>

      <section className="dashboard-grid">
        <article className="card chart-card">
          <div className="card-header">
            <div>
              <h2>Funnel sync plan</h2>
              <p className="muted-note">These stages are wired for real data once scheduled sync jobs are added.</p>
            </div>
          </div>
          <div className="funnel-bars">
            {[
              ["People", "0", "18%"],
              ["Applied", "0", "18%"],
              ["Accepted", "0", "18%"],
              ["Approved", "0", "18%"],
              ["Realized", "0", "18%"]
            ].map(([label, value, width]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <em style={{ width }} />
              </div>
            ))}
          </div>
        </article>
        <article className="card compact-card">
          <h2>Implemented Boundary</h2>
          {["/v2/people", "/v2/opportunities", "/v2/applications", "/v2/committees/{id}", "/v2/opportunities/stats"].map((item) => (
            <div className="scope-row" key={item}>
              <span>{item}</span>
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="card kpi-card">
      <div>
        <span className="eyebrow">{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function formatDate(value: Date | null) {
  if (!value) return "not tested";
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
