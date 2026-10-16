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
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
};

export const RUN_STATUS_MAP = {
  pending: { label: "Queued", variant: "neutral", dotClass: "bg-neutral-500" },
  running: { label: "Running", variant: "info", dotClass: "bg-sky-400" },
  waiting: { label: "Waiting", variant: "purple", dotClass: "bg-violet-300" },
  completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
  cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-neutral-600" },
};

export const STEP_LOG_STATUS_MAP = {
  ok: { label: "Done", variant: "success", dotClass: "bg-emerald-400" },
  warning: { label: "Warning", variant: "warning", dotClass: "bg-amber-400" },
  error: { label: "Error", variant: "danger", dotClass: "bg-red-400" },
  waiting: { label: "Waiting", variant: "purple", dotClass: "bg-violet-300" },
};

export const JOB_RUN_STATUS_MAP = {
  running: { label: "Running", variant: "info", dotClass: "bg-sky-400" },
  succeeded: { label: "Succeeded", variant: "success", dotClass: "bg-emerald-400" },
  partial: { label: "Partial", variant: "warning", dotClass: "bg-amber-400" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

export const PRIORITY_OPTIONS = listOptions(["Low", "Medium", "High", "Urgent"]);
