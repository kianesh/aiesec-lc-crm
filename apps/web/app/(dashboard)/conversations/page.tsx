import { schema } from "@aiesec/db";
import { desc, eq } from "drizzle-orm";
import { Inbox, Instagram } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { syncInstagramInbox } from "./actions";

type SearchParams = { channel?: string; status?: string; synced?: string; error?: string };

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function formatRelative(date: Date | null) {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ConversationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const conversations = await db
    .select({
      id: schema.conversations.id,
      channel: schema.conversations.channel,
      status: schema.conversations.status,
      participantName: schema.conversations.participantName,
      lastMessageAt: schema.conversations.lastMessageAt,
      unreadCount: schema.conversations.unreadCount,
      contactFullName: schema.contacts.fullName
    })
    .from(schema.conversations)
    .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
    .where(eq(schema.conversations.lcId, activeMembership.lcId))
    .orderBy(desc(schema.conversations.lastMessageAt));

  const filtered = conversations.filter((c) => {
    if (searchParams.channel && c.channel !== searchParams.channel) return false;
    if (searchParams.status && c.status !== searchParams.status) return false;
    return true;
  });

  return (
    <div className="conversations-layout">
      <aside className="conversations-sidebar">
        <form action={syncInstagramInbox} className="conv-sync">
          <button type="submit" className="button secondary wide" style={{ fontSize: 12 }}>
            <Instagram size={14} /> Sync Instagram DMs
          </button>
        </form>
        {searchParams.synced && (
          <p className="success-note" style={{ fontSize: 12, margin: "0 0 8px" }}>
            Synced {searchParams.synced} Instagram conversation{searchParams.synced === "1" ? "" : "s"}.
          </p>
        )}
        {searchParams.error === "instagram_not_connected" && (
          <p className="form-error" style={{ fontSize: 12, margin: "0 0 8px" }}>
            Instagram isn’t connected. <Link href="/integrations/instagram">Connect it</Link> first.
          </p>
        )}
        {searchParams.error === "sync_failed" && (
          <p className="form-error" style={{ fontSize: 12, margin: "0 0 8px" }}>Couldn’t sync. Try again.</p>
        )}
        <div className="conv-filters">
          {([["", "All"], ["open", "Open"], ["closed", "Closed"]] as [string, string][]).map(([val, label]) => (
            <Link
              key={val}
              href={val ? `/conversations?status=${val}` : "/conversations"}
              className={`platform-tab${(!searchParams.status && !val) || searchParams.status === val ? " active" : ""}`}
              style={{ fontSize: 12, minHeight: 28, padding: "0 10px" }}
            >
              {label}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <Inbox size={24} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
            <p className="muted-note" style={{ fontSize: 12 }}>No conversations yet.</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const name = conv.participantName ?? conv.contactFullName ?? "Unknown";
            return (
              <Link key={conv.id} href={`/conversations/${conv.id}`} className="conv-item">
                <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(name)}</span>
                <div className="conv-item-body">
                  <strong>{name}</strong>
                  <small>{conv.channel} · {formatRelative(conv.lastMessageAt)}</small>
                </div>
                {conv.unreadCount > 0 && <em className="unread-badge">{conv.unreadCount}</em>}
              </Link>
            );
          })
        )}
      </aside>

      <div className="conversations-main">
        <div className="conv-empty">
          <div style={{ textAlign: "center" }}>
            <Inbox size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.2 }} />
            <p className="muted-note">Select a conversation to view messages.</p>
            <p className="muted-note" style={{ fontSize: 12, marginTop: 6 }}>
              Instagram DMs arrive here automatically once Meta is connected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
