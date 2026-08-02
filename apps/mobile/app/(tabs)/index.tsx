import { FUNNEL_STAGE_LABELS, PROGRAMME_LABELS, type DashboardResponse } from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Avatar, Badge, Button, Card, Row, Skeleton, StateBlock, Txt } from "../../src/components/ui";
import { ApiError } from "../../src/lib/api";
import { channelIcon, relativeTime } from "../../src/lib/format";
import { useDashboard } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";

function StatTile({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 150, gap: space.sm, padding: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Ionicons name={icon} size={15} color={theme.textSubtle} />
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </Txt>
      </View>
      <Txt variant="title">{value.toLocaleString()}</Txt>
    </Card>
  );
}

// Horizontal bars rather than a charting library: at phone width a 7-stage
// funnel is only readable stacked, and it keeps the bundle free of a chart dep
// until the EXPA analytics phase actually needs one.
function Funnel({ pipeline }: { pipeline: DashboardResponse["pipeline"] }) {
  const theme = useTheme();
  const max = Math.max(...pipeline.map((row) => row.value), 1);

  return (
    <Card style={{ gap: space.md }}>
      <Txt variant="heading">Pipeline</Txt>
      {pipeline.every((row) => row.value === 0) ? (
        <Txt variant="caption" tone="subtle">
          No contacts have a funnel stage yet.
        </Txt>
      ) : (
        pipeline.map((row) => (
          <View key={row.stage} style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="caption" tone="muted">
                {FUNNEL_STAGE_LABELS[row.stage]}
              </Txt>
              <Txt variant="caption">{row.value}</Txt>
            </View>
            <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: theme.surfaceSunken }}>
              <View
                style={{
                  height: 8,
                  borderRadius: radius.pill,
                  backgroundColor: theme.primary,
                  width: `${Math.max((row.value / max) * 100, row.value > 0 ? 4 : 0)}%`
                }}
              />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { me } = useSession();
  const { data, isPending, error, refetch } = useDashboard();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <StateBlock
        icon={apiError?.code === "forbidden" ? "lock-closed-outline" : "cloud-offline-outline"}
        title={apiError?.code === "forbidden" ? "No analytics access" : "Couldn't load the dashboard"}
        message={apiError?.message ?? "Something went wrong."}
        action={{ label: "Try again", onPress: () => void refetch() }}
      />
    );
  }

  if (isPending || !data) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Skeleton height={20} width="60%" />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
        <Skeleton height={200} />
        <Skeleton height={160} />
      </ScrollView>
    );
  }

  const firstName = me?.user.fullName?.split(" ")[0];

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <View style={{ gap: space.xs }}>
        <Txt variant="eyebrow" tone="subtle">
          {data.lcName}
        </Txt>
        <Txt variant="display">{firstName ? `Hi ${firstName}` : "Dashboard"}</Txt>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
        <StatTile label="Contacts" value={data.stats.contacts} icon="people-outline" />
        <StatTile label="Unread" value={data.stats.unreadConversations} icon="mail-unread-outline" />
        <StatTile label="Open threads" value={data.stats.openConversations} icon="chatbubbles-outline" />
        <StatTile label="Scheduled posts" value={data.stats.scheduledPosts} icon="calendar-outline" />
      </View>

      <Funnel pipeline={data.pipeline} />

      {data.programmes.length > 0 ? (
        <Card style={{ gap: space.md }}>
          <Txt variant="heading">Programmes</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {data.programmes.map((row) => (
              <Badge key={row.programme} label={`${PROGRAMME_LABELS[row.programme]} · ${row.value}`} tone="primary" />
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: space.lg
          }}
        >
          <Txt variant="heading">Recent conversations</Txt>
          <Button label="Inbox" variant="ghost" onPress={() => router.push("/conversations")} />
        </View>
        {data.recentConversations.length === 0 ? (
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
            <Txt variant="caption" tone="subtle">
              Nothing yet. Connect Instagram on the web app to start syncing DMs.
            </Txt>
          </View>
        ) : (
          data.recentConversations.map((conversation) => (
            <Row
              key={conversation.id}
              onPress={() => router.push(`/conversations/${conversation.id}`)}
              style={{ paddingHorizontal: space.lg }}
            >
              <Avatar name={conversation.name} size={34} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label" numberOfLines={1}>
                  {conversation.name}
                </Txt>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <Ionicons
                    name={channelIcon(conversation.channel)}
                    size={12}
                    color={theme.channel[conversation.channel]}
                  />
                  <Txt variant="caption" tone="subtle">
                    {relativeTime(conversation.lastMessageAt)}
                  </Txt>
                </View>
              </View>
              {conversation.unreadCount > 0 ? <Badge label={String(conversation.unreadCount)} tone="primary" /> : null}
            </Row>
          ))
        )}
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: space.lg
          }}
        >
          <Txt variant="heading">Recently updated</Txt>
          <Button label="Contacts" variant="ghost" onPress={() => router.push("/contacts")} />
        </View>
        {data.recentContacts.length === 0 ? (
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
            <Txt variant="caption" tone="subtle">
              No contacts yet.
            </Txt>
          </View>
        ) : (
          data.recentContacts.map((contact) => (
            <Row
              key={contact.id}
              onPress={() => router.push(`/contacts/${contact.id}`)}
              style={{ paddingHorizontal: space.lg }}
            >
              <Avatar name={contact.fullName} size={34} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label" numberOfLines={1}>
                  {contact.fullName}
                </Txt>
                <Txt variant="caption" tone="subtle">
                  {contact.funnelStage ? FUNNEL_STAGE_LABELS[contact.funnelStage] : "No stage"} ·{" "}
                  {relativeTime(contact.updatedAt)}
                </Txt>
              </View>
            </Row>
          ))
        )}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Txt variant="heading">EXPA</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Badge
            label={data.expa.status ?? "not connected"}
            tone={data.expa.status === "connected" ? "success" : data.expa.status === "error" ? "danger" : "neutral"}
          />
          <Txt variant="caption" tone="subtle">
            {data.expa.lastSyncedAt ? `Synced ${relativeTime(data.expa.lastSyncedAt)}` : "Never synced"}
          </Txt>
        </View>
        <Txt variant="caption" tone="subtle">
          Full EXPA analytics and integration settings live on the web app.
        </Txt>
      </Card>
    </ScrollView>
  );
}
