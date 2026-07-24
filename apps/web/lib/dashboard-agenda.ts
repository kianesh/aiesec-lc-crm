import { schema } from "@aiesec/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import { readIntegration } from "./connectors/store";
import { getGoogleAccessToken, listCalendarEvents, listCalendars } from "./connectors/google";

export type AgendaItem = {
  id: string;
  kind: "appointment" | "event";
  title: string;
  start: string; // ISO
  end: string | null;
  allDay: boolean;
  calendarId: string; // "appointments" for booked appointments
  calendarName: string;
  color: string | null;
  href: string | null;
};

export type AgendaCalendar = { id: string; summary: string; color: string | null };

export type DashboardAgenda = {
  googleConnected: boolean;
  googleError: boolean;
  calendars: AgendaCalendar[];
  items: AgendaItem[];
};

const HORIZON_DAYS = 21;
const MAX_CALENDARS = 8;

// Merge upcoming booked appointments with Google Calendar events across the
// account's calendars. Every external call degrades to empty so the widget
// still shows appointments when Google is disconnected or the token is stale.
export async function getDashboardAgenda(lcId: string): Promise<DashboardAgenda> {
  const db = getDb();
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000);

  const appts = await db
    .select({
      id: schema.appointments.id,
      typeName: schema.appointments.typeName,
      guestName: schema.appointments.guestName,
      startAt: schema.appointments.startAt,
      endAt: schema.appointments.endAt
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.lcId, lcId),
        eq(schema.appointments.status, "confirmed"),
        gte(schema.appointments.startAt, now),
        lte(schema.appointments.startAt, horizon)
      )
    )
    .orderBy(asc(schema.appointments.startAt))
    .limit(50);

  const items: AgendaItem[] = appts.map((a) => ({
    id: `appt-${a.id}`,
    kind: "appointment",
    title: `${a.typeName ?? "Appointment"} · ${a.guestName}`,
    start: a.startAt.toISOString(),
    end: a.endAt.toISOString(),
    allDay: false,
    calendarId: "appointments",
    calendarName: "Appointments",
    color: "#037ef3",
    href: "/appointments"
  }));

  const calendars: AgendaCalendar[] = [{ id: "appointments", summary: "Appointments", color: "#037ef3" }];

  const google = await readIntegration(db, lcId, "google_drive").catch(() => null);
  if (!google) {
    return { googleConnected: false, googleError: false, calendars, items: sortItems(items) };
  }

  let googleError = false;
  try {
    const token = await getGoogleAccessToken(db, lcId);
    const cals = (await listCalendars(token)).slice(0, MAX_CALENDARS);
    for (const c of cals) {
      calendars.push({ id: c.id, summary: c.summary, color: c.backgroundColor });
    }

    const results = await Promise.all(
      cals.map((c) =>
        listCalendarEvents(token, c.id, now.toISOString(), horizon.toISOString())
          .then((events) => ({ c, events }))
          .catch(() => ({ c, events: [] }))
      )
    );
    for (const { c, events } of results) {
      for (const e of events) {
        if (!e.start) continue;
        items.push({
          id: `evt-${c.id}-${e.id}`,
          kind: "event",
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          calendarId: c.id,
          calendarName: c.summary,
          color: c.backgroundColor,
          href: e.htmlLink
        });
      }
    }
  } catch {
    // invalid_grant / expired token / revoked access — show appointments only.
    googleError = true;
  }

  return { googleConnected: true, googleError, calendars, items: sortItems(items) };
}

function sortItems(items: AgendaItem[]): AgendaItem[] {
  return items.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 60);
}
