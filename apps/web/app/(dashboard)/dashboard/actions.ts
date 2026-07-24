"use server";

import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { createCalendarEvent, getGoogleAccessToken } from "../../../lib/connectors/google";
import { getBookingSettingsByLc } from "../../../lib/booking/store";

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  calendarId: z.string().min(1).max(256),
  attendees: z.string().max(500).optional().or(z.literal(""))
});

// Create a Google Calendar event straight from the dashboard agenda widget.
export async function createDashboardEvent(formData: FormData) {
  const { activeMembership } = await requireMembership();

  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    date: formData.get("date"),
    time: formData.get("time"),
    durationMinutes: formData.get("durationMinutes"),
    calendarId: formData.get("calendarId") || "primary",
    attendees: formData.get("attendees") || undefined
  });
  if (!parsed.success) redirect("/dashboard?event=error");
  const input = parsed.data;

  const db = getDb();
  const settings = await getBookingSettingsByLc(db, activeMembership.lcId);
  const zone = settings?.timezone || "UTC";

  const start = DateTime.fromISO(`${input.date}T${input.time}`, { zone });
  if (!start.isValid) redirect("/dashboard?event=error");
  const end = start.plus({ minutes: input.durationMinutes });

  const attendees = (input.attendees || "")
    .split(/[,\s]+/)
    .map((a) => a.trim())
    .filter((a) => /.+@.+\..+/.test(a));

  try {
    const token = await getGoogleAccessToken(db, activeMembership.lcId);
    await createCalendarEvent(token, {
      summary: input.title,
      startIso: start.toISO()!,
      endIso: end.toISO()!,
      timeZone: zone,
      calendarId: input.calendarId === "appointments" ? "primary" : input.calendarId,
      attendees,
      addMeet: attendees.length > 0,
      sendUpdates: attendees.length > 0 ? "all" : "none"
    });
  } catch (err) {
    const msg = err instanceof Error && /invalid_grant|reconnect|expired/i.test(err.message) ? "reconnect" : "error";
    redirect(`/dashboard?event=${msg}`);
  }

  redirect("/dashboard?event=created");
}
