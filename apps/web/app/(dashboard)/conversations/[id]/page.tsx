import { schema } from "@aiesec/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, CheckCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { closeConversation, reopenConversation, sendReply } from "../actions";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function formatTime(date: Date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const REPLY_ERRORS: Record<string, string> = {
  send_failed: "Couldn’t deliver to Instagram. The 24-hour reply window may have closed, or reconnect Instagram.",
  no_recipient: "No Instagram recipient on this conversation yet."
};

export default async function ConversationThreadPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const [conversation, messages, allConversations, lcMembers] = await Promise.all([
    db
      .select({
        id: schema.conversations.id,
        channel: schema.conversations.channel,
        status: schema.conversations.status,
        participantName: schema.conversations.participantName,
        assignedTo: schema.conversations.assignedTo,
        lastMessageAt: schema.conversations.lastMessageAt,
        unreadCount: schema.conversations.unreadCount,
        contactId: schema.conversations.contactId,
        contactFullName: schema.contacts.fullName
      })
      .from(schema.conversations)
      .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
      .where(and(eq(schema.conversations.id, params.id), eq(schema.conversations.lcId, activeMembership.lcId)))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, params.id))
      .orderBy(asc(schema.messages.sentAt)),
    db
      .select({
        id: schema.conversations.id,
        participantName: schema.conversations.participantName,
        lastMessageAt: schema.conversations.lastMessageAt,
        unreadCount: schema.conversations.unreadCount,
        channel: schema.conversations.channel,
        contactFullName: schema.contacts.fullName
      })
      .from(schema.conversations)
      .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
      .where(eq(schema.conversations.lcId, activeMembership.lcId))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(30),
    db
      .select({ id: schema.users.id, fullName: schema.users.fullName })
      .from(schema.users)
      .innerJoin(schema.lcMembers, eq(schema.lcMembers.userId, schema.users.id))
      .where(eq(schema.lcMembers.lcId, activeMembership.lcId))
  ]);

  if (!conversation) notFound();

  const displayName = conversation.participantName ?? conversation.contactFullName ?? "Unknown";
  const isOpen = conversation.status === "open";

  const closeWithId = closeConversation.bind(null, conversation.id);
  const reopenWithId = reopenConversation.bind(null, conversation.id);
  const replyWithId = sendReply.bind(null, conversation.id);

  // Mark unread as read
  await db
    .update(schema.conversations)
    .set({ unreadCount: 0 })
    .where(eq(schema.conversations.id, conversation.id));

  return (
    <div className="conversations-layout">
      <aside className="conversations-sidebar">
        <div className="conv-filters" style={{ padding: "10px 12px" }}>
          <Link href="/conversations" className="button ghost" style={{ fontSize: 12 }}>
            <ArrowLeft size={12} /> All
          </Link>
        </div>
        {allConversations.map((conv) => {
          const name = conv.participantName ?? conv.contactFullName ?? "Unknown";
          return (
            <Link
              key={conv.id}
              href={`/conversations/${conv.id}`}
              className={`conv-item${conv.id === params.id ? " active" : ""}`}
            >
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(name)}</span>
              <div className="conv-item-body">
                <strong>{name}</strong>
                <small style={{ textTransform: "capitalize" }}>{conv.channel}</small>
              </div>
              {conv.unreadCount > 0 && <em className="unread-badge">{conv.unreadCount}</em>}
            </Link>
          );
        })}
      </aside>

      <div className="conversations-main">
        <header className="conv-header">
          <span className="avatar">{initials(displayName)}</span>
          <div>
            <strong>{displayName}</strong>
            <small style={{ textTransform: "capitalize" }}>{conversation.channel} · {conversation.status}</small>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {isOpen ? (
              <form action={closeWithId}>
                <button className="button secondary" type="submit" style={{ fontSize: 12 }}>
                  <CheckCheck size={13} /> Close
                </button>
              </form>
            ) : (
              <form action={reopenWithId}>
                <button className="button secondary" type="submit" style={{ fontSize: 12 }}>
                  <RotateCcw size={13} /> Reopen
                </button>
              </form>
            )}
          </div>
        </header>

        {searchParams.error && (
          <p className="form-error page-note" style={{ margin: "10px 16px 0" }}>
            {REPLY_ERRORS[searchParams.error] ?? "Something went wrong sending your reply."}
          </p>
        )}

        <div className="conv-messages">
          {messages.length === 0 ? (
            <p className="muted-note" style={{ textAlign: "center", marginTop: 40 }}>No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={m.direction === "in" ? "msg-in" : "msg-out"}>
                <p>{m.body}</p>
                <time>{formatTime(m.sentAt)}</time>
              </div>
            ))
          )}
        </div>

        {isOpen && (
          <form action={replyWithId} className="conv-reply">
            <textarea name="body" placeholder="Write a reply…" />
            <button className="button primary" type="submit">Send</button>
          </form>
        )}
      </div>
    </div>
  );
}
