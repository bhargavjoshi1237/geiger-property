-- Rbac role sync (PLAT-01h)
--
-- property.rbac_sync_system_roles(): brings every project's uncustomized Property system roles up to the SQL copy of the
-- catalog (rbac_catalog_keys / rbac_system_role), so a deploy that adds keys reaches existing projects without waiting for
-- an Owner or Admin to open the workspace. A role is touched only when it carries metadata.propertyKnown (Property already
-- decided on it) and every key it decided on still matches its system definition; it then gains the definition's keys it
-- never decided on, and propertyKnown grows to the catalog. Customized roles, custom roles, other products' keys and roles
-- Property never seeded are left alone. Every regeneration migration (npm run rbac:sql) calls it after its new copy.
-- Trusted sessions only (migrations, the service role). Owns property.rbac_sync_system_roles().

-- @up
create or replace function property.rbac_sync_system_roles()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog text[] := property.rbac_catalog_keys();
  v_role record;
  v_def record;
  v_known text[];
  v_add text[];
  v_count integer := 0;
begin
  if not property.is_trusted_session() then
    raise exception 'Only migrations and the service role sync system roles.' using errcode = '42501';
  end if;
  for v_role in
    select r.id, r.key, r.permissions, r.metadata
      from public.roles r
     where r.deleted_at is null
       and r.project_id is not null
       and r.key is not null
       and jsonb_typeof(r.metadata -> 'propertyKnown') = 'array'
     order by r.project_id, r.key
       for update
  loop
    select * into v_def from property.rbac_system_role(v_role.key);
    continue when not found;
    v_known := array(select jsonb_array_elements_text(v_role.metadata -> 'propertyKnown'));
    continue when v_catalog <@ v_known;
    -- Customized: a key the role decided on no longer matches its system definition.
    continue when exists (
      select 1 from unnest(v_catalog) k
       where k = any (v_known)
         and public.rbac_key_matches(v_role.permissions, k) <> public.rbac_key_matches(v_def.permissions, k)
    );
    v_add := array(
      select t.k from unnest(v_catalog) with ordinality t(k, n)
       where not (t.k = any (v_known))
         and public.rbac_key_matches(v_def.permissions, t.k)
         and not public.rbac_key_matches(v_role.permissions, t.k)
       order by t.n
    );
    update public.roles r
       set permissions = r.permissions || v_add,
           metadata = r.metadata || jsonb_build_object('propertyKnown', to_jsonb(array(
             select t.k from unnest(v_known || v_catalog) with ordinality t(k, n) group by t.k order by min(t.n)
           )))
     where r.id = v_role.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function property.rbac_sync_system_roles() from public, anon, authenticated;
grant execute on function property.rbac_sync_system_roles() to service_role;

-- @down
drop function if exists property.rbac_sync_system_roles();
