import {
  WEEKDAY_LABELS,
  type AppointmentTypeSummaryDto,
  type AvailabilityRuleDto,
  type BookingResponse,
  type BookingSettingsDto
} from "@aiesec/api-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { Badge, Button, Card, Field, Loading, StateBlock, Txt } from "../../src/components/ui";
import { apiFetch } from "../../src/lib/api";
import { env } from "../../src/lib/env";
import { useBooking } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { space, useTheme } from "../../src/theme";

type Tab = "page" | "hours" | "types";

const TABS: { key: Tab; label: string }[] = [
  { key: "page", label: "Page" },
  { key: "hours", label: "Hours" },
  { key: "types", label: "Types" }
];

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Accepts "9:00" while typing but stores the padded "09:00" the API wants. */
function padTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function PageTab({ data, lcId }: { data: BookingResponse; lcId: string | null }) {
  const queryClient = useQueryClient();
  const webBase = env.webUrl || env.apiUrl;

  const [title, setTitle] = useState(data.settings?.title ?? "");
  const [slug, setSlug] = useState(data.settings?.slug ?? "");
  const [description, setDescription] = useState(data.settings?.description ?? "");
  const [timezone, setTimezone] = useState(data.settings?.timezone ?? "America/Toronto");
  const [active, setActive] = useState(data.settings?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<BookingSettingsDto>("/booking", {
        method: "PATCH",
        lcId,
        body: {
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim() ? description.trim() : null,
          timezone: timezone.trim(),
          active
        }
      }),
    onSuccess: (saved) => {
      // The server slugifies, so echo its value back rather than leaving the
      // field showing whatever was typed.
      setSlug(saved.slug);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["booking"] });
      Alert.alert("Saved", "Your booking page is up to date.");
    },
    onError: (mutationError: Error) => setError(mutationError.message)
  });

  const disabled = save.isPending || !title.trim() || !slug.trim() || !timezone.trim();

  return (
    <View style={{ gap: space.lg }}>
      {!data.settings ? (
        <Card style={{ gap: space.sm }}>
          <Txt variant="label">No booking page yet</Txt>
          <Txt variant="caption" tone="muted">
            Saving here creates one, and its public link starts working immediately.
          </Txt>
        </Card>
      ) : null}

      <Card style={{ gap: space.lg }}>
        <Field label="Page title" value={title} onChangeText={setTitle} placeholder="Book with your LC" />
        <Field
          label="Link"
          value={slug}
          onChangeText={setSlug}
          autoCapitalize="none"
          placeholder="my-lc"
          hint={`${webBase.replace(/^https?:\/\//, "")}/book/${slug || "…"}`}
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What guests should know before booking"
          multiline
        />
        <Field
          label="Timezone"
          value={timezone}
          onChangeText={setTimezone}
          autoCapitalize="none"
          placeholder="America/Toronto"
          hint="IANA name — slots are generated in this zone."
          error={error}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Txt variant="label">Accepting bookings</Txt>
            <Txt variant="caption" tone="subtle">
              Turn off to take the public page down without deleting it.
            </Txt>
          </View>
          <Switch value={active} onValueChange={setActive} />
        </View>

        <Button label="Save booking page" onPress={() => save.mutate()} loading={save.isPending} disabled={disabled} />
      </Card>

      {data.settings ? (
        <Button
          label="Open public page"
          variant="secondary"
          icon="open-outline"
          onPress={() => void Linking.openURL(`${webBase}${data.settings!.publicPath}`)}
        />
      ) : null}
    </View>
  );
}

function HoursTab({ data, lcId }: { data: BookingResponse; lcId: string | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [rules, setRules] = useState<AvailabilityRuleDto[]>(data.rules);
  const [error, setError] = useState<string | null>(null);

  // Adopt server state after a refetch, but not while an edit is in flight.
  useEffect(() => {
    setRules(data.rules);
  }, [data.rules]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ rules: AvailabilityRuleDto[] }>("/booking/availability", {
        method: "PATCH",
        lcId,
        body: { rules: rules.map((r) => ({ ...r, startTime: padTime(r.startTime), endTime: padTime(r.endTime) })) }
      }),
    onSuccess: (saved) => {
      setRules(saved.rules);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["booking"] });
      Alert.alert("Saved", "Availability updated.");
    },
    onError: (mutationError: Error) => setError(mutationError.message)
  });

  function update(index: number, patch: Partial<AvailabilityRuleDto>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
    setError(null);
  }

  // Validate locally so an obviously broken window is caught before a round
  // trip; the API enforces the same rule.
  const invalid = rules.some(
    (rule) =>
      !TIME_PATTERN.test(padTime(rule.startTime)) ||
      !TIME_PATTERN.test(padTime(rule.endTime)) ||
      padTime(rule.startTime) >= padTime(rule.endTime)
  );

  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.md }}>
        <Txt variant="caption" tone="muted">
          Weekly windows guests can book inside, in {data.settings?.timezone ?? "your booking timezone"}.
        </Txt>

        {rules.length === 0 ? (
          <Txt variant="caption" tone="subtle">
            No windows yet — nobody can book until you add one.
          </Txt>
        ) : null}

        {rules.map((rule, index) => (
          <View key={index} style={{ gap: space.sm, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.border, paddingTop: index === 0 ? 0 : space.md }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {WEEKDAY_LABELS.map((label, day) => {
                const selected = rule.weekday === day;
                return (
                  <Pressable
                    key={label}
                    onPress={() => update(index, { weekday: day })}
                    style={{
                      paddingHorizontal: space.sm,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: selected ? theme.primary : theme.surfaceSunken
                    }}
                  >
                    <Txt variant="caption" tone={selected ? "inverse" : "muted"}>
                      {label.slice(0, 3)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
              {/* Field's `style` lands on the TextInput, so the flexing has to
                  happen on a wrapper or the row collapses. */}
              <View style={{ flex: 1 }}>
                <Field
                  label="From"
                  value={rule.startTime}
                  onChangeText={(value) => update(index, { startTime: value })}
                  placeholder="09:00"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="To"
                  value={rule.endTime}
                  onChangeText={(value) => update(index, { endTime: value })}
                  placeholder="17:00"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <Button
                label="Remove"
                variant="destructive"
                onPress={() => setRules((current) => current.filter((_, i) => i !== index))}
              />
            </View>
          </View>
        ))}

        {error ? (
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        ) : null}

        <Button
          label="Add window"
          variant="secondary"
          icon="add-outline"
          onPress={() => setRules((current) => [...current, { weekday: 1, startTime: "09:00", endTime: "17:00" }])}
        />
        <Button
          label="Save availability"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={save.isPending || invalid}
        />
        {invalid ? (
          <Txt variant="caption" tone="danger">
            Every window needs an HH:MM start before its end.
          </Txt>
        ) : null}
      </Card>
    </View>
  );
}

function TypesTab({ data, lcId }: { data: BookingResponse; lcId: string | null }) {
  const queryClient = useQueryClient();
  const webBase = env.webUrl || env.apiUrl;

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<{ id: string; active: boolean }>(`/booking/types/${id}`, {
        method: "PATCH",
        lcId,
        body: { active }
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["booking"] }),
    onError: (error: Error) => Alert.alert("That didn't work", error.message)
  });

  if (data.types.length === 0) {
    return (
      <StateBlock
        icon="calendar-outline"
        title="No appointment types"
        message="Create one on the web app — it needs a duration, notice window and intake questions."
        action={{ label: "Open on the web", onPress: () => void Linking.openURL(`${webBase}/appointments`) }}
      />
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      {data.types.map((type: AppointmentTypeSummaryDto) => (
        <Card key={type.id} style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: type.color }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="heading" numberOfLines={1}>
                {type.name}
              </Txt>
              <Txt variant="caption" tone="subtle">
                {type.durationMinutes} min
                {type.bufferMinutes > 0 ? ` · ${type.bufferMinutes} min buffer` : ""}
                {type.intakeFieldCount > 0
                  ? ` · ${type.intakeFieldCount} question${type.intakeFieldCount === 1 ? "" : "s"}`
                  : ""}
              </Txt>
            </View>
            <Badge label={type.active ? "Live" : "Off"} tone={type.active ? "success" : "neutral"} />
          </View>

          {type.description ? (
            <Txt variant="caption" tone="muted">
              {type.description}
            </Txt>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Txt variant="label" style={{ flex: 1 }}>
              Accepting bookings
            </Txt>
            <Switch
              value={type.active}
              disabled={!data.canManage || toggle.isPending}
              onValueChange={(value) => toggle.mutate({ id: type.id, active: value })}
            />
          </View>

          {type.publicPath ? (
            <Button
              label="Open booking link"
              variant="secondary"
              icon="open-outline"
              onPress={() => void Linking.openURL(`${webBase}${type.publicPath}`)}
            />
          ) : null}
        </Card>
      ))}
    </View>
  );
}

export default function BookingScreen() {
  const [tab, setTab] = useState<Tab>("page");
  const { activeLcId } = useSession();
  const { data, isPending, error, refetch, isRefetching } = useBooking();
  const webBase = env.webUrl || env.apiUrl;

  if (isPending) return <Loading label="Loading booking setup" />;

  if (error || !data) {
    return (
      <StateBlock
        icon="time-outline"
        title="Couldn't load booking"
        message={error?.message ?? "Try again in a moment."}
        action={{ label: "Retry", onPress: () => void refetch() }}
      />
    );
  }

  if (!data.canManage) {
    return (
      <StateBlock
        icon="lock-closed-outline"
        title="Booking is managed by admins"
        message="Ask an owner or admin to change the booking page, hours or appointment types."
        action={
          data.settings
            ? {
                label: "Open public page",
                onPress: () => void Linking.openURL(`${webBase}${data.settings!.publicPath}`)
              }
            : undefined
        }
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Booking" }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {TABS.map((item) => (
            <Button
              key={item.key}
              label={item.label}
              variant={item.key === tab ? "primary" : "secondary"}
              onPress={() => setTab(item.key)}
              style={{ flex: 1 }}
            />
          ))}
        </View>

        {tab === "page" ? (
          <PageTab data={data} lcId={activeLcId} />
        ) : tab === "hours" ? (
          <HoursTab data={data} lcId={activeLcId} />
        ) : (
          <TypesTab data={data} lcId={activeLcId} />
        )}
      </ScrollView>
    </>
  );
}
