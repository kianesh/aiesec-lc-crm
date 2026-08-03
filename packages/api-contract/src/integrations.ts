import { z } from "zod";

// The catalog the phone renders, keyed the same way the web page keys it. These
// keys are product-level names, not `integrationProviderEnum` values: "google"
// is stored as `google_drive` and "instagram" as `meta`, and the API maps
// between the two so the app never has to know that.
export const INTEGRATION_KEYS = ["expa", "google", "notion", "instagram", "resend"] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export const INTEGRATION_LABELS: Record<IntegrationKey, string> = {
  expa: "EXPA",
  google: "Google Workspace",
  notion: "Notion",
  instagram: "Instagram",
  resend: "Resend"
};

export const INTEGRATION_DESCRIPTIONS: Record<IntegrationKey, string> = {
  expa: "Analytics, funnel data, and contact sync from the AIESEC platform.",
  google: "Calendar + Meet for booking, Forms responses, Gmail send, contacts.",
  notion: "Two-way contact sync with a shared Notion database.",
  instagram: "Pull DMs into the inbox, reply, and publish posts.",
  resend: "Transactional & marketing email delivery + open/bounce tracking."
};

export const INTEGRATION_STATUSES = ["connected", "disconnected", "error"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/**
 * Actions the phone is allowed to run for a connector.
 *
 * Deliberately excludes connecting: Google, Notion and Instagram are OAuth
 * redirect flows, and EXPA needs a pasted access token. Both are better done in
 * the browser, so the app links out for them instead.
 */
export const INTEGRATION_ACTIONS = [
  "expa_sync",
  "notion_push",
  "notion_pull",
  "instagram_sync",
  "disconnect"
] as const;
export type IntegrationAction = (typeof INTEGRATION_ACTIONS)[number];

export const INTEGRATION_ACTION_LABELS: Record<IntegrationAction, string> = {
  expa_sync: "Sync analytics now",
  notion_push: "Push contacts to Notion",
  notion_pull: "Import contacts from Notion",
  instagram_sync: "Sync Instagram DMs",
  disconnect: "Disconnect"
};

export type IntegrationDto = {
  key: IntegrationKey;
  name: string;
  description: string;
  status: IntegrationStatus;
  lastSyncedAt: string | null;
  /** Only meaningful for EXPA; null everywhere else. */
  committeeId: string | null;
  /** Empty when the caller lacks `manage_integrations` or nothing applies. */
  actions: IntegrationAction[];
  /** Set when connecting has to happen in the browser. */
  connectUrlPath: string | null;
};

export type IntegrationsResponse = {
  integrations: IntegrationDto[];
  canManage: boolean;
};

export const integrationActionSchema = z.object({
  action: z.enum(INTEGRATION_ACTIONS)
});
export type IntegrationActionInput = z.infer<typeof integrationActionSchema>;

export type IntegrationActionResponse = {
  ok: true;
  /** Human-readable outcome, e.g. "Imported 12 contacts from Notion." */
  message: string;
};
