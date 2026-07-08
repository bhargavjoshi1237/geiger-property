-- ===========================================================================
-- Geiger Property — Maintenance area
--
-- Self-contained and idempotent: safe to run repeatedly. Backs the entire
-- Maintenance sidebar group:
--   property.work_orders            — one row per maintenance record. Backs
--                                     All Maintenance (all rows), Work Orders
--                                     (kind='work_order' lens), Maintenance
--                                     Requests (kind='request' lens), and Mobile
--                                     Maintenance (is_field=true lens).
--   property.vendors                — vendor directory (Vendors).
--   property.vendor_assignments     — vendor ↔ work-order assignments
--                                     (Vendor Assignments).
--   property.maintenance_attachments — photos / invoices / manuals
--                                     (Photos & Attachments).
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
-- work_orders — one row per maintenance record (work order / request / field).
-- ---------------------------------------------------------------------------
create table if not exists property.work_orders (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled work order',
  -- work_order | request  (Work Orders / Maintenance Requests lenses).
  kind text not null default 'work_order',
  -- true = a field/mobile visit (Mobile Maintenance lens).
  is_field boolean not null default false,
  -- Denormalized property/unit + tenant labels for display.
  property_label text,
  tenant_name text,
  category text,
  -- Low | Medium | High | Urgent
  priority text not null default 'Medium',
  -- Open | In progress | On hold | Completed | Draft (work orders) /
  -- Submitted | Approved | Rejected | Converted (requests).
  status text not null default 'Open',
  vendor_name text,
  technician text,
  scheduled_date date,
  labor_cost numeric not null default 0,
  material_cost numeric not null default 0,
  total_cost numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.work_orders add column if not exists kind text not null default 'work_order';
alter table property.work_orders add column if not exists is_field boolean not null default false;
alter table property.work_orders add column if not exists property_label text;
alter table property.work_orders add column if not exists tenant_name text;
alter table property.work_orders add column if not exists category text;
alter table property.work_orders add column if not exists priority text not null default 'Medium';
alter table property.work_orders add column if not exists vendor_name text;
alter table property.work_orders add column if not exists technician text;
alter table property.work_orders add column if not exists scheduled_date date;
alter table property.work_orders add column if not exists labor_cost numeric not null default 0;
alter table property.work_orders add column if not exists material_cost numeric not null default 0;
alter table property.work_orders add column if not exists total_cost numeric not null default 0;
alter table property.work_orders add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.work_orders add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.work_orders add column if not exists deleted_at timestamptz;

create index if not exists property_work_orders_kind_idx
  on property.work_orders (kind) where deleted_at is null;
create index if not exists property_work_orders_status_idx
  on property.work_orders (status) where deleted_at is null;
create index if not exists property_work_orders_field_idx
  on property.work_orders (is_field) where deleted_at is null;

drop trigger if exists work_orders_touch_updated_at on property.work_orders;
create trigger work_orders_touch_updated_at
before update on property.work_orders
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- vendors — vendor directory.
-- ---------------------------------------------------------------------------
create table if not exists property.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled vendor',
  contact_name text,
  email text,
  phone text,
  specialty text,
  rating numeric not null default 0,
  hourly_rate numeric not null default 0,
  insurance_expiry date,
  -- Active | Preferred | Inactive
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.vendors add column if not exists contact_name text;
alter table property.vendors add column if not exists email text;
alter table property.vendors add column if not exists phone text;
alter table property.vendors add column if not exists specialty text;
alter table property.vendors add column if not exists rating numeric not null default 0;
alter table property.vendors add column if not exists hourly_rate numeric not null default 0;
alter table property.vendors add column if not exists insurance_expiry date;
alter table property.vendors add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.vendors add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.vendors add column if not exists deleted_at timestamptz;

create index if not exists property_vendors_status_idx
  on property.vendors (status) where deleted_at is null;

drop trigger if exists vendors_touch_updated_at on property.vendors;
create trigger vendors_touch_updated_at
before update on property.vendors
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- vendor_assignments — vendor ↔ work-order assignments.
-- ---------------------------------------------------------------------------
create table if not exists property.vendor_assignments (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled assignment',
  vendor_name text,
  work_order_label text,
  scheduled_date date,
  -- Assigned | Accepted | In progress | Completed | Declined
  status text not null default 'Assigned',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.vendor_assignments add column if not exists vendor_name text;
alter table property.vendor_assignments add column if not exists work_order_label text;
alter table property.vendor_assignments add column if not exists scheduled_date date;
alter table property.vendor_assignments add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.vendor_assignments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.vendor_assignments add column if not exists deleted_at timestamptz;

drop trigger if exists vendor_assignments_touch_updated_at on property.vendor_assignments;
create trigger vendor_assignments_touch_updated_at
before update on property.vendor_assignments
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- maintenance_attachments — photos, videos, invoices, manuals, documents.
-- ---------------------------------------------------------------------------
create table if not exists property.maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled attachment',
  -- Photo | Video | Invoice | Manual | Document
  category text not null default 'Photo',
  work_order_label text,
  url text,
  -- Active | Archived
  status text not null default 'Active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.maintenance_attachments add column if not exists category text not null default 'Photo';
alter table property.maintenance_attachments add column if not exists work_order_label text;
alter table property.maintenance_attachments add column if not exists url text;
alter table property.maintenance_attachments add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.maintenance_attachments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.maintenance_attachments add column if not exists deleted_at timestamptz;

create index if not exists property_maintenance_attachments_category_idx
  on property.maintenance_attachments (category) where deleted_at is null;

drop trigger if exists maintenance_attachments_touch_updated_at on property.maintenance_attachments;
create trigger maintenance_attachments_touch_updated_at
before update on property.maintenance_attachments
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Open demo policies (anon key) — replaced with org-scoped member policies
-- when auth lands.
-- ---------------------------------------------------------------------------
alter table property.work_orders enable row level security;
alter table property.vendors enable row level security;
alter table property.vendor_assignments enable row level security;
alter table property.maintenance_attachments enable row level security;

drop policy if exists property_work_orders_demo_all on property.work_orders;
create policy property_work_orders_demo_all on property.work_orders
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_vendors_demo_all on property.vendors;
create policy property_vendors_demo_all on property.vendors
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_vendor_assignments_demo_all on property.vendor_assignments;
create policy property_vendor_assignments_demo_all on property.vendor_assignments
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_maintenance_attachments_demo_all on property.maintenance_attachments;
create policy property_maintenance_attachments_demo_all on property.maintenance_attachments
  for all to anon, authenticated using (true) with check (true);

grant all on property.work_orders, property.vendors, property.vendor_assignments,
  property.maintenance_attachments
  to anon, authenticated, service_role;
