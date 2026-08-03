import {
  bookingSettingsSchema,
  type AppointmentTypeSummaryDto,
  type BookingResponse,
  type BookingSettingsDto
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../lib/api/respond";
import {
  getAppointmentTypes,
  getAvailabilityRules,
  getBookingSettingsByLc,
  slugify
} from "../../../../../lib/booking/store";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

function countIntakeFields(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function settingsDto(row: NonNullable<Awaited<ReturnType<typeof getBookingSettingsByLc>>>): BookingSettingsDto {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    timezone: row.timezone,
    calendarId: row.calendarId,
    active: row.active,
    publicPath: `/book/${row.slug}`
  };
}

export const GET = authed(async (_request, session) => {
  const db = getDb();
  const lcId = session.membership.lcId;

  const [settings, rules, types] = await Promise.all([
    getBookingSettingsByLc(db, lcId),
    getAvailabilityRules(db, lcId),
    getAppointmentTypes(db, lcId)
  ]);

  const body: BookingResponse = {
    settings: settings ? settingsDto(settings) : null,
    rules: rules.map((rule) => ({
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime
    })),
    types: types.map(
      (type): AppointmentTypeSummaryDto => ({
        id: type.id,
        name: type.name,
        slug: type.slug,
        description: type.description,
        durationMinutes: type.durationMinutes,
        bufferMinutes: type.bufferMinutes,
        minNoticeHours: type.minNoticeHours,
        maxAdvanceDays: type.maxAdvanceDays,
        color: type.color,
        active: type.active,
        intakeFieldCount: countIntakeFields(type.intakeFields),
        // Empty until a hub exists; the app hides the link rather than offering
        // a /book/undefined/... that 404s.
        publicPath: settings ? `/book/${settings.slug}/${type.slug}` : ""
      })
    ),
    canManage: session.capabilities.has("manage_booking")
  };

  return jsonOk(body);
});

// Creates the hub row on first save so the phone can set booking up from
// scratch, rather than requiring a trip to the web app to bring one into being.
export const PATCH = authed(
  async (request, session) => {
    const payload = await request.json().catch(() => null);
    const parsed = bookingSettingsSchema.safeParse(payload ?? {});
    if (!parsed.success) return zodError(parsed.error);

    const db = getDb();
    const lcId = session.membership.lcId;
    const input = parsed.data;

    const values = {
      title: input.title,
      description: input.description?.trim() ? input.description.trim() : null,
      // Normalise here too: the phone shows a plain text field, so whatever is
      // typed has to survive the same slugify the web form applies.
      slug: slugify(input.slug),
      timezone: input.timezone,
      active: input.active
    };

    const existing = await getBookingSettingsByLc(db, lcId);

    try {
      if (existing) {
        await db
          .update(schema.bookingSettings)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(schema.bookingSettings.id, existing.id));
      } else {
        await db.insert(schema.bookingSettings).values({ lcId, calendarId: "primary", ...values });
      }
    } catch {
      // `slug` is globally unique — another LC already owns this link.
      return jsonError("conflict", "That link is already taken. Try a different one.");
    }

    const saved = await getBookingSettingsByLc(db, lcId);
    if (!saved) return jsonError("server_error", "Couldn't save the booking page.");

    return jsonOk<BookingSettingsDto>(settingsDto(saved));
  },
  { capability: "manage_booking" }
);
