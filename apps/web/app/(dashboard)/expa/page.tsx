import { schema } from "@aiesec/db";
import { and, desc, eq } from "drizzle-orm";
import { Activity, ArrowRight, BarChart3, RefreshCw, Users } from "lucide-react";
import type { ReactNode } from "react";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { syncExpaAnalytics } from "./actions";

type SearchParams = {
  synced?: "success" | "partial";
  error?: string;
};

type SnapshotSummary = {
  periodStart?: string;
  periodEnd?: string;
  committeeId?: string;
  funnel?: Record<string, number>;
  errors?: string[];
};

const errorMessages: Record<string, string> = {
  missing_expa_connection: "Connect EXPA before syncing analytics.",
  missing_expa_committee: "Add an EXPA committee ID before syncing analytics.",
  not_allowed: "Only owners and admins can sync EXPA analytics."
};

const funnelStages = [
  ["sign_up", "Sign ups"],
  ["applied", "Applied"],
  ["matched", "Matched"],
  ["approved", "Approved"],
  ["realized", "Realized"],
  ["finished", "Finished"],
  ["completed", "Completed"]
] as const;

export default async function ExpaPage({ searchParams }: { searchParams: SearchParams }) {
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
  const [snapshot] = await db
    .select({
      summary: schema.expaAnalyticsSnapshots.summary,
      createdAt: schema.expaAnalyticsSnapshots.createdAt,
      periodStart: schema.expaAnalyticsSnapshots.periodStart,
      periodEnd: schema.expaAnalyticsSnapshots.periodEnd
    })
    .from(schema.expaAnalyticsSnapshots)
    .where(eq(schema.expaAnalyticsSnapshots.lcId, activeMembership.lcId))
    .orderBy(desc(schema.expaAnalyticsSnapshots.createdAt))
    .limit(1);

  const config = integration?.config as { committeeId?: string } | undefined;
  const summary = snapshot?.summary as SnapshotSummary | undefined;
  const funnel = summary?.funnel ?? {};
  const connected = Boolean(integration);
  const maxFunnelValue = Math.max(1, ...funnelStages.map(([key]) => funnel[key] ?? 0));
  const defaultStartDate = toDateInput(addDays(new Date(), -90));
  const defaultEndDate = toDateInput(new Date());
  const error = searchParams.error ? errorMessages[searchParams.error] ?? searchParams.error : null;

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">EXPA Analytics</span>
          <h1>EXPA performance</h1>
          <p>Sync EXPA analytics snapshots, then track funnel movement by LC and period.</p>
        </div>
        <div className="heading-actions">
          <span className="sync-chip"><span /> {connected ? `${integration.status} · ${formatDate(integration.lastSyncedAt)}` : "EXPA not connected"}</span>
          <a className="button secondary" href="/integrations">{connected ? "Manage EXPA" : "Connect EXPA"}</a>
        </div>
      </section>

      {searchParams.synced === "success" && <p className="success-note page-note">EXPA analytics synced.</p>}
      {searchParams.synced === "partial" && <p className="form-error page-note">EXPA sync completed with API errors. The available data was saved.</p>}
      {error && <p className="form-error page-note">{error}</p>}

      {!connected && (
        <article className="card empty-state-card">
          <Activity size={24} />
          <div>
            <h2>Connect EXPA to activate this page</h2>
            <p>Add your committee ID and EXPA credentials from Integrations first.</p>
          </div>
          <a className="button secondary" href="/integrations">Open integrations <ArrowRight size={14} /></a>
        </article>
      )}

      <section className="expa-control-grid">
        <article className="card compact-card">
          <h2>Manual analytics sync</h2>
          <p className="muted-note">Pulls conversion and historical analytics from EXPA and stores a snapshot for the LC.</p>
          <form className="stacked-form expa-sync-form" action={syncExpaAnalytics}>
            <label>
              Start date
              <input name="startDate" type="date" defaultValue={defaultStartDate} disabled={!connected} />
            </label>
            <label>
              End date
              <input name="endDate" type="date" defaultValue={defaultEndDate} disabled={!connected} />
            </label>
            <button className="button primary" type="submit" disabled={!connected}>
              <RefreshCw size={14} /> Sync EXPA
            </button>
          </form>
        </article>

        <article className="card compact-card">
          <h2>Latest snapshot</h2>
          <div className="scope-row">
            <span>Committee</span>
            <strong>{summary?.committeeId ?? config?.committeeId ?? "Not set"}</strong>
          </div>
          <div className="scope-row">
            <span>Period</span>
            <strong>{snapshot ? `${formatDate(snapshot.periodStart)} - ${formatDate(snapshot.periodEnd)}` : "No snapshot"}</strong>
          </div>
          <div className="scope-row">
            <span>Saved</span>
            <strong>{snapshot ? snapshot.createdAt.toLocaleString() : "Never"}</strong>
          </div>
        </article>
      </section>

      <section className="kpi-grid">
        <MetricCard icon={<Users size={18} />} label="Sign ups" value={String(funnel.sign_up ?? 0)} note="EXPA conversion snapshot" />
        <MetricCard icon={<BarChart3 size={18} />} label="Applications" value={String(funnel.applied ?? 0)} note="Applied in selected period" />
        <MetricCard icon={<Activity size={18} />} label="Approvals" value={String(funnel.approved ?? 0)} note="Approved in selected period" />
        <MetricCard icon={<Activity size={18} />} label="Realizations" value={String(funnel.realized ?? 0)} note="Realized in selected period" />
      </section>

      <section className="dashboard-grid">
        <article className="card chart-card">
          <div className="card-header">
            <div>
              <h2>EXPA funnel</h2>
              <p className="muted-note">Bars render from the latest stored snapshot. If values are zero after sync, the EXPA token may not have analytics rights for that stage.</p>
            </div>
          </div>
          <div className="funnel-bars">
            {funnelStages.map(([key, label]) => {
              const value = funnel[key] ?? 0;
              const width = `${Math.max(8, Math.round((value / maxFunnelValue) * 100))}%`;
              return (
                <div key={key}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <em style={{ width }} />
                </div>
              );
            })}
          </div>
        </article>
        <article className="card compact-card">
          <h2>API Coverage</h2>
          {["/v2/applications/analyze", "conversion_v2", "historical", "/v2/people", "/v2/opportunities"].map((item) => (
            <div className="scope-row" key={item}>
              <span>{item}</span>
            </div>
          ))}
          {summary?.errors?.length ? (
            <p className="form-error">Latest sync errors: {summary.errors.join("; ")}</p>
          ) : (
            <p className="success-note">No saved API errors on the latest snapshot.</p>
          )}
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

function formatDate(value: Date | null | undefined) {
  if (!value) return "not synced";
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
