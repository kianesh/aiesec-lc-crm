import {
  EMAIL_CAMPAIGN_STATUS_LABELS,
  type EmailCampaignDetailDto,
  type SendCampaignResponse
} from "@aiesec/api-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { Badge, Button, Card, Loading, StateBlock, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { campaignStatusTone, formatDateTime } from "../../src/lib/format";
import { useCampaign } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { space, useTheme } from "../../src/theme";

function StatCell({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <View style={{ flex: 1, minWidth: 84, gap: 2 }}>
      <Txt variant="title" tone={tone ?? "default"}>
        {value.toLocaleString()}
      </Txt>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </View>
  );
}

export default function CampaignDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const { activeLcId, me } = useSession();

  const { data: campaign, isPending, error, refetch } = useCampaign(id);

  const send = useMutation({
    mutationFn: async (input: { mode: "test" | "audience"; confirmRecipientCount?: number }) =>
      apiFetch<SendCampaignResponse>(`/email/${id}/send`, { method: "POST", lcId: activeLcId, body: input }),
    onSuccess: (result, input) => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["email", activeLcId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
      Alert.alert(
        input.mode === "test" ? "Test sent" : "Campaign sent",
        input.mode === "test"
          ? `Check ${me?.user.email ?? "your inbox"}.`
          : `Delivered to ${result.sent} contact${result.sent === 1 ? "" : "s"}${result.failed > 0 ? `, ${result.failed} failed` : ""}.`
      );
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't send", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: "Campaign" }} />
        <StateBlock
          icon="cloud-offline-outline"
          title="Couldn't load this campaign"
          message={error instanceof ApiError ? error.message : "Something went wrong."}
          action={{ label: "Try again", onPress: () => void refetch() }}
        />
      </>
    );
  }

  if (isPending || !campaign) return <Loading label="Loading campaign" />;

  function confirmSend(target: EmailCampaignDetailDto) {
    // The count is both shown here and re-checked server-side: if the audience
    // shifted between this dialog and the tap, the send is refused rather than
    // silently reaching more people than were agreed to.
    Alert.alert(
      "Send campaign",
      `This emails ${target.audienceSize} contact${target.audienceSize === 1 ? "" : "s"} immediately. It can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Send to ${target.audienceSize}`,
          style: "destructive",
          onPress: () => send.mutate({ mode: "audience", confirmRecipientCount: target.audienceSize })
        }
      ]
    );
  }

  const stats = campaign.detailedStats;
  const hasSendHistory = stats.recipients > 0;

  return (
    <>
      <Stack.Screen options={{ title: campaign.name }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Badge label={EMAIL_CAMPAIGN_STATUS_LABELS[campaign.status]} tone={campaignStatusTone(campaign.status)} />
          <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>
            {campaign.sentAt ? `Sent ${formatDateTime(campaign.sentAt)}` : `Updated ${formatDateTime(campaign.updatedAt)}`}
          </Txt>
        </View>

        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Txt variant="caption" tone="muted">
              Subject
            </Txt>
            <Txt variant="heading">{campaign.subject}</Txt>
          </View>
          <View style={{ gap: 2 }}>
            <Txt variant="caption" tone="muted">
              From
            </Txt>
            <Txt variant="body">
              {campaign.fromName}
              {campaign.fromEmail ? ` <${campaign.fromEmail}>` : ""}
            </Txt>
          </View>
          <View style={{ gap: 2 }}>
            <Txt variant="caption" tone="muted">
              Audience
            </Txt>
            <Txt variant="body">
              {campaign.audienceName ?? "All contacts with an email"} · {campaign.audienceSize.toLocaleString()} contact
              {campaign.audienceSize === 1 ? "" : "s"}
            </Txt>
          </View>
        </Card>

        {hasSendHistory ? (
          <Card style={{ gap: space.lg }}>
            <Txt variant="heading">Results</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }}>
              <StatCell label="Recipients" value={stats.recipients} />
              <StatCell label="Delivered" value={stats.delivered} />
              <StatCell label="Opened" value={stats.opened} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }}>
              <StatCell label="Clicked" value={stats.clicked} />
              <StatCell label="Bounced" value={stats.bounced} tone={stats.bounced > 0 ? "danger" : undefined} />
              <StatCell label="Failed" value={stats.failed} tone={stats.failed > 0 ? "danger" : undefined} />
            </View>
            {stats.sent > 0 ? (
              <Txt variant="caption" tone="subtle">
                {Math.round((stats.opened / stats.sent) * 100)}% open rate across {stats.sent.toLocaleString()} sent.
              </Txt>
            ) : null}
          </Card>
        ) : null}

        <Card style={{ gap: space.sm }}>
          <Txt variant="heading">Preview</Txt>
          <Txt variant="body" tone="muted">
            {campaign.bodyPreview || "(no content yet)"}
          </Txt>
          <Txt variant="caption" tone="subtle">
            Plain-text rendering — open the campaign on the web app to see or edit the formatted version.
          </Txt>
        </Card>

        <View style={{ gap: space.md }}>
          <Button
            label="Send a test to myself"
            icon="paper-plane-outline"
            variant="secondary"
            onPress={() => send.mutate({ mode: "test" })}
            loading={send.isPending && send.variables?.mode === "test"}
          />
          {campaign.canSend ? (
            <Button
              label={`Send to ${campaign.audienceSize.toLocaleString()} contacts`}
              icon="send-outline"
              onPress={() => confirmSend(campaign)}
              loading={send.isPending && send.variables?.mode === "audience"}
            />
          ) : campaign.sendBlockedReason ? (
            <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
              {campaign.sendBlockedReason}
            </Txt>
          ) : null}
        </View>

        {campaign.status === "failed" ? (
          <Card style={{ gap: space.sm, borderColor: theme.danger }}>
            <Txt variant="heading" tone="danger">
              Last send failed
            </Txt>
            <Txt variant="caption" tone="muted">
              Every message was rejected. Check the Resend API key and that the sender domain is verified.
            </Txt>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
