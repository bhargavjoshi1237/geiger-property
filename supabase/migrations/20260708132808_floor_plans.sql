-- Imported from floor_plans.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Floor Plans area
--
-- property.floor_plans — a reusable floor plan with an uploaded drawing. Linked
-- to units (units.floor_plan_id) and to properties/buildings via
-- property.floor_plan_links (see property_shared.sql). Self-contained + idempotent.
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

create table if not exists property.floor_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled floor plan',
  bedrooms numeric not null default 0,
  bathrooms numeric not null default 0,
  sqft int,
  -- Free-text dimensions, e.g. "24' x 32'".
  dimensions text,
  -- Public URL of the plan drawing (image/PDF), persisted not the path.
  image_url text,
  -- Optional owning property (soft uuid).
  property_id uuid,
  description text,
  -- Active | Draft | Archived
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.floor_plans add column if not exists bedrooms numeric not null default 0;
alter table property.floor_plans add column if not exists bathrooms numeric not null default 0;
alter table property.floor_plans add column if not exists sqft int;
alter table property.floor_plans add column if not exists dimensions text;
alter table property.floor_plans add column if not exists image_url text;
alter table property.floor_plans add column if not exists property_id uuid;
alter table property.floor_plans add column if not exists description text;
alter table property.floor_plans add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.floor_plans add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.floor_plans add column if not exists deleted_at timestamptz;

create index if not exists property_floor_plans_status_idx
  on property.floor_plans (status) where deleted_at is null;

drop trigger if exists floor_plans_touch_updated_at on property.floor_plans;
create trigger floor_plans_touch_updated_at
before update on property.floor_plans
for each row execute function property.touch_updated_at();

alter table property.floor_plans enable row level security;
drop policy if exists property_floor_plans_demo_all on property.floor_plans;
create policy property_floor_plans_demo_all on property.floor_plans
  for all to anon, authenticated using (true) with check (true);

grant all on property.floor_plans to anon, authenticated, service_role;
