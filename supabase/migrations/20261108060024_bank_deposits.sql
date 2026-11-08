-- Bank deposits (CORE-16)
--
-- Owns property.bank_deposits (one row per bank deposit: the bank, date, slip number, total and the bankdep:<id> ledger entry) and
-- ledger_lines.bank_deposit_id, stamped on the 1050 Undeposited Funds debit line of each payment in a live deposit and on the
-- deposit's own lines (and its reversal's), so bank reconciliation clears a deposit as one line.
-- Functions (service role only): bank_deposit_post claims the payments, posts the entry through ledger_post and marks the deposit
-- Posted in one transaction; bank_deposit_void voids it through ledger_void and releases its payments back to Undeposited Funds.
-- Trigger bank_deposit_entry_guard refuses a signed-in void of a deposit entry or of a payment inside a live deposit.
-- Members with accounting.view read deposits; only the server writes them.

-- @up
set local lock_timeout = '15s';

create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

-- Shared "touch updated_at" trigger function (suite convention), defined here so the file stands alone.
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

create table if not exists property.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  bank_account_id uuid not null,
  deposit_date date not null,
  total numeric(14,2) not null default 0,
  item_count integer not null default 0,
  status text not null default 'Draft',
  ledger_entry_id uuid,
  slip_number text,
  source text not null default 'manual',
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint bank_deposits_status_chk check (status in ('Draft', 'Posted', 'Void')),
  constraint bank_deposits_source_chk check (source in ('manual', 'stripe_payout', 'lockbox'))
);

-- One deposit per payout / lockbox file in a project.
create unique index if not exists bank_deposits_external_uidx on property.bank_deposits (project_id, source, external_id) where external_id is not null;
create index if not exists bank_deposits_project_date_idx on property.bank_deposits (project_id, deposit_date desc) where deleted_at is null;
create unique index if not exists bank_deposits_entry_uidx on property.bank_deposits (ledger_entry_id) where ledger_entry_id is not null;

drop trigger if exists bank_deposits_touch_updated_at on property.bank_deposits;
create trigger bank_deposits_touch_updated_at
before update on property.bank_deposits
for each row execute function property.touch_updated_at();

select property.apply_member_rls('bank_deposits', 'property.accounting.view', null, false);

-- The deposit a ledger line belongs to (like reconciliation_id); server-written only (ledger_lines_guard keeps it off the free list).
alter table property.ledger_lines add column if not exists bank_deposit_id uuid;
create index if not exists ledger_lines_bank_deposit_idx on property.ledger_lines (bank_deposit_id) where bank_deposit_id is not null;

-- Create (or resume) a deposit, claim its 1050 payment lines, post its entry (key bankdep:<id>) and mark it Posted, all or nothing.
create or replace function property.bank_deposit_post(p_deposit jsonb, p_items uuid[], p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_deposit->>'id', '')::uuid;
  v_project uuid := nullif(p_deposit->>'project_id', '')::uuid;
  v_dep property.bank_deposits;
  v_items uuid[];
  v_undeposited uuid;
  v_taken text;
  v_claimed integer;
  v_total numeric(14,2);
  v_entry uuid;
  v_entry_total numeric;
  v_cleared numeric;
begin
  if not property.is_trusted_session() then
    raise exception 'Bank deposits are posted by the server.' using errcode = '42501';
  end if;
  if v_id is null or v_project is null then
    raise exception 'bank_deposit_post: the deposit needs an id and a project' using errcode = '22023';
  end if;
  v_items := array(select distinct t.i from unnest(coalesce(p_items, '{}'::uuid[])) as t(i) where t.i is not null);

  insert into property.bank_deposits (id, project_id, bank_account_id, deposit_date, status, slip_number, source, external_id, metadata, created_by)
  values (
    v_id, v_project, nullif(p_deposit->>'bank_account_id', '')::uuid,
    coalesce(nullif(p_deposit->>'deposit_date', '')::date, current_date), 'Draft',
    nullif(p_deposit->>'slip_number', ''), coalesce(nullif(p_deposit->>'source', ''), 'manual'),
    nullif(p_deposit->>'external_id', ''), coalesce(p_deposit->'metadata', '{}'::jsonb), nullif(p_deposit->>'created_by', '')::uuid
  )
  on conflict (id) do nothing;

  select * into v_dep from property.bank_deposits where id = v_id for update;
  if v_dep.project_id is distinct from v_project or v_dep.deleted_at is not null then
    raise exception 'Bank deposit not found.' using errcode = 'P0002';
  end if;
  -- A replay of a posted deposit returns its entry.
  if v_dep.status = 'Posted' then
    return v_dep.ledger_entry_id;
  end if;
  if v_dep.status = 'Void' then
    raise exception 'This bank deposit was voided.' using errcode = '22023';
  end if;
  if cardinality(v_items) = 0 then
    raise exception 'Pick at least one payment to deposit.' using errcode = '22023';
  end if;
  if p_entry->>'idempotency_key' is distinct from 'bankdep:' || v_id::text
     or nullif(p_entry->>'project_id', '')::uuid is distinct from v_project
     or p_entry->>'source_type' is distinct from 'bank_deposit' then
    raise exception 'bank_deposit_post: the entry must be this deposit''s bank_deposit entry (bankdep:<id>)' using errcode = '22023';
  end if;

  select a.id into v_undeposited from property.gl_accounts a
   where a.project_id = v_project and a.system_key = 'undeposited_funds' and a.deleted_at is null
   order by a.created_at
   limit 1;
  if v_undeposited is null then
    raise exception 'The chart of accounts has no Undeposited Funds account.' using errcode = '22023';
  end if;

  -- A payment can join only one live deposit.
  select coalesce(nullif(d.slip_number, ''), to_char(d.deposit_date, 'YYYY-MM-DD')) into v_taken
    from property.ledger_lines l
    join property.bank_deposits d on d.id = l.bank_deposit_id
   where l.id = any(v_items) and l.bank_deposit_id <> v_id
   limit 1;
  if v_taken is not null then
    raise exception 'A payment in this deposit is already in bank deposit %.', v_taken using errcode = '23505';
  end if;

  -- Claim: posted, non-reversal 1050 debit lines with no deposit; a concurrent claim waits on the row lock, then finds them taken.
  update property.ledger_lines l
     set bank_deposit_id = v_id
    from property.ledger_entries e
   where l.id = any(v_items)
     and l.project_id = v_project
     and l.deleted_at is null
     and (l.bank_deposit_id is null or l.bank_deposit_id = v_id)
     and l.gl_account_id = v_undeposited
     and l.debit > 0
     and e.id = l.entry_id
     and e.status = 'posted'
     and e.reversal_of is null
     and e.deleted_at is null;
  get diagnostics v_claimed = row_count;
  if v_claimed <> cardinality(v_items) then
    raise exception 'Some of these payments aren''t waiting in Undeposited Funds any more (voided or already deposited); reload and try again.' using errcode = '23505';
  end if;
  select coalesce(sum(l.debit), 0) into v_total from property.ledger_lines l where l.id = any(v_items);

  v_entry := property.ledger_post(p_entry, p_lines);

  -- The entry must move exactly these payments out of 1050.
  select e.total into v_entry_total from property.ledger_entries e where e.id = v_entry;
  select coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0) into v_cleared
    from property.ledger_lines l
   where l.entry_id = v_entry and l.gl_account_id = v_undeposited and l.deleted_at is null;
  if v_entry_total is distinct from v_total or v_cleared is distinct from v_total then
    raise exception 'bank_deposit_post: the entry (% out of Undeposited Funds) doesn''t match its payments (%)', v_cleared, v_total using errcode = '22023';
  end if;

  update property.ledger_lines set bank_deposit_id = v_id where entry_id = v_entry;
  update property.bank_deposits
     set status = 'Posted', ledger_entry_id = v_entry, total = v_total, item_count = v_claimed,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('postedAt', now())
   where id = v_id;
  return v_entry;
end;
$$;
revoke all on function property.bank_deposit_post(jsonb, uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function property.bank_deposit_post(jsonb, uuid[], jsonb, jsonb) to service_role;

-- Void a deposit: reverse its entry (ledger_void), tag the reversal, release its payments to Undeposited Funds and mark it Void; a replay returns the reversal.
create or replace function property.bank_deposit_void(p_deposit uuid, p_date date default null, p_memo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep property.bank_deposits;
  v_status text;
  v_rev uuid;
begin
  if not property.is_trusted_session() then
    raise exception 'Bank deposits are voided by the server.' using errcode = '42501';
  end if;
  select * into v_dep from property.bank_deposits where id = p_deposit and deleted_at is null for update;
  if not found then
    raise exception 'Bank deposit not found.' using errcode = 'P0002';
  end if;
  if v_dep.status = 'Void' then
    return nullif(v_dep.metadata->>'voidEntryId', '')::uuid;
  end if;

  if v_dep.ledger_entry_id is not null then
    if exists (
      select 1 from property.ledger_lines l
       where l.entry_id = v_dep.ledger_entry_id and l.reconciliation_id is not null and l.deleted_at is null
    ) then
      raise exception 'This deposit is on a finalized bank reconciliation; undo that reconciliation first.' using errcode = '23505';
    end if;
    select e.status, nullif(e.metadata->>'voidEntryId', '')::uuid into v_status, v_rev
      from property.ledger_entries e where e.id = v_dep.ledger_entry_id;
    if v_status = 'posted' then
      v_rev := property.ledger_void(v_dep.ledger_entry_id, p_date, p_memo);
    end if;
    if v_rev is not null then
      update property.ledger_lines set bank_deposit_id = p_deposit where entry_id = v_rev;
    end if;
  end if;

  update property.ledger_lines
     set bank_deposit_id = null
   where bank_deposit_id = p_deposit
     and entry_id is distinct from v_dep.ledger_entry_id
     and entry_id is distinct from v_rev;
  update property.bank_deposits
     set status = 'Void',
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object('voidEntryId', v_rev, 'voidedAt', now(), 'voidMemo', nullif(p_memo, '')))
   where id = p_deposit;
  return v_rev;
end;
$$;
revoke all on function property.bank_deposit_void(uuid, date, text) from public, anon, authenticated;
grant execute on function property.bank_deposit_void(uuid, date, text) to service_role;

-- Signed-in voids: a deposit entry only through Bank Deposits (so its payments are released), and never a payment inside a live deposit.
create or replace function property.bank_deposit_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slip text;
begin
  if new.status = 'void' and old.status is distinct from 'void' and not property.is_trusted_session() then
    if old.source_type = 'bank_deposit' then
      raise exception 'Void a bank deposit from Accounting › Bank Deposits, so its payments go back to Undeposited Funds.' using errcode = '42501';
    end if;
    select coalesce(nullif(d.slip_number, ''), to_char(d.deposit_date, 'YYYY-MM-DD')) into v_slip
      from property.ledger_lines l
      join property.bank_deposits d on d.id = l.bank_deposit_id
     where l.entry_id = old.id and l.deleted_at is null and d.status = 'Posted' and d.deleted_at is null
     limit 1;
    if v_slip is not null then
      raise exception 'This payment is in bank deposit %; void that deposit first.', v_slip using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function property.bank_deposit_entry_guard() from public, anon, authenticated;

drop trigger if exists ledger_entries_bank_deposit_guard on property.ledger_entries;
create trigger ledger_entries_bank_deposit_guard
before update of status on property.ledger_entries
for each row execute function property.bank_deposit_entry_guard();

-- @down
set local lock_timeout = '15s';
drop trigger if exists ledger_entries_bank_deposit_guard on property.ledger_entries;
drop function if exists property.bank_deposit_entry_guard();
drop function if exists property.bank_deposit_void(uuid, date, text);
drop function if exists property.bank_deposit_post(jsonb, uuid[], jsonb, jsonb);
drop index if exists property.ledger_lines_bank_deposit_idx;
alter table if exists property.ledger_lines drop column if exists bank_deposit_id;
drop table if exists property.bank_deposits;
