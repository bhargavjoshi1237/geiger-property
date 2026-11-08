-- Full data export (PLAT-04)
--
-- Owns property.export_jobs, property.export_tables(), property.export_table_meta(uuid, text), property.export_files(uuid) and the
--   storage policy "Property exports need data.export".
-- export_jobs: one row per export (the whole project as ZIP parts, or one entity's CSV) from queued to succeeded / failed / expired.
--   Only the server writes it (service role); members holding property.data.export read it; every change is audited (PLAT-09).
--   At most one export per project is queued or running.
-- The functions are service-role only: the project tables an export reads (integration_secrets never listed), one table's row counts
--   and metadata keys for a project, and the project's stored files (exports themselves left out).
-- Archives sit at property-files/<project>/exports/<export id>/; reading or signing one also needs property.data.export.

-- @up
set local lock_timeout = '10s';
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

create table if not exists property.export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'full',
  entity text,
  status text not null default 'queued',
  bucket text,
  storage_path text,
  files jsonb not null default '[]'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  requested_by uuid,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint export_jobs_kind_chk check (kind in ('full', 'entity')),
  constraint export_jobs_entity_chk check ((kind = 'entity') = (entity is not null)),
  constraint export_jobs_status_chk check (status in ('queued', 'running', 'succeeded', 'failed', 'expired')),
  constraint export_jobs_storage_ref_check check (
    storage_path is null
    or (bucket = 'property-files' and split_part(storage_path, '/', 1) = project_id::text and split_part(storage_path, '/', 2) = 'exports')
  )
);

create index if not exists export_jobs_project_idx
  on property.export_jobs (project_id, created_at desc) where deleted_at is null;

-- One export at a time per project.
create unique index if not exists export_jobs_one_active_idx
  on property.export_jobs (project_id) where status in ('queued', 'running') and deleted_at is null;

drop trigger if exists export_jobs_touch_updated_at on property.export_jobs;
create trigger export_jobs_touch_updated_at
before update on property.export_jobs
for each row execute function property.touch_updated_at();

alter table property.export_jobs enable row level security;
revoke all on property.export_jobs from anon, authenticated;
grant select, insert, update on property.export_jobs to service_role;
select property.apply_member_rls('export_jobs', 'property.data.export', 'property.data.export', false);
select property.enable_audit('export_jobs');

-- The project tables a full export reads (base tables with project_id) and their columns in order; secrets are never listed.
create or replace function property.export_tables()
returns table (table_name text, columns text[])
language sql
stable
set search_path = ''
as $$
  select c.relname::text, array_agg(a.attname::text order by a.attnum)
    from pg_catalog.pg_class c
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where c.relnamespace = 'property'::regnamespace
     and c.relkind in ('r', 'p')
     and not c.relispartition
     and c.relname not in ('integration_secrets')
     and exists (select 1 from pg_catalog.pg_attribute p where p.attrelid = c.oid and p.attname = 'project_id' and not p.attisdropped)
   group by c.relname
   order by c.relname;
$$;
revoke all on function property.export_tables() from public, anon, authenticated;
grant execute on function property.export_tables() to service_role;

-- One export table's rows in a project (soft-deleted included), how many are deleted, and the top-level metadata keys they use.
create or replace function property.export_table_meta(p_project uuid, p_table text)
returns table (row_count bigint, deleted_count bigint, metadata_keys text[])
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rel regclass;
begin
  if p_project is null or not exists (select 1 from property.export_tables() t where t.table_name = p_table) then
    raise exception 'export_table_meta: % is not an export table', p_table;
  end if;
  v_rel := format('property.%I', p_table)::regclass;
  execute format(
    'select count(*)::bigint, %s from property.%I where project_id = $1',
    case when exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = v_rel and a.attname = 'deleted_at' and not a.attisdropped)
         then 'count(*) filter (where deleted_at is not null)::bigint' else '0::bigint' end,
    p_table
  ) into row_count, deleted_count using p_project;
  metadata_keys := '{}'::text[];
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = v_rel and a.attname = 'metadata' and a.atttypid = 'jsonb'::regtype and not a.attisdropped) then
    execute format(
      'select coalesce(array_agg(distinct k order by k), ''{}''::text[]) from property.%I x
         cross join lateral jsonb_object_keys(case when jsonb_typeof(x.metadata) = ''object'' then x.metadata else ''{}''::jsonb end) k
        where x.project_id = $1',
      p_table
    ) into metadata_keys using p_project;
  end if;
  return next;
end;
$$;
revoke all on function property.export_table_meta(uuid, text) from public, anon, authenticated;
grant execute on function property.export_table_meta(uuid, text) to service_role;

-- The project's stored files in the Property buckets, for the archive's documents folder (earlier exports left out).
create or replace function property.export_files(p_project uuid)
returns table (bucket text, name text, size bigint, mimetype text)
language sql
stable
set search_path = ''
as $$
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype'
    from storage.objects o
   where o.bucket_id in ('property-files', 'property-public', 'property-chat', 'property-private')
     and o.name like p_project::text || '/%'
     and not (o.bucket_id = 'property-files' and o.name like p_project::text || '/exports/%')
   order by o.bucket_id, o.name;
$$;
revoke all on function property.export_files(uuid) from public, anon, authenticated;
grant execute on function property.export_files(uuid) to service_role;

-- An export archive is the whole project: reading or signing one also needs property.data.export.
drop policy if exists "Property exports need data.export" on storage.objects;
create policy "Property exports need data.export" on storage.objects as restrictive for select to authenticated
  using (
    bucket_id <> 'property-files'
    or coalesce((storage.foldername(name))[2], '') <> 'exports'
    or property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.data.export'))
  );

-- @down
drop policy if exists "Property exports need data.export" on storage.objects;
drop function if exists property.export_files(uuid);
drop function if exists property.export_table_meta(uuid, text);
drop function if exists property.export_tables();
drop table if exists property.export_jobs cascade;
