import {
  conversationListQuerySchema,
  type ConversationListItemDto,
  type ConversationListResponse
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, count, desc, eq, gt, sql, type SQL } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, iso, jsonOk, zodError } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

export const GET = authed(async (request, session) => {
  const url = new URL(request.url);
  const parsed = conversationListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodError(parsed.error);
  const { channel, status, assigned, unread, limit, offset } = parsed.data;

  const db = getDb();
  const lcId = session.membership.lcId;

  const filters: SQL[] = [eq(schema.conversations.lcId, lcId)];
  if (channel) filters.push(eq(schema.conversations.channel, channel));
  if (status) filters.push(eq(schema.conversations.status, status));
  if (assigned === "me") filters.push(eq(schema.conversations.assignedTo, session.userId));
  if (unread) filters.push(gt(schema.conversations.unreadCount, 0));
  const where = and(...filters);

  const [rows, [totalRow], [unreadRow], assigneeRows] = await Promise.all([
    db
      .select({
        id: schema.conversations.id,
        channel: schema.conversations.channel,
        status: schema.conversations.status,
        participantName: schema.conversations.participantName,
        lastMessageAt: schema.conversations.lastMessageAt,
        unreadCount: schema.conversations.unreadCount,
        contactId: schema.conversations.contactId,
        contactFullName: schema.contacts.fullName,
        // Correlated subquery rather than an extra round trip — the inbox is
        // unreadable without a preview line and a phone can't afford N+1.
        lastMessagePreview: sql<string | null>`(
          select m.body from ${schema.messages} m
          where m.conversation_id = ${schema.conversations.id}
          order by m.sent_at desc
          limit 1
        )`,
        assigneeId: schema.users.id,
        assigneeName: schema.users.fullName,
        assigneeEmail: schema.users.email
      })
      .from(schema.conversations)
      .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
      .leftJoin(schema.users, eq(schema.conversations.assignedTo, schema.users.id))
      .where(where)
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.conversations).where(where),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.conversations.unreadCount}), 0)::int` })
      .from(schema.conversations)
      .where(eq(schema.conversations.lcId, lcId)),
    db
      .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
      .from(schema.lcMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.lcMembers.userId))
      .where(eq(schema.lcMembers.lcId, lcId))
  ]);

  const conversations: ConversationListItemDto[] = rows.map((row) => ({
    id: row.id,
    name: row.participantName ?? row.contactFullName ?? "Unknown",
    channel: row.channel,
    status: row.status,
    unreadCount: row.unreadCount,
    lastMessageAt: iso(row.lastMessageAt),
    lastMessagePreview: row.lastMessagePreview,
    contactId: row.contactId,
    assignedTo: row.assigneeId ? { id: row.assigneeId, name: row.assigneeName ?? row.assigneeEmail ?? "Teammate" } : null
  }));

  const body: ConversationListResponse = {
    conversations,
    total: totalRow?.value ?? 0,
    unreadTotal: unreadRow?.value ?? 0,
    assignees: assigneeRows.map((row) => ({ id: row.id, name: row.fullName ?? row.email }))
  };

  return jsonOk(body);
});
