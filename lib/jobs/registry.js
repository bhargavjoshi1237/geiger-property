import { OPERATIONS_JOBS } from "./operations";
import { FINANCIAL_JOBS } from "./financial";
import { PAYMENTS_JOBS } from "./autopay";
import { scheduledReportsJob } from "./scheduled_reports";

// Every scheduled job, keyed for the cron route (/api/cron/<key>).
export const JOBS = [...FINANCIAL_JOBS, ...PAYMENTS_JOBS, ...OPERATIONS_JOBS, scheduledReportsJob];

export const getJob = (key) => JOBS.find((j) => j.key === key) || null;
