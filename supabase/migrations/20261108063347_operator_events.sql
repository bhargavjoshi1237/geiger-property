-- Operator events (PLAT-01h)
--
-- property.operator_events: what belongs to no project, so no member may see it — inbound mail that names no thread or
-- project address, and scheduler failures outside any project. Written by the service role (lib/operator/events.js);
-- read at /operator by PROPERTY_OPERATOR_EMAILS. Closed to every client role: RLS on, no policies, no anon/authenticated
-- privileges. Owns property.operator_events and its trigger (property.touch_updated_at, pinned in 20261108063346).

-- @up
create table if not exists property.operator_events (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('inbound_unattributed', 'job_failure')),
  source         text not null default '',
  summary        text not null,
  detail         jsonb not null default '{}'::jsonb,
  dedupe_key     text,
  occurrences    integer not null default 1,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  resolved_at    timestamptz,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create unique index if not exists operator_events_open_dedupe_uidx
  on property.operator_events (dedupe_key) where dedupe_key is not null and resolved_at is null and deleted_at is null;
create index if not exists operator_events_recent_idx
  on property.operator_events (last_seen_at desc) where deleted_at is null;

drop trigger if exists operator_events_touch_updated_at on property.operator_events;
create trigger operator_events_touch_updated_at
before update on property.operator_events
for each row execute function property.touch_updated_at();

-- Server-only: no client policy, and neither client role holds a privilege.
alter table property.operator_events enable row level security;
revoke all on property.operator_events from anon, authenticated;
grant select, insert, update on property.operator_events to service_role;

-- @down
drop table if exists property.operator_events cascade;
