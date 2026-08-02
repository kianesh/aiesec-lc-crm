import {
  CHANNEL_LABELS,
  type ConversationDetailDto,
  type SendMessageResponse
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Loading, StateBlock, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { channelIcon, formatDateTime, statusTone } from "../../src/lib/format";
import { useConversation } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { radius, space, typeScale, useTheme } from "../../src/theme";

function Bubble({ message, channel }: { message: ConversationDetailDto["messages"][number]; channel: ConversationDetailDto["channel"] }) {
  const theme = useTheme();
  const outbound = message.direction === "out";
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.xs, alignItems: outbound ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "82%",
          backgroundColor: outbound ? theme.primary : theme.surface,
          borderColor: outbound ? theme.primary : theme.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          borderBottomRightRadius: outbound ? radius.sm : radius.lg,
          borderBottomLeftRadius: outbound ? radius.lg : radius.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          gap: 4
        }}
      >
        <Txt variant="body" tone={outbound ? "inverse" : "default"}>
          {message.body}
        </Txt>
        <Txt variant="caption" tone={outbound ? "inverse" : "subtle"} style={{ opacity: outbound ? 0.75 : 1 }}>
          {formatDateTime(message.sentAt)}
          {channel === "email" ? " · Email" : ""}
        </Txt>
      </View>
    </View>
  );
}

export default function ConversationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const { activeLcId } = useSession();

  const { data: conversation, isPending, error, refetch } = useConversation(id);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ConversationDetailDto["messages"][number]>>(null);

  const messageCount = conversation?.messages.length ?? 0;
  useEffect(() => {
    if (messageCount > 0) {
      const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
      return () => clearTimeout(timer);
    }
  }, [messageCount]);

  // Opening a thread clears its unread count server-side; refresh the lists
  // that display it so the badge doesn't linger.
  useEffect(() => {
    if (!conversation) return;
    void queryClient.invalidateQueries({ queryKey: ["conversations", activeLcId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
    // Only when the thread id changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const send = useMutation({
    mutationFn: async (body: string) =>
      apiFetch<SendMessageResponse>(`/conversations/${id}/messages`, {
        method: "POST",
        lcId: activeLcId,
        body: { body }
      }),
    onSuccess: (result) => {
      setDraft("");
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations", activeLcId] });
      if (!result.delivered && result.deliveryError === "channel_not_connected") {
        Alert.alert(
          "Saved, not sent",
          `${CHANNEL_LABELS[conversation?.channel ?? "email"]} replies are recorded on the timeline but aren't delivered yet. Instagram DMs are the only channel wired for outbound.`
        );
      }
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't send", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  const setStatus = useMutation({
    mutationFn: async (status: ConversationDetailDto["status"]) =>
      apiFetch(`/conversations/${id}`, { method: "PATCH", lcId: activeLcId, body: { status } }),
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations", activeLcId] });
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't update", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  if (error) {
    return (
      <StateBlock
        icon="cloud-offline-outline"
        title="Couldn't load this conversation"
        message={error instanceof ApiError ? error.message : "Something went wrong."}
        action={{ label: "Try again", onPress: () => void refetch() }}
      />
    );
  }

  if (isPending || !conversation) return <Loading label="Loading conversation" />;

  const closed = conversation.status === "closed";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.surfaceMuted }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
    >
      <Stack.Screen
        options={{
          title: conversation.name,
          headerRight: () => (
            <Pressable onPress={() => setStatus.mutate(closed ? "open" : "closed")} hitSlop={8}>
              <Txt variant="label" tone="primary">
                {closed ? "Reopen" : "Close"}
              </Txt>
            </Pressable>
          )
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth
        }}
      >
        <Ionicons name={channelIcon(conversation.channel)} size={16} color={theme.channel[conversation.channel]} />
        <Txt variant="caption" tone="muted">
          {CHANNEL_LABELS[conversation.channel]}
        </Txt>
        <Badge label={conversation.status} tone={statusTone(conversation.status)} />
        {conversation.assignedTo ? (
          <Txt variant="caption" tone="subtle" numberOfLines={1} style={{ flex: 1 }}>
            · {conversation.assignedTo.name}
          </Txt>
        ) : null}
        {conversation.contact ? (
          <Pressable onPress={() => router.push(`/contacts/${conversation.contact!.id}`)} hitSlop={8}>
            <Txt variant="caption" tone="primary">
              View contact
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={conversation.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: space.md, flexGrow: 1 }}
        ListEmptyComponent={
          <StateBlock icon="chatbubble-ellipses-outline" title="No messages yet" message="Start the thread below." />
        }
        renderItem={({ item }) => <Bubble message={item} channel={conversation.channel} />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {conversation.replyBlockedReason ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xs }}>
          <Txt variant="caption" tone="warning">
            {conversation.replyBlockedReason}
          </Txt>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingTop: space.sm,
          paddingBottom: Math.max(insets.bottom, space.sm),
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={conversation.canReply ? "Write a reply…" : "Replies are unavailable on this thread"}
          placeholderTextColor={theme.textSubtle}
          editable={conversation.canReply && !send.isPending}
          multiline
          style={[
            typeScale.body,
            {
              flex: 1,
              maxHeight: 120,
              color: theme.text,
              backgroundColor: theme.surfaceInset,
              borderRadius: radius.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingHorizontal: space.md,
              paddingVertical: space.sm
            }
          ]}
        />
        <Pressable
          accessibilityLabel="Send reply"
          onPress={() => send.mutate(draft.trim())}
          disabled={!conversation.canReply || draft.trim().length === 0 || send.isPending}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.primary,
            opacity: !conversation.canReply || draft.trim().length === 0 || send.isPending ? 0.4 : pressed ? 0.8 : 1
          })}
        >
          <Ionicons name="arrow-up" size={20} color={theme.primaryFg} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
