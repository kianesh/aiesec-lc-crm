import { randomBytes } from "crypto";
import { schema } from "@aiesec/db";
import { and, asc, eq } from "drizzle-orm";
import type { getDb } from "../db";
import type { SlotConfig } from "./availability";

type Db = ReturnType<typeof getDb>;

export type BookingSettings = typeof schema.bookingSettings.$inferSelect;
export type AppointmentType = typeof schema.appointmentTypes.$inferSelect;

export async function getBookingSettingsBySlug(db: Db, slug: string) {
  const [row] = await db
    .select()
    .from(schema.bookingSettings)
    .where(eq(schema.bookingSettings.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getBookingSettingsByLc(db: Db, lcId: string) {
  const [row] = await db
    .select()
    .from(schema.bookingSettings)
    .where(eq(schema.bookingSettings.lcId, lcId))
    .limit(1);
  return row ?? null;
}

// All appointment types for an LC (dashboard management view).
export async function getAppointmentTypes(db: Db, lcId: string) {
  return db
    .select()
    .from(schema.appointmentTypes)
    .where(eq(schema.appointmentTypes.lcId, lcId))
    .orderBy(asc(schema.appointmentTypes.sortOrder), asc(schema.appointmentTypes.name));
}

// Only the active types, for the public booking hub.
export async function getActiveAppointmentTypes(db: Db, lcId: string) {
  return db
    .select()
    .from(schema.appointmentTypes)
    .where(and(eq(schema.appointmentTypes.lcId, lcId), eq(schema.appointmentTypes.active, true)))
    .orderBy(asc(schema.appointmentTypes.sortOrder), asc(schema.appointmentTypes.name));
}

// A single type by its slug within an LC.
export async function getAppointmentTypeBySlug(db: Db, lcId: string, slug: string) {
  const [row] = await db
    .select()
    .from(schema.appointmentTypes)
    .where(and(eq(schema.appointmentTypes.lcId, lcId), eq(schema.appointmentTypes.slug, slug)))
    .limit(1);
  return row ?? null;
}

// Combine LC-level settings (timezone/calendar/lc) with a type's timing rules
// into the flat config the slot engine consumes.
export function mergeSlotConfig(settings: BookingSettings, type: AppointmentType): SlotConfig {
  return {
    lcId: settings.lcId,
    timezone: settings.timezone,
    calendarId: settings.calendarId,
    durationMinutes: type.durationMinutes,
    bufferMinutes: type.bufferMinutes,
    minNoticeHours: type.minNoticeHours,
    maxAdvanceDays: type.maxAdvanceDays
  };
}

export async function getAvailabilityRules(db: Db, lcId: string) {
  return db
    .select()
    .from(schema.availabilityRules)
    .where(eq(schema.availabilityRules.lcId, lcId))
    .orderBy(asc(schema.availabilityRules.weekday), asc(schema.availabilityRules.startTime));
}

// URL-safe random token for the public cancel/reschedule link.
export function generateCancelToken() {
  return randomBytes(24).toString("base64url");
}

// Slugify an LC name into a default booking slug.
export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "book";
}
