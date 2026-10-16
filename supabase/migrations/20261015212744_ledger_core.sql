-- Ledger core (supersedes the empty 20261015212541_ledger_engine placeholder)
--
-- Owns the double-entry general ledger: property.ledger_entries + ledger_lines,
-- property.bank_reconciliations, the chart-of-accounts extensions on
-- property.gl_accounts (subtype, trust flag, system key, hierarchy), and the
-- functions ledger_post (balanced posting), ledger_void (reversal),
-- ledger_ensure_default_chart, ledger_subledger plus the balance/health views.
-- Also owns the P2 accounting tables budget_lines, cost_jobs,
-- utility_allocations and cam_reconciliations, and the bill approval / job
-- columns on property.bills.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Chart of accounts: type/subtype, trust flag, system accounts and hierarchy.
create table if not exists property.gl_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  number text,
  account_type text,
  description text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.gl_accounts add column if not exists subtype text;
alter table property.gl_accounts add column if not exists is_trust boolean not null default false;
alter table property.gl_accounts add column if not exists is_system boolean not null default false;
alter table property.gl_accounts add column if not exists parent_id uuid;
alter table property.gl_accounts add column if not exists system_key text;
create unique index if not exists gl_accounts_system_key_uidx
  on property.gl_accounts (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), system_key)
  where system_key is not null and deleted_at is null;
create index if not exists gl_accounts_parent_idx on property.gl_accounts (parent_id);

-- Journal entry headers. Lines carry the amounts; a reversal points at the
-- entry it voids via reversal_of.
create table if not exists property.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  entry_date date not null default current_date,
  memo text,
  source_type text not null default 'adjustment',
  source_id uuid,
  status text not null default 'posted',
  reversal_of uuid references property.ledger_entries(id),
  voided_at timestamptz,
  idempotency_key text,
  total numeric(14,2) not null default 0,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  tenant_id uuid,
  owner_id uuid,
  vendor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ledger_entries_status_chk check (status in ('posted', 'void')),
  constraint ledger_entries_source_chk check (source_type in (
    'charge', 'payment', 'credit', 'bill', 'bill_payment', 'distribution', 'contribution',
    'management_fee', 'deposit_held', 'deposit_return', 'late_fee', 'adjustment', 'deposit_interest'
  ))
);
create unique index if not exists ledger_entries_idem_uidx
  on property.ledger_entries (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key)
  where idempotency_key is not null;
create index if not exists ledger_entries_project_date_idx on property.ledger_entries (project_id, entry_date) where deleted_at is null;
create index if not exists ledger_entries_source_idx on property.ledger_entries (source_type, source_id);
create index if not exists ledger_entries_reversal_idx on property.ledger_entries (reversal_of);

-- Journal lines: one GL account, a debit or a credit, and the dimensions that
-- drive the sub-ledgers (lease/tenant, owner, vendor, property, bank, job).
create table if not exists property.ledger_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  entry_id uuid not null references property.ledger_entries(id) on delete cascade,
  entry_date date not null default current_date,
  line_no integer not null default 0,
  gl_account_id uuid not null references property.gl_accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  tenant_id uuid,
  owner_id uuid,
  vendor_id uuid,
  bank_account_id uuid,
  job_id uuid,
  applies_to_entry_id uuid,
  cleared boolean not null default false,
  cleared_on date,
  reconciliation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ledger_lines_amount_chk check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0))
);
create index if not exists ledger_lines_entry_idx on property.ledger_lines (entry_id);
create index if not exists ledger_lines_account_idx on property.ledger_lines (gl_account_id, entry_date);
create index if not exists ledger_lines_project_idx on property.ledger_lines (project_id, entry_date);
create index if not exists ledger_lines_lease_idx on property.ledger_lines (lease_id);
create index if not exists ledger_lines_tenant_idx on property.ledger_lines (tenant_id);
create index if not exists ledger_lines_owner_idx on property.ledger_lines (owner_id);
create index if not exists ledger_lines_vendor_idx on property.ledger_lines (vendor_id);
create index if not exists ledger_lines_property_idx on property.ledger_lines (property_id);
create index if not exists ledger_lines_bank_idx on property.ledger_lines (bank_account_id);
create index if not exists ledger_lines_job_idx on property.ledger_lines (job_id);
create index if not exists ledger_lines_applies_idx on property.ledger_lines (applies_to_entry_id);

-- Bank reconciliations: a statement date + ending balance, finalized once the
-- cleared ledger lines match it.
create table if not exists property.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  bank_account_id uuid,
  gl_account_id uuid,
  statement_date date,
  statement_balance numeric(14,2) not null default 0,
  cleared_balance numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  status text not null default 'Draft',
  finalized_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists bank_reconciliations_bank_idx on property.bank_reconciliations (bank_account_id, statement_date);

-- Monthly budget amounts per budget × property × GL account.
create table if not exists property.budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  budget_id uuid not null,
  property_id uuid,
  gl_account_id uuid,
  account_label text,
  year integer not null default extract(year from now())::int,
  month integer not null default 1,
  amount numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint budget_lines_month_chk check (month between 1 and 12)
);
create index if not exists budget_lines_budget_idx on property.budget_lines (budget_id);
create index if not exists budget_lines_account_idx on property.budget_lines (gl_account_id, year, month);

-- Job costing: unit turns, capital projects and other jobs that ledger lines
-- (and bills) are tagged to.
create table if not exists property.cost_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  kind text not null default 'Capital project',
  property_id uuid,
  property_name text,
  unit_id uuid,
  unit text,
  unit_turn_id uuid,
  budget numeric(14,2) not null default 0,
  starts_on date,
  ends_on date,
  status text not null default 'Open',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cost_jobs_property_idx on property.cost_jobs (property_id);

-- RUBS: a utility bill split across a property's leases.
create table if not exists property.utility_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  property_id uuid,
  property_name text,
  bill_id uuid,
  gl_account_id uuid,
  utility text,
  period_start date,
  period_end date,
  charge_date date,
  total_amount numeric(14,2) not null default 0,
  method text not null default 'sqft',
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists utility_allocations_property_idx on property.utility_allocations (property_id);

-- CAM reconciliation: a commercial property's year of common-area costs vs the
-- estimates billed to each lease.
create table if not exists property.cam_reconciliations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  property_id uuid,
  property_name text,
  year integer not null default extract(year from now())::int,
  budget_amount numeric(14,2) not null default 0,
  actual_amount numeric(14,2) not null default 0,
  gl_account_id uuid,
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cam_reconciliations_property_idx on property.cam_reconciliations (property_id, year);

-- Bills: approvals, job tag and the AP entry they posted.
alter table property.bills add column if not exists approval_status text not null default 'Not required';
alter table property.bills add column if not exists approver_name text;
alter table property.bills add column if not exists approved_at timestamptz;
alter table property.bills add column if not exists job_id uuid;
alter table property.bills add column if not exists unit_id uuid;
alter table property.bills add column if not exists ledger_entry_id uuid;
alter table property.transactions add column if not exists ledger_entry_id uuid;
alter table property.transactions add column if not exists bank_account_id uuid;
create index if not exists bills_job_idx on property.bills (job_id);

do $$
declare t text;
begin
  foreach t in array array['ledger_entries', 'ledger_lines', 'bank_reconciliations', 'budget_lines', 'cost_jobs', 'utility_allocations', 'cam_reconciliations'] loop
    execute format('drop trigger if exists %I on property.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on property.%I for each row execute function property.touch_updated_at()', t || '_touch_updated_at', t);
    execute format('alter table property.%I enable row level security', t);
    execute format('drop policy if exists %I on property.%I', t || '_demo_all', t);
    execute format('create policy %I on property.%I for all to anon, authenticated using (true) with check (true)', t || '_demo_all', t);
    execute format('grant select, insert, update, delete on property.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Deferred balance check: at commit every touched entry's debits equal its credits.
create or replace function property.ledger_check_balance()
returns trigger
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
  v_debit numeric;
  v_credit numeric;
begin
  if tg_op = 'DELETE' then v_entry := old.entry_id; end if;
  if not exists (select 1 from property.ledger_entries where id = v_entry) then return null; end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
  from property.ledger_lines where entry_id = v_entry and deleted_at is null;
  if v_debit <> v_credit then
    raise exception 'ledger: entry % is unbalanced (debits %, credits %)', v_entry, v_debit, v_credit;
  end if;
  return null;
end;
$$;

drop trigger if exists ledger_lines_balance_check on property.ledger_lines;
create constraint trigger ledger_lines_balance_check
after insert or update or delete on property.ledger_lines
deferrable initially deferred
for each row execute function property.ledger_check_balance();

-- Post one balanced entry. p_entry: { id?, project_id, entry_date, memo,
-- source_type, source_id, idempotency_key, property_id, unit_id, lease_id,
-- tenant_id, owner_id, vendor_id, metadata, created_by }. p_lines: [{
-- gl_account_id, debit, credit, memo, <dimension>_id…, applies_to_entry_id }]
-- (line dimensions default to the entry's). Returns the entry id; an existing
-- idempotency_key returns the earlier entry instead of posting twice.
create or replace function property.ledger_post(p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_id uuid := coalesce(nullif(p_entry->>'id', '')::uuid, gen_random_uuid());
  v_project uuid := nullif(p_entry->>'project_id', '')::uuid;
  v_key text := nullif(p_entry->>'idempotency_key', '');
  v_date date := coalesce(nullif(p_entry->>'entry_date', '')::date, current_date);
  v_existing uuid;
  v_line jsonb;
  v_d numeric;
  v_c numeric;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count integer := 0;
begin
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project
    limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'ledger_post: lines must be an array';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_d := round(coalesce(nullif(v_line->>'debit', '')::numeric, 0), 2);
    v_c := round(coalesce(nullif(v_line->>'credit', '')::numeric, 0), 2);
    if v_d < 0 or v_c < 0 then raise exception 'ledger_post: amounts must be positive'; end if;
    if v_d > 0 and v_c > 0 then raise exception 'ledger_post: a line is either a debit or a credit'; end if;
    if (v_d > 0 or v_c > 0) and nullif(v_line->>'gl_account_id', '') is null then
      raise exception 'ledger_post: every line needs a GL account';
    end if;
    v_debit := v_debit + v_d;
    v_credit := v_credit + v_c;
    if v_d > 0 or v_c > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count < 2 then raise exception 'ledger_post: an entry needs at least two lines'; end if;
  if v_debit <> v_credit then
    raise exception 'ledger_post: unbalanced entry (debits %, credits %)', v_debit, v_credit;
  end if;

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, idempotency_key, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_id, v_project, v_date, nullif(p_entry->>'memo', ''),
    coalesce(nullif(p_entry->>'source_type', ''), 'adjustment'),
    nullif(p_entry->>'source_id', '')::uuid, 'posted', v_key, v_debit,
    nullif(p_entry->>'property_id', '')::uuid, nullif(p_entry->>'unit_id', '')::uuid,
    nullif(p_entry->>'lease_id', '')::uuid, nullif(p_entry->>'tenant_id', '')::uuid,
    nullif(p_entry->>'owner_id', '')::uuid, nullif(p_entry->>'vendor_id', '')::uuid,
    coalesce(p_entry->'metadata', '{}'::jsonb), nullif(p_entry->>'created_by', '')::uuid
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    v_project, v_id, v_date, l.n::int, (l.line->>'gl_account_id')::uuid,
    round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2),
    round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2),
    coalesce(nullif(l.line->>'memo', ''), nullif(p_entry->>'memo', '')),
    coalesce(nullif(l.line->>'property_id', ''), nullif(p_entry->>'property_id', ''))::uuid,
    coalesce(nullif(l.line->>'unit_id', ''), nullif(p_entry->>'unit_id', ''))::uuid,
    coalesce(nullif(l.line->>'lease_id', ''), nullif(p_entry->>'lease_id', ''))::uuid,
    coalesce(nullif(l.line->>'tenant_id', ''), nullif(p_entry->>'tenant_id', ''))::uuid,
    coalesce(nullif(l.line->>'owner_id', ''), nullif(p_entry->>'owner_id', ''))::uuid,
    coalesce(nullif(l.line->>'vendor_id', ''), nullif(p_entry->>'vendor_id', ''))::uuid,
    nullif(l.line->>'bank_account_id', '')::uuid,
    nullif(l.line->>'job_id', '')::uuid,
    nullif(l.line->>'applies_to_entry_id', '')::uuid,
    coalesce(l.line->'metadata', '{}'::jsonb),
    nullif(p_entry->>'created_by', '')::uuid
  from jsonb_array_elements(p_lines) with ordinality as l(line, n)
  where round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2) > 0
     or round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2) > 0;

  return v_id;
exception when unique_violation then
  -- A concurrent post with the same idempotency key won the race.
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;
  raise;
end;
$$;

-- Void an entry by posting its mirror image (reversal_of = original) and
-- marking the original void. Reversal lines point at the entry they settle so
-- open-charge math re-opens a voided payment's charges. Returns the reversal id.
create or replace function property.ledger_void(p_entry_id uuid, p_date date default null, p_memo text default null)
returns uuid
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_entry property.ledger_entries;
  v_new uuid := gen_random_uuid();
  v_date date;
begin
  select * into v_entry from property.ledger_entries
  where id = p_entry_id and deleted_at is null
  for update;
  if not found then raise exception 'ledger_void: entry % not found', p_entry_id; end if;
  if v_entry.status = 'void' then raise exception 'ledger_void: entry is already void'; end if;
  if v_entry.reversal_of is not null then raise exception 'ledger_void: a reversal cannot be voided'; end if;
  v_date := greatest(coalesce(p_date, current_date), v_entry.entry_date);

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, reversal_of, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_new, v_entry.project_id, v_date,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(v_entry.memo, v_entry.source_type)),
    v_entry.source_type, v_entry.source_id, 'posted', v_entry.id, v_entry.total,
    v_entry.property_id, v_entry.unit_id, v_entry.lease_id, v_entry.tenant_id, v_entry.owner_id,
    v_entry.vendor_id, jsonb_build_object('voidOf', v_entry.id), v_entry.created_by
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    l.project_id, v_new, v_date, l.line_no, l.gl_account_id, l.credit, l.debit,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(l.memo, '')),
    l.property_id, l.unit_id, l.lease_id, l.tenant_id, l.owner_id, l.vendor_id, l.bank_account_id, l.job_id,
    coalesce(l.applies_to_entry_id, v_entry.id), '{}'::jsonb, l.created_by
  from property.ledger_lines l
  where l.entry_id = v_entry.id and l.deleted_at is null;

  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;

  return v_new;
end;
$$;

-- Idempotently seed a project's default property-management chart. Accounts
-- already present with the same number + type are adopted (tagged with their
-- system key) instead of duplicated. Returns how many accounts were inserted.
create or replace function property.ledger_ensure_default_chart(p_project_id uuid)
returns integer
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_count integer := 0;
  v_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('operating_cash', '1000', 'Operating Cash', 'Asset', 'cash', false, null::text),
      ('trust_cash', '1010', 'Trust Cash', 'Asset', 'cash', true, null),
      ('deposit_cash', '1020', 'Security Deposit Trust Cash', 'Asset', 'cash', true, null),
      ('accounts_receivable', '1200', 'Accounts Receivable', 'Asset', 'receivable', false, null),
      ('capital_improvements', '1500', 'Capital Improvements', 'Asset', 'fixed_asset', false, null),
      ('accounts_payable', '2000', 'Accounts Payable', 'Liability', 'payable', false, null),
      ('security_deposits', '2100', 'Security Deposits Held', 'Liability', 'deposits', true, null),
      ('deposit_interest_payable', '2110', 'Deposit Interest Payable', 'Liability', 'deposits', true, 'security_deposits'),
      ('prepaid_rent', '2200', 'Prepaid Rent & Tenant Credits', 'Liability', 'prepaid', false, null),
      ('owner_equity', '3000', 'Owner Equity', 'Equity', 'equity', false, null),
      ('owner_contributions', '3100', 'Owner Contributions', 'Equity', 'contribution', false, 'owner_equity'),
      ('owner_distributions', '3200', 'Owner Distributions', 'Equity', 'distribution', false, 'owner_equity'),
      ('rent_income', '4000', 'Rental Income', 'Income', 'income', false, null),
      ('late_fee_income', '4010', 'Late Fee Income', 'Income', 'income', false, null),
      ('application_fee_income', '4020', 'Application Fee Income', 'Income', 'income', false, null),
      ('utility_income', '4030', 'Utility Reimbursements', 'Income', 'income', false, null),
      ('cam_income', '4040', 'CAM Recoveries', 'Income', 'income', false, null),
      ('concessions', '4050', 'Concessions & Credits', 'Income', 'contra_income', false, null),
      ('other_income', '4100', 'Other Income', 'Income', 'income', false, null),
      ('management_fee_income', '4500', 'Management Fee Income', 'Income', 'income', false, null),
      ('repairs_maintenance', '5000', 'Repairs & Maintenance', 'Expense', 'expense', false, null),
      ('utilities', '5100', 'Utilities', 'Expense', 'expense', false, null),
      ('insurance', '5200', 'Insurance', 'Expense', 'expense', false, null),
      ('property_taxes', '5300', 'Property Taxes', 'Expense', 'expense', false, null),
      ('management_fees', '5400', 'Management Fees', 'Expense', 'expense', false, null),
      ('payroll', '5500', 'Payroll', 'Expense', 'expense', false, null),
      ('deposit_interest', '5600', 'Deposit Interest Expense', 'Expense', 'expense', false, null),
      ('turnover', '5700', 'Turnover & Make-ready', 'Expense', 'expense', false, null),
      ('bad_debt', '5800', 'Bad Debt', 'Expense', 'expense', false, null)
    ) as t(system_key, number, name, account_type, subtype, is_trust, parent_key)
  loop
    if exists (
      select 1 from property.gl_accounts
      where system_key = r.system_key and project_id is not distinct from p_project_id and deleted_at is null
    ) then
      continue;
    end if;
    select id into v_id from property.gl_accounts
    where project_id is not distinct from p_project_id and deleted_at is null and system_key is null
      and number = r.number and account_type = r.account_type
    limit 1;
    if v_id is not null then
      update property.gl_accounts
      set system_key = r.system_key, is_system = true, is_trust = is_trust or r.is_trust,
          subtype = coalesce(subtype, r.subtype)
      where id = v_id;
    else
      insert into property.gl_accounts (project_id, name, number, account_type, subtype, is_trust, is_system, system_key, status)
      values (p_project_id, r.name, r.number, r.account_type, r.subtype, r.is_trust, true, r.system_key, 'Active');
      v_count := v_count + 1;
    end if;
  end loop;

  -- Hierarchy: point child system accounts at their parents.
  update property.gl_accounts c
  set parent_id = p.id
  from (values ('deposit_interest_payable', 'security_deposits'), ('owner_contributions', 'owner_equity'), ('owner_distributions', 'owner_equity')) as h(child, parent)
  join property.gl_accounts p on p.system_key = h.parent and p.project_id is not distinct from p_project_id and p.deleted_at is null
  where c.system_key = h.child and c.project_id is not distinct from p_project_id and c.deleted_at is null and c.parent_id is null;

  return v_count;
end;
$$;

-- Per-account totals for one sub-ledger dimension (property, unit, lease,
-- tenant, owner, vendor, bank_account, job) as of a date. balance is signed by
-- the account's normal side (assets/expenses debit, the rest credit).
create or replace function property.ledger_subledger(p_dimension text, p_id uuid, p_as_of date default null)
returns table (
  gl_account_id uuid, number text, name text, account_type text, subtype text,
  is_trust boolean, debit numeric, credit numeric, balance numeric
)
language plpgsql
stable
security invoker
set search_path = property
as $$
begin
  if p_dimension not in ('property', 'unit', 'lease', 'tenant', 'owner', 'vendor', 'bank_account', 'job') then
    raise exception 'ledger_subledger: unknown dimension %', p_dimension;
  end if;
  return query execute format(
    'select a.id, a.number, a.name, a.account_type, a.subtype, a.is_trust,
            sum(l.debit), sum(l.credit),
            case when a.account_type in (''Asset'', ''Expense'') then sum(l.debit - l.credit) else sum(l.credit - l.debit) end
     from property.ledger_lines l
     join property.gl_accounts a on a.id = l.gl_account_id
     where l.%I = $1 and l.deleted_at is null and ($2 is null or l.entry_date <= $2)
     group by a.id, a.number, a.name, a.account_type, a.subtype, a.is_trust',
    p_dimension || '_id'
  ) using p_id, p_as_of;
end;
$$;

-- Trial-balance style totals per GL account.
create or replace view property.ledger_account_balances with (security_invoker = true) as
select
  a.project_id, a.id as gl_account_id, a.number, a.name, a.account_type, a.subtype, a.is_trust,
  coalesce(sum(l.debit), 0) as debit,
  coalesce(sum(l.credit), 0) as credit,
  case when a.account_type in ('Asset', 'Expense') then coalesce(sum(l.debit - l.credit), 0)
       else coalesce(sum(l.credit - l.debit), 0) end as balance
from property.gl_accounts a
left join property.ledger_lines l on l.gl_account_id = a.id and l.deleted_at is null
where a.deleted_at is null
group by a.project_id, a.id, a.number, a.name, a.account_type, a.subtype, a.is_trust;

-- Party sub-ledger balances: receivable (lease/tenant), payable (vendor),
-- deposits held, and cash held in trust per owner / property.
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
  coalesce(sum(debit - credit) filter (where account_type = 'Expense'), 0) as expense
from dims
group by project_id, dimension, dimension_id;

-- Trust cash per account × owner × property (negative = a trust shortfall).
create or replace view property.ledger_trust_positions with (security_invoker = true) as
select l.project_id, l.gl_account_id, a.name as account_name, l.owner_id, l.property_id,
       sum(l.debit - l.credit) as balance
from property.ledger_lines l
join property.gl_accounts a on a.id = l.gl_account_id
where l.deleted_at is null and a.is_trust and a.subtype = 'cash'
group by l.project_id, l.gl_account_id, a.name, l.owner_id, l.property_id;

-- Entries whose lines don't net to zero (should never happen via ledger_post).
create or replace view property.ledger_unbalanced_entries with (security_invoker = true) as
select e.project_id, e.id as entry_id, e.entry_date, e.memo,
       coalesce(sum(l.debit), 0) as debit, coalesce(sum(l.credit), 0) as credit
from property.ledger_entries e
left join property.ledger_lines l on l.entry_id = e.id and l.deleted_at is null
where e.deleted_at is null
group by e.project_id, e.id, e.entry_date, e.memo
having coalesce(sum(l.debit), 0) <> coalesce(sum(l.credit), 0) or count(l.id) < 2;

grant select on property.ledger_account_balances, property.ledger_party_balances,
  property.ledger_trust_positions, property.ledger_unbalanced_entries
  to anon, authenticated, service_role;
grant execute on function property.ledger_post(jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function property.ledger_void(uuid, date, text) to anon, authenticated, service_role;
grant execute on function property.ledger_ensure_default_chart(uuid) to anon, authenticated, service_role;
grant execute on function property.ledger_subledger(text, uuid, date) to anon, authenticated, service_role;

-- @down
drop view if exists property.ledger_unbalanced_entries;
drop view if exists property.ledger_trust_positions;
drop view if exists property.ledger_party_balances;
drop view if exists property.ledger_account_balances;
drop function if exists property.ledger_subledger(text, uuid, date);
drop function if exists property.ledger_ensure_default_chart(uuid);
drop function if exists property.ledger_void(uuid, date, text);
drop function if exists property.ledger_post(jsonb, jsonb);
drop trigger if exists ledger_lines_balance_check on property.ledger_lines;
drop function if exists property.ledger_check_balance();
drop index if exists property.bills_job_idx;
alter table property.transactions drop column if exists bank_account_id;
alter table property.transactions drop column if exists ledger_entry_id;
alter table property.bills drop column if exists ledger_entry_id;
alter table property.bills drop column if exists unit_id;
alter table property.bills drop column if exists job_id;
alter table property.bills drop column if exists approved_at;
alter table property.bills drop column if exists approver_name;
alter table property.bills drop column if exists approval_status;
drop table if exists property.cam_reconciliations cascade;
drop table if exists property.utility_allocations cascade;
drop table if exists property.cost_jobs cascade;
drop table if exists property.budget_lines cascade;
drop table if exists property.bank_reconciliations cascade;
drop table if exists property.ledger_lines cascade;
drop table if exists property.ledger_entries cascade;
drop index if exists property.gl_accounts_parent_idx;
drop index if exists property.gl_accounts_system_key_uidx;
alter table property.gl_accounts drop column if exists system_key;
alter table property.gl_accounts drop column if exists parent_id;
alter table property.gl_accounts drop column if exists is_system;
alter table property.gl_accounts drop column if exists is_trust;
alter table property.gl_accounts drop column if exists subtype;
