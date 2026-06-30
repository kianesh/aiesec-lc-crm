-- ------------------------------------------------------------------ --
-- 0004: Appointment booking (public scheduling + Google Calendar)     --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

-- New enum (guarded so a partial prior run does not block re-execution)
do $$ begin
  create type appointment_status as enum ('confirmed', 'cancelled', 'completed', 'no_show');
exception when duplicate_object then null; end $$;

-- Extend existing enums with new values used by the booking flow
alter type contact_source add value if not exists 'booking';
alter type contact_activity_type add value if not exists 'appointment_booked';
alter type contact_activity_type add value if not exists 'appointment_cancelled';

-- ------------------------------------------------------------------ --
-- booking_settings (one public booking config per LC)                 --
-- ------------------------------------------------------------------ --
create table if not exists booking_settings (
  id               uuid        primary key default gen_random_uuid(),
  lc_id            uuid        not null unique references local_committees(id) on delete cascade,
  slug             text        not null unique,
  title            text        not null default 'Book a meeting',
  description      text,
  duration_minutes integer     not null default 30,
  buffer_minutes   integer     not null default 0,
  min_notice_hours integer     not null default 12,
  max_advance_days integer     not null default 30,
  timezone         text        not null default 'UTC',
  calendar_id      text        not null default 'primary',
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table booking_settings enable row level security;

drop policy if exists "members can read booking settings" on booking_settings;
create policy "members can read booking settings"
on booking_settings for select to authenticated
using (public.is_lc_member(lc_id));

drop policy if exists "admins can manage booking settings" on booking_settings;
create policy "admins can manage booking settings"
on booking_settings for all to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

-- ------------------------------------------------------------------ --
-- availability_rules (recurring weekly windows, in booking timezone)  --
-- ------------------------------------------------------------------ --
create table if not exists availability_rules (
  id         uuid        primary key default gen_random_uuid(),
  lc_id      uuid        not null references local_committees(id) on delete cascade,
  weekday    integer     not null,           -- 0=Sunday … 6=Saturday
  start_time text        not null,           -- "HH:MM" 24h, local to booking timezone
  end_time   text        not null,
  created_at timestamptz not null default now()
);

create index if not exists availability_rules_lc_idx on availability_rules(lc_id);

alter table availability_rules enable row level security;

drop policy if exists "members can read availability rules" on availability_rules;
create policy "members can read availability rules"
on availability_rules for select to authenticated
using (public.is_lc_member(lc_id));

drop policy if exists "admins can manage availability rules" on availability_rules;
create policy "admins can manage availability rules"
on availability_rules for all to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

-- ------------------------------------------------------------------ --
-- appointments (booked slots; guest may map to a CRM contact)         --
-- ------------------------------------------------------------------ --
create table if not exists appointments (
  id              uuid               primary key default gen_random_uuid(),
  lc_id           uuid               not null references local_committees(id) on delete cascade,
  contact_id      uuid               references contacts(id) on delete set null,
  guest_name      text               not null,
  guest_email     text               not null,
  guest_phone     text,
  notes           text,
  start_at        timestamptz        not null,
  end_at          timestamptz        not null,
  timezone        text               not null,
  status          appointment_status not null default 'confirmed',
  google_event_id text,
  meet_url        text,
  html_link       text,
  cancel_token    text               not null unique,
  created_at      timestamptz        not null default now(),
  updated_at      timestamptz        not null default now()
);

create index if not exists appointments_lc_start_idx on appointments(lc_id, start_at);

alter table appointments enable row level security;

drop policy if exists "members can read appointments" on appointments;
create policy "members can read appointments"
on appointments for select to authenticated
using (public.is_lc_member(lc_id));

drop policy if exists "admins can manage appointments" on appointments;
create policy "admins can manage appointments"
on appointments for all to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));
