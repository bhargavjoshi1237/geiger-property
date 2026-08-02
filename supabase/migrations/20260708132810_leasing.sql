-- Imported from leasing.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Leasing area
--
-- Self-contained and idempotent: safe to run repeatedly. Backs the entire
-- Leasing sidebar group:
--   property.leases            — one row per lease (Leases + Lease Builder lens).
--   property.lease_templates   — reusable lease templates (Lease Templates +
--                                State-specific Leases lens via `scope`/`state`).
--   property.esign_requests    — e-signature requests (E-signature).
--   property.lease_addenda     — lease addenda & supporting docs (Addenda & Documents).
--   property.security_deposits — deposits held & their status (Security Deposits).
--   property.moves             — move-in / move-out records (Move-in / Move-out
--                                lenses via `kind`).
--   property.inspections       — move-in inspections (Move-in Inspection).
--
-- The `property` schema must be exposed in Supabase → Settings → API → Exposed
-- schemas (see init.sql). Shared updated_at trigger is declared locally.
-- RLS is open demo (anon/authenticated); replace with org-scoped policy when
-- auth lands. No demo seed — screens render an empty state.
-- ===========================================================================

create extension if not exists pgcrypto;
create schema if not exists property;

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
-- leases — one row per lease agreement.
-- ---------------------------------------------------------------------------
create table if not exists property.leases (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled lease',
  -- Denormalized unit + tenant labels for display.
  unit text,
  tenant_name text,
  property_id uuid,
  tenant_id uuid,
  rent numeric not null default 0,
  deposit numeric not null default 0,
  term_start date,
  term_end date,
  -- Draft | Pending | Active | Expiring soon | Ended
  status text not null default 'Draft',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.leases add column if not exists tenant_name text;
alter table property.leases add column if not exists property_id uuid;
alter table property.leases add column if not exists tenant_id uuid;
alter table property.leases add column if not exists rent numeric not null default 0;
alter table property.leases add column if not exists deposit numeric not null default 0;
alter table property.leases add column if not exists term_start date;
alter table property.leases add column if not exists term_end date;
alter table property.leases add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.leases add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.leases add column if not exists deleted_at timestamptz;

create index if not exists property_leases_status_idx
  on property.leases (status) where deleted_at is null;

drop trigger if exists leases_touch_updated_at on property.leases;
create trigger leases_touch_updated_at
before update on property.leases
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- lease_templates — reusable + state-specific lease templates.
-- ---------------------------------------------------------------------------
create table if not exists property.lease_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled template',
  -- generic | state  (State-specific Leases lens filters scope = 'state').
  scope text not null default 'generic',
  -- Two-letter state code when scope = 'state'.
  state text,
  body text,
  -- Draft | Published | Archived
  status text not null default 'Draft',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.lease_templates add column if not exists scope text not null default 'generic';
alter table property.lease_templates add column if not exists state text;
alter table property.lease_templates add column if not exists body text;
alter table property.lease_templates add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.lease_templates add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.lease_templates add column if not exists deleted_at timestamptz;

create index if not exists property_lease_templates_scope_idx
  on property.lease_templates (scope) where deleted_at is null;

drop trigger if exists lease_templates_touch_updated_at on property.lease_templates;
create trigger lease_templates_touch_updated_at
before update on property.lease_templates
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- esign_requests — document signing workflows.
-- ---------------------------------------------------------------------------
create table if not exists property.esign_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled request',
  lease_id uuid references property.leases(id) on delete set null,
  -- Primary signer label (full signer list lives in metadata.signers).
  signer text,
  -- Draft | Sent | Viewed | Signed | Declined
  status text not null default 'Draft',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.esign_requests add column if not exists lease_id uuid references property.leases(id) on delete set null;
alter table property.esign_requests add column if not exists signer text;
alter table property.esign_requests add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.esign_requests add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.esign_requests add column if not exists deleted_at timestamptz;

drop trigger if exists esign_requests_touch_updated_at on property.esign_requests;
create trigger esign_requests_touch_updated_at
before update on property.esign_requests
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- lease_addenda — addenda & supporting documents attached to a lease.
-- ---------------------------------------------------------------------------
create table if not exists property.lease_addenda (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled addendum',
  lease_id uuid references property.leases(id) on delete set null,
  body text,
  -- Draft | Attached | Signed
  status text not null default 'Draft',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.lease_addenda add column if not exists lease_id uuid references property.leases(id) on delete set null;
alter table property.lease_addenda add column if not exists body text;
alter table property.lease_addenda add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.lease_addenda add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.lease_addenda add column if not exists deleted_at timestamptz;

drop trigger if exists lease_addenda_touch_updated_at on property.lease_addenda;
create trigger lease_addenda_touch_updated_at
before update on property.lease_addenda
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- security_deposits — deposits held and their lifecycle.
-- ---------------------------------------------------------------------------
create table if not exists property.security_deposits (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled deposit',
  unit text,
  tenant_id uuid,
  amount numeric not null default 0,
  -- Where the deposit is held (bank / trust account label).
  held_location text,
  -- Held | Partially returned | Returned | Forfeited
  status text not null default 'Held',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.security_deposits add column if not exists unit text;
alter table property.security_deposits add column if not exists tenant_id uuid;
alter table property.security_deposits add column if not exists amount numeric not null default 0;
alter table property.security_deposits add column if not exists held_location text;
alter table property.security_deposits add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.security_deposits add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.security_deposits add column if not exists deleted_at timestamptz;

drop trigger if exists security_deposits_touch_updated_at on property.security_deposits;
create trigger security_deposits_touch_updated_at
before update on property.security_deposits
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- moves — move-in / move-out records (kind = 'in' | 'out').
-- ---------------------------------------------------------------------------
create table if not exists property.moves (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled move',
  unit text,
  tenant_id uuid,
  -- in | out
  kind text not null default 'in',
  -- Scheduled | In progress | Complete
  status text not null default 'Scheduled',
  move_date date,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.moves add column if not exists unit text;
alter table property.moves add column if not exists tenant_id uuid;
alter table property.moves add column if not exists kind text not null default 'in';
alter table property.moves add column if not exists move_date date;
alter table property.moves add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.moves add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.moves add column if not exists deleted_at timestamptz;

create index if not exists property_moves_kind_idx
  on property.moves (kind) where deleted_at is null;

drop trigger if exists moves_touch_updated_at on property.moves;
create trigger moves_touch_updated_at
before update on property.moves
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- inspections — move-in inspection records & reports.
-- ---------------------------------------------------------------------------
create table if not exists property.inspections (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled inspection',
  unit text,
  inspector text,
  -- Scheduled | In progress | Complete | Failed
  status text not null default 'Scheduled',
  inspection_date date,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.inspections add column if not exists unit text;
alter table property.inspections add column if not exists inspector text;
alter table property.inspections add column if not exists inspection_date date;
alter table property.inspections add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.inspections add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.inspections add column if not exists deleted_at timestamptz;

drop trigger if exists inspections_touch_updated_at on property.inspections;
create trigger inspections_touch_updated_at
before update on property.inspections
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Open demo policies (anon key) — replaced with org-scoped member policies
-- when auth lands.
-- ---------------------------------------------------------------------------
alter table property.leases enable row level security;
alter table property.lease_templates enable row level security;
alter table property.esign_requests enable row level security;
alter table property.lease_addenda enable row level security;
alter table property.security_deposits enable row level security;
alter table property.moves enable row level security;
alter table property.inspections enable row level security;

drop policy if exists property_leases_demo_all on property.leases;
create policy property_leases_demo_all on property.leases
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_lease_templates_demo_all on property.lease_templates;
create policy property_lease_templates_demo_all on property.lease_templates
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_esign_requests_demo_all on property.esign_requests;
create policy property_esign_requests_demo_all on property.esign_requests
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_lease_addenda_demo_all on property.lease_addenda;
create policy property_lease_addenda_demo_all on property.lease_addenda
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_security_deposits_demo_all on property.security_deposits;
create policy property_security_deposits_demo_all on property.security_deposits
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_moves_demo_all on property.moves;
create policy property_moves_demo_all on property.moves
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_inspections_demo_all on property.inspections;
create policy property_inspections_demo_all on property.inspections
  for all to anon, authenticated using (true) with check (true);

grant all on property.leases, property.lease_templates, property.esign_requests,
  property.lease_addenda, property.security_deposits, property.moves,
  property.inspections
  to anon, authenticated, service_role;
