import {
  appointmentListQuerySchema,
  type AppointmentListItemDto,
  type AppointmentListResponse
} from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, asc, count, desc, eq, gte, lt, lte, type SQL } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, jsonOk, zodError } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

/**
 * Start and end of "today" in the caller's timezone, as absolute instants.
 *
 * The phone sends its IANA zone because the server runs in UTC — "today" for a
 * member in Toronto is not the UTC day. Falls back to the UTC day if the zone
 * is unusable, which is wrong by at most a few hours rather than a whole day.
 */
function dayBounds(timezone: string | undefined, now: Date): { start: Date; end: Date } {
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
      // Seconds elapsed in the local day, subtracted from `now` to get local midnight.
      const elapsed =
        Number(parts.hour ?? 0) * 3600 + Number(parts.minute ?? 0) * 60 + Number(parts.second ?? 0);
      const start = new Date(now.getTime() - elapsed * 1000);
      return { start, end: new Date(start.getTime() + 86_400_000) };
    } catch {
      // Invalid IANA name — fall through to UTC.
    }
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export const GET = authed(async (request, session) => {
  const url = new URL(request.url);
  const parsed = appointmentListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodError(parsed.error);
  const { scope, status, timezone, limit, offset } = parsed.data;

  const db = getDb();
  const lcId = session.membership.lcId;
  const now = new Date();

  const filters: SQL[] = [eq(schema.appointments.lcId, lcId)];
  if (status) filters.push(eq(schema.appointments.status, status));

  let newestFirst = false;
  if (scope === "upcoming") {
    filters.push(gte(schema.appointments.startAt, now));
    if (!status) filters.push(eq(schema.appointments.status, "confirmed"));
  } else if (scope === "today") {
    const { start, end } = dayBounds(timezone, now);
    filters.push(gte(schema.appointments.startAt, start), lt(schema.appointments.startAt, end));
  } else if (scope === "past") {
    filters.push(lte(schema.appointments.endAt, now));
    newestFirst = true;
  } else {
    newestFirst = true;
  }

  const where = and(...filters);
  const { start: todayStart, end: todayEnd } = dayBounds(timezone, now);

  const [rows, [totalRow], [todayRow]] = await Promise.all([
    db
      .select({
        id: schema.appointments.id,
        typeName: schema.appointments.typeName,
        typeColor: schema.appointmentTypes.color,
        guestName: schema.appointments.guestName,
        guestEmail: schema.appointments.guestEmail,
        guestPhone: schema.appointments.guestPhone,
        status: schema.appointments.status,
        startAt: schema.appointments.startAt,
        endAt: schema.appointments.endAt,
        timezone: schema.appointments.timezone,
        meetUrl: schema.appointments.meetUrl,
        contactId: schema.appointments.contactId
      })
      .from(schema.appointments)
      .leftJoin(schema.appointmentTypes, eq(schema.appointments.appointmentTypeId, schema.appointmentTypes.id))
      .where(where)
      .orderBy(newestFirst ? desc(schema.appointments.startAt) : asc(schema.appointments.startAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.appointments).where(where),
    db
      .select({ value: count() })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.lcId, lcId),
          eq(schema.appointments.status, "confirmed"),
          gte(schema.appointments.startAt, todayStart),
          lt(schema.appointments.startAt, todayEnd)
        )
      )
  ]);

  const appointments: AppointmentListItemDto[] = rows.map((row) => ({
    id: row.id,
    typeName: row.typeName,
    typeColor: row.typeColor,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestPhone: row.guestPhone,
    status: row.status,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    timezone: row.timezone,
    meetUrl: row.meetUrl,
    contactId: row.contactId
  }));

  const body: AppointmentListResponse = {
    appointments,
    total: totalRow?.value ?? 0,
    todayCount: todayRow?.value ?? 0
  };

  return jsonOk(body);
});
