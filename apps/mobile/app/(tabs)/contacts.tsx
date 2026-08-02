import { CONTACT_TYPES, CONTACT_TYPE_LABELS, FUNNEL_STAGES, FUNNEL_STAGE_LABELS } from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Avatar, Badge, Loading, Row, StateBlock, Txt } from "../../src/components/ui";
import { ApiError } from "../../src/lib/api";
import { relativeTime } from "../../src/lib/format";
import { useContacts, type ContactFilters } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { radius, space, typeScale, useTheme } from "../../src/theme";

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: active ? theme.primary : theme.surface,
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
}

export default function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { can } = useSession();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<ContactFilters["type"]>(undefined);
  const [stage, setStage] = useState<ContactFilters["stage"]>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce so a search doesn't fire a request per keystroke on cellular.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo<ContactFilters>(
    () => ({ q: debounced || undefined, type, stage }),
    [debounced, type, stage]
  );

  const { data, isPending, isFetching, error, refetch } = useContacts(filters);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const hasFilters = Boolean(debounced || type || stage);

  return (
    <View style={{ flex: 1, backgroundColor: theme.surfaceMuted }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
          paddingTop: space.md,
          gap: space.md
        }}
      >
        <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg }}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              backgroundColor: theme.surfaceInset,
              borderRadius: radius.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingHorizontal: space.md
            }}
          >
            <Ionicons name="search" size={16} color={theme.textSubtle} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, email or phone"
              placeholderTextColor={theme.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[typeScale.body, { flex: 1, color: theme.text, paddingVertical: 10 }]}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={theme.textSubtle} />
              </Pressable>
            ) : null}
          </View>
          {can("manage_contacts") ? (
            <Pressable
              onPress={() => router.push("/contacts/new")}
              accessibilityLabel="New contact"
              style={({ pressed }) => ({
                width: 42,
                borderRadius: radius.md,
                backgroundColor: theme.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1
              })}
            >
              <Ionicons name="add" size={22} color={theme.primaryFg} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md }}
        >
          <FilterChip label="All" active={!type && !stage} onPress={() => {
            setType(undefined);
            setStage(undefined);
          }} />
          {CONTACT_TYPES.map((value) => (
            <FilterChip
              key={value}
              label={CONTACT_TYPE_LABELS[value]}
              active={type === value}
              onPress={() => setType(type === value ? undefined : value)}
            />
          ))}
          {FUNNEL_STAGES.map((value) => (
            <FilterChip
              key={value}
              label={FUNNEL_STAGE_LABELS[value]}
              active={stage === value}
              onPress={() => setStage(stage === value ? undefined : value)}
            />
          ))}
        </ScrollView>
      </View>

      {error ? (
        <StateBlock
          icon="cloud-offline-outline"
          title="Couldn't load contacts"
          message={error instanceof ApiError ? error.message : "Something went wrong."}
          action={{ label: "Try again", onPress: () => void refetch() }}
        />
      ) : isPending ? (
        <Loading label="Loading contacts" />
      ) : (
        <FlatList
          data={data?.contacts ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListHeaderComponent={
            data ? (
              <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                <Txt variant="caption" tone="subtle">
                  {data.total} contact{data.total === 1 ? "" : "s"}
                  {isFetching ? " · updating…" : ""}
                </Txt>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <StateBlock
              icon={hasFilters ? "filter-outline" : "people-outline"}
              title={hasFilters ? "No matches" : "No contacts yet"}
              message={
                hasFilters
                  ? "Try a different search or clear the filters."
                  : can("manage_contacts")
                    ? "Add your first contact, or import from EXPA on the web app."
                    : "Contacts added by your LC will appear here."
              }
              action={
                hasFilters
                  ? {
                      label: "Clear filters",
                      onPress: () => {
                        setSearch("");
                        setType(undefined);
                        setStage(undefined);
                      }
                    }
                  : undefined
              }
            />
          }
          renderItem={({ item }) => (
            <Row onPress={() => router.push(`/contacts/${item.id}`)}>
              <Avatar name={item.fullName} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="label" numberOfLines={1}>
                  {item.fullName}
                </Txt>
                <Txt variant="caption" tone="subtle" numberOfLines={1}>
                  {item.email ?? item.phone ?? CONTACT_TYPE_LABELS[item.type]}
                </Txt>
                {item.tags.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", marginTop: 2 }}>
                    {item.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} label={tag} />
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                {item.funnelStage ? <Badge label={FUNNEL_STAGE_LABELS[item.funnelStage]} tone="primary" /> : null}
                <Txt variant="caption" tone="subtle">
                  {relativeTime(item.updatedAt)}
                </Txt>
              </View>
            </Row>
          )}
        />
      )}
    </View>
  );
}
