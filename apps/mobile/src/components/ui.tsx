import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { radius, space, typeScale, useTheme } from "../theme";

// A small primitive set shared by every screen. Styles are built per-render
// from the active theme rather than a static StyleSheet, because the tokens
// change with light/dark mode.

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: space.lg
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

type TextVariant = keyof typeof typeScale;

export function Txt({
  children,
  variant = "body",
  tone = "default",
  style,
  numberOfLines
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: "default" | "muted" | "subtle" | "primary" | "success" | "warning" | "danger" | "inverse";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  const color = {
    default: theme.text,
    muted: theme.textMuted,
    subtle: theme.textSubtle,
    primary: theme.primary,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    inverse: theme.primaryFg
  }[tone];

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        typeScale[variant],
        { color },
        variant === "eyebrow" ? { textTransform: "uppercase" as const } : null,
        style
      ]}
    >
      {children}
    </Text>
  );
}

export function Badge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  const theme = useTheme();
  const palette = {
    neutral: { bg: theme.surfaceSunken, fg: theme.textMuted },
    primary: { bg: theme.primarySoft, fg: theme.primary },
    success: { bg: theme.primarySoft, fg: theme.success },
    warning: { bg: theme.surfaceSunken, fg: theme.warning },
    danger: { bg: theme.surfaceSunken, fg: theme.danger }
  }[tone];

  return (
    <View
      style={{
        backgroundColor: palette.bg,
        borderRadius: radius.pill,
        paddingHorizontal: space.sm,
        paddingVertical: 3
      }}
    >
      <Text style={[typeScale.caption, { color: palette.fg, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  style
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: theme.primary, fg: theme.primaryFg, border: theme.primary },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.border },
    ghost: { bg: "transparent", fg: theme.primary, border: "transparent" },
    destructive: { bg: theme.surface, fg: theme.danger, border: theme.border }
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          paddingVertical: 13,
          paddingHorizontal: space.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={17} color={palette.fg} />
      ) : null}
      <Text style={[typeScale.label, { color: palette.fg, fontWeight: "600" }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  ...inputProps
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="label" tone="muted">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={theme.textSubtle}
        {...inputProps}
        style={[
          typeScale.body,
          {
            color: theme.text,
            backgroundColor: theme.surfaceInset,
            borderColor: error ? theme.danger : theme.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: 11
          },
          inputProps.multiline ? { minHeight: 96, textAlignVertical: "top" } : null,
          inputProps.style
        ]}
      />
      {error ? (
        <Txt variant="caption" tone="danger">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" tone="subtle">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const theme = useTheme();
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.primarySoft,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Text style={{ color: theme.primary, fontWeight: "700", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function StateBlock({
  icon,
  title,
  message,
  action
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.md }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.surfaceSunken,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Ionicons name={icon} size={26} color={theme.textSubtle} />
      </View>
      <Txt variant="heading">{title}</Txt>
      {message ? (
        <Txt variant="body" tone="muted" style={{ textAlign: "center" }}>
          {message}
        </Txt>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: "center", gap: space.md }}>
      <ActivityIndicator color={theme.primary} />
      {label ? (
        <Txt variant="caption" tone="subtle">
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

/** Grey placeholder block used while a screen's real content loads. */
export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | `${number}%` }) {
  const theme = useTheme();
  return <View style={{ height, width, borderRadius: radius.sm, backgroundColor: theme.surfaceSunken }} />;
}

export function Row({
  children,
  onPress,
  style
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          backgroundColor: theme.surface,
          borderBottomColor: theme.borderSubtle,
          borderBottomWidth: StyleSheet.hairlineWidth
        },
        style
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}
