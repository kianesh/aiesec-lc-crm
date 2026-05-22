create table expa_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references local_committees(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index expa_analytics_snapshots_lc_created_at_idx
on expa_analytics_snapshots(lc_id, created_at desc);

alter table expa_analytics_snapshots enable row level security;

create policy "members can read expa analytics snapshots"
on expa_analytics_snapshots for select
to authenticated
using (public.is_lc_member(lc_id));

create policy "admins can manage expa analytics snapshots"
on expa_analytics_snapshots for all
to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));
