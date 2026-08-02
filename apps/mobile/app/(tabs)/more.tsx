import { POSITION_LABELS } from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, Linking, ScrollView, View } from "react-native";
import { Avatar, Badge, Button, Card, Row, Txt } from "../../src/components/ui";
import { env } from "../../src/lib/env";
import { useSession } from "../../src/lib/session";
import { space, useTheme } from "../../src/theme";

// Everything the phone deliberately doesn't do. Rather than half-build an
// admin surface, link out to the web app where those flows already exist.
const WEB_ONLY: { label: string; path: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Write & edit campaigns", path: "/email", icon: "create-outline" },
  { label: "Social calendar view", path: "/social", icon: "calendar-outline" },
  { label: "Booking setup & availability", path: "/appointments", icon: "time-outline" },
  { label: "Integrations", path: "/integrations", icon: "git-network-outline" },
  { label: "Team & permissions", path: "/organization/team", icon: "people-circle-outline" }
];

// Screens the app implements natively, reachable from here rather than from a
// sixth tab — five is already as many as a phone tab bar comfortably holds.
const NATIVE_SECTIONS: { label: string; hint: string; path: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    label: "EXPA analytics",
    hint: "Funnel, openings, forecasts and peer benchmarks",
    path: "/expa",
    icon: "stats-chart-outline"
  },
  { label: "Social posts", hint: "Draft, schedule and publish to Instagram", path: "/social", icon: "images-outline" },
  { label: "Email campaigns", hint: "Review stats, send tests, send campaigns", path: "/email", icon: "mail-outline" }
];

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { me, memberships, activeLcId, setActiveLcId, signOut, meError, refetchMe } = useSession();

  const webBase = env.webUrl || env.apiUrl;

  function openWeb(path: string) {
    void Linking.openURL(`${webBase}${path}`);
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "You'll need to request a new code to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() }
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
      {meError ? (
        <Card style={{ gap: space.md }}>
          <Txt variant="heading">Couldn't load your profile</Txt>
          <Txt variant="caption" tone="muted">
            {meError.message}
          </Txt>
          <Button label="Retry" variant="secondary" onPress={refetchMe} />
        </Card>
      ) : null}

      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={me?.user.fullName ?? me?.user.email ?? "?"} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading" numberOfLines={1}>
            {me?.user.fullName ?? "Your profile"}
          </Txt>
          <Txt variant="caption" tone="muted" numberOfLines={1}>
            {me?.user.email ?? ""}
          </Txt>
          {me?.user.title ? (
            <Txt variant="caption" tone="subtle" numberOfLines={1}>
              {me.user.title}
            </Txt>
          ) : null}
        </View>
      </Card>

      {memberships.length > 0 ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <View style={{ padding: space.lg, paddingBottom: space.sm }}>
            <Txt variant="heading">Workspaces</Txt>
            {memberships.length > 1 ? (
              <Txt variant="caption" tone="subtle">
                Tap to switch the LC every screen shows.
              </Txt>
            ) : null}
          </View>
          {memberships.map((membership) => {
            const active = membership.lcId === activeLcId;
            return (
              <Row
                key={membership.lcId}
                onPress={active ? undefined : () => setActiveLcId(membership.lcId)}
                style={{ paddingHorizontal: space.lg }}
              >
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={active ? theme.primary : theme.textSubtle}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="label" numberOfLines={1}>
                    {membership.lcName}
                  </Txt>
                  <Txt variant="caption" tone="subtle">
                    {POSITION_LABELS[membership.position]} · {membership.role}
                  </Txt>
                </View>
                {active ? <Badge label="Active" tone="primary" /> : null}
              </Row>
            );
          })}
        </Card>
      ) : null}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {NATIVE_SECTIONS.map((section) => (
          <Row key={section.path} onPress={() => router.push(section.path)} style={{ paddingHorizontal: space.lg }}>
            <Ionicons name={section.icon} size={18} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="label">{section.label}</Txt>
              <Txt variant="caption" tone="subtle">
                {section.hint}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSubtle} />
          </Row>
        ))}
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ padding: space.lg, paddingBottom: space.sm }}>
          <Txt variant="heading">On the web app</Txt>
          <Txt variant="caption" tone="subtle">
            Coming to mobile in a later release.
          </Txt>
        </View>
        {WEB_ONLY.map((item) => (
          <Row key={item.path} onPress={() => openWeb(item.path)} style={{ paddingHorizontal: space.lg }}>
            <Ionicons name={item.icon} size={18} color={theme.textMuted} />
            <Txt variant="label" style={{ flex: 1 }}>
              {item.label}
            </Txt>
            <Ionicons name="open-outline" size={15} color={theme.textSubtle} />
          </Row>
        ))}
      </Card>

      <Button label="Sign out" variant="destructive" icon="log-out-outline" onPress={confirmSignOut} />

      <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
        AIESEC LC CRM · connected to {webBase.replace(/^https?:\/\//, "")}
      </Txt>
    </ScrollView>
  );
}
