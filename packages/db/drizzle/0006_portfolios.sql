-- ------------------------------------------------------------------ --
-- 0006: LC functional portfolios (B2C / oGV / oGT / Finance / TM)      --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

do $$ begin
  create type lc_portfolio as enum ('b2c', 'ogv', 'ogt', 'finance', 'tm');
exception when duplicate_object then null; end $$;

-- Portfolio on membership (null = LCP, who oversees all portfolios).
alter table lc_members
  add column if not exists portfolio lc_portfolio;
