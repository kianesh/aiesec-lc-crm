import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const lcRoleEnum = pgEnum("lc_role", ["owner", "admin", "member"]);
export const contactSourceEnum = pgEnum("contact_source", [
  "manual",
  "expa",
  "notion",
  "google_drive",
  "mailgun",
  "meta",
  "import"
]);
export const conversationChannelEnum = pgEnum("conversation_channel", [
  "email",
  "instagram",
  "facebook",
  "whatsapp"
]);
export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);
export const socialPostStatusEnum = pgEnum("social_post_status", [
  "draft",
  "scheduled",
  "published",
  "failed"
]);
export const integrationProviderEnum = pgEnum("integration_provider", [
  "expa",
  "notion",
  "google_drive",
  "mailgun",
  "meta"
]);
export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "disconnected",
  "error"
]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const lcMembers = pgTable("lc_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: lcRoleEnum("role").notNull(),
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

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  source: contactSourceEnum("source").notNull(),
  expaPersonId: text("expa_person_id"),
  notionPageId: text("notion_page_id"),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
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

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  channel: conversationChannelEnum("channel").notNull(),
  externalThreadId: text("external_thread_id"),
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

export const socialPosts = pgTable("social_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  platforms: text("platforms").array().notNull(),
  content: jsonb("content").notNull(),
  mediaUrls: text("media_urls").array().notNull().default([]),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  status: socialPostStatusEnum("status").notNull().default("draft"),
  externalPostIds: jsonb("external_post_ids").notNull().default({})
});

export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  lcId: uuid("lc_id").notNull().references(() => localCommittees.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  audienceSegmentId: uuid("audience_segment_id"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  stats: jsonb("stats").notNull().default({})
});

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
