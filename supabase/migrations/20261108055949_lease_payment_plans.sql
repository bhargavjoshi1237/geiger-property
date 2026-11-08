-- Lease payment plans (CORE-14)
--
-- Owns property.lease_payment_plans (a deferred payment agreement on one lease) and
-- property.lease_payment_plan_installments (its schedule). The spec's names payment_plans /
-- payment_plan_installments aren't used: property.payment_plans is a pre-ledger orphan table
-- (no project_id, no migration, no code), so it is left alone.
-- Redefines property.ledger_party_balances with a trailing deferred_receivable column (1210
-- Deferred Receivable, subtype deferred_receivable); ownership of the view moves here from
-- 20261015212744_ledger_core. Members with accounting.view read plans; only the server
-- (service role) writes them, since activation, billing and default post to the ledger.

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

create table if not exists property.lease_payment_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lease_id uuid not null,
  tenant_id uuid,
  property_id uuid,
  unit_id uuid,
  name text not null default 'Payment plan',
  total_amount numeric(14,2) not null,
  down_payment numeric(14,2) not null default 0,
  installment_count int not null,
  frequency text not null default 'Monthly',
  first_due date not null,
  status text not null default 'Draft',
  grace_days int not null default 5,
  suspend_late_fees boolean not null default true,
  defer_entry_id uuid,
  agreement_document_id uuid,
  signed_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lease_payment_plans_total_chk check (total_amount > 0),
  constraint lease_payment_plans_down_chk check (down_payment >= 0 and down_payment < total_amount),
  constraint lease_payment_plans_count_chk check (installment_count between 1 and 120),
  constraint lease_payment_plans_frequency_chk check (frequency in ('Weekly', 'Biweekly', 'Monthly')),
  constraint lease_payment_plans_status_chk check (status in ('Draft', 'Active', 'Completed', 'Defaulted', 'Cancelled')),
  constraint lease_payment_plans_grace_chk check (grace_days >= 0)
);

-- One active plan per lease (LEAS-47: one plan per lease for now).
create unique index if not exists lease_payment_plans_active_lease_uidx
  on property.lease_payment_plans (lease_id)
  where deleted_at is null and status = 'Active';
create index if not exists lease_payment_plans_lease_idx on property.lease_payment_plans (lease_id) where deleted_at is null;
create index if not exists lease_payment_plans_project_status_idx on property.lease_payment_plans (project_id, status) where deleted_at is null;

drop trigger if exists lease_payment_plans_touch_updated_at on property.lease_payment_plans;
create trigger lease_payment_plans_touch_updated_at
before update on property.lease_payment_plans
for each row execute function property.touch_updated_at();

select property.apply_member_rls('lease_payment_plans', 'property.accounting.view', null, false);

create table if not exists property.lease_payment_plan_installments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references property.lease_payment_plans(id) on delete cascade,
  seq int not null,
  due_date date not null,
  amount numeric(14,2) not null,
  status text not null default 'Scheduled',
  charge_entry_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lease_payment_plan_installments_seq_chk check (seq > 0),
  constraint lease_payment_plan_installments_amount_chk check (amount > 0),
  constraint lease_payment_plan_installments_status_chk check (status in ('Scheduled', 'Billed', 'Paid', 'Missed'))
);

-- seq numbers the ledger key plan:<planId>:inst:<seq>, so it is never reused within a plan.
create unique index if not exists lease_payment_plan_installments_plan_seq_uidx on property.lease_payment_plan_installments (plan_id, seq);
create index if not exists lease_payment_plan_installments_due_idx
  on property.lease_payment_plan_installments (project_id, due_date)
  where deleted_at is null and status = 'Scheduled';

drop trigger if exists lease_payment_plan_installments_touch_updated_at on property.lease_payment_plan_installments;
create trigger lease_payment_plan_installments_touch_updated_at
before update on property.lease_payment_plan_installments
for each row execute function property.touch_updated_at();

select property.apply_member_rls('lease_payment_plan_installments', 'property.accounting.view', null, false);

-- Party sub-ledger balances: receivable (lease/tenant), payable (vendor), deposits held, cash held in trust per owner / property,
-- and the deferred receivable a payment plan holds back from AR (CORE-14, trailing column).
create or replace view property.ledger_party_balances with (security_invoker = true) as
with lines as (
  select l.*, a.subtype, a.is_trust, a.account_type
  from property.ledger_lines l
  join property.gl_accounts a on a.id = l.gl_account_id
  where l.deleted_at is null
), dims as (
  select project_id, 'lease'::text as dimension, lease_id as dimension_id, subtype, is_trust, account_type, debit, credit from lines where lease_id is not null
  union all select project_id, 'tenant', tenant_id, subtype, is_trust, account_type, debit, credit from lines where tenant_id is not null
  union all select project_id, 'owner', owner_id, subtype, is_trust, account_type, debit, credit from lines where owner_id is not null
  union all select project_id, 'vendor', vendor_id, subtype, is_trust, account_type, debit, credit from lines where vendor_id is not null
  union all select project_id, 'property', property_id, subtype, is_trust, account_type, debit, credit from lines where property_id is not null
)
select
  project_id, dimension, dimension_id,
  coalesce(sum(debit - credit) filter (where subtype = 'receivable'), 0) as receivable,
  coalesce(sum(credit - debit) filter (where subtype = 'payable'), 0) as payable,
  coalesce(sum(credit - debit) filter (where subtype = 'deposits'), 0) as deposits_held,
  coalesce(sum(credit - debit) filter (where subtype = 'prepaid'), 0) as prepaid,
  coalesce(sum(debit - credit) filter (where subtype = 'cash' and is_trust), 0) as trust_cash,
  coalesce(sum(debit - credit) filter (where subtype = 'cash' and not is_trust), 0) as operating_cash,
  coalesce(sum(credit - debit) filter (where account_type = 'Income'), 0) as income,
  coalesce(sum(debit - credit) filter (where account_type = 'Expense'), 0) as expense,
  coalesce(sum(debit - credit) filter (where subtype = 'deferred_receivable'), 0) as deferred_receivable
from dims
group by project_id, dimension, dimension_id;

-- Views read through their tables' RLS (security_invoker): signed-in members and the server read, nobody writes through them.
revoke all on property.ledger_party_balances from anon, authenticated;
grant select on property.ledger_party_balances to authenticated, service_role;

-- @down
drop table if exists property.lease_payment_plan_installments;
drop table if exists property.lease_payment_plans;

-- The view as 20261015212744_ledger_core defined it (a column can't be dropped by create or replace).
drop view if exists property.ledger_party_balances;
create view property.ledger_party_balances with (security_invoker = true) as
with lines as (
  select l.*, a.subtype, a.is_trust, a.account_type
  from property.ledger_lines l
  join property.gl_accounts a on a.id = l.gl_account_id
  where l.deleted_at is null
), dims as (
  select project_id, 'lease'::text as dimension, lease_id as dimension_id, subtype, is_trust, account_type, debit, credit from lines where lease_id is not null
  union all select project_id, 'tenant', tenant_id, subtype, is_trust, account_type, debit, credit from lines where tenant_id is not null
  union all select project_id, 'owner', owner_id, subtype, is_trust, account_type, debit, credit from lines where owner_id is not null
  union all select project_id, 'vendor', vendor_id, subtype, is_trust, account_type, debit, credit from lines where vendor_id is not null
  union all select project_id, 'property', property_id, subtype, is_trust, account_type, debit, credit from lines where property_id is not null
)
select
  project_id, dimension, dimension_id,
  coalesce(sum(debit - credit) filter (where subtype = 'receivable'), 0) as receivable,
  coalesce(sum(credit - debit) filter (where subtype = 'payable'), 0) as payable,
  coalesce(sum(credit - debit) filter (where subtype = 'deposits'), 0) as deposits_held,
  coalesce(sum(credit - debit) filter (where subtype = 'prepaid'), 0) as prepaid,
  coalesce(sum(debit - credit) filter (where subtype = 'cash' and is_trust), 0) as trust_cash,
  coalesce(sum(debit - credit) filter (where subtype = 'cash' and not is_trust), 0) as operating_cash,
  coalesce(sum(credit - debit) filter (where account_type = 'Income'), 0) as income,
  coalesce(sum(debit - credit) filter (where account_type = 'Expense'), 0) as expense
from dims
group by project_id, dimension, dimension_id;
revoke all on property.ledger_party_balances from anon, authenticated;
grant select on property.ledger_party_balances to authenticated, service_role;
