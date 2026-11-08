-- Ledger aggregates (CORE-41)
--
-- Owns property.ledger_period_totals, property.ledger_balances_as_of, property.ledger_cash_flow_totals and the index
-- property.ledger_lines_project_date_acct_idx: period-bounded, server-side ledger totals so reports stop paging the whole ledger.
-- Readers: lib/reports/ledger_load.js (browser and server). The pure mirror in lib/reports/aggregates.js (referenceTotals) serves
--   the playground sandbox and the tests, so a change here changes it too.
-- Security (PLAT-01c): security definer, search_path '', a project is required, and a signed-in caller needs
--   property.accounting.view on it (the read gate PLAT-01d puts on ledger_lines); revoked from PUBLIC and anon.
-- Scope: one project's live lines only (project_id = p_project_id, deleted_at is null); there is no null-project fallback (PLAT-01b).
-- owner_id is the owner tag as lib/ledger/ownership.js ownerTagOf counts it: only lines of owner-specific entries
--   (distribution / contribution, or metadata.ownerExplicit) keep it. Property-level lines carry none (CORE-08).
-- p_owner_id narrows to the lines that can belong to that owner (their tagged lines, plus untagged non-manager lines on properties
--   they have held); amounts are NOT split: shares are dated, so callers ask for grain 'day' and apply lineAllocation in JS.
-- period is the start of the line's day / month / year bucket, clamped to p_from so a non-aligned range never leaks before it;
--   grain 'range' returns p_from (null when p_from is null).

-- @up

create index if not exists ledger_lines_project_date_acct_idx
  on property.ledger_lines (project_id, entry_date, gl_account_id)
  where deleted_at is null;

-- Debit and credit totals per period × account × property × owner tag × bank account.
create or replace function property.ledger_period_totals(
  p_project_id uuid,
  p_from date,
  p_to date,
  p_grain text default 'month',
  p_property_ids uuid[] default null,
  p_owner_id uuid default null
)
returns table (
  period date,
  gl_account_id uuid,
  property_id uuid,
  owner_id uuid,
  bank_account_id uuid,
  debit numeric,
  credit numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_project_id is null then
    raise exception 'ledger_period_totals: a project is required' using errcode = '22023';
  end if;
  if not property.is_trusted_session() and not property.rbac_allows('property.accounting.view', p_project_id) then
    raise exception 'You don''t have permission to read the ledger.' using errcode = '42501';
  end if;
  if coalesce(p_grain, '') not in ('day', 'month', 'year', 'range') then
    raise exception 'ledger_period_totals: grain must be day, month, year or range' using errcode = '22023';
  end if;

  return query
  with w as (
    select
      l.entry_date as d,
      l.gl_account_id as acct,
      l.property_id as prop,
      l.bank_account_id as bank,
      l.debit as dr,
      l.credit as cr,
      case
        when l.owner_id is null then null
        when exists (
          select 1 from property.ledger_entries e
           where e.id = l.entry_id
             and e.deleted_at is null
             and e.source_type not in ('distribution', 'contribution')
             and coalesce(e.metadata -> 'ownerExplicit', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '""'::jsonb, '0'::jsonb)
        ) then null
        else l.owner_id
      end as tag,
      coalesce(l.metadata ->> 'side', '') = 'manager' as manager_side
    from property.ledger_lines l
    where l.project_id = p_project_id
      and l.deleted_at is null
      and (p_from is null or l.entry_date >= p_from)
      and (p_to is null or l.entry_date <= p_to)
      and (p_property_ids is null or l.property_id = any (p_property_ids))
  )
  select
    case p_grain
      when 'day' then w.d
      when 'month' then greatest(date_trunc('month', w.d::timestamp)::date, p_from)
      when 'year' then greatest(date_trunc('year', w.d::timestamp)::date, p_from)
      else p_from
    end,
    w.acct,
    w.prop,
    w.tag,
    w.bank,
    sum(w.dr)::numeric,
    sum(w.cr)::numeric
  from w
  where p_owner_id is null
     or (
       not w.manager_side
       and (
         w.tag = p_owner_id
         or (w.tag is null and w.prop in (
           select po.property_id from property.property_owners po
            where po.project_id = p_project_id and po.owner_id = p_owner_id and po.deleted_at is null
         ))
       )
     )
  group by 1, 2, 3, 4, 5
  order by 1, 2, 3, 4, 5;
end;
$$;

-- Cumulative debit and credit totals through p_as_of (null: all history), same dimensions and scope as ledger_period_totals.
create or replace function property.ledger_balances_as_of(
  p_project_id uuid,
  p_as_of date,
  p_property_ids uuid[] default null,
  p_owner_id uuid default null
)
returns table (
  gl_account_id uuid,
  property_id uuid,
  owner_id uuid,
  bank_account_id uuid,
  debit numeric,
  credit numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_project_id is null then
    raise exception 'ledger_balances_as_of: a project is required' using errcode = '22023';
  end if;
  if not property.is_trusted_session() and not property.rbac_allows('property.accounting.view', p_project_id) then
    raise exception 'You don''t have permission to read the ledger.' using errcode = '42501';
  end if;

  return query
  select t.gl_account_id, t.property_id, t.owner_id, t.bank_account_id, t.debit, t.credit
  from property.ledger_period_totals(p_project_id, null, p_as_of, 'range', p_property_ids, p_owner_id) t
  order by 1, 2, 3, 4;
end;
$$;

-- Net cash movement per entry (cash-subtype accounts, so transfers between them net to zero), summed per period × source type
--   into inflow (entries that added cash) and outflow (entries that took it), as lib/reports/ledger_math.js cashFlow counts it.
create or replace function property.ledger_cash_flow_totals(
  p_project_id uuid,
  p_from date,
  p_to date,
  p_grain text default 'month',
  p_property_ids uuid[] default null
)
returns table (
  period date,
  source_type text,
  inflow numeric,
  outflow numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_project_id is null then
    raise exception 'ledger_cash_flow_totals: a project is required' using errcode = '22023';
  end if;
  if not property.is_trusted_session() and not property.rbac_allows('property.accounting.view', p_project_id) then
    raise exception 'You don''t have permission to read the ledger.' using errcode = '42501';
  end if;
  if coalesce(p_grain, '') not in ('day', 'month', 'year', 'range') then
    raise exception 'ledger_cash_flow_totals: grain must be day, month, year or range' using errcode = '22023';
  end if;

  return query
  with moves as (
    select l.entry_id as entry, min(l.entry_date) as d, sum(l.debit - l.credit) as delta
    from property.ledger_lines l
    join property.gl_accounts a on a.id = l.gl_account_id
    where l.project_id = p_project_id
      and l.deleted_at is null
      and a.project_id = p_project_id
      and a.deleted_at is null
      and a.subtype = 'cash'
      and (p_from is null or l.entry_date >= p_from)
      and (p_to is null or l.entry_date <= p_to)
      and (p_property_ids is null or l.property_id = any (p_property_ids))
    group by l.entry_id
  )
  select
    case p_grain
      when 'day' then m.d
      when 'month' then greatest(date_trunc('month', m.d::timestamp)::date, p_from)
      when 'year' then greatest(date_trunc('year', m.d::timestamp)::date, p_from)
      else p_from
    end,
    coalesce(e.source_type, ''),
    coalesce(sum(m.delta) filter (where m.delta > 0), 0)::numeric,
    coalesce(sum(-m.delta) filter (where m.delta < 0), 0)::numeric
  from moves m
  left join property.ledger_entries e on e.id = m.entry and e.deleted_at is null
  where m.delta <> 0
  group by 1, 2
  order by 1, 2;
end;
$$;

revoke all on function property.ledger_period_totals(uuid, date, date, text, uuid[], uuid) from public, anon;
revoke all on function property.ledger_balances_as_of(uuid, date, uuid[], uuid) from public, anon;
revoke all on function property.ledger_cash_flow_totals(uuid, date, date, text, uuid[]) from public, anon;
grant execute on function property.ledger_period_totals(uuid, date, date, text, uuid[], uuid) to authenticated, service_role;
grant execute on function property.ledger_balances_as_of(uuid, date, uuid[], uuid) to authenticated, service_role;
grant execute on function property.ledger_cash_flow_totals(uuid, date, date, text, uuid[]) to authenticated, service_role;

-- @down

drop function if exists property.ledger_cash_flow_totals(uuid, date, date, text, uuid[]);
drop function if exists property.ledger_balances_as_of(uuid, date, uuid[], uuid);
drop function if exists property.ledger_period_totals(uuid, date, date, text, uuid[], uuid);
drop index if exists property.ledger_lines_project_date_acct_idx;
