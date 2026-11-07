-- Playbook installs (ORCH-07)
--
-- Owns property.playbook_installs: one row per installed playbook per project
-- (lib/orchestration/playbooks). config holds the setup-wizard answers the
-- generated workflows were built from, automation_ids the workflows it owns.
-- Each generated automation carries metadata.playbook = { key, version,
-- installId, customized }. Uninstalling sets status 'removed' and pauses the
-- workflows, keeping their run history.

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

create table if not exists property.playbook_installs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  playbook_key text not null,
  version integer not null default 1,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  automation_ids uuid[] not null default '{}',
  installed_by uuid,
  installed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists playbook_installs_live_idx
  on property.playbook_installs (project_id, playbook_key) nulls not distinct
  where deleted_at is null and status <> 'removed';

drop trigger if exists playbook_installs_touch_updated_at on property.playbook_installs;
create trigger playbook_installs_touch_updated_at
before update on property.playbook_installs
for each row execute function property.touch_updated_at();

alter table property.playbook_installs enable row level security;
drop policy if exists playbook_installs_demo_all on property.playbook_installs;
create policy playbook_installs_demo_all on property.playbook_installs
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on property.playbook_installs to anon, authenticated, service_role;

-- Audit trail when the audit log (20261107220032_audit_log) is installed.
do $$
begin
  if to_regprocedure('property.enable_audit(text)') is not null then
    perform property.enable_audit('playbook_installs');
  end if;
end $$;

-- @down
drop table if exists property.playbook_installs cascade;
