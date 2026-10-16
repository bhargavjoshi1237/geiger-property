import { complianceOf, daysUntil } from "@/lib/compliance";
import { money, money0, pctLabel, pctOf, round2 } from "./format";
import { AR_BUCKETS, ownerLines, ownerStatement, receivableAging, scopeLines } from "./ledger_math";
import {
  ACTIVE_LEASE_STATUSES,
  COMPLIANCE_STATUS_MAP,
  OCCUPIED_STATUSES,
  RENEWAL_STATUS_MAP,
  UNIT_STATUS_MAP,
  WORK_ORDER_OPEN_EXCLUDED,
} from "./maps";
import { dayOf, daysBetweenIso, formatIso, inIsoRange, isoLocal, monthKeyOf, monthName, parseIso } from "./periods";
import { byId, leaseForUnit, list, nameMaps, optionsFrom, ownerHoldings, propertyOf, stat, sum } from "./lookups";

// Operational report definitions: rent roll, delinquency, occupancy, owner
// statements (owner packet), maintenance, leasing and insurance compliance.

const L = (data) => data.ledger || { lines: [], accounts: { byId: new Map(), byKey: new Map(), list: [] } };
const inProperty = (f, propertyId) => !f.propertyId || f.propertyId === "all" || propertyId === f.propertyId;
const acctOf = (data, l) => L(data).accounts.byId.get(l.glAccountId);

// Receivable per lease / tenant and period charges + collections, from the ledger.
function receivables(data, { from, to }) {
  const out = { byLease: new Map(), byTenant: new Map(), charged: new Map(), collected: new Map() };
  const add = (m, k, v) => k && m.set(k, round2((m.get(k) || 0) + v));
  for (const l of scopeLines(L(data).lines, { to })) {
    if (acctOf(data, l)?.subtype !== "receivable") continue;
    const net = (Number(l.debit) || 0) - (Number(l.credit) || 0);
    const leaseId = l.leaseId;
    const tenantId = l.tenantId;
    add(out.byLease, leaseId, net);
    add(out.byTenant, tenantId, net);
    if (dayOf(l.date) < from) continue;
    const key = leaseId || `t:${tenantId}`;
    const type = l.entry?.sourceType;
    if (Number(l.debit) > 0 && !l.appliesToEntryId && ["charge", "late_fee"].includes(type)) add(out.charged, key, Number(l.debit));
    if (Number(l.credit) > 0 && type === "payment") add(out.collected, key, Number(l.credit));
  }
  return out;
}

// Rent roll rows (shared by Rent Roll and the owner packet).
function rentRollRows(data, f) {
  const names = nameMaps(data);
  const tenants = byId(data.tenants);
  const rec = receivables(data, f);
  return list(data.units)
    .filter((u) => u.status !== "Draft" && inProperty(f, u.propertyId) && (!f.propertyIds || f.propertyIds.includes(u.propertyId)))
    .map((u) => {
      const lease = leaseForUnit(u.id, data.leases, f.to);
      const tenantId = lease?.tenantId || u.tenantId || "";
      const key = lease?.id || `t:${tenantId}`;
      const balance = lease ? rec.byLease.get(lease.id) ?? rec.byTenant.get(tenantId) ?? 0 : rec.byTenant.get(tenantId) ?? 0;
      return {
        id: u.id,
        propertyId: u.propertyId,
        property: names.property.get(u.propertyId) || "Unassigned",
        unit: u.label || "Unit",
        status: u.status,
        tenant: lease?.tenantName || tenants.get(tenantId)?.name || u.occupantName || "",
        leaseStart: lease?.termStart || "",
        leaseEnd: lease?.termEnd || "",
        marketRent: Number(u.rent) || 0,
        leaseRent: lease ? Number(lease.rent) || 0 : null,
        deposit: lease ? Number(lease.deposit) || 0 : null,
        charged: rec.charged.get(key) || 0,
        collected: rec.collected.get(key) || 0,
        balance: round2(balance),
        occupied: Boolean(lease) || OCCUPIED_STATUSES.includes(u.status),
      };
    })
    .sort((a, b) => a.property.localeCompare(b.property) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
}

const RENT_ROLL_COLUMNS = [
  { key: "unit", header: "Unit", sub: "property" },
  { key: "status", header: "Status", format: "status", statusMap: UNIT_STATUS_MAP },
  { key: "tenant", header: "Tenant" },
  { key: "leaseStart", header: "Lease start", format: "date" },
  { key: "leaseEnd", header: "Lease end", format: "date" },
  { key: "marketRent", header: "Market rent", format: "money" },
  { key: "leaseRent", header: "Lease rent", format: "money" },
  { key: "charged", header: "Charged", format: "money" },
  { key: "collected", header: "Collected", format: "money" },
  { key: "balance", header: "Balance", format: "money", tone: "owed" },
];

const rentRollTotals = (rows) => ({
  unit: "Totals",
  marketRent: sum(rows, "marketRent"),
  leaseRent: sum(rows, "leaseRent"),
  charged: round2(sum(rows, "charged")),
  collected: round2(sum(rows, "collected")),
  balance: round2(sum(rows, "balance")),
});

export const rentRollReport = {
  key: "rent_roll",
  title: "Rent Roll",
  description: "Every unit with its lease as of the end date, rent, period charges and collections, and ledger balance.",
  sources: ["ledger", "units", "properties", "leases", "tenants"],
  filters: [
    { type: "range", defaultPreset: "this_month" },
    { type: "property" },
    { key: "status", label: "Status", type: "select", options: () => [{ value: "all", label: "All statuses" }, ...Object.keys(UNIT_STATUS_MAP).map((k) => ({ value: k, label: k }))] },
  ],
  compute(data, f) {
    if (!list(data.units).length) return { empty: { title: "No units yet", description: "Add units under Property → Units and the rent roll fills in automatically." } };
    const rows = rentRollRows(data, f).filter((r) => !f.status || f.status === "all" || r.status === f.status);
    const occupied = rows.filter((r) => r.occupied);
    return {
      stats: [
        stat("Units", rows.length, `${occupied.length} occupied`),
        stat("Occupancy", pctLabel(pctOf(occupied.length, rows.length)), `As of ${formatIso(f.to)}`),
        stat("Scheduled rent", money0(sum(occupied, (r) => r.leaseRent ?? r.marketRent)), "Monthly, occupied units"),
        stat("Balance due", money(round2(sum(rows, (r) => Math.max(0, r.balance)))), `${rows.filter((r) => r.balance > 0).length} units owing`),
      ],
      sections: [
        {
          key: "units",
          title: "Units",
          description: "Balances come from the ledger's accounts receivable for each unit's lease.",
          searchable: true,
          columns: RENT_ROLL_COLUMNS,
          rows,
          totals: rentRollTotals(rows),
          emptyTitle: "No units match these filters",
        },
      ],
    };
  },
};

export const delinquencyReport = {
  key: "delinquency",
  title: "Delinquency",
  description: "Open charges per lease aged from their charge date, from the ledger's receivables.",
  sources: ["ledger", "leases", "tenants", "units", "properties"],
  filters: [{ type: "range", mode: "asOf", defaultPreset: "today" }, { type: "property" }],
  compute(data, f) {
    const names = nameMaps(data);
    const units = byId(data.units);
    const leases = byId(data.leases);
    const rows = receivableAging(L(data).lines, L(data).accounts, f.to)
      .map((r) => {
        const lease = leases.get(r.leaseId);
        const propertyId = r.propertyId || lease?.propertyId || units.get(r.unitId || lease?.unitId)?.propertyId || "";
        return {
          ...r,
          tenant: lease?.tenantName || names.tenant.get(r.tenantId) || lease?.name || "Tenant",
          unit: names.unit.get(r.unitId || lease?.unitId) || lease?.unit || "",
          property: names.property.get(propertyId) || "",
          propertyId,
        };
      })
      .filter((r) => r.balance > 0.004 && inProperty(f, r.propertyId));
    const total = round2(sum(rows, "balance"));
    const since = parseIso(f.to) || new Date();
    since.setDate(since.getDate() - 29);
    const collected = round2(
      scopeLines(L(data).lines, { from: isoLocal(since), to: f.to })
        .filter((l) => l.entry?.sourceType === "payment" && acctOf(data, l)?.subtype === "receivable")
        .reduce((s, l) => s + (Number(l.credit) || 0), 0),
    );
    return {
      stats: [
        stat("Total delinquent", money(total), `As of ${formatIso(f.to)}`),
        stat("Accounts", rows.length, "With a balance"),
        stat("Over 60 days", money(round2(sum(rows, "b61") + sum(rows, "b91")))),
        stat("Collected (30 days)", money(collected), `${formatIso(isoLocal(since))} – ${formatIso(f.to)}`),
      ],
      sections: [
        {
          key: "aging",
          title: "Aging",
          description: "Payments retire the charges they were applied to; unapplied credits are shown separately.",
          searchable: true,
          columns: [
            { key: "tenant", header: "Tenant", sub: "unitProperty" },
            ...AR_BUCKETS.map((b) => ({ key: b.key, header: b.label, format: "money" })),
            { key: "credit", header: "Unapplied credit", format: "money" },
            { key: "balance", header: "Balance", format: "money", tone: "owed" },
            { key: "oldestDays", header: "Oldest", format: "days" },
            { key: "lastPayment", header: "Last payment", format: "date" },
          ],
          rows: rows.map((r) => ({ ...r, unitProperty: [r.unit, r.property].filter(Boolean).join(" · ") })),
          totals: { tenant: "Totals", b0: round2(sum(rows, "b0")), b31: round2(sum(rows, "b31")), b61: round2(sum(rows, "b61")), b91: round2(sum(rows, "b91")), credit: round2(sum(rows, "credit")), balance: total },
          emptyTitle: "Nobody is behind on rent",
          emptyDescription: "Every lease in this view is paid up as of this date.",
        },
      ],
    };
  },
};

const VACANT = ["Vacant", "Make-ready", "Down"];

export const occupancyReport = {
  key: "occupancy",
  title: "Occupancy & Vacancy",
  description: "Occupancy per property as of the end date, vacant units, move activity and vacancy loss in the period.",
  sources: ["units", "properties", "leases"],
  filters: [{ type: "range", defaultPreset: "this_month" }, { type: "property" }],
  compute(data, f) {
    if (!list(data.units).length) return { empty: { title: "No units yet", description: "Add units under Property → Units to see occupancy and vacancy." } };
    const names = nameMaps(data);
    const units = list(data.units).filter((u) => u.status !== "Draft" && inProperty(f, u.propertyId));
    const unitIds = new Set(units.map((u) => u.id));
    const leases = list(data.leases).filter((l) => unitIds.has(l.unitId));
    const occupiedOf = (u) => Boolean(leaseForUnit(u.id, leases, f.to)) || OCCUPIED_STATUSES.includes(u.status);
    const groups = new Map();
    for (const u of units) {
      const g = groups.get(u.propertyId || "none") || { id: u.propertyId || "none", name: names.property.get(u.propertyId) || "Unassigned", total: 0, occupied: 0, notice: 0, vacant: 0, makeReady: 0, down: 0 };
      g.total += 1;
      if (occupiedOf(u)) g.occupied += 1;
      if (u.status === "Notice") g.notice += 1;
      if (u.status === "Vacant") g.vacant += 1;
      if (u.status === "Make-ready") g.makeReady += 1;
      if (u.status === "Down") g.down += 1;
      groups.set(g.id, g);
    }
    const byProperty = [...groups.values()].map((g) => ({ ...g, rate: pctOf(g.occupied, g.total) })).sort((a, b) => a.name.localeCompare(b.name));
    const rangeDays = Math.max(1, (daysBetweenIso(f.from, f.to) ?? 0) + 1);
    const vacant = units
      .filter((u) => VACANT.includes(u.status) && !leaseForUnit(u.id, leases, f.to))
      .map((u) => {
        const ends = leases.filter((l) => l.unitId === u.id).map((l) => dayOf(l.moveOutDate || l.termEnd)).filter((d) => d && d <= f.to).sort();
        const since = ends[ends.length - 1] || dayOf(u.leaseEnd) || "";
        const days = since ? daysBetweenIso(since, f.to) : null;
        const vacantStart = since && since > f.from ? since : f.from;
        const daysInRange = Math.max(0, Math.min(rangeDays, (daysBetweenIso(vacantStart, f.to) ?? 0) + 1));
        const rent = Number(u.rent) || 0;
        return { id: u.id, unit: u.label || "Unit", property: names.property.get(u.propertyId) || "Unassigned", status: u.status, since, days, rent, loss: round2((rent * 12 * daysInRange) / 365) };
      })
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    const moves = [];
    for (const l of leases) {
      const inDay = dayOf(l.moveInDate || l.termStart);
      const outDay = dayOf(l.moveOutDate) || (!ACTIVE_LEASE_STATUSES.includes(l.status) ? dayOf(l.termEnd) : "");
      if (inDay && inIsoRange(inDay, f)) moves.push({ id: `${l.id}:in`, date: inDay, kind: "Move-in", tenant: l.tenantName || l.name || "", unit: names.unit.get(l.unitId) || l.unit || "" });
      if (outDay && inIsoRange(outDay, f)) moves.push({ id: `${l.id}:out`, date: outDay, kind: "Move-out", tenant: l.tenantName || l.name || "", unit: names.unit.get(l.unitId) || l.unit || "" });
    }
    moves.sort((a, b) => a.date.localeCompare(b.date));
    const occupied = sum(byProperty, "occupied");
    return {
      stats: [
        stat("Units", units.length, `${byProperty.length} properties`),
        stat("Occupancy", pctLabel(pctOf(occupied, units.length)), `As of ${formatIso(f.to)}`),
        stat("Vacant", vacant.length, `${moves.filter((m) => m.kind === "Move-in").length} in · ${moves.filter((m) => m.kind === "Move-out").length} out in period`),
        stat("Vacancy loss", money0(sum(vacant, "loss")), "Market rent lost in period"),
      ],
      sections: [
        {
          key: "properties",
          title: "By property",
          columns: [
            { key: "name", header: "Property" },
            { key: "total", header: "Units", format: "number" },
            { key: "occupied", header: "Occupied", format: "number" },
            { key: "notice", header: "Notice", format: "number" },
            { key: "vacant", header: "Vacant", format: "number" },
            { key: "makeReady", header: "Make-ready", format: "number" },
            { key: "down", header: "Down", format: "number" },
            { key: "rate", header: "Occupancy", format: "meter" },
          ],
          rows: byProperty,
          emptyTitle: "No units for this property",
        },
        {
          key: "vacant",
          title: "Vacant units",
          description: "Days vacant are measured from the last lease end on record.",
          columns: [
            { key: "unit", header: "Unit", sub: "property" },
            { key: "status", header: "Status", format: "status", statusMap: UNIT_STATUS_MAP },
            { key: "since", header: "Vacant since", format: "date" },
            { key: "days", header: "Days vacant", format: "number" },
            { key: "rent", header: "Market rent", format: "money" },
            { key: "loss", header: "Loss in period", format: "money" },
          ],
          rows: vacant,
          emptyTitle: "Fully occupied",
          emptyDescription: "There are no vacant, make-ready, or down units in this view.",
        },
        {
          key: "moves",
          title: "Move activity",
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "kind", header: "Type" },
            { key: "tenant", header: "Tenant" },
            { key: "unit", header: "Unit" },
          ],
          rows: moves,
          emptyTitle: "No move-ins or move-outs in this period",
        },
      ],
    };
  },
};

const isOpenWo = (w) => !WORK_ORDER_OPEN_EXCLUDED.includes(w.status);
const woCost = (w) => Number(w.totalCost) || (Number(w.laborCost) || 0) + (Number(w.materialCost) || 0);

function workOrderRows(data, f) {
  const units = byId(data.units);
  const names = nameMaps(data);
  return list(data.workOrders)
    .map((w) => ({ ...w, propertyId: propertyOf(w, units) }))
    .filter((w) => inProperty(f, w.propertyId) && (!f.propertyIds || f.propertyIds.includes(w.propertyId)))
    .filter((w) => inIsoRange(w.createdAt, f) || inIsoRange(w.completedAt || w.completedOn || w.completedDate, f))
    .map((w) => ({ ...w, property: names.property.get(w.propertyId) || w.propertyLabel || "", cost: woCost(w), created: dayOf(w.createdAt), completed: dayOf(w.completedAt || w.completedOn || w.completedDate || w.closedAt) }));
}

const WORK_ORDER_COLUMNS = [
  { key: "name", header: "Work order", sub: "property" },
  { key: "category", header: "Category" },
  { key: "priority", header: "Priority" },
  { key: "status", header: "Status" },
  { key: "vendorName", header: "Vendor" },
  { key: "created", header: "Created", format: "date" },
  { key: "completed", header: "Completed", format: "date" },
  { key: "cost", header: "Cost", format: "money" },
];

export const ownerStatementsReport = {
  key: "owner_statements",
  title: "Owner Statements",
  description: "Per owner and period: income, expenses, management fees, distributions and ending trust balance — plus rent roll and work orders as an owner packet.",
  sources: ["ledger", "owners", "properties", "propertyOwners", "units", "leases", "tenants", "workOrders"],
  filters: [
    { type: "range", defaultPreset: "last_month" },
    { key: "ownerId", label: "Owner", type: "select", options: (data) => optionsFrom(data.owners, null, (o) => o.name || "Unnamed owner"), default: "first" },
    { type: "property" },
  ],
  compute(data, f) {
    const owners = list(data.owners);
    if (!owners.length) return { empty: { title: "No owners yet", description: "Add owners under People → Owners and link their properties." } };
    const owner = owners.find((o) => o.id === f.ownerId) || owners[0];
    const holdings = ownerHoldings(owner, data.propertyOwners, data.properties).filter((h) => inProperty(f, h.propertyId));
    if (!holdings.length) return { empty: { title: `${owner.name || "This owner"} has no linked properties`, description: "Link properties and ownership % on the owner's Properties tab." }, subtitle: owner.name };
    const propertyIds = holdings.map((h) => h.propertyId);
    const lines = scopeLines(ownerLines(L(data).lines, { ownerId: owner.id, propertyIds }), { propertyId: f.propertyId });
    const st = ownerStatement(lines, L(data).accounts, f);
    const t = st.totals;
    const names = nameMaps(data);
    const pctOfProp = new Map(holdings.map((h) => [h.propertyId, h.pct]));
    const byProperty = holdings.map((h) => {
      const r = st.byProperty.find((x) => x.propertyId === h.propertyId) || { income: 0, expenses: 0, fees: 0, distributions: 0, contributions: 0, net: 0 };
      return { id: h.propertyId, property: h.name, pct: h.pct, ...r, share: round2((r.net * (pctOfProp.get(h.propertyId) || 100)) / 100) };
    });
    const sub = { ...f, propertyIds };
    const rentRoll = rentRollRows(data, sub);
    const workOrders = workOrderRows(data, sub);
    return {
      subtitle: owner.name,
      stats: [
        stat("Income", money(t.income), "Accrued in period"),
        stat("Expenses + fees", money(round2(t.expenses + t.fees)), `${money(t.fees)} management fees`),
        stat("Distributions", money(t.distributions), "Paid to owner"),
        stat("Ending balance", money(t.closing), "Owner funds in trust"),
      ],
      sections: [
        {
          key: "summary",
          title: "Statement summary",
          description: `${owner.name || "Owner"} · ${formatIso(f.from)} – ${formatIso(f.to)}`,
          kind: "statement",
          span: "half",
          columns: [{ key: "label", header: "Line" }, { key: "amount", header: "Amount", format: "money" }],
          rows: [
            { id: "open", label: "Beginning balance", amount: t.opening },
            { id: "inc", label: "Income", amount: t.income },
            { id: "exp", label: "Operating expenses", amount: -t.expenses },
            { id: "fee", label: "Management fees", amount: -t.fees },
            { id: "noi", label: "Net operating income", amount: t.noi, strong: true },
            { id: "con", label: "Owner contributions", amount: t.contributions },
            { id: "dis", label: "Owner distributions", amount: -t.distributions },
            { id: "rec", label: "Cash received in trust", amount: t.receipts, muted: true },
            { id: "pay", label: "Cash paid from trust", amount: -t.disbursements, muted: true },
          ],
          totals: { label: "Ending balance", amount: t.closing },
        },
        {
          key: "properties",
          title: "By property",
          span: "half",
          columns: [
            { key: "property", header: "Property" },
            { key: "pct", header: "Own %", value: (r) => `${r.pct}%` },
            { key: "income", header: "Income", format: "money" },
            { key: "expenses", header: "Expenses", format: "money" },
            { key: "fees", header: "Fees", format: "money" },
            { key: "net", header: "NOI", format: "money" },
            { key: "share", header: "Owner share", format: "money" },
            { key: "distributions", header: "Distributed", format: "money" },
          ],
          rows: byProperty,
        },
        {
          key: "detail",
          title: "Transaction detail",
          searchable: true,
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "property", header: "Property", value: (r) => names.property.get(r.propertyId) || "—" },
            { key: "kind", header: "Type" },
            { key: "account", header: "Account" },
            { key: "memo", header: "Memo" },
            { key: "amount", header: "Amount", format: "money" },
          ],
          rows: st.detail,
          emptyTitle: "No activity in this period",
        },
        { key: "rent_roll", title: "Rent roll", columns: RENT_ROLL_COLUMNS, rows: rentRoll, totals: rentRollTotals(rentRoll), emptyTitle: "No units on these properties" },
        { key: "work_orders", title: "Work orders", columns: WORK_ORDER_COLUMNS, rows: workOrders, totals: { name: "Totals", cost: round2(sum(workOrders, "cost")) }, emptyTitle: "No work orders in this period" },
      ],
    };
  },
};

function breakdown(rows, keyOf, order) {
  const map = new Map();
  for (const w of rows) {
    const label = keyOf(w) || "Unspecified";
    const g = map.get(label) || { id: label, label, count: 0, open: 0, cost: 0 };
    g.count += 1;
    if (isOpenWo(w)) g.open += 1;
    g.cost += w.cost;
    map.set(label, g);
  }
  const out = [...map.values()].map((g) => ({ ...g, cost: round2(g.cost), share: pctOf(g.count, rows.length) }));
  const rank = (l) => (order?.includes(l) ? order.indexOf(l) : 99);
  return order ? out.sort((a, b) => rank(a.label) - rank(b.label)) : out.sort((a, b) => b.count - a.count);
}

const breakdownCols = (label) => [
  { key: "label", header: label },
  { key: "share", header: "Share", format: "meter" },
  { key: "count", header: "Count", format: "number" },
  { key: "open", header: "Open", format: "number" },
  { key: "cost", header: "Cost", format: "money" },
];

export const maintenanceReport = {
  key: "maintenance_report",
  title: "Maintenance Report",
  description: "Work orders created or completed in the period — volume, turnaround and spend by status, priority, category and vendor.",
  sources: ["workOrders", "units", "properties"],
  filters: [{ type: "range", defaultPreset: "last_12" }, { type: "property" }],
  compute(data, f) {
    if (!list(data.workOrders).length) return { empty: { title: "No work orders yet", description: "Create work orders under Maintenance → Work Orders to see volume, turnaround, and cost." } };
    const rows = workOrderRows(data, f);
    const open = rows.filter(isOpenWo);
    const durations = rows.filter((w) => w.completed && w.created).map((w) => Math.max(0, daysBetweenIso(w.created, w.completed) ?? 0));
    const avg = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;
    const vendors = breakdown(rows.filter((w) => w.vendorName), (w) => w.vendorName).sort((a, b) => b.cost - a.cost).slice(0, 15);
    return {
      stats: [
        stat("Work orders", rows.length, `${open.length} open`),
        stat("Urgent / high", open.filter((w) => ["Urgent", "High"].includes(w.priority)).length, "Open"),
        stat("Avg days to close", avg === null ? "—" : `${avg.toFixed(1)}d`, durations.length ? `${durations.length} completed` : "No completion dates"),
        stat("Total cost", money0(sum(rows, "cost")), `${money0(sum(rows, "laborCost"))} labor · ${money0(sum(rows, "materialCost"))} material`),
      ],
      sections: [
        { key: "status", title: "By status", span: "half", columns: breakdownCols("Status"), rows: breakdown(rows, (w) => w.status), emptyTitle: "No work orders in this period" },
        { key: "priority", title: "By priority", span: "half", columns: breakdownCols("Priority"), rows: breakdown(rows, (w) => w.priority, ["Urgent", "High", "Medium", "Low"]), emptyTitle: "No work orders in this period" },
        { key: "category", title: "By category", span: "half", columns: breakdownCols("Category"), rows: breakdown(rows, (w) => w.category), emptyTitle: "No work orders in this period" },
        {
          key: "vendors",
          title: "Top vendors",
          span: "half",
          columns: [
            { key: "label", header: "Vendor" },
            { key: "count", header: "Jobs", format: "number" },
            { key: "open", header: "Open", format: "number" },
            { key: "cost", header: "Total cost", format: "money" },
          ],
          rows: vendors,
          emptyTitle: "No vendors assigned",
        },
        { key: "list", title: "Work orders", searchable: true, columns: WORK_ORDER_COLUMNS, rows: rows.sort((a, b) => b.created.localeCompare(a.created)), totals: { name: "Totals", cost: round2(sum(rows, "cost")) }, emptyTitle: "No work orders in this period" },
      ],
    };
  },
};

export const leasingReport = {
  key: "leasing_report",
  title: "Leasing Report",
  description: "The prospect → lease funnel for the period, upcoming expirations, and renewal outcomes.",
  sources: ["leases", "prospects", "showings", "applications", "renewals", "units", "properties"],
  filters: [{ type: "range", defaultPreset: "last_12" }, { type: "property" }],
  compute(data, f) {
    const units = byId(data.units);
    const names = nameMaps(data);
    const tag = (rows) => list(rows).filter((r) => inProperty(f, propertyOf(r, units)));
    const leases = tag(data.leases);
    const s = { prospects: tag(data.prospects), showings: tag(data.showings), applications: tag(data.applications), renewals: tag(data.renewals) };
    if (![leases, ...Object.values(s)].some((r) => r.length)) {
      return { empty: { title: "No leasing activity yet", description: "Prospects, showings, applications, leases, and renewals all feed this report." } };
    }
    const counts = [
      ["prospects", "Prospects", s.prospects.filter((p) => inIsoRange(p.createdAt, f)).length],
      ["showings", "Showings", s.showings.filter((x) => x.status !== "Cancelled" && inIsoRange(x.showingDate || x.createdAt, f)).length],
      ["applications", "Applications", s.applications.filter((a) => inIsoRange(a.appliedOn || a.createdAt, f)).length],
      ["leases", "Leases signed", leases.filter((l) => !["Draft", "Cancelled"].includes(l.status) && inIsoRange(l.signedDate || l.termStart || l.createdAt, f)).length],
    ];
    const funnel = counts.map(([id, label, count], i) => ({ id, label, count, conversion: i === 0 ? null : counts[i - 1][2] ? count / counts[i - 1][2] : 0, share: pctOf(count, counts[0][2] || Math.max(...counts.map((c) => c[2]), 1)) }));
    const start = parseIso(f.to) || new Date();
    const months = Array.from({ length: 12 }, (_, i) => monthKeyOf(isoLocal(new Date(start.getFullYear(), start.getMonth() + i, 1))));
    const renewalByLease = new Map(s.renewals.filter((r) => r.leaseId).map((r) => [r.leaseId, r]));
    const expiring = leases
      .filter((l) => ACTIVE_LEASE_STATUSES.includes(l.status) && months.includes(monthKeyOf(l.termEnd)))
      .map((l) => ({ id: l.id, tenant: l.tenantName || l.name || "Lease", unit: names.unit.get(l.unitId) || l.unit || "", property: names.property.get(propertyOf(l, units)) || "", end: dayOf(l.termEnd), rent: Number(l.rent) || 0, renewal: renewalByLease.get(l.id)?.status || "" }))
      .sort((a, b) => a.end.localeCompare(b.end));
    const groups = new Map();
    for (const r of s.renewals) {
      const g = groups.get(r.status) || { id: r.status, status: r.status, count: 0, pcts: [] };
      g.count += 1;
      if (r.currentRent > 0 && r.proposedRent > 0) g.pcts.push(((r.proposedRent - r.currentRent) / r.currentRent) * 100);
      groups.set(r.status, g);
    }
    const order = Object.keys(RENEWAL_STATUS_MAP);
    const rank = (st) => (order.includes(st) ? order.indexOf(st) : 99);
    const renewals = [...groups.values()]
      .map((g) => ({ id: g.id, status: g.status, count: g.count, increase: g.pcts.length ? `${(g.pcts.reduce((a, b) => a + b, 0) / g.pcts.length).toFixed(1)}%` : "—" }))
      .sort((a, b) => rank(a.status) - rank(b.status));
    const top = funnel[0].count;
    const signed = funnel[3].count;
    return {
      stats: [
        stat("Prospects", top, "In period"),
        stat("Applications", funnel[2].count, "In period"),
        stat("Leases signed", signed, "In period"),
        stat("Lead-to-lease", pctLabel(pctOf(signed, top)), "Leases ÷ prospects"),
      ],
      sections: [
        {
          key: "funnel",
          title: "Leasing funnel",
          description: "Each step's conversion is from the step before.",
          span: "half",
          columns: [
            { key: "label", header: "Stage" },
            { key: "share", header: "Volume", format: "meter" },
            { key: "count", header: "Count", format: "number" },
            { key: "conversion", header: "Conversion", value: (r) => (r.conversion === null ? "—" : pctLabel(r.conversion)) },
          ],
          rows: funnel,
        },
        {
          key: "renewals",
          title: "Renewal outcomes",
          span: "half",
          columns: [
            { key: "status", header: "Outcome", format: "status", statusMap: RENEWAL_STATUS_MAP },
            { key: "count", header: "Renewals", format: "number" },
            { key: "increase", header: "Avg increase" },
          ],
          rows: renewals,
          emptyTitle: "No renewals yet",
        },
        {
          key: "expirations_chart",
          title: "Lease expirations",
          description: `Active leases ending in the 12 months from ${monthName(months[0])}`,
          kind: "chart",
          chart: { x: "label", series: [{ key: "count", label: "Leases expiring" }], integer: true },
          columns: [{ key: "label", header: "Month" }, { key: "count", header: "Expiring", format: "number" }],
          rows: months.map((k) => ({ id: k, label: monthName(k, false), count: expiring.filter((e) => monthKeyOf(e.end) === k).length })),
        },
        {
          key: "expiring",
          title: "Expiring leases",
          columns: [
            { key: "tenant", header: "Lease", sub: "unit" },
            { key: "property", header: "Property" },
            { key: "end", header: "Ends", format: "date" },
            { key: "rent", header: "Rent", format: "money" },
            { key: "renewal", header: "Renewal", format: "status", statusMap: RENEWAL_STATUS_MAP },
          ],
          rows: expiring,
          emptyTitle: "Nothing expiring in the next 12 months",
        },
      ],
    };
  },
};

// Vendor compliance rules (mirrors the Vendors area).
const vendorUsable = (v) => !["Inactive", "Do not use"].includes(v?.status);
const coiRows = (v, rows) => (rows.length || !v?.insuranceExpiry ? rows : [{ id: "legacy", endsOn: v.insuranceExpiry, status: "Active" }]);
const residentStatuses = ["Current", "Late", "Notice"];

export const insuranceComplianceReport = {
  key: "insurance_compliance",
  title: "Insurance Compliance",
  description: "Renters insurance for residents and certificates of insurance and licenses for vendors, evaluated as of the end date.",
  sources: ["tenants", "vendors", "properties", "compliance"],
  filters: [
    { type: "range", mode: "asOf", defaultPreset: "today" },
    { type: "property" },
    { key: "party", label: "Party", type: "select", options: () => [{ value: "all", label: "Tenants & vendors" }, { value: "tenant", label: "Tenants" }, { value: "vendor", label: "Vendors" }] },
    { key: "state", label: "Status", type: "select", options: () => [{ value: "all", label: "All statuses" }, ...Object.entries(COMPLIANCE_STATUS_MAP).map(([value, m]) => ({ value, label: m.label }))] },
  ],
  compute(data, f) {
    const today = parseIso(f.to) || new Date();
    const names = nameMaps(data);
    const comp = data.compliance || {};
    const of = (key, id) => comp[key]?.get?.(id) || [];
    const rows = [];
    if (f.party !== "vendor") {
      for (const t of list(data.tenants)) {
        if (!inProperty(f, t.propertyId)) continue;
        const required = residentStatuses.includes(t.status) && !t.metadata?.insuranceWaived;
        const c = complianceOf(of("tenantInsurance", t.id), { required, today });
        if (c.state === "not_required") continue;
        rows.push({ id: `t:${t.id}`, party: "Tenant", name: t.name || "Tenant", detail: [t.unit, names.property.get(t.propertyId)].filter(Boolean).join(" · "), requirement: "Renters insurance", state: c.state, expires: c.soonest || "", days: c.soonest ? daysUntil(c.soonest, today) : null });
      }
    }
    if (f.party !== "tenant" && (!f.propertyId || f.propertyId === "all")) {
      for (const v of list(data.vendors)) {
        if (!vendorUsable(v)) continue;
        const coi = complianceOf(coiRows(v, of("vendorCoi", v.id)), { required: !v.metadata?.coiWaived, today });
        const lic = complianceOf(of("vendorLicense", v.id), { required: Boolean(v.metadata?.licenseRequired), today });
        const add = (requirement, c) => c.state !== "not_required" && rows.push({ id: `v:${v.id}:${requirement}`, party: "Vendor", name: v.name || "Vendor", detail: v.specialty || "", requirement, state: c.state, expires: c.soonest || "", days: c.soonest ? daysUntil(c.soonest, today) : null });
        add("Certificate of insurance", coi);
        add("Trade license", lic);
      }
    }
    const filtered = rows
      .filter((r) => !f.state || f.state === "all" || r.state === f.state)
      .sort((a, b) => ["expired", "missing", "expiring", "compliant"].indexOf(a.state) - ["expired", "missing", "expiring", "compliant"].indexOf(b.state) || (a.days ?? 9999) - (b.days ?? 9999));
    if (!rows.length) return { empty: { title: "Nothing to track yet", description: "Residents need renters insurance and active vendors need a COI — add them under People." } };
    const count = (s) => rows.filter((r) => r.state === s).length;
    return {
      stats: [
        stat("Compliant", count("compliant"), `${rows.length} requirements`),
        stat("Expiring soon", count("expiring"), "Within 30 days"),
        stat("Expired", count("expired"), `As of ${formatIso(f.to)}`),
        stat("Missing", count("missing"), "No document on file"),
      ],
      sections: [
        {
          key: "requirements",
          title: "Requirements",
          searchable: true,
          columns: [
            { key: "name", header: "Name", sub: "detail" },
            { key: "party", header: "Party" },
            { key: "requirement", header: "Requirement" },
            { key: "state", header: "Status", format: "status", statusMap: COMPLIANCE_STATUS_MAP },
            { key: "expires", header: "Expires", format: "date" },
            { key: "days", header: "Days left", format: "number" },
          ],
          rows: filtered,
          emptyTitle: "No requirements match these filters",
        },
      ],
    };
  },
};

export const OPERATIONS_REPORTS = [
  rentRollReport,
  delinquencyReport,
  occupancyReport,
  ownerStatementsReport,
  maintenanceReport,
  leasingReport,
  insuranceComplianceReport,
];
