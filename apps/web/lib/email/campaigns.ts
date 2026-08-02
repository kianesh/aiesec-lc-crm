import { schema } from "@aiesec/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { Resend } from "resend";
import type { getDb } from "../db";

type Db = ReturnType<typeof getDb>;

export type Recipient = { id: string; email: string; fullName: string };

type Campaign = typeof schema.emailCampaigns.$inferSelect;

/**
 * Resolve who a campaign would go to.
 *
 * Exposed separately from the send so the mobile app can show a real recipient
 * count in its confirmation dialog — "send to 214 people" is a decision someone
 * can make on a phone; "send" alone is not.
 */
export async function resolveRecipients(db: Db, lcId: string, campaign: Campaign): Promise<Recipient[]> {
  const rows = await db
    .select({
      id: schema.contacts.id,
      email: schema.contacts.email,
      fullName: schema.contacts.fullName,
      type: schema.contacts.type,
      funnelStage: schema.contacts.funnelStage,
      programme: schema.contacts.programme
    })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.lcId, lcId), isNotNull(schema.contacts.email)));

  let filtered = rows;

  if (campaign.audienceSegmentId) {
    const [list] = await db
      .select({ filters: schema.smartLists.filters })
      .from(schema.smartLists)
      .where(eq(schema.smartLists.id, campaign.audienceSegmentId))
      .limit(1);

    // A segment that no longer exists must not silently widen the audience to
    // everyone — treat it as "nobody" and let the caller surface it.
    if (!list) return [];

    const filters = (list.filters ?? {}) as Record<string, string[] | undefined>;
    filtered = rows.filter((row) => {
      if (filters.type?.length && !filters.type.includes(row.type)) return false;
      if (filters.funnelStage?.length && (!row.funnelStage || !filters.funnelStage.includes(row.funnelStage))) {
        return false;
      }
      if (filters.programme?.length && (!row.programme || !filters.programme.includes(row.programme))) return false;
      return true;
    });
  }

  return filtered.flatMap((row) => (row.email ? [{ id: row.id, email: row.email, fullName: row.fullName }] : []));
}

/** `stats` is free-form JSON on the row; coerce it to the two numbers we show. */
export function readStats(value: unknown): { sent: number; failed: number } {
  const stats = (value ?? {}) as Record<string, unknown>;
  return {
    sent: typeof stats.sent === "number" ? stats.sent : 0,
    failed: typeof stats.failed === "number" ? stats.failed : 0
  };
}

/**
 * Flatten campaign HTML into readable plain text.
 *
 * The mobile app has no HTML renderer and a WebView for a preview would be
 * heavy, so the detail screen shows this instead. Deliberately lossy — it's a
 * preview, not a rendering.
 */
export function htmlToPreview(html: string, limit = 2000): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function fromAddress(campaign: Pick<Campaign, "fromName" | "fromEmail">): string | null {
  if (campaign.fromEmail) return `${campaign.fromName} <${campaign.fromEmail}>`;
  return process.env.RESEND_FROM_EMAIL ?? null;
}

export type SendError = "not_found" | "not_sendable" | "no_recipients" | "no_from" | "send_failed";

export type SendResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; error: SendError; sent?: number; failed?: number };

export const SEND_ERROR_MESSAGES: Record<SendError, string> = {
  not_found: "That campaign no longer exists.",
  not_sendable: "Only draft campaigns can be sent.",
  no_recipients: "No contacts match this campaign's audience.",
  no_from: "No sender address configured. Set one on the campaign or RESEND_FROM_EMAIL.",
  send_failed: "Resend rejected every message. Check the API key and sender domain."
};

/**
 * Send a draft campaign to its resolved audience.
 *
 * Shared by the web action and the mobile API. Unlike the web version this
 * returns a result instead of redirecting, and it never throws — the caller
 * decides how to report a partial send (some recipients delivered, some not).
 */
export async function sendCampaignNow(db: Db, lcId: string, campaignId: string): Promise<SendResult> {
  const [campaign] = await db
    .select()
    .from(schema.emailCampaigns)
    .where(and(eq(schema.emailCampaigns.id, campaignId), eq(schema.emailCampaigns.lcId, lcId)))
    .limit(1);

  if (!campaign) return { ok: false, error: "not_found" };
  if (campaign.status !== "draft") return { ok: false, error: "not_sendable" };

  const recipients = await resolveRecipients(db, lcId, campaign);
  if (recipients.length === 0) return { ok: false, error: "no_recipients" };

  const from = fromAddress(campaign);
  if (!from) return { ok: false, error: "no_from" };

  await db.update(schema.emailCampaigns).set({ status: "sending" }).where(eq(schema.emailCampaigns.id, campaignId));

  let sent = 0;
  let failed = 0;
  let fatal = false;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    for (const recipient of recipients) {
      const { data, error } = await resend.emails.send({
        from,
        to: [recipient.email],
        subject: campaign.subject,
        html: campaign.bodyHtml
      });
      await db.insert(schema.emailCampaignRecipients).values({
        campaignId,
        contactId: recipient.id,
        email: recipient.email,
        status: error ? "failed" : "sent",
        resendMessageId: data?.id ?? null,
        sentAt: error ? null : new Date()
      });
      if (error) failed += 1;
      else sent += 1;
    }
  } catch {
    fatal = true;
  }

  if (fatal || sent === 0) {
    await db
      .update(schema.emailCampaigns)
      .set({ status: "failed", stats: { sent, failed }, updatedAt: new Date() })
      .where(eq(schema.emailCampaigns.id, campaignId));
    return { ok: false, error: "send_failed", sent, failed };
  }

  await db
    .update(schema.emailCampaigns)
    .set({ status: "sent", sentAt: new Date(), stats: { sent, failed }, updatedAt: new Date() })
    .where(eq(schema.emailCampaigns.id, campaignId));

  return { ok: true, sent, failed };
}

/** Send the campaign to a single address, subject-prefixed with [TEST]. */
export async function sendCampaignTest(db: Db, lcId: string, campaignId: string, to: string): Promise<SendResult> {
  const [campaign] = await db
    .select()
    .from(schema.emailCampaigns)
    .where(and(eq(schema.emailCampaigns.id, campaignId), eq(schema.emailCampaigns.lcId, lcId)))
    .limit(1);

  if (!campaign) return { ok: false, error: "not_found" };

  const from = fromAddress(campaign);
  if (!from) return { ok: false, error: "no_from" };

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: `[TEST] ${campaign.subject}`,
      html: campaign.bodyHtml || "<p>(no content yet)</p>"
    });
    if (error) return { ok: false, error: "send_failed" };
  } catch {
    return { ok: false, error: "send_failed" };
  }

  return { ok: true, sent: 1, failed: 0 };
}
