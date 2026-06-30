"use server";

import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteCalendarEvent, getGoogleAccessToken } from "../../../../lib/connectors/google";
import { getDb } from "../../../../lib/db";

export async function cancelBooking(token: string) {
  const db = getDb();
  const [appt] = await db
    .select()
    .from(schema.appointments)
    .where(eq(schema.appointments.cancelToken, token))
    .limit(1);

  if (!appt || appt.status === "cancelled") return;

  // Remove the Google Calendar event (also notifies the guest). Best-effort.
  if (appt.googleEventId) {
    try {
      const accessToken = await getGoogleAccessToken(db, appt.lcId);
      const [settings] = await db
        .select({ calendarId: schema.bookingSettings.calendarId })
        .from(schema.bookingSettings)
        .where(eq(schema.bookingSettings.lcId, appt.lcId))
        .limit(1);
      await deleteCalendarEvent(accessToken, appt.googleEventId, settings?.calendarId ?? "primary", "all");
    } catch {
      // ignore — still mark cancelled in our DB
    }
  }

  await db
    .update(schema.appointments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(schema.appointments.id, appt.id));

  if (appt.contactId) {
    await db.insert(schema.contactActivities).values({
      contactId: appt.contactId,
      lcId: appt.lcId,
      type: "appointment_cancelled",
      metadata: { appointmentId: appt.id, via: "public_manage" }
    });
  }

  revalidatePath(`/book/manage/${token}`);
}
