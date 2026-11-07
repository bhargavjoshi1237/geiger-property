-- Automation run retries, re-runs and record lookups (PLAT-13 step 2 slice, ORCH-02)
--
-- property.automation_runs gains attempt / max_attempts / next_retry_at for
-- step retries with backoff and parent_run_id for re-runs. The record index
-- backs Run History's filter by record and the "Automation runs" section on
-- record editors. Run statuses stay free text: pending, running, waiting,
-- retrying, waiting_review, waiting_approval, completed, failed, skipped,
-- cancelled (the runner owns the vocabulary; see lib/automations/runner.js).

-- @up
alter table property.automation_runs add column if not exists attempt integer not null default 0;
alter table property.automation_runs add column if not exists max_attempts integer not null default 3;
alter table property.automation_runs add column if not exists next_retry_at timestamptz;
alter table property.automation_runs add column if not exists parent_run_id uuid;

create index if not exists automation_runs_record_idx
  on property.automation_runs (record_type, record_id, started_at desc)
  where deleted_at is null;

create index if not exists automation_runs_retry_idx
  on property.automation_runs (status, next_retry_at)
  where status = 'retrying';

-- @down
drop index if exists property.automation_runs_retry_idx;
drop index if exists property.automation_runs_record_idx;
alter table property.automation_runs drop column if exists parent_run_id;
alter table property.automation_runs drop column if exists next_retry_at;
alter table property.automation_runs drop column if exists max_attempts;
alter table property.automation_runs drop column if exists attempt;
