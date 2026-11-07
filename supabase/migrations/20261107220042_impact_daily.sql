-- Daily impact rollups (ORCH-09)
--
-- Owns property.impact_daily: one value per (project, date, automation,
-- metric), filled nightly by the `impact` job from automation_runs, review
-- items and the ledger so the Impact page stays fast and its history outlives
-- run retention. Metrics: runs, runs_completed, runs_failed, steps_completed,
-- minutes_saved, exceptions_raised, exceptions_resolved, collected_after_run,
-- offers_sent, renewals_accepted (see lib/orchestration/value.js).

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists property.impact_daily (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  date date not null,
  playbook_key text,
  automation_id uuid,
  metric text not null,
  value numeric(16, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists impact_daily_key_idx
  on property.impact_daily (project_id, date, automation_id, metric) nulls not distinct;
create index if not exists impact_daily_range_idx
  on property.impact_daily (project_id, date desc)
  where deleted_at is null;

drop trigger if exists impact_daily_touch_updated_at on property.impact_daily;
create trigger impact_daily_touch_updated_at
before update on property.impact_daily
for each row execute function property.touch_updated_at();

alter table property.impact_daily enable row level security;
drop policy if exists impact_daily_demo_all on property.impact_daily;
create policy impact_daily_demo_all on property.impact_daily
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on property.impact_daily to anon, authenticated, service_role;

-- @down
drop table if exists property.impact_daily cascade;
