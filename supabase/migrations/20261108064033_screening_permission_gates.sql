-- Screening permission gates (RISK-03)
--
-- Client writes to an application's decision or screening fields need the RISK-03 keys, on top of 01d's member RLS:
--   property.screening.decide: the decision text, a move into Approved / Conditionally approved / Denied, and the decision
--     record in metadata (decidedOn, decidedBy, decisionNotes, decisionConditions, adverseAction);
--   property.screening.order: a move into Screening, the score, and the screening record in metadata (screening,
--     screeningRequestedAt, screeningConsent, screeningConsentOn, screeningVendor, screeningReference).
-- Client writes = current_user anon/authenticated (as guard_server_columns): the service role, migrations and definer RPCs pass.
-- The screening_criteria setting now needs property.screening.criteria (it was any member's).
-- Owns: guard_application_screening() and its trigger. Redefines and now owns settings_write_permission (PLAT-01e's body,
--   screening_criteria line changed); @down restores PLAT-01e's body.

-- @up
set local lock_timeout = '20s';

-- BEFORE INSERT OR UPDATE on applications: a client recording a decision needs screening.decide, recording screening screening.order.
create or replace function property.guard_application_screening()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_old jsonb := case when tg_op = 'UPDATE' then coalesce(old.metadata, '{}'::jsonb) else '{}'::jsonb end;
  v_old_status text := case when tg_op = 'UPDATE' then old.status end;
  v_key text;
  v_decide boolean;
  v_order boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  -- Blank and 'Pending' both mean "no decision"; json null and "" both mean "not recorded".
  v_decide := coalesce(nullif(new.decision, ''), 'Pending')
                is distinct from coalesce(nullif(case when tg_op = 'UPDATE' then old.decision end, ''), 'Pending')
              or (new.status in ('Approved', 'Conditionally approved', 'Denied') and new.status is distinct from v_old_status);
  foreach v_key in array array['decidedOn', 'decidedBy', 'decisionNotes', 'decisionConditions', 'adverseAction'] loop
    v_decide := v_decide
      or nullif(nullif(v_new -> v_key, 'null'::jsonb), '""'::jsonb) is distinct from nullif(nullif(v_old -> v_key, 'null'::jsonb), '""'::jsonb);
  end loop;
  v_order := coalesce(new.score, 0) is distinct from coalesce(case when tg_op = 'UPDATE' then old.score end, 0)
             or (new.status = 'Screening' and new.status is distinct from v_old_status);
  foreach v_key in array array['screening', 'screeningRequestedAt', 'screeningConsent', 'screeningConsentOn', 'screeningVendor', 'screeningReference'] loop
    v_order := v_order
      or nullif(nullif(v_new -> v_key, 'null'::jsonb), '""'::jsonb) is distinct from nullif(nullif(v_old -> v_key, 'null'::jsonb), '""'::jsonb);
  end loop;
  if v_decide and (new.project_id is null or not property.rbac_allows('property.screening.decide', new.project_id)) then
    raise exception 'Your role can''t record or change application decisions.' using errcode = '42501';
  end if;
  if v_order and (new.project_id is null or not property.rbac_allows('property.screening.order', new.project_id)) then
    raise exception 'Your role can''t order or record screening.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.guard_application_screening() from public, anon;

create or replace trigger applications_screening_gate
before insert or update on property.applications
for each row execute function property.guard_application_screening();

-- The permission a settings key needs to write (null: any member; PLAT-01e's body, screening_criteria → screening.criteria); keys not listed need settings.manage.
create or replace function property.settings_write_permission(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_key = 'roles' then 'property.role.manage'
    when p_key = 'integrations' then 'property.integration.manage'
    when p_key in ('automation_guardrails', 'automation_value', 'intake_rules', 'signal_settings') then 'property.automation.manage'
    when p_key = 'accounting_export' then 'property.accounting.post'
    when p_key = 'screening_criteria' then 'property.screening.criteria'
    when p_key = 'onboarding' then null
    when auth.uid() is not null and p_key = 'report_favorites:' || auth.uid()::text then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;

-- @down
set local lock_timeout = '20s';

drop trigger if exists applications_screening_gate on property.applications;
drop function if exists property.guard_application_screening();

create or replace function property.settings_write_permission(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_key = 'roles' then 'property.role.manage'
    when p_key = 'integrations' then 'property.integration.manage'
    when p_key in ('automation_guardrails', 'automation_value', 'intake_rules', 'signal_settings') then 'property.automation.manage'
    when p_key = 'accounting_export' then 'property.accounting.post'
    when p_key in ('onboarding', 'screening_criteria') then null
    when auth.uid() is not null and p_key = 'report_favorites:' || auth.uid()::text then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;
