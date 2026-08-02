import {
  EMAIL_CAMPAIGN_STATUSES,
  EMAIL_CAMPAIGN_STATUS_LABELS,
  type EmailCampaignStatus
} from "@aiesec/api-contract";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Badge, Loading, Row, StateBlock, Txt } from "../../src/components/ui";
import { ApiError } from "../../src/lib/api";
import { campaignStatusTone, relativeTime } from "../../src/lib/format";
import { useCampaigns } from "../../src/lib/queries";
import { radius, space, useTheme } from "../../src/theme";

export default function EmailCampaignsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<EmailCampaignStatus | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isPending, error, refetch } = useCampaigns({ status });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Campaigns" }} />
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
            {[undefined, ...EMAIL_CAMPAIGN_STATUSES].map((value) => {
              const active = status === value;
              const label = value ? EMAIL_CAMPAIGN_STATUS_LABELS[value] : "All";
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
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {error ? (
          <StateBlock
            icon="cloud-offline-outline"
            title="Couldn't load campaigns"
            message={error instanceof ApiError ? error.message : "Something went wrong."}
            action={{ label: "Try again", onPress: () => void refetch() }}
          />
        ) : isPending ? (
          <Loading label="Loading campaigns" />
        ) : (
          <FlatList
            data={data?.campaigns ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
            ListFooterComponent={
              data && data.campaigns.length > 0 ? (
                <View style={{ padding: space.lg }}>
                  <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
                    Write and edit campaigns on the web app — this screen is for reviewing, testing and sending them.
                  </Txt>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <StateBlock
                icon="mail-outline"
                title={status ? `No ${EMAIL_CAMPAIGN_STATUS_LABELS[status].toLowerCase()} campaigns` : "No campaigns yet"}
                message="Campaigns are written on the web app. Once one exists, you can review its stats and send it from here."
              />
            }
            renderItem={({ item }) => (
              <Row onPress={() => router.push(`/email/${item.id}`)}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt variant="label" numberOfLines={1}>
                    {item.name}
                  </Txt>
                  <Txt variant="caption" tone="subtle" numberOfLines={1}>
                    {item.subject}
                  </Txt>
                  <Txt variant="caption" tone="subtle">
                    {item.sentAt
                      ? `Sent ${relativeTime(item.sentAt)} · ${item.stats.sent} delivered`
                      : `Updated ${relativeTime(item.updatedAt)}`}
                  </Txt>
                </View>
                <Badge label={EMAIL_CAMPAIGN_STATUS_LABELS[item.status]} tone={campaignStatusTone(item.status)} />
              </Row>
            )}
          />
        )}
      </View>
    </>
  );
}
