create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists ltree;
create extension if not exists btree_gist;

create table if not exists public.flow_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  suite_account_id uuid,
  plan text not null default 'free',
  status text not null default 'active' check (status in ('active', 'paused', 'suspended', 'deleted')),
  timezone text not null default 'UTC',
  locale text not null default 'en',
  data_region text not null default 'ap-south-1',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.flow_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.flow_organizations(id) on delete set null,
  display_name text,
  email citext,
  avatar_url text,
  role text not null default 'member',
  position text,
  preferences jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flow_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.flow_organizations(id) on delete cascade,
  name text not null,
  slug citext not null,
  logo_url text,
  provider text not null default 'AWS',
  region text not null default 'ap-south-1',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'ARCHIVED', 'UNKNOWN')),
  tags text[] not null default array[]::text[],
  color text,
  priority smallint not null default 0,
  budget numeric(14,2),
  starts_on date,
  ends_on date,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(provider, '') || ' ' || coalesce(region, ''))) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  unique (organization_id, slug)
);

alter table public.flow_projects add column if not exists organization_id uuid references public.flow_organizations(id) on delete cascade;
alter table public.flow_projects add column if not exists slug citext;
alter table public.flow_projects add column if not exists logo_url text;
alter table public.flow_projects add column if not exists provider text not null default 'AWS';
alter table public.flow_projects add column if not exists region text not null default 'ap-south-1';
alter table public.flow_projects add column if not exists status text not null default 'ACTIVE';
alter table public.flow_projects add column if not exists tags text[] not null default array[]::text[];
alter table public.flow_projects add column if not exists color text;
alter table public.flow_projects add column if not exists priority smallint not null default 0;
alter table public.flow_projects add column if not exists budget numeric(14,2);
alter table public.flow_projects add column if not exists starts_on date;
alter table public.flow_projects add column if not exists ends_on date;
alter table public.flow_projects add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.flow_projects add column if not exists updated_at timestamptz not null default now();
alter table public.flow_projects add column if not exists archived_at timestamptz;
alter table public.flow_projects add column if not exists deleted_at timestamptz;
update public.flow_projects
set slug = lower(regexp_replace(coalesce(nullif(name, ''), id::text), '[^a-zA-Z0-9]+', '-', 'g'))::citext
where slug is null;
alter table public.flow_projects add column if not exists search_vector tsvector generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(provider, '') || ' ' || coalesce(region, ''))) stored;

create table if not exists public.flow_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.flow_projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email citext,
  display_name text,
  role text not null default 'member',
  position text,
  permissions jsonb not null default '{}'::jsonb,
  allocation_percent numeric(5,2) not null default 100 check (allocation_percent >= 0 and allocation_percent <= 100),
  joined_at timestamptz,
  invited_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('invited', 'active', 'inactive', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id),
  unique (project_id, email)
);

create table if not exists public.flow_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.flow_organizations(id) on delete cascade,
  project_id uuid references public.flow_projects(id) on delete cascade,
  name text not null default 'Core Team',
  members jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flow_workspace_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.flow_organizations(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, role_key)
);

alter table public.flow_teams add column if not exists organization_id uuid references public.flow_organizations(id) on delete cascade;
alter table public.flow_teams add column if not exists project_id uuid references public.flow_projects(id) on delete cascade;
alter table public.flow_teams add column if not exists name text not null default 'Core Team';
alter table public.flow_teams add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.flow_teams add column if not exists updated_at timestamptz not null default now();

alter table public.flow_workspace_roles add column if not exists organization_id uuid references public.flow_organizations(id) on delete cascade;
alter table public.flow_workspace_roles add column if not exists role_key text;
alter table public.flow_workspace_roles add column if not exists name text;
alter table public.flow_workspace_roles add column if not exists description text;
alter table public.flow_workspace_roles add column if not exists permissions jsonb not null default '[]'::jsonb;
alter table public.flow_workspace_roles add column if not exists is_system boolean not null default false;
alter table public.flow_workspace_roles add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.flow_workspace_roles add column if not exists created_at timestamptz not null default now();
alter table public.flow_workspace_roles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.flow_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.flow_organizations(id) on delete cascade,
  project_id uuid references public.flow_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text,
  source_id uuid,
  title text not null,
  description text not null,
  type text not null,
  read boolean not null default false,
  icon text not null default 'bell',
  icon_color text not null default '#ededed',
  bg_color text not null default '#202020',
  action_url text,
  extra jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.flow_notifications add column if not exists organization_id uuid references public.flow_organizations(id) on delete cascade;
alter table public.flow_notifications add column if not exists project_id uuid references public.flow_projects(id) on delete cascade;
alter table public.flow_notifications add column if not exists source_type text;
alter table public.flow_notifications add column if not exists source_id uuid;
alter table public.flow_notifications add column if not exists action_url text;
alter table public.flow_notifications add column if not exists scheduled_for timestamptz;
alter table public.flow_notifications add column if not exists delivered_at timestamptz;
alter table public.flow_notifications add column if not exists created_at timestamptz not null default now();

create or replace function public.flow_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.flow_is_project_member(project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.flow_project_members member
    where member.project_id = $1
      and member.user_id = auth.uid()
      and member.status = 'active'
  );
$$;

create or replace function public.flow_is_org_member(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.flow_profiles profile
    where profile.organization_id = $1
      and profile.id = auth.uid()
  );
$$;

create or replace function public.flow_can_manage_org_roles(organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.flow_profiles profile
    where profile.organization_id = $1
      and profile.id = auth.uid()
      and profile.role in ('workspace_owner', 'owner', 'admin', 'lead')
  );
$$;

create index if not exists flow_projects_org_status_idx on public.flow_projects (organization_id, status);
create index if not exists flow_projects_search_idx on public.flow_projects using gin (search_vector);
create index if not exists flow_project_members_project_idx on public.flow_project_members (project_id, status);
create index if not exists flow_workspace_roles_org_idx on public.flow_workspace_roles (organization_id);
create index if not exists flow_notifications_user_read_idx on public.flow_notifications (user_id, read, created_at desc);

alter table public.flow_organizations enable row level security;
alter table public.flow_profiles enable row level security;
alter table public.flow_projects enable row level security;
alter table public.flow_project_members enable row level security;
alter table public.flow_teams enable row level security;
alter table public.flow_workspace_roles enable row level security;
alter table public.flow_notifications enable row level security;

drop policy if exists flow_organizations_member_select on public.flow_organizations;
create policy flow_organizations_member_select on public.flow_organizations
for select using (public.flow_is_org_member(id));

drop policy if exists flow_profiles_self_select on public.flow_profiles;
create policy flow_profiles_self_select on public.flow_profiles
for select using (id = auth.uid() or public.flow_is_org_member(organization_id));

drop policy if exists flow_profiles_self_insert on public.flow_profiles;
create policy flow_profiles_self_insert on public.flow_profiles
for insert with check (id = auth.uid());

drop policy if exists flow_profiles_self_update on public.flow_profiles;
create policy flow_profiles_self_update on public.flow_profiles
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists flow_profiles_role_manager_update on public.flow_profiles;
create policy flow_profiles_role_manager_update on public.flow_profiles
for update using (public.flow_can_manage_org_roles(organization_id))
with check (public.flow_can_manage_org_roles(organization_id));

drop policy if exists flow_projects_member_all on public.flow_projects;
create policy flow_projects_member_all on public.flow_projects
for all using (public.flow_is_project_member(id)) with check (public.flow_is_org_member(organization_id));

drop policy if exists flow_project_members_project_select on public.flow_project_members;
create policy flow_project_members_project_select on public.flow_project_members
for select using (public.flow_is_project_member(project_id));

drop policy if exists flow_project_members_project_insert on public.flow_project_members;
create policy flow_project_members_project_insert on public.flow_project_members
for insert with check (
  public.flow_is_project_member(project_id)
  or exists (
    select 1
    from public.flow_projects project
    where project.id = project_id
      and project.created_by = auth.uid()
  )
);

drop policy if exists flow_project_members_project_update on public.flow_project_members;
create policy flow_project_members_project_update on public.flow_project_members
for update using (public.flow_is_project_member(project_id)) with check (public.flow_is_project_member(project_id));

drop policy if exists flow_teams_project_select on public.flow_teams;
create policy flow_teams_project_select on public.flow_teams
for select using (project_id is null or public.flow_is_project_member(project_id));

drop policy if exists flow_teams_project_write on public.flow_teams;
create policy flow_teams_project_write on public.flow_teams
for all using (project_id is null or public.flow_is_project_member(project_id))
with check (project_id is null or public.flow_is_project_member(project_id));

drop policy if exists flow_workspace_roles_org_select on public.flow_workspace_roles;
create policy flow_workspace_roles_org_select on public.flow_workspace_roles
for select using (public.flow_is_org_member(organization_id));

drop policy if exists flow_workspace_roles_org_write on public.flow_workspace_roles;
create policy flow_workspace_roles_org_write on public.flow_workspace_roles
for all using (public.flow_can_manage_org_roles(organization_id))
with check (public.flow_can_manage_org_roles(organization_id));

drop policy if exists flow_notifications_owner_all on public.flow_notifications;
create policy flow_notifications_owner_all on public.flow_notifications
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
