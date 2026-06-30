"use server";

import { schema } from "@aiesec/db";
import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createCalendarEvent, getGoogleAccessToken } from "../../../lib/connectors/google";
import { getDb } from "../../../lib/db";
import { isSlotBookable } from "../../../lib/booking/availability";
import { generateCancelToken, getAvailabilityRules, getBookingSettingsBySlug } from "../../../lib/booking/store";

const bookingSchema = z.object({
  slug: z.string().min(1),
  startIso: z.string().min(1),
  name: z.string().min(1, "Please enter your name").max(120),
  email: z.string().email("Enter a valid email"),
  phone: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal(""))
});

export type BookingState = { error?: string };

export async function createBooking(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const parsed = bookingSchema.safeParse({
    slug: formData.get("slug"),
    startIso: formData.get("startIso"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    notes: formData.get("notes") || undefined
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Please check your details." };
  }
  const input = parsed.data;

  const db = getDb();
  const settings = await getBookingSettingsBySlug(db, input.slug);
  if (!settings || !settings.active) return { error: "This booking page is not available." };

  const rules = await getAvailabilityRules(db, settings.lcId);
  const now = Date.now();

  const start = DateTime.fromISO(input.startIso, { zone: "utc" });
  if (!start.isValid) return { error: "Invalid time slot." };
  const end = start.plus({ minutes: settings.durationMinutes });

  const bookable = await isSlotBookable(db, settings, rules, input.startIso, now);
  if (!bookable) return { error: "Sorry — that time was just taken. Please pick another slot." };

  // Match or create the CRM contact by email within the LC.
  const email = input.email.trim();
  const [existingContact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.lcId, settings.lcId), sql`lower(${schema.contacts.email}) = lower(${email})`))
    .limit(1);

  let contactId = existingContact?.id ?? null;
  if (!contactId) {
    const [created] = await db
      .insert(schema.contacts)
      .values({
        lcId: settings.lcId,
        fullName: input.name.trim(),
        email,
        phone: input.phone || null,
        type: "candidate",
        source: "booking"
      })
      .returning({ id: schema.contacts.id });
    contactId = created.id;
  }

  // Reserve the slot in our DB first (guards the slot even if Google is slow).
  const cancelToken = generateCancelToken();
  const [appointment] = await db
    .insert(schema.appointments)
    .values({
      lcId: settings.lcId,
      contactId,
      guestName: input.name.trim(),
      guestEmail: email,
      guestPhone: input.phone || null,
      notes: input.notes || null,
      startAt: start.toJSDate(),
      endAt: end.toJSDate(),
      timezone: settings.timezone,
      status: "confirmed",
      cancelToken
    })
    .returning({ id: schema.appointments.id });

  // Create the Google Calendar event with an auto Google Meet link. Calendar
  // emails the invite (with Meet + .ics) to the guest via sendUpdates: "all".
  try {
    const accessToken = await getGoogleAccessToken(db, settings.lcId);
    const descriptionParts = [
      input.notes ? `Notes: ${input.notes}` : null,
      input.phone ? `Phone: ${input.phone}` : null,
      "Booked via AIESEC CRM"
    ].filter(Boolean);
    const event = await createCalendarEvent(accessToken, {
      summary: `${settings.title} — ${input.name.trim()}`,
      description: descriptionParts.join("\n"),
      startIso: start.toISO()!,
      endIso: end.toISO()!,
      timeZone: settings.timezone,
      attendees: [email],
      calendarId: settings.calendarId,
      addMeet: true,
      sendUpdates: "all"
    });
    await db
      .update(schema.appointments)
      .set({ googleEventId: event.id, meetUrl: event.meetUrl, htmlLink: event.htmlLink, updatedAt: new Date() })
      .where(eq(schema.appointments.id, appointment.id));
  } catch {
    // Keep the appointment recorded even if calendar sync fails; staff can
    // follow up manually. The confirmation page notes the missing link.
  }

  await db.insert(schema.contactActivities).values({
    contactId,
    lcId: settings.lcId,
    type: "appointment_booked",
    metadata: { appointmentId: appointment.id, startAt: start.toISO(), via: "public_booking" }
  });

  redirect(`/book/manage/${cancelToken}?booked=1`);
}
