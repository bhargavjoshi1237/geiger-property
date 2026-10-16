-- Amenity reservations and resident events
--
-- Owns property.amenity_reservations (bookings of a bookable amenity by a
-- resident, with approval status and fee) and property.resident_events
-- (community events shown on the Amenities community calendar).

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists property.amenity_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  amenity_id uuid,
  amenity_name text,
  tenant_id uuid,
  tenant_name text,
  unit_id uuid,
  unit text,
  starts_at timestamptz,
  ends_at timestamptz,
  guests integer not null default 0,
  status text not null default 'requested',
  fee numeric not null default 0,
  deposit numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists amenity_reservations_amenity_idx on property.amenity_reservations (amenity_id, starts_at);
create index if not exists amenity_reservations_tenant_idx on property.amenity_reservations (tenant_id);
create index if not exists amenity_reservations_project_idx on property.amenity_reservations (project_id);

create table if not exists property.resident_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  property_id uuid,
  property_name text,
  amenity_id uuid,
  amenity_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  description text,
  capacity integer not null default 0,
  status text not null default 'Scheduled',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists resident_events_starts_idx on property.resident_events (starts_at);
create index if not exists resident_events_project_idx on property.resident_events (project_id);

do $$
declare t text;
begin
  foreach t in array array['amenity_reservations', 'resident_events'] loop
    execute format('drop trigger if exists %I on property.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on property.%I for each row execute function property.touch_updated_at()', t || '_touch_updated_at', t);
    execute format('alter table property.%I enable row level security', t);
    execute format('drop policy if exists %I on property.%I', t || '_demo_all', t);
    execute format('create policy %I on property.%I for all to anon, authenticated using (true) with check (true)', t || '_demo_all', t);
    execute format('grant select, insert, update, delete on property.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- @down
drop table if exists property.resident_events cascade;
drop table if exists property.amenity_reservations cascade;
