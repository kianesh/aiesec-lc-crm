import {
  SOCIAL_POST_STATUSES,
  SOCIAL_POST_STATUS_LABELS,
  type SocialPostStatus
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Badge, Loading, Row, StateBlock, Txt } from "../../src/components/ui";
import { ApiError } from "../../src/lib/api";
import { relativeTime, socialStatusTone } from "../../src/lib/format";
import { useSocialPosts } from "../../src/lib/queries";
import { radius, space, useTheme } from "../../src/theme";

export default function SocialQueueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<SocialPostStatus | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isPending, error, refetch } = useSocialPosts({ status });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const canManage = data?.canManage ?? false;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Social",
          headerRight: () =>
            canManage ? (
              <Pressable onPress={() => router.push("/social/new")} hitSlop={8}>
                <Ionicons name="add" size={24} color={theme.primary} />
              </Pressable>
            ) : null
        }}
      />
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
            {[undefined, ...SOCIAL_POST_STATUSES].map((value) => {
              const active = status === value;
              const label = value ? SOCIAL_POST_STATUS_LABELS[value] : "All";
              const badge = value ? data?.counts[value] : data?.total;
              return (
                <Pressable
                  key={label}
                  onPress={() => setStatus(value)}
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
                    {label}
                    {typeof badge === "number" ? ` ${badge}` : ""}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {data && !data.instagramConnected ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
            <Txt variant="caption" tone="warning">
              Instagram isn't connected, so posts can be drafted and scheduled here but not published. Connect it from
              Integrations on the web app.
            </Txt>
          </View>
        ) : null}

        {error ? (
          <StateBlock
            icon="cloud-offline-outline"
            title="Couldn't load posts"
            message={error instanceof ApiError ? error.message : "Something went wrong."}
            action={{ label: "Try again", onPress: () => void refetch() }}
          />
        ) : isPending ? (
          <Loading label="Loading posts" />
        ) : (
          <FlatList
            data={data?.posts ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
            ListEmptyComponent={
              <StateBlock
                icon="images-outline"
                title={status ? `No ${SOCIAL_POST_STATUS_LABELS[status].toLowerCase()} posts` : "No posts yet"}
                message={canManage ? "Tap + to draft one from a photo on your phone." : undefined}
                action={canManage && !status ? { label: "New post", onPress: () => router.push("/social/new") } : undefined}
              />
            }
            renderItem={({ item }) => (
              <Row onPress={() => router.push(`/social/${item.id}`)}>
                {item.mediaUrls[0] ? (
                  <Image
                    source={{ uri: item.mediaUrls[0] }}
                    style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: theme.surfaceSunken }}
                  />
                ) : (
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: radius.md,
                      backgroundColor: theme.surfaceSunken,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Ionicons name="document-text-outline" size={20} color={theme.textSubtle} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt variant="label" numberOfLines={1}>
                    {item.title || item.caption || "Untitled post"}
                  </Txt>
                  <Txt variant="caption" tone="subtle" numberOfLines={1}>
                    {item.platforms.join(" · ") || "No platform"}
                  </Txt>
                  <Txt variant="caption" tone="subtle">
                    {item.scheduledFor
                      ? `Scheduled ${new Date(item.scheduledFor).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : `Updated ${relativeTime(item.updatedAt)}`}
                  </Txt>
                </View>
                <Badge label={SOCIAL_POST_STATUS_LABELS[item.status]} tone={socialStatusTone(item.status)} />
              </Row>
            )}
          />
        )}
      </View>
    </>
  );
}
