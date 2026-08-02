-- Imported from rent_collection.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Rent Collection area
--
-- property.rent_accounts — one row per rent-roll obligation (a tenant's rent on
-- a unit). Recurring rent terms live in real columns; per-period charges and
-- recorded payments live in the metadata bag (charges[]/payments[]), so the live
-- balance = Σ charges − Σ payments. Cross-area references (tenant_id,
-- property_id, lease_id) are soft uuids for future joins. Self-contained +
-- idempotent.
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

create table if not exists property.rent_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Account label, e.g. "Maple Court · 4B — Jordan Blake".
  name text not null default 'Rent account',
  -- Denormalized unit + tenant labels for display; ids soft-link the real rows.
  unit text,
  tenant_name text,
  tenant_id uuid,
  property_id uuid,
  lease_id uuid,
  -- Monthly rent and when it's due (day of month).
  rent numeric not null default 0,
  due_day int not null default 1,
  -- Monthly | Weekly | Biweekly | Quarterly
  frequency text not null default 'Monthly',
  -- Autopay flag + default method (ACH | Card | Check | Cash).
  autopay boolean not null default false,
  payment_method text,
  -- Current | Due | Partial | Overdue | In collections | Draft
  status text not null default 'Due',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.rent_accounts add column if not exists unit text;
alter table property.rent_accounts add column if not exists tenant_name text;
alter table property.rent_accounts add column if not exists tenant_id uuid;
alter table property.rent_accounts add column if not exists property_id uuid;
alter table property.rent_accounts add column if not exists lease_id uuid;
alter table property.rent_accounts add column if not exists rent numeric not null default 0;
alter table property.rent_accounts add column if not exists due_day int not null default 1;
alter table property.rent_accounts add column if not exists frequency text not null default 'Monthly';
alter table property.rent_accounts add column if not exists autopay boolean not null default false;
alter table property.rent_accounts add column if not exists payment_method text;
alter table property.rent_accounts add column if not exists status text not null default 'Due';
alter table property.rent_accounts add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.rent_accounts add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.rent_accounts add column if not exists deleted_at timestamptz;

create index if not exists property_rent_accounts_status_idx
  on property.rent_accounts (status) where deleted_at is null;
create index if not exists property_rent_accounts_tenant_idx
  on property.rent_accounts (tenant_id) where deleted_at is null;
create index if not exists property_rent_accounts_property_idx
  on property.rent_accounts (property_id) where deleted_at is null;
create index if not exists property_rent_accounts_lease_idx
  on property.rent_accounts (lease_id) where deleted_at is null;

drop trigger if exists rent_accounts_touch_updated_at on property.rent_accounts;
create trigger rent_accounts_touch_updated_at
before update on property.rent_accounts
for each row execute function property.touch_updated_at();

alter table property.rent_accounts enable row level security;
drop policy if exists property_rent_accounts_demo_all on property.rent_accounts;
create policy property_rent_accounts_demo_all on property.rent_accounts
  for all to anon, authenticated using (true) with check (true);

grant all on property.rent_accounts to anon, authenticated, service_role;
