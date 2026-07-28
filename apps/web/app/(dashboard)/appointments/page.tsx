import { schema } from "@aiesec/db";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { CalendarClock, ExternalLink, Video } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { readIntegration } from "../../../lib/connectors/store";
import { getGoogleAccessToken, listCalendarEvents, type CalendarEvent } from "../../../lib/connectors/google";
import { getAppointmentTypes, getAvailabilityRules, getBookingSettingsByLc, slugify } from "../../../lib/booking/store";
import { normalizeIntakeFields } from "../../../lib/booking/intake";
import { getSiteUrl } from "../../../lib/site-url";
import { saveBookingSettings } from "./actions";
import { AvailabilityEditor } from "./availability-editor";
import { AppointmentTypesEditor } from "./appointment-types-editor";
import { MonthCalendar } from "./appointment-calendar";
import { CancelAppointmentButton, CopyLinkButton } from "./appointment-controls";

export const dynamic = "force-dynamic";

type SearchParams = { saved?: string; error?: string; month?: string };

const ERRORS: Record<string, string> = {
  not_allowed: "Only owners and admins can manage booking settings.",
  slug_taken: "That booking link is already taken. Pick a different one.",
  bad_rules: "Availability could not be saved. Check your time windows.",
  bad_type: "That appointment type could not be saved. Check the fields.",
  type_slug_taken: "Another type already uses that link slug. Pick a different one."
};

const STATUS_BADGE: Record<string, string> = {
  confirmed: "badge badge-green",
  cancelled: "badge badge-pink",
  completed: "badge badge-blue",
  no_show: "badge badge-amber"
};

export default async function AppointmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  let settings: Awaited<ReturnType<typeof getBookingSettingsByLc>>;
  let rules: Awaited<ReturnType<typeof getAvailabilityRules>>;
  let types: Awaited<ReturnType<typeof getAppointmentTypes>>;
  let appointments: (typeof schema.appointments.$inferSelect)[];
  let googleIntegration: Awaited<ReturnType<typeof readIntegration>>;
  try {
    [settings, rules, types, appointments, googleIntegration] = await Promise.all([
      getBookingSettingsByLc(db, activeMembership.lcId),
      getAvailabilityRules(db, activeMembership.lcId),
      getAppointmentTypes(db, activeMembership.lcId),
      db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.lcId, activeMembership.lcId))
        .orderBy(asc(schema.appointments.startAt)),
      readIntegration(db, activeMembership.lcId, "google_drive")
    ]);
  } catch {
    // The booking tables don't exist until migration 0004 is applied.
    return (
      <div className="content">
        <section className="page-heading">
          <div>
            <span className="eyebrow">Scheduling</span>
            <h1>Appointments</h1>
          </div>
        </section>
        <article className="card" style={{ padding: 32, maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Finish database setup</h2>
          <p className="muted-note" style={{ lineHeight: 1.6 }}>
            The booking tables aren’t all created yet. Run migrations{" "}
            <code>packages/db/drizzle/0004_appointments.sql</code> and{" "}
            <code>packages/db/drizzle/0007_appointment_types.sql</code> in the Supabase SQL editor
            (Database → SQL Editor), then reload this page. Both are safe to run more than once.
          </p>
        </article>
      </div>
    );
  }

  const now = Date.now();
  const upcoming = appointments.filter((a) => a.status === "confirmed" && a.startAt.getTime() >= now);
  const past = appointments.filter((a) => a.status !== "confirmed" || a.startAt.getTime() < now).reverse();

  const defaultSlug = settings?.slug ?? slugify(activeMembership.lcName);
  const publicUrl = `${getSiteUrl()}/book/${defaultSlug}`;
  const googleConnected = Boolean(googleIntegration);

  // Calendar view: overlay Google Calendar events for the visible month.
  const zone = settings?.timezone || "UTC";
  const monthBase = searchParams.month ? DateTime.fromFormat(searchParams.month, "yyyy-MM", { zone }) : DateTime.now().setZone(zone);
  const monthStart = (monthBase.isValid ? monthBase : DateTime.now().setZone(zone)).startOf("month");
  const gridStart = monthStart.minus({ days: monthStart.weekday % 7 });
  let googleEvents: CalendarEvent[] = [];
  if (googleConnected) {
    try {
      const token = await getGoogleAccessToken(db, activeMembership.lcId);
      googleEvents = await listCalendarEvents(
        token,
        settings?.calendarId || "primary",
        gridStart.toUTC().toISO()!,
        gridStart.plus({ days: 42 }).toUTC().toISO()!
      );
    } catch {
      /* google unavailable — show bookings only */
    }
  }

  return (
    <div className="content">
      {searchParams.saved === "1" && <p className="page-note" style={{ color: "var(--brand-success)" }}>Saved.</p>}
      {searchParams.error && <p className="form-error page-note">{ERRORS[searchParams.error] ?? "Something went wrong."}</p>}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Scheduling</span>
          <h1>Appointments</h1>
          <p>Let leads self-book meetings with the Outgoing GE crew. Slots respect your Google Calendar.</p>
        </div>
        <div className="heading-actions">
          {settings?.active && (
            <Link href={`/book/${settings.slug}`} className="button ghost" target="_blank">
              <ExternalLink size={14} /> View public page
            </Link>
          )}
          <CopyLinkButton url={publicUrl} />
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <span className="eyebrow">Calendar</span>
        <div style={{ marginTop: 8 }}>
          <MonthCalendar
            month={searchParams.month}
            zone={zone}
            appointments={appointments}
            googleEvents={googleEvents}
            googleConnected={googleConnected}
          />
        </div>
      </section>

      {!googleConnected && (
        <p className="form-error page-note">
          Google Calendar isn’t connected. <Link href="/integrations">Connect it in Integrations</Link> so booked
          meetings sync, generate a Meet link, and check availability.
        </p>
      )}

      {/* Appointment types */}
      <section className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow">Appointment types</span>
            <p className="muted-note" style={{ marginTop: 4 }}>
              Each type is its own bookable meeting with its own duration and public link. Slots respect your weekly
              availability and Google Calendar.
            </p>
          </div>
        </div>
        {!settings && (
          <p className="form-error page-note" style={{ marginTop: 12 }}>
            Save your booking page below first — that sets the public link your appointment types live under.
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <AppointmentTypesEditor
            types={types.map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              description: t.description,
              durationMinutes: t.durationMinutes,
              bufferMinutes: t.bufferMinutes,
              minNoticeHours: t.minNoticeHours,
              maxAdvanceDays: t.maxAdvanceDays,
              color: t.color,
              active: t.active,
              intakeFields: normalizeIntakeFields(t.intakeFields)
            }))}
            bookingSlug={settings?.slug ?? null}
            baseUrl={getSiteUrl()}
          />
        </div>
      </section>

      <div className="appointments-grid">
        {/* Booking settings */}
        <section className="card" style={{ padding: 20 }}>
          <span className="eyebrow">Booking page</span>
          <p className="muted-note" style={{ marginTop: 4 }}>
            Org-level settings for your booking hub: <code>{publicUrl}</code>
          </p>
          <form action={saveBookingSettings} className="settings-form">
            <label className="book-field">
              <span>Title</span>
              <input name="title" defaultValue={settings?.title ?? "Book a meeting"} required maxLength={120} />
            </label>
            <label className="book-field">
              <span>Description</span>
              <textarea name="description" rows={2} defaultValue={settings?.description ?? ""} maxLength={2000} />
            </label>
            <label className="book-field">
              <span>Link slug</span>
              <input name="slug" defaultValue={defaultSlug} required maxLength={48} />
              <small className="muted-note">Your hub: {publicUrl}</small>
            </label>
            <label className="book-field">
              <span>Timezone (IANA, e.g. America/Toronto)</span>
              <input name="timezone" defaultValue={settings?.timezone ?? "UTC"} required maxLength={64} />
            </label>
            <label className="book-field">
              <span>Google calendar ID</span>
              <input name="calendarId" defaultValue={settings?.calendarId ?? "primary"} required maxLength={256} />
            </label>
            <label className="settings-checkbox">
              <input type="checkbox" name="active" defaultChecked={settings?.active ?? true} /> Booking page is live
            </label>
            <button type="submit" className="button primary">Save settings</button>
          </form>
        </section>

        {/* Weekly availability */}
        <section className="card" style={{ padding: 20 }}>
          <span className="eyebrow">Weekly availability</span>
          <p className="muted-note" style={{ marginTop: 4, marginBottom: 12 }}>
            Recurring windows in your booking timezone. Busy times on your Google Calendar are removed automatically.
          </p>
          <AvailabilityEditor initialRules={rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }))} />
        </section>
      </div>

      {/* Upcoming */}
      <section style={{ marginTop: 8 }}>
        <span className="eyebrow">Upcoming ({upcoming.length})</span>
        {upcoming.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: "center", marginTop: 8 }}>
            <CalendarClock size={26} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
            <p className="muted-note">No upcoming appointments yet.</p>
          </div>
        ) : (
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Guest</th>
                <th>Status</th>
                <th>Meet</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.startAt.toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                    {a.typeName && (
                      <>
                        <br />
                        <small className="muted-note">{a.typeName}</small>
                      </>
                    )}
                  </td>
                  <td>
                    {a.contactId ? (
                      <Link href={`/contacts/${a.contactId}`}>{a.guestName}</Link>
                    ) : (
                      a.guestName
                    )}
                    <br />
                    <small className="muted-note">{a.guestEmail}</small>
                  </td>
                  <td><span className={STATUS_BADGE[a.status] ?? "badge badge-grey"}>{a.status}</span></td>
                  <td>
                    {a.meetUrl ? (
                      <a href={a.meetUrl} target="_blank" rel="noreferrer" className="book-meet-link">
                        <Video size={14} /> Join
                      </a>
                    ) : (
                      <small className="muted-note">—</small>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <CancelAppointmentButton id={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Past / cancelled */}
      {past.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <span className="eyebrow">Past & cancelled ({past.length})</span>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Guest</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {past.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.startAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td>
                    {a.contactId ? <Link href={`/contacts/${a.contactId}`}>{a.guestName}</Link> : a.guestName}
                    <br />
                    <small className="muted-note">{a.guestEmail}</small>
                  </td>
                  <td><span className={STATUS_BADGE[a.status] ?? "badge badge-grey"}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
