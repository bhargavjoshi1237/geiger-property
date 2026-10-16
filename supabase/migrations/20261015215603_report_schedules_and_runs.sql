-- Report schedules and runs
--
-- Owns property.report_schedules (saved report definitions: report key,
-- filters, recipients, frequency) and property.report_runs (one row per
-- schedule × period the scheduled_reports job rendered, holding the summary,
-- CSV and HTML it sent; unique per schedule + period so re-runs never re-send).

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists property.report_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  report_key text not null,
  filters jsonb not null default '{}'::jsonb,
  recipients text[] not null default '{}'::text[],
  frequency text not null default 'monthly',
  day_of_week integer,
  day_of_month integer,
  status text not null default 'Active',
  last_run_at timestamptz,
  last_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint report_schedules_frequency_chk check (frequency in ('daily', 'weekly', 'monthly'))
);
alter table property.report_schedules add column if not exists last_status text;
create index if not exists report_schedules_project_idx on property.report_schedules (project_id) where deleted_at is null;
create index if not exists report_schedules_status_idx on property.report_schedules (status, frequency) where deleted_at is null;

create table if not exists property.report_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  schedule_id uuid references property.report_schedules(id) on delete cascade,
  report_key text not null,
  period_key text not null,
  status text not null default 'sent',
  recipients text[] not null default '{}'::text[],
  sent_count integer not null default 0,
  row_count integer not null default 0,
  summary jsonb not null default '[]'::jsonb,
  csv text,
  html text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists report_runs_schedule_period_idx on property.report_runs (schedule_id, period_key);
create index if not exists report_runs_project_idx on property.report_runs (project_id, created_at desc);

drop trigger if exists report_schedules_touch_updated_at on property.report_schedules;
create trigger report_schedules_touch_updated_at
before update on property.report_schedules
for each row execute function property.touch_updated_at();

drop trigger if exists report_runs_touch_updated_at on property.report_runs;
create trigger report_runs_touch_updated_at
before update on property.report_runs
for each row execute function property.touch_updated_at();

alter table property.report_schedules enable row level security;
alter table property.report_runs enable row level security;

drop policy if exists report_schedules_demo_all on property.report_schedules;
create policy report_schedules_demo_all on property.report_schedules for all to anon, authenticated
  using (true) with check (true);
drop policy if exists report_runs_demo_all on property.report_runs;
create policy report_runs_demo_all on property.report_runs for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on property.report_schedules, property.report_runs
  to anon, authenticated, service_role;

-- @down
drop table if exists property.report_runs cascade;
drop table if exists property.report_schedules cascade;
