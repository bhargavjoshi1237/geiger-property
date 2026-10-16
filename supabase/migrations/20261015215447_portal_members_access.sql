-- Portal members access
--
-- Owns property.portal_members: maps a Supabase auth user / email to the
-- resident, owner or vendor record it may see in the self-service portals
-- (/portal). Staff invite rows (status invited); the first magic-link sign-in
-- links auth_user_id and flips the row to active. Portal routes read it with the
-- service-role client. (portal_accounts / portal_branding are unrelated orphans.)

-- @up
create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists property.portal_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  auth_user_id uuid,
  email text not null,
  name text not null default '',
  role text not null default 'resident',
  tenant_id uuid,
  owner_id uuid,
  vendor_id uuid,
  status text not null default 'invited',
  invited_at timestamptz,
  invited_by uuid,
  invite_count integer not null default 0,
  activated_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint portal_members_role_chk check (role in ('resident', 'owner', 'vendor')),
  constraint portal_members_status_chk check (status in ('invited', 'active', 'disabled'))
);

-- Back-fill columns on an older copy of the table.
alter table property.portal_members add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table property.portal_members add column if not exists auth_user_id uuid;
alter table property.portal_members add column if not exists invite_count integer not null default 0;
alter table property.portal_members add column if not exists last_seen_at timestamptz;

create index if not exists portal_members_email_idx
  on property.portal_members (lower(email))
  where deleted_at is null;

create index if not exists portal_members_auth_user_idx
  on property.portal_members (auth_user_id)
  where deleted_at is null;

create index if not exists portal_members_project_idx
  on property.portal_members (project_id);

-- One live membership per party record.
create unique index if not exists portal_members_party_uidx
  on property.portal_members (role, coalesce(tenant_id, owner_id, vendor_id))
  where deleted_at is null;

drop trigger if exists portal_members_touch_updated_at on property.portal_members;
create trigger portal_members_touch_updated_at
before update on property.portal_members
for each row execute function property.touch_updated_at();

alter table property.portal_members enable row level security;

drop policy if exists portal_members_demo_all on property.portal_members;
create policy portal_members_demo_all on property.portal_members
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on property.portal_members to anon, authenticated, service_role;

-- @down
drop table if exists property.portal_members cascade;
