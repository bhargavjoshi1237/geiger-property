-- Imported from amenities.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Amenities area
--
-- property.amenities — a reusable amenity definition. Attached to properties/
-- units/etc. via property.amenity_links (see property_shared.sql).
-- Self-contained + idempotent.
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

create table if not exists property.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled amenity',
  -- Community | Unit | Building | Outdoor | Parking | Security | Utilities | Accessibility
  category text not null default 'Community',
  -- Where it applies: property | unit | both
  scope text not null default 'both',
  -- Lucide icon name (optional, for display).
  icon text,
  -- none | one-time | monthly
  fee_type text not null default 'none',
  fee_amount numeric not null default 0,
  description text,
  -- Active | Inactive | Draft
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.amenities add column if not exists category text not null default 'Community';
alter table property.amenities add column if not exists scope text not null default 'both';
alter table property.amenities add column if not exists icon text;
alter table property.amenities add column if not exists fee_type text not null default 'none';
alter table property.amenities add column if not exists fee_amount numeric not null default 0;
alter table property.amenities add column if not exists description text;
alter table property.amenities add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.amenities add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.amenities add column if not exists deleted_at timestamptz;

create index if not exists property_amenities_status_idx
  on property.amenities (status) where deleted_at is null;
create index if not exists property_amenities_category_idx
  on property.amenities (category) where deleted_at is null;

drop trigger if exists amenities_touch_updated_at on property.amenities;
create trigger amenities_touch_updated_at
before update on property.amenities
for each row execute function property.touch_updated_at();

alter table property.amenities enable row level security;
drop policy if exists property_amenities_demo_all on property.amenities;
create policy property_amenities_demo_all on property.amenities
  for all to anon, authenticated using (true) with check (true);

grant all on property.amenities to anon, authenticated, service_role;
