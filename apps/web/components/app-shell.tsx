"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  Inbox,
  Mail,
  Menu,
  PlugZap,
  Search,
  Settings,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Membership } from "../lib/auth";

const navItems: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/expa", label: "EXPA Analytics", icon: Activity },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/conversations", label: "Conversations", icon: Inbox },
  { href: "/social", label: "Social Planner", icon: CalendarDays },
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

export function AppShell({
  memberships,
  activeMembership,
  children
}: {
  memberships: Membership[];
  activeMembership: Membership;
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
        <button className="workspace-switcher">
          <span className="logo-mark">
            <img src="/assets/aiesec-human-white.png" alt="" />
          </span>
          <span className="workspace-copy">
            <strong>{activeMembership.lcName}</strong>
            <small>{memberships.length} workspace{memberships.length === 1 ? "" : "s"} · {activeMembership.role}</small>
          </span>
          <ChevronDown size={14} />
        </button>

        <nav className="nav-list" aria-label="Workspace">
          <span className="eyebrow nav-eyebrow">Workspace</span>
          {navItems.slice(0, 6).map((item) => (
            <ShellLink key={item.href} {...item} active={pathname === item.href} />
          ))}
          <span className="nav-spacer" />
          <span className="eyebrow nav-eyebrow">System</span>
          {navItems.slice(6).map((item) => (
            <ShellLink key={item.href} {...item} active={pathname === item.href} />
          ))}
        </nav>
      </aside>

      <section className="crm-main">
        <header className="topbar">
          <button className="icon-button" aria-label="Toggle sidebar">
            <Menu size={16} />
          </button>
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
          <button className="icon-button" aria-label="Help">
            <CircleHelp size={16} />
          </button>
          <button className="icon-button has-dot" aria-label="Notifications">
            <Bell size={16} />
          </button>
          <span className="avatar">{initials(activeMembership.lcName)}</span>
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
