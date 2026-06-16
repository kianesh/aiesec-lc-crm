-- ------------------------------------------------------------------ --
-- 0003: Contacts, smart lists, marketing hub, conversations refresh  --
-- Run via Supabase SQL editor or psql                                --
-- ------------------------------------------------------------------ --

-- New enums
create type contact_type as enum ('candidate', 'company', 'lc_partner', 'other');
create type funnel_stage as enum ('sign_up', 'applied', 'matched', 'approved', 'realized', 'finished', 'completed');
create type programme as enum ('gt', 'ge', 'gv', 'other');
create type conversation_status as enum ('open', 'closed', 'snoozed');
create type email_campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'failed');
create type contact_activity_type as enum (
  'created', 'updated', 'stage_changed', 'note_added',
  'email_sent', 'expa_synced', 'tag_added', 'tag_removed', 'conversation_started'
);

-- Add resend to integration_provider enum
alter type integration_provider add value if not exists 'resend';

-- ------------------------------------------------------------------ --
-- Alter contacts: add new columns                                     --
-- ------------------------------------------------------------------ --
alter table contacts
  add column if not exists type          contact_type  not null default 'candidate',
  add column if not exists funnel_stage  funnel_stage,
  add column if not exists programme     programme,
  add column if not exists nationality   text,
  add column if not exists home_committee_id text,
  add column if not exists updated_at    timestamptz   not null default now();

-- ------------------------------------------------------------------ --
-- custom_field_defs                                                   --
-- ------------------------------------------------------------------ --
create table if not exists custom_field_defs (
  id             uuid        primary key default gen_random_uuid(),
  lc_id          uuid        not null references local_committees(id) on delete cascade,
  name           text        not null,
  key            text        not null,
  field_type     text        not null,
  options        jsonb       not null default '[]'::jsonb,
  required       boolean     not null default false,
  display_order  integer     not null default 0,
  created_at     timestamptz not null default now()
);

alter table custom_field_defs enable row level security;

create policy "members can read custom field defs"
on custom_field_defs for select to authenticated
using (public.is_lc_member(lc_id));

create policy "admins can manage custom field defs"
on custom_field_defs for all to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

-- ------------------------------------------------------------------ --
-- contact_activities                                                  --
-- ------------------------------------------------------------------ --
create table if not exists contact_activities (
  id          uuid                 primary key default gen_random_uuid(),
  contact_id  uuid                 not null references contacts(id) on delete cascade,
  lc_id       uuid                 not null references local_committees(id) on delete cascade,
  type        contact_activity_type not null,
  metadata    jsonb                not null default '{}'::jsonb,
  created_by  uuid                 references users(id) on delete set null,
  created_at  timestamptz          not null default now()
);

create index if not exists contact_activities_contact_idx
  on contact_activities(contact_id, created_at desc);

alter table contact_activities enable row level security;

create policy "members can read contact activities"
on contact_activities for select to authenticated
using (public.is_lc_member(lc_id));

create policy "members can insert contact activities"
on contact_activities for insert to authenticated
with check (public.is_lc_member(lc_id));

-- ------------------------------------------------------------------ --
-- smart_lists                                                         --
-- ------------------------------------------------------------------ --
create table if not exists smart_lists (
  id          uuid        primary key default gen_random_uuid(),
  lc_id       uuid        not null references local_committees(id) on delete cascade,
  name        text        not null,
  description text,
  filters     jsonb       not null default '{}'::jsonb,
  created_by  uuid        references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table smart_lists enable row level security;

create policy "members can read smart lists"
on smart_lists for select to authenticated
using (public.is_lc_member(lc_id));

create policy "admins can manage smart lists"
on smart_lists for all to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

-- ------------------------------------------------------------------ --
-- Alter conversations: add status + participant fields                --
-- ------------------------------------------------------------------ --
alter table conversations
  add column if not exists status                  conversation_status not null default 'open',
  add column if not exists participant_name        text,
  add column if not exists participant_external_id text;

-- make contact_id nullable (Meta conversations may arrive before contact is linked)
alter table conversations
  alter column contact_id drop not null;

-- ------------------------------------------------------------------ --
-- Alter social_posts: add title, createdBy, timestamps               --
-- ------------------------------------------------------------------ --
alter table social_posts
  add column if not exists title      text,
  add column if not exists created_by uuid references users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------------ --
-- Alter email_campaigns: add name, status, from fields, createdBy    --
-- ------------------------------------------------------------------ --
alter table email_campaigns
  add column if not exists name       text        not null default '',
  add column if not exists from_name  text        not null default 'AIESEC',
  add column if not exists from_email text        not null default '',
  add column if not exists status     email_campaign_status not null default 'draft',
  add column if not exists created_by uuid        references users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Wire audience_segment_id FK now that smart_lists exists
alter table email_campaigns
  add constraint fk_email_campaigns_audience_segment
  foreign key (audience_segment_id) references smart_lists(id) on delete set null;

-- ------------------------------------------------------------------ --
-- email_campaign_recipients                                           --
-- ------------------------------------------------------------------ --
create table if not exists email_campaign_recipients (
  id                uuid        primary key default gen_random_uuid(),
  campaign_id       uuid        not null references email_campaigns(id) on delete cascade,
  contact_id        uuid        references contacts(id) on delete set null,
  email             text        not null,
  status            text        not null default 'pending',
  resend_message_id text,
  sent_at           timestamptz,
  opened_at         timestamptz,
  bounced_at        timestamptz
);

create index if not exists email_campaign_recipients_campaign_idx
  on email_campaign_recipients(campaign_id);

alter table email_campaign_recipients enable row level security;

create policy "members can read campaign recipients"
on email_campaign_recipients for select to authenticated
using (
  exists (
    select 1 from email_campaigns ec
    where ec.id = campaign_id
      and public.is_lc_member(ec.lc_id)
  )
);

create policy "admins can manage campaign recipients"
on email_campaign_recipients for all to authenticated
using (
  exists (
    select 1 from email_campaigns ec
    where ec.id = campaign_id
      and public.is_lc_admin(ec.lc_id)
  )
)
with check (
  exists (
    select 1 from email_campaigns ec
    where ec.id = campaign_id
      and public.is_lc_admin(ec.lc_id)
  )
);
