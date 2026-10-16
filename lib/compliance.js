// Expiry + compliance helpers shared by Tenants (renters insurance) and Vendors
// (COI, licenses). Pure functions with no client imports, so scheduled jobs can
// reuse them server-side. Records are `property.record_items` rows: endsOn =
// expiration date, status "Cancelled" = no longer in force.

export const EXPIRING_WINDOW_DAYS = 30;

// Whole days from today to a "YYYY-MM-DD" (or ISO) date; null when unset/invalid.
export function daysUntil(value, today = new Date()) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - start.getTime()) / 86400000);
}

// One record's state: "active" | "expiring" | "expired" | "cancelled" | "open" (no expiry set).
export function expiryState(endsOn, { status, windowDays = EXPIRING_WINDOW_DAYS, today } = {}) {
  if (String(status || "").toLowerCase() === "cancelled") return "cancelled";
  const d = daysUntil(endsOn, today);
  if (d === null) return "open";
  if (d < 0) return "expired";
  if (d <= windowDays) return "expiring";
  return "active";
}

// Badge descriptor for a single record row ({ label, variant }).
export function expiryBadge(row, opts) {
  const state = expiryState(row?.endsOn, { status: row?.status, ...opts });
  const d = daysUntil(row?.endsOn, opts?.today);
  if (state === "expired") return { state, label: "Expired", variant: "danger" };
  if (state === "expiring") return { state, label: d === 0 ? "Expires today" : `Expires in ${d}d`, variant: "warning" };
  if (state === "cancelled") return { state, label: "Cancelled", variant: "outline" };
  if (state === "open") return { state, label: "No expiry set", variant: "neutral" };
  return { state, label: "Active", variant: "success" };
}

// Overall compliance for a set of records of one kind:
// { state: compliant|expiring|expired|missing|not_required, soonest, inForce }.
export function complianceOf(items, { required = true, windowDays = EXPIRING_WINDOW_DAYS, today } = {}) {
  const rows = (items || []).filter((r) => String(r.status || "").toLowerCase() !== "cancelled");
  const states = rows.map((r) => ({ row: r, state: expiryState(r.endsOn, { windowDays, today }) }));
  const inForce = states.filter((s) => s.state !== "expired").map((s) => s.row);
  const soonest = inForce
    .filter((r) => r.endsOn)
    .sort((a, b) => String(a.endsOn).localeCompare(String(b.endsOn)))[0]?.endsOn || null;
  let state;
  if (!rows.length) state = required ? "missing" : "not_required";
  else if (!inForce.length) state = "expired";
  else if (states.some((s) => s.state === "active" || s.state === "open")) state = "compliant";
  else state = "expiring";
  return { state, soonest, inForce };
}

// Worst-of merge across several compliance results (COI + license…).
const RANK = { not_required: 0, compliant: 1, expiring: 2, missing: 3, expired: 4 };
export function worstCompliance(...states) {
  return states.filter(Boolean).reduce((w, s) => (RANK[s] > RANK[w] ? s : w), "not_required");
}

export const COMPLIANCE_STATUS_MAP = {
  compliant: { label: "Compliant", variant: "success", dotClass: "bg-emerald-400" },
  expiring: { label: "Expiring soon", variant: "warning", dotClass: "bg-amber-400" },
  expired: { label: "Expired", variant: "danger", dotClass: "bg-red-400" },
  missing: { label: "Missing", variant: "danger", dotClass: "bg-red-400" },
  not_required: { label: "Not required", variant: "outline", dotClass: "bg-neutral-600" },
};

// Group record_items rows by owner id → Map(ownerId → rows).
export function groupByOwner(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!map.has(r.ownerId)) map.set(r.ownerId, []);
    map.get(r.ownerId).push(r);
  }
  return map;
}
