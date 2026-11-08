-- Security deposits on the ledger (CORE-04)
--
-- security_deposits gains its ledger links (charge_entry_id = the entry that put the liability on the books,
-- apply_entry_id = the disposition's apply entry, refund_bill_id = the AP refund bill), interest_bearing and kind
-- (both backfilled from metadata). bills gains a payee (vendor | tenant | owner) for tenant refunds and later owner
-- payouts. Deposit postings carry line metadata { depositId }; property.deposit_link_ledger tags a pre-CORE-04
-- deposit's existing ledger lines to its record when the match is unambiguous, and the backfill runs it once for
-- every open record. Owns property.deposit_link_ledger(uuid).

-- @up
alter table property.security_deposits add column if not exists charge_entry_id uuid;
alter table property.security_deposits add column if not exists apply_entry_id uuid;
alter table property.security_deposits add column if not exists refund_bill_id uuid;
alter table property.security_deposits add column if not exists interest_bearing boolean not null default false;
alter table property.security_deposits add column if not exists kind text not null default 'Security deposit';

update property.security_deposits
set interest_bearing = true
where interest_bearing = false and lower(coalesce(metadata->>'interestBearing', '')) = 'true';

update property.security_deposits
set kind = metadata->>'depositKind'
where coalesce(metadata->>'depositKind', '') <> '' and kind is distinct from metadata->>'depositKind';

alter table property.bills add column if not exists payee_type text not null default 'vendor';
alter table property.bills add column if not exists tenant_id uuid;
alter table property.bills add column if not exists owner_id uuid;
alter table property.bills drop constraint if exists bills_payee_type_chk;
alter table property.bills add constraint bills_payee_type_chk check (payee_type in ('vendor', 'tenant', 'owner'));
create index if not exists bills_payee_tenant_idx on property.bills (payee_type, tenant_id) where deleted_at is null;

-- Per-record deposit balances read lines by metadata.depositId.
create index if not exists ledger_lines_deposit_idx on property.ledger_lines ((metadata->>'depositId')) where metadata ? 'depositId';

-- Tag a deposit record's pre-CORE-04 ledger lines (2100 / 2110 / 1020 on its lease and the leases it renewed) when
-- unambiguous: one untagged deposit_held entry of exactly its amount, else the chain's only open record whose untagged
-- 2100 balance equals its amount. Returns the amount linked (0 when nothing was linked or it was already linked).
create or replace function property.deposit_link_ledger(p_deposit_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = property
as $$
declare
  d property.security_deposits;
  v_chain uuid[];
  v_entry uuid;
  v_count int;
  v_net numeric;
  v_open text[] := array['Pending', 'Held', 'Awaiting disposition'];
  v_keys text[] := array['security_deposits', 'deposit_interest_payable', 'deposit_cash'];
begin
  select * into d from property.security_deposits where id = p_deposit_id and deleted_at is null;
  if not found or d.lease_id is null or coalesce(d.amount, 0) <= 0 or not (d.status = any(v_open)) then
    return 0;
  end if;
  if exists (select 1 from property.ledger_lines where metadata->>'depositId' = d.id::text and deleted_at is null) then
    return 0;
  end if;

  with recursive chain(id) as (
    select d.lease_id
    union
    select l.renewal_of_id from property.leases l join chain c on l.id = c.id where l.renewal_of_id is not null
  )
  select array_agg(id) into v_chain from chain;

  -- Rule 1: the only untagged deposit_held entry of its amount, and the only open record of that amount on the chain.
  select count(*), min(e.id::text)::uuid into v_count, v_entry
  from property.ledger_entries e
  where e.project_id is not distinct from d.project_id
    and e.deleted_at is null and e.status = 'posted' and e.reversal_of is null
    and e.source_type = 'deposit_held' and e.lease_id = any(v_chain) and e.total = d.amount
    and not exists (select 1 from property.ledger_lines x where x.entry_id = e.id and x.metadata ? 'depositId');
  if v_count = 1 and (
    select count(*) from property.security_deposits s
    where s.lease_id = any(v_chain) and s.deleted_at is null and s.status = any(v_open) and s.amount = d.amount
  ) = 1 then
    update property.ledger_lines l
    set metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object('depositId', d.id, 'depositLinked', true)
    from property.gl_accounts a
    where a.id = l.gl_account_id and l.entry_id = v_entry and l.deleted_at is null and a.system_key = any(v_keys);
    update property.security_deposits set charge_entry_id = coalesce(charge_entry_id, v_entry) where id = d.id;
    return d.amount;
  end if;

  -- Rule 2: the chain's only open record, and its untagged 2100 balance is exactly the record's amount.
  if (select count(*) from property.security_deposits s where s.lease_id = any(v_chain) and s.deleted_at is null and s.status = any(v_open)) <> 1 then
    return 0;
  end if;
  select coalesce(sum(l.credit - l.debit), 0) into v_net
  from property.ledger_lines l join property.gl_accounts a on a.id = l.gl_account_id
  where l.project_id is not distinct from d.project_id and l.deleted_at is null and l.lease_id = any(v_chain)
    and a.system_key = 'security_deposits' and not (l.metadata ? 'depositId');
  if v_net <> d.amount then
    return 0;
  end if;
  update property.ledger_lines l
  set metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object('depositId', d.id, 'depositLinked', true)
  from property.gl_accounts a
  where a.id = l.gl_account_id and l.project_id is not distinct from d.project_id and l.deleted_at is null
    and l.lease_id = any(v_chain) and a.system_key = any(v_keys) and not (l.metadata ? 'depositId');
  select l.entry_id into v_entry
  from property.ledger_lines l join property.gl_accounts a on a.id = l.gl_account_id
  where l.metadata->>'depositId' = d.id::text and l.deleted_at is null and a.system_key = 'security_deposits' and l.credit > 0
  order by l.entry_date, l.created_at
  limit 1;
  update property.security_deposits set charge_entry_id = coalesce(charge_entry_id, v_entry) where id = d.id;
  return d.amount;
end;
$$;

revoke all on function property.deposit_link_ledger(uuid) from public;
grant execute on function property.deposit_link_ledger(uuid) to service_role;

-- Backfill: link every open record that holds money (Held / Awaiting disposition) to its existing lines.
do $$
declare
  r record;
begin
  for r in
    select id from property.security_deposits
    where deleted_at is null and status in ('Held', 'Awaiting disposition') and lease_id is not null
    order by created_at, id
  loop
    perform property.deposit_link_ledger(r.id);
  end loop;
end;
$$;

-- @down
update property.ledger_lines
set metadata = metadata - 'depositId' - 'depositLinked'
where metadata ? 'depositLinked';
drop function if exists property.deposit_link_ledger(uuid);
drop index if exists property.ledger_lines_deposit_idx;
drop index if exists property.bills_payee_tenant_idx;
alter table property.bills drop constraint if exists bills_payee_type_chk;
alter table property.bills drop column if exists owner_id;
alter table property.bills drop column if exists tenant_id;
alter table property.bills drop column if exists payee_type;
alter table property.security_deposits drop column if exists kind;
alter table property.security_deposits drop column if exists interest_bearing;
alter table property.security_deposits drop column if exists refund_bill_id;
alter table property.security_deposits drop column if exists apply_entry_id;
alter table property.security_deposits drop column if exists charge_entry_id;
