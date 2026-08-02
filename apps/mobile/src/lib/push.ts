import type { PushData } from "@aiesec/api-contract";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiFetch } from "./api";

// Show a banner even when the app is in the foreground: a DM arriving while
// you're on the dashboard is exactly as worth seeing as one that arrives while
// the app is closed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

/** The EAS project id, which getExpoPushTokenAsync needs on a real build. */
function projectId(): string | undefined {
  const easConfig = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  return easConfig?.projectId ?? Constants.easConfig?.projectId;
}

export type PushRegistration = { token: string } | { token: null; reason: string };

// The token this install last registered. Held here rather than in React state
// because sign-out needs it after the component tree has already torn down.
let currentToken: string | null = null;

export function getCurrentPushToken() {
  return currentToken;
}

/**
 * Ask for permission and register this device's Expo push token with the API.
 *
 * Returns a reason instead of throwing when push isn't available, so the caller
 * can stay quiet: a simulator or a declined prompt is a normal state, not an
 * error worth interrupting anyone over.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return { token: null, reason: "Push notifications only work on a physical device." };
  }

  if (Platform.OS === "android") {
    // Android 8+ drops notifications that don't belong to a channel.
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#037ef3"
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    // Only prompts once per install; afterwards iOS returns the stored answer.
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return { token: null, reason: "Notifications are turned off for this app." };
  }

  const id = projectId();
  const { data: token } = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);

  await apiFetch("/push", {
    method: "POST",
    body: {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceName: Device.deviceName ?? null
    }
  });

  currentToken = token;
  return { token };
}

/** Drop this device's token so a signed-out phone stops buzzing. */
export async function unregisterPush(token: string): Promise<void> {
  await apiFetch("/push", { method: "DELETE", body: { token } }).catch(() => {
    // Signing out offline is normal; the token is also reassigned on the next
    // sign-in, so a missed delete self-heals.
  });
  if (currentToken === token) currentToken = null;
}

/** Where a tapped notification should land. */
export function pushDestination(data: unknown): { path: string; lcId: string } | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Partial<PushData> & { kind?: string };
  if (payload.kind === "conversation" && typeof payload.conversationId === "string" && typeof payload.lcId === "string") {
    return { path: `/conversations/${payload.conversationId}`, lcId: payload.lcId };
  }
  if (payload.kind === "appointment" && typeof payload.appointmentId === "string" && typeof payload.lcId === "string") {
    return { path: `/appointments/${payload.appointmentId}`, lcId: payload.lcId };
  }
  return null;
}
