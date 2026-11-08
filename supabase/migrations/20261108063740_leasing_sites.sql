-- Leasing sites (LEAS-01)
--
-- Owns property.leasing_sites: one public vacancy site per project (/l/<handle>), its brand and contact. Adds
-- listings.slug (unique per project) and listings.published_at, and backfills slugs for listings live today.
-- Public pages never read through anon: the server reads these tables with the service role (lib/leasing/public).
-- feed_token (LEAS-11) and custom_domain (later) are server-written only.

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

create table if not exists property.leasing_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  handle text not null,
  enabled boolean not null default false,
  display_name text not null default '',
  brand jsonb not null default '{}'::jsonb,
  contact jsonb not null default '{}'::jsonb,
  feed_token text,
  custom_domain text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint leasing_sites_handle_format check (handle ~ '^[a-z0-9-]{3,40}$')
);

-- One live site per project, and a handle names one live site across every project.
create unique index if not exists leasing_sites_project_uidx on property.leasing_sites (project_id) where deleted_at is null;
create unique index if not exists leasing_sites_handle_uidx on property.leasing_sites (handle) where deleted_at is null;
create unique index if not exists leasing_sites_feed_token_uidx on property.leasing_sites (feed_token) where feed_token is not null and deleted_at is null;

drop trigger if exists leasing_sites_touch_updated_at on property.leasing_sites;
create trigger leasing_sites_touch_updated_at
before update on property.leasing_sites
for each row execute function property.touch_updated_at();

create or replace trigger leasing_sites_server_columns
before insert or update on property.leasing_sites
for each row execute function property.guard_server_columns('feed_token', 'custom_domain');

-- Members read the site; changing it needs Manage settings (it sits on Settings → Branding & Portals).
select property.apply_member_rls('leasing_sites', null, 'property.settings.manage');
select property.enable_audit('leasing_sites');

-- Listings: the public address (unique among a project's live rows) and when the listing last went live.
alter table property.listings add column if not exists slug text;
alter table property.listings add column if not exists published_at timestamptz;

create unique index if not exists listings_project_slug_uidx on property.listings (project_id, slug) where deleted_at is null;
create index if not exists listings_project_status_idx on property.listings (project_id, status) where deleted_at is null;

-- Backfill: listings live today get a slug from their title (reserved or taken names get an id suffix).
with src as (
  select l.id, l.project_id, l.created_at,
         coalesce(nullif(trim(both '-' from left(regexp_replace(lower(coalesce(nullif(l.name, ''), nullif(l.headline, ''), 'listing')), '[^a-z0-9]+', '-', 'g'), 60)), ''), 'listing') as base
    from property.listings l
   where l.slug is null and l.status = 'Active' and l.deleted_at is null and l.project_id is not null
), ranked as (
  select s.*, row_number() over (partition by s.project_id, s.base order by s.created_at, s.id) as n
    from src s
)
update property.listings l
   set slug = case
         when r.n = 1 and length(r.base) >= 3 and r.base not in ('embed', 'gone')
              and not exists (select 1 from property.listings x where x.project_id = r.project_id and x.slug = r.base and x.deleted_at is null)
           then r.base
         else r.base || '-' || right(replace(r.id::text, '-', ''), 6)
       end
  from ranked r
 where l.id = r.id;

update property.listings
   set published_at = case
         when metadata ->> 'lastPublishedAt' ~ '^\d{4}-\d{2}-\d{2}T' then (metadata ->> 'lastPublishedAt')::timestamptz
         when metadata ->> 'publishedAt' ~ '^\d{4}-\d{2}-\d{2}T' then (metadata ->> 'publishedAt')::timestamptz
         else updated_at
       end
 where published_at is null and status = 'Active' and deleted_at is null;

-- @down
drop index if exists property.listings_project_status_idx;
drop index if exists property.listings_project_slug_uidx;
alter table property.listings drop column if exists published_at;
alter table property.listings drop column if exists slug;
drop table if exists property.leasing_sites cascade;
