-- Jurisdiction rules (CORE-13; the HOUS-07 rule table)
--
-- Owns property.jurisdiction_rules: user-maintained, effective-dated rules per state (or city, or one property) that code checks.
-- CORE-13 ships the table empty and reads kind 'deposit_disposition' (return deadline, mailing, accelerated rent, required wording)
-- as warnings; HOUS-07 adds its kinds' editors, reference rows and periods to the same table (the kind list already names them).
-- Members read; settings.manage writes (property.apply_member_rls). Reference rows (project_id null) are HOUS-07's to add.

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

create table if not exists property.jurisdiction_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  jurisdiction_code text not null,
  locality text,
  property_id uuid,
  kind text not null,
  name text not null default '',
  status text not null default 'active',
  enforcement text not null default 'warn',
  params jsonb not null default '{}'::jsonb,
  applies_to jsonb not null default '{}'::jsonb,
  citation text,
  source_url text,
  effective_from date,
  effective_to date,
  reference_rule_id uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint jurisdiction_rules_kind_chk check (kind in ('deposit_disposition', 'rent_increase_cap', 'increase_notice', 'deposit_cap', 'late_fee_cap', 'source_of_income')),
  constraint jurisdiction_rules_status_chk check (status in ('reference', 'draft', 'active', 'retired')),
  constraint jurisdiction_rules_enforcement_chk check (enforcement in ('warn', 'block')),
  constraint jurisdiction_rules_dates_chk check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists jurisdiction_rules_lookup_idx
  on property.jurisdiction_rules (project_id, jurisdiction_code, kind)
  where deleted_at is null;
create index if not exists jurisdiction_rules_property_idx
  on property.jurisdiction_rules (property_id)
  where deleted_at is null and property_id is not null;

drop trigger if exists jurisdiction_rules_touch_updated_at on property.jurisdiction_rules;
create trigger jurisdiction_rules_touch_updated_at
before update on property.jurisdiction_rules
for each row execute function property.touch_updated_at();

select property.apply_member_rls('jurisdiction_rules', null, 'property.settings.manage');

-- @down
drop table if exists property.jurisdiction_rules cascade;
