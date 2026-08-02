import { z } from "zod";

export const EMAIL_CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "failed"] as const;
export type EmailCampaignStatus = (typeof EMAIL_CAMPAIGN_STATUSES)[number];

export const EMAIL_CAMPAIGN_STATUS_LABELS: Record<EmailCampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed"
};

// ------------------------------------------------------------------ DTOs --

export type EmailCampaignListItemDto = {
  id: string;
  name: string;
  subject: string;
  status: EmailCampaignStatus;
  /** ISO 8601 */
  sentAt: string | null;
  /** ISO 8601 */
  scheduledFor: string | null;
  /** ISO 8601 */
  updatedAt: string;
  stats: { sent: number; failed: number };
};

export type EmailCampaignStatsDto = {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
};

export type EmailCampaignDetailDto = EmailCampaignListItemDto & {
  fromName: string;
  fromEmail: string;
  bodyHtml: string;
  /** Plain-text rendering of bodyHtml — the app has no HTML renderer. */
  bodyPreview: string;
  audienceName: string | null;
  /** How many contacts this campaign would send to right now. */
  audienceSize: number;
  detailedStats: EmailCampaignStatsDto;
  /** False when the campaign isn't a draft, or the caller lacks send_campaigns. */
  canSend: boolean;
  sendBlockedReason: string | null;
};

export type EmailListResponse = {
  campaigns: EmailCampaignListItemDto[];
  total: number;
  canManage: boolean;
};

export type SendCampaignResponse = {
  ok: boolean;
  sent: number;
  failed: number;
};

// -------------------------------------------------------------- requests --

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const emailListQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(EMAIL_CAMPAIGN_STATUSES).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type EmailListQuery = z.infer<typeof emailListQuerySchema>;

export const sendCampaignSchema = z.object({
  /**
   * "test" delivers one copy to the caller's own address; "audience" is the
   * real send. Requiring the caller to name which one keeps a mistyped request
   * from mailing the whole contact list.
   */
  mode: z.enum(["test", "audience"]),
  /**
   * Must equal the audience size the client displayed. If the audience changed
   * between the confirmation dialog and the tap, the send is rejected rather
   * than quietly going to more people than the sender agreed to.
   */
  confirmRecipientCount: z.number().int().min(0).optional()
});

export type SendCampaignInput = z.input<typeof sendCampaignSchema>;
