-- Billing ledger chart (CORE-01, shared by every Part A billing item)
--
-- Redefines property.ledger_ensure_default_chart: ownership moves here from
-- 20261015212744_ledger_core (as 20261015212915_ledger_post_line_dimensions did for
-- ledger_post). Adds the system accounts 1050 undeposited_funds, 1210 deferred_receivable
-- and 2120 other_deposits, and recreates ledger_entries_source_chk with the source types
-- 'concession', 'write_off', 'bank_deposit' and 'payment_plan'. Existing charts gain the
-- new accounts lazily: lib/ledger/store.js REQUIRED_KEYS re-runs this function.
-- Redefine this function once per release (coordinate with CORE-40+ and HOUS-01).

-- @up
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
      ('undeposited_funds', '1050', 'Undeposited Funds', 'Asset', 'cash', true, null),
      ('accounts_receivable', '1200', 'Accounts Receivable', 'Asset', 'receivable', false, null),
      ('deferred_receivable', '1210', 'Deferred Receivable', 'Asset', 'deferred_receivable', false, null),
      ('capital_improvements', '1500', 'Capital Improvements', 'Asset', 'fixed_asset', false, null),
      ('accounts_payable', '2000', 'Accounts Payable', 'Liability', 'payable', false, null),
      ('security_deposits', '2100', 'Security Deposits Held', 'Liability', 'deposits', true, null),
      ('deposit_interest_payable', '2110', 'Deposit Interest Payable', 'Liability', 'deposits', true, 'security_deposits'),
      ('other_deposits', '2120', 'Other Deposits Held', 'Liability', 'deposits', true, null),
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

grant execute on function property.ledger_ensure_default_chart(uuid) to anon, authenticated, service_role;

alter table property.ledger_entries drop constraint if exists ledger_entries_source_chk;
alter table property.ledger_entries add constraint ledger_entries_source_chk check (source_type in (
  'charge', 'payment', 'credit', 'bill', 'bill_payment', 'distribution', 'contribution',
  'management_fee', 'deposit_held', 'deposit_return', 'late_fee', 'adjustment', 'deposit_interest',
  'concession', 'write_off', 'bank_deposit', 'payment_plan'
));

-- @down
alter table property.ledger_entries drop constraint if exists ledger_entries_source_chk;
alter table property.ledger_entries add constraint ledger_entries_source_chk check (source_type in (
  'charge', 'payment', 'credit', 'bill', 'bill_payment', 'distribution', 'contribution',
  'management_fee', 'deposit_held', 'deposit_return', 'late_fee', 'adjustment', 'deposit_interest'
));

-- Restores the 20261015212744_ledger_core body.
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

  update property.gl_accounts c
  set parent_id = p.id
  from (values ('deposit_interest_payable', 'security_deposits'), ('owner_contributions', 'owner_equity'), ('owner_distributions', 'owner_equity')) as h(child, parent)
  join property.gl_accounts p on p.system_key = h.parent and p.project_id is not distinct from p_project_id and p.deleted_at is null
  where c.system_key = h.child and c.project_id is not distinct from p_project_id and c.deleted_at is null and c.parent_id is null;

  return v_count;
end;
$$;

grant execute on function property.ledger_ensure_default_chart(uuid) to anon, authenticated, service_role;
