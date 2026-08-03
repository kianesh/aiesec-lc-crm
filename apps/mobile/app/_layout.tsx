import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError } from "../src/lib/api";
import { SessionProvider, useSession } from "../src/lib/session";
import { usePush } from "../src/lib/use-push";
import { useTheme, ThemeProvider } from "../src/theme";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A phone is offline often enough that a stale-but-instant screen beats
        // a spinner; the pull-to-refresh on each list is the manual escape.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: (failureCount, error) => !(error instanceof ApiError && error.isAuthError) && failureCount < 2
      },
      mutations: { retry: 0 }
    }
  });
}

// Sends signed-out users to /sign-in and signed-in users out of it. Kept in its
// own component so it sits inside <SessionProvider>.
function AuthGate() {
  const { session, initializing } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();
  const navigationReady = useRef(false);

  // Registers the device for push once signed in, and routes notification taps.
  usePush();

  useEffect(() => {
    if (initializing) return;
    // The first render happens before the navigator mounts; deferring one tick
    // avoids "navigate before mounting the Root Layout".
    if (!navigationReady.current) {
      navigationReady.current = true;
    }
    const onAuthScreen = segments[0] === "sign-in";
    if (!session && !onAuthScreen) router.replace("/sign-in");
    else if (session && onAuthScreen) router.replace("/");
  }, [session, initializing, segments, router]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.surfaceMuted }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.primary,
        headerTitleStyle: { color: theme.text, fontSize: 17, fontWeight: "600" },
        contentStyle: { backgroundColor: theme.surfaceMuted }
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="contacts/[id]" options={{ title: "Contact" }} />
      <Stack.Screen name="contacts/new" options={{ title: "New contact", presentation: "modal" }} />
      <Stack.Screen name="conversations/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen name="appointments/[id]" options={{ title: "Appointment" }} />
      <Stack.Screen name="expa/index" options={{ title: "EXPA" }} />
      <Stack.Screen name="social/index" options={{ title: "Social" }} />
      <Stack.Screen name="social/new" options={{ title: "New post", presentation: "modal" }} />
      <Stack.Screen name="social/[id]" options={{ title: "Post" }} />
      <Stack.Screen name="email/index" options={{ title: "Campaigns" }} />
      <Stack.Screen name="email/[id]" options={{ title: "Campaign" }} />
      <Stack.Screen name="organization/index" options={{ title: "Organization" }} />
      <Stack.Screen name="integrations/index" options={{ title: "Integrations" }} />
      <Stack.Screen name="booking/index" options={{ title: "Booking" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SessionProvider>
              <StatusBar style="auto" />
              <AuthGate />
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
