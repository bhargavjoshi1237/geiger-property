-- Screening data protection (RISK-02)
--
-- Owns property.screening_details (an application's identity detail, disclosures, report reference and findings, moved out of
-- applications.metadata and co-applicant record_items), property.applicant_fingerprints and property.screening_access_log.
-- All three are server-only on purpose, an intended exception to member RLS (MIGRATION_CONVENTIONS "RLS"): apply_member_rls
-- classifies them, then clients lose every privilege and a restrictive policy refuses them, so only service-role routes reach them.
-- Owns property.split_screening_detail(), property.store_screening_detail() and its triggers on applications and co-applicant
-- record_items: whoever writes those keys into metadata, they land in screening_details (a client needs screening.view_reports).
-- Storage: the private property-screening bucket (no client policy; the server signs), documents may name it, and application
-- files in property-files (<project>/application/…) need view_reports to read or sign, a restrictive policy over PLAT-01g's.
-- Moves the recorded detail out of metadata; @down moves it back.

-- @up
set local lock_timeout = '15s';
create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

-- Shared "touch updated_at" trigger function (suite convention, search_path pinned), defined here so the file stands alone.
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

-- Identity detail, disclosures, the report reference and findings per party ('primary' or a co-applicant record_items id).
create table if not exists property.screening_details (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  application_id uuid not null references property.applications(id) on delete cascade deferrable initially deferred,
  party_ref text not null default 'primary',
  detail jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint screening_details_detail_object check (jsonb_typeof(detail) = 'object')
);

create unique index if not exists screening_details_party_uidx
  on property.screening_details (application_id, party_ref) where deleted_at is null;
create index if not exists screening_details_project_idx
  on property.screening_details (project_id) where deleted_at is null;

drop trigger if exists screening_details_touch_updated_at on property.screening_details;
create trigger screening_details_touch_updated_at
before update on property.screening_details
for each row execute function property.touch_updated_at();

-- Keyed fingerprints (HMAC-SHA256 hex, keyed per project in lib/screening/protect.js) for duplicate and fraud checks; never the value.
create table if not exists property.applicant_fingerprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  application_id uuid references property.applications(id) on delete cascade,
  party_ref text not null default 'primary',
  kind text not null,
  digest text not null,
  last4 text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint applicant_fingerprints_kind_check
    check (kind in ('ssn', 'email', 'phone', 'dob_name', 'id_document', 'bank_account', 'document_sha256', 'ip')),
  constraint applicant_fingerprints_digest_check check (digest ~ '^[0-9a-f]{64}$'),
  constraint applicant_fingerprints_last4_check check (last4 is null or last4 ~ '^[0-9A-Za-z]{1,4}$')
);

create index if not exists applicant_fingerprints_digest_idx
  on property.applicant_fingerprints (project_id, kind, digest) where deleted_at is null;
create index if not exists applicant_fingerprints_application_idx
  on property.applicant_fingerprints (application_id) where deleted_at is null;

drop trigger if exists applicant_fingerprints_touch_updated_at on property.applicant_fingerprints;
create trigger applicant_fingerprints_touch_updated_at
before update on property.applicant_fingerprints
for each row execute function property.touch_updated_at();

-- Who viewed, downloaded, exported, printed or disposed of which screening object; written by server routes, append-only.
create table if not exists property.screening_access_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid,
  actor_name text not null default '',
  application_id uuid,
  object_type text not null,
  object_id text,
  action text not null,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint screening_access_log_object_type_check
    check (object_type in ('report', 'order', 'identity', 'income', 'document', 'notice')),
  constraint screening_access_log_action_check
    check (action in ('view', 'download', 'export', 'print', 'dispose'))
);

create index if not exists screening_access_log_application_idx
  on property.screening_access_log (project_id, application_id, created_at desc);
create index if not exists screening_access_log_project_idx
  on property.screening_access_log (project_id, created_at desc);

-- Append-only for every role (as property.audit_log): updates and deletes are refused.
create or replace function property.screening_access_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'property.screening_access_log is append-only' using errcode = '42501';
end;
$$;
revoke all on function property.screening_access_log_append_only() from public, anon;

drop trigger if exists screening_access_log_append_only on property.screening_access_log;
create trigger screening_access_log_append_only
before update or delete on property.screening_access_log
for each row execute function property.screening_access_log_append_only();

-- Server-only: classified by member RLS (reads would need view_reports), then closed to clients entirely so every read and
-- write goes through a service-role route that checks the key and logs the access.
select property.apply_member_rls('screening_details', 'property.screening.view_reports', null, false);
select property.apply_member_rls('applicant_fingerprints', 'property.screening.view_reports', null, false);
select property.apply_member_rls('screening_access_log', 'property.screening.view_reports', null, false);

do $$
declare
  t text;
begin
  foreach t in array array['screening_details', 'applicant_fingerprints', 'screening_access_log'] loop
    execute format('revoke all on property.%I from anon, authenticated', t);
    execute format('drop policy if exists %I on property.%I', t || '_server_only', t);
    execute format('create policy %I on property.%I as restrictive for all to authenticated using (false) with check (false)', t || '_server_only', t);
  end loop;
end $$;

revoke update, delete, truncate on property.screening_access_log from service_role;
grant select, insert on property.screening_access_log to service_role;

-- metadata → { detail, rest }: the screening detail keys (a co-applicant's with p_party) and each check's findings
-- (screening.<check>.notes → detail.findings.<check>), and the metadata without them. Pure.
create or replace function property.split_screening_detail(p_meta jsonb, p_party boolean default false)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[] := case when p_party then array['dateOfBirth', 'screeningNotes']
                        else array['dateOfBirth', 'idType', 'idLast4', 'evictedBefore', 'felonyDisclosed', 'disclosureNotes', 'screeningReference'] end;
  v_meta jsonb := p_meta;
  v_detail jsonb := '{}'::jsonb;
  v_findings jsonb := '{}'::jsonb;
  v_screening jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
begin
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
    return jsonb_build_object('detail', '{}'::jsonb, 'rest', p_meta);
  end if;
  foreach v_key in array v_keys loop
    if v_meta ? v_key then
      v_detail := v_detail || jsonb_build_object(v_key, v_meta -> v_key);
      v_meta := v_meta - v_key;
    end if;
  end loop;
  if not p_party and jsonb_typeof(v_meta -> 'screening') = 'object' then
    for v_key, v_val in select e.key, e.value from jsonb_each(v_meta -> 'screening') e loop
      if jsonb_typeof(v_val) = 'object' and v_val ? 'notes' then
        v_findings := v_findings || jsonb_build_object(v_key, v_val -> 'notes');
        v_val := v_val - 'notes';
      end if;
      v_screening := v_screening || jsonb_build_object(v_key, v_val);
    end loop;
    if v_findings <> '{}'::jsonb then
      v_detail := v_detail || jsonb_build_object('findings', v_findings);
      v_meta := jsonb_set(v_meta, '{screening}', v_screening);
    end if;
  end if;
  return jsonb_build_object('detail', v_detail, 'rest', v_meta);
end;
$$;
revoke all on function property.split_screening_detail(jsonb, boolean) from public, anon;

-- BEFORE INSERT / UPDATE OF metadata on applications and co-applicant record_items: moves the detail into screening_details.
-- The server (service role, migrations, seeds) moves everything; a client needs screening.view_reports to record a value,
-- and its blanks are dropped (clearing goes through the server route).
create or replace function property.store_screening_detail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trusted boolean := property.is_trusted_session();
  v_party boolean := tg_table_name = 'record_items';
  v_split jsonb;
  v_detail jsonb;
  v_findings jsonb;
  -- A co-applicant row belongs to its application (owner_id); an application row is its own primary party.
  v_app uuid := case when v_party then (to_jsonb(new) ->> 'owner_id')::uuid else new.id end;
  v_ref text := case when v_party then new.id::text else 'primary' end;
begin
  v_split := property.split_screening_detail(new.metadata, v_party);
  v_detail := v_split -> 'detail';
  if v_detail = '{}'::jsonb then
    return new;
  end if;
  new.metadata := v_split -> 'rest';
  if not v_trusted then
    if new.project_id is null or not property.rbac_allows('property.screening.view_reports', new.project_id) then
      if exists (select 1 from jsonb_each(v_detail - 'findings') e where e.value not in ('null'::jsonb, '""'::jsonb))
         or exists (select 1 from jsonb_each(coalesce(v_detail -> 'findings', '{}'::jsonb)) f where f.value not in ('null'::jsonb, '""'::jsonb)) then
        raise exception 'Your role can''t record identity details or screening findings.' using errcode = '42501';
      end if;
      return new;
    end if;
    -- A client's blanks carry nothing: only the server clears a value.
    select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) into v_findings
      from jsonb_each(coalesce(v_detail -> 'findings', '{}'::jsonb)) f where f.value not in ('null'::jsonb, '""'::jsonb);
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_detail
      from jsonb_each(v_detail - 'findings') e where e.value not in ('null'::jsonb, '""'::jsonb);
    if v_findings <> '{}'::jsonb then
      v_detail := v_detail || jsonb_build_object('findings', v_findings);
    end if;
    if v_detail = '{}'::jsonb then
      return new;
    end if;
  end if;
  if new.project_id is null or v_app is null then
    raise exception 'Screening detail needs a project and an application.' using errcode = '23514';
  end if;
  insert into property.screening_details as d (project_id, application_id, party_ref, detail)
  values (new.project_id, v_app, v_ref, v_detail)
  on conflict (application_id, party_ref) where deleted_at is null do update
    set detail = (d.detail || (excluded.detail - 'findings'))
                 || case when excluded.detail ? 'findings'
                         then jsonb_build_object('findings', coalesce(d.detail -> 'findings', '{}'::jsonb) || (excluded.detail -> 'findings'))
                         else '{}'::jsonb end;
  return new;
end;
$$;
revoke all on function property.store_screening_detail() from public, anon;

-- Move what is already recorded (soft-deleted rows included), then keep it out: the triggers run after RISK-03's screening gate.
insert into property.screening_details as d (project_id, application_id, party_ref, detail)
select a.project_id, a.id, 'primary', property.split_screening_detail(a.metadata, false) -> 'detail'
  from property.applications a
 where a.project_id is not null
   and property.split_screening_detail(a.metadata, false) -> 'detail' <> '{}'::jsonb
on conflict (application_id, party_ref) where deleted_at is null do update set detail = d.detail || excluded.detail;

update property.applications a
   set metadata = property.split_screening_detail(a.metadata, false) -> 'rest'
 where a.project_id is not null
   and property.split_screening_detail(a.metadata, false) -> 'detail' <> '{}'::jsonb;

insert into property.screening_details as d (project_id, application_id, party_ref, detail)
select r.project_id, r.owner_id, r.id::text, property.split_screening_detail(r.metadata, true) -> 'detail'
  from property.record_items r
  join property.applications a on a.id = r.owner_id
 where r.owner_type = 'application' and r.kind = 'co_applicant' and r.project_id is not null
   and property.split_screening_detail(r.metadata, true) -> 'detail' <> '{}'::jsonb
on conflict (application_id, party_ref) where deleted_at is null do update set detail = d.detail || excluded.detail;

update property.record_items r
   set metadata = property.split_screening_detail(r.metadata, true) -> 'rest'
 where r.owner_type = 'application' and r.kind = 'co_applicant' and r.project_id is not null
   and exists (select 1 from property.applications a where a.id = r.owner_id)
   and property.split_screening_detail(r.metadata, true) -> 'detail' <> '{}'::jsonb;

-- Check the moved rows' application link now, so the DDL below never meets pending deferred checks.
set constraints property.screening_details_application_id_fkey immediate;

create or replace trigger applications_screening_store
before insert or update of metadata on property.applications
for each row execute function property.store_screening_detail();

create or replace trigger record_items_screening_store
before insert or update of metadata, kind, owner_type, owner_id on property.record_items
for each row when (new.owner_type = 'application' and new.kind = 'co_applicant')
execute function property.store_screening_detail();

-- Screening files: a private bucket with no client policy at all; server routes upload and sign (5-minute URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-screening', 'property-screening', false, 10485760, array['image/*', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A documents row may name the screening bucket (still a path inside its own project).
alter table property.documents drop constraint if exists documents_storage_ref_check;
alter table property.documents add constraint documents_storage_ref_check check (
  (bucket is null or bucket in ('property-files', 'property-public', 'property-chat', 'property-private', 'property-screening'))
  and (storage_path is null or split_part(storage_path, '/', 1) = project_id::text));

-- Application files already in property-files (<project>/application/<id>/…) need report access to read or sign.
drop policy if exists "Property files application need report access" on storage.objects;
create policy "Property files application need report access" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'property-files'
    or (storage.foldername(name))[2] is distinct from 'application'
    or property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.screening.view_reports')));

-- Back to the constraint's default for anything later in this transaction (an application's insert stores its detail first).
set constraints property.screening_details_application_id_fkey deferred;

-- @down
set local lock_timeout = '15s';

drop policy if exists "Property files application need report access" on storage.objects;

alter table property.documents drop constraint if exists documents_storage_ref_check;
alter table property.documents add constraint documents_storage_ref_check check (
  (bucket is null or bucket in ('property-files', 'property-public', 'property-chat', 'property-private'))
  and (storage_path is null or split_part(storage_path, '/', 1) = project_id::text)) not valid;

drop trigger if exists applications_screening_store on property.applications;
drop trigger if exists record_items_screening_store on property.record_items;

-- Move the detail back into metadata (findings into screening.<check>.notes).
do $$
declare
  r record;
  v_meta jsonb;
  v_check text;
  v_note jsonb;
begin
  if to_regclass('property.screening_details') is null then
    return;
  end if;
  for r in select * from property.screening_details where deleted_at is null loop
    if r.party_ref = 'primary' then
      select coalesce(metadata, '{}'::jsonb) into v_meta from property.applications where id = r.application_id;
      v_meta := v_meta || (r.detail - 'findings');
      if r.detail ? 'findings' and jsonb_typeof(v_meta -> 'screening') is distinct from 'object' then
        v_meta := v_meta || '{"screening": {}}'::jsonb;
      end if;
      for v_check, v_note in select f.key, f.value from jsonb_each(coalesce(r.detail -> 'findings', '{}'::jsonb)) f loop
        v_meta := jsonb_set(v_meta, array['screening', v_check],
          coalesce(v_meta #> array['screening', v_check], '{}'::jsonb) || jsonb_build_object('notes', v_note), true);
      end loop;
      update property.applications set metadata = v_meta where id = r.application_id;
    else
      update property.record_items set metadata = coalesce(metadata, '{}'::jsonb) || r.detail where id::text = r.party_ref;
    end if;
  end loop;
end $$;

drop function if exists property.store_screening_detail();
drop function if exists property.split_screening_detail(jsonb, boolean);
drop table if exists property.screening_access_log cascade;
drop function if exists property.screening_access_log_append_only();
drop table if exists property.applicant_fingerprints cascade;
drop table if exists property.screening_details cascade;
-- The property-screening bucket stays: storage rows can only be removed through the Storage API.
