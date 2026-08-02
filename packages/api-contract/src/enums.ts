// Enum values mirrored from the Drizzle schema. They live here (rather than
// being imported from @aiesec/db) so the mobile bundle never pulls in
// drizzle-orm/postgres. The `satisfies` checks in apps/web/lib/api/enums.ts
// fail the typecheck if the two ever drift apart.

export const CONTACT_TYPES = ["candidate", "company", "lc_partner", "other"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const FUNNEL_STAGES = [
  "sign_up",
  "applied",
  "matched",
  "approved",
  "realized",
  "finished",
  "completed"
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const PROGRAMMES = ["gt", "ge", "gv", "other"] as const;
export type Programme = (typeof PROGRAMMES)[number];

export const CONTACT_SOURCES = [
  "manual",
  "expa",
  "notion",
  "google_drive",
  "mailgun",
  "meta",
  "import",
  "booking"
] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const CONVERSATION_CHANNELS = ["email", "instagram", "facebook", "whatsapp"] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_STATUSES = ["open", "closed", "snoozed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ["in", "out"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const LC_ROLES = ["owner", "admin", "member"] as const;
export type LcRole = (typeof LC_ROLES)[number];

export const POSITIONS = ["lcp", "lcvp", "team_leader", "member"] as const;
export type Position = (typeof POSITIONS)[number];

export const CAPABILITIES = [
  "manage_members",
  "manage_permissions",
  "manage_lc",
  "manage_integrations",
  "manage_booking",
  "manage_contacts",
  "send_campaigns",
  "view_analytics"
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// ---------------------------------------------------------------- labels --

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  candidate: "Candidate",
  company: "Company",
  lc_partner: "LC Partner",
  other: "Other"
};

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  sign_up: "Sign up",
  applied: "Applied",
  matched: "Matched",
  approved: "Approved",
  realized: "Realized",
  finished: "Finished",
  completed: "Completed"
};

export const PROGRAMME_LABELS: Record<Programme, string> = {
  gt: "Global Talent",
  ge: "Global Entrepreneur",
  gv: "Global Volunteer",
  other: "Other"
};

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  email: "Email",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp"
};

export const POSITION_LABELS: Record<Position, string> = {
  lcp: "LCP",
  lcvp: "LCVP",
  team_leader: "Team Leader",
  member: "Member"
};
