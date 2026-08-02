import { updateAppointmentSchema, type AppointmentDetailDto } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { setAppointmentStatus } from "../../../../../../lib/appointments/status";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

/** `intake_responses` is free-form JSON; keep only well-formed entries. */
function normalizeIntake(value: unknown): { label: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const label = (entry as { label?: unknown }).label;
    const answer = (entry as { value?: unknown }).value;
    if (typeof label !== "string") return [];
    return [{ label, value: answer === null || answer === undefined ? "—" : String(answer) }];
  });
}

export const GET = authed<Params>(async (_request, session, { params }) => {
  const db = getDb();
  const lcId = session.membership.lcId;

  const [row] = await db
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
      htmlLink: schema.appointments.htmlLink,
      notes: schema.appointments.notes,
      intakeResponses: schema.appointments.intakeResponses,
      createdAt: schema.appointments.createdAt,
      contactId: schema.contacts.id,
      contactFullName: schema.contacts.fullName,
      contactEmail: schema.contacts.email,
      contactPhone: schema.contacts.phone
    })
    .from(schema.appointments)
    .leftJoin(schema.appointmentTypes, eq(schema.appointments.appointmentTypeId, schema.appointmentTypes.id))
    .leftJoin(schema.contacts, eq(schema.appointments.contactId, schema.contacts.id))
    .where(and(eq(schema.appointments.id, params.id), eq(schema.appointments.lcId, lcId)))
    .limit(1);

  if (!row) return jsonError("not_found", "That appointment no longer exists.");

  const body: AppointmentDetailDto = {
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
    htmlLink: row.htmlLink,
    notes: row.notes,
    intakeResponses: normalizeIntake(row.intakeResponses),
    createdAt: row.createdAt.toISOString(),
    contactId: row.contactId,
    contact: row.contactId
      ? {
          id: row.contactId,
          fullName: row.contactFullName ?? "Unknown",
          email: row.contactEmail,
          phone: row.contactPhone
        }
      : null
  };

  return jsonOk(body);
});

export const PATCH = authed<Params>(
  async (request, session, { params }) => {
    const payload = await request.json().catch(() => null);
    if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

    const parsed = updateAppointmentSchema.safeParse(payload);
    if (!parsed.success) return zodError(parsed.error);

    const result = await setAppointmentStatus(getDb(), session.membership.lcId, params.id, parsed.data.status, {
      via: "mobile",
      actorId: session.userId
    });

    if (!result.ok) return jsonError("not_found", "That appointment no longer exists.");
    return jsonOk({ ok: true, changed: result.changed });
  },
  { capability: "manage_booking" }
);
