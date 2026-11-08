-- Global record search (PLAT-05)
--
-- Owns property.search_records(uuid, text, text[], integer) and the <table>_search_trgm indexes it reads through.
-- The ⌘K palette sends each debounced query here. Security invoker, so member RLS scopes rows to the caller's projects;
-- a record type also needs its page and section view keys in the project (the sidebar's canView), so roles that can't
-- open Owners or Bills never get owner or bill hits. lib/search.js mirrors this for the playground sandbox.
-- pg_trgm already lives in schema public on the shared project; each index covers one table's own search text, live rows only.

-- @up
-- Each index build holds a short SHARE lock on a small table; fail fast rather than queue behind another session.
set local lock_timeout = '5s';

create extension if not exists pg_trgm with schema public;

create index if not exists tenants_search_trgm on property.tenants using gin ((
  coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' '
  || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(unit, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists prospects_search_trgm on property.prospects using gin ((
  coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' '
  || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(unit, '') || ' ' || coalesce(property_name, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists applications_search_trgm on property.applications using gin ((
  coalesce(name, '') || ' ' || coalesce(applicant_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' '
  || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(unit, '') || ' ' || coalesce(property_label, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists owners_search_trgm on property.owners using gin ((
  coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' '
  || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists vendors_search_trgm on property.vendors using gin ((
  coalesce(name, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' '
  || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(specialty, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists properties_search_trgm on property.properties using gin ((
  coalesce(name, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state, '') || ' ' || coalesce(zip, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists units_search_trgm on property.units using gin ((
  coalesce(label, '') || ' ' || coalesce(occupant_name, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists leases_search_trgm on property.leases using gin ((
  coalesce(name, '') || ' ' || coalesce(unit, '') || ' ' || coalesce(tenant_name, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists work_orders_search_trgm on property.work_orders using gin ((
  coalesce(name, '') || ' ' || coalesce(property_label, '') || ' ' || coalesce(tenant_name, '') || ' '
  || coalesce(vendor_name, '') || ' ' || coalesce(category, '')
) public.gin_trgm_ops) where deleted_at is null;

create index if not exists bills_search_trgm on property.bills using gin ((
  coalesce(name, '') || ' ' || coalesce(vendor_name, '') || ' ' || coalesce(reference, '')
) public.gin_trgm_ops) where deleted_at is null;

-- Up to p_limit live records per type whose search text contains the query: (id, type, title, subtitle, keywords).
-- p_types narrows the types (null: all); each haystack below matches its index expression exactly.
create or replace function property.search_records(
  p_project uuid,
  p_query text,
  p_types text[] default null,
  p_limit integer default 5
)
returns table (id uuid, type text, title text, subtitle text, keywords text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_like text;
  v_prefix text;
begin
  if p_project is null or char_length(v_query) < 2 then
    return;
  end if;
  -- A phone-shaped query ("555-1237", "(206) 555") matches the digits-only phone in the haystack.
  if v_query ~ '^[0-9()+.\s-]+$' and char_length(regexp_replace(v_query, '[^0-9]', '', 'g')) >= 3 then
    v_query := regexp_replace(v_query, '[^0-9]', '', 'g');
  end if;
  -- LIKE wildcards typed by the user match literally.
  v_query := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');
  v_like := '%' || v_query || '%';
  v_prefix := v_query || '%';

  if (p_types is null or 'tenant' = any(p_types))
     and property.rbac_allows('property.tenants.view', p_project)
     and property.rbac_allows('property.people.view', p_project) then
    return query
      select t.id, 'tenant'::text, t.name, nullif(t.unit, ''), h.hay
        from property.tenants t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.email, '') || ' ' || coalesce(t.phone, '') || ' '
          || regexp_replace(coalesce(t.phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(t.unit, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'prospect' = any(p_types))
     and property.rbac_allows('property.prospects.view', p_project)
     and property.rbac_allows('property.marketing_leads.view', p_project) then
    return query
      select t.id, 'prospect'::text, t.name, coalesce(nullif(t.unit, ''), nullif(t.property_name, '')), h.hay
        from property.prospects t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.email, '') || ' ' || coalesce(t.phone, '') || ' '
          || regexp_replace(coalesce(t.phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(t.unit, '') || ' ' || coalesce(t.property_name, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'application' = any(p_types))
     and property.rbac_allows('property.applications.view', p_project)
     and property.rbac_allows('property.marketing_leads.view', p_project) then
    return query
      select t.id, 'application'::text, t.name, coalesce(nullif(t.unit, ''), nullif(t.property_label, '')), h.hay
        from property.applications t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.applicant_name, '') || ' ' || coalesce(t.email, '') || ' ' || coalesce(t.phone, '') || ' '
          || regexp_replace(coalesce(t.phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(t.unit, '') || ' ' || coalesce(t.property_label, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'owner' = any(p_types))
     and property.rbac_allows('property.owners.view', p_project)
     and property.rbac_allows('property.people.view', p_project) then
    return query
      select t.id, 'owner'::text, t.name, null::text, h.hay
        from property.owners t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.company, '') || ' ' || coalesce(t.email, '') || ' ' || coalesce(t.phone, '') || ' '
          || regexp_replace(coalesce(t.phone, ''), '[^0-9]', '', 'g') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'vendor' = any(p_types))
     and property.rbac_allows('property.vendors.view', p_project)
     and property.rbac_allows('property.people.view', p_project) then
    return query
      select t.id, 'vendor'::text, t.name, nullif(t.specialty, ''), h.hay
        from property.vendors t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.contact_name, '') || ' ' || coalesce(t.email, '') || ' ' || coalesce(t.phone, '') || ' '
          || regexp_replace(coalesce(t.phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(t.specialty, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'property' = any(p_types))
     and property.rbac_allows('property.properties.view', p_project)
     and property.rbac_allows('property.property.view', p_project) then
    return query
      select t.id, 'property'::text, t.name, nullif(concat_ws(', ', nullif(t.city, ''), nullif(t.state, '')), ''), h.hay
        from property.properties t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.address, '') || ' ' || coalesce(t.city, '') || ' ' || coalesce(t.state, '') || ' ' || coalesce(t.zip, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'unit' = any(p_types))
     and property.rbac_allows('property.units.view', p_project)
     and property.rbac_allows('property.property.view', p_project) then
    return query
      select t.id, 'unit'::text, t.label, nullif(p.name, ''), h.hay
        from property.units t
        left join property.properties p on p.id = t.property_id and p.deleted_at is null
        cross join lateral (select coalesce(t.label, '') || ' ' || coalesce(t.occupant_name, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.label ilike v_prefix desc nulls last, t.label
       limit v_limit;
  end if;

  if (p_types is null or 'lease' = any(p_types))
     and property.rbac_allows('property.leases.view', p_project)
     and property.rbac_allows('property.leasing.view', p_project) then
    return query
      select t.id, 'lease'::text, t.name, nullif(t.status, ''), h.hay
        from property.leases t
        cross join lateral (select coalesce(t.name, '') || ' ' || coalesce(t.unit, '') || ' ' || coalesce(t.tenant_name, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'work_order' = any(p_types))
     and property.rbac_allows('property.work_orders.view', p_project)
     and property.rbac_allows('property.maintenance.view', p_project) then
    return query
      select t.id, 'work_order'::text, t.name, nullif(t.property_label, ''), h.hay
        from property.work_orders t
        cross join lateral (select
          coalesce(t.name, '') || ' ' || coalesce(t.property_label, '') || ' ' || coalesce(t.tenant_name, '') || ' '
          || coalesce(t.vendor_name, '') || ' ' || coalesce(t.category, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;

  if (p_types is null or 'bill' = any(p_types))
     and property.rbac_allows('property.bills_payables.view', p_project)
     and property.rbac_allows('property.accounting.view', p_project) then
    return query
      select t.id, 'bill'::text, t.name, nullif(t.vendor_name, ''), h.hay
        from property.bills t
        cross join lateral (select coalesce(t.name, '') || ' ' || coalesce(t.vendor_name, '') || ' ' || coalesce(t.reference, '') as hay) h
       where t.project_id = p_project and t.deleted_at is null and h.hay ilike v_like
       order by t.name ilike v_prefix desc nulls last, t.name
       limit v_limit;
  end if;
end;
$$;
revoke all on function property.search_records(uuid, text, text[], integer) from public, anon;
grant execute on function property.search_records(uuid, text, text[], integer) to authenticated, service_role;

-- @down
drop function if exists property.search_records(uuid, text, text[], integer);
drop index if exists property.bills_search_trgm;
drop index if exists property.work_orders_search_trgm;
drop index if exists property.leases_search_trgm;
drop index if exists property.units_search_trgm;
drop index if exists property.properties_search_trgm;
drop index if exists property.vendors_search_trgm;
drop index if exists property.owners_search_trgm;
drop index if exists property.applications_search_trgm;
drop index if exists property.prospects_search_trgm;
drop index if exists property.tenants_search_trgm;
-- pg_trgm stays: it predates this migration and other schemas on the shared project may use it.
