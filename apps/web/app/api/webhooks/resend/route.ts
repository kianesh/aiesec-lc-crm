import { createHmac, timingSafeEqual } from "node:crypto";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";

export const runtime = "nodejs";

// Resend signs webhooks with Svix. The signed content is
// `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256'd with the base64
// secret (the part after "whsec_"), compared against the v1 signatures.
function verifySvix(rawBody: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // not enforced until the secret is set
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // Header format: "v1,<sig> v1,<sig2> ..." — accept if any matches.
  return signatureHeader.split(" ").some((part) => {
    const sig = part.startsWith("v1,") ? part.slice(3) : part;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

// Map a Resend event type to a recipient status + timestamp column.
const STATUS_BY_EVENT: Record<string, { status: string; stamp?: "openedAt" | "bouncedAt" }> = {
  "email.sent": { status: "sent" },
  "email.delivered": { status: "delivered" },
  "email.opened": { status: "opened", stamp: "openedAt" },
  "email.clicked": { status: "clicked" },
  "email.bounced": { status: "bounced", stamp: "bouncedAt" },
  "email.complained": { status: "complained" }
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySvix(rawBody, request.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const mapping = event.type ? STATUS_BY_EVENT[event.type] : undefined;
  const emailId = event.data?.email_id;
  if (!mapping || !emailId) return NextResponse.json({ ok: true });

  try {
    const db = getDb();
    const updates: Partial<typeof schema.emailCampaignRecipients.$inferInsert> = { status: mapping.status };
    if (mapping.stamp === "openedAt") updates.openedAt = new Date();
    if (mapping.stamp === "bouncedAt") updates.bouncedAt = new Date();
    await db
      .update(schema.emailCampaignRecipients)
      .set(updates)
      .where(eq(schema.emailCampaignRecipients.resendMessageId, emailId));
  } catch (err) {
    console.error("[resend-webhook] error:", err);
  }

  return NextResponse.json({ ok: true });
}
