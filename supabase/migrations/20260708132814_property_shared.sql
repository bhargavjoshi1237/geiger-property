-- Imported from property_shared.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Property — Cross-cutting sub-resources
--
-- Polymorphic tables reused by every editor via (owner_type, owner_id):
--   property.media            — photos/media library + per-owner galleries.
--   property.documents        — per-owner document attachments.
--   property.activity         — per-owner activity timeline.
--   property.amenity_links    — amenity ↔ owner (many-to-many attach).
--   property.floor_plan_links — floor plan ↔ owner (many-to-many attach).
--
-- owner_type ∈ property | unit | building | unit_type | portfolio.
-- Self-contained + idempotent.
-- ===========================================================================

create extension if not exists pgcrypto;
create schema if not exists property;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- media — photo/media library. owner_id null = unassigned library asset.
-- ---------------------------------------------------------------------------
create table if not exists property.media (
  id uuid primary key default gen_random_uuid(),
  owner_type text,
  owner_id uuid,
  -- photo | video | 360 | document
  kind text not null default 'photo',
  name text not null default 'Media',
  url text,
  thumb_url text,
  is_cover boolean not null default false,
  sort int not null default 0,
  size_bytes bigint not null default 0,
  -- Published | Draft
  status text not null default 'Published',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.media add column if not exists owner_type text;
alter table property.media add column if not exists owner_id uuid;
alter table property.media add column if not exists thumb_url text;
alter table property.media add column if not exists is_cover boolean not null default false;
alter table property.media add column if not exists sort int not null default 0;
alter table property.media add column if not exists size_bytes bigint not null default 0;
alter table property.media add column if not exists status text not null default 'Published';
alter table property.media add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.media add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.media add column if not exists deleted_at timestamptz;

create index if not exists property_media_owner_idx
  on property.media (owner_type, owner_id) where deleted_at is null;

drop trigger if exists media_touch_updated_at on property.media;
create trigger media_touch_updated_at
before update on property.media
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- documents — per-owner document attachments.
-- ---------------------------------------------------------------------------
create table if not exists property.documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text,
  owner_id uuid,
  -- lease | inspection | insurance | invoice | notice | other
  kind text not null default 'other',
  name text not null default 'Document',
  url text,
  size_bytes bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.documents add column if not exists owner_type text;
alter table property.documents add column if not exists owner_id uuid;
alter table property.documents add column if not exists kind text not null default 'other';
alter table property.documents add column if not exists url text;
alter table property.documents add column if not exists size_bytes bigint not null default 0;
alter table property.documents add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table property.documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.documents add column if not exists deleted_at timestamptz;

create index if not exists property_documents_owner_idx
  on property.documents (owner_type, owner_id) where deleted_at is null;

drop trigger if exists documents_touch_updated_at on property.documents;
create trigger documents_touch_updated_at
before update on property.documents
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- activity — per-owner activity timeline (system entries + user notes).
-- ---------------------------------------------------------------------------
create table if not exists property.activity (
  id uuid primary key default gen_random_uuid(),
  owner_type text,
  owner_id uuid,
  -- created | updated | note | attached | status
  verb text not null default 'note',
  summary text not null default '',
  actor_id uuid,
  actor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table property.activity add column if not exists owner_type text;
alter table property.activity add column if not exists owner_id uuid;
alter table property.activity add column if not exists verb text not null default 'note';
alter table property.activity add column if not exists summary text not null default '';
alter table property.activity add column if not exists actor_id uuid;
alter table property.activity add column if not exists actor_name text;
alter table property.activity add column if not exists occurred_at timestamptz not null default now();
alter table property.activity add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table property.activity add column if not exists deleted_at timestamptz;

create index if not exists property_activity_owner_idx
  on property.activity (owner_type, owner_id) where deleted_at is null;

drop trigger if exists activity_touch_updated_at on property.activity;
create trigger activity_touch_updated_at
before update on property.activity
for each row execute function property.touch_updated_at();

-- ---------------------------------------------------------------------------
-- amenity_links — amenity ↔ owner attach (many-to-many).
-- ---------------------------------------------------------------------------
create table if not exists property.amenity_links (
  id uuid primary key default gen_random_uuid(),
  amenity_id uuid not null,
  owner_type text not null,
  owner_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists property_amenity_links_unique
  on property.amenity_links (amenity_id, owner_type, owner_id);
create index if not exists property_amenity_links_owner_idx
  on property.amenity_links (owner_type, owner_id);

-- ---------------------------------------------------------------------------
-- floor_plan_links — floor plan ↔ owner attach (many-to-many).
-- ---------------------------------------------------------------------------
create table if not exists property.floor_plan_links (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null,
  owner_type text not null,
  owner_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists property_floor_plan_links_unique
  on property.floor_plan_links (floor_plan_id, owner_type, owner_id);
create index if not exists property_floor_plan_links_owner_idx
  on property.floor_plan_links (owner_type, owner_id);

-- ---------------------------------------------------------------------------
-- RLS — open demo policies (replaced with org-scoped policies when auth lands).
-- ---------------------------------------------------------------------------
alter table property.media enable row level security;
alter table property.documents enable row level security;
alter table property.activity enable row level security;
alter table property.amenity_links enable row level security;
alter table property.floor_plan_links enable row level security;

drop policy if exists property_media_demo_all on property.media;
create policy property_media_demo_all on property.media
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_documents_demo_all on property.documents;
create policy property_documents_demo_all on property.documents
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_activity_demo_all on property.activity;
create policy property_activity_demo_all on property.activity
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_amenity_links_demo_all on property.amenity_links;
create policy property_amenity_links_demo_all on property.amenity_links
  for all to anon, authenticated using (true) with check (true);

drop policy if exists property_floor_plan_links_demo_all on property.floor_plan_links;
create policy property_floor_plan_links_demo_all on property.floor_plan_links
  for all to anon, authenticated using (true) with check (true);

grant all on property.media, property.documents, property.activity,
  property.amenity_links, property.floor_plan_links
  to anon, authenticated, service_role;
