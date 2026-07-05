-- ------------------------------------------------------------------ --
-- 0005: Org hierarchy (LCP/LCVP/TL/member) + reports-to + profile      --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

do $$ begin
  create type lc_position as enum ('lcp', 'lcvp', 'team_leader', 'member');
exception when duplicate_object then null; end $$;

-- Organizational fields on membership (permission `role` is unchanged).
alter table lc_members
  add column if not exists position   lc_position not null default 'member',
  add column if not exists team        text,
  add column if not exists manager_id  uuid references lc_members(id) on delete set null;

-- Seed a sensible default position from the existing permission role so the
-- org chart isn't empty on first load (owners -> LCP, admins -> LCVP).
update lc_members set position = 'lcp'  where role = 'owner' and position = 'member';
update lc_members set position = 'lcvp' where role = 'admin' and position = 'member';

-- Profile fields on users.
alter table users
  add column if not exists phone text,
  add column if not exists title text,
  add column if not exists bio   text;
