-- Ledger AR views (CORE-07)
--
-- Owns property.ledger_ar_monthly: tenant AR (subtype 'receivable', so HAP's subsidy_receivable stays out, HOUS-01) per
-- project × property × lease × tenant × month, bucketed by the entry's source type. Dashboards read the monthly trend here;
-- balances keep reading property.ledger_party_balances (20261015212744_ledger_core). Buckets are gross sides, so a void's
-- reversal lands in `net` only; Σ net over every month equals the lease's ledger_party_balances.receivable.
-- No new index: the monthly scan uses ledger_lines_account_idx (gl_account_id, entry_date), ~4 ms on the demo project.

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
  coalesce(sum(l.debit - l.credit), 0)::numeric(14,2) as net
from property.ledger_lines l
join property.gl_accounts a on a.id = l.gl_account_id
join property.ledger_entries e on e.id = l.entry_id
where l.deleted_at is null and a.subtype = 'receivable'
group by l.project_id, l.property_id, l.lease_id, l.tenant_id, date_trunc('month', l.entry_date)::date;

-- Signed-in staff and the service role only (PLAT-01c: nothing new opens to anon).
grant select on property.ledger_ar_monthly to authenticated, service_role;

-- @down
drop view if exists property.ledger_ar_monthly;
