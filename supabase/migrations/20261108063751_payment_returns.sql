-- Returned payments (CORE-17)
--
-- Owns property.payment_returns: one row per returned office payment (NSF, account closed, stop payment). The row is the claim that
-- makes a return run once (one live row per payment) and its record: the returned date, reason, fee choice, where the money was
-- (the bank deposit or bank it reached) and the entries the return posted (the payment's void, nsf-bank:<paymentEntryId>,
-- nsf:<paymentEntryId>). Members with accounting.view read returns; only the server writes them.

-- @up
set local lock_timeout = '15s';

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

create table if not exists property.payment_returns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  payment_entry_id uuid not null references property.ledger_entries(id),
  lease_id uuid,
  tenant_id uuid,
  property_id uuid,
  amount numeric(14,2) not null default 0,
  returned_on date not null,
  reason text not null default 'nsf',
  charge_fee boolean not null default false,
  fee_amount numeric(14,2) not null default 0,
  status text not null default 'Pending',
  bank_deposit_id uuid,
  bank_account_id uuid,
  void_entry_id uuid,
  bank_entry_id uuid,
  fee_entry_id uuid,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payment_returns_status_chk check (status in ('Pending', 'Returned'))
);

-- One live return per payment: a second request finds the first and replays it.
create unique index if not exists payment_returns_entry_uidx on property.payment_returns (payment_entry_id) where deleted_at is null;
create index if not exists payment_returns_project_date_idx on property.payment_returns (project_id, returned_on desc) where deleted_at is null;
create index if not exists payment_returns_tenant_idx on property.payment_returns (tenant_id) where tenant_id is not null and deleted_at is null;
create index if not exists payment_returns_deposit_idx on property.payment_returns (bank_deposit_id) where bank_deposit_id is not null and deleted_at is null;

drop trigger if exists payment_returns_touch_updated_at on property.payment_returns;
create trigger payment_returns_touch_updated_at
before update on property.payment_returns
for each row execute function property.touch_updated_at();

select property.apply_member_rls('payment_returns', 'property.accounting.view', null, false);

-- @down
set local lock_timeout = '15s';
drop table if exists property.payment_returns;
