-- Messaging, scheduler and automations
--
-- Owns property.job_runs (scheduled-job log), property.notification_sends
-- (dedupe ledger for reminders), property.message_threads +
-- property.thread_messages (two-way inbox), property.announcement_deliveries,
-- property.automation_events (record-event queue), property.automation_runs
-- (workflow run history), the property.emit_record_event() /
-- property.record_event_trigger() functions and their triggers on leases,
-- applications, work_orders, transactions and moves. Adds audience/delivery
-- columns to property.announcements.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- One row per scheduled-job execution (project_id null = an all-projects cron run).
create table if not exists property.job_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  job_key text not null,
  trigger_source text not null default 'cron',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed integer not null default 0,
  created integer not null default 0,
  skipped integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists job_runs_key_idx on property.job_runs (job_key, started_at desc);
create index if not exists job_runs_project_idx on property.job_runs (project_id, started_at desc);

-- Idempotency ledger: a reminder is sent only when its dedupe_key inserts.
create table if not exists property.notification_sends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  dedupe_key text not null,
  job_key text,
  notification text,
  channel text not null default 'email',
  recipient text,
  record_type text,
  record_id uuid,
  status text not null default 'sent',
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists notification_sends_dedupe_idx on property.notification_sends (dedupe_key);
create index if not exists notification_sends_record_idx on property.notification_sends (record_type, record_id);

-- Two-way inbox: one conversation per party (tenant / owner / vendor / prospect).
create table if not exists property.message_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  subject text not null default '',
  channel text not null default 'email',
  status text not null default 'Open',
  party_type text,
  party_id uuid,
  party_name text,
  party_email text,
  party_phone text,
  lease_id uuid,
  property_id uuid,
  unit_id uuid,
  assigned_to uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_direction text,
  unread_count integer not null default 0,
  message_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists message_threads_project_idx on property.message_threads (project_id, last_message_at desc);
create index if not exists message_threads_party_idx on property.message_threads (party_type, party_id);
create index if not exists message_threads_email_idx on property.message_threads (lower(party_email));

create table if not exists property.thread_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  thread_id uuid not null references property.message_threads(id) on delete cascade,
  direction text not null default 'outbound',
  channel text not null default 'email',
  from_name text,
  from_address text,
  to_address text,
  subject text,
  body text not null default '',
  delivery_status text not null default 'logged',
  delivery_error text,
  provider_id text,
  template_id uuid,
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists thread_messages_thread_idx on property.thread_messages (thread_id, sent_at);

-- Per-recipient delivery rows behind an announcement's stats.
create table if not exists property.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  announcement_id uuid not null,
  recipient_key text not null,
  recipient_type text,
  recipient_id uuid,
  recipient_name text,
  address text,
  channel text not null default 'email',
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists announcement_deliveries_recipient_idx
  on property.announcement_deliveries (announcement_id, recipient_key);

alter table property.announcements add column if not exists building_id uuid;
alter table property.announcements add column if not exists building_name text;
alter table property.announcements add column if not exists sent_at timestamptz;

-- Record-event queue the automation runner drains.
create table if not exists property.automation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  event_type text not null,
  source_table text,
  record_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  processed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists automation_events_pending_idx on property.automation_events (status, created_at);

-- One workflow execution: a snapshot of the steps plus a per-step log.
create table if not exists property.automation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  automation_id uuid not null,
  automation_name text,
  dedupe_key text not null,
  event_id uuid,
  event_type text,
  record_type text,
  record_id uuid,
  record_label text,
  status text not null default 'pending',
  current_step integer not null default 0,
  resume_at timestamptz,
  steps jsonb not null default '[]'::jsonb,
  log jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists automation_runs_dedupe_idx on property.automation_runs (automation_id, dedupe_key);
create index if not exists automation_runs_due_idx on property.automation_runs (status, resume_at);
create index if not exists automation_runs_automation_idx on property.automation_runs (automation_id, started_at desc);

do $$
declare t text;
begin
  foreach t in array array['job_runs', 'notification_sends', 'message_threads', 'thread_messages',
                           'announcement_deliveries', 'automation_events', 'automation_runs'] loop
    execute format('drop trigger if exists %I on property.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on property.%I for each row execute function property.touch_updated_at()', t || '_touch_updated_at', t);
    execute format('alter table property.%I enable row level security', t);
    execute format('drop policy if exists %I on property.%I', t || '_demo_all', t);
    execute format('create policy %I on property.%I for all to anon, authenticated using (true) with check (true)', t || '_demo_all', t);
    execute format('grant select, insert, update, delete on property.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Enqueue a record event (callable from triggers, RPC, or server code).
create or replace function property.emit_record_event(
  p_project uuid, p_event text, p_table text, p_record uuid, p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = property, public
as $$
declare v_id uuid;
begin
  insert into property.automation_events (project_id, event_type, source_table, record_id, payload)
  values (p_project, p_event, p_table, p_record, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function property.emit_record_event(uuid, text, text, uuid, jsonb) to anon, authenticated, service_role;

-- Row trigger that maps inserts / status changes on key tables to record events.
-- Reads fields through jsonb so one function serves every table, and never
-- blocks the underlying write.
create or replace function property.record_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = property, public
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  ns text := lower(coalesce(n->>'status', ''));
  os text := lower(coalesce(o->>'status', ''));
  changed boolean := tg_op = 'INSERT' or ns is distinct from os;
  evs text[] := array[]::text[];
  e text;
  kind text;
begin
  if n->>'deleted_at' is not null then return new; end if;
  begin
    if tg_table_name = 'leases' then
      if tg_op = 'INSERT' then evs := evs || 'lease.created'; end if;
      if ns = 'active' and changed then evs := evs || 'lease.activated'; end if;
    elsif tg_table_name = 'applications' then
      if tg_op = 'INSERT' and ns <> 'draft' then evs := evs || 'application.submitted'; end if;
      if ns = 'approved' and changed then evs := evs || 'application.approved'; end if;
    elsif tg_table_name = 'work_orders' then
      if coalesce(n->>'kind', 'work_order') = 'work_order' then
        if tg_op = 'INSERT' then evs := evs || 'work_order.created'; end if;
        if ns = 'completed' and changed then evs := evs || 'work_order.completed'; end if;
      end if;
    elsif tg_table_name = 'transactions' then
      if tg_op = 'INSERT'
         and lower(coalesce(n->>'txn_type', n->>'kind', '')) in ('income', 'payment', 'receipt')
         and (n->>'tenant_id' is not null or n->>'lease_id' is not null) then
        evs := evs || 'payment.received';
      end if;
    elsif tg_table_name = 'moves' then
      kind := lower(coalesce(n->>'kind', 'in'));
      if n->>'move_date' is not null
         and (tg_op = 'INSERT' or (n->>'move_date') is distinct from (o->>'move_date')) then
        evs := evs || case when kind = 'out' then 'move_out.scheduled' else 'move_in.scheduled' end;
      end if;
    end if;

    foreach e in array evs loop
      perform property.emit_record_event(
        nullif(n->>'project_id', '')::uuid, e, tg_table_name, (n->>'id')::uuid,
        jsonb_build_object('status', n->>'status', 'previousStatus', o->>'status')
      );
    end loop;
  exception when others then
    raise warning 'record_event_trigger(%): %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['leases', 'applications', 'work_orders', 'transactions', 'moves'] loop
    if to_regclass('property.' || t) is not null then
      execute format('drop trigger if exists %I on property.%I', t || '_record_events', t);
      execute format('create trigger %I after insert or update on property.%I for each row execute function property.record_event_trigger()', t || '_record_events', t);
    end if;
  end loop;
end $$;

-- @down
do $$
declare t text;
begin
  foreach t in array array['leases', 'applications', 'work_orders', 'transactions', 'moves'] loop
    if to_regclass('property.' || t) is not null then
      execute format('drop trigger if exists %I on property.%I', t || '_record_events', t);
    end if;
  end loop;
end $$;
drop function if exists property.record_event_trigger();
drop function if exists property.emit_record_event(uuid, text, text, uuid, jsonb);
alter table property.announcements drop column if exists sent_at;
alter table property.announcements drop column if exists building_name;
alter table property.announcements drop column if exists building_id;
drop table if exists property.automation_runs cascade;
drop table if exists property.automation_events cascade;
drop table if exists property.announcement_deliveries cascade;
drop table if exists property.thread_messages cascade;
drop table if exists property.message_threads cascade;
drop table if exists property.notification_sends cascade;
drop table if exists property.job_runs cascade;
