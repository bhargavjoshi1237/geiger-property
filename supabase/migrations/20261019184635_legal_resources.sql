-- Legal resources
--
-- Owns property.legal_jurisdictions (one row per state, DC and "US" federal: the
-- main landlord-tenant statute and rent-regulation status) and
-- property.legal_resources (pinned links to official landlord-tenant sources:
-- statutes, government guides, court self-help, legal aid, local rent boards).
-- Reference content for the Legal Resources screen; it links to original sources
-- and is not legal advice. Rows with project_id null are shared by every project;
-- a project_id scopes a company's own additions. Content ships as a seed
-- (supabase/seeds/legal_resources), never in this migration.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists property.legal_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  code text not null,
  name text not null default '',
  kind text not null default 'state',
  primary_law_citation text,
  statewide_rent_cap boolean not null default false,
  rent_control_preempted text not null default 'unknown',
  rent_regulation_summary text,
  rent_regulation_source_url text,
  local_rent_control text[] not null default '{}'::text[],
  last_reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint legal_jurisdictions_kind_chk check (kind in ('state', 'federal')),
  constraint legal_jurisdictions_preempted_chk check (rent_control_preempted in ('yes', 'no', 'partial', 'unknown'))
);
create unique index if not exists legal_jurisdictions_code_idx on property.legal_jurisdictions (code) where project_id is null;
create index if not exists legal_jurisdictions_project_idx on property.legal_jurisdictions (project_id) where deleted_at is null;

create table if not exists property.legal_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  jurisdiction_code text not null,
  scope text not null default 'state',
  locality text,
  title text not null default '',
  url text not null,
  publisher text not null default '',
  publisher_type text not null default 'other',
  category text not null default 'other',
  topics text[] not null default '{}'::text[],
  audience text not null default 'both',
  format text not null default 'html',
  description text,
  citation text,
  source_updated text,
  verification text not null default 'checked',
  verification_note text,
  checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint legal_resources_scope_chk check (scope in ('federal', 'national', 'state', 'county', 'city')),
  constraint legal_resources_audience_chk check (audience in ('tenant', 'landlord', 'both')),
  constraint legal_resources_verification_chk check (verification in ('verified', 'unverifiable', 'checked'))
);
create index if not exists legal_resources_jurisdiction_idx on property.legal_resources (jurisdiction_code, category) where deleted_at is null;
create index if not exists legal_resources_project_idx on property.legal_resources (project_id) where deleted_at is null;

drop trigger if exists legal_jurisdictions_touch_updated_at on property.legal_jurisdictions;
create trigger legal_jurisdictions_touch_updated_at
before update on property.legal_jurisdictions
for each row execute function property.touch_updated_at();

drop trigger if exists legal_resources_touch_updated_at on property.legal_resources;
create trigger legal_resources_touch_updated_at
before update on property.legal_resources
for each row execute function property.touch_updated_at();

alter table property.legal_jurisdictions enable row level security;
alter table property.legal_resources enable row level security;

drop policy if exists legal_jurisdictions_demo_all on property.legal_jurisdictions;
create policy legal_jurisdictions_demo_all on property.legal_jurisdictions for all to anon, authenticated
  using (true) with check (true);
drop policy if exists legal_resources_demo_all on property.legal_resources;
create policy legal_resources_demo_all on property.legal_resources for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on property.legal_jurisdictions, property.legal_resources
  to anon, authenticated, service_role;

-- @down
drop table if exists property.legal_resources cascade;
drop table if exists property.legal_jurisdictions cascade;
