import { schema } from "@aiesec/db";
import { desc, eq } from "drizzle-orm";
import { Mail, Plus } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";

const STATUS_BADGE: Record<string, string> = {
  draft: "status-pill",
  scheduled: "status-pill",
  sending: "status-pill",
  sent: "status-pill success",
  failed: "status-pill error"
};

export default async function EmailPage() {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const campaigns = await db
    .select()
    .from(schema.emailCampaigns)
    .where(eq(schema.emailCampaigns.lcId, activeMembership.lcId))
    .orderBy(desc(schema.emailCampaigns.createdAt));

  const totalSent = campaigns.reduce((sum, c) => sum + ((c.stats as { sent?: number }).sent ?? 0), 0);
  const drafts = campaigns.filter((c) => c.status === "draft").length;
  const sentCampaigns = campaigns.filter((c) => c.status === "sent").length;

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Marketing</span>
          <h1>Email Campaigns</h1>
          <p>Send newsletters and updates to your contacts via Resend.</p>
        </div>
        <div className="heading-actions">
          <Link href="/email/new" className="button primary"><Plus size={13} /> New campaign</Link>
        </div>
      </section>

      <section className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 20 }}>
        <article className="card kpi-card">
          <div><span className="eyebrow">Total sent</span><Mail size={18} /></div>
          <strong>{totalSent}</strong>
          <p>Across all campaigns</p>
        </article>
        <article className="card kpi-card">
          <div><span className="eyebrow">Campaigns sent</span><Mail size={18} /></div>
          <strong>{sentCampaigns}</strong>
          <p>Completed sends</p>
        </article>
        <article className="card kpi-card">
          <div><span className="eyebrow">Drafts</span><Mail size={18} /></div>
          <strong>{drafts}</strong>
          <p>Ready to edit or send</p>
        </article>
      </section>

      <article className="card">
        {campaigns.length === 0 ? (
          <div className="data-table-empty">
            <Mail size={28} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
            <p>No campaigns yet. Create your first one to get started.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Subject</th><th>Sent</th><th>Scheduled</th><th>Created</th></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/email/${c.id}`}>{c.name}</Link></td>
                  <td><span className={STATUS_BADGE[c.status] ?? "status-pill"}>{c.status}</span></td>
                  <td style={{ color: "var(--brand-text-muted)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</td>
                  <td style={{ color: "var(--brand-text-muted)" }}>{(c.stats as { sent?: number }).sent ?? "—"}</td>
                  <td style={{ color: "var(--brand-text-muted)", fontSize: 12 }}>{c.scheduledFor ? c.scheduledFor.toLocaleDateString() : "—"}</td>
                  <td style={{ color: "var(--brand-text-muted)", fontSize: 12 }}>{c.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  );
}
