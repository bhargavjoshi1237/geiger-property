-- Period lock: bank deposits (CORE-40 with CORE-16)
-- Redefines and now owns property.ledger_lines_period_lock() (from 20261108054109_accounting_periods): a closed line's bank_deposit_id may
--   change too, because CORE-16 stamps it on a payment's 1050 Undeposited Funds line when the payment is deposited (and clears it when the
--   deposit is voided); the deposit itself posts on its own, open date. Amounts, accounts, dates and dimensions stay locked.

-- @up
-- Lines: same date rule; on a closed line only the reconciliation and deposit links and metadata change, so bank work still clears old lines.
create or replace function property.ledger_lines_period_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free text[] := array['cleared', 'cleared_on', 'reconciliation_id', 'bank_deposit_id', 'metadata', 'updated_at'];
  v_project uuid;
  v_locked date;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_free) is not distinct from (to_jsonb(old) - v_free) then
      return new;
    end if;
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.projects pr where pr.id = old.project_id) then
      return old;
    end if;
    v_project := old.project_id;
  else
    v_project := new.project_id;
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('accounting_periods:' || coalesce(v_project::text, '')));
  if tg_op <> 'INSERT' then
    select max(p.period_end) into v_locked from property.accounting_periods p
     where p.project_id = old.project_id and p.status = 'closed' and p.deleted_at is null;
    if old.entry_date <= v_locked then
      raise exception 'ledger: period closed through %', v_locked using errcode = 'GL001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select max(p.period_end) into v_locked from property.accounting_periods p
   where p.project_id = new.project_id and p.status = 'closed' and p.deleted_at is null;
  if new.entry_date <= v_locked then
    raise exception 'ledger: period closed through %', v_locked using errcode = 'GL001';
  end if;
  return new;
end;
$$;
revoke all on function property.ledger_lines_period_lock() from public, anon;

-- @down
create or replace function property.ledger_lines_period_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free text[] := array['cleared', 'cleared_on', 'reconciliation_id', 'metadata', 'updated_at'];
  v_project uuid;
  v_locked date;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_free) is not distinct from (to_jsonb(old) - v_free) then
      return new;
    end if;
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.projects pr where pr.id = old.project_id) then
      return old;
    end if;
    v_project := old.project_id;
  else
    v_project := new.project_id;
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('accounting_periods:' || coalesce(v_project::text, '')));
  if tg_op <> 'INSERT' then
    select max(p.period_end) into v_locked from property.accounting_periods p
     where p.project_id = old.project_id and p.status = 'closed' and p.deleted_at is null;
    if old.entry_date <= v_locked then
      raise exception 'ledger: period closed through %', v_locked using errcode = 'GL001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select max(p.period_end) into v_locked from property.accounting_periods p
   where p.project_id = new.project_id and p.status = 'closed' and p.deleted_at is null;
  if new.entry_date <= v_locked then
    raise exception 'ledger: period closed through %', v_locked using errcode = 'GL001';
  end if;
  return new;
end;
$$;
revoke all on function property.ledger_lines_period_lock() from public, anon;
