import { z } from "zod";

export const APPOINTMENT_STATUSES = ["confirmed", "cancelled", "completed", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No show"
};

// ------------------------------------------------------------------ DTOs --

export type AppointmentListItemDto = {
  id: string;
  typeName: string | null;
  typeColor: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  status: AppointmentStatus;
  /** ISO 8601 */
  startAt: string;
  /** ISO 8601 */
  endAt: string;
  /** IANA zone the booking was made in, e.g. "America/Toronto". */
  timezone: string;
  meetUrl: string | null;
  contactId: string | null;
};

export type AppointmentDetailDto = AppointmentListItemDto & {
  notes: string | null;
  intakeResponses: { label: string; value: string }[];
  htmlLink: string | null;
  contact: { id: string; fullName: string; email: string | null; phone: string | null } | null;
  /** ISO 8601 */
  createdAt: string;
};

export type AppointmentListResponse = {
  appointments: AppointmentListItemDto[];
  total: number;
  /** Confirmed appointments starting in the next 24h — drives the tab badge. */
  todayCount: number;
};

// -------------------------------------------------------------- requests --

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const appointmentListQuerySchema = z.object({
  /**
   * upcoming — confirmed, starting from now (default)
   * today    — confirmed, starting within the caller's current day
   * past     — anything that already ended, newest first
   * all      — every appointment, newest first
   */
  scope: z.preprocess(emptyToUndefined, z.enum(["upcoming", "today", "past", "all"]).default("upcoming")),
  status: z.preprocess(emptyToUndefined, z.enum(APPOINTMENT_STATUSES).optional()),
  /**
   * IANA timezone used to resolve "today" on the phone rather than on the
   * server, which runs in UTC.
   */
  timezone: z.preprocess(emptyToUndefined, z.string().max(64).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const updateAppointmentSchema = z.object({
  // "confirmed" is deliberately absent: un-cancelling would need the Google
  // Calendar event recreated, which only the web flow does today.
  status: z.enum(["cancelled", "completed", "no_show"])
});

export type UpdateAppointmentInput = z.input<typeof updateAppointmentSchema>;
