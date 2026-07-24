-- ------------------------------------------------------------------ --
-- 0008: Self-serve onboarding — LC identity fields, join requests,     --
--        and per-LC customizable role permissions.                     --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

-- New enum for join-request lifecycle (guarded for partial re-runs)
do $$ begin
  create type join_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ --
-- local_committees: richer identity captured during onboarding        --
-- ------------------------------------------------------------------ --
alter table local_committees add column if not exists state_province text;
alter table local_committees add column if not exists school         text;
alter table local_committees add column if not exists lc_identifier  text;

-- Friendly identifier is unique when set (admins are advised to match EXPA).
create unique index if not exists local_committees_lc_identifier_idx
  on local_committees(lc_identifier) where lc_identifier is not null;

-- ------------------------------------------------------------------ --
-- lc_join_requests (request to join an existing LC, admin-approved)    --
-- ------------------------------------------------------------------ --
create table if not exists lc_join_requests (
  id          uuid                 primary key default gen_random_uuid(),
  lc_id       uuid                 not null references local_committees(id) on delete cascade,
  user_id     uuid                 not null references users(id) on delete cascade,
  status      join_request_status  not null default 'pending',
  message     text,
  decided_by  uuid                 references users(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz          not null default now()
);

create unique index if not exists lc_join_requests_lc_user_idx on lc_join_requests(lc_id, user_id);
create index if not exists lc_join_requests_lc_status_idx on lc_join_requests(lc_id, status);

alter table lc_join_requests enable row level security;

drop policy if exists "members read join requests" on lc_join_requests;
create policy "members read join requests"
on lc_join_requests for select to authenticated
using (public.is_lc_member(lc_id) or user_id = auth.uid());

drop policy if exists "users create own join request" on lc_join_requests;
create policy "users create own join request"
on lc_join_requests for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own join request" on lc_join_requests;
create policy "users update own join request"
on lc_join_requests for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admins manage join requests" on lc_join_requests;
create policy "admins manage join requests"
on lc_join_requests for all to authenticated
using (public.is_lc_admin(lc_id)) with check (public.is_lc_admin(lc_id));

-- ------------------------------------------------------------------ --
-- lc_permission_settings (per-LC position -> capabilities matrix)      --
-- ------------------------------------------------------------------ --
create table if not exists lc_permission_settings (
  lc_id      uuid        primary key references local_committees(id) on delete cascade,
  matrix     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table lc_permission_settings enable row level security;

drop policy if exists "members read permission settings" on lc_permission_settings;
create policy "members read permission settings"
on lc_permission_settings for select to authenticated
using (public.is_lc_member(lc_id));

drop policy if exists "admins manage permission settings" on lc_permission_settings;
create policy "admins manage permission settings"
on lc_permission_settings for all to authenticated
using (public.is_lc_admin(lc_id)) with check (public.is_lc_admin(lc_id));
