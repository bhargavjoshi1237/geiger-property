-- ===========================================================================
-- Geiger Property — Portfolios area
--
-- property.portfolios — a named collection of properties. Membership is stored
-- on property.properties.portfolio_id (soft uuid). Self-contained + idempotent.
-- ===========================================================================

create extension if not exists pgcrypto;
create schema if not exists property;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists property.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled portfolio',
  description text,
  manager text,
  region text,
  -- Accent color token for the portfolio card/badge.
  color text,
  -- Active | Archived | Draft
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.portfolios add column if not exists description text;
alter table property.portfolios add column if not exists manager text;
alter table property.portfolios add column if not exists region text;
alter table property.portfolios add column if not exists color text;
alter table property.portfolios add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.portfolios add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.portfolios add column if not exists deleted_at timestamptz;

create index if not exists property_portfolios_status_idx
  on property.portfolios (status) where deleted_at is null;

drop trigger if exists portfolios_touch_updated_at on property.portfolios;
create trigger portfolios_touch_updated_at
before update on property.portfolios
for each row execute function property.touch_updated_at();

alter table property.portfolios enable row level security;
drop policy if exists property_portfolios_demo_all on property.portfolios;
create policy property_portfolios_demo_all on property.portfolios
  for all to anon, authenticated using (true) with check (true);

grant all on property.portfolios to anon, authenticated, service_role;
