import { monthEndChecksStep } from "./month_end_checks";
import { ownerDigestStep } from "./owner_digest";

// Playbook step handlers (server-only) for step types that only playbooks add (catalog `playbookOnly`).
// Each entry: { prepare?(admin, step, ctx) → { input, recipients?, amount? }, perform(admin, step, ctx, prepared) →
// { status, message, input?, output?, links? } }. ctx is the runner's step context (automation, run, projectId, record,
// recordType, recordLabel, refs, values, now, tz, guardrails, log, dryRun). Throw ReviewableError to raise a review item.
export const PLAYBOOK_STEPS = {
  month_end_checks: monthEndChecksStep,
  owner_digest: ownerDigestStep,
};
