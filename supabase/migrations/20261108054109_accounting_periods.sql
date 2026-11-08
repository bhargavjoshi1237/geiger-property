-- Accounting periods (CORE-40): month and fiscal-year closes, the lock date they set, and the triggers that keep every posting out of a closed period.
-- Owns property.accounting_periods, ledger_locked_through(), accounting_period_close(), accounting_period_reopen(), ledger_ensure_accounts(),
--   ledger_entries_period_lock() and ledger_lines_period_lock() with their triggers.
-- Redefines and now owns ledger_void (live PLAT-01c body): a reversal never lands in a closed period, it moves to the first open day.
-- Triggers enforce the lock, so every path (ledger_post, ledger_void, the service role, any later redefinition) is covered; the error is
--   'ledger: period closed through <date>' with SQLSTATE GL001. Reconciliation columns and metadata stay editable on closed lines.
-- Virtual close: no closing entries; reports roll prior fiscal years into retained earnings. Closes are contiguous, so the lock date is the
--   latest closed period end. Postings and closes serialize per project on an advisory lock, so nothing commits into a period as it closes.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function property.touch_updated_at() from public, anon;

create table if not exists property.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  kind text not null default 'month',
  status text not null default 'closed',
  closed_at timestamptz not null default now(),
  closed_by uuid,
  closed_by_name text,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  checklist jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_periods_kind_chk check (kind in ('month', 'year')),
  constraint accounting_periods_status_chk check (status in ('closed', 'reopened')),
  constraint accounting_periods_range_chk check (period_end >= period_start)
);
create unique index if not exists accounting_periods_period_uidx
  on property.accounting_periods (project_id, period_start, kind) where deleted_at is null;
create index if not exists accounting_periods_lock_idx
  on property.accounting_periods (project_id, period_end) where status = 'closed' and deleted_at is null;

drop trigger if exists accounting_periods_touch_updated_at on property.accounting_periods;
create trigger accounting_periods_touch_updated_at
before update on property.accounting_periods
for each row execute function property.touch_updated_at();

-- Reads follow the ledger (PLAT-01d financial pattern: accounting.view); writes go only through the close / reopen RPCs.
alter table property.accounting_periods enable row level security;
revoke all on property.accounting_periods from anon, authenticated;
grant select, insert, update, delete on property.accounting_periods to service_role;
do $$
begin
  if to_regprocedure('property.apply_member_rls(text, text, text, boolean)') is not null then
    perform property.apply_member_rls('accounting_periods', 'property.accounting.view', null, false);
  else
    grant select on property.accounting_periods to authenticated;
    drop policy if exists accounting_periods_member_select on property.accounting_periods;
    create policy accounting_periods_member_select on property.accounting_periods for select to authenticated
      using (property.can_access_project(project_id));
  end if;
  -- Who closed and reopened what, in the append-only audit log (PLAT-09).
  if to_regprocedure('property.enable_audit(text)') is not null then
    perform property.enable_audit('accounting_periods');
  end if;
end $$;

-- The project's lock date: the latest closed period end (null when nothing is closed).
create or replace function property.ledger_locked_through(p_project uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(p.period_end)
    from property.accounting_periods p
   where p.project_id = p_project and p.status = 'closed' and p.deleted_at is null
     and (property.is_trusted_session() or property.can_access_project(p_project));
$$;
revoke all on function property.ledger_locked_through(uuid) from public, anon;
grant execute on function property.ledger_locked_through(uuid) to authenticated, service_role;

-- Entries: nothing is inserted, deleted or changed on or before the lock date; ledger_void's status / voided_at / metadata flip stays allowed.
create or replace function property.ledger_entries_period_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free text[] := array['status', 'voided_at', 'metadata', 'updated_at'];
  v_project uuid;
  v_locked date;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_free) is not distinct from (to_jsonb(old) - v_free) then
      return new;
    end if;
  end if;
  if tg_op = 'DELETE' then
    -- A project being deleted takes its closed periods with it.
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
revoke all on function property.ledger_entries_period_lock() from public, anon;

-- Lines: same date rule; on a closed line only the reconciliation columns and metadata change, so bank reconciliation still clears old lines.
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

do $$
begin
  if to_regclass('property.ledger_entries') is not null then
    drop trigger if exists ledger_entries_period_lock on property.ledger_entries;
    create trigger ledger_entries_period_lock before insert or update or delete on property.ledger_entries
      for each row execute function property.ledger_entries_period_lock();
  end if;
  if to_regclass('property.ledger_lines') is not null then
    drop trigger if exists ledger_lines_period_lock on property.ledger_lines;
    create trigger ledger_lines_period_lock before insert or update or delete on property.ledger_lines
      for each row execute function property.ledger_lines_period_lock();
  end if;
end $$;

-- Posts the reversal; a signed-in caller needs property.accounting.void on the entry's project (checked before the row lock).
-- The reversal is dated the latest of the requested day (default today), the original's date and the first open day.
create or replace function property.ledger_void(p_entry_id uuid, p_date date default null, p_memo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry property.ledger_entries;
  v_project uuid;
  v_new uuid := gen_random_uuid();
  v_date date;
  v_locked date;
  v_flag text;
begin
  select e.project_id into v_project from property.ledger_entries e where e.id = p_entry_id;
  if not property.is_trusted_session()
     and (v_project is null or not property.rbac_allows('property.accounting.void', v_project)) then
    raise exception 'You don''t have permission to void ledger entries.' using errcode = '42501';
  end if;

  select * into v_entry from property.ledger_entries
  where id = p_entry_id and deleted_at is null
  for update;
  if not found then raise exception 'ledger_void: entry % not found', p_entry_id; end if;
  if v_entry.status = 'void' then raise exception 'ledger_void: entry is already void'; end if;
  if v_entry.reversal_of is not null then raise exception 'ledger_void: a reversal cannot be voided'; end if;
  select max(p.period_end) into v_locked from property.accounting_periods p
   where p.project_id = v_entry.project_id and p.status = 'closed' and p.deleted_at is null;
  v_date := greatest(coalesce(p_date, current_date), v_entry.entry_date, v_locked + 1);

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, reversal_of, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_new, v_entry.project_id, v_date,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(v_entry.memo, v_entry.source_type)),
    v_entry.source_type, v_entry.source_id, 'posted', v_entry.id, v_entry.total,
    v_entry.property_id, v_entry.unit_id, v_entry.lease_id, v_entry.tenant_id, v_entry.owner_id,
    v_entry.vendor_id,
    jsonb_build_object('voidOf', v_entry.id)
      || case when v_entry.metadata ? 'ownerExplicit' then jsonb_build_object('ownerExplicit', v_entry.metadata->'ownerExplicit') else '{}'::jsonb end
      || case when v_locked + 1 > greatest(coalesce(p_date, current_date), v_entry.entry_date)
              then jsonb_build_object('closedThrough', v_locked) else '{}'::jsonb end,
    v_entry.created_by
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    l.project_id, v_new, v_date, l.line_no, l.gl_account_id, l.credit, l.debit,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(l.memo, '')),
    l.property_id, l.unit_id, l.lease_id, l.tenant_id, l.owner_id, l.vendor_id, l.bank_account_id, l.job_id,
    coalesce(l.applies_to_entry_id, v_entry.id), coalesce(l.metadata, '{}'::jsonb), l.created_by
  from property.ledger_lines l
  where l.entry_id = v_entry.id and l.deleted_at is null;

  -- ledger_entries_guard lets the posted → void flip through only while this flag is on.
  v_flag := current_setting('property.ledger_void', true);
  perform set_config('property.ledger_void', 'on', true);
  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;
  perform set_config('property.ledger_void', coalesce(v_flag, ''), true);

  return v_new;
end;
$$;
revoke all on function property.ledger_void(uuid, date, text) from public, anon;
grant execute on function property.ledger_void(uuid, date, text) to authenticated, service_role;

-- Seeds system accounts declared in JS (lib/ledger/chart.js) with ledger_ensure_default_chart's adopt-or-insert rule:
-- [{ system_key, number, name, account_type, subtype, is_trust, parent_key }] → accounts inserted; needs property.accounting.post.
create or replace function property.ledger_ensure_accounts(p_project_id uuid, p_accounts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_id uuid;
  r record;
begin
  if not property.is_trusted_session()
     and (p_project_id is null or not property.rbac_allows('property.accounting.post', p_project_id)) then
    raise exception 'You don''t have permission to set up the chart of accounts.' using errcode = '42501';
  end if;
  if p_project_id is null then raise exception 'ledger_ensure_accounts: a project is required'; end if;
  if p_accounts is null or jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'ledger_ensure_accounts: accounts must be an array';
  end if;

  for r in
    select nullif(a->>'system_key', '') as system_key, nullif(a->>'number', '') as number,
           coalesce(nullif(a->>'name', ''), a->>'system_key') as name, nullif(a->>'account_type', '') as account_type,
           nullif(a->>'subtype', '') as subtype, coalesce((a->>'is_trust')::boolean, false) as is_trust
      from jsonb_array_elements(p_accounts) a
  loop
    if r.system_key is null or r.account_type is null or r.account_type not in ('Asset', 'Liability', 'Equity', 'Income', 'Expense') then
      raise exception 'ledger_ensure_accounts: every account needs a system_key and an account_type';
    end if;
    if exists (
      select 1 from property.gl_accounts
      where system_key = r.system_key and project_id = p_project_id and deleted_at is null
    ) then
      continue;
    end if;
    v_id := null;
    select id into v_id from property.gl_accounts
    where project_id = p_project_id and deleted_at is null and system_key is null
      and number = r.number and account_type = r.account_type and (subtype is null or subtype = r.subtype)
    limit 1;
    if v_id is not null then
      update property.gl_accounts
      set system_key = r.system_key, is_system = true, is_trust = is_trust or r.is_trust,
          subtype = coalesce(subtype, r.subtype)
      where id = v_id;
    else
      begin
        insert into property.gl_accounts (project_id, name, number, account_type, subtype, is_trust, is_system, system_key, status)
        values (p_project_id, r.name, r.number, r.account_type, r.subtype, r.is_trust, true, r.system_key, 'Active');
        v_count := v_count + 1;
      exception when unique_violation then
        -- A concurrent call seeded the same system key.
        null;
      end;
    end if;
  end loop;

  -- Hierarchy: point child system accounts at their parents.
  update property.gl_accounts c
  set parent_id = p.id
  from jsonb_array_elements(p_accounts) a
  join property.gl_accounts p on p.system_key = a->>'parent_key' and p.project_id = p_project_id and p.deleted_at is null
  where nullif(a->>'parent_key', '') is not null and c.system_key = a->>'system_key'
    and c.project_id = p_project_id and c.deleted_at is null and c.parent_id is null;

  return v_count;
end;
$$;
revoke all on function property.ledger_ensure_accounts(uuid, jsonb) from public, anon;
grant execute on function property.ledger_ensure_accounts(uuid, jsonb) to authenticated, service_role;

-- Close one month (the next unclosed one; the first close may be any ended month) → the month's row id. Needs property.accounting.close.
-- Every failing check in p_checklist ([{ key, label, ok, count, note }]) needs a note; closing the fiscal year's last month closes the year.
create or replace function property.accounting_period_close(
  p_project uuid,
  p_period_end date,
  p_checklist jsonb default '[]'::jsonb,
  p_actor_name text default null,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trusted boolean := property.is_trusted_session();
  v_checklist jsonb := coalesce(p_checklist, '[]'::jsonb);
  v_start date;
  v_locked date;
  v_next date;
  v_actor uuid;
  v_name text;
  v_event jsonb;
  v_fy_month integer;
  v_fy_start date;
  v_id uuid;
  v_year uuid;
begin
  if not v_trusted and (p_project is null or not property.rbac_allows('property.accounting.close', p_project)) then
    raise exception 'You don''t have permission to close accounting periods.' using errcode = '42501';
  end if;
  if p_project is null or p_period_end is null then
    raise exception 'accounting_period_close: a project and a period end are required';
  end if;
  v_start := date_trunc('month', p_period_end)::date;
  if p_period_end <> (v_start + interval '1 month' - interval '1 day')::date then
    raise exception 'A period closes on the last day of a month.';
  end if;
  if p_period_end >= current_date then
    raise exception '% hasn''t ended yet.', to_char(v_start, 'FMMonth YYYY');
  end if;
  if jsonb_typeof(v_checklist) <> 'array' then
    raise exception 'accounting_period_close: the checklist must be an array';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_checklist) c
    where c->>'ok' is distinct from 'true' and coalesce(btrim(c->>'note'), '') = ''
  ) then
    raise exception 'Add a note to every failing check before closing.';
  end if;

  -- Waits for postings in flight on this project, and holds new ones until the close commits.
  perform pg_advisory_xact_lock(hashtext('accounting_periods:' || p_project::text));
  select max(p.period_end) into v_locked from property.accounting_periods p
   where p.project_id = p_project and p.status = 'closed' and p.deleted_at is null;
  if v_locked is not null then
    if p_period_end <= v_locked then
      raise exception 'The books are already closed through %.', to_char(v_locked, 'FMMon FMDD, YYYY');
    end if;
    v_next := (date_trunc('month', v_locked + 1) + interval '1 month' - interval '1 day')::date;
    if p_period_end <> v_next then
      raise exception 'Close % first: periods close in order.', to_char(v_locked + 1, 'FMMonth YYYY');
    end if;
  end if;

  v_actor := case when v_trusted then p_actor else auth.uid() end;
  v_name := coalesce(nullif(btrim(p_actor_name), ''), nullif(auth.jwt()->>'email', ''));
  v_event := jsonb_build_object('action', 'closed', 'at', now(), 'by', v_actor, 'byName', v_name);

  -- A reopened month closes again on its own row, keeping its history.
  update property.accounting_periods
  set status = 'closed', closed_at = now(), closed_by = v_actor, closed_by_name = v_name, checklist = v_checklist,
      metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{history}', coalesce(metadata->'history', '[]'::jsonb) || v_event)
  where project_id = p_project and period_start = v_start and kind = 'month' and deleted_at is null
  returning id into v_id;
  if v_id is null then
    insert into property.accounting_periods (project_id, period_start, period_end, kind, status, closed_at, closed_by, closed_by_name, checklist, metadata, created_by)
    values (p_project, v_start, p_period_end, 'month', 'closed', now(), v_actor, v_name, v_checklist, jsonb_build_object('history', jsonb_build_array(v_event)), v_actor)
    returning id into v_id;
  end if;

  -- Closing the fiscal year's last month closes the year too (accounting_settings.fiscalYearStartMonth, January by default).
  select case when s.value->>'fiscalYearStartMonth' ~ '^[0-9]{1,2}$' then (s.value->>'fiscalYearStartMonth')::integer end
    into v_fy_month
    from property.settings s
   where s.project_id = p_project and s.key = 'accounting_settings' and s.deleted_at is null
   limit 1;
  if v_fy_month is null or v_fy_month not between 1 and 12 then v_fy_month := 1; end if;
  if extract(month from p_period_end + 1)::integer = v_fy_month then
    v_fy_start := (date_trunc('month', p_period_end + 1) - interval '1 year')::date;
    update property.accounting_periods
    set status = 'closed', period_end = p_period_end, closed_at = now(), closed_by = v_actor, closed_by_name = v_name,
        metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{history}', coalesce(metadata->'history', '[]'::jsonb) || v_event)
    where project_id = p_project and period_start = v_fy_start and kind = 'year' and deleted_at is null
    returning id into v_year;
    if v_year is null then
      insert into property.accounting_periods (project_id, period_start, period_end, kind, status, closed_at, closed_by, closed_by_name, metadata, created_by)
      values (p_project, v_fy_start, p_period_end, 'year', 'closed', now(), v_actor, v_name, jsonb_build_object('history', jsonb_build_array(v_event)), v_actor);
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function property.accounting_period_close(uuid, date, jsonb, text, uuid) from public, anon;
grant execute on function property.accounting_period_close(uuid, date, jsonb, text, uuid) to authenticated, service_role;

-- Reopen the latest closed period (and the fiscal year that ends with it) with a reason → its id. Needs property.accounting.close.
create or replace function property.accounting_period_reopen(
  p_id uuid,
  p_reason text,
  p_actor_name text default null,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trusted boolean := property.is_trusted_session();
  v_row property.accounting_periods;
  v_locked date;
  v_actor uuid;
  v_name text;
  v_event jsonb;
begin
  select * into v_row from property.accounting_periods where id = p_id and deleted_at is null;
  if not v_trusted and (v_row.project_id is null or not property.rbac_allows('property.accounting.close', v_row.project_id)) then
    raise exception 'You don''t have permission to reopen accounting periods.' using errcode = '42501';
  end if;
  if v_row.id is null then raise exception 'accounting_period_reopen: period % not found', p_id; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for reopening the period.';
  end if;
  if v_row.status <> 'closed' then
    raise exception 'This period isn''t closed.';
  end if;

  perform pg_advisory_xact_lock(hashtext('accounting_periods:' || v_row.project_id::text));
  select max(p.period_end) into v_locked from property.accounting_periods p
   where p.project_id = v_row.project_id and p.status = 'closed' and p.deleted_at is null;
  if v_row.period_end <> v_locked then
    raise exception 'Reopen the latest closed period first: the books are closed through %.', to_char(v_locked, 'FMMon FMDD, YYYY');
  end if;

  v_actor := case when v_trusted then p_actor else auth.uid() end;
  v_name := coalesce(nullif(btrim(p_actor_name), ''), nullif(auth.jwt()->>'email', ''));
  v_event := jsonb_build_object('action', 'reopened', 'at', now(), 'by', v_actor, 'byName', v_name, 'reason', btrim(p_reason));
  update property.accounting_periods
  set status = 'reopened', reopened_at = now(), reopened_by = v_actor, reopen_reason = btrim(p_reason),
      metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{history}', coalesce(metadata->'history', '[]'::jsonb) || v_event)
  where project_id = v_row.project_id and period_end = v_row.period_end and status = 'closed' and deleted_at is null;
  return p_id;
end;
$$;
revoke all on function property.accounting_period_reopen(uuid, text, text, uuid) from public, anon;
grant execute on function property.accounting_period_reopen(uuid, text, text, uuid) to authenticated, service_role;

-- @down
do $$
begin
  if to_regclass('property.ledger_entries') is not null then
    drop trigger if exists ledger_entries_period_lock on property.ledger_entries;
  end if;
  if to_regclass('property.ledger_lines') is not null then
    drop trigger if exists ledger_lines_period_lock on property.ledger_lines;
  end if;
end $$;
drop function if exists property.ledger_entries_period_lock();
drop function if exists property.ledger_lines_period_lock();
drop function if exists property.accounting_period_reopen(uuid, text, text, uuid);
drop function if exists property.accounting_period_close(uuid, date, jsonb, text, uuid);
drop function if exists property.ledger_ensure_accounts(uuid, jsonb);
drop function if exists property.ledger_locked_through(uuid);

-- ledger_void as it was live before this migration (PLAT-01c).
CREATE OR REPLACE FUNCTION property.ledger_void(p_entry_id uuid, p_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_entry property.ledger_entries;
  v_project uuid;
  v_new uuid := gen_random_uuid();
  v_date date;
  v_flag text;
begin
  select e.project_id into v_project from property.ledger_entries e where e.id = p_entry_id;
  if not property.is_trusted_session()
     and (v_project is null or not property.rbac_allows('property.accounting.void', v_project)) then
    raise exception 'You don''t have permission to void ledger entries.' using errcode = '42501';
  end if;

  select * into v_entry from property.ledger_entries
  where id = p_entry_id and deleted_at is null
  for update;
  if not found then raise exception 'ledger_void: entry % not found', p_entry_id; end if;
  if v_entry.status = 'void' then raise exception 'ledger_void: entry is already void'; end if;
  if v_entry.reversal_of is not null then raise exception 'ledger_void: a reversal cannot be voided'; end if;
  v_date := greatest(coalesce(p_date, current_date), v_entry.entry_date);

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, reversal_of, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_new, v_entry.project_id, v_date,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(v_entry.memo, v_entry.source_type)),
    v_entry.source_type, v_entry.source_id, 'posted', v_entry.id, v_entry.total,
    v_entry.property_id, v_entry.unit_id, v_entry.lease_id, v_entry.tenant_id, v_entry.owner_id,
    v_entry.vendor_id,
    jsonb_build_object('voidOf', v_entry.id)
      || case when v_entry.metadata ? 'ownerExplicit' then jsonb_build_object('ownerExplicit', v_entry.metadata->'ownerExplicit') else '{}'::jsonb end,
    v_entry.created_by
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    l.project_id, v_new, v_date, l.line_no, l.gl_account_id, l.credit, l.debit,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(l.memo, '')),
    l.property_id, l.unit_id, l.lease_id, l.tenant_id, l.owner_id, l.vendor_id, l.bank_account_id, l.job_id,
    coalesce(l.applies_to_entry_id, v_entry.id), coalesce(l.metadata, '{}'::jsonb), l.created_by
  from property.ledger_lines l
  where l.entry_id = v_entry.id and l.deleted_at is null;

  -- ledger_entries_guard lets the posted → void flip through only while this flag is on.
  v_flag := current_setting('property.ledger_void', true);
  perform set_config('property.ledger_void', 'on', true);
  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;
  perform set_config('property.ledger_void', coalesce(v_flag, ''), true);

  return v_new;
end;
$function$;
revoke all on function property.ledger_void(uuid, date, text) from public, anon;
grant execute on function property.ledger_void(uuid, date, text) to authenticated, service_role;

drop table if exists property.accounting_periods cascade;
