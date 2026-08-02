import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  PROGRAMMES,
  PROGRAMME_LABELS,
  type ContactDetailDto,
  type UpdateContactInput
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { Avatar, Badge, Button, Card, Field, Loading, Row, StateBlock, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { channelIcon, formatDateTime, humanizeActivity, relativeTime } from "../../src/lib/format";
import { useContact } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";

type Draft = {
  fullName: string;
  email: string;
  phone: string;
  type: ContactDetailDto["type"];
  funnelStage: ContactDetailDto["funnelStage"];
  programme: ContactDetailDto["programme"];
  nationality: string;
};

function toDraft(contact: ContactDetailDto): Draft {
  return {
    fullName: contact.fullName,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    type: contact.type,
    funnelStage: contact.funnelStage,
    programme: contact.programme,
    nationality: contact.nationality ?? ""
  };
}

function OptionRow<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  allowClear
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (next: T | null) => void;
  allowClear?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="label" tone="muted">
        {label}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(active && allowClear ? null : option)}
              style={({ pressed }) => ({
                paddingHorizontal: space.md,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: active ? theme.primary : theme.surfaceInset,
                borderWidth: 1,
                borderColor: active ? theme.primary : theme.border,
                opacity: pressed ? 0.7 : 1
              })}
            >
              <Txt variant="caption" tone={active ? "inverse" : "muted"} style={{ fontWeight: "600" }}>
                {labels[option]}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ContactDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const { activeLcId, can } = useSession();

  const { data: contact, isPending, error, refetch } = useContact(id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const editable = can("manage_contacts");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["contacts", activeLcId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
  };

  const save = useMutation({
    mutationFn: async (input: UpdateContactInput) =>
      apiFetch(`/contacts/${id}`, { method: "PATCH", body: input, lcId: activeLcId }),
    onSuccess: () => {
      setDraft(null);
      invalidate();
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't save", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  const remove = useMutation({
    mutationFn: async () => apiFetch(`/contacts/${id}`, { method: "DELETE", lcId: activeLcId }),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't delete", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  if (error) {
    return (
      <StateBlock
        icon={error instanceof ApiError && error.code === "not_found" ? "person-remove-outline" : "cloud-offline-outline"}
        title="Couldn't load this contact"
        message={error instanceof ApiError ? error.message : "Something went wrong."}
        action={{ label: "Try again", onPress: () => void refetch() }}
      />
    );
  }

  if (isPending || !contact) return <Loading label="Loading contact" />;

  const isEditing = draft !== null;
  const current = draft ?? toDraft(contact);

  function update(patch: Partial<Draft>) {
    setDraft((previous) => ({ ...(previous ?? toDraft(contact!)), ...patch }));
  }

  function onSave() {
    if (!draft) return;
    if (draft.fullName.trim().length === 0) {
      Alert.alert("Name required", "A contact needs a name.");
      return;
    }
    save.mutate({
      fullName: draft.fullName.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      type: draft.type,
      funnelStage: draft.funnelStage,
      programme: draft.programme,
      nationality: draft.nationality.trim() || null
    });
  }

  function confirmDelete() {
    Alert.alert("Delete contact", `Delete ${contact!.fullName}? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() }
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen
        options={{
          title: contact.fullName,
          headerRight: () =>
            editable ? (
              <Pressable onPress={() => (isEditing ? onSave() : setDraft(toDraft(contact)))} hitSlop={8}>
                <Txt variant="label" tone="primary">
                  {isEditing ? (save.isPending ? "Saving…" : "Save") : "Edit"}
                </Txt>
              </Pressable>
            ) : null
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <View style={{ alignItems: "center", gap: space.sm }}>
          <Avatar name={contact.fullName} size={64} />
          {!isEditing ? (
            <>
              <Txt variant="title">{contact.fullName}</Txt>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", justifyContent: "center" }}>
                <Badge label={CONTACT_TYPE_LABELS[contact.type]} />
                {contact.funnelStage ? <Badge label={FUNNEL_STAGE_LABELS[contact.funnelStage]} tone="primary" /> : null}
                {contact.programme ? <Badge label={PROGRAMME_LABELS[contact.programme]} /> : null}
              </View>
            </>
          ) : null}
        </View>

        {!isEditing && (contact.email || contact.phone) ? (
          <View style={{ flexDirection: "row", gap: space.md }}>
            {contact.email ? (
              <Button
                label="Email"
                icon="mail-outline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => void Linking.openURL(`mailto:${contact.email}`)}
              />
            ) : null}
            {contact.phone ? (
              <Button
                label="Call"
                icon="call-outline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
              />
            ) : null}
          </View>
        ) : null}

        {isEditing ? (
          <Card style={{ gap: space.lg }}>
            <Field label="Full name" value={current.fullName} onChangeText={(value) => update({ fullName: value })} />
            <Field
              label="Email"
              value={current.email}
              onChangeText={(value) => update({ email: value })}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label="Phone"
              value={current.phone}
              onChangeText={(value) => update({ phone: value })}
              keyboardType="phone-pad"
            />
            <Field
              label="Nationality"
              value={current.nationality}
              onChangeText={(value) => update({ nationality: value })}
            />
            <OptionRow
              label="Type"
              options={CONTACT_TYPES}
              labels={CONTACT_TYPE_LABELS}
              value={current.type}
              onChange={(next) => next && update({ type: next })}
            />
            <OptionRow
              label="Funnel stage"
              options={FUNNEL_STAGES}
              labels={FUNNEL_STAGE_LABELS}
              value={current.funnelStage}
              onChange={(next) => update({ funnelStage: next })}
              allowClear
            />
            <OptionRow
              label="Programme"
              options={PROGRAMMES}
              labels={PROGRAMME_LABELS}
              value={current.programme}
              onChange={(next) => update({ programme: next })}
              allowClear
            />
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setDraft(null)} />
              <Button label="Save" style={{ flex: 1 }} onPress={onSave} loading={save.isPending} />
            </View>
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <Txt variant="heading">Details</Txt>
            {(
              [
                ["Email", contact.email],
                ["Phone", contact.phone],
                ["Nationality", contact.nationality],
                ["Home committee", contact.homeCommitteeId],
                ["Source", contact.source],
                ["EXPA person", contact.expaPersonId],
                ["Added", formatDateTime(contact.createdAt)]
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <Txt variant="caption" tone="muted">
                  {label}
                </Txt>
                <Txt variant="caption" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
                  {value ?? "—"}
                </Txt>
              </View>
            ))}
            {contact.tags.length > 0 ? (
              <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
                {contact.tags.map((tag) => (
                  <Badge key={tag} label={tag} tone="primary" />
                ))}
              </View>
            ) : null}
          </Card>
        )}

        {contact.conversations.length > 0 ? (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <View style={{ padding: space.lg }}>
              <Txt variant="heading">Conversations</Txt>
            </View>
            {contact.conversations.map((conversation) => (
              <Row
                key={conversation.id}
                onPress={() => router.push(`/conversations/${conversation.id}`)}
                style={{ paddingHorizontal: space.lg }}
              >
                <Ionicons
                  name={channelIcon(conversation.channel as never)}
                  size={18}
                  color={theme.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Txt variant="label">{conversation.channel}</Txt>
                  <Txt variant="caption" tone="subtle">
                    {conversation.status} · {relativeTime(conversation.lastMessageAt)}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textSubtle} />
              </Row>
            ))}
          </Card>
        ) : null}

        <Card style={{ gap: space.md }}>
          <Txt variant="heading">Activity</Txt>
          {contact.activities.length === 0 ? (
            <Txt variant="caption" tone="subtle">
              No activity recorded yet.
            </Txt>
          ) : (
            contact.activities.map((activity) => (
              <View key={activity.id} style={{ gap: 2 }}>
                <Txt variant="label">{humanizeActivity(activity.type)}</Txt>
                <Txt variant="caption" tone="subtle">
                  {activity.authorName ? `${activity.authorName} · ` : ""}
                  {formatDateTime(activity.createdAt)}
                </Txt>
              </View>
            ))
          )}
        </Card>

        {editable ? (
          <Button label="Delete contact" variant="destructive" onPress={confirmDelete} loading={remove.isPending} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
