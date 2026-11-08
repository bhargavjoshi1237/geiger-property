import { OPERATIONS_JOBS } from "./operations";
import { FINANCIAL_JOBS } from "./financial";
import { billingJob } from "./billing";
import { PAYMENTS_JOBS } from "./autopay";
import { scheduledReportsJob } from "./scheduled_reports";
import { ORCHESTRATION_JOBS } from "./orchestration";

// Every scheduled job, keyed for the cron route (/api/cron/<key>); each cron runs on its own schedule (autopay bills its lease itself before collecting).
export const JOBS = [billingJob, ...FINANCIAL_JOBS, ...PAYMENTS_JOBS, ...OPERATIONS_JOBS, scheduledReportsJob, ...ORCHESTRATION_JOBS];

// Retired keys → the job that took them over, with a label so old job_runs stay readable (CORE-03 folded recurring-charges into billing).
export const RETIRED_JOBS = { "recurring-charges": { key: "billing", label: "Post recurring charges (now in Bill rent & charges)" } };

export const getJob = (key) => JOBS.find((j) => j.key === (RETIRED_JOBS[key]?.key || key)) || null;
