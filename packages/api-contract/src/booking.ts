import { z } from "zod";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
] as const;

/** "HH:MM" in 24h, local to the booking timezone. */
const timeString = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use HH:MM, e.g. 14:30");

export type BookingSettingsDto = {
  slug: string;
  title: string;
  description: string | null;
  timezone: string;
  calendarId: string;
  active: boolean;
  /** Path on the web app that serves this LC's public hub. */
  publicPath: string;
};

export type AvailabilityRuleDto = {
  /** 0 = Sunday … 6 = Saturday, matching JS getDay(). */
  weekday: number;
  startTime: string;
  endTime: string;
};

export type AppointmentTypeSummaryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  color: string;
  active: boolean;
  /** How many intake questions it asks; editing them stays on the web app. */
  intakeFieldCount: number;
  publicPath: string;
};

export type BookingResponse = {
  /** Null until someone saves settings or creates a type on the web app. */
  settings: BookingSettingsDto | null;
  rules: AvailabilityRuleDto[];
  types: AppointmentTypeSummaryDto[];
  canManage: boolean;
};

export const bookingSettingsSchema = z.object({
  title: z.string().min(1, "Give the page a title.").max(120),
  description: z.string().max(2000).nullable().optional(),
  slug: z.string().min(1, "Pick a link.").max(48),
  timezone: z.string().min(1).max(64),
  active: z.boolean()
});
export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>;

export const availabilityRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: timeString,
    endTime: timeString
  })
  // A window that ends before it starts yields no slots at all, so reject it
  // here rather than silently dropping it the way the web form does.
  .refine((rule) => rule.startTime < rule.endTime, {
    message: "The end time has to be after the start time.",
    path: ["endTime"]
  });

export const availabilitySchema = z.object({
  rules: z.array(availabilityRuleSchema).max(50)
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

/** The phone can enable/disable a type; its full shape is edited on the web. */
export const appointmentTypeToggleSchema = z.object({
  active: z.boolean()
});
