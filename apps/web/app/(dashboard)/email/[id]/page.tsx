import { schema } from "@aiesec/db";
import { and, count, eq, sql } from "drizzle-orm";
import { ArrowLeft, Copy, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { getServerEnv } from "../../../../lib/env";
import { deleteCampaign, duplicateCampaign, sendCampaign, sendTestEmail, updateCampaign } from "../actions";

const STATUS_BADGE: Record<string, string> = {
  draft: "status-pill",
  scheduled: "status-pill",
  sending: "status-pill",
  sent: "status-pill success",
  failed: "status-pill error"
};

type SearchParams = { sent?: string; updated?: string; tested?: string; error?: string };

const ERRORS: Record<string, string> = {
  not_allowed: "Only owners and admins can manage campaigns.",
  not_sendable: "This campaign cannot be sent in its current state.",
  no_recipients: "No contacts with email addresses matched this audience.",
  send_failed: "Send failed. Check your Resend API key and sending domain.",
  no_from: "No sender address. Set a From email on the campaign or configure RESEND_FROM_EMAIL.",
  no_test_recipient: "Your account has no email address to send the test to."
};

export default async function CampaignDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const [campaign, smartLists, recipientStats] = await Promise.all([
    db
      .select()
      .from(schema.emailCampaigns)
      .where(and(eq(schema.emailCampaigns.id, params.id), eq(schema.emailCampaigns.lcId, activeMembership.lcId)))
      .limit(1)
      .then((r) => r[0]),
    db.select().from(schema.smartLists).where(eq(schema.smartLists.lcId, activeMembership.lcId)),
    db
      .select({
        status: schema.emailCampaignRecipients.status,
        count: count()
      })
      .from(schema.emailCampaignRecipients)
      .where(eq(schema.emailCampaignRecipients.campaignId, params.id))
      .groupBy(schema.emailCampaignRecipients.status)
  ]);

  if (!campaign) notFound();

  const isAdmin = activeMembership.role !== "member";
  const isDraft = campaign.status === "draft";
  const isSent = campaign.status === "sent";
  const resendReady = Boolean(getServerEnv().RESEND_API_KEY);

  const statsMap = Object.fromEntries(recipientStats.map((r) => [r.status, Number(r.count)]));
  const totalRecipients = Object.values(statsMap).reduce((a, b) => a + b, 0);

  const sendWithId = sendCampaign.bind(null, campaign.id);
  const deleteWithId = deleteCampaign.bind(null, campaign.id);
  const duplicateWithId = duplicateCampaign.bind(null, campaign.id);
  const updateWithId = updateCampaign.bind(null, campaign.id);
  const testWithId = sendTestEmail.bind(null, campaign.id);

  return (
    <div className="content">
      <Link href="/email" className="button ghost" style={{ marginBottom: 16, display: "inline-flex" }}>
        <ArrowLeft size={13} /> Back to campaigns
      </Link>

      {searchParams.sent && <p className="success-note page-note">Campaign sent to {totalRecipients} recipient(s).</p>}
      {searchParams.updated && <p className="success-note page-note">Campaign updated.</p>}
      {searchParams.tested && <p className="success-note page-note">Test email sent to {searchParams.tested}.</p>}
      {searchParams.error && <p className="form-error page-note">{ERRORS[searchParams.error] ?? searchParams.error}</p>}
      {!resendReady && (
        <p className="form-error page-note">
          Resend isn’t configured. Set <code>RESEND_API_KEY</code> (and a verified sending domain) before sending.
        </p>
      )}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Email Campaign</span>
          <h1>{campaign.name}</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <span className={STATUS_BADGE[campaign.status] ?? "status-pill"}>{campaign.status}</span>
            <span className="muted-note">{campaign.fromName} &lt;{campaign.fromEmail}&gt;</span>
          </div>
        </div>
        <div className="heading-actions">
          {isAdmin && (
            <>
              <form action={duplicateWithId}>
                <button className="button secondary" type="submit"><Copy size={13} /> Duplicate</button>
              </form>
              <form action={testWithId}>
                <button className="button secondary" type="submit" disabled={!resendReady}><Send size={13} /> Send test</button>
              </form>
              {isDraft && (
                <>
                  <form action={deleteWithId}>
                    <button className="button danger" type="submit"><Trash2 size={13} /> Delete</button>
                  </form>
                  <form action={sendWithId}>
                    <button className="button primary" type="submit"><Send size={13} /> Send now</button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </section>

      <div className="dashboard-grid">
        <article className="card chart-card">
          <div className="card-header">
            <div>
              <h2>Email preview</h2>
              <p className="muted-note">{campaign.subject}</p>
            </div>
          </div>
          <div className="campaign-preview">
            {campaign.bodyHtml ? (
              <div dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }} />
            ) : (
              <p className="muted-note">No content yet. Edit the campaign to add body HTML.</p>
            )}
          </div>

          {isAdmin && isDraft && (
            <details style={{ marginTop: 20 }}>
              <summary className="button ghost" style={{ cursor: "pointer", display: "inline-flex", marginBottom: 12 }}>Edit campaign</summary>
              <form action={updateWithId} className="stacked-form">
                <label>Campaign name<input name="name" defaultValue={campaign.name} required /></label>
                <label>Subject<input name="subject" defaultValue={campaign.subject} required /></label>
                <label>From name<input name="fromName" defaultValue={campaign.fromName} required /></label>
                <label>From email<input name="fromEmail" type="email" defaultValue={campaign.fromEmail} required /></label>
                <label>
                  Audience
                  <select name="audienceSegmentId" defaultValue={campaign.audienceSegmentId ?? ""}>
                    <option value="">All contacts with email</option>
                    {smartLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label>
                  Body HTML
                  <textarea name="bodyHtml" rows={12} defaultValue={campaign.bodyHtml} style={{ fontFamily: "monospace", fontSize: 12 }} />
                </label>
                <div className="form-actions">
                  <button className="button primary" type="submit">Save changes</button>
                </div>
              </form>
            </details>
          )}
        </article>

        <div>
          <article className="card compact-card">
            <h2>Details</h2>
            <div className="scope-row"><span>Status</span><strong>{campaign.status}</strong></div>
            <div className="scope-row"><span>From</span><strong>{campaign.fromName}</strong></div>
            <div className="scope-row"><span>Audience</span><strong>{campaign.audienceSegmentId ? smartLists.find((l) => l.id === campaign.audienceSegmentId)?.name ?? "Saved list" : "All contacts"}</strong></div>
            <div className="scope-row"><span>Scheduled</span><strong>{campaign.scheduledFor ? campaign.scheduledFor.toLocaleString() : "Not scheduled"}</strong></div>
            <div className="scope-row"><span>Sent</span><strong>{campaign.sentAt ? campaign.sentAt.toLocaleString() : "Not sent yet"}</strong></div>
          </article>

          {isSent && totalRecipients > 0 && (
            <article className="card compact-card" style={{ marginTop: 14 }}>
              <h2>Delivery stats</h2>
              <div className="recipient-stats">
                <div className="recipient-stat"><strong>{statsMap.sent ?? 0}</strong><small>Sent</small></div>
                <div className="recipient-stat"><strong>{statsMap.opened ?? 0}</strong><small>Opened</small></div>
                <div className="recipient-stat"><strong>{statsMap.bounced ?? 0}</strong><small>Bounced</small></div>
              </div>
              <div className="scope-row" style={{ marginTop: 10 }}><span>Total</span><strong>{totalRecipients} recipients</strong></div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
