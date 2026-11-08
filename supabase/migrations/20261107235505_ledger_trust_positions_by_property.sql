-- Ledger trust positions by property (CORE-08)
--
-- Owns property.ledger_trust_positions (moved from 20261015212744_ledger_core). Trust cash is now grouped by
-- project × account × property: property-level postings no longer carry an owner, so each owner's position is
-- their share of the property's trust plus their own distributions and contributions, computed at report time
-- (trustPositions in lib/reports/ledger_math.js). The view drops owner_id, so it is dropped and recreated.

-- @up
drop view if exists property.ledger_trust_positions;

-- Trust cash per account × property (negative = a trust shortfall on that property).
create view property.ledger_trust_positions with (security_invoker = true) as
select l.project_id, l.gl_account_id, a.name as account_name, l.property_id,
       sum(l.debit - l.credit) as balance
from property.ledger_lines l
join property.gl_accounts a on a.id = l.gl_account_id
where l.deleted_at is null and a.is_trust and a.subtype = 'cash'
group by l.project_id, l.gl_account_id, a.name, l.property_id;

grant select on property.ledger_trust_positions to anon, authenticated, service_role;

-- @down
drop view if exists property.ledger_trust_positions;

-- Trust cash per account × owner × property (negative = a trust shortfall).
create view property.ledger_trust_positions with (security_invoker = true) as
select l.project_id, l.gl_account_id, a.name as account_name, l.owner_id, l.property_id,
       sum(l.debit - l.credit) as balance
from property.ledger_lines l
join property.gl_accounts a on a.id = l.gl_account_id
where l.deleted_at is null and a.is_trust and a.subtype = 'cash'
group by l.project_id, l.gl_account_id, a.name, l.owner_id, l.property_id;

grant select on property.ledger_trust_positions to anon, authenticated, service_role;
