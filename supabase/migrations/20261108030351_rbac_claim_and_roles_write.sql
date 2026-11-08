-- Rbac claim and roles write
--
-- PLAT-01a re-review: two security edges in 20261108024332_rbac_lockout_fixes.
-- rbac_ensure_membership safety net: owner/admin rows are read by p.organization_id, and a project whose org row is missing or soft-deleted is never claimed.
-- property_roles_insert / property_roles_update: only project role administrators write shared roles (the property.role.manage branch is gone).
-- @down restores 20261108024332's definitions.

-- @up
-- The caller's own grant in a project, minted on first load (precedence in 20261108024332's header and this file's).
create or replace function property.rbac_ensure_membership(p_project uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org_role text;
  v_member property.team_members%rowtype;
  v_target text;
  v_wanted text;
  v_role uuid;
  v_held uuid;
  v_grant uuid;
begin
  if p_project is null or v_uid is null or not property.can_access_project(p_project) then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('property-membership:' || p_project::text || ':' || v_uid::text)::bigint);

  select lower(coalesce(u.email, '')) into v_email from auth.users u where u.id = v_uid;

  -- Their roster row: already linked, else an unclaimed one addressed to their email.
  select tm.* into v_member
    from property.team_members tm
   where tm.project_id = p_project
     and tm.deleted_at is null
     and (tm.metadata ->> 'userId' = v_uid::text
          or (v_email <> '' and lower(tm.email) = v_email and not (tm.metadata ? 'userId')))
   order by (tm.metadata ->> 'userId' = v_uid::text) desc nulls last, tm.created_at
   limit 1;
  if v_member.id is not null and not (v_member.metadata ? 'userId') then
    update property.team_members set metadata = metadata || jsonb_build_object('userId', v_uid) where id = v_member.id;
  end if;

  select lower(ou.role::text) into v_org_role
    from public.projects p
    join public.organization_users ou on ou.organization = p.organization_id and ou."user" = v_uid
   where p.id = p_project
   limit 1;

  -- The org role decides for owners and admins, ahead of any roster row or past grant.
  if v_org_role = 'owner' or public.is_verified_project_owner(p_project) then
    v_target := 'owner';
  elsif public.can_administer_project_roles(p_project) then
    v_target := 'admin';
  elsif not exists (
          select 1
            from property.role_grants g
            join public.roles r on r.id = g.role_id and r.deleted_at is null
           where g.project_id = p_project and g.status = 'active' and g.deleted_at is null and '*' = any (r.permissions)
        )
        and exists (
          select 1
            from public.projects p
            left join public.organizations o on o.id = p.organization_id
           where p.id = p_project
             and (p.organization_id is null or (o.id is not null and o.deleted_at is null))
             and not ((p.organization_id is null and p.created_by is not null)
                      or o.owner is not null
                      or o.created_by is not null
                      or exists (select 1 from public.organization_users ou
                                  where ou.organization = p.organization_id and lower(ou.role::text) in ('owner', 'admin')))
        ) then
    -- Safety net: an ownerless project nobody can administer goes to the first member in; a missing or deleted org never does.
    v_target := 'owner';
  end if;

  if v_target is not null then
    v_role := property.rbac_seed_role(p_project, v_target);
    if v_role is null then
      return null;
    end if;
    select g.role_id into v_held
      from property.role_grants g
      join public.roles r on r.id = g.role_id and r.deleted_at is null
     where g.project_id = p_project and g.user_id = v_uid and g.status = 'active' and g.deleted_at is null
       and (g.role_id = v_role or '*' = any (r.permissions))
     order by (g.role_id = v_role) desc
     limit 1;
    if v_held is null then
      update property.role_grants g set status = 'active'
       where g.project_id = p_project and g.user_id = v_uid and g.role_id = v_role and g.deleted_at is null
      returning g.id into v_grant;
      if v_grant is null then
        insert into property.role_grants (project_id, user_id, role_id, status, metadata)
        values (p_project, v_uid, v_role, 'active', jsonb_build_object('source', 'membership'));
      end if;
      -- A default grant minted before they became an owner or admin steps aside.
      update property.role_grants g set status = 'inactive'
       where g.project_id = p_project and g.user_id = v_uid and g.role_id <> v_role
         and g.status = 'active' and g.deleted_at is null and g.metadata ->> 'source' = 'membership';
      v_held := v_role;
    end if;
    if v_member.status in ('Invited', 'Disabled') then
      update property.team_members set status = 'Active' where id = v_member.id;
    end if;
    return v_held;
  end if;

  select g.role_id into v_role
    from property.role_grants g
    join public.roles r on r.id = g.role_id and r.deleted_at is null
   where g.project_id = p_project and g.user_id = v_uid and g.status = 'active' and g.deleted_at is null
   limit 1;
  if v_role is not null then
    return v_role;
  end if;

  -- Any past grant (revoked, deactivated, or on a role deleted since) or a disabled roster row: no automatic grant.
  if v_member.status = 'Disabled'
     or exists (select 1 from property.role_grants g where g.project_id = p_project and g.user_id = v_uid) then
    return null;
  end if;

  -- The role an invitation names (system roles seeded from the config), else Manager.
  if coalesce(v_member.role, '') <> '' then
    v_wanted := trim(both '_' from regexp_replace(lower(v_member.role), '[^a-z0-9]+', '_', 'g'));
    if v_wanted not in ('owner', 'admin') and exists (select 1 from property.rbac_system_role(v_wanted)) then
      v_role := property.rbac_seed_role(p_project, v_wanted);
    else
      select r.id into v_role
        from public.roles r
       where r.project_id = p_project
         and r.deleted_at is null
         and (r.key = v_wanted or lower(r.name) = lower(trim(v_member.role)))
       order by (r.key = v_wanted) desc nulls last
       limit 1;
    end if;
  end if;

  -- team_members stays writable by any member until 01d, so an invitation never confers admin-grade access.
  if v_role is not null and exists (
       select 1 from public.roles r
        where r.id = v_role
          and (r.key in ('owner', 'admin')
               or exists (select 1 from unnest(r.permissions) k where k = '*' or k like '%.*' or k = 'property.role.manage'))
     ) then
    v_role := null;
  end if;

  if v_role is null then
    v_role := property.rbac_seed_role(p_project, 'manager');
  end if;
  if v_role is null then
    return null;
  end if;

  insert into property.role_grants (project_id, user_id, role_id, status, metadata)
  values (p_project, v_uid, v_role, 'active', jsonb_build_object('source', 'membership'))
  on conflict do nothing;

  if v_member.status = 'Invited' then
    update property.team_members set status = 'Active' where id = v_member.id;
  end if;
  return v_role;
end;
$$;
revoke all on function property.rbac_ensure_membership(uuid) from public, anon;
grant execute on function property.rbac_ensure_membership(uuid) to authenticated;

-- Shared roles are written by project role administrators only (org owner or admin, or an org-less project's creator).
drop policy if exists property_roles_insert on public.roles;
create policy property_roles_insert on public.roles
  for insert to authenticated
  with check (public.can_administer_project_roles(project_id));
drop policy if exists property_roles_update on public.roles;
create policy property_roles_update on public.roles
  for update to authenticated
  using (public.can_administer_project_roles(project_id))
  with check (public.can_administer_project_roles(project_id));

-- @down
-- The caller's own grant in a project, minted on first load (precedence in this file's header).
create or replace function property.rbac_ensure_membership(p_project uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org_role text;
  v_member property.team_members%rowtype;
  v_target text;
  v_wanted text;
  v_role uuid;
  v_held uuid;
  v_grant uuid;
begin
  if p_project is null or v_uid is null or not property.can_access_project(p_project) then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('property-membership:' || p_project::text || ':' || v_uid::text)::bigint);

  select lower(coalesce(u.email, '')) into v_email from auth.users u where u.id = v_uid;

  -- Their roster row: already linked, else an unclaimed one addressed to their email.
  select tm.* into v_member
    from property.team_members tm
   where tm.project_id = p_project
     and tm.deleted_at is null
     and (tm.metadata ->> 'userId' = v_uid::text
          or (v_email <> '' and lower(tm.email) = v_email and not (tm.metadata ? 'userId')))
   order by (tm.metadata ->> 'userId' = v_uid::text) desc nulls last, tm.created_at
   limit 1;
  if v_member.id is not null and not (v_member.metadata ? 'userId') then
    update property.team_members set metadata = metadata || jsonb_build_object('userId', v_uid) where id = v_member.id;
  end if;

  select lower(ou.role::text) into v_org_role
    from public.projects p
    join public.organization_users ou on ou.organization = p.organization_id and ou."user" = v_uid
   where p.id = p_project
   limit 1;

  -- The org role decides for owners and admins, ahead of any roster row or past grant.
  if v_org_role = 'owner' or public.is_verified_project_owner(p_project) then
    v_target := 'owner';
  elsif public.can_administer_project_roles(p_project) then
    v_target := 'admin';
  elsif not exists (
          select 1
            from property.role_grants g
            join public.roles r on r.id = g.role_id and r.deleted_at is null
           where g.project_id = p_project and g.status = 'active' and g.deleted_at is null and '*' = any (r.permissions)
        )
        and not exists (
          select 1
            from public.projects p
            left join public.organizations o on o.id = p.organization_id and o.deleted_at is null
           where p.id = p_project
             and ((p.organization_id is null and p.created_by is not null)
                  or o.owner is not null
                  or o.created_by is not null
                  or exists (select 1 from public.organization_users ou
                              where ou.organization = o.id and lower(ou.role::text) in ('owner', 'admin')))
        ) then
    -- Safety net: an ownerless project nobody can administer goes to the first member in.
    v_target := 'owner';
  end if;

  if v_target is not null then
    v_role := property.rbac_seed_role(p_project, v_target);
    if v_role is null then
      return null;
    end if;
    select g.role_id into v_held
      from property.role_grants g
      join public.roles r on r.id = g.role_id and r.deleted_at is null
     where g.project_id = p_project and g.user_id = v_uid and g.status = 'active' and g.deleted_at is null
       and (g.role_id = v_role or '*' = any (r.permissions))
     order by (g.role_id = v_role) desc
     limit 1;
    if v_held is null then
      update property.role_grants g set status = 'active'
       where g.project_id = p_project and g.user_id = v_uid and g.role_id = v_role and g.deleted_at is null
      returning g.id into v_grant;
      if v_grant is null then
        insert into property.role_grants (project_id, user_id, role_id, status, metadata)
        values (p_project, v_uid, v_role, 'active', jsonb_build_object('source', 'membership'));
      end if;
      -- A default grant minted before they became an owner or admin steps aside.
      update property.role_grants g set status = 'inactive'
       where g.project_id = p_project and g.user_id = v_uid and g.role_id <> v_role
         and g.status = 'active' and g.deleted_at is null and g.metadata ->> 'source' = 'membership';
      v_held := v_role;
    end if;
    if v_member.status in ('Invited', 'Disabled') then
      update property.team_members set status = 'Active' where id = v_member.id;
    end if;
    return v_held;
  end if;

  select g.role_id into v_role
    from property.role_grants g
    join public.roles r on r.id = g.role_id and r.deleted_at is null
   where g.project_id = p_project and g.user_id = v_uid and g.status = 'active' and g.deleted_at is null
   limit 1;
  if v_role is not null then
    return v_role;
  end if;

  -- A revoked or deactivated grant, or a disabled roster row, is a decision: never hand access back.
  if v_member.status = 'Disabled'
     or exists (select 1 from property.role_grants g where g.project_id = p_project and g.user_id = v_uid) then
    return null;
  end if;

  -- The role an invitation names (system roles seeded from the config), else Manager.
  if coalesce(v_member.role, '') <> '' then
    v_wanted := trim(both '_' from regexp_replace(lower(v_member.role), '[^a-z0-9]+', '_', 'g'));
    if v_wanted not in ('owner', 'admin') and exists (select 1 from property.rbac_system_role(v_wanted)) then
      v_role := property.rbac_seed_role(p_project, v_wanted);
    else
      select r.id into v_role
        from public.roles r
       where r.project_id = p_project
         and r.deleted_at is null
         and (r.key = v_wanted or lower(r.name) = lower(trim(v_member.role)))
       order by (r.key = v_wanted) desc nulls last
       limit 1;
    end if;
  end if;

  -- team_members stays writable by any member until 01d, so an invitation never confers admin-grade access.
  if v_role is not null and exists (
       select 1 from public.roles r
        where r.id = v_role
          and (r.key in ('owner', 'admin')
               or exists (select 1 from unnest(r.permissions) k where k = '*' or k like '%.*' or k = 'property.role.manage'))
     ) then
    v_role := null;
  end if;

  if v_role is null then
    v_role := property.rbac_seed_role(p_project, 'manager');
  end if;
  if v_role is null then
    return null;
  end if;

  insert into property.role_grants (project_id, user_id, role_id, status, metadata)
  values (p_project, v_uid, v_role, 'active', jsonb_build_object('source', 'membership'))
  on conflict do nothing;

  if v_member.status = 'Invited' then
    update property.team_members set status = 'Active' where id = v_member.id;
  end if;
  return v_role;
end;
$$;
revoke all on function property.rbac_ensure_membership(uuid) from public, anon;
grant execute on function property.rbac_ensure_membership(uuid) to authenticated;

-- Property's way into the shared roles table: insert and update only (roles are soft-deleted); suite guards still apply.
drop policy if exists property_roles_write on public.roles;
drop policy if exists property_roles_insert on public.roles;
create policy property_roles_insert on public.roles
  for insert to authenticated
  with check (
    public.can_administer_project_roles(project_id)
    or (
      public.is_project_member(project_id)
      and property.rbac_allows('property.role.manage', project_id)
      and not ('*' = any (permissions))
    )
  );
drop policy if exists property_roles_update on public.roles;
create policy property_roles_update on public.roles
  for update to authenticated
  using (
    public.can_administer_project_roles(project_id)
    or (
      public.is_project_member(project_id)
      and property.rbac_allows('property.role.manage', project_id)
      and not ('*' = any (permissions))
    )
  )
  with check (
    public.can_administer_project_roles(project_id)
    or (
      public.is_project_member(project_id)
      and property.rbac_allows('property.role.manage', project_id)
      and not ('*' = any (permissions))
    )
  );
