-- Conversion batches (INTL-04)
--
-- Owns property.conversion_batches (a dated set of opening balances brought over from another system) and
-- property.conversion_lines (one balance each: tenant balances and credits, deposits, owner balances, unpaid bills,
-- other GL balances, outstanding bank items), plus property.conversion_guard() and its triggers.
-- Posting and voiding run on the server (service role, /api/accounting/conversion); the guard keeps signed-in
-- browsers to editing Draft batches and lines that aren't on the ledger yet. RLS is demo-open (PLAT-01 tightens it).

-- @up
create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

-- Shared "touch updated_at" trigger function (suite convention), defined here so the file stands alone.
create or replace function property.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function property.touch_updated_at() from public, anon;

create table if not exists property.conversion_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  cutover_date date not null,
  status text not null default 'Draft',
  totals jsonb not null default '{}'::jsonb,
  posted_at timestamptz,
  posted_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint conversion_batches_status_chk check (status in ('Draft', 'Posted', 'Voided'))
);

create index if not exists conversion_batches_project_idx
  on property.conversion_batches (project_id, status)
  where deleted_at is null;

create table if not exists property.conversion_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  batch_id uuid not null references property.conversion_batches(id) on delete cascade,
  kind text not null,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  tenant_id uuid,
  owner_id uuid,
  vendor_id uuid,
  bank_account_id uuid,
  gl_account_id uuid,
  item_date date,
  amount numeric(14,2) not null default 0,
  memo text,
  ref text,
  posted_entry_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint conversion_lines_kind_chk check (kind in (
    'tenant_balance', 'tenant_credit', 'deposit', 'owner_balance', 'bill', 'gl_balance', 'bank_outstanding'
  ))
);

create index if not exists conversion_lines_batch_kind_idx on property.conversion_lines (batch_id, kind);
create index if not exists conversion_lines_project_idx on property.conversion_lines (project_id) where deleted_at is null;

drop trigger if exists conversion_batches_touch_updated_at on property.conversion_batches;
create trigger conversion_batches_touch_updated_at
before update on property.conversion_batches
for each row execute function property.touch_updated_at();

drop trigger if exists conversion_lines_touch_updated_at on property.conversion_lines;
create trigger conversion_lines_touch_updated_at
before update on property.conversion_lines
for each row execute function property.touch_updated_at();

-- Browsers edit only Draft batches and lines not yet on the ledger; status, totals and posted entries are server-written.
create or replace function property.conversion_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if property.is_trusted_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Opening balances are soft-deleted, never deleted.' using errcode = '42501';
  end if;

  if tg_table_name = 'conversion_batches' then
    if tg_op = 'UPDATE' and old.status <> 'Draft' then
      raise exception 'A posted or voided batch can''t be changed.' using errcode = '42501';
    end if;
    if new.status <> 'Draft' or new.posted_at is not null or new.posted_by is not null
       or (tg_op = 'UPDATE' and new.totals is distinct from old.totals) then
      raise exception 'Opening balances are posted and voided on the server.' using errcode = '42501';
    end if;
    return new;
  end if;

  select b.status into v_status from property.conversion_batches b where b.id = new.batch_id;
  if v_status is distinct from 'Draft' then
    raise exception 'Lines of a posted or voided batch can''t be changed.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (old.posted_entry_id is not null or new.batch_id is distinct from old.batch_id) then
    raise exception 'This balance is already on the ledger.' using errcode = '42501';
  end if;
  if new.posted_entry_id is not null then
    raise exception 'Opening balances are posted on the server.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.conversion_guard() from public, anon;

drop trigger if exists conversion_batches_guard on property.conversion_batches;
create trigger conversion_batches_guard
before insert or update or delete on property.conversion_batches
for each row execute function property.conversion_guard();

drop trigger if exists conversion_lines_guard on property.conversion_lines;
create trigger conversion_lines_guard
before insert or update or delete on property.conversion_lines
for each row execute function property.conversion_guard();

-- Demo-open RLS for signed-in users (PLAT-01 replaces it with project isolation); no anon access.
alter table property.conversion_batches enable row level security;
drop policy if exists conversion_batches_demo_all on property.conversion_batches;
create policy conversion_batches_demo_all on property.conversion_batches
  for all to authenticated using (true) with check (true);

alter table property.conversion_lines enable row level security;
drop policy if exists conversion_lines_demo_all on property.conversion_lines;
create policy conversion_lines_demo_all on property.conversion_lines
  for all to authenticated using (true) with check (true);

revoke all on property.conversion_batches from anon;
revoke all on property.conversion_lines from anon;
grant select, insert, update on property.conversion_batches to authenticated;
grant select, insert, update on property.conversion_lines to authenticated;
grant all on property.conversion_batches to service_role;
grant all on property.conversion_lines to service_role;

-- @down
drop trigger if exists conversion_lines_guard on property.conversion_lines;
drop trigger if exists conversion_batches_guard on property.conversion_batches;
drop table if exists property.conversion_lines cascade;
drop table if exists property.conversion_batches cascade;
drop function if exists property.conversion_guard();
