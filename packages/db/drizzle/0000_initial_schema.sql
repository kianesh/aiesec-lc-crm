create extension if not exists "pgcrypto";

create type lc_role as enum ('owner', 'admin', 'member');
create type contact_source as enum ('manual', 'expa', 'notion', 'google_drive', 'mailgun', 'meta', 'import');
create type conversation_channel as enum ('email', 'instagram', 'facebook', 'whatsapp');
create type message_direction as enum ('in', 'out');
create type social_post_status as enum ('draft', 'scheduled', 'published', 'failed');
create type integration_provider as enum ('expa', 'notion', 'google_drive', 'mailgun', 'meta');
create type integration_status as enum ('connected', 'disconnected', 'error');

create table local_committees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  expa_committee_id text,
  brand_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table lc_members (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role lc_role not null,
  invited_by uuid references users(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique (lc_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  email text not null,
  role lc_role not null,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  source contact_source not null,
  expa_person_id text,
  notion_page_id text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag text not null,
  primary key (contact_id, tag)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel conversation_channel not null,
  external_thread_id text,
  assigned_to uuid references users(id) on delete set null,
  last_message_at timestamptz,
  unread_count integer not null default 0
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction message_direction not null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null,
  external_message_id text
);

create table social_posts (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  platforms text[] not null,
  content jsonb not null,
  media_urls text[] not null default '{}',
  scheduled_for timestamptz,
  status social_post_status not null default 'draft',
  external_post_ids jsonb not null default '{}'::jsonb
);

create table email_campaigns (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  subject text not null,
  body_html text not null,
  audience_segment_id uuid,
  scheduled_for timestamptz,
  sent_at timestamptz,
  stats jsonb not null default '{}'::jsonb
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  provider integration_provider not null,
  credentials_encrypted text not null,
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  status integration_status not null default 'disconnected',
  unique (lc_id, provider)
);

create table expa_sync_state (
  lc_id uuid primary key references local_committees(id) on delete cascade,
  last_full_sync timestamptz,
  last_delta_sync timestamptz,
  cursor text
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index lc_members_user_id_idx on lc_members(user_id);
create index invitations_lc_id_idx on invitations(lc_id);
create index contacts_lc_id_idx on contacts(lc_id);
create index contacts_email_idx on contacts(email);
create index conversations_lc_id_idx on conversations(lc_id);
create index conversations_contact_id_idx on conversations(contact_id);
create index messages_conversation_id_idx on messages(conversation_id);
create index social_posts_lc_id_idx on social_posts(lc_id);
create index email_campaigns_lc_id_idx on email_campaigns(lc_id);
create index integrations_lc_id_idx on integrations(lc_id);
create index audit_log_lc_id_idx on audit_log(lc_id);

alter table local_committees enable row level security;
alter table users enable row level security;
alter table lc_members enable row level security;
alter table invitations enable row level security;
alter table contacts enable row level security;
alter table contact_tags enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table social_posts enable row level security;
alter table email_campaigns enable row level security;
alter table integrations enable row level security;
alter table expa_sync_state enable row level security;
alter table audit_log enable row level security;
