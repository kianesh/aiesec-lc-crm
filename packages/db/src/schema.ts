import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";

// ------------------------------------------------------------------ #
// Enums                                                               #
// ------------------------------------------------------------------ #

// Permission role — drives access control / RLS.
export const lcRoleEnum = pgEnum("lc_role", ["owner", "admin", "member"]);

// AIESEC organizational position — display + org-chart hierarchy (independent
// of the permission role above).
export const lcPositionEnum = pgEnum("lc_position", [
  "lcp",          // Local Committee President
  "lcvp",         // Vice President (of a function)
  "team_leader",  // TL
  "member"
]);

export const contactSourceEnum = pgEnum("contact_source", [
  "manual",
  "expa",
  "notion",
  "google_drive",
  "mailgun",
  "meta",
  "import",
  "booking"
]);

export const contactTypeEnum = pgEnum("contact_type", [
  "candidate",   // Exchange Participant (EP) — outgoing student/professional
  "company",     // TN host — company hiring for GT or GE
  "lc_partner",  // Another AIESEC LC handling incoming exchange
  "other"
]);

export const funnelStageEnum = pgEnum("funnel_stage", [
  "sign_up",
  "applied",
  "matched",
  "approved",
  "realized",
  "finished",
  "completed"
]);

export const programmeEnum = pgEnum("programme", [
  "gt",    // Global Talent (programme 1)
  "ge",    // Global Entrepreneur (programme 2)
  "gv",    // Global Volunteer (programme 5)
  "other"
]);

export const conversationChannelEnum = pgEnum("conversation_channel", [
  "email",
  "instagram",
  "facebook",
  "whatsapp"
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "closed",
  "snoozed"
]);

export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);

export const socialPostStatusEnum = pgEnum("social_post_status", [
  "draft",
  "scheduled",
  "published",
  "failed"
]);

export const emailCampaignStatusEnum = pgEnum("email_campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed"
]);

export const contactActivityTypeEnum = pgEnum("contact_activity_type", [
  "created",
  "updated",
  "stage_changed",
  "note_added",
  "email_sent",
  "expa_synced",
  "tag_added",
  "tag_removed",
  "conversation_started",
  "appointment_booked",
  "appointment_cancelled"
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "confirmed",
  "cancelled",
  "completed",
  "no_show"
]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "expa",
  "notion",
  "google_drive",
  "mailgun",
  "meta",
  "resend"
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "disconnected",
  "error"
]);

// ------------------------------------------------------------------ #
// Core identity tables                                                #
// ------------------------------------------------------------------ #

export const localCommittees = pgTable("local_committees", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  expaCommitteeId: text("expa_committee_id"),
  brandConfig: jsonb("brand_config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  title: text("title"), // free-text role/headline shown on the profile
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const lcMembers = pgTable("lc_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: lcRoleEnum("role").notNull(),
  position: lcPositionEnum("position").notNull().default("member"),
  team: text("team"), // functional area, e.g. "oGV", "Marketing", "Finance"
  // Reports-to link (self-reference) that builds the org chart.
  managerId: uuid("manager_id").references((): AnyPgColumn => lcMembers.id, { onDelete: "set null" }),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow()
});

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: lcRoleEnum("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
});

// ------------------------------------------------------------------ #
// Contacts                                                            #
// ------------------------------------------------------------------ #

export const customFieldDefs = pgTable("custom_field_defs", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  key: text("key").notNull(),
  fieldType: text("field_type").notNull(), // text | number | date | select | multiselect | boolean | url
  options: jsonb("options").notNull().default([]),
  required: boolean("required").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  type: contactTypeEnum("type").notNull().default("candidate"),
  funnelStage: funnelStageEnum("funnel_stage"),
  programme: programmeEnum("programme"),
  nationality: text("nationality"),
  homeCommitteeId: text("home_committee_id"),
  source: contactSourceEnum("source").notNull(),
  expaPersonId: text("expa_person_id"),
  notionPageId: text("notion_page_id"),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    tag: text("tag").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contactId, table.tag] })
  })
);

export const contactActivities = pgTable(
  "contact_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
    type: contactActivityTypeEnum("type").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    contactIdx: index("contact_activities_contact_idx").on(table.contactId, table.createdAt)
  })
);

// ------------------------------------------------------------------ #
// Smart lists (saved contact filters, used as campaign audiences)     #
// ------------------------------------------------------------------ #

export const smartLists = pgTable("smart_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  filters: jsonb("filters").notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ------------------------------------------------------------------ #
// Conversations & messages (Meta + email threads)                     #
// ------------------------------------------------------------------ #

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  channel: conversationChannelEnum("channel").notNull(),
  status: conversationStatusEnum("status").notNull().default("open"),
  externalThreadId: text("external_thread_id"),
  participantName: text("participant_name"),
  participantExternalId: text("participant_external_id"),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  unreadCount: integer("unread_count").notNull().default(0)
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  direction: messageDirectionEnum("direction").notNull(),
  body: text("body").notNull(),
  attachments: jsonb("attachments").notNull().default([]),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  externalMessageId: text("external_message_id")
});

// ------------------------------------------------------------------ #
// Social planner                                                      #
// ------------------------------------------------------------------ #

export const socialPosts = pgTable("social_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  title: text("title"),
  platforms: text("platforms").array().notNull(),
  content: jsonb("content").notNull(),
  mediaUrls: text("media_urls").array().notNull().default([]),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  status: socialPostStatusEnum("status").notNull().default("draft"),
  externalPostIds: jsonb("external_post_ids").notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ------------------------------------------------------------------ #
// Email campaigns                                                     #
// ------------------------------------------------------------------ #

export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  fromName: text("from_name").notNull().default("AIESEC"),
  fromEmail: text("from_email").notNull().default(""),
  status: emailCampaignStatusEnum("status").notNull().default("draft"),
  audienceSegmentId: uuid("audience_segment_id").references(() => smartLists.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  stats: jsonb("stats").notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const emailCampaignRecipients = pgTable(
  "email_campaign_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id").notNull().references(() => emailCampaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"), // pending | sent | delivered | opened | clicked | bounced | complained
    resendMessageId: text("resend_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true })
  },
  (table) => ({
    campaignIdx: index("email_campaign_recipients_campaign_idx").on(table.campaignId)
  })
);

// ------------------------------------------------------------------ #
// Appointment booking                                                 #
// ------------------------------------------------------------------ #

// One public booking configuration per LC (single shared calendar model).
export const bookingSettings = pgTable("booking_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().unique().references(() => localCommittees.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(), // public URL: /book/<slug>
  title: text("title").notNull().default("Book a meeting"),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  minNoticeHours: integer("min_notice_hours").notNull().default(12),
  maxAdvanceDays: integer("max_advance_days").notNull().default(30),
  timezone: text("timezone").notNull().default("UTC"), // IANA tz, e.g. "America/Toronto"
  calendarId: text("calendar_id").notNull().default("primary"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// Recurring weekly availability windows, expressed in the booking timezone.
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0=Sunday … 6=Saturday (JS getDay)
    startTime: text("start_time").notNull(), // "HH:MM" 24h, local to booking timezone
    endTime: text("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    lcIdx: index("availability_rules_lc_idx").on(table.lcId)
  })
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone"),
    notes: text("notes"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    status: appointmentStatusEnum("status").notNull().default("confirmed"),
    googleEventId: text("google_event_id"),
    meetUrl: text("meet_url"),
    htmlLink: text("html_link"),
    cancelToken: text("cancel_token").notNull().unique(), // public manage/cancel link
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    lcStartIdx: index("appointments_lc_start_idx").on(table.lcId, table.startAt)
  })
);

// ------------------------------------------------------------------ #
// Integrations & EXPA                                                 #
// ------------------------------------------------------------------ #

export const integrations = pgTable("integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  provider: integrationProviderEnum("provider").notNull(),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  config: jsonb("config").notNull().default({}),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  status: integrationStatusEnum("status").notNull().default("disconnected")
});

export const expaSyncState = pgTable("expa_sync_state", {
  lcId: uuid("lc_id").primaryKey().references(() => localCommittees.id, { onDelete: "cascade" }),
  lastFullSync: timestamp("last_full_sync", { withTimezone: true }),
  lastDeltaSync: timestamp("last_delta_sync", { withTimezone: true }),
  cursor: text("cursor")
});

export const expaAnalyticsSnapshots = pgTable(
  "expa_analytics_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    summary: jsonb("summary").notNull().default({}),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    lcCreatedAtIdx: index("expa_analytics_snapshots_lc_created_at_idx").on(table.lcId, table.createdAt)
  })
);

// ------------------------------------------------------------------ #
// Audit log                                                           #
// ------------------------------------------------------------------ #

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
