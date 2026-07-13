import { schema } from "@aiesec/db";
import { desc, eq } from "drizzle-orm";
import { Download, RefreshCw, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { syncExpaContacts } from "./actions";
import { ImportContactsButton } from "./import-button";
import { ContactsTable } from "./contacts-table";

type SearchParams = {
  list?: string;
  q?: string;
  type?: string;
  stage?: string;
  synced?: string;
  error?: string;
  imported?: string;
  updated?: string;
  skipped?: string;
  deleted?: string;
};

const STAGE_LABELS: Record<string, string> = { sign_up: "Sign up", applied: "Applied", matched: "Matched", approved: "Approved", realized: "Realized", finished: "Finished", completed: "Completed" };

const BUILT_IN_LISTS = [
  { id: "candidates", label: "Candidates", type: "candidate" },
  { id: "companies", label: "Companies", type: "company" },
  { id: "lc_partners", label: "LC Partners", type: "lc_partner" }
];

const ERRORS: Record<string, string> = {
  missing_expa_connection: "Connect EXPA before syncing contacts.",
  missing_expa_committee: "Add an EXPA committee ID in integrations.",
  not_allowed: "Only owners and admins can perform this action.",
  sync_failed: "EXPA sync failed. Check your token in integrations.",
  import_no_file: "Choose a CSV file to import.",
  import_failed: "Could not read that CSV. Check the file and try again.",
  nothing_to_change: "Pick at least one field to change in the bulk edit."
};

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const [allSmartLists, allContacts] = await Promise.all([
    db.select().from(schema.smartLists).where(eq(schema.smartLists.lcId, activeMembership.lcId)).orderBy(schema.smartLists.createdAt),
    db.select({ id: schema.contacts.id, fullName: schema.contacts.fullName, email: schema.contacts.email, type: schema.contacts.type, funnelStage: schema.contacts.funnelStage, programme: schema.contacts.programme, source: schema.contacts.source, createdAt: schema.contacts.createdAt })
      .from(schema.contacts)
      .where(eq(schema.contacts.lcId, activeMembership.lcId))
      .orderBy(desc(schema.contacts.createdAt))
  ]);

  let contacts = allContacts;
  const activeList = searchParams.list;
  const query = searchParams.q?.toLowerCase();

  if (activeList) {
    const builtIn = BUILT_IN_LISTS.find((l) => l.id === activeList);
    if (builtIn) {
      contacts = contacts.filter((c) => c.type === builtIn.type);
    } else {
      const saved = allSmartLists.find((l) => l.id === activeList);
      if (saved) {
        const f = saved.filters as Record<string, string[]>;
        if (f.type?.length) contacts = contacts.filter((c) => f.type.includes(c.type));
        if (f.funnelStage?.length) contacts = contacts.filter((c) => c.funnelStage != null && f.funnelStage.includes(c.funnelStage));
        if (f.programme?.length) contacts = contacts.filter((c) => c.programme != null && f.programme.includes(c.programme));
      }
    }
  }
  if (searchParams.type) contacts = contacts.filter((c) => c.type === searchParams.type);
  if (searchParams.stage) contacts = contacts.filter((c) => c.funnelStage === searchParams.stage);
  if (query) contacts = contacts.filter((c) => c.fullName.toLowerCase().includes(query) || c.email?.toLowerCase().includes(query));

  return (
    <div className="contacts-layout">
      <aside className="contacts-sidebar">
        <span className="eyebrow">Smart Lists</span>
        <Link href="/contacts" className={`smart-list-item${!activeList ? " active" : ""}`}>
          <Users size={14} /> All Contacts <em>{allContacts.length}</em>
        </Link>
        <div className="smart-list-divider" />
        <span className="eyebrow" style={{ paddingTop: 0 }}>Built-in</span>
        {BUILT_IN_LISTS.map((list) => (
          <Link key={list.id} href={`/contacts?list=${list.id}`} className={`smart-list-item${activeList === list.id ? " active" : ""}`}>
            {list.label} <em>{allContacts.filter((c) => c.type === list.type).length}</em>
          </Link>
        ))}
        {allSmartLists.length > 0 && (
          <>
            <div className="smart-list-divider" />
            <span className="eyebrow" style={{ paddingTop: 0 }}>Saved</span>
            {allSmartLists.map((list) => (
              <Link key={list.id} href={`/contacts?list=${list.id}`} className={`smart-list-item${activeList === list.id ? " active" : ""}`}>
                {list.name}
              </Link>
            ))}
          </>
        )}
      </aside>

      <div className="contacts-main">
        {searchParams.synced && <p className="success-note page-note">{searchParams.synced} contact(s) synced from EXPA.</p>}
        {searchParams.imported !== undefined && (
          <p className="success-note page-note">
            Import complete — {searchParams.imported} added, {searchParams.updated ?? 0} updated
            {searchParams.skipped && Number(searchParams.skipped) > 0 ? `, ${searchParams.skipped} skipped (no name)` : ""}.
          </p>
        )}
        {searchParams.deleted && <p className="success-note page-note">Deleted {searchParams.deleted} contact(s).</p>}
        {searchParams.updated && searchParams.imported === undefined && <p className="success-note page-note">Updated {searchParams.updated} contact(s).</p>}
        {searchParams.error && <p className="form-error page-note">{ERRORS[searchParams.error] ?? searchParams.error}</p>}

        <section className="page-heading">
          <div>
            <span className="eyebrow">CRM</span>
            <h1>Contacts</h1>
            <p>{contacts.length} of {allContacts.length} contacts</p>
          </div>
          <div className="heading-actions">
            <a className="button secondary" href="/api/contacts/export"><Download size={13} /> Export CSV</a>
            <ImportContactsButton />
            <form action={syncExpaContacts}>
              <button className="button secondary" type="submit"><RefreshCw size={13} /> Sync EXPA</button>
            </form>
            <Link href="/contacts/new" className="button primary"><UserPlus size={13} /> Add contact</Link>
          </div>
        </section>

        <div className="contacts-filter-bar">
          <form method="get" style={{ display: "contents" }}>
            {activeList && <input type="hidden" name="list" value={activeList} />}
            <input type="search" name="q" defaultValue={searchParams.q} placeholder="Search by name or email…" />
            <select name="type" defaultValue={searchParams.type ?? ""}>
              <option value="">All types</option>
              <option value="candidate">Candidate</option>
              <option value="company">Company</option>
              <option value="lc_partner">LC Partner</option>
              <option value="other">Other</option>
            </select>
            <select name="stage" defaultValue={searchParams.stage ?? ""}>
              <option value="">All stages</option>
              {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="button secondary" type="submit">Filter</button>
            <Link href="/contacts" className="button ghost">Clear</Link>
          </form>
        </div>

        <ContactsTable
          canManage={activeMembership.role !== "member"}
          contacts={contacts.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            email: c.email,
            type: c.type,
            funnelStage: c.funnelStage,
            programme: c.programme,
            source: c.source,
            createdAt: c.createdAt.toISOString()
          }))}
        />
      </div>
    </div>
  );
}
