// Lookups for the orchestration screens (review queue). Plain data — no JSX.

export const REVIEW_KIND_MAP = {
  exception: { label: "Exception", variant: "danger" },
  approval: { label: "Approval", variant: "warning" },
  decision: { label: "Decision", variant: "info" },
  intake: { label: "Intake", variant: "purple" },
  task: { label: "Task", variant: "neutral" },
};

export const REVIEW_KIND_TABS = [
  { value: "all", label: "All" },
  { value: "exception", label: "Exceptions" },
  { value: "approval", label: "Approvals" },
  { value: "decision", label: "Decisions" },
  { value: "task", label: "Tasks" },
  { value: "intake", label: "Intake" },
];

export const SEVERITY_MAP = {
  urgent: { label: "Urgent", variant: "danger" },
  soon: { label: "Soon", variant: "warning" },
  routine: { label: "Routine", variant: "neutral" },
};

export const REVIEW_STATUS_MAP = {
  open: { label: "Open", variant: "info" },
  snoozed: { label: "Snoozed", variant: "purple" },
  resolved: { label: "Resolved", variant: "success" },
  dismissed: { label: "Dismissed", variant: "outline" },
};

export const SOURCE_LABELS = {
  automation_run: "Workflow",
  job_run: "Scheduled job",
  bill: "Bill approval",
  signal: "Signal",
  intake: "Email intake",
  approval_request: "Approval",
  ai_proposal: "Suggestion",
};

export const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "snoozed", label: "Snoozed" },
  { value: "closed", label: "Resolved & dismissed" },
  { value: "all", label: "Every status" },
];

export const SEVERITY_FILTER_OPTIONS = [{ value: "all", label: "Any severity" }, ...Object.entries(SEVERITY_MAP).map(([value, m]) => ({ value, label: m.label }))];

export const SOURCE_FILTER_OPTIONS = [{ value: "all", label: "Any source" }, ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))];

export const SEVERITY_ORDER = { urgent: 0, soon: 1, routine: 2 };

export const HISTORY_LABELS = {
  raised: "Raised",
  reopened: "Reopened",
  resolved: "Resolved",
  dismissed: "Dismissed",
  snoozed: "Snoozed",
  reassigned: "Assigned",
  comment: "Note",
  retry: "Retried",
  adjusted_and_retried: "Changed and retried",
  approved: "Approved",
  rejected: "Rejected",
  ran_suggested: "Ran the suggestion",
  completed: "Cleared — the run completed",
  cleared: "Cleared",
};

export const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const timeAgo = (v) => {
  if (!v) return "—";
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Fired after any review action so the sidebar badge and open banners refresh.
export const REVIEW_CHANGED_EVENT = "geiger:review-items-changed";
