"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Clock, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { deleteAppointmentType, saveAppointmentType } from "./actions";
import { CopyLinkButton } from "./appointment-controls";

export type ApptType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  color: string;
  active: boolean;
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

// Shared create/edit form. `type` is undefined when adding a new type.
function TypeForm({
  type,
  bookingSlug,
  baseUrl,
  onCancel
}: {
  type?: ApptType;
  bookingSlug: string | null;
  baseUrl: string;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [slug, setSlug] = useState(type?.slug ?? "");
  const effectiveSlug =
    (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "meeting-type";

  return (
    <form action={saveAppointmentType} className="settings-form appt-type-form">
      {type && <input type="hidden" name="id" value={type.id} />}
      <label className="book-field">
        <span>Name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="OGX Consultation"
          required
          maxLength={120}
        />
      </label>
      <label className="book-field">
        <span>Description</span>
        <textarea name="description" rows={2} defaultValue={type?.description ?? ""} maxLength={2000} />
      </label>
      <label className="book-field">
        <span>Link slug</span>
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={effectiveSlug}
          maxLength={48}
        />
        {bookingSlug && (
          <small className="muted-note">
            {baseUrl}/book/{bookingSlug}/<strong>{effectiveSlug}</strong>
          </small>
        )}
      </label>
      <div className="settings-row">
        <label className="book-field">
          <span>Duration (min)</span>
          <input name="durationMinutes" type="number" min={5} max={480} defaultValue={type?.durationMinutes ?? 20} required />
        </label>
        <label className="book-field">
          <span>Buffer (min)</span>
          <input name="bufferMinutes" type="number" min={0} max={240} defaultValue={type?.bufferMinutes ?? 0} required />
        </label>
      </div>
      <div className="settings-row">
        <label className="book-field">
          <span>Min notice (hrs)</span>
          <input name="minNoticeHours" type="number" min={0} max={720} defaultValue={type?.minNoticeHours ?? 12} required />
        </label>
        <label className="book-field">
          <span>Max advance (days)</span>
          <input name="maxAdvanceDays" type="number" min={1} max={365} defaultValue={type?.maxAdvanceDays ?? 30} required />
        </label>
      </div>
      <label className="settings-checkbox">
        <input type="checkbox" name="active" defaultChecked={type?.active ?? true} /> Bookable (shown on your public page)
      </label>
      <div className="appt-type-form-actions">
        <SaveButton label={type ? "Save changes" : "Create type"} />
        {onCancel && (
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function TypeRow({ type, bookingSlug, baseUrl }: { type: ApptType; bookingSlug: string | null; baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const url = bookingSlug ? `${baseUrl}/book/${bookingSlug}/${type.slug}` : null;

  return (
    <li className="appt-type-row">
      <div className="appt-type-summary">
        <span className="appt-type-dot" style={{ background: type.color }} aria-hidden />
        <div className="appt-type-heading">
          <strong>{type.name}</strong>
          <span className="appt-type-sub">
            <Clock size={12} /> {type.durationMinutes} min
            {!type.active && <span className="badge badge-grey" style={{ marginLeft: 8 }}>Hidden</span>}
          </span>
        </div>
        <div className="appt-type-actions">
          {url && (
            <>
              <Link href={`/book/${bookingSlug}/${type.slug}`} className="button ghost" target="_blank" title="Open booking page">
                <ExternalLink size={14} />
              </Link>
              <CopyLinkButton url={url} />
            </>
          )}
          <button type="button" className="button ghost" onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} /> Edit
          </button>
        </div>
      </div>
      {open && (
        <div className="appt-type-body">
          <TypeForm type={type} bookingSlug={bookingSlug} baseUrl={baseUrl} onCancel={() => setOpen(false)} />
          <form
            action={deleteAppointmentType.bind(null, type.id)}
            onSubmit={(e) => {
              if (!confirm(`Delete "${type.name}"? Its booking link will stop working. Existing appointments are kept.`))
                e.preventDefault();
            }}
          >
            <button type="submit" className="button ghost danger" style={{ fontSize: 12 }}>
              <Trash2 size={13} /> Delete type
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

export function AppointmentTypesEditor({
  types,
  bookingSlug,
  baseUrl
}: {
  types: ApptType[];
  bookingSlug: string | null;
  baseUrl: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="appt-types">
      {types.length === 0 && !adding && (
        <p className="muted-note" style={{ marginBottom: 12 }}>
          No appointment types yet. Add one (e.g. <strong>OGX Consultation</strong>) to open your booking page.
        </p>
      )}

      {types.length > 0 && (
        <ul className="appt-type-list">
          {types.map((t) => (
            <TypeRow key={t.id} type={t} bookingSlug={bookingSlug} baseUrl={baseUrl} />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="appt-type-new card" style={{ padding: 16, marginTop: 12 }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>New appointment type</span>
          <TypeForm bookingSlug={bookingSlug} baseUrl={baseUrl} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" className="button ghost" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
          <Plus size={15} /> New appointment type
        </button>
      )}
    </div>
  );
}
