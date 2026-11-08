-- Report favorites settings (CORE-41)
--
-- The Report Library keeps each member's favorite reports in property.settings under report_favorites:<userId>. Under PLAT-01d an
-- unlisted key needs property.settings.manage to write, so a member couldn't star a report. This lets a signed-in member write their
-- own report_favorites key only; anyone else's stays with settings.manage.
-- Redefines and now owns property.settings_write_permission (from 20261108051647_rls_project_isolation): the same rules plus the
-- own-favorites line; stable rather than immutable, as it now reads auth.uid(). @down restores the previous body.

-- @up

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
    when p_key in ('onboarding', 'screening_criteria') then null
    when auth.uid() is not null and p_key = 'report_favorites:' || auth.uid()::text then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;

-- @down

create or replace function property.settings_write_permission(p_key text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_key = 'roles' then 'property.role.manage'
    when p_key = 'integrations' then 'property.integration.manage'
    when p_key in ('automation_guardrails', 'automation_value', 'intake_rules', 'signal_settings') then 'property.automation.manage'
    when p_key in ('onboarding', 'screening_criteria') then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;
