-- ------------------------------------------------------------------ --
-- 0010: Expo push tokens for the mobile app                           --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

-- One row per (user, device, LC). The app registers its Expo push token on
-- launch; the server fans out notifications to every non-disabled token that
-- belongs to a member of the LC an event happened in.
create table if not exists device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lc_id uuid references local_committees(id) on delete cascade,
  token text not null,
  platform text not null,
  device_name text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- A physical device holds exactly one Expo token, so the token is the natural
-- key: re-registering after a reinstall updates the row instead of duplicating.
create unique index if not exists device_push_tokens_token_idx
  on device_push_tokens (token);

create index if not exists device_push_tokens_user_idx
  on device_push_tokens (user_id);

create index if not exists device_push_tokens_lc_idx
  on device_push_tokens (lc_id);

alter table device_push_tokens enable row level security;

-- Tokens are written by the mobile API using the pooled service connection,
-- but a user must never be able to read or delete somebody else's device.
drop policy if exists "users can read their own push tokens" on device_push_tokens;
create policy "users can read their own push tokens"
on device_push_tokens for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can register their own push tokens" on device_push_tokens;
create policy "users can register their own push tokens"
on device_push_tokens for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update their own push tokens" on device_push_tokens;
create policy "users can update their own push tokens"
on device_push_tokens for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can delete their own push tokens" on device_push_tokens;
create policy "users can delete their own push tokens"
on device_push_tokens for delete
to authenticated
using (user_id = auth.uid());
