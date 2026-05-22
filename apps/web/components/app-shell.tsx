"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
          <button className="search-trigger">
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
    </main>
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
