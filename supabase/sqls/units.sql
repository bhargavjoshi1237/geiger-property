-- ===========================================================================
-- Geiger Property — Units area
--
-- property.units — one row per individual unit. Cross-area references
-- (property_id, building_id, unit_type_id, floor_plan_id, tenant_id) are soft
-- uuids. Self-contained + idempotent.
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

create table if not exists property.units (
  id uuid primary key default gen_random_uuid(),
  -- Unit label / number, e.g. "4B".
  label text not null default 'Unit',
  property_id uuid,
  building_id uuid,
  unit_type_id uuid,
  floor_plan_id uuid,
  floor text,
  bedrooms numeric not null default 0,
  bathrooms numeric not null default 0,
  sqft int,
  rent numeric not null default 0,
  deposit numeric not null default 0,
  -- Occupied | Vacant | Notice | Make-ready | Down | Draft
  status text not null default 'Vacant',
  -- Denormalized occupancy for display; tenant_id soft-links property.tenants.
  occupant_name text,
  tenant_id uuid,
  lease_start date,
  lease_end date,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.units add column if not exists property_id uuid;
alter table property.units add column if not exists building_id uuid;
alter table property.units add column if not exists unit_type_id uuid;
alter table property.units add column if not exists floor_plan_id uuid;
alter table property.units add column if not exists floor text;
alter table property.units add column if not exists bedrooms numeric not null default 0;
alter table property.units add column if not exists bathrooms numeric not null default 0;
alter table property.units add column if not exists sqft int;
alter table property.units add column if not exists rent numeric not null default 0;
alter table property.units add column if not exists deposit numeric not null default 0;
alter table property.units add column if not exists occupant_name text;
alter table property.units add column if not exists tenant_id uuid;
alter table property.units add column if not exists lease_start date;
alter table property.units add column if not exists lease_end date;
alter table property.units add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.units add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.units add column if not exists deleted_at timestamptz;

create index if not exists property_units_status_idx
  on property.units (status) where deleted_at is null;
create index if not exists property_units_property_idx
  on property.units (property_id) where deleted_at is null;
create index if not exists property_units_building_idx
  on property.units (building_id) where deleted_at is null;
create index if not exists property_units_type_idx
  on property.units (unit_type_id) where deleted_at is null;
create index if not exists property_units_floor_plan_idx
  on property.units (floor_plan_id) where deleted_at is null;

drop trigger if exists units_touch_updated_at on property.units;
create trigger units_touch_updated_at
before update on property.units
for each row execute function property.touch_updated_at();

alter table property.units enable row level security;
drop policy if exists property_units_demo_all on property.units;
create policy property_units_demo_all on property.units
  for all to anon, authenticated using (true) with check (true);

grant all on property.units to anon, authenticated, service_role;
