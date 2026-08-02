import type { SocialPostDto } from "@aiesec/api-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { PostForm, emptyDraft, type PostDraft } from "../../src/components/post-form";
import { Button, StateBlock } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { useSession } from "../../src/lib/session";
import { space } from "../../src/theme";

export default function NewSocialPostScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeLcId, can } = useSession();
  const [draft, setDraft] = useState<PostDraft>(emptyDraft);

  const create = useMutation({
    mutationFn: async () =>
      apiFetch<SocialPostDto>("/social", {
        method: "POST",
        lcId: activeLcId,
        body: {
          title: draft.title.trim() || null,
          caption: draft.caption.trim(),
          platforms: draft.platforms,
          mediaUrls: draft.mediaUrls,
          scheduledFor: draft.scheduledFor ? draft.scheduledFor.toISOString() : null
        }
      }),
    onSuccess: (post) => {
      void queryClient.invalidateQueries({ queryKey: ["social", activeLcId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
      // Replace so Back from the post returns to the queue, not to the form.
      router.replace(`/social/${post.id}`);
    },
    onError: (error) => {
      Alert.alert("Couldn't save post", error instanceof ApiError ? error.message : "Please try again.");
    }
  });

  if (!can("send_campaigns")) {
    return (
      <>
        <Stack.Screen options={{ title: "New post" }} />
        <StateBlock
          icon="lock-closed-outline"
          title="Not allowed"
          message="Your role can't create posts in this LC."
        />
      </>
    );
  }

  function submit() {
    if (draft.caption.trim().length === 0) {
      Alert.alert("Caption required", "Add a caption before saving.");
      return;
    }
    if (draft.platforms.length === 0) {
      Alert.alert("Pick a platform", "Choose at least one platform for this post.");
      return;
    }
    if (draft.platforms.includes("instagram") && draft.mediaUrls.length === 0) {
      Alert.alert("Image required", "Instagram posts need an image. Add one, or remove Instagram from the platforms.");
      return;
    }
    create.mutate();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "New post" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <PostForm draft={draft} onChange={setDraft} lcId={activeLcId ?? ""} disabled={create.isPending} />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => router.back()} />
          <Button
            label={draft.scheduledFor ? "Schedule" : "Save draft"}
            style={{ flex: 1 }}
            onPress={submit}
            loading={create.isPending}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
