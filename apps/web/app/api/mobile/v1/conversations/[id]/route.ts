import { updateConversationSchema, type ConversationDetailDto } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, asc, eq } from "drizzle-orm";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { replyCapability } from "../../../../../../lib/conversations/send";
import { getDb } from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

export const GET = authed<Params>(async (_request, session, { params }) => {
  const db = getDb();
  const lcId = session.membership.lcId;

  const [conversation] = await db
    .select({
      id: schema.conversations.id,
      channel: schema.conversations.channel,
      status: schema.conversations.status,
      participantName: schema.conversations.participantName,
      participantExternalId: schema.conversations.participantExternalId,
      contactId: schema.contacts.id,
      contactFullName: schema.contacts.fullName,
      contactEmail: schema.contacts.email,
      contactPhone: schema.contacts.phone,
      assigneeId: schema.users.id,
      assigneeName: schema.users.fullName,
      assigneeEmail: schema.users.email
    })
    .from(schema.conversations)
    .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
    .leftJoin(schema.users, eq(schema.conversations.assignedTo, schema.users.id))
    .where(and(eq(schema.conversations.id, params.id), eq(schema.conversations.lcId, lcId)))
    .limit(1);

  if (!conversation) return jsonError("not_found", "That conversation no longer exists.");

  const messages = await db
    .select({
      id: schema.messages.id,
      direction: schema.messages.direction,
      body: schema.messages.body,
      attachments: schema.messages.attachments,
      sentAt: schema.messages.sentAt
    })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversation.id))
    .orderBy(asc(schema.messages.sentAt))
    .limit(200);

  // Opening a thread is the read receipt, same as the web app.
  await db
    .update(schema.conversations)
    .set({ unreadCount: 0 })
    .where(and(eq(schema.conversations.id, conversation.id), eq(schema.conversations.lcId, lcId)));

  const reply = replyCapability(conversation.channel, conversation.participantExternalId);

  const body: ConversationDetailDto = {
    id: conversation.id,
    name: conversation.participantName ?? conversation.contactFullName ?? "Unknown",
    channel: conversation.channel,
    status: conversation.status,
    contact: conversation.contactId
      ? {
          id: conversation.contactId,
          fullName: conversation.contactFullName ?? "Unknown",
          email: conversation.contactEmail,
          phone: conversation.contactPhone
        }
      : null,
    assignedTo: conversation.assigneeId
      ? { id: conversation.assigneeId, name: conversation.assigneeName ?? conversation.assigneeEmail ?? "Teammate" }
      : null,
    canReply: reply.canReply,
    replyBlockedReason: reply.reason,
    messages: messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      body: message.body,
      attachments: Array.isArray(message.attachments) ? (message.attachments as unknown[]) : [],
      sentAt: message.sentAt.toISOString()
    }))
  };

  return jsonOk(body);
});

// Status changes and assignment — the two things worth doing from a phone.
export const PATCH = authed<Params>(async (request, session, { params }) => {
  const payload = await request.json().catch(() => null);
  if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

  const parsed = updateConversationSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const db = getDb();
  const lcId = session.membership.lcId;

  if (input.assignedTo) {
    // Never assign to someone outside this LC.
    const [member] = await db
      .select({ userId: schema.lcMembers.userId })
      .from(schema.lcMembers)
      .where(and(eq(schema.lcMembers.lcId, lcId), eq(schema.lcMembers.userId, input.assignedTo)))
      .limit(1);
    if (!member) return jsonError("invalid_request", "That teammate isn't a member of this LC.");
  }

  const updates: Record<string, unknown> = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.assignedTo !== undefined) updates.assignedTo = input.assignedTo;

  const updated = await db
    .update(schema.conversations)
    .set(updates)
    .where(and(eq(schema.conversations.id, params.id), eq(schema.conversations.lcId, lcId)))
    .returning({ id: schema.conversations.id });

  if (updated.length === 0) return jsonError("not_found", "That conversation no longer exists.");
  return jsonOk({ ok: true });
});
