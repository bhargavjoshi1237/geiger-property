-- Deposit link guard (CORE-04 review)
--
-- Redefines property.deposit_link_ledger (owned by 20261108034623_security_deposits_ledger_links): rule 1 now also needs
-- the chain's untagged 2100 balance to cover the deposit, so a new deposit never attaches to an old, already-refunded
-- entry; a Pending record it links becomes Held; it runs security definer with an empty search_path, executable by
-- service_role only (PLAT-01c lockdown). ledger_lines_deposit_idx becomes a plain expression index so the
-- metadata->>depositId reads use it.

-- @up
create or replace function property.deposit_link_ledger(p_deposit_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
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

  -- The chain's 2100 balance no record owns yet: nothing links beyond it.
  select coalesce(sum(l.credit - l.debit), 0) into v_net
  from property.ledger_lines l join property.gl_accounts a on a.id = l.gl_account_id
  where l.project_id is not distinct from d.project_id and l.deleted_at is null and l.lease_id = any(v_chain)
    and a.system_key = 'security_deposits' and not (l.metadata ? 'depositId');

  -- Rule 1: the only untagged deposit_held entry of its amount, the only open record of that amount, and the untagged balance still covers it.
  select count(*), min(e.id::text)::uuid into v_count, v_entry
  from property.ledger_entries e
  where e.project_id is not distinct from d.project_id
    and e.deleted_at is null and e.status = 'posted' and e.reversal_of is null
    and e.source_type = 'deposit_held' and e.lease_id = any(v_chain) and e.total = d.amount
    and not exists (select 1 from property.ledger_lines x where x.entry_id = e.id and x.metadata ? 'depositId');
  if v_count = 1 and v_net >= d.amount and (
    select count(*) from property.security_deposits s
    where s.lease_id = any(v_chain) and s.deleted_at is null and s.status = any(v_open) and s.amount = d.amount
  ) = 1 then
    update property.ledger_lines l
    set metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object('depositId', d.id, 'depositLinked', true)
    from property.gl_accounts a
    where a.id = l.gl_account_id and l.entry_id = v_entry and l.deleted_at is null and a.system_key = any(v_keys);
    update property.security_deposits
    set charge_entry_id = coalesce(charge_entry_id, v_entry), status = case when status = 'Pending' then 'Held' else status end
    where id = d.id;
    return d.amount;
  end if;

  -- Rule 2: the chain's only open record, and its untagged 2100 balance is exactly the record's amount.
  if (select count(*) from property.security_deposits s where s.lease_id = any(v_chain) and s.deleted_at is null and s.status = any(v_open)) <> 1 then
    return 0;
  end if;
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
  update property.security_deposits
  set charge_entry_id = coalesce(charge_entry_id, v_entry), status = case when status = 'Pending' then 'Held' else status end
  where id = d.id;
  return d.amount;
end;
$$;

revoke all on function property.deposit_link_ledger(uuid) from public, anon, authenticated;
grant execute on function property.deposit_link_ledger(uuid) to service_role;

drop index if exists property.ledger_lines_deposit_idx;
create index if not exists ledger_lines_deposit_idx on property.ledger_lines ((metadata->>'depositId'));

-- @down
drop index if exists property.ledger_lines_deposit_idx;
create index if not exists ledger_lines_deposit_idx on property.ledger_lines ((metadata->>'depositId')) where metadata ? 'depositId';

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
