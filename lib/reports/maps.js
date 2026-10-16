import { COMPLIANCE_STATUS_MAP } from "@/lib/compliance";

// Status lookups used by report columns (plain data, client + server).

export { COMPLIANCE_STATUS_MAP };

export const UNIT_STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success", dotClass: "bg-emerald-400" },
  Vacant: { label: "Vacant", variant: "info", dotClass: "bg-sky-400" },
  Notice: { label: "Notice", variant: "warning", dotClass: "bg-amber-400" },
  "Make-ready": { label: "Make-ready", variant: "purple", dotClass: "bg-violet-300" },
  Down: { label: "Down", variant: "outline", dotClass: "bg-red-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const RENEWAL_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "neutral", dotClass: "bg-zinc-500" },
  "Offer sent": { label: "Offer sent", variant: "info", dotClass: "bg-sky-400" },
  Negotiating: { label: "Negotiating", variant: "purple", dotClass: "bg-violet-300" },
  Accepted: { label: "Accepted", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "danger", dotClass: "bg-red-400" },
  "Moving out": { label: "Moving out", variant: "warning", dotClass: "bg-amber-400" },
};

export const LEDGER_STATUS_MAP = {
  Posted: { label: "Posted", variant: "success", dotClass: "bg-emerald-400" },
  Cleared: { label: "Cleared", variant: "success", dotClass: "bg-emerald-400" },
  Open: { label: "Uncleared", variant: "neutral", dotClass: "bg-zinc-500" },
  Void: { label: "Void", variant: "outline", dotClass: "bg-neutral-600" },
  Reversal: { label: "Reversal", variant: "warning", dotClass: "bg-amber-400" },
};

export const FILING_STATUS_MAP = {
  reportable: { label: "Reportable", variant: "success", dotClass: "bg-emerald-400" },
  missing_w9: { label: "W-9 missing", variant: "danger", dotClass: "bg-red-400" },
  below: { label: "Below threshold", variant: "neutral", dotClass: "bg-zinc-500" },
  exempt: { label: "Not 1099 eligible", variant: "outline", dotClass: "bg-neutral-600" },
};

export const TRUST_STATUS_MAP = {
  ok: { label: "Funded", variant: "success", dotClass: "bg-emerald-400" },
  short: { label: "Shortfall", variant: "danger", dotClass: "bg-red-400" },
};

export const DEPOSIT_MATCH_MAP = {
  match: { label: "Matches ledger", variant: "success", dotClass: "bg-emerald-400" },
  over: { label: "Ledger higher", variant: "warning", dotClass: "bg-amber-400" },
  under: { label: "Ledger lower", variant: "danger", dotClass: "bg-red-400" },
  unposted: { label: "Not in ledger", variant: "neutral", dotClass: "bg-zinc-500" },
};

export const WORK_ORDER_OPEN_EXCLUDED = ["Completed", "Rejected", "Converted", "Cancelled", "Closed", "Draft"];
export const OCCUPIED_STATUSES = ["Occupied", "Notice"];
export const ACTIVE_LEASE_STATUSES = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
export const DEAD_LEASE_STATUSES = ["Draft", "Cancelled", "Canceled", "Void", "Rejected"];
