"use server";

import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { deleteCalendarEvent, getGoogleAccessToken } from "../../../lib/connectors/google";
import { getBookingSettingsByLc, slugify } from "../../../lib/booking/store";

const settingsSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  slug: z.string().min(1).max(48),
  timezone: z.string().min(1).max(64),
  calendarId: z.string().min(1).max(256),
  active: z.boolean()
});

const typeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(1).max(120),
  slug: z.string().max(48).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  bufferMinutes: z.coerce.number().int().min(0).max(240),
  minNoticeHours: z.coerce.number().int().min(0).max(720),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  active: z.boolean()
});

const ruleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/)
});

export async function saveBookingSettings(formData: FormData) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/appointments?error=not_allowed");

  const input = settingsSchema.parse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    slug: slugify(String(formData.get("slug") || "")),
    timezone: formData.get("timezone"),
    calendarId: formData.get("calendarId") || "primary",
    active: formData.get("active") === "on"
  });

  const db = getDb();
  const existing = await getBookingSettingsByLc(db, activeMembership.lcId);

  try {
    if (existing) {
      await db
        .update(schema.bookingSettings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.bookingSettings.id, existing.id));
    } else {
      await db.insert(schema.bookingSettings).values({ lcId: activeMembership.lcId, ...input });
    }
  } catch {
    // Most likely a slug collision with another LC.
    redirect("/appointments?error=slug_taken");
  }

  redirect("/appointments?saved=1");
}

export async function saveAppointmentType(formData: FormData) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/appointments?error=not_allowed");

  let input: z.infer<typeof typeSchema>;
  try {
    input = typeSchema.parse({
      id: formData.get("id") || undefined,
      name: formData.get("name"),
      slug: formData.get("slug") || undefined,
      description: formData.get("description") || undefined,
      durationMinutes: formData.get("durationMinutes"),
      bufferMinutes: formData.get("bufferMinutes"),
      minNoticeHours: formData.get("minNoticeHours"),
      maxAdvanceDays: formData.get("maxAdvanceDays"),
      active: formData.get("active") === "on"
    });
  } catch {
    redirect("/appointments?error=bad_type");
  }

  const slug = slugify(input.slug || input.name);
  const values = {
    name: input.name,
    slug,
    description: input.description || null,
    durationMinutes: input.durationMinutes,
    bufferMinutes: input.bufferMinutes,
    minNoticeHours: input.minNoticeHours,
    maxAdvanceDays: input.maxAdvanceDays,
    active: input.active
  };

  const db = getDb();
  try {
    if (input.id) {
      await db
        .update(schema.appointmentTypes)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(schema.appointmentTypes.id, input.id), eq(schema.appointmentTypes.lcId, activeMembership.lcId)));
    } else {
      await db.insert(schema.appointmentTypes).values({ lcId: activeMembership.lcId, ...values });
    }
  } catch {
    // Unique (lc_id, slug) collision — two types can't share a link.
    redirect("/appointments?error=type_slug_taken");
  }

  redirect("/appointments?saved=1");
}

export async function deleteAppointmentType(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/appointments?error=not_allowed");

  const db = getDb();
  await db
    .delete(schema.appointmentTypes)
    .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.lcId, activeMembership.lcId)));

  revalidatePath("/appointments");
}

export async function saveAvailability(formData: FormData) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/appointments?error=not_allowed");

  let rules: z.infer<typeof ruleSchema>[] = [];
  try {
    const raw = JSON.parse(String(formData.get("rules") || "[]"));
    rules = z.array(ruleSchema).parse(raw).filter((r) => r.startTime < r.endTime);
  } catch {
    redirect("/appointments?error=bad_rules");
  }

  const db = getDb();
  await db.delete(schema.availabilityRules).where(eq(schema.availabilityRules.lcId, activeMembership.lcId));
  if (rules.length > 0) {
    await db.insert(schema.availabilityRules).values(
      rules.map((r) => ({ lcId: activeMembership.lcId, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }))
    );
  }

  redirect("/appointments?saved=1");
}

export async function cancelAppointment(id: string) {
  const { activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/appointments?error=not_allowed");

  const db = getDb();
  const [appt] = await db
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.id, id), eq(schema.appointments.lcId, activeMembership.lcId)))
    .limit(1);
  if (!appt || appt.status === "cancelled") return;

  if (appt.googleEventId) {
    try {
      const accessToken = await getGoogleAccessToken(db, appt.lcId);
      const settings = await getBookingSettingsByLc(db, appt.lcId);
      await deleteCalendarEvent(accessToken, appt.googleEventId, settings?.calendarId ?? "primary", "all");
    } catch {
      // ignore — still cancel in our DB
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
      metadata: { appointmentId: appt.id, via: "dashboard" }
    });
  }

  revalidatePath("/appointments");
}
