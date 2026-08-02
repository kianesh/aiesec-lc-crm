import { sendMessageSchema, type SendMessageResponse } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { authed } from "../../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../../lib/api/respond";
import { deliverReply } from "../../../../../../../lib/conversations/send";
import { getDb } from "../../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

export const POST = authed<Params>(async (request, session, { params }) => {
  const payload = await request.json().catch(() => null);
  if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

  const parsed = sendMessageSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  const db = getDb();
  const lcId = session.membership.lcId;

  const [conversation] = await db
    .select({
      id: schema.conversations.id,
      channel: schema.conversations.channel,
      participantExternalId: schema.conversations.participantExternalId
    })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, params.id), eq(schema.conversations.lcId, lcId)))
    .limit(1);

  if (!conversation) return jsonError("not_found", "That conversation no longer exists.");

  const result = await deliverReply(db, lcId, conversation, parsed.data.body);
  if (!result.ok) {
    return jsonError(
      result.error === "no_recipient" ? "invalid_request" : "server_error",
      result.error === "no_recipient"
        ? "This thread has no reachable sender ID."
        : "Instagram rejected the message. Check the connection in Integrations."
    );
  }

  const body: SendMessageResponse = {
    message: {
      id: result.messageId,
      direction: "out",
      body: parsed.data.body,
      attachments: [],
      sentAt: result.sentAt.toISOString()
    },
    delivered: result.delivered,
    deliveryError: result.deliveryError
  };

  return jsonOk(body, { status: 201 });
});
