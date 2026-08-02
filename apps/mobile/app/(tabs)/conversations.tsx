import { CHANNEL_LABELS, CONVERSATION_CHANNELS } from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Avatar, Badge, Loading, Row, StateBlock, Txt } from "../../src/components/ui";
import { ApiError } from "../../src/lib/api";
import { channelIcon, relativeTime, statusTone } from "../../src/lib/format";
import { useConversations, type ConversationFilters } from "../../src/lib/queries";
import { radius, space, useTheme } from "../../src/theme";

type Preset = "all" | "unread" | "mine" | "closed";

export default function ConversationsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [preset, setPreset] = useState<Preset>("all");
  const [channel, setChannel] = useState<ConversationFilters["channel"]>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const filters = useMemo<ConversationFilters>(() => {
    const base: ConversationFilters = { channel };
    if (preset === "unread") base.unread = true;
    if (preset === "mine") base.assigned = "me";
    if (preset === "closed") base.status = "closed";
    else if (preset !== "all") base.status = "open";
    return base;
  }, [preset, channel]);

  const { data, isPending, error, refetch } = useConversations(filters);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "mine", label: "Assigned to me" },
    { key: "closed", label: "Closed" }
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.surfaceMuted }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
          paddingTop: space.md
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md }}
        >
          {presets.map((item) => {
            const active = preset === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setPreset(item.key)}
                style={({ pressed }) => ({
                  paddingHorizontal: space.md,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: active ? theme.primary : theme.surfaceInset,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? theme.primary : theme.border,
                  opacity: pressed ? 0.7 : 1
                })}
              >
                <Txt variant="caption" tone={active ? "inverse" : "muted"} style={{ fontWeight: "600" }}>
                  {item.label}
                </Txt>
              </Pressable>
            );
          })}
          <View style={{ width: 1, backgroundColor: theme.border, marginHorizontal: space.xs }} />
          {CONVERSATION_CHANNELS.map((value) => {
            const active = channel === value;
            return (
              <Pressable
                key={value}
                onPress={() => setChannel(active ? undefined : value)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xs,
                  paddingHorizontal: space.md,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: active ? theme.primarySoft : theme.surfaceInset,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? theme.primary : theme.border,
                  opacity: pressed ? 0.7 : 1
                })}
              >
                <Ionicons name={channelIcon(value)} size={13} color={theme.channel[value]} />
                <Txt variant="caption" tone={active ? "primary" : "muted"} style={{ fontWeight: "600" }}>
                  {CHANNEL_LABELS[value]}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <StateBlock
          icon="cloud-offline-outline"
          title="Couldn't load the inbox"
          message={error instanceof ApiError ? error.message : "Something went wrong."}
          action={{ label: "Try again", onPress: () => void refetch() }}
        />
      ) : isPending ? (
        <Loading label="Loading conversations" />
      ) : (
        <FlatList
          data={data?.conversations ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <StateBlock
              icon="chatbubbles-outline"
              title={preset === "all" && !channel ? "Inbox zero" : "Nothing here"}
              message={
                preset === "all" && !channel
                  ? "Instagram DMs land here once the integration is connected on the web app."
                  : "No conversations match this filter."
              }
            />
          }
          renderItem={({ item }) => {
            const unread = item.unreadCount > 0;
            return (
              <Row onPress={() => router.push(`/conversations/${item.id}`)}>
                <Avatar name={item.name} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                    <Ionicons name={channelIcon(item.channel)} size={13} color={theme.channel[item.channel]} />
                    <Txt variant="label" numberOfLines={1} style={{ flex: 1, fontWeight: unread ? "700" : "500" }}>
                      {item.name}
                    </Txt>
                  </View>
                  <Txt variant="caption" tone={unread ? "default" : "subtle"} numberOfLines={1}>
                    {item.lastMessagePreview ?? "No messages yet"}
                  </Txt>
                  {item.assignedTo ? (
                    <Txt variant="caption" tone="subtle" numberOfLines={1}>
                      Assigned to {item.assignedTo.name}
                    </Txt>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Txt variant="caption" tone="subtle">
                    {relativeTime(item.lastMessageAt)}
                  </Txt>
                  {unread ? (
                    <Badge label={String(item.unreadCount)} tone="primary" />
                  ) : item.status !== "open" ? (
                    <Badge label={item.status} tone={statusTone(item.status)} />
                  ) : null}
                </View>
              </Row>
            );
          }}
        />
      )}
    </View>
  );
}
