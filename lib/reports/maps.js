import { COMPLIANCE_STATUS_MAP } from "@/lib/compliance";

// Status lookups used by report columns (plain data, client + server).

export { COMPLIANCE_STATUS_MAP };

export const UNIT_STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success" },
  Vacant: { label: "Vacant", variant: "info" },
  Notice: { label: "Notice", variant: "warning" },
  "Make-ready": { label: "Make-ready", variant: "purple" },
  Down: { label: "Down", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const RENEWAL_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "neutral" },
  "Offer sent": { label: "Offer sent", variant: "info" },
  Negotiating: { label: "Negotiating", variant: "purple" },
  Accepted: { label: "Accepted", variant: "success" },
  Declined: { label: "Declined", variant: "danger" },
  "Moving out": { label: "Moving out", variant: "warning" },
};

export const LEDGER_STATUS_MAP = {
  Posted: { label: "Posted", variant: "success" },
  Cleared: { label: "Cleared", variant: "success" },
  Open: { label: "Uncleared", variant: "neutral" },
  Void: { label: "Void", variant: "outline" },
  Reversal: { label: "Reversal", variant: "warning" },
};

export const FILING_STATUS_MAP = {
  reportable: { label: "Reportable", variant: "success" },
  missing_w9: { label: "W-9 missing", variant: "danger" },
  below: { label: "Below threshold", variant: "neutral" },
  exempt: { label: "Not 1099 eligible", variant: "outline" },
};

export const TRUST_STATUS_MAP = {
  ok: { label: "Funded", variant: "success" },
  short: { label: "Shortfall", variant: "danger" },
};

export const DEPOSIT_MATCH_MAP = {
  match: { label: "Matches ledger", variant: "success" },
  over: { label: "Ledger higher", variant: "warning" },
  under: { label: "Ledger lower", variant: "danger" },
  unposted: { label: "Not in ledger", variant: "neutral" },
};

export const WORK_ORDER_OPEN_EXCLUDED = ["Completed", "Rejected", "Converted", "Cancelled", "Closed", "Draft"];
export const OCCUPIED_STATUSES = ["Occupied", "Notice"];
export const ACTIVE_LEASE_STATUSES = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
export const DEAD_LEASE_STATUSES = ["Draft", "Cancelled", "Canceled", "Void", "Rejected"];
