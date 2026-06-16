import { schema } from "@aiesec/db";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, Mail, Phone, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { addNote, deleteContact, updateContact } from "../actions";

const TYPE_LABELS: Record<string, string> = { candidate: "Candidate", company: "Company", lc_partner: "LC Partner", other: "Other" };
const TYPE_BADGE: Record<string, string> = { candidate: "badge badge-blue", company: "badge badge-green", lc_partner: "badge badge-violet", other: "badge badge-grey" };
const STAGE_BADGE: Record<string, string> = { sign_up: "badge badge-grey", applied: "badge badge-blue", matched: "badge badge-teal", approved: "badge badge-green", realized: "badge badge-violet", finished: "badge badge-amber", completed: "badge badge-green" };
const STAGE_LABELS: Record<string, string> = { sign_up: "Sign up", applied: "Applied", matched: "Matched", approved: "Approved", realized: "Realized", finished: "Finished", completed: "Completed" };

const ACTIVITY_LABELS: Record<string, string> = {
  created: "Contact created",
  updated: "Details updated",
  stage_changed: "Stage changed",
  note_added: "Note",
  email_sent: "Email sent",
  expa_synced: "Synced from EXPA",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  conversation_started: "Conversation started"
};

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const { user, activeMembership } = await requireMembership();
  const db = getDb();

  const [contact, tags, activities, customFieldDefs] = await Promise.all([
    db.select().from(schema.contacts)
      .where(and(eq(schema.contacts.id, params.id), eq(schema.contacts.lcId, activeMembership.lcId)))
      .limit(1)
      .then((r) => r[0]),
    db.select().from(schema.contactTags).where(eq(schema.contactTags.contactId, params.id)),
    db.select({ id: schema.contactActivities.id, type: schema.contactActivities.type, metadata: schema.contactActivities.metadata, createdAt: schema.contactActivities.createdAt })
      .from(schema.contactActivities)
      .where(eq(schema.contactActivities.contactId, params.id))
      .orderBy(desc(schema.contactActivities.createdAt))
      .limit(50),
    db.select().from(schema.customFieldDefs)
      .where(eq(schema.customFieldDefs.lcId, activeMembership.lcId))
      .orderBy(schema.customFieldDefs.displayOrder)
  ]);

  if (!contact) notFound();

  const isAdmin = activeMembership.role !== "member";
  const customFields = (contact.customFields ?? {}) as Record<string, unknown>;

  const updateWithId = updateContact.bind(null, contact.id);
  const deleteWithId = deleteContact.bind(null, contact.id);
  const addNoteWithId = addNote.bind(null, contact.id);

  return (
    <div className="content">
      <Link href="/contacts" className="button ghost" style={{ marginBottom: 16, display: "inline-flex" }}>
        <ArrowLeft size={13} /> Back to contacts
      </Link>

      <section className="page-heading">
        <div>
          <span className="eyebrow">Contact</span>
          <h1>{contact.fullName}</h1>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <span className={TYPE_BADGE[contact.type] ?? "badge badge-grey"}>{TYPE_LABELS[contact.type] ?? contact.type}</span>
            {contact.funnelStage && (
              <span className={STAGE_BADGE[contact.funnelStage] ?? "badge badge-grey"}>{STAGE_LABELS[contact.funnelStage]}</span>
            )}
            {contact.programme && <span className="badge badge-grey">{contact.programme.toUpperCase()}</span>}
          </div>
        </div>
        <div className="heading-actions">
          {isAdmin && (
            <form action={deleteWithId}>
              <button className="button danger" type="submit">Delete</button>
            </form>
          )}
        </div>
      </section>

      <div className="contact-detail-grid">
        <div>
          <article className="card compact-card">
            <h2>Details</h2>
            {contact.email && (
              <div className="scope-row">
                <span><Mail size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Email</span>
                <strong><a href={`mailto:${contact.email}`}>{contact.email}</a></strong>
              </div>
            )}
            {contact.phone && (
              <div className="scope-row">
                <span><Phone size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Phone</span>
                <strong>{contact.phone}</strong>
              </div>
            )}
            {contact.nationality && (
              <div className="scope-row"><span>Nationality</span><strong>{contact.nationality}</strong></div>
            )}
            {contact.homeCommitteeId && (
              <div className="scope-row"><span>Home Committee</span><strong>{contact.homeCommitteeId}</strong></div>
            )}
            <div className="scope-row"><span>Source</span><strong>{contact.source}</strong></div>
            {contact.expaPersonId && (
              <div className="scope-row"><span>EXPA ID</span><strong>{contact.expaPersonId}</strong></div>
            )}
            <div className="scope-row">
              <span>Added</span>
              <strong>{contact.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</strong>
            </div>
          </article>

          {isAdmin && (
            <article className="card compact-card" style={{ marginTop: 14 }}>
              <h2>Edit details</h2>
              <form action={updateWithId} className="stacked-form" style={{ marginTop: 12 }}>
                <label>Full name<input name="fullName" defaultValue={contact.fullName} required /></label>
                <label>Email<input name="email" type="email" defaultValue={contact.email ?? ""} /></label>
                <label>Phone<input name="phone" defaultValue={contact.phone ?? ""} /></label>
                <label>
                  Type
                  <select name="type" defaultValue={contact.type}>
                    <option value="candidate">Candidate</option>
                    <option value="company">Company</option>
                    <option value="lc_partner">LC Partner</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Funnel stage
                  <select name="funnelStage" defaultValue={contact.funnelStage ?? ""}>
                    <option value="">Not set</option>
                    {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label>
                  Programme
                  <select name="programme" defaultValue={contact.programme ?? ""}>
                    <option value="">Not set</option>
                    <option value="gt">Global Talent (GT)</option>
                    <option value="ge">Global Entrepreneur (GE)</option>
                    <option value="gv">Global Volunteer (GV)</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>Nationality<input name="nationality" defaultValue={contact.nationality ?? ""} /></label>
                <div className="form-actions">
                  <button className="button primary" type="submit">Save changes</button>
                </div>
              </form>
            </article>
          )}

          {customFieldDefs.length > 0 && (
            <article className="card compact-card" style={{ marginTop: 14 }}>
              <h2>Custom fields</h2>
              {customFieldDefs.map((def) => (
                <div className="scope-row" key={def.id}>
                  <span>{def.name}</span>
                  <strong>{String(customFields[def.key] ?? "—")}</strong>
                </div>
              ))}
            </article>
          )}

          <article className="card compact-card" style={{ marginTop: 14 }}>
            <h2>Add note</h2>
            <form action={addNoteWithId} className="stacked-form" style={{ marginTop: 8 }}>
              <textarea name="note" rows={3} placeholder="Write a note…" />
              <div className="form-actions">
                <button className="button primary" type="submit">Save note</button>
              </div>
            </form>
          </article>
        </div>

        <div>
          {tags.length > 0 && (
            <article className="card compact-card">
              <h2><Tag size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Tags</h2>
              <div className="tags-wrap">
                {tags.map((t) => <span key={t.tag} className="tag-chip">{t.tag}</span>)}
              </div>
            </article>
          )}

          <article className="card compact-card" style={{ marginTop: tags.length > 0 ? 14 : 0 }}>
            <h2>Activity</h2>
            {activities.length === 0 ? (
              <p className="muted-note" style={{ marginTop: 8 }}>No activity yet.</p>
            ) : (
              activities.map((a) => {
                const meta = a.metadata as Record<string, unknown>;
                return (
                  <div className="activity-row" key={a.id}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{ACTIVITY_LABELS[a.type] ?? a.type}</p>
                      {a.type === "note_added" && meta.note && (
                        <p style={{ fontSize: 12.5, color: "var(--brand-text-muted)", marginTop: 2 }}>{String(meta.note)}</p>
                      )}
                      {a.type === "stage_changed" && meta.to && (
                        <p style={{ fontSize: 12, color: "var(--brand-text-muted)", marginTop: 2 }}>→ {STAGE_LABELS[String(meta.to)] ?? String(meta.to)}</p>
                      )}
                    </div>
                    <time style={{ fontSize: 11.5, color: "var(--brand-text-subtle)", whiteSpace: "nowrap" }}>
                      {a.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </time>
                  </div>
                );
              })
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
