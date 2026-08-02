import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useDashboard } from "../../src/lib/queries";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const theme = useTheme();
  // Shares the dashboard query key, so this costs no extra request.
  const { data: dashboard } = useDashboard();
  const unreadCount = dashboard?.stats.unreadConversations ?? 0;
  const unread = unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSubtle,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: theme.surface },
        headerTitleStyle: { color: theme.text, fontSize: 17, fontWeight: "600" },
        headerTintColor: theme.primary,
        sceneStyle: { backgroundColor: theme.surfaceMuted }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Inbox",
          tabBarBadge: unread,
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={color} />
        }}
      />
    </Tabs>
  );
}
