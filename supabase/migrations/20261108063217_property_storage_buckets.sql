-- Property storage buckets (PLAT-01g): private property-files, public-read property-public, property-chat turned private.
-- Owns every storage.objects policy on those three buckets: the first path segment is the project; members read and upload,
-- replacing or deleting a property-files / property-public object needs property.record.delete, chat binaries follow their conversation.
-- Owns property.try_uuid, property.chat_file_readable and property.storage_legacy_refs (the storage-migrate job's scan).
-- Adds bucket / storage_path to documents, media, maintenance_attachments and tenant_documents (chat_files: bucket); a stored path must sit in the row's project.
-- The suite-shared products bucket, its objects and its policies are not touched.

-- @up
set local lock_timeout = '15s';
create schema if not exists property;

-- Text → uuid, or null when it isn't one (a malformed path segment never raises inside a policy).
create or replace function property.try_uuid(p_text text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_text::uuid
  end
$$;
revoke all on function property.try_uuid(text) from public, anon;
grant execute on function property.try_uuid(text) to authenticated, service_role;

-- Buckets: property-files and property-chat private; property-public is served by public URL (no anon policy, so it can't be listed).
insert into storage.buckets (id, name, public, file_size_limit)
values ('property-files', 'property-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-public', 'property-public', true, 10485760, array['image/*'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public)
values ('property-chat', 'property-chat', false)
on conflict (id) do update set public = false;

-- File columns: the object's bucket and path (<project_id>/…).
alter table property.documents add column if not exists bucket text;
alter table property.documents add column if not exists storage_path text;
alter table property.media add column if not exists bucket text;
alter table property.media add column if not exists storage_path text;
alter table property.maintenance_attachments add column if not exists bucket text;
alter table property.maintenance_attachments add column if not exists storage_path text;
alter table property.tenant_documents add column if not exists bucket text;
alter table property.tenant_documents add column if not exists storage_path text;
alter table property.chat_files add column if not exists bucket text;

-- A row names a Property bucket only, and a path inside its own project.
do $$
declare t text;
begin
  foreach t in array array['documents', 'media', 'maintenance_attachments', 'tenant_documents', 'chat_files'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_storage_ref_check' and conrelid = format('property.%I', t)::regclass) then
      execute format(
        'alter table property.%I add constraint %I check ('
        || '(bucket is null or bucket in (''property-files'', ''property-public'', ''property-chat'', ''property-private''))'
        || ' and (storage_path is null or split_part(storage_path, ''/'', 1) = project_id::text))',
        t, t || '_storage_ref_check');
    end if;
  end loop;
end $$;

create index if not exists chat_files_storage_path_idx on property.chat_files (storage_path) where deleted_at is null;

-- A chat binary is readable through its live chat_files row: a readable conversation, or (none) the caller's project.
create or replace function property.chat_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from property.chat_files f
     where f.storage_path = p_name
       and f.deleted_at is null
       and f.project_id in (select property.member_project_ids())
       and (f.conversation_id is null or f.conversation_id in (select property.chat_readable_conversation_ids()))
  )
$$;
revoke all on function property.chat_file_readable(text) from public, anon;
grant execute on function property.chat_file_readable(text) to authenticated, service_role;

-- property-files: members of the path's project read (and so sign) and upload; replace / delete needs record.delete.
drop policy if exists "Property files member read" on storage.objects;
create policy "Property files member read" on storage.objects for select to authenticated
  using (bucket_id = 'property-files'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));

drop policy if exists "Property files member upload" on storage.objects;
create policy "Property files member upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-files'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));

drop policy if exists "Property files delete key update" on storage.objects;
create policy "Property files delete key update" on storage.objects for update to authenticated
  using (bucket_id = 'property-files'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.record.delete')))
  with check (bucket_id = 'property-files'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.record.delete')));

drop policy if exists "Property files delete key delete" on storage.objects;
create policy "Property files delete key delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-files'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.record.delete')));

-- property-public: public URLs serve reads; members list and upload, replace / delete needs record.delete.
drop policy if exists "Property public member read" on storage.objects;
create policy "Property public member read" on storage.objects for select to authenticated
  using (bucket_id = 'property-public'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));

drop policy if exists "Property public member upload" on storage.objects;
create policy "Property public member upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-public'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));

drop policy if exists "Property public delete key update" on storage.objects;
create policy "Property public delete key update" on storage.objects for update to authenticated
  using (bucket_id = 'property-public'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.record.delete')))
  with check (bucket_id = 'property-public'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.record.delete')));

drop policy if exists "Property public delete key delete" on storage.objects;
create policy "Property public delete key delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-public'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.permitted_project_ids('property.record.delete')));

-- property-chat (<project_id>/<uploader>/<file>): the uploader or a reader of the file's conversation; uploads only into your own folder.
drop policy if exists "Property chat read" on storage.objects;
drop policy if exists "Property chat upload" on storage.objects;
drop policy if exists "Property chat update" on storage.objects;
drop policy if exists "Property chat delete" on storage.objects;

drop policy if exists "Property chat member read" on storage.objects;
create policy "Property chat member read" on storage.objects for select to authenticated
  using (bucket_id = 'property-chat'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids())
    and (owner_id = (select auth.uid())::text or property.chat_file_readable(name)));

drop policy if exists "Property chat member upload" on storage.objects;
create policy "Property chat member upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-chat'
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids())
    and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists "Property chat uploader update" on storage.objects;
create policy "Property chat uploader update" on storage.objects for update to authenticated
  using (bucket_id = 'property-chat' and owner_id = (select auth.uid())::text
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()))
  with check (bucket_id = 'property-chat' and owner_id = (select auth.uid())::text
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));

drop policy if exists "Property chat uploader delete" on storage.objects;
create policy "Property chat uploader delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-chat' and owner_id = (select auth.uid())::text
    and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));

-- storage-migrate: every (table, row, column) still holding a public products/property URL (service role only).
create or replace function property.storage_legacy_refs(p_project uuid default null)
returns table (table_name text, row_id text, project_id uuid, column_name text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select c.table_name::text as tbl, c.column_name::text as col
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'property'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json')
       and exists (select 1 from information_schema.columns k
                    where k.table_schema = 'property' and k.table_name = c.table_name and k.column_name = 'project_id')
       and exists (select 1 from information_schema.columns k
                    where k.table_schema = 'property' and k.table_name = c.table_name and k.column_name = 'id')
     order by 1, 2
  loop
    return query execute format(
      'select %L::text, x.id::text, x.project_id, %L::text from property.%I x'
      || ' where x.%I::text like ''%%/object/public/products/property/%%'' and ($1::uuid is null or x.project_id = $1::uuid)',
      r.tbl, r.col, r.tbl, r.col)
      using p_project;
  end loop;
end;
$$;
revoke all on function property.storage_legacy_refs(uuid) from public, anon, authenticated;
grant execute on function property.storage_legacy_refs(uuid) to service_role;

-- @down
set local lock_timeout = '15s';
drop function if exists property.storage_legacy_refs(uuid);

drop policy if exists "Property chat member read" on storage.objects;
drop policy if exists "Property chat member upload" on storage.objects;
drop policy if exists "Property chat uploader update" on storage.objects;
drop policy if exists "Property chat uploader delete" on storage.objects;
drop policy if exists "Property public member read" on storage.objects;
drop policy if exists "Property public member upload" on storage.objects;
drop policy if exists "Property public delete key update" on storage.objects;
drop policy if exists "Property public delete key delete" on storage.objects;
drop policy if exists "Property files member read" on storage.objects;
drop policy if exists "Property files member upload" on storage.objects;
drop policy if exists "Property files delete key update" on storage.objects;
drop policy if exists "Property files delete key delete" on storage.objects;

-- The chat bucket's earlier public setup (20261019205301_chat_workspace).
update storage.buckets set public = true where id = 'property-chat';
drop policy if exists "Property chat read" on storage.objects;
create policy "Property chat read" on storage.objects
  for select to public using (bucket_id = 'property-chat');
drop policy if exists "Property chat upload" on storage.objects;
create policy "Property chat upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'property-chat');
drop policy if exists "Property chat update" on storage.objects;
create policy "Property chat update" on storage.objects
  for update to authenticated
  using (bucket_id = 'property-chat' and owner = auth.uid())
  with check (bucket_id = 'property-chat' and owner = auth.uid());
drop policy if exists "Property chat delete" on storage.objects;
create policy "Property chat delete" on storage.objects
  for delete to authenticated using (bucket_id = 'property-chat' and owner = auth.uid());

drop function if exists property.chat_file_readable(text);
drop index if exists property.chat_files_storage_path_idx;

alter table property.documents drop constraint if exists documents_storage_ref_check;
alter table property.media drop constraint if exists media_storage_ref_check;
alter table property.maintenance_attachments drop constraint if exists maintenance_attachments_storage_ref_check;
alter table property.tenant_documents drop constraint if exists tenant_documents_storage_ref_check;
alter table property.chat_files drop constraint if exists chat_files_storage_ref_check;
alter table property.documents drop column if exists bucket, drop column if exists storage_path;
alter table property.media drop column if exists bucket, drop column if exists storage_path;
alter table property.maintenance_attachments drop column if exists bucket, drop column if exists storage_path;
alter table property.tenant_documents drop column if exists bucket, drop column if exists storage_path;
alter table property.chat_files drop column if exists bucket;

drop function if exists property.try_uuid(text);
-- The property-files and property-public buckets stay: storage rows can only be removed through the Storage API.
