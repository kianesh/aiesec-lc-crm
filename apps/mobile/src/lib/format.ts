import type {
  ConversationChannel,
  ConversationStatus,
  EmailCampaignStatus,
  FunnelStage,
  SocialPostStatus
} from "@aiesec/api-contract";
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

/** "9:30 AM – 10:00 AM" for an appointment's slot. */
export function formatTimeRange(startIso: string, endIso: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${new Date(startIso).toLocaleTimeString(undefined, options)} – ${new Date(endIso).toLocaleTimeString(undefined, options)}`;
}

/** "Today", "Tomorrow", or "Thu 14 Aug" — the heading for a day's appointments. */
export function formatDayHeading(iso: string): string {
  const date = new Date(iso);
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Group a chronological list into day buckets, preserving the incoming order. */
export function groupByDay<T>(items: T[], getIso: (item: T) => string): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const iso = getIso(item);
    const key = new Date(iso).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: formatDayHeading(iso), items: [item] });
  }
  return groups;
}

export function campaignStatusTone(status: EmailCampaignStatus): "success" | "primary" | "danger" | "neutral" {
  switch (status) {
    case "sent":
      return "success";
    case "sending":
    case "scheduled":
      return "primary";
    case "failed":
      return "danger";
    case "draft":
      return "neutral";
  }
}

export function socialStatusTone(status: SocialPostStatus): "success" | "primary" | "danger" | "neutral" {
  switch (status) {
    case "published":
      return "success";
    case "scheduled":
      return "primary";
    case "failed":
      return "danger";
    case "draft":
      return "neutral";
  }
}

export function humanizeActivity(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}
