// Shared lookups for Automations (workflow definitions, runs, scheduled jobs).
// Plain data — no JSX. The trigger / step catalog lives in lib/automations/catalog.js.

export const formatDate = (v) =>
  v
    ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const formatDateTime = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

export const listOptions = (values) => values.map((v) => ({ value: v, label: v }));

export const AUTOMATION_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Active: { label: "Active", variant: "success" },
  Paused: { label: "Paused", variant: "warning" },
};

export const RUN_STATUS_MAP = {
  pending: { label: "Queued", variant: "neutral" },
  running: { label: "Running", variant: "info" },
  waiting: { label: "Waiting", variant: "purple" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export const STEP_LOG_STATUS_MAP = {
  ok: { label: "Done", variant: "success" },
  warning: { label: "Warning", variant: "warning" },
  error: { label: "Error", variant: "danger" },
  waiting: { label: "Waiting", variant: "purple" },
};

export const JOB_RUN_STATUS_MAP = {
  running: { label: "Running", variant: "info" },
  succeeded: { label: "Succeeded", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
};

export const PRIORITY_OPTIONS = listOptions(["Low", "Medium", "High", "Urgent"]);
