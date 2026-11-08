// Runbook per scheduled job (CORE-10): what it writes, whether a re-run is safe, how it catches up, and the usual failure and fix. Shown in the Scheduled Jobs dialog and mirrored in docs/scheduled-jobs-runbook.md.

export const RUNBOOK = {
  billing: {
    writes: "Rent (rent:, rent-adj:), voucher (hap:), recurring charge (rc:, rc-adj:) and concession (conc:) entries; rent account status",
    rerun: "Yes — every posting has its own key",
    catchUp: "Up to 3 months back, never before the billing start date",
    fix: "“No Accounts Receivable account” → Chart of Accounts → Restore defaults. A lease without rent steps → open and save the lease.",
  },
  "late-fees": {
    writes: "Late fee entries (late:) and one late-notice email",
    rerun: "Yes — fees accrue toward the policy target",
    catchUp: "Missed days are caught up to the cumulative target",
    fix: "Notice email fails → check GEIGER_EMAIL_API_KEY; the fee still posts.",
  },
  "management-fees": {
    writes: "One management fee per property per month (mgmt:<property>:<month>)",
    rerun: "Yes",
    catchUp: "Previous month only — use Run as of… with a date in the month after an older one",
    fix: "No collected rent → skipped, not an error.",
  },
  "deposit-interest": {
    writes: "Deposit interest accruals (depint:) and January payouts (depint-pay:)",
    rerun: "Yes",
    catchUp: "Previous month only — use Run as of… for older months",
    fix: "Interest rate 0 → skipped.",
  },
  autopay: {
    writes: "A Stripe charge and an online payment per plan",
    rerun: "Yes — one charge per plan per month, with Stripe idempotency",
    catchUp: "Current month only",
    fix: "Stripe not configured → every plan is skipped with an error. A declined card counts toward the plan's failures and pauses it after repeated declines.",
  },
  "preventive-work-orders": {
    writes: "Work orders for due preventive schedules",
    rerun: "Yes — one work order per schedule, due date and unit",
    catchUp: "Advances each schedule's next due date (no flood of missed visits)",
    fix: "—",
  },
  scheduled_reports: {
    writes: "Report runs (CSV and HTML archive) and the report email",
    rerun: "Yes — one run per schedule per period",
    catchUp: "One run per period",
    fix: "Email key missing → the run is saved as not configured.",
  },
  "resident-statements": {
    writes: "Statement emails and print-batch rows (logged in notification sends) and one print-batch team alert a month; nothing posts",
    rerun: "Yes — one statement per lease, month and address",
    catchUp: "Any day from the configured send day to the month's end",
    fix: "Turned off or before the send day → skipped. Email key missing → not configured; print the statements instead.",
  },
  "lease-reminders": {
    writes: "Resident reminder and renewal-window team emails (logged in notification sends)",
    rerun: "Yes — each reminder sends once",
    catchUp: "Same day only",
    fix: "Opt-outs and missing email addresses count as skipped.",
  },
  "rent-reminders": {
    writes: "Rent reminder emails (logged in notification sends)",
    rerun: "Yes — each reminder sends once",
    catchUp: "Same day only",
    fix: "Opt-outs and missing email addresses count as skipped.",
  },
  "expiring-documents": {
    writes: "Expiry reminders and the team digest (logged in notification sends)",
    rerun: "Yes — each reminder sends once",
    catchUp: "Same day only",
    fix: "Opt-outs and missing email addresses count as skipped.",
  },
  "scheduled-announcements": {
    writes: "Announcement deliveries",
    rerun: "Yes — one delivery per announcement and recipient",
    catchUp: "Sends every overdue scheduled announcement",
    fix: "—",
  },
  automations: {
    writes: "Workflow runs",
    rerun: "Yes — one run per workflow and event",
    catchUp: "Resumes waiting steps and fires due timed triggers",
    fix: "A step error marks the run failed and raises a review item.",
  },
  signals: {
    writes: "Signals (rule findings)",
    rerun: "Yes — one signal per detector and record",
    catchUp: "Recomputes the current state",
    fix: "A detector error raises a review item; the other detectors still run.",
  },
  briefings: {
    writes: "Each member's daily briefing, in-app and by email",
    rerun: "Yes — one briefing per member per day",
    catchUp: "Sends today's briefing once the send time has passed",
    fix: "Email key missing → in-app only.",
  },
  impact: {
    writes: "Daily impact rollups per workflow",
    rerun: "Yes — one rollup per workflow per day",
    catchUp: "Rebuilds recent days",
    fix: "—",
  },
  "orchestration-housekeeping": {
    writes: "Wakes snoozed review items, resumes stalled workflow runs, and soft-deletes old skipped runs, resolved signals and empty job runs",
    rerun: "Yes",
    catchUp: "Each run covers everything that is due",
    fix: "—",
  },
  "storage-migrate": {
    writes: "Copies of pre-private-storage files in the project's private bucket, and each record's bucket and path (the old link stays)",
    rerun: "Yes — records that already point at a copy are skipped",
    catchUp: "Run now only; each run covers every file still to copy",
    fix: "A missing original is listed and skipped. Removing the old public copies is a separate operator step, 14 days after the first copy (docs/scheduled-jobs-runbook.md).",
  },
};

export const runbookOf = (key) => RUNBOOK[key] || null;
