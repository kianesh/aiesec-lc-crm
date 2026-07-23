-- ------------------------------------------------------------------ --
-- 0007: Appointment types (multiple bookable meeting types per LC)     --
-- Each type drives its own /book/<lcSlug>/<typeSlug> page + duration.   --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).     --
-- ------------------------------------------------------------------ --

-- ------------------------------------------------------------------ --
-- appointment_types (per-LC bookable meeting types)                   --
-- ------------------------------------------------------------------ --
create table if not exists appointment_types (
  id               uuid        primary key default gen_random_uuid(),
  lc_id            uuid        not null references local_committees(id) on delete cascade,
  slug             text        not null,           -- unique within LC
  name             text        not null,
  description      text,
  duration_minutes integer     not null default 30,
  buffer_minutes   integer     not null default 0,
  min_notice_hours integer     not null default 12,
  max_advance_days integer     not null default 30,
  color            text        not null default '#2563eb',
  sort_order       integer     not null default 0,
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists appointment_types_lc_slug_idx on appointment_types(lc_id, slug);
create index if not exists appointment_types_lc_idx on appointment_types(lc_id);

alter table appointment_types enable row level security;

drop policy if exists "members can read appointment types" on appointment_types;
create policy "members can read appointment types"
on appointment_types for select to authenticated
using (public.is_lc_member(lc_id));

drop policy if exists "admins can manage appointment types" on appointment_types;
create policy "admins can manage appointment types"
on appointment_types for all to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

-- ------------------------------------------------------------------ --
-- appointments: remember which type was booked (snapshot the name)    --
-- ------------------------------------------------------------------ --
alter table appointments
  add column if not exists appointment_type_id uuid references appointment_types(id) on delete set null;
alter table appointments
  add column if not exists type_name text;

-- ------------------------------------------------------------------ --
-- Backfill: give every existing booking page a default type so its    --
-- public page keeps working. Seeds "OGX Consultation" (20 min) for     --
-- any LC that has a booking page but no types yet.                     --
-- ------------------------------------------------------------------ --
insert into appointment_types (lc_id, slug, name, description, duration_minutes, buffer_minutes, min_notice_hours, max_advance_days, sort_order, active)
select
  bs.lc_id,
  'ogx-consultation',
  'OGX Consultation',
  'A quick chat about going abroad with AIESEC — programs, timelines and next steps.',
  20,
  bs.buffer_minutes,
  bs.min_notice_hours,
  bs.max_advance_days,
  0,
  true
from booking_settings bs
where not exists (
  select 1 from appointment_types at where at.lc_id = bs.lc_id
);
