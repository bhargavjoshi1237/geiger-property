-- Opening Balance Equity account (INTL-04 fix)
--
-- The conversion's clearing account moves from 3900 "Conversion Clearing" (3900 is CORE-40's Retained Earnings) to
-- 3950 "Opening Balance Equity", system key opening_balance_equity, which CORE-46 reuses. Renumbers, renames and re-keys
-- every live conversion_clearing row (soft-deleted rows and other accounts untouched), marking each so @down reverts only those.
-- Skips a project that already has a live opening_balance_equity account (the unique system-key index).

-- @up
update property.gl_accounts a
set number = '3950',
    name = 'Opening Balance Equity',
    system_key = 'opening_balance_equity',
    metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('renamedFrom', jsonb_build_object('number', a.number, 'name', a.name, 'systemKey', a.system_key))
where a.system_key = 'conversion_clearing'
  and a.deleted_at is null
  and not exists (
    select 1 from property.gl_accounts o
    where o.system_key = 'opening_balance_equity' and o.deleted_at is null
      and coalesce(o.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(a.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- @down
update property.gl_accounts a
set number = a.metadata->'renamedFrom'->>'number',
    name = a.metadata->'renamedFrom'->>'name',
    system_key = a.metadata->'renamedFrom'->>'systemKey',
    metadata = a.metadata - 'renamedFrom'
where a.system_key = 'opening_balance_equity'
  and a.deleted_at is null
  and a.metadata->'renamedFrom'->>'systemKey' = 'conversion_clearing'
  and not exists (
    select 1 from property.gl_accounts o
    where o.system_key = 'conversion_clearing' and o.deleted_at is null
      and coalesce(o.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(a.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
