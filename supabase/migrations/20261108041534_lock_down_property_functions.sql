-- Lock down property functions (PLAT-01c): no anon or PUBLIC execute on any property function, permission checks inside the ledger RPCs, an immutable ledger.
-- Owns property.ledger_post, ledger_void, ledger_ensure_default_chart (security definer, search_path '', rbac check first), merge_meta, chat_toggle_reaction,
--   chat_mark_reminded, and the new property.is_trusted_session(), ledger_lines_guard() and ledger_entries_guard() with their triggers.
-- Bodies carry over from the live definitions: ledger_void from CORE-08 (20261107235504), the chart from HOUS-01 (20261108034608, adds 1220 and 4055).
-- Trusted session = a service_role JWT or a direct postgres connection (migrations, seeds); PostgREST always connects as authenticator, so it never is.
-- emit_record_event runs only from record_event_trigger (definer) and the service role; trigger functions need no grants (Postgres doesn't check them on fire).
-- Postgres's global default gives PUBLIC execute on new functions and a per-schema revoke can't remove it, so lib/function_lockdown.test.js makes
--   every later migration revoke its own functions explicitly.

-- @up

-- Service role or a direct database session (no JWT, connected as postgres): the server, migrations and seeds.
create or replace function property.is_trusted_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (auth.role() is null and session_user in ('postgres', 'supabase_admin'));
$$;

-- Balanced post; a signed-in caller needs property.accounting.post on the entry's project and posts as themselves.
create or replace function property.ledger_post(p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_entry->>'id', '')::uuid, gen_random_uuid());
  v_project uuid := nullif(p_entry->>'project_id', '')::uuid;
  v_key text := nullif(p_entry->>'idempotency_key', '');
  v_date date := coalesce(nullif(p_entry->>'entry_date', '')::date, current_date);
  v_trusted boolean := property.is_trusted_session();
  v_actor uuid;
  v_existing uuid;
  v_line jsonb;
  v_d numeric;
  v_c numeric;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count integer := 0;
begin
  if not v_trusted and (v_project is null or not property.rbac_allows('property.accounting.post', v_project)) then
    raise exception 'You don''t have permission to post to the ledger.' using errcode = '42501';
  end if;
  v_actor := case when v_trusted then nullif(p_entry->>'created_by', '')::uuid else auth.uid() end;

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
    -- Definer bypasses RLS, so the account must be this project's own.
    if (v_d > 0 or v_c > 0) and not exists (
      select 1 from property.gl_accounts a
      where a.id = (v_line->>'gl_account_id')::uuid and a.project_id is not distinct from v_project
    ) then
      raise exception 'ledger_post: GL account % is not in this project', v_line->>'gl_account_id';
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
    coalesce(p_entry->'metadata', '{}'::jsonb), v_actor
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
    v_actor
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

-- Posts the reversal; a signed-in caller needs property.accounting.void on the entry's project (checked before the row lock).
create or replace function property.ledger_void(p_entry_id uuid, p_date date default null, p_memo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry property.ledger_entries;
  v_project uuid;
  v_new uuid := gen_random_uuid();
  v_date date;
  v_flag text;
begin
  select e.project_id into v_project from property.ledger_entries e where e.id = p_entry_id;
  if not property.is_trusted_session()
     and (v_project is null or not property.rbac_allows('property.accounting.void', v_project)) then
    raise exception 'You don''t have permission to void ledger entries.' using errcode = '42501';
  end if;

  select * into v_entry from property.ledger_entries
  where id = p_entry_id and deleted_at is null
  for update;
  if not found then raise exception 'ledger_void: entry % not found', p_entry_id; end if;
  if v_entry.status = 'void' then raise exception 'ledger_void: entry is already void'; end if;
  if v_entry.reversal_of is not null then raise exception 'ledger_void: a reversal cannot be voided'; end if;
  v_date := greatest(coalesce(p_date, current_date), v_entry.entry_date);

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, reversal_of, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_new, v_entry.project_id, v_date,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(v_entry.memo, v_entry.source_type)),
    v_entry.source_type, v_entry.source_id, 'posted', v_entry.id, v_entry.total,
    v_entry.property_id, v_entry.unit_id, v_entry.lease_id, v_entry.tenant_id, v_entry.owner_id,
    v_entry.vendor_id,
    jsonb_build_object('voidOf', v_entry.id)
      || case when v_entry.metadata ? 'ownerExplicit' then jsonb_build_object('ownerExplicit', v_entry.metadata->'ownerExplicit') else '{}'::jsonb end,
    v_entry.created_by
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    l.project_id, v_new, v_date, l.line_no, l.gl_account_id, l.credit, l.debit,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(l.memo, '')),
    l.property_id, l.unit_id, l.lease_id, l.tenant_id, l.owner_id, l.vendor_id, l.bank_account_id, l.job_id,
    coalesce(l.applies_to_entry_id, v_entry.id), coalesce(l.metadata, '{}'::jsonb), l.created_by
  from property.ledger_lines l
  where l.entry_id = v_entry.id and l.deleted_at is null;

  -- ledger_entries_guard lets the posted → void flip through only while this flag is on.
  v_flag := current_setting('property.ledger_void', true);
  perform set_config('property.ledger_void', 'on', true);
  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;
  perform set_config('property.ledger_void', coalesce(v_flag, ''), true);

  return v_new;
end;
$$;

-- Seeds the default chart; a signed-in caller needs property.accounting.post on the project.
create or replace function property.ledger_ensure_default_chart(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_id uuid;
  r record;
begin
  if not property.is_trusted_session()
     and (p_project_id is null or not property.rbac_allows('property.accounting.post', p_project_id)) then
    raise exception 'You don''t have permission to set up the chart of accounts.' using errcode = '42501';
  end if;

  for r in
    select * from (values
      ('operating_cash', '1000', 'Operating Cash', 'Asset', 'cash', false, null::text),
      ('trust_cash', '1010', 'Trust Cash', 'Asset', 'cash', true, null),
      ('deposit_cash', '1020', 'Security Deposit Trust Cash', 'Asset', 'cash', true, null),
      ('undeposited_funds', '1050', 'Undeposited Funds', 'Asset', 'cash', true, null),
      ('accounts_receivable', '1200', 'Accounts Receivable', 'Asset', 'receivable', false, null),
      ('deferred_receivable', '1210', 'Deferred Receivable', 'Asset', 'deferred_receivable', false, null),
      ('subsidy_receivable', '1220', 'Housing Assistance Receivable', 'Asset', 'subsidy_receivable', false, null),
      ('capital_improvements', '1500', 'Capital Improvements', 'Asset', 'fixed_asset', false, null),
      ('accounts_payable', '2000', 'Accounts Payable', 'Liability', 'payable', false, null),
      ('security_deposits', '2100', 'Security Deposits Held', 'Liability', 'deposits', true, null),
      ('deposit_interest_payable', '2110', 'Deposit Interest Payable', 'Liability', 'deposits', true, 'security_deposits'),
      ('other_deposits', '2120', 'Other Deposits Held', 'Liability', 'deposits', true, null),
      ('prepaid_rent', '2200', 'Prepaid Rent & Tenant Credits', 'Liability', 'prepaid', false, null),
      ('owner_equity', '3000', 'Owner Equity', 'Equity', 'equity', false, null),
      ('owner_contributions', '3100', 'Owner Contributions', 'Equity', 'contribution', false, 'owner_equity'),
      ('owner_distributions', '3200', 'Owner Distributions', 'Equity', 'distribution', false, 'owner_equity'),
      ('rent_income', '4000', 'Rental Income', 'Income', 'income', false, null),
      ('late_fee_income', '4010', 'Late Fee Income', 'Income', 'income', false, null),
      ('application_fee_income', '4020', 'Application Fee Income', 'Income', 'income', false, null),
      ('utility_income', '4030', 'Utility Reimbursements', 'Income', 'income', false, null),
      ('cam_income', '4040', 'CAM Recoveries', 'Income', 'income', false, null),
      ('concessions', '4050', 'Concessions & Credits', 'Income', 'contra_income', false, null),
      ('hap_abatements', '4055', 'HAP Abatements', 'Income', 'contra_income', false, null),
      ('other_income', '4100', 'Other Income', 'Income', 'income', false, null),
      ('management_fee_income', '4500', 'Management Fee Income', 'Income', 'income', false, null),
      ('repairs_maintenance', '5000', 'Repairs & Maintenance', 'Expense', 'expense', false, null),
      ('utilities', '5100', 'Utilities', 'Expense', 'expense', false, null),
      ('insurance', '5200', 'Insurance', 'Expense', 'expense', false, null),
      ('property_taxes', '5300', 'Property Taxes', 'Expense', 'expense', false, null),
      ('management_fees', '5400', 'Management Fees', 'Expense', 'expense', false, null),
      ('payroll', '5500', 'Payroll', 'Expense', 'expense', false, null),
      ('deposit_interest', '5600', 'Deposit Interest Expense', 'Expense', 'expense', false, null),
      ('turnover', '5700', 'Turnover & Make-ready', 'Expense', 'expense', false, null),
      ('bad_debt', '5800', 'Bad Debt', 'Expense', 'expense', false, null)
    ) as t(system_key, number, name, account_type, subtype, is_trust, parent_key)
  loop
    if exists (
      select 1 from property.gl_accounts
      where system_key = r.system_key and project_id is not distinct from p_project_id and deleted_at is null
    ) then
      continue;
    end if;
    select id into v_id from property.gl_accounts
    where project_id is not distinct from p_project_id and deleted_at is null and system_key is null
      and number = r.number and account_type = r.account_type and (subtype is null or subtype = r.subtype)
    limit 1;
    if v_id is not null then
      update property.gl_accounts
      set system_key = r.system_key, is_system = true, is_trust = is_trust or r.is_trust,
          subtype = coalesce(subtype, r.subtype)
      where id = v_id;
    else
      insert into property.gl_accounts (project_id, name, number, account_type, subtype, is_trust, is_system, system_key, status)
      values (p_project_id, r.name, r.number, r.account_type, r.subtype, r.is_trust, true, r.system_key, 'Active');
      v_count := v_count + 1;
    end if;
  end loop;

  -- Hierarchy: point child system accounts at their parents.
  update property.gl_accounts c
  set parent_id = p.id
  from (values ('deposit_interest_payable', 'security_deposits'), ('owner_contributions', 'owner_equity'), ('owner_distributions', 'owner_equity')) as h(child, parent)
  join property.gl_accounts p on p.system_key = h.parent and p.project_id is not distinct from p_project_id and p.deleted_at is null
  where c.system_key = h.child and c.project_id is not distinct from p_project_id and c.deleted_at is null and c.parent_id is null;

  return v_count;
end;
$$;

-- Shallow-merges a metadata patch as the caller (RLS applies); ledger, grants, audit and secrets rows are never patched this way.
create or replace function property.merge_meta(p_table text, p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meta jsonb;
begin
  if p_table ~ '^ledger_' or p_table in ('role_grants', 'audit_log', 'integration_secrets') then
    raise exception 'merge_meta: % can''t be patched', p_table using errcode = '42501';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'property' and table_name = p_table and column_name = 'metadata'
  ) then
    raise exception 'merge_meta: unknown table %', p_table;
  end if;
  execute format(
    'update property.%I set metadata = coalesce(metadata, ''{}''::jsonb) || $1 where id = $2 and deleted_at is null returning metadata',
    p_table
  ) into v_meta using coalesce(p_patch, '{}'::jsonb), p_id;
  return v_meta;
end;
$$;

-- Toggles my reaction: only as myself, on a conversation I can see (private channels and DMs need a membership).
create or replace function property.chat_toggle_reaction(p_message uuid, p_reaction text, p_profile uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reactions jsonb;
  v_list jsonb;
  v_conversation uuid;
  v_project uuid;
  v_kind text;
  v_visibility text;
begin
  if p_profile is null or p_profile is distinct from auth.uid() then
    raise exception 'You can only react as yourself.' using errcode = '42501';
  end if;
  select c.id, c.project_id, c.kind, c.visibility into v_conversation, v_project, v_kind, v_visibility
    from property.chat_messages m
    join property.chat_conversations c on c.id = m.conversation_id
   where m.id = p_message and m.deleted_at is null and c.deleted_at is null;
  if not found then
    return null;
  end if;
  if not property.can_access_project(v_project)
     or ((v_kind = 'dm' or v_visibility = 'private') and not exists (
       select 1 from property.chat_members cm where cm.conversation_id = v_conversation and cm.profile_id = p_profile
     )) then
    raise exception 'You''re not a member of this conversation.' using errcode = '42501';
  end if;

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

-- Claims my reminder once: only as myself, for a call I'm a participant of in a project I can see.
create or replace function property.chat_mark_reminded(p_id uuid, p_profile uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project uuid;
  v_participants uuid[];
begin
  if p_profile is null or p_profile is distinct from auth.uid() then
    raise exception 'You can only claim your own reminder.' using errcode = '42501';
  end if;
  select s.project_id, s.participant_ids into v_project, v_participants
    from property.chat_scheduled_calls s where s.id = p_id;
  if not found then
    return false;
  end if;
  if not property.can_access_project(v_project) or not (p_profile = any(v_participants)) then
    raise exception 'You''re not on this call.' using errcode = '42501';
  end if;
  update property.chat_scheduled_calls
     set reminded_ids = array_append(reminded_ids, p_profile)
   where id = p_id and not (p_profile = any(reminded_ids));
  return found;
end;
$$;

-- Lines: only the reconciliation columns and metadata change after posting; nothing is deleted (trusted sessions excepted).
create or replace function property.ledger_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free text[] := array['cleared', 'cleared_on', 'reconciliation_id', 'updated_at', 'metadata'];
begin
  if property.is_trusted_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Ledger lines can''t be deleted; void the entry instead.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Posted ledger lines can''t be changed; void the entry instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Entries: only ledger_void's posted → void flip (status, voided_at, metadata) changes a posted entry; nothing is deleted (trusted sessions excepted).
create or replace function property.ledger_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free text[] := array['status', 'voided_at', 'metadata', 'updated_at'];
begin
  if property.is_trusted_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Ledger entries can''t be deleted; void the entry instead.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return new;
  end if;
  if coalesce(current_setting('property.ledger_void', true), '') <> 'on'
     or (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free)
     or (new.status is distinct from old.status and not (old.status = 'posted' and new.status = 'void')) then
    raise exception 'Posted ledger entries can''t be changed; void the entry instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('property.ledger_lines') is not null then
    drop trigger if exists ledger_lines_guard on property.ledger_lines;
    create trigger ledger_lines_guard before update or delete on property.ledger_lines
      for each row execute function property.ledger_lines_guard();
  end if;
  if to_regclass('property.ledger_entries') is not null then
    drop trigger if exists ledger_entries_guard on property.ledger_entries;
    create trigger ledger_entries_guard before update or delete on property.ledger_entries
      for each row execute function property.ledger_entries_guard();
  end if;
end $$;

-- Close every property function, then grant back only what each caller needs.
revoke execute on all functions in schema property from public, anon;
-- Intent only: Postgres keeps its global PUBLIC default for new functions, so each new function revokes itself (see header).
alter default privileges in schema property revoke execute on functions from public;

grant execute on function property.ledger_post(jsonb, jsonb) to authenticated, service_role;
grant execute on function property.ledger_void(uuid, date, text) to authenticated, service_role;
grant execute on function property.ledger_ensure_default_chart(uuid) to authenticated, service_role;
grant execute on function property.merge_meta(text, uuid, jsonb) to authenticated, service_role;
grant execute on function property.chat_toggle_reaction(uuid, text, uuid) to authenticated;
grant execute on function property.chat_mark_reminded(uuid, uuid) to authenticated;

do $$
begin
  if to_regprocedure('property.ledger_subledger(text, uuid, date)') is not null then
    grant execute on function property.ledger_subledger(text, uuid, date) to authenticated, service_role;
  end if;
  if to_regprocedure('property.lease_sync_current_rent(uuid, date)') is not null then
    grant execute on function property.lease_sync_current_rent(uuid, date) to authenticated, service_role;
  end if;
  -- Only the definer trigger (as owner) and the service role (lib/payments/posting.js) emit record events.
  if to_regprocedure('property.emit_record_event(uuid, text, text, uuid, jsonb)') is not null then
    revoke execute on function property.emit_record_event(uuid, text, text, uuid, jsonb) from authenticated;
    grant execute on function property.emit_record_event(uuid, text, text, uuid, jsonb) to service_role;
  end if;
end $$;

-- @down

do $$
begin
  if to_regclass('property.ledger_lines') is not null then
    drop trigger if exists ledger_lines_guard on property.ledger_lines;
  end if;
  if to_regclass('property.ledger_entries') is not null then
    drop trigger if exists ledger_entries_guard on property.ledger_entries;
  end if;
end $$;
drop function if exists property.ledger_lines_guard();
drop function if exists property.ledger_entries_guard();

-- Previous bodies, exactly as they were live before this migration.
CREATE OR REPLACE FUNCTION property.ledger_post(p_entry jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'property'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION property.ledger_void(p_entry_id uuid, p_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'property'
AS $function$
declare
  v_entry property.ledger_entries;
  v_new uuid := gen_random_uuid();
  v_date date;
begin
  select * into v_entry from property.ledger_entries
  where id = p_entry_id and deleted_at is null
  for update;
  if not found then raise exception 'ledger_void: entry % not found', p_entry_id; end if;
  if v_entry.status = 'void' then raise exception 'ledger_void: entry is already void'; end if;
  if v_entry.reversal_of is not null then raise exception 'ledger_void: a reversal cannot be voided'; end if;
  v_date := greatest(coalesce(p_date, current_date), v_entry.entry_date);

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, reversal_of, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_new, v_entry.project_id, v_date,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(v_entry.memo, v_entry.source_type)),
    v_entry.source_type, v_entry.source_id, 'posted', v_entry.id, v_entry.total,
    v_entry.property_id, v_entry.unit_id, v_entry.lease_id, v_entry.tenant_id, v_entry.owner_id,
    v_entry.vendor_id,
    jsonb_build_object('voidOf', v_entry.id)
      || case when v_entry.metadata ? 'ownerExplicit' then jsonb_build_object('ownerExplicit', v_entry.metadata->'ownerExplicit') else '{}'::jsonb end,
    v_entry.created_by
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    l.project_id, v_new, v_date, l.line_no, l.gl_account_id, l.credit, l.debit,
    coalesce(nullif(p_memo, ''), 'Void: ' || coalesce(l.memo, '')),
    l.property_id, l.unit_id, l.lease_id, l.tenant_id, l.owner_id, l.vendor_id, l.bank_account_id, l.job_id,
    coalesce(l.applies_to_entry_id, v_entry.id), coalesce(l.metadata, '{}'::jsonb), l.created_by
  from property.ledger_lines l
  where l.entry_id = v_entry.id and l.deleted_at is null;

  update property.ledger_entries
  set status = 'void', voided_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('voidEntryId', v_new)
  where id = v_entry.id;

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION property.ledger_ensure_default_chart(p_project_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'property'
AS $function$
declare
  v_count integer := 0;
  v_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('operating_cash', '1000', 'Operating Cash', 'Asset', 'cash', false, null::text),
      ('trust_cash', '1010', 'Trust Cash', 'Asset', 'cash', true, null),
      ('deposit_cash', '1020', 'Security Deposit Trust Cash', 'Asset', 'cash', true, null),
      ('undeposited_funds', '1050', 'Undeposited Funds', 'Asset', 'cash', true, null),
      ('accounts_receivable', '1200', 'Accounts Receivable', 'Asset', 'receivable', false, null),
      ('deferred_receivable', '1210', 'Deferred Receivable', 'Asset', 'deferred_receivable', false, null),
      ('subsidy_receivable', '1220', 'Housing Assistance Receivable', 'Asset', 'subsidy_receivable', false, null),
      ('capital_improvements', '1500', 'Capital Improvements', 'Asset', 'fixed_asset', false, null),
      ('accounts_payable', '2000', 'Accounts Payable', 'Liability', 'payable', false, null),
      ('security_deposits', '2100', 'Security Deposits Held', 'Liability', 'deposits', true, null),
      ('deposit_interest_payable', '2110', 'Deposit Interest Payable', 'Liability', 'deposits', true, 'security_deposits'),
      ('other_deposits', '2120', 'Other Deposits Held', 'Liability', 'deposits', true, null),
      ('prepaid_rent', '2200', 'Prepaid Rent & Tenant Credits', 'Liability', 'prepaid', false, null),
      ('owner_equity', '3000', 'Owner Equity', 'Equity', 'equity', false, null),
      ('owner_contributions', '3100', 'Owner Contributions', 'Equity', 'contribution', false, 'owner_equity'),
      ('owner_distributions', '3200', 'Owner Distributions', 'Equity', 'distribution', false, 'owner_equity'),
      ('rent_income', '4000', 'Rental Income', 'Income', 'income', false, null),
      ('late_fee_income', '4010', 'Late Fee Income', 'Income', 'income', false, null),
      ('application_fee_income', '4020', 'Application Fee Income', 'Income', 'income', false, null),
      ('utility_income', '4030', 'Utility Reimbursements', 'Income', 'income', false, null),
      ('cam_income', '4040', 'CAM Recoveries', 'Income', 'income', false, null),
      ('concessions', '4050', 'Concessions & Credits', 'Income', 'contra_income', false, null),
      ('hap_abatements', '4055', 'HAP Abatements', 'Income', 'contra_income', false, null),
      ('other_income', '4100', 'Other Income', 'Income', 'income', false, null),
      ('management_fee_income', '4500', 'Management Fee Income', 'Income', 'income', false, null),
      ('repairs_maintenance', '5000', 'Repairs & Maintenance', 'Expense', 'expense', false, null),
      ('utilities', '5100', 'Utilities', 'Expense', 'expense', false, null),
      ('insurance', '5200', 'Insurance', 'Expense', 'expense', false, null),
      ('property_taxes', '5300', 'Property Taxes', 'Expense', 'expense', false, null),
      ('management_fees', '5400', 'Management Fees', 'Expense', 'expense', false, null),
      ('payroll', '5500', 'Payroll', 'Expense', 'expense', false, null),
      ('deposit_interest', '5600', 'Deposit Interest Expense', 'Expense', 'expense', false, null),
      ('turnover', '5700', 'Turnover & Make-ready', 'Expense', 'expense', false, null),
      ('bad_debt', '5800', 'Bad Debt', 'Expense', 'expense', false, null)
    ) as t(system_key, number, name, account_type, subtype, is_trust, parent_key)
  loop
    if exists (
      select 1 from property.gl_accounts
      where system_key = r.system_key and project_id is not distinct from p_project_id and deleted_at is null
    ) then
      continue;
    end if;
    select id into v_id from property.gl_accounts
    where project_id is not distinct from p_project_id and deleted_at is null and system_key is null
      and number = r.number and account_type = r.account_type and (subtype is null or subtype = r.subtype)
    limit 1;
    if v_id is not null then
      update property.gl_accounts
      set system_key = r.system_key, is_system = true, is_trust = is_trust or r.is_trust,
          subtype = coalesce(subtype, r.subtype)
      where id = v_id;
    else
      insert into property.gl_accounts (project_id, name, number, account_type, subtype, is_trust, is_system, system_key, status)
      values (p_project_id, r.name, r.number, r.account_type, r.subtype, r.is_trust, true, r.system_key, 'Active');
      v_count := v_count + 1;
    end if;
  end loop;

  -- Hierarchy: point child system accounts at their parents.
  update property.gl_accounts c
  set parent_id = p.id
  from (values ('deposit_interest_payable', 'security_deposits'), ('owner_contributions', 'owner_equity'), ('owner_distributions', 'owner_equity')) as h(child, parent)
  join property.gl_accounts p on p.system_key = h.parent and p.project_id is not distinct from p_project_id and p.deleted_at is null
  where c.system_key = h.child and c.project_id is not distinct from p_project_id and c.deleted_at is null and c.parent_id is null;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION property.merge_meta(p_table text, p_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'property'
AS $function$
declare
  v_meta jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'property' and table_name = p_table and column_name = 'metadata'
  ) then
    raise exception 'merge_meta: unknown table %', p_table;
  end if;
  execute format(
    'update property.%I set metadata = coalesce(metadata, ''{}''::jsonb) || $1 where id = $2 and deleted_at is null returning metadata',
    p_table
  ) into v_meta using coalesce(p_patch, '{}'::jsonb), p_id;
  return v_meta;
end;
$function$;

CREATE OR REPLACE FUNCTION property.chat_toggle_reaction(p_message uuid, p_reaction text, p_profile uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'property'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION property.chat_mark_reminded(p_id uuid, p_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'property'
AS $function$
  with claimed as (
    update property.chat_scheduled_calls
       set reminded_ids = array_append(reminded_ids, p_profile)
     where id = p_id and not (p_profile = any(reminded_ids))
     returning 1
  )
  select exists (select 1 from claimed);
$function$;

drop function if exists property.is_trusted_session();

-- Previous grants: PUBLIC (and anon) execute where they had it. The default-privilege revoke added no entry, so it needs no undo.
do $$
declare
  f text;
begin
  foreach f in array array[
    'property.ledger_post(jsonb, jsonb)', 'property.ledger_void(uuid, date, text)', 'property.ledger_ensure_default_chart(uuid)',
    'property.ledger_subledger(text, uuid, date)', 'property.merge_meta(text, uuid, jsonb)',
    'property.chat_toggle_reaction(uuid, text, uuid)', 'property.chat_mark_reminded(uuid, uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on function %s to public, anon', f);
    end if;
  end loop;
  foreach f in array array[
    'property.touch_updated_at()', 'property.record_event_trigger()', 'property.ledger_check_balance()', 'property.audit_row()',
    'property.audit_log_reject_change()', 'property.enable_audit(text)', 'property.bill_review_sync()', 'property.chat_bump_activity()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on function %s to public', f);
    end if;
  end loop;
  if to_regprocedure('property.emit_record_event(uuid, text, text, uuid, jsonb)') is not null then
    grant execute on function property.emit_record_event(uuid, text, text, uuid, jsonb) to public, anon, authenticated;
  end if;
  revoke execute on function property.merge_meta(text, uuid, jsonb) from service_role;
end $$;
