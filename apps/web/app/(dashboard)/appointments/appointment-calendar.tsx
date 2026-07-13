import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type Appt = { id: string; startAt: Date; guestName: string; status: string; meetUrl: string | null };
type GEvent = { id: string; title: string; start: string; allDay: boolean; htmlLink: string | null };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Month calendar overlaying booked appointments and (when connected) the LC's
// Google Calendar events. Server-rendered; month navigation via ?month=YYYY-MM.
export function MonthCalendar({
  month,
  zone,
  appointments,
  googleEvents,
  googleConnected
}: {
  month?: string;
  zone: string;
  appointments: Appt[];
  googleEvents: GEvent[];
  googleConnected: boolean;
}) {
  const base = month ? DateTime.fromFormat(month, "yyyy-MM", { zone }) : DateTime.now().setZone(zone);
  const monthStart = (base.isValid ? base : DateTime.now().setZone(zone)).startOf("month");
  const gridStart = monthStart.minus({ days: monthStart.weekday % 7 }); // Sunday-start
  const today = DateTime.now().setZone(zone);
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));

  const apptByDay = new Map<string, Appt[]>();
  for (const a of appointments) {
    if (a.status !== "confirmed") continue;
    const key = DateTime.fromJSDate(a.startAt).setZone(zone).toFormat("yyyy-MM-dd");
    (apptByDay.get(key) ?? apptByDay.set(key, []).get(key)!).push(a);
  }
  const evByDay = new Map<string, GEvent[]>();
  for (const e of googleEvents) {
    if (!e.start) continue;
    const key = DateTime.fromISO(e.start).setZone(zone).toFormat("yyyy-MM-dd");
    (evByDay.get(key) ?? evByDay.set(key, []).get(key)!).push(e);
  }

  const prev = monthStart.minus({ months: 1 }).toFormat("yyyy-MM");
  const next = monthStart.plus({ months: 1 }).toFormat("yyyy-MM");

  return (
    <article className="card cal-card">
      <div className="cal-head">
        <Link href={`/appointments?month=${prev}`} className="icon-button" aria-label="Previous month"><ChevronLeft size={16} /></Link>
        <strong>{monthStart.toFormat("LLLL yyyy")}</strong>
        <Link href={`/appointments?month=${next}`} className="icon-button" aria-label="Next month"><ChevronRight size={16} /></Link>
        <span className="cal-legend">
          <em className="cal-dot cal-dot-appt" /> Bookings
          {googleConnected && <><em className="cal-dot cal-dot-google" /> Google</>}
        </span>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <span key={d} className="cal-dow">{d}</span>)}
        {days.map((day) => {
          const key = day.toFormat("yyyy-MM-dd");
          const appts = apptByDay.get(key) ?? [];
          const evs = evByDay.get(key) ?? [];
          const cls = [
            "cal-cell",
            day.month !== monthStart.month ? "cal-out" : "",
            day.hasSame(today, "day") ? "cal-today" : ""
          ].filter(Boolean).join(" ");
          return (
            <div className={cls} key={key}>
              <span className="cal-daynum">{day.day}</span>
              <div className="cal-chips">
                {appts.slice(0, 3).map((a) => (
                  <span className="cal-chip cal-chip-appt" key={a.id} title={`${a.guestName} · ${DateTime.fromJSDate(a.startAt).setZone(zone).toFormat("h:mm a")}`}>
                    {DateTime.fromJSDate(a.startAt).setZone(zone).toFormat("h:mm a")} {a.guestName}
                  </span>
                ))}
                {evs.slice(0, 2).map((e) => (
                  <span className="cal-chip cal-chip-google" key={e.id} title={e.title}>{e.title}</span>
                ))}
                {appts.length + evs.length > 5 && <span className="cal-more">+{appts.length + evs.length - 5} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      {!googleConnected && <p className="muted-note" style={{ marginTop: 12 }}>Connect Google on the Integrations page to overlay your calendar events here.</p>}
    </article>
  );
}
