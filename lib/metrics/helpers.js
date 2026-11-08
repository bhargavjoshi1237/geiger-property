import { complianceOf, daysUntil } from "@/lib/compliance";
import { round2 } from "@/lib/reports/format";
import { ownershipIndex } from "@/lib/ledger/ownership";
import { receivableAging, scopeLines, trustPositions } from "@/lib/reports/ledger_math";
import { byId, leaseForUnit, list, nameMaps, propertyOf } from "@/lib/reports/lookups";
import { ACTIVE_LEASE_STATUSES, OCCUPIED_STATUSES, WORK_ORDER_OPEN_EXCLUDED } from "@/lib/reports/maps";
import { dayOf, daysBetweenIso, isoLocal, parseIso } from "@/lib/reports/periods";

// Shared record-level rows behind the metric catalogue (pure, client + server). Every metric,
// signal detector and drill-down reads these, so the Overview, reports, signals and impact
// count the same records the same way. `src` is a report-sources bag (lib/reports/sources_*).

export const VACANT_STATUSES = ["Vacant", "Make-ready", "Down"];
export const OPEN_BILL_STATUSES = ["Open", "Partially paid"];
export const PENDING_APP_STATUSES = ["Submitted", "Screening"];
export const URGENT_PRIORITIES = ["Urgent", "High"];
export const DEPOSIT_OPEN_STATUSES = ["Pending", "Held", "Awaiting disposition"];

const DAY = 86400000;

export const ledgerOf = (src) => src?.ledger || { lines: [], accounts: { byId: new Map(), byKey: new Map(), list: [] } };

export const addDays = (iso, n) => {
  const d = parseIso(iso) || new Date();
  return isoLocal(new Date(d.getTime() + n * DAY));
};

const monthBounds = (iso) => {
  const d = parseIso(iso) || new Date();
  return { from: isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
};

// Normalized params: asOf day, a period (default: the asOf month) and a property scope.
export function resolveParams(params = {}, now = new Date()) {
  const asOf = dayOf(params.asOf) || isoLocal(now);
  const month = monthBounds(asOf);
  const propertyIds = Array.isArray(params.propertyIds) && params.propertyIds.length ? params.propertyIds : null;
  const propertyId = params.propertyId && params.propertyId !== "all" ? params.propertyId : null;
  return { ...params, asOf, from: dayOf(params.from) || month.from, to: dayOf(params.to) || month.to, propertyIds, propertyId };
}

// A trailing window ending at asOf (for medians and rates that need history).
export const trailing = (p, days) => ({ from: addDays(p.asOf, -(days - 1)), to: p.asOf });

export function inScope(p, propertyId) {
  if (p.propertyIds) return p.propertyIds.includes(propertyId);
  if (p.propertyId) return propertyId === p.propertyId;
  return true;
}

export const median = (values) => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// --- Receivables -------------------------------------------------------------------

// Delinquent accounts as the Delinquency report lists them (ledger AR aged by charge date).
export function delinquentRows(src, p) {
  const names = nameMaps(src);
  const units = byId(src.units);
  const leases = byId(src.leases);
  const L = ledgerOf(src);
  return receivableAging(L.lines, L.accounts, p.asOf)
    .map((r) => {
      const lease = leases.get(r.leaseId);
      const unitId = r.unitId || lease?.unitId || "";
      const propertyId = r.propertyId || lease?.propertyId || units.get(unitId)?.propertyId || "";
      return {
        ...r,
        unitId,
        propertyId,
        tenantId: r.tenantId || lease?.tenantId || "",
        tenant: lease?.tenantName || names.tenant.get(r.tenantId) || lease?.name || "Tenant",
        unit: names.unit.get(unitId) || lease?.unit || "",
        property: names.property.get(propertyId) || "",
        rent: Number(lease?.rent) || 0,
      };
    })
    .filter((r) => r.balance > 0.004 && inScope(p, r.propertyId));
}

const acct = (src, l) => ledgerOf(src).accounts.byId.get(l.glAccountId);
const lineScope = (p) => (p.propertyId ? { propertyId: p.propertyId } : {});
const lineInScope = (p, l) => !p.propertyIds || p.propertyIds.includes(l.propertyId);

// Payments applied to receivables in a window (Delinquency's "Collected" definition).
export function collectedLines(src, p, range = p) {
  return scopeLines(ledgerOf(src).lines, { ...lineScope(p), from: range.from, to: range.to }).filter(
    (l) => lineInScope(p, l) && l.entry?.sourceType === "payment" && acct(src, l)?.subtype === "receivable" && Number(l.credit) > 0,
  );
}

// Rent and fee charges billed to receivables in a window (Rent Roll's "Charged" definition).
export function billedLines(src, p, range = p) {
  return scopeLines(ledgerOf(src).lines, { ...lineScope(p), from: range.from, to: range.to }).filter(
    (l) =>
      lineInScope(p, l) &&
      acct(src, l)?.subtype === "receivable" &&
      Number(l.debit) > 0 &&
      !l.appliesToEntryId &&
      ["charge", "late_fee"].includes(l.entry?.sourceType),
  );
}

export const sumCredit = (lines) => round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
export const sumDebit = (lines) => round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));

// --- Units & occupancy ---------------------------------------------------------------

// Every non-draft unit in scope with its occupancy as of the day (Occupancy report rules).
export function unitRows(src, p) {
  const names = nameMaps(src);
  const units = list(src.units).filter((u) => u.status !== "Draft" && inScope(p, u.propertyId));
  const unitIds = new Set(units.map((u) => u.id));
  const leases = list(src.leases).filter((l) => unitIds.has(l.unitId));
  return units.map((u) => {
    const lease = leaseForUnit(u.id, leases, p.asOf);
    const occupied = Boolean(lease) || OCCUPIED_STATUSES.includes(u.status);
    const vacant = VACANT_STATUSES.includes(u.status) && !lease;
    let since = "";
    let days = null;
    if (vacant) {
      const ends = leases
        .filter((l) => l.unitId === u.id)
        .map((l) => dayOf(l.moveOutDate || l.termEnd))
        .filter((d) => d && d <= p.asOf)
        .sort();
      since = ends[ends.length - 1] || dayOf(u.leaseEnd) || "";
      days = since ? daysBetweenIso(since, p.asOf) : null;
    }
    return {
      id: u.id,
      label: u.label || "Unit",
      property: names.property.get(u.propertyId) || "Unassigned",
      propertyId: u.propertyId || "",
      status: u.status,
      rent: Number(u.rent) || 0,
      lease,
      occupied,
      vacant,
      since,
      days,
    };
  });
}

// --- Work orders -----------------------------------------------------------------

export const isOpenWorkOrder = (w) => !WORK_ORDER_OPEN_EXCLUDED.includes(w.status);
export const completedDayOf = (w) => {
  const direct = dayOf(w.completedAt || w.completedOn || w.completedDate || w.closedAt);
  if (direct) return direct;
  const done = list(w.statusHistory).filter((h) => h?.status === "Completed").pop();
  return dayOf(done?.at);
};

export function workOrderRows(src, p) {
  const units = byId(src.units);
  const names = nameMaps(src);
  return list(src.workOrders)
    .map((w) => {
      const propertyId = propertyOf(w, units);
      return {
        ...w,
        propertyId,
        property: names.property.get(propertyId) || w.propertyLabel || "",
        open: isOpenWorkOrder(w),
        due: dayOf(w.dueDate),
        created: dayOf(w.createdAt),
        completed: completedDayOf(w),
        cost: Number(w.totalCost) || (Number(w.laborCost) || 0) + (Number(w.materialCost) || 0),
      };
    })
    .filter((w) => inScope(p, w.propertyId));
}

// --- Leases & renewals -------------------------------------------------------------

export function expiringLeases(src, p, days) {
  const until = addDays(p.asOf, days);
  const units = byId(src.units);
  return list(src.leases)
    .filter((l) => ACTIVE_LEASE_STATUSES.includes(l.status))
    .map((l) => ({ ...l, propertyId: propertyOf(l, units), end: dayOf(l.termEnd) }))
    .filter((l) => l.end && l.end >= p.asOf && l.end <= until && inScope(p, l.propertyId));
}

export const renewalFor = (lease, renewals) =>
  list(renewals).find((r) => r.leaseId && r.leaseId === lease.id) ||
  list(renewals).find((r) => !r.leaseId && r.unitId && r.unitId === lease.unitId && (!r.tenantId || r.tenantId === lease.tenantId)) ||
  null;

// --- Payables ----------------------------------------------------------------------

export const billOpenAmount = (b) =>
  ["Paid", "Void", "Draft"].includes(b.status) ? 0 : round2(Math.max(0, (Number(b.amount) || 0) - (Number(b.amountPaid) || 0)));

export function billRows(src, p) {
  return list(src.bills)
    .map((b) => ({ ...b, open: billOpenAmount(b), due: dayOf(b.dueDate) }))
    .filter((b) => inScope(p, b.propertyId));
}

// Negative trust positions per owner × property (shares by date), so one co-owner overdrawn against another's funds shows.
export function trustShortfalls(src, p) {
  const L = ledgerOf(src);
  return trustPositions(L.lines, L.accounts, p.asOf, ownershipIndex(list(src.propertyOwners))).filter((t) => t.balance < 0 && inScope(p, t.propertyId));
}

// --- Budgets -----------------------------------------------------------------------

// Year-to-date budget vs actual per budget × expense account (positive variance = over budget).
export function budgetVarianceRows(src, p) {
  const asOf = parseIso(p.asOf) || new Date();
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;
  const accounts = ledgerOf(src).accounts;
  const budgets = list(src.budgets).filter((b) => Number(b.year) === year && inScope(p, b.propertyId) && b.status !== "Archived");
  const rows = [];
  for (const b of budgets) {
    const per = new Map();
    for (const line of list(src.budgetLines)) {
      if (line.budgetId !== b.id || Number(line.month) > month) continue;
      const a = accounts.byId.get(line.glAccountId);
      if (a?.accountType !== "Expense") continue;
      const r = per.get(line.glAccountId) || { glAccountId: line.glAccountId, account: line.accountLabel || a?.name || "Expense", budget: 0, actual: 0 };
      r.budget += Number(line.amount) || 0;
      per.set(line.glAccountId, r);
    }
    if (!per.size) continue;
    const from = `${year}-01-01`;
    for (const l of scopeLines(ledgerOf(src).lines, { from, to: p.asOf })) {
      if (!per.has(l.glAccountId)) continue;
      if (b.propertyId && l.propertyId !== b.propertyId) continue;
      per.get(l.glAccountId).actual += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    }
    for (const r of per.values()) {
      const budget = round2(r.budget);
      const actual = round2(r.actual);
      rows.push({ id: `${b.id}:${r.glAccountId}`, budgetId: b.id, budget: budget, actual, account: r.account, propertyId: b.propertyId || "", budgetName: b.name || `${year} budget`, variance: round2(actual - budget), pct: budget > 0 ? (actual - budget) / budget : null });
    }
  }
  return rows;
}

// --- Compliance --------------------------------------------------------------------

const coiRows = (v, rows) => (rows.length || !v?.insuranceExpiry ? rows : [{ id: "legacy", endsOn: v.insuranceExpiry, status: "Active" }]);

// Vendors whose COI or licence is expiring (within windowDays) or expired, as of the day.
export function vendorComplianceRows(src, p, windowDays = 30) {
  const today = parseIso(p.asOf) || new Date();
  const c = src.compliance || {};
  const get = (m, id) => (m instanceof Map ? m.get(id) || [] : []);
  const out = [];
  for (const v of list(src.vendors)) {
    if (["Inactive", "Do not use"].includes(v.status)) continue;
    const coi = complianceOf(coiRows(v, get(c.vendorCoi, v.id)), { required: !v.coiWaived, windowDays, today });
    const lic = complianceOf(get(c.vendorLicense, v.id), { required: Boolean(v.licenseRequired), windowDays, today });
    for (const [kind, res, rows] of [["COI", coi, coiRows(v, get(c.vendorCoi, v.id))], ["Licence", lic, get(c.vendorLicense, v.id)]]) {
      if (!["expired", "expiring"].includes(res.state)) continue;
      const ends = res.soonest || rows.map((r) => r.endsOn).filter(Boolean).sort().pop() || "";
      out.push({ vendorId: v.id, vendor: v.name || "Vendor", kind, state: res.state, endsOn: ends, days: daysUntil(ends, today) });
    }
  }
  return out;
}
