import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { pushDestination, registerForPush } from "./push";
import { useSession } from "./session";

/**
 * Registers this device for push once signed in, and routes taps.
 *
 * Mounted once from the root layout. Everything here is deliberately silent on
 * failure: a simulator, a declined permission prompt or an offline launch are
 * all normal states, and none of them should interrupt someone who just opened
 * the app to answer a DM.
 */
export function usePush() {
  const { session, me, activeLcId, setActiveLcId } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const registeredFor = useRef<string | null>(null);

  const userId = session?.user.id ?? null;
  // Wait for /me: registration stores the caller's active LC, and before /me
  // resolves the server would fall back to an arbitrary membership.
  const ready = Boolean(userId && me);

  useEffect(() => {
    if (!ready || !userId) return;
    // Re-register when the user or workspace changes, not on every render.
    const key = `${userId}:${activeLcId ?? ""}`;
    if (registeredFor.current === key) return;
    registeredFor.current = key;
    void registerForPush().catch(() => {
      // Let the next launch try again.
      registeredFor.current = null;
    });
  }, [ready, userId, activeLcId]);

  useEffect(() => {
    if (!userId) {
      registeredFor.current = null;
    }
  }, [userId]);

  // Tapping a notification — whether the app was backgrounded or cold-started.
  useEffect(() => {
    if (!userId) return;

    function open(response: Notifications.NotificationResponse) {
      const destination = pushDestination(response.notification.request.content.data);
      if (!destination) return;
      // The event may belong to a workspace the app isn't currently showing.
      if (destination.lcId !== activeLcId) setActiveLcId(destination.lcId);
      // The list behind the detail screen is stale by definition — something
      // just changed in it.
      void queryClient.invalidateQueries({ queryKey: ["conversations", destination.lcId] });
      void queryClient.invalidateQueries({ queryKey: ["appointments", destination.lcId] });
      router.push(destination.path as never);
    }

    // A cold start from a notification has no listener yet when the tap
    // happens, so the last response has to be read directly.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [userId, activeLcId, setActiveLcId, router, queryClient]);

  // A notification arriving while the app is open means the inbox behind it
  // just changed; refresh so the badge and list agree with the banner.
  useEffect(() => {
    if (!userId) return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    });
    return () => subscription.remove();
  }, [userId, queryClient]);
}
