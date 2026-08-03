import {
  PORTFOLIO_LABELS,
  POSITION_LABELS,
  type OrgLcDto,
  type OrgMemberDto,
  type Portfolio,
  type Position
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { Avatar, Badge, Button, Card, Loading, StateBlock, Txt } from "../../src/components/ui";
import { env } from "../../src/lib/env";
import { useOrganization } from "../../src/lib/queries";
import { space, useTheme } from "../../src/theme";

type Tab = "chart" | "portfolios" | "lc";

const TABS: { key: Tab; label: string }[] = [
  { key: "chart", label: "Org chart" },
  { key: "portfolios", label: "Portfolios" },
  { key: "lc", label: "LC" }
];

const POSITION_ORDER: Record<Position, number> = { lcp: 0, lcvp: 1, team_leader: 2, member: 3 };

const POSITION_TONE: Record<Position, "primary" | "success" | "warning" | "neutral"> = {
  lcp: "primary",
  lcvp: "success",
  team_leader: "warning",
  member: "neutral"
};

function sortMembers(a: OrgMemberDto, b: OrgMemberDto) {
  return (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9) || a.name.localeCompare(b.name);
}

function MemberRow({ member, depth = 0 }: { member: OrgMemberDto; depth?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical: space.sm,
        // A phone is too narrow for a real tree, so indent instead — capped so
        // deep chains don't squeeze the name off the screen.
        paddingLeft: Math.min(depth, 4) * space.lg
      }}
    >
      {depth > 0 ? (
        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: theme.border, marginRight: -space.sm }} />
      ) : null}
      <Avatar name={member.name} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" numberOfLines={1}>
          {member.name}
        </Txt>
        <Txt variant="caption" tone="subtle" numberOfLines={1}>
          {member.portfolio ? PORTFOLIO_LABELS[member.portfolio] : member.email}
        </Txt>
      </View>
      <Badge label={POSITION_LABELS[member.position]} tone={POSITION_TONE[member.position]} />
    </View>
  );
}

function ChartTab({ members }: { members: OrgMemberDto[] }) {
  // Build the reports-to tree. The API already nulls out managers that aren't
  // in this LC, so anything without one is a root.
  const { roots, childrenOf } = useMemo(() => {
    const childrenOf = new Map<string | null, OrgMemberDto[]>();
    for (const member of members) {
      const key = member.managerId ?? null;
      const list = childrenOf.get(key) ?? [];
      list.push(member);
      childrenOf.set(key, list);
    }
    for (const list of childrenOf.values()) list.sort(sortMembers);
    return { roots: childrenOf.get(null) ?? [], childrenOf };
  }, [members]);

  // Iterative walk with a `seen` guard: a manager cycle in the data would spin
  // a recursive render forever.
  const rows = useMemo(() => {
    const out: { member: OrgMemberDto; depth: number }[] = [];
    const seen = new Set<string>();
    const stack = roots.map((member) => ({ member, depth: 0 })).reverse();
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (seen.has(next.member.id)) continue;
      seen.add(next.member.id);
      out.push(next);
      const kids = childrenOf.get(next.member.id) ?? [];
      for (let i = kids.length - 1; i >= 0; i -= 1) {
        stack.push({ member: kids[i]!, depth: next.depth + 1 });
      }
    }
    // Anything left over sat in a cycle; show it flat rather than hiding it.
    for (const member of members) {
      if (!seen.has(member.id)) out.push({ member, depth: 0 });
    }
    return out;
  }, [roots, childrenOf, members]);

  return (
    <Card style={{ gap: 0 }}>
      {rows.map(({ member, depth }) => (
        <MemberRow key={member.id} member={member} depth={depth} />
      ))}
    </Card>
  );
}

function PortfoliosTab({ members }: { members: OrgMemberDto[] }) {
  const groups = useMemo(() => {
    const map = new Map<Portfolio | "none", OrgMemberDto[]>();
    for (const member of members) {
      const key = member.portfolio ?? "none";
      const list = map.get(key) ?? [];
      list.push(member);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort(sortMembers);
    return [...map.entries()].sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : a.localeCompare(b)));
  }, [members]);

  return (
    <View style={{ gap: space.lg }}>
      {groups.map(([key, list]) => (
        <Card key={key} style={{ gap: 0 }}>
          <View style={{ paddingBottom: space.sm }}>
            <Txt variant="heading">{key === "none" ? "No portfolio" : PORTFOLIO_LABELS[key]}</Txt>
            <Txt variant="caption" tone="subtle">
              {list.length} {list.length === 1 ? "member" : "members"}
            </Txt>
          </View>
          {list.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </Card>
      ))}
    </View>
  );
}

function LcTab({ lc, memberCount }: { lc: OrgLcDto; memberCount: number }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Name", value: lc.name },
    { label: "LC identifier", value: lc.lcIdentifier },
    { label: "Country", value: lc.country },
    { label: "State / Province", value: lc.stateProvince },
    { label: "School", value: lc.school },
    { label: "EXPA committee ID", value: lc.expaCommitteeId },
    { label: "Members", value: String(memberCount) }
  ];

  return (
    <Card style={{ gap: space.md }}>
      {rows.map((row) => (
        <View key={row.label} style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
          <Txt variant="caption" tone="muted" style={{ width: 140 }}>
            {row.label}
          </Txt>
          <Txt variant="label" style={{ flex: 1 }}>
            {row.value || "—"}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

export default function OrganizationScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>("chart");
  const { data, isPending, error, refetch, isRefetching } = useOrganization();

  const webBase = env.webUrl || env.apiUrl;

  if (isPending) return <Loading label="Loading your LC" />;

  if (error || !data) {
    return (
      <StateBlock
        icon="people-circle-outline"
        title="Couldn't load the team"
        message={error?.message ?? "Try again in a moment."}
        action={{ label: "Retry", onPress: () => void refetch() }}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: data.lc.name }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <Button
                key={item.key}
                label={item.label}
                variant={active ? "primary" : "secondary"}
                onPress={() => setTab(item.key)}
                style={{ flex: 1 }}
              />
            );
          })}
        </View>

        {data.members.length === 0 ? (
          <StateBlock icon="people-outline" title="No members yet" message="Invite your team from the web app." />
        ) : tab === "chart" ? (
          <ChartTab members={data.members} />
        ) : tab === "portfolios" ? (
          <PortfoliosTab members={data.members} />
        ) : (
          <LcTab lc={data.lc} memberCount={data.members.length} />
        )}

        {data.canManageMembers ? (
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Ionicons name="create-outline" size={17} color={theme.textMuted} />
              <Txt variant="label">Editing the team</Txt>
            </View>
            <Txt variant="caption" tone="muted">
              Positions, portfolios, reporting lines and the permission matrix are edited on the web app.
            </Txt>
            <Button
              label="Open on the web"
              variant="secondary"
              icon="open-outline"
              onPress={() => void Linking.openURL(`${webBase}/organization/team`)}
            />
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
