-- Ledger post: explicit line dimensions
--
-- Redefines property.ledger_post (owned by 20261015212744_ledger_core) so a line
-- that carries a dimension key — even null — keeps it instead of inheriting the
-- entry's; lines without the key still inherit. Lets one entry mix owner-trust
-- lines with the manager's own lines (management fees).

-- @up
create or replace function property.ledger_post(p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_id uuid := coalesce(nullif(p_entry->>'id', '')::uuid, gen_random_uuid());
  v_project uuid := nullif(p_entry->>'project_id', '')::uuid;
  v_key text := nullif(p_entry->>'idempotency_key', '');
  v_date date := coalesce(nullif(p_entry->>'entry_date', '')::date, current_date);
  v_existing uuid;
  v_line jsonb;
  v_d numeric;
  v_c numeric;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count integer := 0;
begin
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project
    limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'ledger_post: lines must be an array';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_d := round(coalesce(nullif(v_line->>'debit', '')::numeric, 0), 2);
    v_c := round(coalesce(nullif(v_line->>'credit', '')::numeric, 0), 2);
    if v_d < 0 or v_c < 0 then raise exception 'ledger_post: amounts must be positive'; end if;
    if v_d > 0 and v_c > 0 then raise exception 'ledger_post: a line is either a debit or a credit'; end if;
    if (v_d > 0 or v_c > 0) and nullif(v_line->>'gl_account_id', '') is null then
      raise exception 'ledger_post: every line needs a GL account';
    end if;
    v_debit := v_debit + v_d;
    v_credit := v_credit + v_c;
    if v_d > 0 or v_c > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count < 2 then raise exception 'ledger_post: an entry needs at least two lines'; end if;
  if v_debit <> v_credit then
    raise exception 'ledger_post: unbalanced entry (debits %, credits %)', v_debit, v_credit;
  end if;

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, idempotency_key, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_id, v_project, v_date, nullif(p_entry->>'memo', ''),
    coalesce(nullif(p_entry->>'source_type', ''), 'adjustment'),
    nullif(p_entry->>'source_id', '')::uuid, 'posted', v_key, v_debit,
    nullif(p_entry->>'property_id', '')::uuid, nullif(p_entry->>'unit_id', '')::uuid,
    nullif(p_entry->>'lease_id', '')::uuid, nullif(p_entry->>'tenant_id', '')::uuid,
    nullif(p_entry->>'owner_id', '')::uuid, nullif(p_entry->>'vendor_id', '')::uuid,
    coalesce(p_entry->'metadata', '{}'::jsonb), nullif(p_entry->>'created_by', '')::uuid
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    v_project, v_id, v_date, l.n::int, (l.line->>'gl_account_id')::uuid,
    round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2),
    round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2),
    coalesce(nullif(l.line->>'memo', ''), nullif(p_entry->>'memo', '')),
    (case when l.line ? 'property_id' then nullif(l.line->>'property_id', '') else nullif(p_entry->>'property_id', '') end)::uuid,
    (case when l.line ? 'unit_id' then nullif(l.line->>'unit_id', '') else nullif(p_entry->>'unit_id', '') end)::uuid,
    (case when l.line ? 'lease_id' then nullif(l.line->>'lease_id', '') else nullif(p_entry->>'lease_id', '') end)::uuid,
    (case when l.line ? 'tenant_id' then nullif(l.line->>'tenant_id', '') else nullif(p_entry->>'tenant_id', '') end)::uuid,
    (case when l.line ? 'owner_id' then nullif(l.line->>'owner_id', '') else nullif(p_entry->>'owner_id', '') end)::uuid,
    (case when l.line ? 'vendor_id' then nullif(l.line->>'vendor_id', '') else nullif(p_entry->>'vendor_id', '') end)::uuid,
    nullif(l.line->>'bank_account_id', '')::uuid,
    nullif(l.line->>'job_id', '')::uuid,
    nullif(l.line->>'applies_to_entry_id', '')::uuid,
    coalesce(l.line->'metadata', '{}'::jsonb),
    nullif(p_entry->>'created_by', '')::uuid
  from jsonb_array_elements(p_lines) with ordinality as l(line, n)
  where round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2) > 0
     or round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2) > 0;

  return v_id;
exception when unique_violation then
  -- A concurrent post with the same idempotency key won the race.
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;
  raise;
end;
$$;


grant execute on function property.ledger_post(jsonb, jsonb) to anon, authenticated, service_role;

-- @down
create or replace function property.ledger_post(p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_id uuid := coalesce(nullif(p_entry->>'id', '')::uuid, gen_random_uuid());
  v_project uuid := nullif(p_entry->>'project_id', '')::uuid;
  v_key text := nullif(p_entry->>'idempotency_key', '');
  v_date date := coalesce(nullif(p_entry->>'entry_date', '')::date, current_date);
  v_existing uuid;
  v_line jsonb;
  v_d numeric;
  v_c numeric;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count integer := 0;
begin
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project
    limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'ledger_post: lines must be an array';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_d := round(coalesce(nullif(v_line->>'debit', '')::numeric, 0), 2);
    v_c := round(coalesce(nullif(v_line->>'credit', '')::numeric, 0), 2);
    if v_d < 0 or v_c < 0 then raise exception 'ledger_post: amounts must be positive'; end if;
    if v_d > 0 and v_c > 0 then raise exception 'ledger_post: a line is either a debit or a credit'; end if;
    if (v_d > 0 or v_c > 0) and nullif(v_line->>'gl_account_id', '') is null then
      raise exception 'ledger_post: every line needs a GL account';
    end if;
    v_debit := v_debit + v_d;
    v_credit := v_credit + v_c;
    if v_d > 0 or v_c > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count < 2 then raise exception 'ledger_post: an entry needs at least two lines'; end if;
  if v_debit <> v_credit then
    raise exception 'ledger_post: unbalanced entry (debits %, credits %)', v_debit, v_credit;
  end if;

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, idempotency_key, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_id, v_project, v_date, nullif(p_entry->>'memo', ''),
    coalesce(nullif(p_entry->>'source_type', ''), 'adjustment'),
    nullif(p_entry->>'source_id', '')::uuid, 'posted', v_key, v_debit,
    nullif(p_entry->>'property_id', '')::uuid, nullif(p_entry->>'unit_id', '')::uuid,
    nullif(p_entry->>'lease_id', '')::uuid, nullif(p_entry->>'tenant_id', '')::uuid,
    nullif(p_entry->>'owner_id', '')::uuid, nullif(p_entry->>'vendor_id', '')::uuid,
    coalesce(p_entry->'metadata', '{}'::jsonb), nullif(p_entry->>'created_by', '')::uuid
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    v_project, v_id, v_date, l.n::int, (l.line->>'gl_account_id')::uuid,
    round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2),
    round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2),
    coalesce(nullif(l.line->>'memo', ''), nullif(p_entry->>'memo', '')),
    coalesce(nullif(l.line->>'property_id', ''), nullif(p_entry->>'property_id', ''))::uuid,
    coalesce(nullif(l.line->>'unit_id', ''), nullif(p_entry->>'unit_id', ''))::uuid,
    coalesce(nullif(l.line->>'lease_id', ''), nullif(p_entry->>'lease_id', ''))::uuid,
    coalesce(nullif(l.line->>'tenant_id', ''), nullif(p_entry->>'tenant_id', ''))::uuid,
    coalesce(nullif(l.line->>'owner_id', ''), nullif(p_entry->>'owner_id', ''))::uuid,
    coalesce(nullif(l.line->>'vendor_id', ''), nullif(p_entry->>'vendor_id', ''))::uuid,
    nullif(l.line->>'bank_account_id', '')::uuid,
    nullif(l.line->>'job_id', '')::uuid,
    nullif(l.line->>'applies_to_entry_id', '')::uuid,
    coalesce(l.line->'metadata', '{}'::jsonb),
    nullif(p_entry->>'created_by', '')::uuid
  from jsonb_array_elements(p_lines) with ordinality as l(line, n)
  where round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2) > 0
     or round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2) > 0;

  return v_id;
exception when unique_violation then
  -- A concurrent post with the same idempotency key won the race.
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;
  raise;
end;
$$;


grant execute on function property.ledger_post(jsonb, jsonb) to anon, authenticated, service_role;
