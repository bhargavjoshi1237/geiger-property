-- Signals engine and daily briefings (ORCH-06)
--
-- Owns property.signals and property.briefings. The daily `signals` job runs
-- the rule detectors (lib/signals/detectors), upserts each finding by
-- (project_id, dedupe_key), bumps last_seen_at, resolves signals the detectors
-- stop finding and expires stale ones. The `briefings` job writes one row per
-- member per day (unique), so a briefing is pushed at most once a day.
-- Confidence is 'certain' for rules (a 0-1 score once AI arrives).

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

create table if not exists property.signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  detector_key text not null,
  dedupe_key text not null,
  category text not null default 'risk' check (category in ('risk', 'trend', 'watch', 'opportunity')),
  area text not null default 'collections'
    check (area in ('collections', 'leasing', 'maintenance', 'accounting', 'compliance', 'automation')),
  audience_roles text[] not null default '{}',
  urgency text not null default 'soon' check (urgency in ('urgent', 'soon', 'routine')),
  title text not null default '',
  why text not null default '',
  property_id uuid,
  record_refs jsonb not null default '[]'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  impact_amount numeric(14, 2),
  impact_units text,
  previous_impact_amount numeric(14, 2),
  score numeric(16, 2) not null default 0,
  confidence text not null default 'certain',
  completeness numeric(5, 4) not null default 1,
  completeness_note text,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'actioned', 'resolved', 'expired')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  worsened_at timestamptz,
  resolved_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  actioned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists signals_dedupe_idx
  on property.signals (project_id, dedupe_key) nulls not distinct;
create index if not exists signals_open_idx
  on property.signals (project_id, status, score desc)
  where deleted_at is null;

drop trigger if exists signals_touch_updated_at on property.signals;
create trigger signals_touch_updated_at
before update on property.signals
for each row execute function property.touch_updated_at();

alter table property.signals enable row level security;
drop policy if exists signals_demo_all on property.signals;
create policy signals_demo_all on property.signals
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on property.signals to anon, authenticated, service_role;

create table if not exists property.briefings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  member_id uuid,
  user_id uuid,
  email text,
  role_key text,
  date date not null,
  summary jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  email_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists briefings_member_day_idx
  on property.briefings (project_id, member_id, date) nulls not distinct;
create index if not exists briefings_recent_idx
  on property.briefings (project_id, date desc)
  where deleted_at is null;

drop trigger if exists briefings_touch_updated_at on property.briefings;
create trigger briefings_touch_updated_at
before update on property.briefings
for each row execute function property.touch_updated_at();

alter table property.briefings enable row level security;
drop policy if exists briefings_demo_all on property.briefings;
create policy briefings_demo_all on property.briefings
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on property.briefings to anon, authenticated, service_role;

-- @down
drop table if exists property.briefings cascade;
drop table if exists property.signals cascade;
