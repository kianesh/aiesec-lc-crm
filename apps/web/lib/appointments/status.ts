import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { getBookingSettingsByLc } from "../booking/store";
import { deleteCalendarEvent, getGoogleAccessToken } from "../connectors/google";
import type { getDb } from "../db";

type Db = ReturnType<typeof getDb>;

export type AppointmentOutcome = "cancelled" | "completed" | "no_show";

export type SetStatusResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: "not_found" };

/**
 * Move an appointment to a terminal status.
 *
 * Cancelling also removes the Google Calendar event so the guest's invite
 * disappears; that call is best-effort, because a stale Google token must not
 * block the cancellation from being recorded in the CRM.
 *
 * Shared by the web server action and the mobile API so the two can't drift.
 */
export async function setAppointmentStatus(
  db: Db,
  lcId: string,
  appointmentId: string,
  status: AppointmentOutcome,
  options: { via: string; actorId?: string | null } = { via: "dashboard" }
): Promise<SetStatusResult> {
  const [appointment] = await db
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.lcId, lcId)))
    .limit(1);

  if (!appointment) return { ok: false, error: "not_found" };
  if (appointment.status === status) return { ok: true, changed: false };

  if (status === "cancelled" && appointment.googleEventId) {
    try {
      const accessToken = await getGoogleAccessToken(db, appointment.lcId);
      const settings = await getBookingSettingsByLc(db, appointment.lcId);
      await deleteCalendarEvent(accessToken, appointment.googleEventId, settings?.calendarId ?? "primary", "all");
    } catch {
      // Google disconnected or the token expired — still cancel in our DB.
    }
  }

  await db
    .update(schema.appointments)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.appointments.id, appointment.id));

  // Only cancellation has a matching activity type; completed/no-show are
  // operational states the timeline doesn't model yet.
  if (appointment.contactId && status === "cancelled") {
    await db.insert(schema.contactActivities).values({
      contactId: appointment.contactId,
      lcId: appointment.lcId,
      type: "appointment_cancelled",
      metadata: { appointmentId: appointment.id, via: options.via },
      createdBy: options.actorId ?? null
    });
  }

  return { ok: true, changed: true };
}
