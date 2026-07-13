import { schema } from "@aiesec/db";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { CalendarClock, ExternalLink, Video } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { readIntegration } from "../../../lib/connectors/store";
import { getGoogleAccessToken, listCalendarEvents, type CalendarEvent } from "../../../lib/connectors/google";
import { getAvailabilityRules, getBookingSettingsByLc, slugify } from "../../../lib/booking/store";
import { getSiteUrl } from "../../../lib/site-url";
import { saveBookingSettings } from "./actions";
import { AvailabilityEditor } from "./availability-editor";
import { MonthCalendar } from "./appointment-calendar";
import { CancelAppointmentButton, CopyLinkButton } from "./appointment-controls";

export const dynamic = "force-dynamic";

type SearchParams = { saved?: string; error?: string; month?: string };

const ERRORS: Record<string, string> = {
  not_allowed: "Only owners and admins can manage booking settings.",
  slug_taken: "That booking link is already taken. Pick a different one.",
  bad_rules: "Availability could not be saved. Check your time windows."
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
  let appointments: (typeof schema.appointments.$inferSelect)[];
  let googleIntegration: Awaited<ReturnType<typeof readIntegration>>;
  try {
    [settings, rules, appointments, googleIntegration] = await Promise.all([
      getBookingSettingsByLc(db, activeMembership.lcId),
      getAvailabilityRules(db, activeMembership.lcId),
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
            The booking tables aren’t created yet. Run migration{" "}
            <code>packages/db/drizzle/0004_appointments.sql</code> in the Supabase SQL editor
            (Database → SQL Editor), then reload this page. It’s safe to run more than once.
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

      <div className="appointments-grid">
        {/* Booking settings */}
        <section className="card" style={{ padding: 20 }}>
          <span className="eyebrow">Booking page</span>
          <p className="muted-note" style={{ marginTop: 4 }}>
            Public link: <code>{publicUrl}</code>
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
            </label>
            <div className="settings-row">
              <label className="book-field">
                <span>Duration (min)</span>
                <input name="durationMinutes" type="number" min={5} max={480} defaultValue={settings?.durationMinutes ?? 30} required />
              </label>
              <label className="book-field">
                <span>Buffer (min)</span>
                <input name="bufferMinutes" type="number" min={0} max={240} defaultValue={settings?.bufferMinutes ?? 0} required />
              </label>
            </div>
            <div className="settings-row">
              <label className="book-field">
                <span>Min notice (hrs)</span>
                <input name="minNoticeHours" type="number" min={0} max={720} defaultValue={settings?.minNoticeHours ?? 12} required />
              </label>
              <label className="book-field">
                <span>Max advance (days)</span>
                <input name="maxAdvanceDays" type="number" min={1} max={365} defaultValue={settings?.maxAdvanceDays ?? 30} required />
              </label>
            </div>
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
