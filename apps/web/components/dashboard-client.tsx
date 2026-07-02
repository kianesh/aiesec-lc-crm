"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  Inbox,
  LayoutDashboard,
  LineChart,
  Mail,
  Plus,
  Settings2,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "../lib/dashboard-data";

type WidgetId =
  | "kpis"
  | "aiInsights"
  | "pipeline"
  | "recentConversations"
  | "recentContacts"
  | "programmes"
  | "upcomingPosts"
  | "expa"
  | "quickActions";

const DEFAULT_ORDER: WidgetId[] = [
  "kpis",
  "aiInsights",
  "pipeline",
  "recentConversations",
  "recentContacts",
  "programmes",
  "upcomingPosts",
  "expa",
  "quickActions"
];

const WIDGET_META: Record<WidgetId, { title: string; wide?: boolean }> = {
  kpis: { title: "Key metrics", wide: true },
  aiInsights: { title: "AI Insights", wide: true },
  pipeline: { title: "Exchange pipeline", wide: true },
  recentConversations: { title: "Recent conversations" },
  recentContacts: { title: "Recent contacts" },
  programmes: { title: "Programme mix" },
  upcomingPosts: { title: "Upcoming posts" },
  expa: { title: "EXPA snapshot" },
  quickActions: { title: "Quick actions" }
};

const STAGE_LABELS: Record<string, string> = {
  sign_up: "Sign up",
  applied: "Applied",
  matched: "Matched",
  approved: "Approved",
  realized: "Realized",
  finished: "Finished",
  completed: "Completed"
};

const PROGRAMME_LABELS: Record<string, string> = {
  gt: "Global Talent",
  ge: "Global Entrepreneur",
  gv: "Global Volunteer",
  other: "Other"
};

type Layout = { order: WidgetId[]; hidden: WidgetId[] };

function loadLayout(lcId: string): Layout {
  if (typeof window === "undefined") return { order: DEFAULT_ORDER, hidden: [] };
  try {
    const raw = window.localStorage.getItem(`dash:${lcId}`);
    if (!raw) return { order: DEFAULT_ORDER, hidden: [] };
    const parsed = JSON.parse(raw) as Layout;
    // Heal against added/removed widgets across releases.
    const known = new Set(DEFAULT_ORDER);
    const order = parsed.order.filter((id) => known.has(id));
    for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
    const hidden = (parsed.hidden ?? []).filter((id) => known.has(id));
    return { order, hidden };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

export function DashboardClient({ data, lcName }: { data: DashboardData; lcName: string }) {
  const lcKey = lcName;
  const [layout, setLayout] = useState<Layout>({ order: DEFAULT_ORDER, hidden: [] });
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLayout(loadLayout(lcKey));
    setHydrated(true);
  }, [lcKey]);

  function persist(next: Layout) {
    setLayout(next);
    try {
      window.localStorage.setItem(`dash:${lcKey}`, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function toggle(id: WidgetId) {
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter((h) => h !== id)
      : [...layout.hidden, id];
    persist({ ...layout, hidden });
  }

  function move(id: WidgetId, dir: -1 | 1) {
    const order = [...layout.order];
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    persist({ ...layout, order });
  }

  function reset() {
    persist({ order: DEFAULT_ORDER, hidden: [] });
  }

  const visible = useMemo(
    () => layout.order.filter((id) => !layout.hidden.includes(id)),
    [layout]
  );

  // Avoid layout flash before localStorage is read.
  if (!hydrated) return <div className="dash-skeleton" aria-hidden />;

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Operations Home</span>
          <h1>{lcName}</h1>
          <p>Your live LC command center — pipeline, conversations, and content at a glance.</p>
        </div>
        <div className="heading-actions">
          <span className="sync-chip">
            <span /> {data.expaStatus === "connected" ? "EXPA connected" : "EXPA not connected"}
          </span>
          <button
            className={editing ? "button primary" : "button secondary"}
            onClick={() => setEditing((v) => !v)}
            type="button"
          >
            {editing ? (
              <>
                <Check size={15} /> Done
              </>
            ) : (
              <>
                <Settings2 size={15} /> Customize
              </>
            )}
          </button>
        </div>
      </section>

      {editing && (
        <div className="dash-customizer card">
          <div className="dash-customizer-head">
            <strong><LayoutDashboard size={15} /> Customize your dashboard</strong>
            <button className="button ghost" type="button" onClick={reset}>Reset to default</button>
          </div>
          <div className="dash-customizer-list">
            {layout.order.map((id, idx) => {
              const hidden = layout.hidden.includes(id);
              return (
                <div className={`dash-customizer-row${hidden ? " is-hidden" : ""}`} key={id}>
                  <div className="dash-reorder">
                    <button type="button" onClick={() => move(id, -1)} disabled={idx === 0} aria-label="Move up">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" onClick={() => move(id, 1)} disabled={idx === layout.order.length - 1} aria-label="Move down">
                      <ArrowDown size={13} />
                    </button>
                  </div>
                  <span className="dash-customizer-title">{WIDGET_META[id].title}</span>
                  <button className="dash-toggle" type="button" onClick={() => toggle(id)}>
                    {hidden ? <><EyeOff size={13} /> Hidden</> : <><Eye size={13} /> Shown</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dash-grid">
        {visible.map((id) => (
          <section
            key={id}
            className={`dash-widget${WIDGET_META[id].wide ? " dash-widget-wide" : ""}`}
          >
            {renderWidget(id, data)}
          </section>
        ))}
      </div>
    </div>
  );
}

function renderWidget(id: WidgetId, data: DashboardData) {
  switch (id) {
    case "kpis":
      return <KpiRow data={data} />;
    case "aiInsights":
      return <MlInsightsWidget />;
    case "pipeline":
      return <PipelineWidget data={data} />;
    case "recentConversations":
      return <ConversationsWidget data={data} />;
    case "recentContacts":
      return <ContactsWidget data={data} />;
    case "programmes":
      return <ProgrammesWidget data={data} />;
    case "upcomingPosts":
      return <PostsWidget data={data} />;
    case "expa":
      return <ExpaWidget data={data} />;
    case "quickActions":
      return <QuickActions />;
    default:
      return null;
  }
}

function KpiRow({ data }: { data: DashboardData }) {
  const kpis = [
    { label: "Contacts", value: data.contacts, icon: Users, href: "/contacts", tone: "blue" },
    { label: "Unread messages", value: data.unreadConversations, icon: Inbox, href: "/conversations", tone: "violet" },
    { label: "Open conversations", value: data.openConversations, icon: Inbox, href: "/conversations", tone: "teal" },
    { label: "Scheduled posts", value: data.scheduledPosts, icon: CalendarDays, href: "/social", tone: "amber" },
    { label: "Draft campaigns", value: data.draftCampaigns, icon: Mail, href: "/email", tone: "pink" }
  ];
  return (
    <div className="kpi-grid">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Link className={`card kpi-card kpi-${kpi.tone}`} href={kpi.href} key={kpi.label}>
            <div>
              <span className="eyebrow">{kpi.label}</span>
              <Icon size={14} />
            </div>
            <strong>{kpi.value.toLocaleString()}</strong>
            <p>{kpi.value === 0 ? "No records yet" : "In your workspace"}</p>
          </Link>
        );
      })}
    </div>
  );
}

function PipelineWidget({ data }: { data: DashboardData }) {
  const max = Math.max(1, ...data.pipeline.map((s) => s.value));
  const total = data.pipeline.reduce((a, s) => a + s.value, 0);
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><TrendingUp size={15} /> Exchange pipeline</h2>
        <Link href="/contacts" className="dash-link">View contacts</Link>
      </div>
      {total === 0 ? (
        <p className="muted-note">No staged contacts yet. Add contacts or sync EXPA to populate the funnel.</p>
      ) : (
        <div className="funnel">
          {data.pipeline.map((s) => (
            <div className="funnel-row" key={s.stage}>
              <span className="funnel-label">{STAGE_LABELS[s.stage] ?? s.stage}</span>
              <div className="funnel-bar-track">
                <div className="funnel-bar" style={{ width: `${(s.value / max) * 100}%` }} />
              </div>
              <span className="funnel-value">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ConversationsWidget({ data }: { data: DashboardData }) {
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><Inbox size={15} /> Recent conversations</h2>
        <Link href="/conversations" className="dash-link">Inbox</Link>
      </div>
      {data.recentConversations.length === 0 ? (
        <p className="muted-note">No conversations yet. Instagram DMs land here once Meta is connected.</p>
      ) : (
        <ul className="dash-list">
          {data.recentConversations.map((c) => (
            <li key={c.id}>
              <Link href={`/conversations/${c.id}`}>
                <span className="dash-list-main">
                  <strong>{c.name}</strong>
                  <small className="dash-capitalize">{c.channel} · {relative(c.lastMessageAt)}</small>
                </span>
                {c.unreadCount > 0 && <em className="unread-badge">{c.unreadCount}</em>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ContactsWidget({ data }: { data: DashboardData }) {
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><Users size={15} /> Recent contacts</h2>
        <Link href="/contacts" className="dash-link">All contacts</Link>
      </div>
      {data.recentContacts.length === 0 ? (
        <p className="muted-note">No contacts yet. Add one or import from a connector.</p>
      ) : (
        <ul className="dash-list">
          {data.recentContacts.map((c) => (
            <li key={c.id}>
              <Link href={`/contacts/${c.id}`}>
                <span className="dash-list-main">
                  <strong>{c.fullName}</strong>
                  <small className="dash-capitalize">
                    {c.type.replace("_", " ")}
                    {c.funnelStage ? ` · ${STAGE_LABELS[c.funnelStage] ?? c.funnelStage}` : ""}
                  </small>
                </span>
                {c.programme && <span className="badge badge-violet">{c.programme.toUpperCase()}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ProgrammesWidget({ data }: { data: DashboardData }) {
  const total = data.programmes.reduce((a, p) => a + p.value, 0);
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><Sparkles size={15} /> Programme mix</h2>
      </div>
      {total === 0 ? (
        <p className="muted-note">No programme data yet.</p>
      ) : (
        <div className="prog-bars">
          {data.programmes.map((p) => (
            <div className="prog-row" key={p.programme}>
              <span>{PROGRAMME_LABELS[p.programme] ?? p.programme}</span>
              <div className="prog-track">
                <div className="prog-fill" style={{ width: `${(p.value / total) * 100}%` }} />
              </div>
              <span className="prog-val">{p.value}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function PostsWidget({ data }: { data: DashboardData }) {
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><CalendarDays size={15} /> Upcoming posts</h2>
        <Link href="/social" className="dash-link">Planner</Link>
      </div>
      {data.upcomingPosts.length === 0 ? (
        <p className="muted-note">Nothing scheduled. Plan content from the Social planner.</p>
      ) : (
        <ul className="dash-list">
          {data.upcomingPosts.map((p) => (
            <li key={p.id}>
              <span className="dash-list-main">
                <strong>{p.title ?? "Untitled post"}</strong>
                <small className="dash-capitalize">{p.platforms.join(", ")} · {p.scheduledFor ? dateLabel(p.scheduledFor) : "TBD"}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ExpaWidget({ data }: { data: DashboardData }) {
  const summary = data.expaSnapshot?.summary ?? null;
  const entries = summary
    ? Object.entries(summary).filter(([, v]) => typeof v === "number").slice(0, 6)
    : [];
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><TrendingUp size={15} /> EXPA snapshot</h2>
        <Link href="/expa" className="dash-link">Analytics</Link>
      </div>
      {data.expaStatus !== "connected" ? (
        <p className="muted-note">EXPA isn’t connected. <Link href="/integrations" className="dash-link">Connect it</Link> to pull funnel analytics.</p>
      ) : entries.length === 0 ? (
        <p className="muted-note">Connected — no snapshot captured yet. Run a sync from the EXPA page.</p>
      ) : (
        <div className="expa-mini-grid">
          {entries.map(([k, v]) => (
            <div className="expa-mini" key={k}>
              <strong>{Number(v).toLocaleString()}</strong>
              <span>{k.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

type MlInsights = {
  configured: boolean;
  officeId?: string | null;
  forecast?: {
    metric: string;
    history: { month: string; value: number }[];
    forecast: { month: string; forecast: number; lower: number; upper: number }[];
  } | null;
  anomalies?: { anomaly_count: number; n_months: number } | null;
  benchmark?: { cohort_size: number; metrics: { metric: string; rank: number; percentile: number; cohort_size: number }[] } | null;
  churn?: { overall_risk: string; weakest_transition: string | null } | null;
};

const RISK_BADGE: Record<string, string> = {
  low: "badge badge-green",
  medium: "badge badge-amber",
  high: "badge badge-pink"
};

function MlInsightsWidget() {
  const [state, setState] = useState<{ loading: boolean; data: MlInsights | null; error: boolean }>({
    loading: true,
    data: null,
    error: false
  });

  useEffect(() => {
    let active = true;
    fetch("/api/ml/insights")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MlInsights) => active && setState({ loading: false, data, error: false }))
      .catch(() => active && setState({ loading: false, data: null, error: true }));
    return () => {
      active = false;
    };
  }, []);

  const head = (
    <div className="dash-card-head">
      <h2><Sparkles size={15} /> AI Insights</h2>
      <Link href="/expa" className="dash-link">EXPA</Link>
    </div>
  );

  if (state.loading) {
    return (
      <article className="card dash-card">
        {head}
        <p className="muted-note">Loading forecasts…</p>
      </article>
    );
  }

  const data = state.data;
  if (state.error || !data || !data.configured) {
    return (
      <article className="card dash-card">
        {head}
        <p className="muted-note">
          ML service not connected. Set <code>ML_API_URL</code> and <code>ML_API_KEY</code> to enable demand
          forecasts, anomaly detection, and peer benchmarking.
        </p>
      </article>
    );
  }
  if (!data.officeId) {
    return (
      <article className="card dash-card">
        {head}
        <p className="muted-note">Add your EXPA committee ID in Integrations to enable AI insights.</p>
      </article>
    );
  }

  const next = data.forecast?.forecast?.[0];
  const applied = data.benchmark?.metrics?.find((m) => m.metric === "funnel.applied");
  const risk = data.churn?.overall_risk;

  return (
    <article className="card dash-card">
      {head}
      <div className="ml-grid">
        <div className="ml-stat">
          <span className="ml-stat-label"><LineChart size={13} /> Forecast · next month</span>
          {next ? (
            <>
              <strong>{next.forecast.toLocaleString()}</strong>
              <small>range {next.lower.toLocaleString()}–{next.upper.toLocaleString()} · applications</small>
            </>
          ) : (
            <small className="muted-note">No forecast yet</small>
          )}
        </div>

        <div className="ml-stat">
          <span className="ml-stat-label"><BarChart3 size={13} /> Peer rank · applications</span>
          {applied ? (
            <>
              <strong>#{applied.rank}<em className="ml-of">/{applied.cohort_size}</em></strong>
              <small>{applied.percentile}th percentile</small>
            </>
          ) : (
            <small className="muted-note">No benchmark</small>
          )}
        </div>

        <div className="ml-stat">
          <span className="ml-stat-label"><TrendingUp size={13} /> Drop-off risk</span>
          {risk ? (
            <>
              <span className={RISK_BADGE[risk] ?? "badge badge-grey"} style={{ alignSelf: "flex-start" }}>{risk}</span>
              <small>{data.churn?.weakest_transition ? `weakest: ${data.churn.weakest_transition}` : "funnel healthy"}</small>
            </>
          ) : (
            <small className="muted-note">No churn data</small>
          )}
        </div>

        <div className="ml-stat">
          <span className="ml-stat-label"><AlertTriangle size={13} /> Anomalous months</span>
          {data.anomalies ? (
            <>
              <strong>{data.anomalies.anomaly_count}</strong>
              <small>of {data.anomalies.n_months} tracked</small>
            </>
          ) : (
            <small className="muted-note">No anomaly data</small>
          )}
        </div>
      </div>
      {data.forecast && <ForecastSparkline data={data.forecast} />}
    </article>
  );
}

// Tiny inline SVG sparkline: solid = history, dashed = forecast.
function ForecastSparkline({ data }: { data: NonNullable<MlInsights["forecast"]> }) {
  const hist = data.history.map((h) => h.value);
  const fc = data.forecast.map((f) => f.forecast);
  const series = [...hist, ...fc];
  if (series.length < 2) return null;
  const max = Math.max(1, ...series, ...data.forecast.map((f) => f.upper));
  const w = 100;
  const h = 28;
  const step = w / (series.length - 1);
  const y = (v: number) => h - (v / max) * h;
  const pt = (v: number, i: number) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`;
  const histPath = hist.map((v, i) => pt(v, i)).join(" ");
  const fcPath = [pt(hist[hist.length - 1], hist.length - 1), ...fc.map((v, i) => pt(v, hist.length + i))].join(" ");
  return (
    <svg className="ml-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={histPath} fill="none" stroke="var(--aiesec-blue)" strokeWidth="1.5" />
      <polyline points={fcPath} fill="none" stroke="var(--aiesec-blue)" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
    </svg>
  );
}

function QuickActions() {
  const actions = [
    { label: "Add contact", href: "/contacts/new", icon: UserPlus },
    { label: "New campaign", href: "/email/new", icon: Mail },
    { label: "Plan post", href: "/social/new", icon: Plus },
    { label: "Integrations", href: "/integrations", icon: Settings2 }
  ];
  return (
    <article className="card dash-card">
      <div className="dash-card-head">
        <h2><Sparkles size={15} /> Quick actions</h2>
      </div>
      <div className="quick-actions">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link className="quick-action" href={a.href} key={a.label}>
              <Icon size={16} />
              <span>{a.label}</span>
            </Link>
          );
        })}
      </div>
    </article>
  );
}

function relative(date: Date | null) {
  if (!date) return "—";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateLabel(date: Date) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
