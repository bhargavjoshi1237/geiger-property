// Value model for the Impact page (ORCH-09, isomorphic, pure). Time saved is an ESTIMATE: completed steps × the
// minutes a person would have spent on each (Geiger defaults, editable in Settings → Automation Settings under the
// settings key `automation_value`). Outcomes use fixed attribution windows; every method is shown next to its number.

export const VALUE_KEY = "automation_value";

export const DEFAULT_MINUTES = {
  send_email: 4,
  notify: 2,
  create_work_order: 6,
  update_status: 1,
  post_charge: 5,
  assign: 2,
  create_task: 2,
  month_end_checks: 30,
  owner_digest: 10,
};

export const MINUTE_LABELS = {
  send_email: "Send a message",
  notify: "Notify the team",
  create_work_order: "Create a work order",
  update_status: "Update a status",
  post_charge: "Post a charge",
  assign: "Assign a vendor",
  create_task: "Create a task",
  month_end_checks: "Month-end readiness checks",
  owner_digest: "Owner digest (per run)",
};

export const VALUE_DEFAULTS = { minutes: DEFAULT_MINUTES };

// Days after a collections run in which a payment from that tenant counts as collected after the run.
export const ATTRIBUTION_DAYS = 14;
// Before/after windows: the 90 days before install against the period since.
export const BEFORE_DAYS = 90;

// impact_daily metric names.
export const STEP_PREFIX = "steps.";
export const stepMetric = (type) => `${STEP_PREFIX}${type}`;
export const METRICS = {
  runs: "runs",
  completed: "runs_completed",
  failed: "runs_failed",
  exceptionsRaised: "exceptions_raised",
  exceptionsResolved: "exceptions_resolved",
  collected: "collected_after_run",
  offersSent: "offers_sent",
  renewalsAccepted: "renewals_accepted",
};

// Steps that cost a person time (control steps like wait / branch / approval don't).
export const COUNTED_STEPS = Object.keys(DEFAULT_MINUTES);
export const COUNTED_STATUSES = ["ok", "warning"];

export function resolveMinutes(stored) {
  const m = stored?.minutes && typeof stored.minutes === "object" ? stored.minutes : {};
  return Object.fromEntries(
    COUNTED_STEPS.map((k) => {
      const v = Number(m[k]);
      return [k, Number.isFinite(v) && v >= 0 ? v : DEFAULT_MINUTES[k]];
    }),
  );
}

// Estimated minutes for impact rows ({ metric, value }) under a minutes table.
export function minutesFromRows(rows, minutes = DEFAULT_MINUTES) {
  let total = 0;
  for (const r of rows || []) {
    if (!String(r.metric || "").startsWith(STEP_PREFIX)) continue;
    total += (Number(r.value) || 0) * (Number(minutes[r.metric.slice(STEP_PREFIX.length)]) || 0);
  }
  return total;
}

export const hoursFromRows = (rows, minutes) => Math.round((minutesFromRows(rows, minutes) / 60) * 10) / 10;

// Sum one metric across impact rows.
export const sumMetric = (rows, metric) => (rows || []).reduce((s, r) => s + (r.metric === metric ? Number(r.value) || 0 : 0), 0);

export const METHODS = {
  hours:
    "Estimated: each completed step × your team's minutes for that task (Settings → Automation Settings). Waits, checks and approvals count as zero.",
  collected: `Payments credited to a tenant's ledger within ${ATTRIBUTION_DAYS} days after a collections run on that tenant. Each payment counts once, against the latest run before it.`,
  exceptions: "Review items raised by this workflow's runs (failures, guardrail holds, escalations) and how many were resolved.",
  success: "Completed runs ÷ (completed + failed) runs. Waiting and suggested runs aren't counted yet.",
  renewals: "Renewal offers marked sent, and renewals marked accepted, by the day they changed.",
  turnaround: "Median days from a maintenance request or work order being opened to being completed, for those opened in each window.",
  collectedMonthly: "Rent payments credited to tenant ledgers, averaged per 30 days in each window.",
  acceptance: "Renewals accepted ÷ renewal offers sent, for offers sent in each window.",
  beforeAfter: `The ${BEFORE_DAYS} days before the playbook was installed against the period since. There's no control group, so other changes in the same months move these numbers too.`,
  resolveTime: "Median hours from a review item being raised to being resolved.",
};
