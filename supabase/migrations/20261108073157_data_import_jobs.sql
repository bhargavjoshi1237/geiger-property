-- Data import jobs (PLAT-03)
--
-- Owns property.import_jobs (one file import: entity, source system, private file ref, column mapping, options, status,
-- counts) and property.import_rows (each file row: raw cells, mapped values, status, messages, the record it wrote and the
-- values an update replaced, for rollback). Every write goes through the /api/import routes (service role); members with
-- property.data.import read them. Records an import creates carry metadata.importJobId.

-- @up
create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

-- Shared "touch updated_at" trigger function (suite convention), pinned search_path as PLAT-01h requires.
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

create table if not exists property.import_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity text not null,
  source_system text not null default 'generic',
  file_name text,
  bucket text,
  storage_path text,
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  status text not null default 'uploaded',
  counts jsonb not null default '{}'::jsonb,
  error text,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint import_jobs_entity_chk check (entity in ('properties', 'units', 'owners', 'vendors', 'tenants', 'leases', 'open_balances', 'gl_opening')),
  constraint import_jobs_source_chk check (source_system in ('generic', 'appfolio', 'buildium', 'rent_manager', 'yardi_breeze')),
  constraint import_jobs_status_chk check (status in ('uploaded', 'mapped', 'validated', 'committing', 'committed', 'failed', 'rolled_back'))
);

create index if not exists import_jobs_project_idx on property.import_jobs (project_id, created_at desc) where deleted_at is null;

create table if not exists property.import_rows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references property.import_jobs(id) on delete cascade,
  row_no integer not null,
  raw jsonb not null default '{}'::jsonb,
  mapped jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  messages jsonb not null default '[]'::jsonb,
  target_table text,
  target_id uuid,
  before jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint import_rows_job_row_key unique (job_id, row_no),
  constraint import_rows_status_chk check (status in ('pending', 'valid', 'warning', 'error', 'skipped', 'created', 'updated', 'rolled_back'))
);

create index if not exists import_rows_job_status_idx on property.import_rows (job_id, status, row_no);
create index if not exists import_rows_project_idx on property.import_rows (project_id) where deleted_at is null;

drop trigger if exists import_jobs_touch_updated_at on property.import_jobs;
create trigger import_jobs_touch_updated_at
before update on property.import_jobs
for each row execute function property.touch_updated_at();

drop trigger if exists import_rows_touch_updated_at on property.import_rows;
create trigger import_rows_touch_updated_at
before update on property.import_rows
for each row execute function property.touch_updated_at();

-- Members holding data.import read; only the server (service role) writes.
select property.apply_member_rls('import_jobs', 'property.data.import', 'property.data.import', false);
select property.apply_member_rls('import_rows', 'property.data.import', 'property.data.import', false);

grant all on property.import_jobs to service_role;
grant all on property.import_rows to service_role;

-- @down
drop trigger if exists import_rows_touch_updated_at on property.import_rows;
drop trigger if exists import_jobs_touch_updated_at on property.import_jobs;
drop table if exists property.import_rows cascade;
drop table if exists property.import_jobs cascade;
