-- Message consents (LEAS-02, the LEAS-40 ledger's first slice)
--
-- Owns property.message_consents: an append-only record of a party's messaging consent per channel, with its proof
-- (wording hash, IP, user agent). LEAS-02 writes an `opted_in` row when the public inquiry form's consent box is ticked
-- (source `web_form`); LEAS-40 adds the staff, portal and STOP-keyword writers and the canContact() ledger read.
-- Members read their project's rows; only the server inserts, and nobody updates or deletes.

-- @up
create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function property.touch_updated_at() from public, anon;

create table if not exists property.message_consents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  party_type text not null,
  party_id uuid,
  channel text not null,
  address text not null default '',
  status text not null,
  scope text not null default 'all',
  source text not null,
  proof jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_consents_channel_check check (channel in ('email', 'sms', 'voice', 'push')),
  constraint message_consents_status_check check (status in ('opted_in', 'opted_out')),
  constraint message_consents_scope_check check (scope in ('all', 'transactional', 'marketing')),
  constraint message_consents_source_check check (source in ('portal', 'staff', 'sms_keyword', 'application', 'import', 'web_form'))
);

create index if not exists message_consents_party_idx
  on property.message_consents (party_type, party_id, channel, occurred_at desc);
create index if not exists message_consents_address_idx
  on property.message_consents (channel, address);

drop trigger if exists message_consents_touch_updated_at on property.message_consents;
create trigger message_consents_touch_updated_at
before update on property.message_consents
for each row execute function property.touch_updated_at();

-- Members read; the server writes (append-only: insert, never update or delete).
select property.apply_member_rls('message_consents', null, null, false);
revoke update, delete, truncate on property.message_consents from service_role;
grant select, insert on property.message_consents to service_role;

-- @down
drop table if exists property.message_consents cascade;
