import {
  INSTAGRAM_CAPTION_LIMIT,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  type SocialPlatform
} from "@aiesec/api-contract";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, View } from "react-native";
import { pickImage, uploadSocialImage } from "../lib/upload";
import { radius, space, useTheme } from "../theme";
import { Button, Card, Field, Txt } from "./ui";

export type PostDraft = {
  title: string;
  caption: string;
  platforms: SocialPlatform[];
  mediaUrls: string[];
  scheduledFor: Date | null;
};

export function emptyDraft(): PostDraft {
  return { title: "", caption: "", platforms: ["instagram"], mediaUrls: [], scheduledFor: null };
}

/**
 * The composer body, shared by the create and edit screens.
 *
 * Images upload to Supabase Storage as soon as they're picked rather than on
 * submit: the upload is the slow part, and doing it up front means the preview
 * you see is the exact URL Instagram will fetch.
 */
export function PostForm({
  draft,
  onChange,
  lcId,
  disabled
}: {
  draft: PostDraft;
  onChange: (next: PostDraft) => void;
  lcId: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const captionLeft = INSTAGRAM_CAPTION_LIMIT - draft.caption.length;
  const wantsInstagram = draft.platforms.includes("instagram");

  async function addImage(source: "library" | "camera") {
    try {
      const picked = await pickImage(source);
      if (!picked) return;
      setUploading(true);
      const url = await uploadSocialImage(picked, lcId);
      onChange({ ...draft, mediaUrls: [...draft.mediaUrls, url] });
    } catch (error) {
      Alert.alert("Couldn't add image", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function togglePlatform(platform: SocialPlatform) {
    const next = draft.platforms.includes(platform)
      ? draft.platforms.filter((value) => value !== platform)
      : [...draft.platforms, platform];
    onChange({ ...draft, platforms: next });
  }

  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.lg }}>
        <Field
          label="Caption"
          value={draft.caption}
          onChangeText={(value) => onChange({ ...draft, caption: value })}
          placeholder="What's this post about?"
          multiline
          editable={!disabled}
          hint={`${captionLeft.toLocaleString()} characters left`}
          error={captionLeft < 0 ? `${Math.abs(captionLeft)} over Instagram's limit` : null}
        />
        <Field
          label="Internal title (optional)"
          value={draft.title}
          onChangeText={(value) => onChange({ ...draft, title: value })}
          placeholder="Only your team sees this"
          editable={!disabled}
        />
      </Card>

      <Card style={{ gap: space.md }}>
        <Txt variant="heading">Platforms</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {SOCIAL_PLATFORMS.map((platform) => {
            const active = draft.platforms.includes(platform);
            return (
              <Pressable
                key={platform}
                onPress={() => !disabled && togglePlatform(platform)}
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
                  {SOCIAL_PLATFORM_LABELS[platform]}
                </Txt>
              </Pressable>
            );
          })}
        </View>
        {draft.platforms.some((platform) => platform !== "instagram") ? (
          <Txt variant="caption" tone="subtle">
            Only Instagram publishes automatically. Others are tracked here so the team knows what's planned, then
            posted by hand.
          </Txt>
        ) : null}
      </Card>

      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt variant="heading">Image</Txt>
          {uploading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>

        {draft.mediaUrls.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {draft.mediaUrls.map((url) => (
              <View key={url}>
                <Image
                  source={{ uri: url }}
                  style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: theme.surfaceSunken }}
                />
                {!disabled ? (
                  <Pressable
                    onPress={() => onChange({ ...draft, mediaUrls: draft.mediaUrls.filter((value) => value !== url) })}
                    hitSlop={8}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      backgroundColor: theme.surface,
                      borderRadius: radius.pill
                    }}
                  >
                    <Ionicons name="close-circle" size={22} color={theme.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Txt variant="caption" tone={wantsInstagram ? "warning" : "subtle"}>
            {wantsInstagram ? "Instagram posts need an image." : "No image attached."}
          </Txt>
        )}

        {!disabled ? (
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button
              label="Photo library"
              icon="images-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void addImage("library")}
              disabled={uploading}
            />
            <Button
              label="Camera"
              icon="camera-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void addImage("camera")}
              disabled={uploading}
            />
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: space.md }}>
        <Txt variant="heading">Schedule</Txt>
        <Txt variant="caption" tone="subtle">
          {draft.scheduledFor
            ? draft.scheduledFor.toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit"
              })
            : "Not scheduled — saved as a draft."}
        </Txt>

        {showPicker ? (
          <DateTimePicker
            value={draft.scheduledFor ?? new Date(Date.now() + 3_600_000)}
            mode="datetime"
            minimumDate={new Date()}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, date) => {
              // Android fires once and dismisses itself; iOS stays open inline.
              if (Platform.OS !== "ios") setShowPicker(false);
              if (event.type === "dismissed") return;
              if (date) onChange({ ...draft, scheduledFor: date });
            }}
          />
        ) : null}

        {!disabled ? (
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button
              label={showPicker ? "Done" : draft.scheduledFor ? "Change time" : "Pick a time"}
              icon="calendar-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => setShowPicker((value) => !value)}
            />
            {draft.scheduledFor ? (
              <Button
                label="Clear"
                variant="ghost"
                onPress={() => {
                  onChange({ ...draft, scheduledFor: null });
                  setShowPicker(false);
                }}
              />
            ) : null}
          </View>
        ) : null}

        <Txt variant="caption" tone="subtle">
          Scheduling records the time for your team. Automatic publishing at that time isn't wired up yet — publish from
          the post when you're ready.
        </Txt>
      </Card>
    </View>
  );
}
