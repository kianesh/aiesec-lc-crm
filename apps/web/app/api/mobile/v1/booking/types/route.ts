import {
  appointmentTypeCreateSchema,
  type AppointmentTypeSummaryDto
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { randomBytes } from "node:crypto";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { getBookingSettingsByLc, slugify } from "../../../../../../lib/booking/store";
import { getDb } from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Db = ReturnType<typeof getDb>;

// A type's public link lives under the LC's booking hub, so make sure one
// exists before saving — otherwise the new type has a dead link. Mirrors the
// web action's ensureBookingSettings.
async function ensureBookingSettings(db: Db, lcId: string, lcName: string) {
  const existing = await getBookingSettingsByLc(db, lcId);
  if (existing) return existing;

  const base = slugify(lcName);
  const candidates = [base, `${base}-${randomBytes(2).toString("hex")}`, `${base}-${randomBytes(3).toString("hex")}`];
  for (const slug of candidates) {
    try {
      await db.insert(schema.bookingSettings).values({
        lcId,
        slug,
        title: `Book with ${lcName}`,
        timezone: "America/Toronto",
        calendarId: "primary",
        active: true
      });
      return getBookingSettingsByLc(db, lcId);
    } catch {
      // `slug` is globally unique — collided with another LC, try the next.
    }
  }
  return null;
}

export const POST = authed(
  async (request, session) => {
    const payload = await request.json().catch(() => null);
    const parsed = appointmentTypeCreateSchema.safeParse(payload ?? {});
    if (!parsed.success) return zodError(parsed.error);

    const db = getDb();
    const lcId = session.membership.lcId;
    const input = parsed.data;

    const settings = await ensureBookingSettings(db, lcId, session.membership.lcName);

    const slug = slugify(input.slug || input.name);

    let created;
    try {
      [created] = await db
        .insert(schema.appointmentTypes)
        .values({
          lcId,
          name: input.name,
          slug,
          description: input.description?.trim() ? input.description.trim() : null,
          durationMinutes: input.durationMinutes,
          bufferMinutes: input.bufferMinutes,
          minNoticeHours: input.minNoticeHours,
          maxAdvanceDays: input.maxAdvanceDays,
          active: input.active,
          // Intake questions are built on the web; a new type starts with none.
          intakeFields: []
        })
        .returning();
    } catch {
      // Unique (lc_id, slug) — two types can't share a link.
      return jsonError("conflict", "A type with that link already exists. Pick a different name.");
    }

    if (!created) return jsonError("server_error", "Couldn't create the appointment type.");

    const body: AppointmentTypeSummaryDto = {
      id: created.id,
      name: created.name,
      slug: created.slug,
      description: created.description,
      durationMinutes: created.durationMinutes,
      bufferMinutes: created.bufferMinutes,
      minNoticeHours: created.minNoticeHours,
      maxAdvanceDays: created.maxAdvanceDays,
      color: created.color,
      active: created.active,
      intakeFieldCount: 0,
      publicPath: settings ? `/book/${settings.slug}/${created.slug}` : ""
    };

    return jsonOk(body, { status: 201 });
  },
  { capability: "manage_booking" }
);
