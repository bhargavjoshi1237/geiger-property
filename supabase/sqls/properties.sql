-- ===========================================================================
-- Geiger Property — Properties area
--
-- property.properties — one row per property (building or standalone unit set).
-- Self-contained + idempotent. The `property` schema must be exposed in Supabase
-- → Settings → API → Exposed schemas (see init.sql), else PostgREST returns
-- PGRST106. Cross-area references (portfolio_id) are soft uuids, not hard FKs.
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

create table if not exists property.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled property',
  address text,
  city text,
  state text,
  zip text,
  -- Single-family | Multi-family | Apartment | Condo | Commercial
  type text not null default 'Multi-family',
  -- Active | Vacant | Maintenance | Off-market | Draft
  status text not null default 'Draft',
  -- Portfolio this property belongs to (property.portfolios). Soft link.
  portfolio_id uuid,
  year_built int,
  description text,
  -- Public cover image URL (persisted, not the storage path).
  cover_url text,
  -- Denormalized unit count for list/stat display.
  unit_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.properties add column if not exists address text;
alter table property.properties add column if not exists city text;
alter table property.properties add column if not exists state text;
alter table property.properties add column if not exists zip text;
alter table property.properties add column if not exists portfolio_id uuid;
alter table property.properties add column if not exists year_built int;
alter table property.properties add column if not exists description text;
alter table property.properties add column if not exists cover_url text;
alter table property.properties add column if not exists unit_count int not null default 0;
alter table property.properties add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.properties add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.properties add column if not exists deleted_at timestamptz;

create index if not exists property_properties_status_idx
  on property.properties (status) where deleted_at is null;
create index if not exists property_properties_portfolio_idx
  on property.properties (portfolio_id) where deleted_at is null;

drop trigger if exists properties_touch_updated_at on property.properties;
create trigger properties_touch_updated_at
before update on property.properties
for each row execute function property.touch_updated_at();

alter table property.properties enable row level security;
drop policy if exists property_properties_demo_all on property.properties;
create policy property_properties_demo_all on property.properties
  for all to anon, authenticated using (true) with check (true);

grant all on property.properties to anon, authenticated, service_role;
