import { z } from "zod";

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const registerPushTokenSchema = z.object({
  /** Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]". */
  token: z.string().trim().min(10).max(200),
  platform: z.enum(PUSH_PLATFORMS),
  deviceName: z.string().trim().max(120).nullable().optional()
});

export type RegisterPushTokenInput = z.input<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({
  token: z.string().trim().min(10).max(200)
});

export type UnregisterPushTokenInput = z.input<typeof unregisterPushTokenSchema>;

/**
 * The `data` payload every push carries, so a tap can deep-link to the right
 * screen. Kept flat and small — APNs caps the whole payload at 4 KB.
 */
export type PushData =
  | { kind: "conversation"; conversationId: string; lcId: string }
  | { kind: "appointment"; appointmentId: string; lcId: string };
