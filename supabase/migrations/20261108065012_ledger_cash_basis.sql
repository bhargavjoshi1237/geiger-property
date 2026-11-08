-- Ledger cash basis (CORE-44)
--
-- Owns property.ledger_cash_basis_totals: the cash-basis view of the accrual ledger, same columns as ledger_period_totals (owner and
--   bank are null). Readers: lib/reports/ledger_load.js (ledgerTotals with basis "cash"). The pure mirror is lib/reports/cash_basis.js
--   (cashBasisReference, served by aggregates.referenceTotals to the playground and the tests), so a change here changes it too.
-- Method: income/expense lines of entries with no receivable or payable line count as posted. A charge or bill counts as it's
--   settled: each receivable/payable line of an entry with no income/expense (payments, NSF returns, deposits applied, bill
--   payments) is spread over the income/expense lines of the entry it applies to (applies_to_entry_id, else the line's
--   metadata.transferredEntryId, following lease transfers up to 8 hops), pro rata in whole cents (largest remainder, ties by line
--   id). Cash posted inside a charge entry settles that entry on its date. A converted opening balance (metadata.conversion) with
--   metadata.chargeGl stands in for that income account. Settlements that trace to no income/expense, converted opening balances and
--   charges whose income/expense nets to zero stay on their receivable/payable account, so
--   cash-basis net income = accrual net income − increase in receivables + increase in payables + Σ (debit − credit) of those rows.
-- Security (PLAT-01c): security definer, search_path '', a project is required, and a signed-in caller needs property.accounting.view
--   on it; revoked from PUBLIC and anon. Scope: one project's live lines; p_property_ids filters the recognized property.

-- @up

create or replace function property.ledger_cash_basis_totals(
  p_project_id uuid,
  p_from date,
  p_to date,
  p_grain text default 'month',
  p_property_ids uuid[] default null
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
    raise exception 'ledger_cash_basis_totals: a project is required' using errcode = '22023';
  end if;
  if not property.is_trusted_session() and not property.rbac_allows('property.accounting.view', p_project_id) then
    raise exception 'You don''t have permission to read the ledger.' using errcode = '42501';
  end if;
  if coalesce(p_grain, '') not in ('day', 'month', 'year', 'range') then
    raise exception 'ledger_cash_basis_totals: grain must be day, month, year or range' using errcode = '22023';
  end if;

  return query
  with recursive
  acct as (
    select
      a.id,
      a.account_type,
      case
        when a.account_type in ('Income', 'Expense') then 'pnl'
        when a.subtype in ('receivable', 'subsidy_receivable', 'deferred_receivable', 'payable') then 'arap'
        else 'other'
      end as cls
    from property.gl_accounts a
    where a.project_id = p_project_id
      and a.deleted_at is null
  ),
  win as (
    select
      l.id,
      l.entry_id,
      l.entry_date as d,
      l.gl_account_id as acct,
      l.property_id as prop,
      l.debit as dr,
      l.credit as cr,
      l.applies_to_entry_id as applies,
      case
        when (l.metadata ->> 'transferredEntryId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (l.metadata ->> 'transferredEntryId')::uuid
      end as moved_from,
      coalesce(c.cls, 'other') as cls
    from property.ledger_lines l
    left join acct c on c.id = l.gl_account_id
    where l.project_id = p_project_id
      and l.deleted_at is null
      and (p_from is null or l.entry_date >= p_from)
      and (p_to is null or l.entry_date <= p_to)
  ),
  ent as (
    select
      w.entry_id,
      min(w.d) as d,
      bool_or(w.cls = 'pnl') as has_pnl,
      bool_or(w.cls = 'arap') as has_arap,
      coalesce(sum(round((w.cr - w.dr) * 100)) filter (where w.cls = 'pnl'), 0)::bigint as n_c,
      coalesce(sum(round((w.dr - w.cr) * 100)) filter (where w.cls = 'other'), 0)::bigint as x_c,
      coalesce(bool_or(e.metadata -> 'conversion' = 'true'::jsonb), false) as conv
    from win w
    left join property.ledger_entries e on e.id = w.entry_id and e.deleted_at is null
    group by w.entry_id
  ),
  settle as (
    select
      'l:' || w.id::text as sid,
      w.d,
      w.acct,
      w.prop,
      w.dr,
      w.cr,
      round((w.cr - w.dr) * 100)::bigint as v_c,
      coalesce(w.applies, w.moved_from) as t0
    from win w
    join ent on ent.entry_id = w.entry_id
    where w.cls = 'arap'
      and not ent.has_pnl
      and not ent.conv
  ),
  chain (sid, target, depth) as (
    select s.sid, s.t0, 0 from settle s where s.t0 is not null
    union all
    select c.sid, nx.moved_from, c.depth + 1
    from chain c
    cross join lateral (
      select (tl.metadata ->> 'transferredEntryId')::uuid as moved_from
      from property.ledger_lines tl
      where tl.entry_id = c.target
        and tl.project_id = p_project_id
        and tl.deleted_at is null
        and (tl.metadata ->> 'transferredEntryId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      order by tl.line_no, tl.id
      limit 1
    ) nx
    where c.depth < 8
      and not exists (
        select 1
        from property.ledger_lines pl
        join acct a on a.id = pl.gl_account_id and a.cls = 'pnl'
        where pl.entry_id = c.target
          and pl.project_id = p_project_id
          and pl.deleted_at is null
      )
  ),
  fin as (
    select distinct on (c.sid) c.sid, c.target
    from chain c
    order by c.sid, c.depth desc
  ),
  sett_all as (
    select s.sid, s.d, s.v_c, f.target
    from settle s
    left join fin f on f.sid = s.sid
    union all
    select 'x:' || ent.entry_id::text, ent.d, ent.x_c, ent.entry_id
    from ent
    where ent.has_pnl and ent.has_arap and ent.x_c <> 0 and ent.n_c <> 0
  ),
  tgt as (
    select distinct sa.target from sett_all sa where sa.target is not null
  ),
  tlines as (
    select t.target, pl.id as line_id, pl.gl_account_id as acct, pl.property_id as prop, round((pl.credit - pl.debit) * 100)::bigint as a_c
    from tgt t
    join property.ledger_lines pl on pl.entry_id = t.target and pl.project_id = p_project_id and pl.deleted_at is null
    join acct a on a.id = pl.gl_account_id and a.cls = 'pnl'
    union all
    select t.target, null::uuid, cg.id, ar.prop, ar.a_c
    from tgt t
    join property.ledger_entries ce
      on ce.id = t.target
     and ce.project_id = p_project_id
     and ce.deleted_at is null
     and ce.metadata -> 'conversion' = 'true'::jsonb
     and (ce.metadata ->> 'chargeGl') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    join acct cg on cg.id = (ce.metadata ->> 'chargeGl')::uuid and cg.account_type = 'Income'
    cross join lateral (
      select
        (array_agg(l2.property_id order by l2.line_no, l2.id))[1] as prop,
        coalesce(sum(round((l2.debit - l2.credit) * 100)), 0)::bigint as a_c,
        count(*) as n
      from property.ledger_lines l2
      join acct a2 on a2.id = l2.gl_account_id and a2.cls = 'arap'
      where l2.entry_id = t.target
        and l2.project_id = p_project_id
        and l2.deleted_at is null
    ) ar
    where ar.n > 0
      and not exists (
        select 1
        from property.ledger_lines pl
        join acct a on a.id = pl.gl_account_id and a.cls = 'pnl'
        where pl.entry_id = t.target
          and pl.project_id = p_project_id
          and pl.deleted_at is null
      )
  ),
  tsum as (
    select tl.target, sum(tl.a_c)::bigint as n_c from tlines tl group by tl.target
  ),
  parts as (
    select
      sa.sid,
      sa.d,
      sa.v_c,
      tl.line_id,
      tl.acct,
      tl.prop,
      sa.v_c::numeric * (case when ts.n_c < 0 then -tl.a_c else tl.a_c end) as num,
      abs(ts.n_c)::numeric as den
    from sett_all sa
    join tsum ts on ts.target = sa.target and ts.n_c <> 0
    join tlines tl on tl.target = sa.target
  ),
  ranked as (
    select
      p.d,
      p.acct,
      p.prop,
      floor(p.num / p.den) as base,
      p.v_c - sum(floor(p.num / p.den)) over (partition by p.sid) as deficit,
      row_number() over (partition by p.sid order by p.num - floor(p.num / p.den) * p.den desc, p.line_id nulls last) as rn
    from parts p
  ),
  recog as (
    select w.d, w.acct, w.prop, w.dr, w.cr
    from win w
    join ent on ent.entry_id = w.entry_id
    where w.cls = 'pnl' and not ent.has_arap
    union all
    select r.d, r.acct, r.prop,
      case when r.r_c < 0 then -r.r_c / 100.0 else 0 end,
      case when r.r_c > 0 then r.r_c / 100.0 else 0 end
    from (
      select k.d, k.acct, k.prop, (k.base + case when k.rn <= k.deficit then 1 else 0 end)::bigint as r_c from ranked k
    ) r
    where r.r_c <> 0
    union all
    select s.d, s.acct, s.prop, s.dr, s.cr
    from settle s
    left join fin f on f.sid = s.sid
    left join tsum ts on ts.target = f.target
    where ts.target is null or ts.n_c = 0
    union all
    select w.d, w.acct, w.prop, w.dr, w.cr
    from win w
    join ent on ent.entry_id = w.entry_id
    where w.cls = 'arap'
      and ((not ent.has_pnl and ent.conv) or (ent.has_pnl and ent.n_c = 0))
  )
  select
    case p_grain
      when 'day' then r.d
      when 'month' then greatest(date_trunc('month', r.d::timestamp)::date, p_from)
      when 'year' then greatest(date_trunc('year', r.d::timestamp)::date, p_from)
      else p_from
    end,
    r.acct,
    r.prop,
    null::uuid,
    null::uuid,
    sum(r.dr)::numeric,
    sum(r.cr)::numeric
  from recog r
  where p_property_ids is null or r.prop = any (p_property_ids)
  group by 1, 2, 3
  order by 1, 2, 3;
end;
$$;

revoke all on function property.ledger_cash_basis_totals(uuid, date, date, text, uuid[]) from public, anon;
grant execute on function property.ledger_cash_basis_totals(uuid, date, date, text, uuid[]) to authenticated, service_role;

-- @down

drop function if exists property.ledger_cash_basis_totals(uuid, date, date, text, uuid[]);
