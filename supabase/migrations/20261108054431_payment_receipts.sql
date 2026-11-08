-- Payment receipts (CORE-11)
--
-- Owns property.payment_receipts (one receipt number per payment entry, sequential per project: RCT-000001, …) and
-- property.issue_receipt_number(project, entry), which returns an entry's number or issues the next one under a per-project
-- advisory lock. Numbers are never reused: soft-deleted rows keep theirs. Members with accounting.view read; only the
-- server (service role, through the function) writes.

-- @up
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

create table if not exists property.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_id uuid not null,
  seq bigint not null,
  receipt_no text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payment_receipts_seq_chk check (seq > 0)
);

-- One number per entry, and a number is used once per project (soft-deleted rows included).
create unique index if not exists payment_receipts_entry_uidx on property.payment_receipts (entry_id);
create unique index if not exists payment_receipts_project_seq_uidx on property.payment_receipts (project_id, seq);

drop trigger if exists payment_receipts_touch_updated_at on property.payment_receipts;
create trigger payment_receipts_touch_updated_at
before update on property.payment_receipts
for each row execute function property.touch_updated_at();

select property.apply_member_rls('payment_receipts', 'property.accounting.view', null, false);

-- The entry's receipt number, issuing the project's next one the first time (payments only, never a reversal).
create or replace function property.issue_receipt_number(p_project uuid, p_entry uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no text;
  v_seq bigint;
begin
  select r.receipt_no into v_no from property.payment_receipts r where r.entry_id = p_entry and r.project_id = p_project;
  if v_no is not null then
    return v_no;
  end if;
  if not exists (
    select 1 from property.ledger_entries e
     where e.id = p_entry and e.project_id = p_project and e.source_type = 'payment' and e.reversal_of is null
  ) then
    raise exception 'Only a payment in this project gets a receipt number.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payment_receipts:' || p_project::text, 0));
  select r.receipt_no into v_no from property.payment_receipts r where r.entry_id = p_entry and r.project_id = p_project;
  if v_no is not null then
    return v_no;
  end if;
  select coalesce(max(r.seq), 0) + 1 into v_seq from property.payment_receipts r where r.project_id = p_project;
  v_no := 'RCT-' || case when length(v_seq::text) >= 6 then v_seq::text else lpad(v_seq::text, 6, '0') end;
  insert into property.payment_receipts (project_id, entry_id, seq, receipt_no) values (p_project, p_entry, v_seq, v_no);
  return v_no;
end;
$$;
revoke all on function property.issue_receipt_number(uuid, uuid) from public, anon, authenticated;
grant execute on function property.issue_receipt_number(uuid, uuid) to service_role;

-- @down
drop function if exists property.issue_receipt_number(uuid, uuid);
drop table if exists property.payment_receipts;
