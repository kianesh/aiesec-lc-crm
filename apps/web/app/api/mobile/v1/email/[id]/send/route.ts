import { sendCampaignSchema, type SendCampaignResponse } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { authed } from "../../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";
import {
  SEND_ERROR_MESSAGES,
  resolveRecipients,
  sendCampaignNow,
  sendCampaignTest
} from "../../../../../../../lib/email/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Resend is called once per recipient, sequentially. A few hundred contacts
// won't fit in the default budget.
export const maxDuration = 300;

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

export const POST = authed<Params>(
  async (request, session, { params }) => {
    const payload = await request.json().catch(() => null);
    if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

    const parsed = sendCampaignSchema.safeParse(payload);
    if (!parsed.success) return zodError(parsed.error);

    const db = getDb();
    const lcId = session.membership.lcId;

    if (parsed.data.mode === "test") {
      if (!session.email) return jsonError("invalid_request", "Your account has no email address to test to.");
      const result = await sendCampaignTest(db, lcId, params.id, session.email);
      if (!result.ok) {
        return jsonError(result.error === "not_found" ? "not_found" : "server_error", SEND_ERROR_MESSAGES[result.error]);
      }
      const body: SendCampaignResponse = { ok: true, sent: 1, failed: 0 };
      return jsonOk(body);
    }

    // A real send is irreversible and goes to people outside the LC, so it
    // isn't allowed to proceed on a stale audience count. If contacts were
    // added or removed since the confirmation dialog was drawn, bail and make
    // the sender confirm the new number.
    if (parsed.data.confirmRecipientCount !== undefined) {
      const [campaign] = await db
        .select()
        .from(schema.emailCampaigns)
        .where(and(eq(schema.emailCampaigns.id, params.id), eq(schema.emailCampaigns.lcId, lcId)))
        .limit(1);
      if (!campaign) return jsonError("not_found", SEND_ERROR_MESSAGES.not_found);

      const recipients = await resolveRecipients(db, lcId, campaign);
      if (recipients.length !== parsed.data.confirmRecipientCount) {
        return jsonError(
          "conflict",
          `The audience changed to ${recipients.length} contact${recipients.length === 1 ? "" : "s"} since you opened this. Review it and send again.`
        );
      }
    }

    const result = await sendCampaignNow(db, lcId, params.id);
    if (!result.ok) {
      const code =
        result.error === "not_found" ? "not_found" : result.error === "send_failed" ? "server_error" : "invalid_request";
      return jsonError(code, SEND_ERROR_MESSAGES[result.error]);
    }

    const body: SendCampaignResponse = { ok: true, sent: result.sent, failed: result.failed };
    return jsonOk(body);
  },
  { capability: "send_campaigns" }
);
