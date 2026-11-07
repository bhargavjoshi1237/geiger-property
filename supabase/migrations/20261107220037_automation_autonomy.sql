-- Automation autonomy levels (ORCH-05)
--
-- property.automations.autonomy is a queryable text column:
--   suggest      - never executes a side effect; raises a decision to run it
--   approve      - every gated side effect waits for an approval
--   approve_over - only charges at or above metadata.autonomyConfig.threshold wait
--   auto         - runs on its own (guardrails still apply)
-- metadata.autonomyConfig = { threshold, approverRole, appliesTo: [money|legal|message|record] }.
-- Existing workflows keep running as before (auto); the app defaults new and
-- playbook-installed workflows to "approve" for money and legal steps.
-- Project guardrails live in the settings key automation_guardrails.

-- @up
alter table property.automations add column if not exists autonomy text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automations_autonomy_check' and conrelid = 'property.automations'::regclass
  ) then
    alter table property.automations
      add constraint automations_autonomy_check check (autonomy in ('suggest', 'approve', 'approve_over', 'auto'));
  end if;
end $$;

-- @down
alter table property.automations drop constraint if exists automations_autonomy_check;
alter table property.automations drop column if exists autonomy;
