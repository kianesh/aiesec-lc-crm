import {
  SOCIAL_POST_STATUS_LABELS,
  type PublishPostResponse,
  type SocialPlatform,
  type SocialPostDto
} from "@aiesec/api-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { PostForm, type PostDraft } from "../../src/components/post-form";
import { Badge, Button, Card, Loading, StateBlock, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { relativeTime, socialStatusTone } from "../../src/lib/format";
import { useSocialPost } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";

function toDraft(post: SocialPostDto): PostDraft {
  return {
    title: post.title ?? "",
    caption: post.caption,
    platforms: post.platforms as SocialPlatform[],
    mediaUrls: post.mediaUrls,
    scheduledFor: post.scheduledFor ? new Date(post.scheduledFor) : null
  };
}

export default function SocialPostScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const { activeLcId, can } = useSession();

  const { data: post, isPending, error, refetch } = useSocialPost(id);
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const canManage = can("send_campaigns");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["social", activeLcId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
  };

  const save = useMutation({
    mutationFn: async (next: PostDraft) =>
      apiFetch<SocialPostDto>(`/social/${id}`, {
        method: "PATCH",
        lcId: activeLcId,
        body: {
          title: next.title.trim() || null,
          caption: next.caption.trim(),
          platforms: next.platforms,
          mediaUrls: next.mediaUrls,
          scheduledFor: next.scheduledFor ? next.scheduledFor.toISOString() : null
        }
      }),
    onSuccess: () => {
      setDraft(null);
      void refetch();
      invalidate();
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't save", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  const publish = useMutation({
    mutationFn: async () => apiFetch<PublishPostResponse>(`/social/${id}/publish`, { method: "POST", lcId: activeLcId }),
    onSuccess: () => {
      void refetch();
      invalidate();
      Alert.alert("Published", "The post is live on Instagram.");
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't publish", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  const remove = useMutation({
    mutationFn: async () => apiFetch(`/social/${id}`, { method: "DELETE", lcId: activeLcId }),
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
      <>
        <Stack.Screen options={{ title: "Post" }} />
        <StateBlock
          icon="cloud-offline-outline"
          title="Couldn't load this post"
          message={error instanceof ApiError ? error.message : "Something went wrong."}
          action={{ label: "Try again", onPress: () => void refetch() }}
        />
      </>
    );
  }

  if (isPending || !post) return <Loading label="Loading post" />;

  const isEditing = draft !== null;
  const isPublished = post.status === "published";

  function confirmPublish() {
    Alert.alert("Publish now", "This posts to your LC's Instagram immediately. It can't be undone from here.", [
      { text: "Cancel", style: "cancel" },
      { text: "Publish", onPress: () => publish.mutate() }
    ]);
  }

  function confirmDelete() {
    Alert.alert("Delete post", "Remove this post from the queue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() }
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen
        options={{
          title: post.title || "Post",
          headerRight: () =>
            canManage && !isPublished ? (
              <Pressable
                onPress={() => (isEditing && draft ? save.mutate(draft) : setDraft(toDraft(post)))}
                hitSlop={8}
              >
                <Txt variant="label" tone="primary">
                  {isEditing ? (save.isPending ? "Saving…" : "Save") : "Edit"}
                </Txt>
              </Pressable>
            ) : null
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Badge label={SOCIAL_POST_STATUS_LABELS[post.status]} tone={socialStatusTone(post.status)} />
          <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>
            {post.authorName ? `${post.authorName} · ` : ""}
            updated {relativeTime(post.updatedAt)}
          </Txt>
        </View>

        {post.status === "failed" ? (
          <Card style={{ gap: space.sm, borderColor: theme.danger }}>
            <Txt variant="heading" tone="danger">
              Last publish failed
            </Txt>
            <Txt variant="caption" tone="muted">
              Instagram rejected this post. Check the image and caption, then try publishing again.
            </Txt>
          </Card>
        ) : null}

        {isEditing && draft ? (
          <>
            <PostForm draft={draft} onChange={setDraft} lcId={activeLcId ?? ""} disabled={save.isPending} />
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setDraft(null)} />
              <Button label="Save" style={{ flex: 1 }} onPress={() => save.mutate(draft)} loading={save.isPending} />
            </View>
          </>
        ) : (
          <>
            {post.mediaUrls.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {post.mediaUrls.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={{
                      width: "100%",
                      aspectRatio: 1,
                      borderRadius: radius.lg,
                      backgroundColor: theme.surfaceSunken
                    }}
                  />
                ))}
              </View>
            ) : null}

            <Card style={{ gap: space.sm }}>
              <Txt variant="heading">Caption</Txt>
              <Txt variant="body">{post.caption || "—"}</Txt>
            </Card>

            <Card style={{ gap: space.md }}>
              {(
                [
                  ["Platforms", post.platforms.join(", ") || "—"],
                  [
                    "Scheduled",
                    post.scheduledFor
                      ? new Date(post.scheduledFor).toLocaleString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit"
                        })
                      : "Not scheduled"
                  ],
                  ["Instagram media", post.externalPostIds.instagram ?? "—"]
                ] as const
              ).map(([label, value]) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                  <Txt variant="caption" tone="muted">
                    {label}
                  </Txt>
                  <Txt variant="caption" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
                    {value}
                  </Txt>
                </View>
              ))}
            </Card>

            {canManage && !isPublished ? (
              <View style={{ gap: space.md }}>
                <Button
                  label="Publish to Instagram now"
                  icon="logo-instagram"
                  onPress={confirmPublish}
                  loading={publish.isPending}
                  disabled={post.mediaUrls.length === 0}
                />
                {post.mediaUrls.length === 0 ? (
                  <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
                    Add an image before publishing.
                  </Txt>
                ) : null}
                <Button label="Delete post" variant="destructive" onPress={confirmDelete} loading={remove.isPending} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
