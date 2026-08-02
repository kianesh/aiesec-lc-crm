import {
  FUNNEL_STAGE_LABELS,
  type ExpaInsightsResponse,
  type ExpaResponse
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { FunnelChart, LineChart, PercentileBar, SparkBars } from "../../src/components/charts";
import { Badge, Button, Card, Loading, Skeleton, StateBlock, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { relativeTime } from "../../src/lib/format";
import { useExpa, useExpaInsights } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";

type Tab = "funnel" | "opportunities" | "insights";

const TABS: { key: Tab; label: string }[] = [
  { key: "funnel", label: "Funnel" },
  { key: "opportunities", label: "Openings" },
  { key: "insights", label: "Insights" }
];

/** "applied_to_approved" → "Applied → Approved" */
function humanizeTransition(value: string) {
  return value
    .split("_to_")
    .map((part) => part.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase()))
    .join(" → ");
}

function humanizeMetric(value: string) {
  return value.replace(/[._]/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function riskTone(risk: string) {
  const normalized = risk.toLowerCase();
  if (normalized.includes("high")) return "danger" as const;
  if (normalized.includes("medium") || normalized.includes("moderate")) return "warning" as const;
  return "success" as const;
}

function FunnelTab({ data }: { data: ExpaResponse }) {
  const theme = useTheme();
  const latest = data.latest;

  if (!latest) {
    return (
      <StateBlock
        icon="bar-chart-outline"
        title="No snapshot yet"
        message={
          data.canSync
            ? "Pull down to sync, or run one from the web app to populate the funnel."
            : "Ask an admin to run an EXPA sync to populate the funnel."
        }
      />
    );
  }

  const rows = latest.funnel
    // sign_up is always 0 in EXPA's performance payload; showing it adds a
    // permanently empty row and skews nothing but the eye.
    .filter((row) => row.stage !== "sign_up")
    .map((row) => ({
      label: FUNNEL_STAGE_LABELS[row.stage],
      value: row.value,
      conversion: row.conversionFromPrevious
    }));

  const trend = data.trend.filter((point) => point.approved > 0 || point.applied > 0);

  return (
    <View style={{ gap: space.lg }}>
      {latest.errors.length > 0 ? (
        <Card style={{ gap: space.sm, borderColor: theme.warning }}>
          <Txt variant="heading" tone="warning">
            Partial snapshot
          </Txt>
          <Txt variant="caption" tone="muted">
            EXPA returned an error for part of this sync, so some numbers may be missing.
          </Txt>
          {latest.errors.slice(0, 3).map((message, index) => (
            <Txt key={index} variant="caption" tone="subtle">
              {message}
            </Txt>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: space.lg }}>
        <View style={{ gap: 2 }}>
          <Txt variant="heading">Conversion funnel</Txt>
          <Txt variant="caption" tone="subtle">
            {new Date(latest.periodStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })} –{" "}
            {new Date(latest.periodEnd).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </Txt>
        </View>
        <FunnelChart rows={rows} />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopColor: theme.borderSubtle,
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingTop: space.md
          }}
        >
          <Txt variant="caption" tone="muted">
            Accepted
          </Txt>
          <Txt variant="label">{latest.accepted.toLocaleString()}</Txt>
        </View>
      </Card>

      {trend.length > 1 ? (
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Txt variant="heading">Approved across snapshots</Txt>
            <Txt variant="caption" tone="subtle">
              {trend.length} snapshot{trend.length === 1 ? "" : "s"}, oldest first
            </Txt>
          </View>
          <SparkBars values={trend.map((point) => point.approved)} />
        </Card>
      ) : null}
    </View>
  );
}

function OpportunitiesTab({ data }: { data: ExpaResponse }) {
  const theme = useTheme();
  const latest = data.latest;

  if (!latest) {
    return <StateBlock icon="briefcase-outline" title="No snapshot yet" message="Sync EXPA to see open opportunities." />;
  }

  const { openOgx, openIgx, byProgramme } = latest.opportunities;

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", gap: space.md }}>
        {(
          [
            ["Open OGX", openOgx, "airplane-outline"],
            ["Open IGX", openIgx, "download-outline"]
          ] as const
        ).map(([label, value, icon]) => (
          <Card key={label} style={{ flex: 1, gap: space.sm, padding: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Ionicons name={icon} size={15} color={theme.textSubtle} />
              <Txt variant="caption" tone="muted">
                {label}
              </Txt>
            </View>
            <Txt variant="title">{value.toLocaleString()}</Txt>
          </Card>
        ))}
      </View>

      <Card style={{ gap: space.md }}>
        <Txt variant="heading">Open outgoing by programme</Txt>
        {byProgramme.length === 0 ? (
          <Txt variant="caption" tone="subtle">
            No open outgoing opportunities in this snapshot.
          </Txt>
        ) : (
          byProgramme.map((row) => (
            <View key={row.key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="caption" tone="muted">
                {row.label}
              </Txt>
              <Txt variant="label">{row.value.toLocaleString()}</Txt>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

function InsightsTab({ insights, isPending }: { insights: ExpaInsightsResponse | undefined; isPending: boolean }) {
  if (isPending) {
    return (
      <View style={{ gap: space.md }}>
        <Skeleton height={180} />
        <Skeleton height={140} />
      </View>
    );
  }

  if (!insights?.configured) {
    return (
      <StateBlock
        icon="sparkles-outline"
        title="ML service not configured"
        message="Set ML_API_URL and ML_API_KEY on the web app to get forecasts, anomaly detection and peer benchmarks here."
      />
    );
  }

  if (!insights.officeId) {
    return (
      <StateBlock
        icon="sparkles-outline"
        title="No EXPA committee ID"
        message="Add your committee ID in Integrations on the web app, and these insights will fill in."
      />
    );
  }

  const nothing = !insights.forecast && !insights.benchmark && !insights.churn && !insights.anomalies;
  if (nothing) {
    return (
      <StateBlock
        icon="cloud-offline-outline"
        title="No insights available"
        message="The ML service didn't return anything for this committee yet."
      />
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      {insights.forecast ? (
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Txt variant="heading">Forecast</Txt>
            <Txt variant="caption" tone="subtle">
              {humanizeMetric(insights.forecast.metric)} · {insights.forecast.model}
            </Txt>
          </View>
          <LineChart
            points={insights.forecast.points.map((point) => ({
              label: point.month,
              value: point.value,
              forecast: point.forecast,
              lower: point.lower,
              upper: point.upper
            }))}
          />
          <Txt variant="caption" tone="subtle">
            Solid is actual, dashed is projected; the shaded band is the confidence interval.
          </Txt>
        </Card>
      ) : null}

      {insights.churn ? (
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Txt variant="heading">Conversion risk</Txt>
            <Badge label={insights.churn.overallRisk} tone={riskTone(insights.churn.overallRisk)} />
          </View>
          {insights.churn.weakestTransition ? (
            <Txt variant="caption" tone="muted">
              Weakest step: {humanizeTransition(insights.churn.weakestTransition)}
            </Txt>
          ) : null}
          {insights.churn.conversions.map((conversion) => (
            <View key={conversion.transition} style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt variant="caption" tone="muted">
                  {humanizeTransition(conversion.transition)}
                </Txt>
                <Txt variant="caption">
                  {Math.round(conversion.rate * 100)}%
                  <Txt variant="caption" tone="subtle">
                    {" "}
                    vs {Math.round(conversion.cohortMedianRate * 100)}% median
                  </Txt>
                </Txt>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {insights.benchmark ? (
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Txt variant="heading">Peer benchmark</Txt>
            <Txt variant="caption" tone="subtle">
              {insights.benchmark.period} · cohort of {insights.benchmark.cohortSize}
            </Txt>
          </View>
          {insights.benchmark.metrics.map((metric) => (
            <View key={metric.metric} style={{ gap: space.xs }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt variant="caption" tone="muted">
                  {humanizeMetric(metric.metric)}
                </Txt>
                <Txt variant="caption">
                  #{metric.rank} of {metric.cohortSize}
                </Txt>
              </View>
              <PercentileBar percentile={metric.percentile} />
              <Txt variant="caption" tone="subtle">
                {metric.value.toLocaleString()} vs {metric.cohortMedian.toLocaleString()} median
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}

      {insights.anomalies && insights.anomalies.count > 0 ? (
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Txt variant="heading">Anomalies</Txt>
            <Badge label={`${insights.anomalies.count} flagged`} tone="warning" />
          </View>
          {insights.anomalies.points
            .filter((point) => point.isAnomaly)
            .slice(0, 6)
            .map((point) => (
              <View key={point.month} style={{ gap: 2 }}>
                <Txt variant="label">{point.month}</Txt>
                <Txt variant="caption" tone="subtle">
                  {point.drivers
                    .slice(0, 3)
                    .map((driver) => `${humanizeMetric(driver.metric)} (z ${driver.z.toFixed(1)})`)
                    .join(" · ") || "No dominant driver"}
                </Txt>
              </View>
            ))}
        </Card>
      ) : null}
    </View>
  );
}

export default function ExpaScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { activeLcId } = useSession();
  const [tab, setTab] = useState<Tab>("funnel");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isPending, error, refetch } = useExpa();
  // Only hit the ml-api once someone actually opens the Insights tab.
  const insights = useExpaInsights(tab === "insights");

  const sync = useMutation({
    mutationFn: async () => apiFetch<{ partial: boolean; errors: string[] }>("/expa/sync", {
      method: "POST",
      lcId: activeLcId,
      body: {}
    }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["expa", activeLcId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
      if (result.partial) {
        Alert.alert("Synced with errors", "EXPA returned an error for part of the sync. The data it did return was saved.");
      }
    },
    onError: (mutationError) => {
      Alert.alert("Sync failed", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    if (tab === "insights") await insights.refetch();
    setRefreshing(false);
  }

  if (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <Stack.Screen options={{ title: "EXPA" }} />
        <StateBlock
          icon={apiError?.code === "forbidden" ? "lock-closed-outline" : "cloud-offline-outline"}
          title={apiError?.code === "forbidden" ? "No analytics access" : "Couldn't load EXPA"}
          message={apiError?.message ?? "Something went wrong."}
          action={{ label: "Try again", onPress: () => void refetch() }}
        />
      </>
    );
  }

  if (isPending || !data) {
    return (
      <>
        <Stack.Screen options={{ title: "EXPA" }} />
        <Loading label="Loading EXPA analytics" />
      </>
    );
  }

  if (!data.connected) {
    return (
      <>
        <Stack.Screen options={{ title: "EXPA" }} />
        <StateBlock
          icon="link-outline"
          title="EXPA isn't connected"
          message="Connect EXPA from Integrations on the web app, then this screen fills in."
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "EXPA" }} />
      <View style={{ flex: 1, backgroundColor: theme.surfaceMuted }}>
        <View
          style={{
            flexDirection: "row",
            gap: space.sm,
            padding: space.lg,
            paddingBottom: space.md,
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            borderBottomWidth: StyleSheet.hairlineWidth
          }}
        >
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 8,
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

        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Badge
              label={data.status ?? "unknown"}
              tone={data.status === "connected" ? "success" : data.status === "error" ? "danger" : "neutral"}
            />
            <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>
              {data.lastSyncedAt ? `Synced ${relativeTime(data.lastSyncedAt)}` : "Never synced"}
              {data.committeeId ? ` · ${data.committeeId}` : ""}
            </Txt>
          </View>

          {tab === "funnel" ? <FunnelTab data={data} /> : null}
          {tab === "opportunities" ? <OpportunitiesTab data={data} /> : null}
          {tab === "insights" ? <InsightsTab insights={insights.data} isPending={insights.isPending} /> : null}

          {data.canSync ? (
            <Button
              label={sync.isPending ? "Syncing with EXPA…" : "Sync now"}
              icon="refresh-outline"
              variant="secondary"
              onPress={() => sync.mutate()}
              loading={sync.isPending}
            />
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
