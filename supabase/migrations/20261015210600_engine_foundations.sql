-- Engine foundations
--
-- Owns property.merge_meta(), property.record_items, property.lease_parties and
-- property.property_owners, plus the soft id links between records (moves ↔
-- leases/inspections/deposits, work orders ↔ property/unit/tenant/vendor, GL
-- account ids on money rows). Columns are add-if-not-exists so a database that
-- already carries some of them stays untouched.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Shallow-merge a patch into any property.<table>.metadata so one editor tab
-- never clobbers another's keys. Invoker rights: the caller's RLS applies.
create or replace function property.merge_meta(p_table text, p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_meta jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'property' and table_name = p_table and column_name = 'metadata'
  ) then
    raise exception 'merge_meta: unknown table %', p_table;
  end if;
  execute format(
    'update property.%I set metadata = coalesce(metadata, ''{}''::jsonb) || $1 where id = $2 and deleted_at is null returning metadata',
    p_table
  ) into v_meta using coalesce(p_patch, '{}'::jsonb), p_id;
  return v_meta;
end;
$$;

grant execute on function property.merge_meta(text, uuid, jsonb) to anon, authenticated;

-- Generic repeater rows owned by any record (pets, vehicles, emergency contacts,
-- keys, meters, assets, insurance policies…). Kind-specific fields live in metadata.
create table if not exists property.record_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  owner_type text not null,
  owner_id uuid not null,
  kind text not null,
  name text not null default '',
  status text,
  starts_on date,
  ends_on date,
  amount numeric,
  sort integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists record_items_owner_idx on property.record_items (owner_type, owner_id, kind);
create index if not exists record_items_ends_idx on property.record_items (kind, ends_on);

-- People on a lease: primary/co-tenants, co-signers, guarantors, occupants.
create table if not exists property.lease_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  lease_id uuid not null,
  tenant_id uuid,
  role text not null default 'tenant',
  name text not null default '',
  email text,
  phone text,
  responsibility_pct numeric,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists lease_parties_lease_idx on property.lease_parties (lease_id);
create index if not exists lease_parties_tenant_idx on property.lease_parties (tenant_id);

-- Owner ↔ property ownership with percent and effective dates.
create table if not exists property.property_owners (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  owner_id uuid not null,
  owner_name text,
  property_id uuid not null,
  property_name text,
  ownership_pct numeric not null default 100,
  starts_on date,
  ends_on date,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists property_owners_owner_idx on property.property_owners (owner_id);
create index if not exists property_owners_property_idx on property.property_owners (property_id);

do $$
declare t text;
begin
  foreach t in array array['record_items', 'lease_parties', 'property_owners'] loop
    execute format('drop trigger if exists %I on property.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on property.%I for each row execute function property.touch_updated_at()', t || '_touch_updated_at', t);
    execute format('alter table property.%I enable row level security', t);
    execute format('drop policy if exists %I on property.%I', t || '_demo_all', t);
    execute format('create policy %I on property.%I for all to anon, authenticated using (true) with check (true)', t || '_demo_all', t);
    execute format('grant select, insert, update, delete on property.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Soft id links between records (display names stay denormalized beside them).
alter table property.moves add column if not exists lease_id uuid;
alter table property.moves add column if not exists unit_id uuid;
alter table property.moves add column if not exists property_id uuid;
alter table property.moves add column if not exists tenant_name text;
alter table property.moves add column if not exists lease_name text;
alter table property.moves add column if not exists inspection_id uuid;
alter table property.moves add column if not exists deposit_id uuid;

alter table property.inspections add column if not exists tenant_id uuid;
alter table property.inspections add column if not exists tenant_name text;
alter table property.inspections add column if not exists lease_id uuid;
alter table property.inspections add column if not exists lease_name text;
alter table property.inspections add column if not exists move_id uuid;
alter table property.inspections add column if not exists unit_id uuid;
alter table property.inspections add column if not exists property_id uuid;
alter table property.inspections add column if not exists kind text;

alter table property.security_deposits add column if not exists lease_id uuid;
alter table property.security_deposits add column if not exists lease_name text;
alter table property.security_deposits add column if not exists tenant_name text;
alter table property.security_deposits add column if not exists unit_id uuid;
alter table property.security_deposits add column if not exists property_id uuid;
alter table property.security_deposits add column if not exists move_id uuid;

alter table property.unit_turns add column if not exists property_id uuid;
alter table property.unit_turns add column if not exists move_id uuid;

alter table property.work_orders add column if not exists property_id uuid;
alter table property.work_orders add column if not exists unit_id uuid;
alter table property.work_orders add column if not exists tenant_id uuid;
alter table property.work_orders add column if not exists vendor_id uuid;
alter table property.work_orders add column if not exists lease_id uuid;

alter table property.leases add column if not exists unit_id uuid;
alter table property.leases add column if not exists template_id uuid;
alter table property.leases add column if not exists renewal_of_id uuid;

alter table property.transactions add column if not exists gl_account_id uuid;
alter table property.transactions add column if not exists bill_id uuid;
alter table property.transactions add column if not exists vendor_id uuid;
alter table property.transactions add column if not exists owner_id uuid;
alter table property.transactions add column if not exists unit_id uuid;

alter table property.bills add column if not exists gl_account_id uuid;
alter table property.bills add column if not exists property_id uuid;
alter table property.bills add column if not exists work_order_id uuid;

alter table property.recurring_charges add column if not exists gl_account_id uuid;
alter table property.recurring_charges add column if not exists lease_id uuid;

alter table property.notices add column if not exists lease_id uuid;
alter table property.notices add column if not exists property_id uuid;

alter table property.bank_accounts add column if not exists gl_account_id uuid;
alter table property.bank_accounts add column if not exists property_id uuid;

create index if not exists moves_lease_idx on property.moves (lease_id);
create index if not exists inspections_move_idx on property.inspections (move_id);
create index if not exists inspections_lease_idx on property.inspections (lease_id);
create index if not exists security_deposits_lease_idx on property.security_deposits (lease_id);
create index if not exists unit_turns_unit_idx on property.unit_turns (unit_id);
create index if not exists work_orders_property_idx on property.work_orders (property_id);
create index if not exists work_orders_unit_idx on property.work_orders (unit_id);
create index if not exists work_orders_vendor_idx on property.work_orders (vendor_id);
create index if not exists leases_unit_idx on property.leases (unit_id);
create index if not exists leases_tenant_idx on property.leases (tenant_id);
create index if not exists transactions_gl_idx on property.transactions (gl_account_id);
create index if not exists transactions_lease_idx on property.transactions (lease_id);
create index if not exists bills_gl_idx on property.bills (gl_account_id);
create index if not exists recurring_charges_lease_idx on property.recurring_charges (lease_id);

-- @down
drop index if exists property.recurring_charges_lease_idx;
drop index if exists property.bills_gl_idx;
drop index if exists property.transactions_lease_idx;
drop index if exists property.transactions_gl_idx;
drop index if exists property.leases_tenant_idx;
drop index if exists property.leases_unit_idx;
drop index if exists property.work_orders_vendor_idx;
drop index if exists property.work_orders_unit_idx;
drop index if exists property.work_orders_property_idx;
drop index if exists property.unit_turns_unit_idx;
drop index if exists property.security_deposits_lease_idx;
drop index if exists property.inspections_lease_idx;
drop index if exists property.inspections_move_idx;
drop index if exists property.moves_lease_idx;

alter table property.bank_accounts drop column if exists property_id;
alter table property.bank_accounts drop column if exists gl_account_id;
alter table property.notices drop column if exists property_id;
alter table property.notices drop column if exists lease_id;
alter table property.recurring_charges drop column if exists lease_id;
alter table property.recurring_charges drop column if exists gl_account_id;
alter table property.bills drop column if exists work_order_id;
alter table property.bills drop column if exists property_id;
alter table property.bills drop column if exists gl_account_id;
alter table property.transactions drop column if exists unit_id;
alter table property.transactions drop column if exists owner_id;
alter table property.transactions drop column if exists vendor_id;
alter table property.transactions drop column if exists bill_id;
alter table property.transactions drop column if exists gl_account_id;
alter table property.leases drop column if exists renewal_of_id;
alter table property.leases drop column if exists template_id;
alter table property.work_orders drop column if exists lease_id;
alter table property.unit_turns drop column if exists move_id;
alter table property.unit_turns drop column if exists property_id;
alter table property.security_deposits drop column if exists move_id;
alter table property.security_deposits drop column if exists property_id;
alter table property.security_deposits drop column if exists tenant_name;
alter table property.security_deposits drop column if exists lease_name;
alter table property.inspections drop column if exists kind;
alter table property.inspections drop column if exists property_id;
alter table property.inspections drop column if exists lease_name;
alter table property.inspections drop column if exists tenant_name;
alter table property.moves drop column if exists deposit_id;
alter table property.moves drop column if exists property_id;
alter table property.moves drop column if exists inspection_id;
alter table property.moves drop column if exists lease_name;
alter table property.moves drop column if exists tenant_name;

drop table if exists property.property_owners cascade;
drop table if exists property.lease_parties cascade;
drop table if exists property.record_items cascade;
drop function if exists property.merge_meta(text, uuid, jsonb);
