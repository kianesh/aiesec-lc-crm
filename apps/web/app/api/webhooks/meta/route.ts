import { createHmac, timingSafeEqual } from "node:crypto";
import { schema } from "@aiesec/db";
import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { notifyLcMembers } from "../../../../lib/push";

export const runtime = "nodejs";

// Verify Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the
// Instagram app secret). Returns true when no secret is configured (dev only).
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) return true; // not enforced until the secret is set
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Meta sends a GET to verify the webhook endpoint on first setup.
// Respond with hub.challenge when the verify token matches.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Meta sends POST events for new messages.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }
  let body: { object?: string; entry?: MetaEntry[] } | null = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    await handleMetaWebhook(body);
  } catch (err) {
    console.error("[meta-webhook] error:", err);
  }

  // Always return 200 quickly — Meta will retry on failure
  return NextResponse.json({ ok: true });
}

type MetaEntry = {
  id: string;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message?: { mid?: string; text?: string };
  }>;
  changes?: Array<{
    value?: {
      from?: { id?: string; username?: string; name?: string };
      item?: string;
      verb?: string;
      message?: string;
      mid?: string;
      timestamp?: number;
    };
    field?: string;
  }>;
};

async function handleMetaWebhook(payload: { object?: string; entry?: MetaEntry[] }) {
  const db = getDb();
  const entries = payload.entry ?? [];

  for (const entry of entries) {
    // Instagram messaging (DMs via Messenger API for Instagram)
    if (payload.object === "instagram" || payload.object === "page") {
      const messagingEvents = entry.messaging ?? [];
      for (const event of messagingEvents) {
        if (!event.message?.text) continue;

        const senderId = event.sender?.id;
        const threadId = senderId ?? entry.id;
        const mid = event.message.mid;
        const text = event.message.text;
        const ts = event.timestamp ? new Date(event.timestamp) : new Date();

        // Find the LC with a connected Meta integration
        const [integration] = await db
          .select({ lcId: schema.integrations.lcId, config: schema.integrations.config })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.provider, "meta"),
              eq(schema.integrations.status, "connected")
            )
          )
          .limit(1);

        if (!integration) continue;

        // Find or create conversation
        let [conversation] = await db
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.lcId, integration.lcId),
              eq(schema.conversations.externalThreadId, threadId)
            )
          )
          .limit(1);

        if (!conversation) {
          [conversation] = await db
            .insert(schema.conversations)
            .values({
              lcId: integration.lcId,
              channel: "instagram",
              status: "open",
              externalThreadId: threadId,
              participantExternalId: senderId ?? null,
              lastMessageAt: ts,
              unreadCount: 1
            })
            .returning({ id: schema.conversations.id });
        } else {
          await db
            .update(schema.conversations)
            .set({ lastMessageAt: ts, unreadCount: sql<number>`unread_count + 1`, status: "open" })
            .where(eq(schema.conversations.id, conversation.id));
        }

        // Deduplicate by externalMessageId
        if (mid) {
          const [existing] = await db
            .select({ id: schema.messages.id })
            .from(schema.messages)
            .where(eq(schema.messages.externalMessageId, mid))
            .limit(1);
          if (existing) continue;
        }

        await db.insert(schema.messages).values({
          conversationId: conversation.id,
          direction: "in",
          body: text,
          sentAt: ts,
          externalMessageId: mid ?? null
        });

        // Wake the mobile app. Best-effort — notifyLcMembers swallows its own
        // errors so a push outage can't cost us the message we just stored.
        const [participant] = await db
          .select({ name: schema.conversations.participantName })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversation.id))
          .limit(1);

        await notifyLcMembers(db, integration.lcId, {
          title: participant?.name ? `New DM from ${participant.name}` : "New Instagram DM",
          body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
          data: { kind: "conversation", conversationId: conversation.id, lcId: integration.lcId }
        });
      }
    }
  }
}
