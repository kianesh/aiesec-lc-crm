"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { bulkDeleteContacts, bulkUpdateContacts } from "./actions";

export type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  type: string;
  funnelStage: string | null;
  programme: string | null;
  source: string;
  createdAt: string; // ISO
};

const TYPE_LABELS: Record<string, string> = { candidate: "Candidate", company: "Company", lc_partner: "LC Partner", other: "Other" };
const TYPE_BADGE: Record<string, string> = { candidate: "badge badge-blue", company: "badge badge-green", lc_partner: "badge badge-violet", other: "badge badge-grey" };
const STAGE_LABELS: Record<string, string> = { sign_up: "Sign up", applied: "Applied", matched: "Matched", approved: "Approved", realized: "Realized", finished: "Finished", completed: "Completed" };
const STAGE_BADGE: Record<string, string> = { sign_up: "badge badge-grey", applied: "badge badge-blue", matched: "badge badge-teal", approved: "badge badge-green", realized: "badge badge-violet", finished: "badge badge-amber", completed: "badge badge-green" };

export function ContactsTable({ contacts, canManage }: { contacts: ContactRow[]; canManage: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const ids = useMemo(() => [...selected].join(","), [selected]);
  const allSelected = contacts.length > 0 && selected.size === contacts.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))));
  }
  function clear() {
    setSelected(new Set());
    setEditing(false);
  }

  return (
    <>
      {canManage && selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <button type="button" className="button secondary" onClick={() => setEditing((v) => !v)}>
            <Pencil size={13} /> Edit
          </button>
          <form
            action={bulkDeleteContacts}
            onSubmit={(e) => { if (!confirm(`Delete ${selected.size} contact(s)? This can't be undone.`)) e.preventDefault(); }}
          >
            <input type="hidden" name="ids" value={ids} />
            <button type="submit" className="button ghost danger"><Trash2 size={13} /> Delete</button>
          </form>
          <button type="button" className="button ghost" onClick={clear}><X size={13} /> Clear</button>
        </div>
      )}

      {canManage && editing && selected.size > 0 && (
        <form action={bulkUpdateContacts} className="bulk-edit card">
          <input type="hidden" name="ids" value={ids} />
          <span className="muted-note">Set fields for {selected.size} contact(s) — leave blank to keep as-is:</span>
          <div className="bulk-edit-fields">
            <label>Type
              <select name="type" defaultValue="">
                <option value="">Keep</option>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>Stage
              <select name="funnelStage" defaultValue="">
                <option value="">Keep</option>
                {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>Programme
              <select name="programme" defaultValue="">
                <option value="">Keep</option>
                {["gt", "ge", "gv", "other"].map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
              </select>
            </label>
            <button type="submit" className="button primary">Apply</button>
          </div>
        </form>
      )}

      <article className="card">
        {contacts.length === 0 ? (
          <div className="data-table-empty"><p>No contacts found.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {canManage && <th style={{ width: 34 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>}
                <th>Name</th><th>Type</th><th>Stage</th><th>Programme</th><th>Email</th><th>Source</th><th>Added</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className={selected.has(c.id) ? "row-selected" : ""}>
                  {canManage && <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.fullName}`} /></td>}
                  <td><Link href={`/contacts/${c.id}`}>{c.fullName}</Link></td>
                  <td><span className={TYPE_BADGE[c.type] ?? "badge badge-grey"}>{TYPE_LABELS[c.type] ?? c.type}</span></td>
                  <td>{c.funnelStage ? <span className={STAGE_BADGE[c.funnelStage] ?? "badge badge-grey"}>{STAGE_LABELS[c.funnelStage]}</span> : <span className="muted-note">—</span>}</td>
                  <td>{c.programme ? <span className="badge badge-grey">{c.programme.toUpperCase()}</span> : <span className="muted-note">—</span>}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`} style={{ color: "var(--brand-text-muted)", fontWeight: 400 }}>{c.email}</a> : <span className="muted-note">—</span>}</td>
                  <td><span className="badge badge-grey">{c.source}</span></td>
                  <td style={{ color: "var(--brand-text-muted)", fontSize: 12 }}>{new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}
