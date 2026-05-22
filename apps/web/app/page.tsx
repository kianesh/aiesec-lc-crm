"use client";

import * as React from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  DatabaseZap,
  ExternalLink,
  Home,
  Inbox,
  Layers3,
  Mail,
  Menu,
  MessageCircle,
  MoreVertical,
  PlugZap,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
  X
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { LucideIcon } from "lucide-react";

type RouteId =
  | "auth"
  | "dashboard"
  | "expa"
  | "contacts"
  | "conversations"
  | "social"
  | "email"
  | "integrations"
  | "settings"
  | "styleguide";

type Route = {
  id: RouteId;
  label: string;
  icon: LucideIcon;
  count?: number;
  bare?: boolean;
};

const routes: Route[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "expa", label: "EXPA Analytics", icon: Activity },
  { id: "contacts", label: "Contacts", icon: Users, count: 1284 },
  { id: "conversations", label: "Conversations", icon: Inbox, count: 12 },
  { id: "social", label: "Social Planner", icon: CalendarDays },
  { id: "email", label: "Email", icon: Mail },
  { id: "integrations", label: "Integrations", icon: PlugZap },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "styleguide", label: "Styleguide", icon: Layers3 },
  { id: "auth", label: "Authentication", icon: ShieldCheck, bare: true }
];

const navRoutes = routes.filter((route) => !route.bare);

const kpis = [
  { label: "Approvals", value: "148", delta: "+12.4%", tone: "blue" },
  { label: "Applications", value: "412", delta: "+8.1%", tone: "violet" },
  { label: "Realizations", value: "62", delta: "+24.0%", tone: "green" },
  { label: "Finishes", value: "38", delta: "-4.2%", tone: "amber" }
];

const chartData = [
  { day: "Feb", applications: 206, approvals: 72, realizations: 18 },
  { day: "Mar", applications: 244, approvals: 91, realizations: 24 },
  { day: "Apr", applications: 301, approvals: 105, realizations: 31 },
  { day: "May", applications: 366, approvals: 128, realizations: 47 },
  { day: "Today", applications: 412, approvals: 148, realizations: 62 }
];

const funnel = [
  { label: "Opens", value: 4842 },
  { label: "Applied", value: 612 },
  { label: "Accepted", value: 248 },
  { label: "Approved", value: 148 },
  { label: "Realized", value: 62 },
  { label: "Finished", value: 38 }
];

const activity = [
  "Diego replied to @marina_b on Instagram about Tech4Good Brazil",
  "EXPA sync completed: 23 new EPs added, 4 statuses changed",
  "Sasha approved 4 applications in iGV Brazil round 12",
  "Mei sent Welcome to AIESEC Western to 247 EPs",
  "Wei tagged 34 contacts as fall-2026-priority"
];

const placeholders: Record<RouteId, { eyebrow: string; title: string; text: string; items: string[] }> = {
  auth: {
    eyebrow: "Phase 1",
    title: "Authentication",
    text: "Magic links, LC creation, invitations, and membership switching.",
    items: []
  },
  dashboard: {
    eyebrow: "Home",
    title: "Dashboard",
    text: "EXPA KPIs, operations feed, scheduled posts, and team activity.",
    items: []
  },
  expa: {
    eyebrow: "Phase 2",
    title: "EXPA Analytics",
    text: "Pipeline, people, opportunities, performance benchmarks, and sync health.",
    items: ["OAuth connection flow", "15-minute Inngest delta sync", "Funnel chart", "Partial failure logging"]
  },
  contacts: {
    eyebrow: "Phase 3",
    title: "Contacts CRM",
    text: "Server-side table, saved views, slide-over profiles, tags, and custom fields.",
    items: ["TanStack table", "Bulk actions", "CSV import wizard", "Activity timeline"]
  },
  conversations: {
    eyebrow: "Phase 5",
    title: "Unified Inbox",
    text: "Three-column inbox for email, Instagram, Facebook, and WhatsApp.",
    items: ["Channel filters", "Thread composer", "Internal notes", "Supabase Realtime"]
  },
  social: {
    eyebrow: "Phase 7",
    title: "Social Planner",
    text: "Calendar scheduling, platform previews, analytics, and post queue.",
    items: ["Month/week calendar", "Delayed Inngest publish jobs", "Media previews", "Best-time heatmap"]
  },
  email: {
    eyebrow: "Phase 4",
    title: "Email Campaigns",
    text: "Mailgun-powered sending, campaign analytics, templates, and webhooks.",
    items: ["Template variables", "Audience segments", "Open/click/bounce stats", "Domain verification"]
  },
  integrations: {
    eyebrow: "Phase 8",
    title: "Integrations Hub",
    text: "EXPA, Mailgun, Meta, Notion, and Google Drive connector management.",
    items: ["OAuth cards", "Encrypted credentials", "Sync settings", "Field mapping"]
  },
  settings: {
    eyebrow: "Phase 9",
    title: "Settings",
    text: "Profile, LC settings, team roles, branding, notifications, and API keys.",
    items: ["Permission matrix", "Brand token editor", "Notification preferences", "Audit log"]
  },
  styleguide: {
    eyebrow: "Design System",
    title: "Styleguide",
    text: "Token-driven primitives adapted from the design handoff.",
    items: ["Buttons", "Badges", "Cards", "Tables", "Empty states", "Toasts"]
  }
};

export default function HomePage() {
  const [route, setRoute] = useHashRoute();
  const [collapsed, setCollapsed] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "[" && !event.metaKey && !event.ctrlKey) {
        setCollapsed((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = routes.find((item) => item.id === route) ?? routes[0];

  if (active.bare) {
    return (
      <>
        <AuthPreview onNavigate={setRoute} />
        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onNavigate={setRoute} />
      </>
    );
  }

  return (
    <main className="crm-shell">
      <aside className={collapsed ? "crm-sidebar crm-sidebar-collapsed" : "crm-sidebar"}>
        <button className="workspace-switcher" onClick={() => setRoute("settings")}>
          <span className="logo-mark">
            <img src="/assets/aiesec-human-white.png" alt="" />
          </span>
          {!collapsed && (
            <>
              <span className="workspace-copy">
                <strong>AIESEC Western</strong>
                <small>Local Committee · CA</small>
              </span>
              <ChevronDown size={14} />
            </>
          )}
        </button>

        <nav className="nav-list" aria-label="Workspace">
          {!collapsed && <span className="eyebrow nav-eyebrow">Workspace</span>}
          {navRoutes.slice(0, 6).map((item) => (
            <NavButton key={item.id} item={item} active={route === item.id} collapsed={collapsed} onClick={() => setRoute(item.id)} />
          ))}
          <span className="nav-spacer" />
          {!collapsed && <span className="eyebrow nav-eyebrow">System</span>}
          {navRoutes.slice(6).map((item) => (
            <NavButton key={item.id} item={item} active={route === item.id} collapsed={collapsed} onClick={() => setRoute(item.id)} />
          ))}
        </nav>

        <button className="user-card">
          <Avatar name="Lina Park" />
          {!collapsed && (
            <>
              <span>
                <strong>Lina Park</strong>
                <small>LCP · iGV</small>
              </span>
              <MoreVertical size={16} />
            </>
          )}
        </button>
      </aside>

      <section className="crm-main">
        <header className="topbar">
          <button className="icon-button" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle sidebar">
            <Menu size={16} />
          </button>
          <div className="breadcrumbs">
            <span>AIESEC Western</span>
            <ChevronRight size={13} />
            <strong>{active.label}</strong>
          </div>
          <button className="search-trigger" onClick={() => setCommandOpen(true)}>
            <Search size={15} />
            <span>Search or jump to...</span>
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </button>
          <button className="icon-button" aria-label="Help">
            <CircleHelp size={16} />
          </button>
          <button className="icon-button has-dot" aria-label="Notifications">
            <Bell size={16} />
          </button>
          <Avatar name="Lina Park" />
        </header>

        {route === "dashboard" ? <Dashboard /> : <Placeholder route={route} onNavigate={setRoute} />}
      </section>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onNavigate={setRoute} />
    </main>
  );
}

function useHashRoute(): [RouteId, (route: RouteId) => void] {
  const [route, setRouteState] = React.useState<RouteId>("dashboard");

  React.useEffect(() => {
    const readHash = () => {
      const raw = window.location.hash.replace("#", "") as RouteId;
      setRouteState(routes.some((item) => item.id === raw) ? raw : "dashboard");
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const setRoute = React.useCallback((next: RouteId) => {
    setRouteState(next);
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  }, []);

  return [route, setRoute];
}

function NavButton({
  item,
  active,
  collapsed,
  onClick
}: {
  item: Route;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button className={active ? "nav-item nav-item-active" : "nav-item"} onClick={onClick} title={collapsed ? item.label : undefined}>
      <Icon size={16} />
      {!collapsed && (
        <>
          <span>{item.label}</span>
          {item.count !== undefined && <em>{item.count}</em>}
        </>
      )}
    </button>
  );
}

function Dashboard() {
  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Operations Home</span>
          <h1>Dashboard</h1>
          <p>Live LC health across EXPA, CRM, conversations, campaigns, and scheduled content.</p>
        </div>
        <div className="heading-actions">
          <span className="sync-chip"><span /> EXPA · synced 4 min ago</span>
          <button className="button secondary">Export</button>
          <button className="button primary">Review pipeline</button>
        </div>
      </section>

      <section className="kpi-grid">
        {kpis.map((kpi) => (
          <article className="card kpi-card" key={kpi.label}>
            <div>
              <span className="eyebrow">{kpi.label}</span>
              <DatabaseZap size={13} />
            </div>
            <strong>{kpi.value}</strong>
            <p><span className={kpi.delta.startsWith("-") ? "negative" : "positive"}>{kpi.delta}</span> vs last 30d</p>
            <span className={`sparkline sparkline-${kpi.tone}`} />
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="card chart-card">
          <div className="card-header">
            <div>
              <span className="eyebrow">Pipeline conversion · last 90 days</span>
              <h2>EXPA funnel performance</h2>
            </div>
            <button className="button ghost">Open analytics <ExternalLink size={14} /></button>
          </div>
          <div className="legend">
            <span><i className="legend-violet" /> Applications</span>
            <span><i className="legend-blue" /> Approvals</span>
            <span><i className="legend-green" /> Realizations</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="applications" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#7c4dff" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#7c4dff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="approvals" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#037ef3" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#037ef3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#8b94a6", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8b94a6", fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e4e8ef" }} />
                <Area type="monotone" dataKey="applications" stroke="#7c4dff" fill="url(#applications)" strokeWidth={2} />
                <Area type="monotone" dataKey="approvals" stroke="#037ef3" fill="url(#approvals)" strokeWidth={2} />
                <Area type="monotone" dataKey="realizations" stroke="#10a368" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="funnel-bars">
            {funnel.map((stage) => (
              <div key={stage.label}>
                <span>{stage.label}</span>
                <strong>{stage.value.toLocaleString()}</strong>
                <em style={{ width: `${Math.max(8, (stage.value / funnel[0].value) * 100)}%` }} />
              </div>
            ))}
          </div>
        </article>

        <aside className="right-rail">
          <article className="card unread-card">
            <div>
              <Inbox size={18} />
              <span>
                <strong>Unread conversations</strong>
                <small>Instagram, Email, WhatsApp</small>
              </span>
              <b>12</b>
            </div>
            <footer>
              <span>Instagram <b>7</b></span>
              <span>Email <b>3</b></span>
              <span>WhatsApp <b>2</b></span>
            </footer>
          </article>

          <article className="card compact-card">
            <div className="card-header">
              <h2>Upcoming posts</h2>
              <button className="button ghost">Queue</button>
            </div>
            {["Today · 5:30 PM", "Tomorrow · 9:00 AM", "Fri · 11:00 AM"].map((time, index) => (
              <div className="queue-row" key={time}>
                <CalendarDays size={15} />
                <span>
                  <strong>{time}</strong>
                  <small>{index === 0 ? "Tech4Good Brazil last call" : "Outgoing cohort story"}</small>
                </span>
              </div>
            ))}
          </article>

          <article className="card compact-card">
            <div className="card-header">
              <h2>Team activity</h2>
              <button className="button ghost">Assign</button>
            </div>
            {["Sasha · 4 apps in review", "Diego · replying on Instagram", "Mei · composing email"].map((item) => (
              <div className="team-row" key={item}>
                <Avatar name={item} />
                <span>{item}</span>
                <i />
              </div>
            ))}
          </article>
        </aside>
      </section>

      <section className="card activity-card">
        <div className="card-header">
          <h2>Recent activity</h2>
          <button className="button ghost">View all</button>
        </div>
        {activity.map((item, index) => (
          <div className="activity-row" key={item}>
            <span>{index === 0 ? <MessageCircle size={14} /> : index === 1 ? <DatabaseZap size={14} /> : <Check size={14} />}</span>
            <p>{item}</p>
            <time>{index + 4} min ago</time>
          </div>
        ))}
      </section>
    </div>
  );
}

function Placeholder({ route, onNavigate }: { route: RouteId; onNavigate: (route: RouteId) => void }) {
  const data = placeholders[route];
  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{data.eyebrow}</span>
          <h1>{data.title}</h1>
          <p>{data.text}</p>
        </div>
        <button className="button primary" onClick={() => onNavigate("auth")}>Open onboarding</button>
      </section>
      <section className="placeholder-grid">
        <article className="card placeholder-card">
          <Sparkles size={22} />
          <h2>{data.title} foundation</h2>
          <p>This route is scaffolded from the design handoff so future phases have the final shell, density, and interaction model already in place.</p>
          <div className="skeleton-block" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </article>
        <article className="card compact-card">
          <h2>Phase scope</h2>
          {data.items.map((item) => (
            <div className="scope-row" key={item}>
              <Check size={14} />
              <span>{item}</span>
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}

function AuthPreview({ onNavigate }: { onNavigate: (route: RouteId) => void }) {
  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <span className="auth-logo">
          <img src="/assets/aiesec-human-white.png" alt="" />
        </span>
        <span className="eyebrow">AIESEC Western CRM</span>
        <h1>Run LC operations from one clean workspace.</h1>
        <p>Magic-link auth, LC creation, invitations, and workspace switching are the next production phase.</p>
        <div className="trust-strip">
          <span><ShieldCheck size={15} /> RLS ready</span>
          <span><DatabaseZap size={15} /> Supabase</span>
          <span><WandSparkles size={15} /> EXPA sync</span>
        </div>
      </section>
      <section className="auth-card">
        <button className="button ghost auth-skip" onClick={() => onNavigate("dashboard")}>Skip to dashboard</button>
        <span className="eyebrow">Sign in</span>
        <h2>Welcome back</h2>
        <p>Enter your AIESEC email and we’ll send a secure magic link.</p>
        <label>
          Email
          <input placeholder="lina@aiesec.ca" />
        </label>
        <button className="button primary wide">Send magic link</button>
        <button className="button secondary wide">Continue with Google</button>
        <div className="auth-options">
          <button onClick={() => onNavigate("settings")}>
            <strong>Create LC</strong>
            <small>Set up brand, EXPA ID, and teammates</small>
          </button>
          <button onClick={() => onNavigate("contacts")}>
            <strong>Join an LC</strong>
            <small>Search committees and request access</small>
          </button>
        </div>
      </section>
    </main>
  );
}

function CommandPalette({
  open,
  onClose,
  onNavigate
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: RouteId) => void;
}) {
  if (!open) return null;
  return (
    <div className="command-overlay" onClick={onClose}>
      <section className="command-panel" onClick={(event) => event.stopPropagation()}>
        <div className="command-input">
          <Command size={17} />
          <input autoFocus placeholder="Search routes, create records, switch LC..." />
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <span className="eyebrow command-section">Navigate</span>
        {routes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="command-row"
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                onClose();
              }}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              <kbd>G</kbd>
            </button>
          );
        })}
        <span className="eyebrow command-section">Create</span>
        {["Invite member", "Create contact", "Schedule post", "Send email"].map((item) => (
          <button className="command-row" key={item}>
            <Send size={16} />
            <span>{item}</span>
            <kbd>↵</kbd>
          </button>
        ))}
      </section>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return <span className="avatar">{initials}</span>;
}
