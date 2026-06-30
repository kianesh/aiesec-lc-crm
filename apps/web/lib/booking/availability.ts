import { schema } from "@aiesec/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { DateTime, Interval } from "luxon";
import type { getDb } from "../db";
import { getGoogleAccessToken, getFreeBusy } from "../connectors/google";

type Db = ReturnType<typeof getDb>;

export type BookingSettings = typeof schema.bookingSettings.$inferSelect;
export type AvailabilityRule = typeof schema.availabilityRules.$inferSelect;

export type DaySlots = {
  date: string; // ISO date (yyyy-MM-dd) in the booking timezone
  label: string; // e.g. "Mon, Jun 23"
  slots: Array<{ startIso: string; endIso: string; label: string }>; // UTC ISO + tz-local label
};

// Parse "HH:MM" into minutes from midnight; returns null on malformed input.
function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Compute bookable slots for an LC's public booking page.
 *
 * Slots are generated from the weekly availability rules (expressed in the
 * booking timezone), stepped by duration + buffer, then filtered against:
 *   - the min-notice / max-advance window,
 *   - Google Calendar free/busy on the configured calendar,
 *   - already-booked confirmed appointments in our own DB.
 *
 * `nowMs` is injected so this stays deterministic/testable.
 */
export async function computeAvailableSlots(
  db: Db,
  settings: BookingSettings,
  rules: AvailabilityRule[],
  nowMs: number
): Promise<DaySlots[]> {
  const tz = settings.timezone || "UTC";
  const now = DateTime.fromMillis(nowMs, { zone: tz });
  const earliest = now.plus({ hours: settings.minNoticeHours });
  const latest = now.plus({ days: settings.maxAdvanceDays }).endOf("day");

  // Group rules by weekday (0=Sun … 6=Sat). Luxon weekday is 1=Mon … 7=Sun.
  const rulesByWeekday = new Map<number, AvailabilityRule[]>();
  for (const rule of rules) {
    const list = rulesByWeekday.get(rule.weekday) ?? [];
    list.push(rule);
    rulesByWeekday.set(rule.weekday, list);
  }
  if (rulesByWeekday.size === 0) return [];

  const step = settings.durationMinutes + settings.bufferMinutes;
  if (step <= 0) return [];

  // 1) Generate candidate slots day-by-day in the booking timezone.
  const candidates: Array<{ start: DateTime; end: DateTime }> = [];
  let cursor = now.startOf("day");
  const lastDay = latest.startOf("day");
  while (cursor <= lastDay) {
    const jsWeekday = cursor.weekday % 7; // luxon 7(Sun) -> 0
    const dayRules = rulesByWeekday.get(jsWeekday) ?? [];
    for (const rule of dayRules) {
      const startMin = parseHm(rule.startTime);
      const endMin = parseHm(rule.endTime);
      if (startMin == null || endMin == null || endMin <= startMin) continue;
      let slotStartMin = startMin;
      while (slotStartMin + settings.durationMinutes <= endMin) {
        const start = cursor.set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).plus({ minutes: slotStartMin });
        const end = start.plus({ minutes: settings.durationMinutes });
        if (start >= earliest && end <= latest) candidates.push({ start, end });
        slotStartMin += step;
      }
    }
    cursor = cursor.plus({ days: 1 });
  }
  if (candidates.length === 0) return [];

  const windowStart = candidates[0].start;
  const windowEnd = candidates[candidates.length - 1].end;

  // 2) Gather busy intervals: Google free/busy + our own confirmed bookings.
  const busy: Interval[] = [];

  try {
    const accessToken = await getGoogleAccessToken(db, settings.lcId);
    const gcalBusy = await getFreeBusy(
      accessToken,
      settings.calendarId || "primary",
      windowStart.toUTC().toISO()!,
      windowEnd.toUTC().toISO()!
    );
    for (const b of gcalBusy) {
      const iv = Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end));
      if (iv.isValid) busy.push(iv);
    }
  } catch {
    // If Google isn't connected/expired, fall back to DB-only conflict checks
    // rather than failing the whole page. The booking step re-validates anyway.
  }

  const existing = await db
    .select({ startAt: schema.appointments.startAt, endAt: schema.appointments.endAt })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.lcId, settings.lcId),
        eq(schema.appointments.status, "confirmed"),
        gte(schema.appointments.endAt, windowStart.toJSDate()),
        lte(schema.appointments.startAt, windowEnd.toJSDate())
      )
    );
  for (const a of existing) {
    const iv = Interval.fromDateTimes(DateTime.fromJSDate(a.startAt), DateTime.fromJSDate(a.endAt));
    if (iv.isValid) busy.push(iv);
  }

  // 3) Filter out candidates overlapping any busy interval, group by day.
  const byDay = new Map<string, DaySlots>();
  for (const c of candidates) {
    const slotIv = Interval.fromDateTimes(c.start, c.end);
    const conflict = busy.some((b) => b.overlaps(slotIv));
    if (conflict) continue;

    const dateKey = c.start.toFormat("yyyy-MM-dd");
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, { date: dateKey, label: c.start.toFormat("ccc, LLL d"), slots: [] });
    }
    byDay.get(dateKey)!.slots.push({
      startIso: c.start.toUTC().toISO()!,
      endIso: c.end.toUTC().toISO()!,
      label: c.start.toFormat("h:mm a")
    });
  }

  return Array.from(byDay.values());
}

/**
 * Re-validate a single slot at booking time (guards against races between page
 * load and submission). Returns true if the slot is still bookable.
 */
export async function isSlotBookable(
  db: Db,
  settings: BookingSettings,
  rules: AvailabilityRule[],
  startIso: string,
  nowMs: number
): Promise<boolean> {
  const start = DateTime.fromISO(startIso, { zone: "utc" });
  if (!start.isValid) return false;
  const end = start.plus({ minutes: settings.durationMinutes });

  const tz = settings.timezone || "UTC";
  const localStart = start.setZone(tz);
  const now = DateTime.fromMillis(nowMs, { zone: tz });
  if (localStart < now.plus({ hours: settings.minNoticeHours })) return false;
  if (localStart > now.plus({ days: settings.maxAdvanceDays }).endOf("day")) return false;

  // Slot must fall inside a weekly availability window.
  const jsWeekday = localStart.weekday % 7;
  const startMin = localStart.hour * 60 + localStart.minute;
  const endMin = startMin + settings.durationMinutes;
  const fitsRule = rules.some((r) => {
    if (r.weekday !== jsWeekday) return false;
    const rs = parseHm(r.startTime);
    const re = parseHm(r.endTime);
    return rs != null && re != null && startMin >= rs && endMin <= re;
  });
  if (!fitsRule) return false;

  const slotIv = Interval.fromDateTimes(start, end);

  // No overlap with an existing confirmed appointment.
  const existing = await db
    .select({ startAt: schema.appointments.startAt, endAt: schema.appointments.endAt })
    .from(schema.appointments)
    .where(and(eq(schema.appointments.lcId, settings.lcId), eq(schema.appointments.status, "confirmed")));
  for (const a of existing) {
    const iv = Interval.fromDateTimes(DateTime.fromJSDate(a.startAt), DateTime.fromJSDate(a.endAt));
    if (iv.isValid && iv.overlaps(slotIv)) return false;
  }

  // No overlap with Google Calendar busy time (best-effort).
  try {
    const accessToken = await getGoogleAccessToken(db, settings.lcId);
    const gcalBusy = await getFreeBusy(
      accessToken,
      settings.calendarId || "primary",
      start.toISO()!,
      end.toISO()!
    );
    for (const b of gcalBusy) {
      const iv = Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end));
      if (iv.isValid && iv.overlaps(slotIv)) return false;
    }
  } catch {
    // Google unavailable — rely on the DB check above.
  }

  return true;
}
