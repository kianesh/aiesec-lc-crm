import { APPOINTMENT_STATUS_LABELS, type AppointmentListItemDto } from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { Badge, Loading, Row, StateBlock, Txt } from "../../src/components/ui";
import { ApiError } from "../../src/lib/api";
import { formatTimeRange, groupByDay } from "../../src/lib/format";
import { useAppointments, type AppointmentFilters } from "../../src/lib/queries";
import { radius, space, useTheme } from "../../src/theme";

type Scope = NonNullable<AppointmentFilters["scope"]>;

const SCOPES: { key: Scope; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" }
];

function statusTone(status: AppointmentListItemDto["status"]) {
  switch (status) {
    case "confirmed":
      return "success" as const;
    case "completed":
      return "primary" as const;
    case "cancelled":
      return "danger" as const;
    case "no_show":
      return "warning" as const;
  }
}

export default function AppointmentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isPending, error, refetch } = useAppointments({ scope });

  const sections = useMemo(() => {
    const groups = groupByDay(data?.appointments ?? [], (item) => item.startAt);
    return groups.map((group) => ({ title: group.label, data: group.items }));
  }, [data]);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.surfaceMuted }}>
      <View
        style={{
          flexDirection: "row",
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: space.md,
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth
        }}
      >
        {SCOPES.map((item) => {
          const active = scope === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setScope(item.key)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
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
      </View>

      {error ? (
        <StateBlock
          icon="cloud-offline-outline"
          title="Couldn't load appointments"
          message={error instanceof ApiError ? error.message : "Something went wrong."}
          action={{ label: "Try again", onPress: () => void refetch() }}
        />
      ) : isPending ? (
        <Loading label="Loading appointments" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
                backgroundColor: theme.surfaceMuted
              }}
            >
              <Txt variant="eyebrow" tone="subtle">
                {section.title}
              </Txt>
            </View>
          )}
          ListEmptyComponent={
            <StateBlock
              icon="calendar-outline"
              title={
                scope === "today" ? "Nothing booked today" : scope === "past" ? "No past appointments" : "Nothing booked"
              }
              message={
                scope === "past"
                  ? undefined
                  : "Bookings from your LC's public page land here. Share the link from the web app to get started."
              }
            />
          }
          renderItem={({ item }) => (
            <Row onPress={() => router.push(`/appointments/${item.id}`)}>
              <View
                style={{
                  width: 4,
                  alignSelf: "stretch",
                  borderRadius: radius.pill,
                  backgroundColor: item.typeColor ?? theme.primary
                }}
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="label" numberOfLines={1}>
                  {item.guestName}
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {item.typeName ?? "Appointment"}
                </Txt>
                <Txt variant="caption" tone="subtle">
                  {formatTimeRange(item.startAt, item.endAt)}
                </Txt>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                {item.status !== "confirmed" ? (
                  <Badge label={APPOINTMENT_STATUS_LABELS[item.status]} tone={statusTone(item.status)} />
                ) : item.meetUrl ? (
                  <Ionicons name="videocam-outline" size={16} color={theme.textSubtle} />
                ) : null}
                <Ionicons name="chevron-forward" size={15} color={theme.textSubtle} />
              </View>
            </Row>
          )}
        />
      )}
    </View>
  );
}
