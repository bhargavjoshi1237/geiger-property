-- Review queue (ORCH-04)
--
-- Owns property.review_items and property.bill_review_sync(). One inbox for
-- everything that needs a person: automation exceptions, approvals, suggested
-- decisions, intake drafts and automation tasks. Items are upserted by
-- (project_id, dedupe_key) so a recurring failure raises one item, not one per
-- retry. Closing an item (resolved / dismissed) requires a resolution entry,
-- enforced by a check constraint. Bill approvals (CORE-47 slice): a bill whose
-- approval_status is Pending upserts one approval item; approving, rejecting,
-- voiding or deleting the bill (on any screen) resolves it. Audited through
-- property.enable_audit (20261107220032_audit_log).

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

create table if not exists property.review_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  dedupe_key text not null,
  kind text not null default 'exception'
    check (kind in ('exception', 'approval', 'decision', 'intake', 'task')),
  source_type text not null default 'automation_run',
  source_id uuid,
  record_type text,
  record_id uuid,
  record_label text,
  property_id uuid,
  title text not null default '',
  reason_code text not null default 'unexpected_error',
  reason_text text not null default '',
  severity text not null default 'soon' check (severity in ('urgent', 'soon', 'routine')),
  amount_at_stake numeric(14, 2),
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved', 'dismissed')),
  assignee_id uuid,
  assignee_role text,
  due_at timestamptz,
  snoozed_until timestamptz,
  proposed_action jsonb,
  resolution jsonb,
  history jsonb not null default '[]'::jsonb,
  occurrences integer not null default 1,
  last_raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint review_items_resolution_required
    check (status not in ('resolved', 'dismissed') or resolution is not null)
);

create unique index if not exists review_items_dedupe_idx
  on property.review_items (project_id, dedupe_key) nulls not distinct;
create index if not exists review_items_open_idx
  on property.review_items (project_id, status, kind, last_raised_at desc)
  where deleted_at is null;
create index if not exists review_items_record_idx
  on property.review_items (record_type, record_id)
  where deleted_at is null and status in ('open', 'snoozed');

drop trigger if exists review_items_touch_updated_at on property.review_items;
create trigger review_items_touch_updated_at
before update on property.review_items
for each row execute function property.touch_updated_at();

alter table property.review_items enable row level security;
drop policy if exists review_items_demo_all on property.review_items;
create policy review_items_demo_all on property.review_items
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on property.review_items to anon, authenticated, service_role;

-- Audit trail when the audit log (20261107220032_audit_log) is installed.
do $$
begin
  if to_regprocedure('property.enable_audit(text)') is not null then
    perform property.enable_audit('review_items');
  end if;
end $$;

-- Bill approvals → review items. Never blocks the bill write.
create or replace function property.bill_review_sync()
returns trigger
language plpgsql
security definer
set search_path = property, public
as $$
declare
  n jsonb := to_jsonb(new);
  pid uuid := nullif(n->>'project_id', '')::uuid;
  bill uuid := (n->>'id')::uuid;
  key text := 'approval:bill:' || (n->>'id');
  vendor text := coalesce(nullif(n->>'vendor_name', ''), 'a vendor');
  amount numeric := nullif(n->>'amount', '')::numeric;
  due date := nullif(n->>'due_date', '')::date;
  decision text := lower(coalesce(n->>'approval_status', ''));
  pending boolean := decision = 'pending'
    and n->>'deleted_at' is null
    and lower(coalesce(n->>'status', '')) <> 'void';
begin
  begin
    if pending then
      insert into property.review_items as r
        (project_id, dedupe_key, kind, source_type, source_id, record_type, record_id, record_label,
         property_id, title, reason_code, reason_text, severity, amount_at_stake, status, due_at, history)
      values (
        pid, key, 'approval', 'bill', bill, 'bill', bill, vendor,
        nullif(n->>'property_id', '')::uuid,
        'Approve bill from ' || vendor,
        'approval_required',
        format('%s billed $%s%s. It is over the approval limit, so it can''t post to payables until someone approves it.',
          vendor, to_char(coalesce(amount, 0), 'FM999,999,990.00'),
          case when due is not null then format(' (due %s)', to_char(due, 'Mon DD')) else '' end),
        case when due is not null and due <= current_date + 3 then 'urgent' else 'soon' end,
        amount, 'open', due::timestamptz,
        jsonb_build_array(jsonb_build_object('at', now(), 'action', 'raised', 'note', 'Bill sent for approval'))
      )
      on conflict (project_id, dedupe_key) do update set
        status = 'open',
        resolution = null,
        resolved_at = null,
        title = excluded.title,
        reason_text = excluded.reason_text,
        severity = excluded.severity,
        amount_at_stake = excluded.amount_at_stake,
        due_at = excluded.due_at,
        last_raised_at = now(),
        history = r.history || case when r.status in ('resolved', 'dismissed')
          then jsonb_build_array(jsonb_build_object('at', now(), 'action', 'reopened', 'note', 'Bill sent for approval again'))
          else '[]'::jsonb end
      where r.status in ('resolved', 'dismissed')
         or r.amount_at_stake is distinct from excluded.amount_at_stake
         or r.due_at is distinct from excluded.due_at;
    else
      update property.review_items r set
        status = 'resolved',
        resolved_at = now(),
        resolution = jsonb_build_object(
          'action', case
            when n->>'deleted_at' is not null then 'deleted'
            when lower(coalesce(n->>'status', '')) = 'void' then 'voided'
            when decision = 'approved' then 'approved'
            when decision = 'rejected' then 'rejected'
            else 'no_longer_required' end,
          'by', nullif(n->>'approver_name', ''),
          'note', 'Decided on the bill',
          'at', now()),
        history = r.history || jsonb_build_array(jsonb_build_object(
          'at', now(), 'action', coalesce(nullif(decision, ''), 'closed'), 'by', nullif(n->>'approver_name', ''),
          'note', 'Decided on the bill'))
      where r.project_id is not distinct from pid
        and r.dedupe_key = key
        and r.status in ('open', 'snoozed');
    end if;
  exception when others then
    raise warning 'bill_review_sync: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists bills_review_sync on property.bills;
create trigger bills_review_sync
after insert or update on property.bills
for each row execute function property.bill_review_sync();

-- Backfill: bills already waiting for approval.
insert into property.review_items
  (project_id, dedupe_key, kind, source_type, source_id, record_type, record_id, record_label,
   property_id, title, reason_code, reason_text, severity, amount_at_stake, status, due_at, history)
select b.project_id, 'approval:bill:' || b.id, 'approval', 'bill', b.id, 'bill', b.id,
       coalesce(nullif(b.vendor_name, ''), 'a vendor'), b.property_id,
       'Approve bill from ' || coalesce(nullif(b.vendor_name, ''), 'a vendor'),
       'approval_required',
       format('%s billed $%s. It is over the approval limit, so it can''t post to payables until someone approves it.',
         coalesce(nullif(b.vendor_name, ''), 'a vendor'), to_char(coalesce(b.amount, 0), 'FM999,999,990.00')),
       case when b.due_date is not null and b.due_date <= current_date + 3 then 'urgent' else 'soon' end,
       b.amount, 'open', b.due_date::timestamptz,
       jsonb_build_array(jsonb_build_object('at', now(), 'action', 'raised', 'note', 'Bill waiting for approval'))
from property.bills b
where lower(coalesce(b.approval_status, '')) = 'pending'
  and b.deleted_at is null
  and lower(coalesce(b.status, '')) <> 'void'
on conflict (project_id, dedupe_key) do nothing;

-- @down
drop trigger if exists bills_review_sync on property.bills;
drop function if exists property.bill_review_sync();
drop table if exists property.review_items cascade;
