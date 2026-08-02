-- Imported from unit_types.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Unit Types area
--
-- property.unit_types — a reusable unit template (beds/baths/rent). Units
-- reference it via units.unit_type_id (soft uuid). Self-contained + idempotent.
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

create table if not exists property.unit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled unit type',
  bedrooms numeric not null default 0,
  bathrooms numeric not null default 0,
  -- Typical square footage for the type.
  sqft int,
  market_rent numeric not null default 0,
  deposit numeric not null default 0,
  -- Default floor plan for the type (soft uuid).
  floor_plan_id uuid,
  description text,
  -- Active | Inactive | Draft
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.unit_types add column if not exists bedrooms numeric not null default 0;
alter table property.unit_types add column if not exists bathrooms numeric not null default 0;
alter table property.unit_types add column if not exists sqft int;
alter table property.unit_types add column if not exists market_rent numeric not null default 0;
alter table property.unit_types add column if not exists deposit numeric not null default 0;
alter table property.unit_types add column if not exists floor_plan_id uuid;
alter table property.unit_types add column if not exists description text;
alter table property.unit_types add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.unit_types add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.unit_types add column if not exists deleted_at timestamptz;

create index if not exists property_unit_types_status_idx
  on property.unit_types (status) where deleted_at is null;

drop trigger if exists unit_types_touch_updated_at on property.unit_types;
create trigger unit_types_touch_updated_at
before update on property.unit_types
for each row execute function property.touch_updated_at();

alter table property.unit_types enable row level security;
drop policy if exists property_unit_types_demo_all on property.unit_types;
create policy property_unit_types_demo_all on property.unit_types
  for all to anon, authenticated using (true) with check (true);

grant all on property.unit_types to anon, authenticated, service_role;
