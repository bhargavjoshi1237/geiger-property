-- Imported from buildings.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Buildings & Blocks area
--
-- property.buildings — a physical structure/block within a property. property_id
-- is a soft uuid link. Self-contained + idempotent.
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

create table if not exists property.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled building',
  -- Short block code, e.g. "A" or "Tower 1".
  block_code text,
  property_id uuid,
  floors int not null default 1,
  year_built int,
  -- e.g. Low-rise | Mid-rise | High-rise | Townhome | Garden
  structure_type text,
  -- Wing / section label within the property.
  wing text,
  description text,
  -- Active | Under construction | Inactive | Draft
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.buildings add column if not exists block_code text;
alter table property.buildings add column if not exists property_id uuid;
alter table property.buildings add column if not exists floors int not null default 1;
alter table property.buildings add column if not exists year_built int;
alter table property.buildings add column if not exists structure_type text;
alter table property.buildings add column if not exists wing text;
alter table property.buildings add column if not exists description text;
alter table property.buildings add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.buildings add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.buildings add column if not exists deleted_at timestamptz;

create index if not exists property_buildings_status_idx
  on property.buildings (status) where deleted_at is null;
create index if not exists property_buildings_property_idx
  on property.buildings (property_id) where deleted_at is null;

drop trigger if exists buildings_touch_updated_at on property.buildings;
create trigger buildings_touch_updated_at
before update on property.buildings
for each row execute function property.touch_updated_at();

alter table property.buildings enable row level security;
drop policy if exists property_buildings_demo_all on property.buildings;
create policy property_buildings_demo_all on property.buildings
  for all to anon, authenticated using (true) with check (true);

grant all on property.buildings to anon, authenticated, service_role;
