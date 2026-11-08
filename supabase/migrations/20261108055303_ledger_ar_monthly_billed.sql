-- Ledger AR monthly: billed buckets (CORE-07)
--
-- Appends deposits_charged (AR debits from deposit_held) and billing_credits (AR credits from credit and concession:
-- courtesy credits, concessions and downward rent true-ups) to property.ledger_ar_monthly, so the Overview trend's
-- billed figure = charged − deposits_charged − billing_credits, the same definition the collection-rate metric uses
-- (billedOf in lib/ledger/ar_buckets.js). Deposits are held funds, not billed income. Existing columns are unchanged.

-- @up
create or replace view property.ledger_ar_monthly with (security_invoker = true) as
select
  l.project_id,
  l.property_id,
  l.lease_id,
  l.tenant_id,
  date_trunc('month', l.entry_date)::date as month,
  coalesce(sum(l.debit) filter (where e.source_type in ('charge', 'late_fee', 'deposit_held')), 0)::numeric(14,2) as charged,
  coalesce(sum(l.credit) filter (where e.source_type = 'payment'), 0)::numeric(14,2) as collected,
  coalesce(sum(l.credit) filter (where e.source_type in ('concession', 'credit', 'write_off', 'deposit_return')), 0)::numeric(14,2) as credited,
  coalesce(sum(l.debit - l.credit) filter (where e.source_type = 'adjustment'), 0)::numeric(14,2) as transferred,
  coalesce(sum(l.debit - l.credit), 0)::numeric(14,2) as net,
  coalesce(sum(l.debit) filter (where e.source_type = 'deposit_held'), 0)::numeric(14,2) as deposits_charged,
  coalesce(sum(l.credit) filter (where e.source_type in ('credit', 'concession')), 0)::numeric(14,2) as billing_credits
from property.ledger_lines l
join property.gl_accounts a on a.id = l.gl_account_id
join property.ledger_entries e on e.id = l.entry_id
where l.deleted_at is null and a.subtype = 'receivable'
group by l.project_id, l.property_id, l.lease_id, l.tenant_id, date_trunc('month', l.entry_date)::date;

grant select on property.ledger_ar_monthly to authenticated, service_role;

-- @down
drop view if exists property.ledger_ar_monthly;

create view property.ledger_ar_monthly with (security_invoker = true) as
select
  l.project_id,
  l.property_id,
  l.lease_id,
  l.tenant_id,
  date_trunc('month', l.entry_date)::date as month,
  coalesce(sum(l.debit) filter (where e.source_type in ('charge', 'late_fee', 'deposit_held')), 0)::numeric(14,2) as charged,
  coalesce(sum(l.credit) filter (where e.source_type = 'payment'), 0)::numeric(14,2) as collected,
  coalesce(sum(l.credit) filter (where e.source_type in ('concession', 'credit', 'write_off', 'deposit_return')), 0)::numeric(14,2) as credited,
  coalesce(sum(l.debit - l.credit) filter (where e.source_type = 'adjustment'), 0)::numeric(14,2) as transferred,
  coalesce(sum(l.debit - l.credit), 0)::numeric(14,2) as net
from property.ledger_lines l
join property.gl_accounts a on a.id = l.gl_account_id
join property.ledger_entries e on e.id = l.entry_id
where l.deleted_at is null and a.subtype = 'receivable'
group by l.project_id, l.property_id, l.lease_id, l.tenant_id, date_trunc('month', l.entry_date)::date;

grant select on property.ledger_ar_monthly to authenticated, service_role;
