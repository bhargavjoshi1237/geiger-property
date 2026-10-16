// Shared lookups for Automations (trigger → action rules). Plain data — no JSX.

export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

export const listOptions = (values) => values.map((v) => ({ value: v, label: v }));

export const AUTOMATION_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
};

export const TRIGGERS = [
  "Rent overdue",
  "Lease expiring in 60 days",
  "Work order created",
  "Work order completed",
  "Application submitted",
  "Move-out scheduled",
  "Insurance expiring",
];

export const ACTIONS = [
  "Create task/work order",
  "Apply late fee",
  "Send message (template)",
  "Notify team member",
  "Change status",
];

export const PRIORITY_OPTIONS = listOptions(["Low", "Medium", "High", "Urgent"]);
