import { randomBytes } from "crypto";
import { schema } from "@aiesec/db";
import { asc, eq } from "drizzle-orm";
import type { getDb } from "../db";

type Db = ReturnType<typeof getDb>;

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
