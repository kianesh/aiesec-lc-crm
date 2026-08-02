import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  PROGRAMMES,
  PROGRAMME_LABELS,
  type ContactListItemDto,
  type ContactType,
  type FunnelStage,
  type Programme
} from "@aiesec/api-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Button, Card, Field, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";

function Chips<T extends string>({
  label,
  options,
  labels,
  value,
  onChange
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (next: T | null) => void;
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
              onPress={() => onChange(active ? null : option)}
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

export default function NewContactScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeLcId } = useSession();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<ContactType>("candidate");
  const [stage, setStage] = useState<FunnelStage | null>(null);
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const create = useMutation({
    mutationFn: async () =>
      apiFetch<ContactListItemDto>("/contacts", {
        method: "POST",
        lcId: activeLcId,
        body: {
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          type,
          funnelStage: stage,
          programme,
          tags: tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        }
      }),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts", activeLcId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
      // Replace so Back from the detail screen returns to the list, not to the
      // form the contact was just created from.
      router.replace(`/contacts/${contact.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.details) {
        setErrors(error.details);
        return;
      }
      Alert.alert("Couldn't create contact", error instanceof ApiError ? error.message : "Please try again.");
    }
  });

  function submit() {
    setErrors({});
    if (fullName.trim().length === 0) {
      setErrors({ fullName: ["A name is required."] });
      return;
    }
    create.mutate();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <Card style={{ gap: space.lg }}>
          <Field
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Jordan Ade"
            autoFocus
            error={errors.fullName?.[0]}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="jordan@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            error={errors.email?.[0]}
          />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Chips
            label="Type"
            options={CONTACT_TYPES}
            labels={CONTACT_TYPE_LABELS}
            value={type}
            onChange={(next) => setType(next ?? "candidate")}
          />
          <Chips
            label="Funnel stage"
            options={FUNNEL_STAGES}
            labels={FUNNEL_STAGE_LABELS}
            value={stage}
            onChange={setStage}
          />
          <Chips
            label="Programme"
            options={PROGRAMMES}
            labels={PROGRAMME_LABELS}
            value={programme}
            onChange={setProgramme}
          />
          <Field
            label="Tags"
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="ogv, campus-drive"
            autoCapitalize="none"
            hint="Comma separated."
          />
        </Card>

        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => router.back()} />
          <Button label="Create" style={{ flex: 1 }} onPress={submit} loading={create.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
