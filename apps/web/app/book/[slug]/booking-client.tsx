"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowLeft, Clock, Video } from "lucide-react";
import { createBooking, type BookingState } from "./actions";
import type { DaySlots } from "../../../lib/booking/availability";

type Slot = { startIso: string; endIso: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="book-submit" disabled={pending}>
      {pending ? "Confirming…" : "Confirm booking"}
    </button>
  );
}

export function BookingClient({
  slug,
  days,
  durationMinutes,
  timezone
}: {
  slug: string;
  days: DaySlots[];
  durationMinutes: number;
  timezone: string;
}) {
  const [activeDay, setActiveDay] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [state, formAction] = useFormState<BookingState, FormData>(createBooking, {});

  if (days.length === 0) {
    return <p className="book-empty">No times are currently available. Please check back soon.</p>;
  }

  if (slot) {
    return (
      <div className="book-form-wrap">
        <button type="button" className="book-back" onClick={() => setSlot(null)}>
          <ArrowLeft size={14} /> Back to times
        </button>
        <div className="book-slot-summary">
          <strong>{days[activeDay].label}</strong>
          <span>
            {slot.label} · {durationMinutes} min · {timezone}
          </span>
        </div>
        <form action={formAction} className="book-form">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="startIso" value={slot.startIso} />
          <label className="book-field">
            <span>Full name *</span>
            <input name="name" required maxLength={120} autoComplete="name" />
          </label>
          <label className="book-field">
            <span>Email *</span>
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="book-field">
            <span>Phone</span>
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
          </label>
          <label className="book-field">
            <span>Anything we should know?</span>
            <textarea name="notes" rows={3} maxLength={2000} />
          </label>
          {state.error && <p className="book-error">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    );
  }

  const day = days[activeDay];
  return (
    <div className="book-picker">
      <div className="book-days" role="tablist" aria-label="Available days">
        {days.map((d, i) => (
          <button
            key={d.date}
            role="tab"
            aria-selected={i === activeDay}
            className={i === activeDay ? "book-day book-day-active" : "book-day"}
            onClick={() => setActiveDay(i)}
          >
            <span className="book-day-label">{d.label}</span>
            <small>{d.slots.length} slot{d.slots.length === 1 ? "" : "s"}</small>
          </button>
        ))}
      </div>
      <div className="book-slots">
        {day.slots.length === 0 ? (
          <p className="book-empty">No times left on this day.</p>
        ) : (
          day.slots.map((s) => (
            <button key={s.startIso} className="book-slot" onClick={() => setSlot(s)}>
              {s.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function MeetingMeta({ durationMinutes }: { durationMinutes: number }) {
  return (
    <ul className="book-meta">
      <li>
        <Clock size={15} /> {durationMinutes} minutes
      </li>
      <li>
        <Video size={15} /> Google Meet (link sent on confirmation)
      </li>
    </ul>
  );
}
