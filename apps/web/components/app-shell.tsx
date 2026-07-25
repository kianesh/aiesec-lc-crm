"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Home,
  Inbox,
  Mail,
  Network,
  PlugZap,
  Search,
  Settings,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Membership } from "../lib/auth";
import { AssistantWidget } from "./assistant-widget";
import { ThemeToggle } from "./theme-toggle";

const navItems: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/expa", label: "EXPA Analytics", icon: Activity },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/organization", label: "Organization", icon: Network },
  { href: "/conversations", label: "Conversations", icon: Inbox },
  { href: "/social", label: "Social Planner", icon: CalendarDays },
  { href: "/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/email", label: "Email", icon: Mail },
  { href: "/integrations", label: "Integrations", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings }
];

const commandItems = [
  ...navItems.map((item) => ({ ...item, group: "Navigate" })),
  { href: "/integrations", label: "Connect EXPA", icon: PlugZap, group: "Actions" },
  { href: "/settings", label: "Invite teammate", icon: Users, group: "Actions" },
  { href: "/expa", label: "Open EXPA funnel", icon: Activity, group: "Actions" }
];

type ShellUser = { name: string; email: string; avatarUrl: string | null };

export function AppShell({
  user,
  memberships,
  activeMembership,
  notificationCount = 0,
  children
}: {
  user: ShellUser;
  memberships: Membership[];
  activeMembership: Membership;
  notificationCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commandItems;
    return commandItems.filter((item) =>
      [item.label, item.href, item.group].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="crm-shell">
      <aside className="crm-sidebar">
        <Link href="/organization" className="workspace-switcher">
          <span className="logo-mark">
            <img src="/assets/aiesec-human-white.png" alt="" />
          </span>
          <span className="workspace-copy">
            <strong>{activeMembership.lcName}</strong>
            <small>{memberships.length} workspace{memberships.length === 1 ? "" : "s"} · {activeMembership.role}</small>
          </span>
        </Link>

        <nav className="nav-list" aria-label="Workspace">
          <span className="eyebrow nav-eyebrow">Workspace</span>
          {navItems.slice(0, 8).map((item) => (
            <ShellLink key={item.href} {...item} active={pathname === item.href} />
          ))}
          <span className="nav-spacer" />
          <span className="eyebrow nav-eyebrow">System</span>
          {navItems.slice(8).map((item) => (
            <ShellLink key={item.href} {...item} active={pathname === item.href} />
          ))}
        </nav>
      </aside>

      <section className="crm-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>{activeMembership.lcName}</span>
            <ChevronRight size={13} />
            <strong>{navItems.find((item) => item.href === pathname)?.label ?? "Workspace"}</strong>
          </div>
          <button className="search-trigger" type="button" onClick={() => setCommandOpen(true)}>
            <Search size={15} />
            <span>Search or jump to...</span>
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </button>
          <ThemeToggle />
          <button className="icon-button" aria-label="Help">
            <CircleHelp size={16} />
          </button>
          <Link
            href="/notifications"
            className="icon-button notif-bell"
            aria-label={notificationCount > 0 ? `Notifications (${notificationCount})` : "Notifications"}
            title="Notifications"
          >
            <Bell size={16} />
            {notificationCount > 0 && <span className="notif-badge">{notificationCount > 9 ? "9+" : notificationCount}</span>}
          </Link>
          <Link href="/profile" className="avatar avatar-link" title={`${user.name} · View profile`} aria-label="Your profile">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user.name)}
          </Link>
        </header>
        {children}
      </section>

      {commandOpen && (
        <div className="command-overlay" role="dialog" aria-modal="true" aria-label="Search commands" onMouseDown={() => setCommandOpen(false)}>
          <div className="command-panel" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-input">
              <Search size={16} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages and actions"
              />
              <button type="button" onClick={() => setCommandOpen(false)}>Esc</button>
            </div>
            <span className="command-section">Results</span>
            {filteredCommands.length > 0 ? (
              filteredCommands.map((item) => (
                <CommandLink key={`${item.group}-${item.href}-${item.label}`} item={item} onSelect={() => setCommandOpen(false)} />
              ))
            ) : (
              <p className="command-empty">No results found.</p>
            )}
          </div>
        </div>
      )}

      <AssistantWidget lcId={activeMembership.lcId} lcName={activeMembership.lcName} />
    </main>
  );
}

function CommandLink({
  item,
  onSelect
}: {
  item: (typeof commandItems)[number];
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link className="command-row" href={item.href} onClick={onSelect}>
      <Icon size={16} />
      <span>{item.label}</span>
      <small>{item.group}</small>
    </Link>
  );
}

function ShellLink({
  href,
  label,
  icon: Icon,
  active
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link className={active ? "nav-item nav-item-active" : "nav-item"} href={href}>
      <Icon size={16} />
      <span>{label}</span>
    </Link>
  );
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
