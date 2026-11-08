-- Screening rules (RISK-05)
--
-- Owns property.screening_rules: a versioned, sourced catalog of location-specific tenant-screening rules (federal, state,
-- county, city). Rows with project_id null are the shared reference catalog (supabase/seeds/screening_rules, written by the
-- service role); a project_id row is a company's own rule from counsel, which shadows a shared row with the same
-- (jurisdiction_code, rule_key) for that project. `effects` follows lib/screening/rules_schema.js; enforcement is `warn`
-- unless a rule says `block`. An active rule must cite a source_url and a verified_on date.
-- Owns: guard_screening_jurisdiction() and its trigger (a property's metadata.screeningJurisdictionOverride needs
-- property.screening.criteria, like the screening criteria gate).
-- Reference content linking to original sources; not legal advice.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;
set local lock_timeout = '20s';

-- Shared trigger function, kept pinned (search_path '') as live has it.
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

create table if not exists property.screening_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  jurisdiction_code text not null,
  scope text not null default 'state',
  locality text,
  rule_key text not null,
  title text not null default '',
  topic text not null default 'process',
  effects jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to date,
  status text not null default 'active',
  enforcement text not null default 'warn',
  citation text,
  source_url text,
  legal_resource_id uuid,
  verification text not null default 'checked',
  verified_on date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint screening_rules_code_chk check (jurisdiction_code ~ '^US(-[A-Z0-9_]+){0,2}$'),
  constraint screening_rules_scope_chk check (scope in ('federal', 'state', 'county', 'city')),
  constraint screening_rules_topic_chk check (topic in ('criminal', 'eviction', 'credit', 'income', 'source_of_income', 'fees', 'process', 'notices', 'portable_report')),
  constraint screening_rules_status_chk check (status in ('active', 'pending', 'enjoined', 'repealed', 'withdrawn')),
  constraint screening_rules_enforcement_chk check (enforcement in ('warn', 'block')),
  constraint screening_rules_verification_chk check (verification in ('verified', 'unverifiable', 'checked')),
  constraint screening_rules_effects_chk check (jsonb_typeof(effects) = 'object'),
  constraint screening_rules_window_chk check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint screening_rules_sourced_chk check (status <> 'active' or (coalesce(source_url, '') <> '' and verified_on is not null))
);

create unique index if not exists screening_rules_reference_key_idx on property.screening_rules (jurisdiction_code, rule_key) where project_id is null;
create unique index if not exists screening_rules_project_key_idx on property.screening_rules (project_id, jurisdiction_code, rule_key)
  where project_id is not null and deleted_at is null;
create index if not exists screening_rules_jurisdiction_idx on property.screening_rules (jurisdiction_code) where deleted_at is null;
create index if not exists screening_rules_project_idx on property.screening_rules (project_id) where deleted_at is null;

drop trigger if exists screening_rules_touch_updated_at on property.screening_rules;
create trigger screening_rules_touch_updated_at
before update on property.screening_rules
for each row execute function property.touch_updated_at();

-- Members read their project's rules; writing one needs property.screening.criteria; shared rows come from the service role.
select property.apply_member_rls('screening_rules', null, 'property.screening.criteria');

-- Signed-in users read the shared catalog (no anon read: no public page shows it).
drop policy if exists screening_rules_global_select on property.screening_rules;
create policy screening_rules_global_select on property.screening_rules
  for select to authenticated
  using (project_id is null and deleted_at is null);

-- BEFORE INSERT/UPDATE of a property's metadata: a client changing screeningJurisdictionOverride needs property.screening.criteria.
create or replace function property.guard_screening_jurisdiction()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if (new.metadata -> 'screeningJurisdictionOverride') is distinct from
     (case when tg_op = 'UPDATE' then old.metadata -> 'screeningJurisdictionOverride' end)
     and (new.project_id is null or not property.rbac_allows('property.screening.criteria', new.project_id)) then
    raise exception 'Your role can''t change the screening jurisdiction.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.guard_screening_jurisdiction() from public, anon;

create or replace trigger properties_guard_screening_jurisdiction
before insert or update of metadata on property.properties
for each row execute function property.guard_screening_jurisdiction();

-- @down
drop trigger if exists properties_guard_screening_jurisdiction on property.properties;
drop function if exists property.guard_screening_jurisdiction();
drop table if exists property.screening_rules cascade;
