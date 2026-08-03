import {
  INTEGRATION_ACTION_LABELS,
  type IntegrationAction,
  type IntegrationActionResponse,
  type IntegrationDto,
  type IntegrationKey,
  type IntegrationStatus
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Alert, Linking, RefreshControl, ScrollView, View } from "react-native";
import { Badge, Button, Card, Loading, StateBlock, Txt } from "../../src/components/ui";
import { apiFetch } from "../../src/lib/api";
import { env } from "../../src/lib/env";
import { relativeTime } from "../../src/lib/format";
import { useIntegrations } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { space, useTheme } from "../../src/theme";

const ICONS: Record<IntegrationKey, keyof typeof Ionicons.glyphMap> = {
  expa: "flash-outline",
  google: "mail-outline",
  notion: "document-text-outline",
  instagram: "logo-instagram",
  resend: "send-outline"
};

const STATUS_TONE: Record<IntegrationStatus, "success" | "neutral" | "danger"> = {
  connected: "success",
  disconnected: "neutral",
  error: "danger"
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  error: "Error"
};

export default function IntegrationsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { activeLcId } = useSession();
  const { data, isPending, error, refetch, isRefetching } = useIntegrations();

  const webBase = env.webUrl || env.apiUrl;

  const runAction = useMutation({
    mutationFn: ({ key, action }: { key: IntegrationKey; action: IntegrationAction }) =>
      apiFetch<IntegrationActionResponse>(`/integrations/${key}`, {
        method: "POST",
        body: { action },
        lcId: activeLcId
      }),
    onSuccess: (result) => {
      Alert.alert("Done", result.message);
      // A sync writes contacts, conversations and analytics as well as the
      // connector's own row, so drop everything rather than guess.
      void queryClient.invalidateQueries();
    },
    onError: (mutationError: Error) => {
      Alert.alert("That didn't work", mutationError.message);
    }
  });

  function onAction(integration: IntegrationDto, action: IntegrationAction) {
    if (action === "disconnect") {
      Alert.alert(
        `Disconnect ${integration.name}?`,
        "Stored credentials are deleted. You'll need to reconnect from the web app.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: () => runAction.mutate({ key: integration.key, action })
          }
        ]
      );
      return;
    }
    runAction.mutate({ key: integration.key, action });
  }

  if (isPending) return <Loading label="Loading integrations" />;

  if (error || !data) {
    return (
      <StateBlock
        icon="git-network-outline"
        title="Couldn't load integrations"
        message={error?.message ?? "Try again in a moment."}
        action={{ label: "Retry", onPress: () => void refetch() }}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Integrations" }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {data.integrations.map((integration) => (
          <Card key={integration.key} style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Ionicons name={ICONS[integration.key]} size={22} color={theme.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="heading">{integration.name}</Txt>
                {integration.lastSyncedAt ? (
                  <Txt variant="caption" tone="subtle">
                    Synced {relativeTime(integration.lastSyncedAt)}
                  </Txt>
                ) : null}
              </View>
              <Badge label={STATUS_LABEL[integration.status]} tone={STATUS_TONE[integration.status]} />
            </View>

            <Txt variant="caption" tone="muted">
              {integration.description}
            </Txt>

            {integration.key === "expa" && integration.status !== "disconnected" ? (
              <Txt variant="caption" tone="subtle">
                Committee ID: {integration.committeeId || "not set"}
              </Txt>
            ) : null}

            {integration.actions.map((action) => (
              <Button
                key={action}
                label={INTEGRATION_ACTION_LABELS[action]}
                variant={action === "disconnect" ? "destructive" : "secondary"}
                loading={
                  runAction.isPending &&
                  runAction.variables?.key === integration.key &&
                  runAction.variables?.action === action
                }
                disabled={runAction.isPending}
                onPress={() => onAction(integration, action)}
              />
            ))}

            {integration.connectUrlPath ? (
              <Button
                label={data.canManage ? "Connect on the web" : "View on the web"}
                variant="secondary"
                icon="open-outline"
                onPress={() => void Linking.openURL(`${webBase}${integration.connectUrlPath}`)}
              />
            ) : null}
          </Card>
        ))}

        <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
          {data.canManage
            ? "Connecting an integration happens on the web app — each one needs a browser sign-in or an API key."
            : "Only owners and admins can change integrations."}
        </Txt>
      </ScrollView>
    </>
  );
}
