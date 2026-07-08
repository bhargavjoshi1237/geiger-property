-- ===========================================================================
-- Geiger Property — Tenants area
--
-- Self-contained and idempotent: safe to run repeatedly. Backs the entire
-- Tenants sidebar group:
--   property.tenants              — one row per resident/applicant (the core
--                                   Tenant record: contact, unit, status,
--                                   balance, household link…).
--   property.tenant_households    — households (Household & Occupants sub-item).
--                                   One row per household, headed by a tenant.
--   property.tenant_occupants     — people in a household (Occupants child list).
--   property.tenant_documents      — tenant documents (Documents sub-item).
--   property.tenant_communications  — tenant communication log (Communication
--                                   Log sub-item).
--
-- The `property` schema must be exposed in Supabase → Settings → API → Exposed
-- schemas (see init.sql), else PostgREST returns PGRST106 "Invalid schema".
-- Shared updated_at trigger is declared locally (don't depend on another migration).
-- RLS is open demo (anon/authenticated) and replaced with org-scoped policy
-- when auth lands. No demo seed — screens render an empty state.
-- ===========================================================================

create extension if not exists pgcrypto;
create schema if not exists property;

-- Shared updated_at trigger fn (declared locally so this file stands alone).
create or replace function property.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tenants — one row per resident / applicant.
-- ---------------------------------------------------------------------------
create table if not exists property.tenants (
  id uuid primary key default gen_random_uuid(),
  -- Full name of the tenant/resident.
  name text not null default 'Untitled tenant',
  email text,
  phone text,
  -- Denormalized unit label for display ("Maple Court · 4B").
  unit text,
  -- Soft link to a property (property.properties is added by that area).
  property_id uuid,
  -- Household this tenant belongs to (property.tenant_households).
  household_id uuid,
  -- Current | Applicant | Late | Past | Draft
  status text not null default 'Applicant',
  -- Outstanding balance in cents? No — store major units (dollars).
  balance numeric not null default 0,
  -- Move-in / move-out dates (null = not set).
  lease_start date,
  lease_end date,
  -- Resident portal enabled + last-seen (Resident Portal sub-item).
  portal_enabled boolean not null default false,
  portal_last_seen timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  -- Expansion bag: screening results, insurance, notices, etc.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.tenants add column if not exists email text;
alter table property.tenants add column if not exists phone text;
alter table property.tenants add column if not exists unit text;
alter table property.tenants add column if not exists property_id uuid;
alter table property.tenants add column if not exists household_id uuid;
alter table property.tenants add column if not exists balance numeric not null default 0;
alter table property.tenants add column if not exists lease_start date;
alter table property.tenants add column if not exists lease_end date;
alter table property.tenants add column if not exists portal_enabled boolean not null default false;
alter table property.tenants add column if not exists portal_last_seen timestamptz;
alter table property.tenants add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.tenants add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.tenants add column if not exists deleted_at timestamptz;

create index if not exists property_tenants_status_idx
  on property.tenants (status) where deleted_at is null;
create index if not exists property_tenants_household_idx
  on property.tenants (household_id) where deleted_at is null;

drop trigger if exists tenants_touch_updated_at on property.tenants;
create trigger tenants_touch_updated_at
before update on property.tenants
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_households — households & occupants (Household & Occupants sub-item).
-- ---------------------------------------------------------------------------
create table if not exists property.tenant_households (
  id uuid primary key default gen_random_uuid(),
  -- Household display name (e.g. "The Blake Household").
  name text not null default 'Household',
  -- Head-of-household tenant (property.tenants).
  primary_tenant_id uuid references property.tenants(id) on delete set null,
  property_id uuid,
  -- Number of occupants (mirror of rows in tenant_households' occupants bag).
  occupant_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.tenant_households add column if not exists primary_tenant_id uuid references property.tenants(id) on delete set null;
alter table property.tenant_households add column if not exists property_id uuid;
alter table property.tenant_households add column if not exists occupant_count int not null default 0;
alter table property.tenant_households add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.tenant_households add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.tenant_households add column if not exists deleted_at timestamptz;

create index if not exists property_households_tenant_idx
  on property.tenant_households (primary_tenant_id) where deleted_at is null;

drop trigger if exists tenant_households_touch_updated_at on property.tenant_households;
create trigger tenant_households_touch_updated_at
before update on property.tenant_households
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_occupants — one row per person in a household (Household & Occupants
-- editor → Occupants child list).
-- ---------------------------------------------------------------------------
create table if not exists property.tenant_occupants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references property.tenant_households(id) on delete cascade,
  name text not null default 'Occupant',
  -- Relationship to the primary tenant (Spouse, Child, Roommate…).
  relationship text,
  age int,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.tenant_occupants add column if not exists relationship text;
alter table property.tenant_occupants add column if not exists age int;
alter table property.tenant_occupants add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.tenant_occupants add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.tenant_occupants add column if not exists deleted_at timestamptz;

create index if not exists property_occupants_household_idx
  on property.tenant_occupants (household_id) where deleted_at is null;

drop trigger if exists tenant_occupants_touch_updated_at on property.tenant_occupants;
create trigger tenant_occupants_touch_updated_at
before update on property.tenant_occupants
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_documents — tenant documents (Documents sub-item).
-- ---------------------------------------------------------------------------
create table if not exists property.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references property.tenants(id) on delete cascade,
  -- lease | id | income | background | notice | other
  kind text not null default 'other',
  name text not null default 'Document',
  -- Public storage URL (persisted, not the storage path).
  url text,
  -- Size in bytes.
  size_bytes bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.tenant_documents add column if not exists kind text not null default 'other';
alter table property.tenant_documents add column if not exists name text not null default 'Document';
alter table property.tenant_documents add column if not exists url text;
alter table property.tenant_documents add column if not exists size_bytes bigint not null default 0;
alter table property.tenant_documents add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.tenant_documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.tenant_documents add column if not exists deleted_at timestamptz;

create index if not exists property_tenant_docs_tenant_idx
  on property.tenant_documents (tenant_id) where deleted_at is null;

drop trigger if exists tenant_documents_touch_updated_at on property.tenant_documents;
create trigger tenant_documents_touch_updated_at
before update on property.tenant_documents
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_communications — tenant communication log (Communication Log sub-item).
-- ---------------------------------------------------------------------------
create table if not exists property.tenant_communications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references property.tenants(id) on delete cascade,
  -- email | sms | call | note | portal
  channel text not null default 'email',
  -- inbound | outbound
  direction text not null default 'outbound',
  subject text,
  body text,
  -- When the message was sent/received.
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.tenant_communications add column if not exists channel text not null default 'email';
alter table property.tenant_communications add column if not exists direction text not null default 'outbound';
alter table property.tenant_communications add column if not exists subject text;
alter table property.tenant_communications add column if not exists body text;
alter table property.tenant_communications add column if not exists occurred_at timestamptz not null default now();
alter table property.tenant_communications add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.tenant_communications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.tenant_communications add column if not exists deleted_at timestamptz;

create index if not exists property_tenant_comm_tenant_idx
  on property.tenant_communications (tenant_id) where deleted_at is null;

drop trigger if exists tenant_communications_touch_updated_at on property.tenant_communications;
create trigger tenant_communications_touch_updated_at
before update on property.tenant_communications
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Open demo policies (anon key) — replaced with org-scoped member policies
-- when auth lands.
-- ---------------------------------------------------------------------------
alter table property.tenants enable row level security;
alter table property.tenant_households enable row level security;
alter table property.tenant_occupants enable row level security;
alter table property.tenant_documents enable row level security;
alter table property.tenant_communications enable row level security;

drop policy if exists property_tenants_demo_all on property.tenants;
create policy property_tenants_demo_all on property.tenants
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_tenant_households_demo_all on property.tenant_households;
create policy property_tenant_households_demo_all on property.tenant_households
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_tenant_occupants_demo_all on property.tenant_occupants;
create policy property_tenant_occupants_demo_all on property.tenant_occupants
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_tenant_documents_demo_all on property.tenant_documents;
create policy property_tenant_documents_demo_all on property.tenant_documents
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_tenant_communications_demo_all on property.tenant_communications;
create policy property_tenant_communications_demo_all on property.tenant_communications
  for all to anon, authenticated using (true) with check (true);

-- Table privileges for the API roles. init.sql sets default privileges for future
-- tables, but these already exist at grant time, so grant them explicitly (idempotent).
grant all on property.tenants, property.tenant_households,
  property.tenant_occupants, property.tenant_documents,
  property.tenant_communications
  to anon, authenticated, service_role;
