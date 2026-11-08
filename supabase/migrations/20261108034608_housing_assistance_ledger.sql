-- Housing assistance ledger (HOUS-01): voucher rent splits between the tenant and the housing authority.
--
-- Redefines property.ledger_ensure_default_chart: ownership moves here from 20261108002558_billing_ledger_chart
-- (which took it from 20261015212744_ledger_core), keeping every CORE-01 account.
-- Adds 1220 subsidy_receivable (Housing Assistance Receivable; 1210 is CORE-01's deferred_receivable) and
-- 4055 hap_abatements (contra income; 4060 is a custom account in the demo chart and CORE-68's planned Percentage Rent).
-- Chart guard: a same-number custom account is adopted only when its subtype is unset or matches; otherwise a second
-- system account with the same number is inserted. A duplicate number is visible and harmless, while taking over a
-- custom account would silently move its history into a system sub-ledger under the wrong subtype (a custom 1220
-- with subtype receivable would count HAP as tenant AR). Existing charts gain the accounts lazily
-- (lib/ledger/store.js REQUIRED_KEYS). No new tables, no backfill, no source-type change.

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
      ('subsidy_receivable', '1220', 'Housing Assistance Receivable', 'Asset', 'subsidy_receivable', false, null),
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
      ('hap_abatements', '4055', 'HAP Abatements', 'Income', 'contra_income', false, null),
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
      and number = r.number and account_type = r.account_type and (subtype is null or subtype = r.subtype)
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

-- @down
-- Restores the 20261108002558_billing_ledger_chart body.
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
