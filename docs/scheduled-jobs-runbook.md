# Scheduled jobs runbook

Geiger Property runs its billing, reminders and maintenance work as scheduled jobs (CORE-10). This page covers the launch cron plan, how runs, locks, alerts and the watchdog work, how to switch the crons on, and what to do when a job fails. The Scheduled Jobs dialog (Automations → Scheduled Jobs) shows the same per-job runbook.

**Status:** the schedule is written but **switched off**. `vercel.json` has no `crons` until launch; the plan lives in [`docs/vercel-crons.json`](./vercel-crons.json).

## How a run works

- **Registry.** Every job is listed in `lib/jobs/registry.js` with its key, label, cron schedule (UTC) and interval. The route is `/api/cron/<key>`.
- **One function per job.** Vercel Cron calls `GET /property/api/cron/<key>` with `Authorization: Bearer $CRON_SECRET`. Each job gets its own function budget (`maxDuration = 300`).
- **Rows per project.** A cron call writes one operator row in `property.job_runs` (no project, operator-only) and then runs the job once per project (`property.job_projects()`: live projects with Property data). Each project run writes its own row: `trigger_source = 'cron'`, its status, timestamps, counts and only that project's errors. The project's Scheduled Jobs dialog reads these rows.
- **Trigger sources.** `cron` (the schedule), `watchdog` (a retry by `run-due`) and `manual` (Run now, Run as of…).
- **Statuses.** `running`, `succeeded`, `partial` (some items failed), `failed`, `skipped` (paused project), `skipped_locked` (another run held the lock) and `abandoned` (the worker died part-way).
- **Overlap lock.** A `running` row is the lock: the unique index `job_runs_running_lock` allows one running row per job and project (and one operator row per job). A second start gets a unique violation and is logged as `skipped_locked`. A start first marks `running` rows older than 15 minutes as `abandoned`, because the function limit is 5 minutes.
- **Time budget.** A cron call stops starting new projects 30 seconds before the function limit. The operator row then says how many projects were left, and the watchdog runs them later.
- **Business date.** Jobs date their work by each project's company time zone (Settings → Company profile; default `America/New_York`). The financial jobs run after 10:00 UTC, which is local midnight in Hawaii, so every US project is already on the new day.
- **Pause switch.** `billing_settings.jobsPaused` (Scheduled Jobs → Pause scheduled jobs, needs Manage settings).
  - On schedule, every job skips a paused project. The skip is logged as `skipped` once a day per job.
  - By hand, every job skips it too, except signals, impact and housekeeping, which only derive or tidy data.
  - The demo project `ebcc7910-1a0e-4e91-8c3b-752f3c4292d3` stays paused.
- **As-of runs.** "Run as of…" in the dialog (Manage settings) runs `billing`, `late-fees`, `management-fees` or `deposit-interest` as of noon on a past business date in the company time zone. The date can't be in the future or more than 12 months back. Every posting is keyed, so nothing already posted posts again.
- **Retention.** Housekeeping soft-deletes runs that did nothing (no rows, no errors) after 14 days.

## Launch cron plan (UTC, Vercel Pro)

Vercel Cron runs in UTC and does not retry a failed call; the `run-due` watchdog covers that. Vercel Hobby allows only once-a-day crons, so the four sub-daily jobs need **Pro**.

| Job | Cron (UTC) | Interval | Notes |
|---|---|---|---|
| `billing` | `5 10 * * *` | 1 day | Rent, recurring charges, concessions, voucher shares, holdovers |
| `late-fees` | `35 10 * * *` | 1 day | After billing |
| `signals` | `50 10 * * *` | 1 day | After billing and late fees, before the morning briefings |
| `management-fees` | `0 11 * * *` | 1 day | Posts the previous month once |
| `deposit-interest` | `15 11 * * *` | 1 day | Previous month |
| `preventive-work-orders` | `30 11 * * *` | 1 day | |
| `scheduled_reports` | `0 12 * * *` | 1 day | |
| `autopay` | `0 13 * * *` | 1 day | 05:00 PT / 08:00 ET, after billing |
| `lease-reminders` | `0 15 * * *` | 1 day | |
| `rent-reminders` | `30 15 * * *` | 1 day | |
| `expiring-documents` | `0 16 * * *` | 1 day | |
| `impact` | `30 2 * * *` | 1 day | Nightly rollup |
| `scheduled-announcements` | `*/15 * * * *` | 15 min | Needs Pro (was daily) |
| `automations` | `0 * * * *` | 1 hour | Needs Pro |
| `briefings` | `0 * * * *` | 1 hour | Needs Pro; each member's send time |
| `orchestration-housekeeping` | `15 * * * *` | 1 hour | Needs Pro |
| `run-due` (watchdog) | `0 20 * * *` | — | Retries, missed-run alerts, operator check |

`resident-statements` (CORE-12) joins the plan at `30 12 * * *` when it is built. Regenerate `docs/vercel-crons.json` from the registry whenever a job or schedule changes (see "Changing the plan").

## Switching the crons on at launch

1. **Plan.** Confirm the Vercel project that serves Geiger Property is on **Pro**. On Hobby, a deployment with the hourly and 15-minute crons is rejected.
2. **Database.** From the repo root, run `npm run db:status` and confirm `20261108053118_job_runs_running_lock` is `applied`.
3. **Secrets** (production environment):
   - `vercel env add CRON_SECRET production`, with a random value of at least 32 characters (`openssl rand -hex 32`). Vercel sends it as the Bearer token on every cron call.
   - `vercel env add JOBS_ALERT_EMAILS production` — comma-separated operator addresses for operator alerts.
   - Confirm these are set: `vercel env ls production` should list `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `GEIGER_EMAIL_API_KEY` (and `GEIGER_EMAIL_API_URL` if dash isn't at `https://geiger.studio`), and `NEXT_PUBLIC_APP_URL` for links in alert emails.
4. **Demo stays paused.** This query must return `true`:

   ```sql
   select value->>'jobsPaused' from property.settings
   where project_id = 'ebcc7910-1a0e-4e91-8c3b-752f3c4292d3' and key = 'billing_settings' and deleted_at is null;
   ```

5. **Copy the plan into `vercel.json`.** From the repo root:

   ```bash
   node -e "const f=require('fs');const v=JSON.parse(f.readFileSync('vercel.json','utf8'));v.crons=JSON.parse(f.readFileSync('docs/vercel-crons.json','utf8')).crons;f.writeFileSync('vercel.json',JSON.stringify(v,null,2)+'\n')"
   ```

   The paths include the `/property` basePath from `next.config.mjs` because Vercel Cron calls the deployment's own domain. If the basePath ever changes, regenerate the plan. Then run `npm test`: `lib/jobs/schedule.test.js` checks that `vercel.json`'s crons match the plan exactly.
6. **Deploy** to production through the usual release (commit, merge, deploy).
7. **Check the wiring right away:**
   - In Vercel → Project → Settings → Cron Jobs, 17 jobs should be listed.
   - Run one harmless job by hand. The response is `200` with `"status":"succeeded"` and one entry per project in `projects`:

     ```bash
     curl -s -H "Authorization: Bearer $CRON_SECRET" https://<production-domain>/property/api/cron/orchestration-housekeeping
     ```

   - Without the header, the route returns `401`.
8. **After the first day**, check that every job has a cron-triggered row per project (see "Useful queries"). The Scheduled Jobs dialog should show "Scheduled" runs with next run times, and no "No scheduled run in the last day" notice.
9. **Restore the held marketing copy** once the first day's runs check out. `grep -rn "claim:.*CORE-10" components/landing` finds the copy that waits on live crons:
   - "on a schedule" for the routine-work section in `landing_page.jsx`
   - scheduled rent posting and scheduled report sending in `product_explorer.jsx`
   - autopay charging on the due date in `product_explorer.jsx`
   - scheduled rent in `connected_journey.jsx`

   Drop the CORE-10 part of each `// claim:` tag. Leave the parts that wait on other items.

**To switch the crons off again,** remove the `crons` key from `vercel.json` and redeploy. To stop one project, use its pause switch.

## Alerts

- **Project alerts.** These fire when a scheduled run (`cron` or `watchdog`) for a project:
  - fails,
  - finishes `partial`,
  - is `skipped_locked` twice in a row, or
  - has had no scheduled success for more than 1.5 × its interval. The watchdog checks this daily.
- **What a project alert does:**
  1. An in-app notice through `@geiger/notify` (app `property`, category `jobs`) to the project's Owner, Admin and Manager members and its creator. It links to `/project/<id>/automations?jobs=open`.
  2. The `staff_alerts` email (template `property.message`, through geiger-dash) to the alert recipients in Settings → Notifications. It honors the project's notification switches.
  3. A `[jobs.alert]` line in the function logs.
- **Once a day.** A project gets at most one alert per job per business day. The claim is the `notification_sends` row `job-alert:<job>:<project>:<date>`; each email adds `…:<address>`.
- **Manual runs never alert.** The person who pressed Run now sees the result.
- **Operator alerts.** These are emails to `JOBS_ALERT_EMAILS`, at most one per job per UTC day, sent when:
  - a cross-project run fails outright (for example, it can't list projects, or every project failed),
  - the operator row is `skipped_locked` twice in a row, or
  - the watchdog finds a job whose own cron hasn't fired for 1.5 × its interval while the scheduler is otherwise live. This catches a missing `vercel.json` entry.
- **Review queue.** Failures still raise review items (ORCH-04) in the failing project's queue. Project-less failures are operator-only.

## Per-job runbook

| Job | Writes | Safe to re-run | Catch-up | Typical failure → fix |
|---|---|---|---|---|
| `billing` | `rent:`, `rent-adj:`, `hap:`, `rc:`, `rc-adj:`, `conc:` entries; `rent_accounts.status` | Yes | 3 months back, never before `billingStartsOn` | "No Accounts Receivable account" → Chart of Accounts → Restore defaults. A lease with no rent steps → open and save the lease (the CORE-01 backfill). |
| `late-fees` | `late:` entries; one late-notice email | Yes | Cumulative target | Notice email fails → check `GEIGER_EMAIL_API_KEY`; the fee posts anyway |
| `management-fees` | `mgmt:<propertyId>:<YYYY-MM>` (previous month) | Yes | Previous month only → Run as of… for older months | No collected cash → skipped, not an error |
| `deposit-interest` | `depint:` entries (`depint-pay:` each January) | Yes | Previous month only → Run as of… | Rate 0 → skipped |
| `autopay` | Stripe charge + `online_payments` row | Yes (one per plan per month, Stripe idempotency) | Current month only | Stripe not configured → every plan skipped with an error. A declined card counts toward the plan's failures; the plan pauses after repeated declines. |
| `preventive-work-orders` | `work_orders` | Yes (unique per schedule, due date and unit) | Advances `next_due` | — |
| `scheduled_reports` | `report_runs`, email | Yes | One per period | Email key missing → the run is saved as not configured |
| `lease-reminders` | Emails (`notification_sends`) | Yes | Same day only | Opt-outs and missing emails are counted as skipped |
| `rent-reminders` | Emails (`notification_sends`) | Yes | Same day only | Opt-outs and missing emails are counted as skipped |
| `expiring-documents` | Emails and the team digest (`notification_sends`) | Yes | Same day only | Opt-outs and missing emails are counted as skipped |
| `scheduled-announcements` | `announcement_deliveries` | Yes | Sends overdue scheduled items | — |
| `automations` | `automation_runs` | Yes | Resumes waiting steps | Step error → run marked failed, review item, alert |
| `signals` | `signals` | Yes | Recomputes the current state | A detector error raises a review item; the other detectors still run |
| `briefings` | `briefings`, in-app notice and email | Yes (one per member per day) | Today's, once the send time passes | Email key missing → in-app only |
| `impact` | `impact_daily` | Yes | Rebuilds recent days | — |
| `orchestration-housekeeping` | Wakes snoozed review items, resumes stalled workflow runs; soft-deletes old skipped runs, resolved signals and empty job runs | Yes | Everything due | — |

## Operating

- **Rerun one job for one project as an operator:**

  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" "https://<production-domain>/property/api/cron/billing?project=<project-id>"
  ```

  Staff can use Run now in the dialog instead.
- **Run the watchdog now:** `curl -s -H "Authorization: Bearer $CRON_SECRET" https://<production-domain>/property/api/cron/run-due`. It runs every job that is overdue in a project (more than its interval plus up to an hour) and sends the missed-run alerts.
- **A job looks stuck.** A `running` row older than 15 minutes is abandoned automatically on the next start. Two `skipped_locked` runs in a row raise an alert. Check the function logs for the run that never finished.
- **Older months.** Use Run as of… with a date in the month after the one you need. For example, to post September's management fee, run as of October 15.
- **Pause a project.** Use the dialog's switch. The skip is logged once a day per job, and the watchdog doesn't retry or alert for a paused project.

## Useful queries

```sql
-- Today's scheduled runs per job and project
select job_key, project_id, status, started_at, processed, created, skipped, error_count
from property.job_runs
where trigger_source = 'cron' and project_id is not null and started_at >= now() - interval '1 day' and deleted_at is null
order by job_key, project_id, started_at;

-- Operator rows: one per job per scheduled time
select job_key, status, started_at, metadata->>'projects' as projects, metadata->>'failed' as failed, errors
from property.job_runs
where project_id is null and started_at >= now() - interval '1 day' and deleted_at is null
order by started_at desc;

-- Latest status per project and job (the watchdog's view)
select * from property.job_run_status(null, now() - interval '3 days');

-- Alerts sent today
select dedupe_key, channel, recipient, status, created_at
from property.notification_sends
where dedupe_key like 'job-alert:%' and created_at >= current_date
order by created_at desc;
```

## Changing the plan

1. Edit the job's `schedule` (and `intervalMinutes` for anything not daily) in its module.
2. Regenerate `docs/vercel-crons.json` from the registry with `cronEntries(JOBS, "/property")` in `lib/jobs/schedule.js`, and copy it into `vercel.json` if the crons are live.
3. Add or update the job's entry in `lib/jobs/runbook.js` and in the table above. `npm test` fails while a job lacks either one.
