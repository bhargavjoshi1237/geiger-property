-- Screening criteria gate (RISK-04)
--
-- Screening criteria live in the policy cascade: company keys in the fees_policies setting (the old screening_criteria setting
-- is read as their fallback) and property overrides in properties.metadata.policyOverrides. A client changing any of them
-- needs property.screening.criteria; every other key in those rows keeps its own rules (settings.manage, project member).
-- Owns: screening_criteria_keys(), guard_screening_criteria() and their two triggers. No table or data changes.
-- Client writes = current_user anon/authenticated (as guard_soft_delete): the service role, migrations and definer RPCs pass.

-- @up
set local lock_timeout = '20s';

-- The keys the gate watches; lib/screening/criteria_policy.test.js keeps this list equal to SCREENING_GATED_KEYS.
create or replace function property.screening_criteria_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'allowCosigner', 'allowGuarantorToQualify', 'conditionalOptions', 'countCoApplicantIncome', 'criminalLookbackYears',
    'criminalPolicy', 'criteriaNotes', 'evictionJudgmentsOnly', 'evictionLookbackYears', 'guarantorIncomeMultiple',
    'incomeMultiple', 'minCreditScore', 'noScorePolicy', 'publishedCriteriaText', 'requireIdVerification',
    'requireIncomeVerification', 'screeningPackage', 'screeningPayer', 'voucherIncomeBasis'
  ]::text[];
$$;
revoke all on function property.screening_criteria_keys() from public, anon;
grant execute on function property.screening_criteria_keys() to authenticated, service_role;

-- BEFORE INSERT/UPDATE: a client write that changes a screening key (or renames a criteria row) needs property.screening.criteria.
create or replace function property.guard_screening_criteria()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed boolean := false;
  v_key text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_table_name = 'settings' then
    if new.key not in ('fees_policies', 'screening_criteria')
       and (tg_op = 'INSERT' or old.key not in ('fees_policies', 'screening_criteria')) then
      return new;
    end if;
    v_changed := tg_op = 'UPDATE' and old.key is distinct from new.key;
    v_old := case when tg_op = 'UPDATE' then old.value end;
    v_new := new.value;
  else
    v_old := case when tg_op = 'UPDATE' then old.metadata -> 'policyOverrides' end;
    v_new := new.metadata -> 'policyOverrides';
  end if;
  if not v_changed then
    foreach v_key in array property.screening_criteria_keys() loop
      if (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changed := true;
        exit;
      end if;
    end loop;
  end if;
  if v_changed and (new.project_id is null or not property.rbac_allows('property.screening.criteria', new.project_id)) then
    raise exception 'Your role can''t change screening criteria.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.guard_screening_criteria() from public, anon;

create or replace trigger settings_guard_screening_criteria
before insert or update of key, value on property.settings
for each row execute function property.guard_screening_criteria();

create or replace trigger properties_guard_screening_criteria
before insert or update of metadata on property.properties
for each row execute function property.guard_screening_criteria();

-- @down
drop trigger if exists properties_guard_screening_criteria on property.properties;
drop trigger if exists settings_guard_screening_criteria on property.settings;
drop function if exists property.guard_screening_criteria();
drop function if exists property.screening_criteria_keys();
