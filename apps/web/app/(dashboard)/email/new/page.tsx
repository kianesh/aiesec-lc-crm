import Link from "next/link";
import { requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { createCampaign } from "../actions";

export default async function NewCampaignPage() {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  const smartLists = await db
    .select()
    .from(schema.smartLists)
    .where(eq(schema.smartLists.lcId, activeMembership.lcId));

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Marketing</span>
          <h1>New campaign</h1>
        </div>
      </section>

      <article className="card compact-card">
        <form action={createCampaign} className="stacked-form">
          <label>
            Campaign name <span style={{ color: "var(--brand-danger)" }}>*</span>
            <input name="name" required placeholder="October Newsletter" />
          </label>
          <label>
            Subject line <span style={{ color: "var(--brand-danger)" }}>*</span>
            <input name="subject" required placeholder="News from AIESEC Western 🌍" />
          </label>
          <label>
            From name
            <input name="fromName" defaultValue="AIESEC Western" required />
          </label>
          <label>
            From email <span style={{ color: "var(--brand-danger)" }}>*</span>
            <input name="fromEmail" type="email" required placeholder="hello@yourdomain.com" />
          </label>
          <label>
            Audience
            <select name="audienceSegmentId" defaultValue="">
              <option value="">All contacts with email</option>
              {smartLists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <p className="muted-note">You can write the email body after creating the campaign.</p>
          <div className="form-actions">
            <button className="button primary" type="submit">Create campaign</button>
            <Link href="/email" className="button ghost">Cancel</Link>
          </div>
        </form>
      </article>
    </div>
  );
}
