"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, CalendarClock, ExternalLink, Plug } from "lucide-react";
import Link from "next/link";
import { createDashboardEvent } from "../app/(dashboard)/dashboard/actions";
import type { AgendaItem, DashboardAgenda as AgendaData } from "../lib/dashboard-agenda";

function fmtDayKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(item: AgendaItem) {
  if (item.allDay) return "All day";
  return new Date(item.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? "Adding…" : "Add event"}
    </button>
  );
}

export function DashboardAgenda({ agenda, eventStatus }: { agenda: AgendaData; eventStatus?: string }) {
  const [active, setActive] = useState<Set<string>>(() => new Set(agenda.calendars.map((c) => c.id)));
  const [creating, setCreating] = useState(false);

  const writableCalendars = agenda.calendars.filter((c) => c.id !== "appointments");

  const grouped = useMemo(() => {
    const visible = agenda.items.filter((i) => active.has(i.calendarId));
    const map = new Map<string, AgendaItem[]>();
    for (const item of visible) {
      const key = fmtDayKey(item.start);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [agenda.items, active]);

  function toggle(id: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="card agenda-card" style={{ padding: 20 }}>
      <div className="agenda-head">
        <div>
          <span className="eyebrow">Agenda</span>
          <p className="muted-note" style={{ margin: "4px 0 0" }}>Next 3 weeks · appointments &amp; calendar events</p>
        </div>
        {agenda.googleConnected && !agenda.googleError && writableCalendars.length > 0 && (
          <button type="button" className="button secondary" onClick={() => setCreating((v) => !v)}>
            <CalendarPlus size={15} /> New event
          </button>
        )}
      </div>

      {eventStatus === "created" && <p className="success-note" style={{ marginTop: 10 }}>Event added to your calendar.</p>}
      {eventStatus === "reconnect" && (
        <p className="form-error" style={{ marginTop: 10 }}>
          Google access expired. <Link href="/integrations/google">Reconnect Google</Link> to add events.
        </p>
      )}
      {eventStatus === "error" && <p className="form-error" style={{ marginTop: 10 }}>Couldn’t add the event. Check the details and try again.</p>}

      {agenda.googleError && (
        <p className="form-error" style={{ marginTop: 10 }}>
          <Plug size={13} style={{ verticalAlign: -2 }} /> Google access expired — showing appointments only.{" "}
          <Link href="/integrations/google">Reconnect Google</Link>.
        </p>
      )}
      {!agenda.googleConnected && (
        <p className="muted-note" style={{ marginTop: 10 }}>
          <Plug size={13} style={{ verticalAlign: -2 }} /> <Link href="/integrations/google">Connect Google Calendar</Link> to
          see and create events here.
        </p>
      )}

      {/* Calendar filter */}
      {agenda.calendars.length > 1 && (
        <div className="agenda-filters">
          {agenda.calendars.map((c) => {
            const on = active.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`agenda-chip${on ? " on" : ""}`}
                onClick={() => toggle(c.id)}
                aria-pressed={on}
              >
                <span className="agenda-dot" style={{ background: c.color ?? "#8b94a6" }} />
                {c.summary}
              </button>
            );
          })}
        </div>
      )}

      {/* New event form */}
      {creating && writableCalendars.length > 0 && (
        <form action={createDashboardEvent} className="agenda-create">
          <input name="title" placeholder="Event title" required maxLength={200} className="agenda-create-title" />
          <div className="agenda-create-row">
            <input name="date" type="date" required />
            <input name="time" type="time" required defaultValue="17:00" />
            <select name="durationMinutes" defaultValue="30">
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
            </select>
          </div>
          <div className="agenda-create-row">
            <select name="calendarId" defaultValue={writableCalendars[0]?.id}>
              {writableCalendars.map((c) => (
                <option key={c.id} value={c.id}>{c.summary}</option>
              ))}
            </select>
            <input name="attendees" placeholder="Guest emails (optional, comma-separated)" className="agenda-create-attendees" />
          </div>
          <div className="agenda-create-actions">
            <CreateButton />
            <button type="button" className="button ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Agenda list */}
      {grouped.length === 0 ? (
        <div className="agenda-empty">
          <CalendarClock size={22} style={{ opacity: 0.3 }} />
          <p className="muted-note">Nothing scheduled in this window.</p>
        </div>
      ) : (
        <div className="agenda-list">
          {grouped.map(([day, items]) => (
            <div className="agenda-day" key={day}>
              <div className="agenda-day-label">{day}</div>
              <ul>
                {items.map((item) => {
                  const body = (
                    <>
                      <span className="agenda-time">{fmtTime(item)}</span>
                      <span className="agenda-dot" style={{ background: item.color ?? "#8b94a6" }} />
                      <span className="agenda-title">{item.title}</span>
                      <span className="agenda-cal">{item.calendarName}</span>
                      {item.kind === "event" && item.href && <ExternalLink size={12} className="agenda-ext" />}
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        item.kind === "appointment" ? (
                          <Link href={item.href} className="agenda-row">{body}</Link>
                        ) : (
                          <a href={item.href} target="_blank" rel="noreferrer" className="agenda-row">{body}</a>
                        )
                      ) : (
                        <span className="agenda-row">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
