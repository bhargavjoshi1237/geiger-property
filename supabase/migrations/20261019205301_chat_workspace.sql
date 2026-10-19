-- Chat workspace
--
-- Owns the property.chat_* tables behind the Communications screen — the team
-- chat ported from geiger-flow's Grounding workspace, scoped to a project:
-- chat_profiles, chat_conversations, chat_members, chat_threads, chat_messages,
-- chat_files, chat_calls, chat_scheduled_calls and chat_notifications, plus the
-- chat_bump_activity trigger and the chat_toggle_reaction / chat_mark_reminded
-- RPCs. Also creates the public `property-chat` storage bucket and adds the live
-- tables to the supabase_realtime publication. Self-contained and idempotent.

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- A person as chat sees them: one row per user (the auth user id), shared across
-- projects. project_ids lists every project they have opened chat in, which is
-- what the per-project directory reads.
create table if not exists property.chat_profiles (
  id uuid primary key default gen_random_uuid(),
  email text,
  username text,
  display_name text not null default 'User',
  role text not null default '',
  avatar_color text not null default '#6366f1',
  presence text not null default 'offline',
  last_seen_at timestamptz not null default now(),
  project_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_profiles_email_idx on property.chat_profiles (lower(email));
create index if not exists chat_profiles_username_idx on property.chat_profiles (lower(username));
create index if not exists chat_profiles_projects_idx on property.chat_profiles using gin (project_ids);

-- A DM (two members, deduped per project by dm_key) or a channel.
create table if not exists property.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'dm' check (kind in ('dm', 'channel')),
  name text,
  topic text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  dm_key text,
  created_by uuid,
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists chat_conversations_dm_key
  on property.chat_conversations (project_id, dm_key) where dm_key is not null and deleted_at is null;
create unique index if not exists chat_conversations_channel_name_key
  on property.chat_conversations (project_id, lower(name)) where kind = 'channel' and deleted_at is null;
create index if not exists chat_conversations_project_kind_idx
  on property.chat_conversations (project_id, kind) where deleted_at is null;

create table if not exists property.chat_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references property.chat_conversations(id) on delete cascade,
  profile_id uuid not null references property.chat_profiles(id) on delete cascade,
  role text not null default 'member',
  pinned boolean not null default false,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists chat_members_unique on property.chat_members (conversation_id, profile_id);
create index if not exists chat_members_profile_idx on property.chat_members (profile_id);
-- Full row images so realtime DELETE events still carry profile_id for filtering.
alter table property.chat_members replica identity full;

-- A named sub-thread rooted on a message; its replies are messages with thread_id.
create table if not exists property.chat_threads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references property.chat_conversations(id) on delete cascade,
  root_message_id uuid,
  title text not null default 'Thread',
  created_by uuid,
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_threads_conversation_idx
  on property.chat_threads (conversation_id, last_activity_at desc) where deleted_at is null;

-- metadata carries reactions ({ key: [profileId] }), replyTo, mentions, call
-- (call-event card) and attachments.
create table if not exists property.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references property.chat_conversations(id) on delete cascade,
  thread_id uuid references property.chat_threads(id) on delete cascade,
  author_id uuid references property.chat_profiles(id) on delete set null,
  text text not null default '',
  edited_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_conversation_idx
  on property.chat_messages (conversation_id, created_at) where deleted_at is null;
create index if not exists chat_messages_thread_idx
  on property.chat_messages (thread_id, created_at) where deleted_at is null;

-- root_message_id closes the threads <-> messages cycle once both tables exist.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chat_threads_root_message_fk') then
    alter table property.chat_threads
      add constraint chat_threads_root_message_fk
      foreign key (root_message_id) references property.chat_messages(id) on delete set null;
  end if;
end $$;

-- Files shared in a conversation (binaries live in the property-chat bucket).
create table if not exists property.chat_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references property.chat_conversations(id) on delete cascade,
  message_id uuid references property.chat_messages(id) on delete set null,
  owner_id uuid,
  name text not null default 'file',
  kind text not null default 'doc',
  size_bytes bigint not null default 0,
  content_type text,
  url text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_files_project_idx
  on property.chat_files (project_id, created_at desc) where deleted_at is null;
create index if not exists chat_files_conversation_idx
  on property.chat_files (conversation_id, created_at desc) where deleted_at is null;

-- Call history: one row per person per call (owner_id is whose log it is).
create table if not exists property.chat_calls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references property.chat_conversations(id) on delete set null,
  owner_id uuid not null,
  title text not null default 'Call',
  kind text not null default 'audio' check (kind in ('audio', 'video')),
  direction text not null default 'outgoing' check (direction in ('outgoing', 'incoming')),
  missed boolean not null default false,
  duration_secs integer not null default 0,
  participant_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_calls_owner_idx
  on property.chat_calls (project_id, owner_id, created_at desc) where deleted_at is null;

-- reminded_ids records who has already been reminded, so each participant gets
-- exactly one reminder (see chat_mark_reminded).
create table if not exists property.chat_scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references property.chat_conversations(id) on delete set null,
  title text not null default 'Scheduled call',
  kind text not null default 'video' check (kind in ('audio', 'video')),
  scheduled_at timestamptz not null,
  created_by uuid,
  participant_ids uuid[] not null default '{}',
  reminded_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_scheduled_calls_project_idx
  on property.chat_scheduled_calls (project_id, scheduled_at) where deleted_at is null;

-- The chat Inbox: mentions, channel invites, missed calls and call reminders,
-- addressed to one person in one project.
create table if not exists property.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references property.chat_profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,
  title text not null default '',
  body text not null default '',
  actor_id uuid,
  conversation_id uuid references property.chat_conversations(id) on delete set null,
  message_id uuid,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_notifications_recipient_idx
  on property.chat_notifications (profile_id, project_id, created_at desc) where deleted_at is null;

-- updated_at triggers.
do $$
declare t text;
begin
  foreach t in array array['chat_profiles', 'chat_conversations', 'chat_threads', 'chat_messages', 'chat_scheduled_calls'] loop
    execute format('drop trigger if exists %I on property.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on property.%I for each row execute function property.touch_updated_at()',
      t || '_touch_updated_at', t);
  end loop;
end $$;

-- A new message bumps its conversation, and its thread when it is a reply.
create or replace function property.chat_bump_activity()
returns trigger language plpgsql as $$
begin
  update property.chat_conversations set last_activity_at = now() where id = new.conversation_id;
  if new.thread_id is not null then
    update property.chat_threads set last_activity_at = now() where id = new.thread_id;
  end if;
  return new;
end;
$$;
drop trigger if exists chat_messages_bump_activity on property.chat_messages;
create trigger chat_messages_bump_activity after insert on property.chat_messages
  for each row execute function property.chat_bump_activity();

-- Toggle one person's reaction on a message atomically, so two people reacting
-- at once never overwrite each other. Returns the message's reactions map.
create or replace function property.chat_toggle_reaction(p_message uuid, p_reaction text, p_profile uuid)
returns jsonb
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_reactions jsonb;
  v_list jsonb;
begin
  select coalesce(metadata -> 'reactions', '{}'::jsonb) into v_reactions
    from property.chat_messages
   where id = p_message and deleted_at is null
   for update;
  if not found then
    return null;
  end if;

  v_list := coalesce(v_reactions -> p_reaction, '[]'::jsonb);
  if v_list @> jsonb_build_array(p_profile::text) then
    v_list := v_list - p_profile::text;
  else
    v_list := v_list || jsonb_build_array(p_profile::text);
  end if;

  if jsonb_array_length(v_list) = 0 then
    v_reactions := v_reactions - p_reaction;
  else
    v_reactions := v_reactions || jsonb_build_object(p_reaction, v_list);
  end if;

  update property.chat_messages
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{reactions}', v_reactions)
   where id = p_message;
  return v_reactions;
end;
$$;

-- Claim a scheduled call's reminder for one person. True only for the first
-- caller, so two open tabs never raise the same reminder twice.
create or replace function property.chat_mark_reminded(p_id uuid, p_profile uuid)
returns boolean
language sql
security invoker
set search_path = property
as $$
  with claimed as (
    update property.chat_scheduled_calls
       set reminded_ids = array_append(reminded_ids, p_profile)
     where id = p_id and not (p_profile = any(reminded_ids))
     returning 1
  )
  select exists (select 1 from claimed);
$$;

grant execute on function property.chat_toggle_reaction(uuid, text, uuid) to anon, authenticated;
grant execute on function property.chat_mark_reminded(uuid, uuid) to anon, authenticated;

-- RLS: the suite-wide demo-open policy, one per table.
do $$
declare t text;
begin
  foreach t in array array['chat_profiles', 'chat_conversations', 'chat_members', 'chat_threads',
                           'chat_messages', 'chat_files', 'chat_calls', 'chat_scheduled_calls',
                           'chat_notifications'] loop
    execute format('grant all on property.%I to anon, authenticated, service_role', t);
    execute format('alter table property.%I enable row level security', t);
    execute format('drop policy if exists %I on property.%I', t || '_demo_all', t);
    execute format(
      'create policy %I on property.%I for all to anon, authenticated using (true) with check (true)',
      t || '_demo_all', t);
  end loop;
end $$;

-- Realtime: the tables the workspace subscribes to.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['chat_profiles', 'chat_conversations', 'chat_members', 'chat_threads',
                             'chat_messages', 'chat_notifications'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'property' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table property.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Storage: the public property-chat bucket (<projectId>/<ownerId>/<file>).
-- Anyone signed in may upload; only the uploader may replace or delete.
insert into storage.buckets (id, name, public)
values ('property-chat', 'property-chat', true)
on conflict (id) do update set public = excluded.public;

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

-- @down
drop policy if exists "Property chat read" on storage.objects;
drop policy if exists "Property chat upload" on storage.objects;
drop policy if exists "Property chat update" on storage.objects;
drop policy if exists "Property chat delete" on storage.objects;
-- The property-chat bucket is left in place: storage rows can only be removed
-- through the Storage API.

drop function if exists property.chat_mark_reminded(uuid, uuid);
drop function if exists property.chat_toggle_reaction(uuid, text, uuid);

drop table if exists property.chat_notifications cascade;
drop table if exists property.chat_scheduled_calls cascade;
drop table if exists property.chat_calls cascade;
drop table if exists property.chat_files cascade;
drop table if exists property.chat_messages cascade;
drop table if exists property.chat_threads cascade;
drop table if exists property.chat_members cascade;
drop table if exists property.chat_conversations cascade;
drop table if exists property.chat_profiles cascade;

drop function if exists property.chat_bump_activity() cascade;
