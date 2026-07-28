-- ------------------------------------------------------------------ --
-- 0009: Custom intake forms before appointment booking                --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

-- Per-type custom questions shown before the booking is confirmed.
alter table appointment_types
  add column if not exists intake_fields jsonb not null default '[]'::jsonb;

-- The guest's answers to those questions, stored on the booked appointment.
alter table appointments
  add column if not exists intake_responses jsonb;
