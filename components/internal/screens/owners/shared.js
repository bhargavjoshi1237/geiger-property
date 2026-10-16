// Shared lookups and formatters for the Owners area. Plain data, no JSX.

export const OWNER_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Onboarding: { label: "Onboarding", variant: "info", dotClass: "bg-sky-400" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-neutral-600" },
};

export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

export const PAYOUT_METHOD_OPTIONS = [
  { value: "ACH", label: "ACH" },
  { value: "Check", label: "Check" },
  { value: "Hold", label: "Hold" },
];

export const PAYOUT_SCHEDULE_OPTIONS = [
  { value: "Monthly", label: "Monthly" },
  { value: "Twice monthly", label: "Twice monthly" },
  { value: "Quarterly", label: "Quarterly" },
];

export const TAX_CLASSIFICATION_OPTIONS = [
  { value: "Individual", label: "Individual / sole proprietor" },
  { value: "LLC", label: "LLC" },
  { value: "Partnership", label: "Partnership" },
  { value: "Corporation", label: "Corporation" },
  { value: "Trust", label: "Trust / estate" },
];

// Property splits live in metadata.properties = [{ id, label, pct }].
export const splitsOf = (r) =>
  Array.isArray(r?.metadata?.properties) ? r.metadata.properties : [];

export const totalPctOf = (r) =>
  splitsOf(r).reduce((s, p) => s + (Number(p.pct) || 0), 0);

export const percent = (n) => `${Number(n) || 0}%`;
