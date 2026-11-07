// Review reason catalogue (isomorphic, pure). Maps a reason_code to a plain-
// language title, a one-sentence explanation built from context, the fixes the
// review queue offers as buttons, and whether a plain retry can help. Runner,
// job, guardrail, signal and intake items all speak this vocabulary (ORCH-04).

export const FIXES = {
  open_record: { label: "Open record" },
  retry: { label: "Retry" },
  adjust_and_retry: { label: "Change and retry" },
  approve: { label: "Approve" },
  reject: { label: "Reject" },
  run_suggested: { label: "Run suggested" },
  open_case: { label: "Work through it" },
  link_person: { label: "Link to person" },
  open_guardrails: { label: "Open guardrails" },
  open_settings: { label: "Open settings" },
  resolve: { label: "Resolve" },
  dismiss: { label: "Dismiss" },
};

const who = (c, fallback = "The recipient") => c.recipient || c.recordLabel || fallback;
const wf = (c) => (c.workflow ? `"${c.workflow}"` : "the workflow");
const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const REASONS = {
  no_recipient_email: {
    title: "No email address on file",
    severity: "soon",
    retryable: false,
    explain: (c) => `${who(c)} has no email address, so ${wf(c)} couldn't send its message.`,
    fixes: ["open_record", "retry", "adjust_and_retry", "dismiss"],
  },
  no_recipient: {
    title: "No one to send to",
    severity: "soon",
    retryable: false,
    explain: (c) => `${wf(c)} couldn't find a ${c.recipientType || "recipient"} on ${c.recordLabel || "the record"}.`,
    fixes: ["open_record", "adjust_and_retry", "dismiss"],
  },
  template_missing: {
    title: "Message template missing",
    severity: "soon",
    retryable: false,
    explain: (c) => `The template ${wf(c)} uses was deleted or can't be read, so the message wasn't sent.`,
    fixes: ["adjust_and_retry", "dismiss"],
  },
  record_deleted: {
    title: "Record no longer exists",
    severity: "routine",
    retryable: false,
    explain: (c) => `${c.recordLabel || "The record"} was deleted after ${wf(c)} started, so the run stopped.`,
    fixes: ["dismiss"],
  },
  email_not_configured: {
    title: "Email isn't set up",
    severity: "soon",
    retryable: true,
    explain: (c) => `Email sending isn't configured for this workspace, so ${wf(c)} couldn't send its message.`,
    fixes: ["open_settings", "retry", "dismiss"],
  },
  provider_error: {
    title: "A provider failed",
    severity: "soon",
    retryable: true,
    explain: (c) => `A service ${wf(c)} depends on returned an error${c.detail ? ` (${c.detail})` : ""}. It was retried and still failed.`,
    fixes: ["retry", "dismiss"],
  },
  ledger_error: {
    title: "Couldn't post to the ledger",
    severity: "urgent",
    retryable: false,
    explain: (c) => `${wf(c)} tried to post ${c.amount ? usd(c.amount) : "a charge"} for ${c.recordLabel || "the record"}, but the ledger refused it${c.detail ? `: ${c.detail}` : ""}.`,
    fixes: ["open_record", "adjust_and_retry", "dismiss"],
  },
  guardrail_money_cap: {
    title: "Over the per-run charge limit",
    severity: "urgent",
    retryable: false,
    explain: (c) => `${wf(c)} wanted to post ${usd(c.amount)} for ${c.recordLabel || "a record"}, which is over the ${usd(c.cap)} per-run limit. Approve to post it anyway.`,
    fixes: ["approve", "reject", "open_guardrails"],
  },
  guardrail_daily_charges: {
    title: "Daily charge limit reached",
    severity: "urgent",
    retryable: false,
    explain: (c) => `Automations already posted ${c.count} charges today (limit ${c.cap}), so ${wf(c)} is waiting before posting ${usd(c.amount)} for ${c.recordLabel || "a record"}.`,
    fixes: ["approve", "reject", "open_guardrails"],
  },
  quiet_hours: {
    title: "Held for quiet hours",
    severity: "routine",
    retryable: false,
    explain: (c) => `${wf(c)} reached a message step inside quiet hours, so it will send at ${c.resumeLabel || "the next allowed time"}.`,
    fixes: ["dismiss"],
  },
  do_not_contact: {
    title: "Do not contact",
    severity: "routine",
    retryable: false,
    explain: (c) => `${who(c, "The recipient")} is marked do-not-contact, so ${wf(c)} skipped the message.`,
    fixes: ["open_record", "dismiss"],
  },
  approval_required: {
    title: "Needs approval",
    severity: "soon",
    retryable: false,
    explain: (c) => c.note || `${wf(c)} is set to ask first before it ${c.action || "acts"}${c.recordLabel ? ` for ${c.recordLabel}` : ""}.`,
    fixes: ["approve", "reject", "open_record"],
  },
  suggested_action: {
    title: "Suggested action",
    severity: "soon",
    retryable: false,
    explain: (c) => `${wf(c)} only suggests in this mode. It would ${c.action || "act"}${c.recordLabel ? ` for ${c.recordLabel}` : ""}.`,
    fixes: ["run_suggested", "dismiss", "open_record"],
  },
  task: {
    title: "Task",
    severity: "soon",
    retryable: false,
    explain: (c) => c.note || `${wf(c)} created a task${c.recordLabel ? ` for ${c.recordLabel}` : ""}.`,
    fixes: ["open_record", "resolve"],
  },
  escalation: {
    title: "Escalated by a workflow",
    severity: "urgent",
    retryable: false,
    explain: (c) => c.note || `${wf(c)} escalated ${c.recordLabel || "this record"} for a person to handle.`,
    fixes: ["open_case", "open_record", "resolve"],
  },
  readiness_blocker: {
    title: "Blocks the month-end close",
    severity: "soon",
    retryable: false,
    explain: (c) => c.note || "This needs attention before the period can close.",
    fixes: ["open_record", "resolve"],
  },
  job_failed: {
    title: "A scheduled job failed",
    severity: "urgent",
    retryable: true,
    explain: (c) => `The ${c.jobLabel || "scheduled"} job failed${c.detail ? `: ${c.detail}` : ""}.`,
    fixes: ["retry", "dismiss"],
  },
  automation_failing: {
    title: "Workflow failing repeatedly",
    severity: "urgent",
    retryable: false,
    explain: (c) => `${wf(c)} failed ${c.count || "several"} times for the same reason: ${c.detail || "see its runs"}.`,
    fixes: ["open_record", "dismiss"],
  },
  signal_decision: {
    title: "Decision needed",
    severity: "soon",
    retryable: false,
    explain: (c) => c.note || "A signal needs a decision.",
    fixes: ["open_case", "run_suggested", "dismiss"],
  },
  intake_confirm: {
    title: "Confirm intake",
    severity: "soon",
    retryable: false,
    explain: (c) => c.note || `${c.sender || "An email"} was turned into a draft. Confirm it to create the record.`,
    fixes: ["run_suggested", "open_record", "dismiss"],
  },
  intake_unknown_sender: {
    title: "Unknown sender",
    severity: "soon",
    retryable: false,
    explain: (c) => `${c.sender || "Someone"} emailed ${c.address || "an intake address"}, but no tenant, vendor or owner has that address.`,
    fixes: ["link_person", "dismiss"],
  },
  unexpected_error: {
    title: "Unexpected error",
    severity: "soon",
    retryable: true,
    explain: (c) => `${wf(c)} stopped on an unexpected error${c.stepLabel ? ` at "${c.stepLabel}"` : ""}. The details are below.`,
    fixes: ["retry", "dismiss"],
  },
};

export const reasonOf = (code) => REASONS[code] || REASONS.unexpected_error;

// Classify a raw runner / job error into a reason code.
export function reasonFromError(error) {
  if (error && typeof error === "object" && error.code && REASONS[error.code]) return error.code;
  const m = String(error?.message ?? error ?? "").toLowerCase();
  if (!m) return "unexpected_error";
  if (/no (email )?address on file|no email address/.test(m)) return "no_recipient_email";
  if (/no recipient/.test(m)) return "no_recipient";
  if (/template/.test(m) && /(not found|missing|deleted)/.test(m)) return "template_missing";
  if (/not_configured|not configured|isn't configured/.test(m)) return "email_not_configured";
  if (/(record|row).*(deleted|not found|no longer)/.test(m)) return "record_deleted";
  if (/ledger|unbalanced|gl account|accounts? receivable/.test(m)) return "ledger_error";
  if (/http \d|fetch failed|timeout|timed out|econn|enotfound|request_failed|provider|stripe/.test(m)) return "provider_error";
  return "unexpected_error";
}

// A throwable error carrying a reason code and the context its sentence needs.
export class ReviewableError extends Error {
  constructor(code, context = {}, message) {
    super(message || reasonOf(code).explain(context));
    this.code = code;
    this.context = context;
  }
}

// { code, title, text, fixes, retryable, severity } for a code + context.
export function describeReason(code, context = {}) {
  const r = reasonOf(code);
  return {
    code: REASONS[code] ? code : "unexpected_error",
    title: r.title,
    text: r.explain(context),
    fixes: r.fixes,
    retryable: r.retryable,
    severity: r.severity,
  };
}
