-- Ledger owner dimension backfill (CORE-08)
--
-- Owner shares move to report time: property-level postings carry no owner_id; only owner-specific entries
-- (source_type distribution / contribution, or metadata.ownerExplicit) keep it. This clears owner_id on every
-- other entry and its lines, and marks the manager's side of management fees (operating cash and fee income
-- lines) with metadata.side = 'manager'. Dimensions only: no debit or credit changes.
-- Also redefines property.ledger_void (owned by 20261015212744_ledger_core; ownership moves here) so a reversal
-- keeps its lines' metadata (the manager marker) and the entry's ownerExplicit flag.
-- property.ledger_owner_backfill_backup holds the previous values so @down restores them exactly.

-- @up
create table if not exists property.ledger_owner_backfill_backup (
  kind text not null check (kind in ('entry', 'line')),
  row_id uuid not null,
  owner_id uuid,
  side_added boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (kind, row_id)
);
alter table property.ledger_owner_backfill_backup enable row level security;
revoke all on property.ledger_owner_backfill_backup from anon, authenticated;

-- Entries whose owner tag stops counting: not a distribution / contribution and not flagged ownerExplicit.
create temporary table ledger_owner_targets on commit drop as
select e.id
from property.ledger_entries e
where e.source_type not in ('distribution', 'contribution')
  and coalesce(e.metadata->'ownerExplicit', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '""'::jsonb, '0'::jsonb);

insert into property.ledger_owner_backfill_backup (kind, row_id, owner_id)
select 'entry', e.id, e.owner_id
from property.ledger_entries e
join ledger_owner_targets t on t.id = e.id
where e.owner_id is not null
on conflict (kind, row_id) do nothing;

insert into property.ledger_owner_backfill_backup (kind, row_id, owner_id)
select 'line', l.id, l.owner_id
from property.ledger_lines l
join ledger_owner_targets t on t.id = l.entry_id
where l.owner_id is not null
on conflict (kind, row_id) do nothing;

update property.ledger_entries e
set owner_id = null
from ledger_owner_targets t
where t.id = e.id and e.owner_id is not null;

update property.ledger_lines l
set owner_id = null
from ledger_owner_targets t
where t.id = l.entry_id and l.owner_id is not null;

-- The manager's side of a management fee (originals and their reversals keep source_type management_fee).
insert into property.ledger_owner_backfill_backup (kind, row_id, owner_id, side_added)
select 'line', l.id, l.owner_id, true
from property.ledger_lines l
join property.ledger_entries e on e.id = l.entry_id
join property.gl_accounts a on a.id = l.gl_account_id
where e.source_type = 'management_fee'
  and a.system_key in ('operating_cash', 'management_fee_income')
  and coalesce(l.metadata->>'side', '') <> 'manager'
on conflict (kind, row_id) do update set side_added = true;

update property.ledger_lines l
set metadata = coalesce(l.metadata, '{}'::jsonb) || '{"side": "manager"}'::jsonb
from property.ledger_entries e, property.gl_accounts a
where e.id = l.entry_id
  and a.id = l.gl_account_id
  and e.source_type = 'management_fee'
  and a.system_key in ('operating_cash', 'management_fee_income')
  and coalesce(l.metadata->>'side', '') <> 'manager';

-- Void an entry by posting its mirror image; lines keep their metadata, the entry keeps ownerExplicit.
create or replace function property.ledger_void(p_entry_id uuid, p_date date default null, p_memo text default null)
returns uuid
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_entry property.ledger_entries;
  v_new uuid := gen_random_uuid();
  v_date date;
begin
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

  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;

  return v_new;
end;
$$;

-- @down
create or replace function property.ledger_void(p_entry_id uuid, p_date date default null, p_memo text default null)
returns uuid
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_entry property.ledger_entries;
  v_new uuid := gen_random_uuid();
  v_date date;
begin
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
    v_entry.vendor_id, jsonb_build_object('voidOf', v_entry.id), v_entry.created_by
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
    coalesce(l.applies_to_entry_id, v_entry.id), '{}'::jsonb, l.created_by
  from property.ledger_lines l
  where l.entry_id = v_entry.id and l.deleted_at is null;

  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;

  return v_new;
end;
$$;

do $$
begin
  if to_regclass('property.ledger_owner_backfill_backup') is not null then
    update property.ledger_entries e
    set owner_id = b.owner_id
    from property.ledger_owner_backfill_backup b
    where b.kind = 'entry' and b.row_id = e.id and b.owner_id is not null;

    update property.ledger_lines l
    set owner_id = b.owner_id
    from property.ledger_owner_backfill_backup b
    where b.kind = 'line' and b.row_id = l.id and b.owner_id is not null;

    update property.ledger_lines l
    set metadata = l.metadata - 'side'
    from property.ledger_owner_backfill_backup b
    where b.kind = 'line' and b.row_id = l.id and b.side_added;
  end if;
end $$;

drop table if exists property.ledger_owner_backfill_backup;
