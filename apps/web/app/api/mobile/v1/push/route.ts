import { registerPushTokenSchema, unregisterPushTokenSchema } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

// Register (or refresh) this device's Expo push token. The app calls this on
// every launch, so it doubles as the "device is still alive" heartbeat that
// keeps `lastSeenAt` current.
export const POST = authed(async (request, session) => {
  const payload = await request.json().catch(() => null);
  if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

  const parsed = registerPushTokenSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);
  const { token, platform, deviceName } = parsed.data;

  const db = getDb();
  const now = new Date();

  try {
    // The token is unique per physical device, so a reinstall or a different
    // user signing in on the same phone updates the row rather than adding a
    // second one — otherwise the previous user would keep receiving this
    // device's pushes.
    await db
      .insert(schema.devicePushTokens)
      .values({
        userId: session.userId,
        lcId: session.membership.lcId,
        token,
        platform,
        deviceName: deviceName ?? null,
        lastSeenAt: now
      })
      .onConflictDoUpdate({
        target: schema.devicePushTokens.token,
        set: {
          userId: session.userId,
          lcId: session.membership.lcId,
          platform,
          deviceName: deviceName ?? null,
          disabledAt: null,
          lastSeenAt: now
        }
      });
  } catch (error) {
    // device_push_tokens missing (migration 0010 not applied yet). Same
    // posture as getMemberCapabilities/getNotifications: degrade instead of
    // 500ing, so an un-migrated deployment loses notifications rather than
    // breaking every app launch.
    console.error("[mobile-api] push registration failed:", error);
    return jsonOk({ ok: false, reason: "push_unavailable" });
  }

  return jsonOk({ ok: true });
});

// Called on sign-out so the phone stops receiving a signed-out user's pushes.
export const DELETE = authed(async (request, session) => {
  const payload = await request.json().catch(() => null);
  if (payload === null) return jsonError("invalid_request", "Expected a JSON body.");

  const parsed = unregisterPushTokenSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  const db = getDb();
  await db
    .delete(schema.devicePushTokens)
    .where(
      and(
        eq(schema.devicePushTokens.token, parsed.data.token),
        // Scoped to the caller so one user can't unregister another's device.
        eq(schema.devicePushTokens.userId, session.userId)
      )
    )
    // Sign-out must never fail because the table isn't there yet.
    .catch(() => undefined);

  return jsonOk({ ok: true });
});
