import type { ConversationChannel, ConversationStatus, FunnelStage } from "@aiesec/api-contract";
import type { Ionicons } from "@expo/vector-icons";

/** Matches the web app's `formatRelative` so both inboxes read the same. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function channelIcon(channel: ConversationChannel): keyof typeof Ionicons.glyphMap {
  switch (channel) {
    case "instagram":
      return "logo-instagram";
    case "facebook":
      return "logo-facebook";
    case "whatsapp":
      return "logo-whatsapp";
    case "email":
      return "mail-outline";
  }
}

export function statusTone(status: ConversationStatus): "success" | "neutral" | "warning" {
  switch (status) {
    case "open":
      return "success";
    case "snoozed":
      return "warning";
    case "closed":
      return "neutral";
  }
}

/** Later stages read as "further along" — used to tint the pipeline bars. */
export function stageProgress(stage: FunnelStage): number {
  const order: FunnelStage[] = ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"];
  return (order.indexOf(stage) + 1) / order.length;
}

export function humanizeActivity(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}
