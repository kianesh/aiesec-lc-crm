import type { PushData } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "./db";

type Db = ReturnType<typeof getDb>;

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
// Expo's documented cap per request.
const BATCH_SIZE = 100;

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: PushData;
  sound: "default";
  badge?: number;
  channelId?: string;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

export type PushPayload = {
  title: string;
  body: string;
  data: PushData;
};

/**
 * Fan a notification out to every registered device of every member of an LC,
 * optionally skipping one user (so the person who just acted isn't buzzed by
 * their own action).
 *
 * Membership in the LC is the gate, not the device's own `lcId` — a member of
 * two LCs should still hear about the workspace they aren't currently looking
 * at. The payload carries `lcId` so tapping the notification can switch to it.
 *
 * Best-effort by design: this is called from webhook and booking paths whose
 * primary job is to record data. A push failure must never fail that write, so
 * every error is swallowed after logging.
 */
export async function notifyLcMembers(
  db: Db,
  lcId: string,
  payload: PushPayload,
  options: { exceptUserId?: string | null } = {}
): Promise<{ sent: number }> {
  try {
    const conditions = [
      eq(schema.lcMembers.lcId, lcId),
      isNull(schema.devicePushTokens.disabledAt),
      ...(options.exceptUserId ? [ne(schema.devicePushTokens.userId, options.exceptUserId)] : [])
    ];

    const rows = await db
      .selectDistinct({ token: schema.devicePushTokens.token, platform: schema.devicePushTokens.platform })
      .from(schema.devicePushTokens)
      .innerJoin(schema.lcMembers, eq(schema.lcMembers.userId, schema.devicePushTokens.userId))
      .where(and(...conditions));

    if (rows.length === 0) return { sent: 0 };

    const messages: ExpoMessage[] = rows.map((row) => ({
      to: row.token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default",
      ...(row.platform === "android" ? { channelId: "default" } : {})
    }));

    let sent = 0;
    for (let index = 0; index < messages.length; index += BATCH_SIZE) {
      const batch = messages.slice(index, index + BATCH_SIZE);
      const tickets = await sendBatch(batch);
      sent += tickets.filter((ticket) => ticket.status === "ok").length;
      await disableDeadTokens(db, batch, tickets);
    }

    return { sent };
  } catch (error) {
    console.error("[push] notifyLcMembers failed:", error);
    return { sent: 0 };
  }
}

async function sendBatch(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  // Only required if the Expo project enables push security; harmless otherwise.
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(messages)
  });

  if (!response.ok) {
    console.error("[push] Expo returned", response.status, await response.text().catch(() => ""));
    return [];
  }

  const payload = (await response.json()) as { data?: ExpoTicket[] };
  return payload.data ?? [];
}

/**
 * Expo replies `DeviceNotRegistered` for tokens whose app has been uninstalled.
 * Marking them disabled keeps later batches from wasting a slot on a device
 * that will never receive anything again.
 */
async function disableDeadTokens(db: Db, messages: ExpoMessage[], tickets: ExpoTicket[]) {
  const dead: string[] = [];
  tickets.forEach((ticket, index) => {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      const token = messages[index]?.to;
      if (token) dead.push(token);
    }
  });

  if (dead.length === 0) return;
  await db
    .update(schema.devicePushTokens)
    .set({ disabledAt: new Date() })
    .where(inArray(schema.devicePushTokens.token, dead));
}
