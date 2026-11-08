import { round2, SOURCE_LABELS } from "@/lib/ledger/postings";
import { ownerScopedLines, ownershipIndex, pctHistory, shareLabel } from "@/lib/ledger/ownership";
import { ownerStatement, ownerStatementMonths } from "@/lib/reports/ledger_math";
import { meta, rowOf, rowsIn, rowsOf, str, todayISO } from "./http";
import { accountIndex, ownerLines } from "./ledger";
import { listDocumentsFor, logPortalActivity } from "./common";

// Server-only data for the owner portal: the owner's properties (via
// property_owners), occupancy + rent roll, monthly statements and distributions
// from the general ledger, documents, and work-order approvals.

const OCCUPIED = ["Occupied", "Notice"];
const LIVE_LEASE = ["Active", "Expiring soon", "Month-to-month", "Notice given"];

export const ownerPermissions = (ctx) => {
  const m = ctx.partyMeta;
  return {
    statements: m.portalShowStatements !== false,
    workOrders: m.portalShowWorkOrders !== false,
    documents: m.portalShowDocuments !== false,
    approve: m.portalApproveWork !== false,
  };
};

// Current ownership rows → [{ propertyId, pct }].
export async function ownedProperties(ctx) {
  const rows = await rowsOf(
    ctx.admin.from("property_owners").select("*").eq("owner_id", ctx.party.id).is("deleted_at", null),
    "property_owners",
  );
  const today = todayISO();
  const live = rows.filter((r) => (!r.starts_on || r.starts_on <= today) && (!r.ends_on || r.ends_on >= today));
  const byProperty = new Map();
  for (const r of live.length ? live : rows) {
    const pct = Number(r.ownership_pct ?? 100) || 100;
    byProperty.set(r.property_id, Math.min(100, (byProperty.get(r.property_id) || 0) + pct));
  }
  return [...byProperty.entries()].map(([propertyId, pct]) => ({ propertyId, pct }));
}

export async function ownerPortfolio(ctx) {
  const owned = await ownedProperties(ctx);
  const ids = owned.map((o) => o.propertyId);
  const [properties, units, leases, workOrders] = await Promise.all([
    rowsIn(ctx.admin, "properties", "id", ids, "owner.properties"),
    rowsIn(ctx.admin, "units", "property_id", ids, "owner.units"),
    rowsIn(ctx.admin, "leases", "property_id", ids, "owner.leases"),
    rowsIn(ctx.admin, "work_orders", "property_id", ids, "owner.work_orders"),
  ]);
  const pctOf = new Map(owned.map((o) => [o.propertyId, o.pct]));
  const liveLeaseByUnit = new Map();
  for (const l of leases) if (l.unit_id && LIVE_LEASE.includes(l.status)) liveLeaseByUnit.set(l.unit_id, l);

  const summaries = properties
    .map((p) => {
      const pu = units.filter((u) => u.property_id === p.id);
      const occupied = pu.filter((u) => OCCUPIED.includes(u.status) || liveLeaseByUnit.has(u.id));
      const rent = occupied.reduce((s, u) => s + Number(liveLeaseByUnit.get(u.id)?.rent ?? u.rent ?? 0), 0);
      const market = pu.reduce((s, u) => s + Number(u.rent || 0), 0);
      return {
        id: p.id,
        name: p.name || "Property",
        address: [p.address, p.city, p.state].filter(Boolean).join(", "),
        type: p.type || "",
        coverUrl: p.cover_url || "",
        ownershipPct: pctOf.get(p.id) || 100,
        units: pu.length || Number(p.unit_count || 0),
        occupied: occupied.length,
        occupancy: pu.length ? Math.round((occupied.length / pu.length) * 100) : 0,
        scheduledRent: round2(rent),
        marketRent: round2(market),
        openWorkOrders: workOrders.filter((w) => w.property_id === p.id && !["Completed", "Cancelled", "Converted", "Rejected"].includes(w.status)).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const rentRoll = units
    .map((u) => {
      const lease = liveLeaseByUnit.get(u.id);
      const prop = properties.find((p) => p.id === u.property_id);
      return {
        id: u.id,
        propertyId: u.property_id,
        propertyName: prop?.name || "",
        unit: u.label || "",
        status: lease ? (u.status === "Notice" ? "Notice" : "Occupied") : u.status || "Vacant",
        resident: lease?.tenant_name || u.occupant_name || "",
        rent: Number(lease?.rent ?? u.rent ?? 0),
        leaseEnd: lease?.term_end || u.lease_end || "",
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
      };
    })
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName) || String(a.unit).localeCompare(String(b.unit), undefined, { numeric: true }));

  return { owned, properties: summaries, rentRoll };
}

// --- Statements -------------------------------------------------------------------

// Every ownership row this owner has had, at any date: statements cover past holdings too.
const ownershipRows = (ctx) =>
  rowsOf(ctx.admin.from("property_owners").select("*").eq("owner_id", ctx.party.id).is("deleted_at", null), "property_owners");

const monthEnd = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// Staff report bucket label → portal group kind; income and contributions are money in.
const KIND = { Income: "income", Expense: "expense", "Management fee": "fee", Distribution: "distribution", Contribution: "contribution" };
const MONEY_IN = new Set(["income", "contribution"]);

// The owner's share of each line by the ownership in force on its date (CORE-08), run through the same
// statement math as the staff Owner Statements report so both show the same figures.
export async function ownerStatements(ctx, month) {
  const ownerId = ctx.party.id;
  const rows = await ownershipRows(ctx);
  const ownership = ownershipIndex(rows);
  const propertyIds = [...ownership.byProperty.keys()];
  const [lines, idx, properties] = await Promise.all([
    ownerLines(ctx.admin, ownerId, propertyIds),
    accountIndex(ctx.admin, ctx.projectId),
    rowsIn(ctx.admin, "properties", "id", propertyIds, "owner.properties"),
  ]);
  const propName = new Map(properties.map((p) => [p.id, p.name || "Property"]));
  const scoped = ownerScopedLines(lines, ownerId, ownership);
  const range = { from: `${month}-01`, to: monthEnd(month) };
  const st = ownerStatement(scoped, idx, range);
  const t = st.totals;

  // Properties held during the month or with activity in it, each with "Your share".
  const held = (ownership.byOwner.get(ownerId) || [])
    .filter((r) => (!r.startsOn || r.startsOn <= range.to) && (!r.endsOn || r.endsOn >= range.from))
    .map((r) => r.propertyId);
  const ids = [...new Set([...held, ...st.byProperty.map((r) => r.propertyId).filter(Boolean)])];
  const byProperty = ids
    .map((pid) => {
      const r = st.byProperty.find((x) => x.propertyId === pid) || { income: 0, expenses: 0, fees: 0, net: 0 };
      return { id: pid, name: propName.get(pid) || "Property", share: shareLabel(pctHistory(ownership, pid, ownerId, range)), income: r.income, expenses: r.expenses, fees: r.fees, net: r.net };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Group the month's lines by account for the statement body (amounts positive in their bucket's direction).
  const groups = new Map();
  const lineById = new Map(scoped.map((l) => [l.id, l]));
  for (const d of st.detail) {
    const kind = KIND[d.kind];
    if (!kind) continue;
    const line = lineById.get(d.id);
    const key = `${kind}:${d.account}`;
    const g = groups.get(key) || { key, kind, account: line ? idx.byId.get(line.glAccountId)?.name || d.account : d.account, total: 0, lines: [] };
    const amount = MONEY_IN.has(kind) ? d.amount : -d.amount;
    g.total = round2(g.total + amount);
    g.lines.push({ id: d.id, date: d.date, memo: d.memo || SOURCE_LABELS[line?.entry?.sourceType] || "", propertyName: propName.get(d.propertyId) || "", amount: round2(amount) });
    groups.set(key, g);
  }

  // Payouts to this owner (voided ones and their reversals left out).
  const distributions = new Map();
  for (const l of scoped) {
    if (idx.byId.get(l.glAccountId)?.subtype !== "distribution" || l.entry?.status === "void" || l.entry?.reversalOf) continue;
    const d = distributions.get(l.entryId) || { id: l.entryId, date: l.date, memo: l.entry?.memo || "Owner distribution", amount: 0, propertyName: propName.get(l.propertyId) || "" };
    d.amount += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    distributions.set(l.entryId, d);
  }

  return {
    months: ownerStatementMonths(scoped, idx),
    month,
    statement: { month, income: t.income, expenses: t.expenses, fees: t.fees, net: t.noi, distributions: t.distributions, contributions: t.contributions, opening: t.opening, closing: t.closing },
    properties: byProperty,
    groups: [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.total - a.total),
    distributions: [...distributions.values()]
      .map((d) => ({ ...d, amount: round2(d.amount) }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    payout: { method: ctx.party.payout_method || "", feePct: Number(ctx.party.management_fee_pct || 0) },
  };
}

export async function ownerDocuments(ctx) {
  const owned = await ownedProperties(ctx);
  return listDocumentsFor(ctx.admin, [
    { type: "owner", ids: [ctx.party.id], label: "Your file" },
    { type: "property", ids: owned.map((o) => o.propertyId), label: "Property" },
  ]);
}

// --- Work orders & approvals -----------------------------------------------------------

const approvalAmount = (w) => {
  const m = meta(w);
  return Number(m.approvalAmount) || Number(w.total_cost) || Number(m.estimateAmount) || 0;
};

function workOrderView(w, propName) {
  const m = meta(w);
  return {
    id: w.id,
    name: w.name || "Work order",
    kind: w.kind,
    status: w.status || "Open",
    priority: w.priority || "Medium",
    category: w.category || "",
    propertyName: propName.get(w.property_id) || w.property_label || "",
    description: m.description || "",
    vendorName: w.vendor_name || "",
    scheduledDate: w.scheduled_date || "",
    totalCost: Number(w.total_cost || 0),
    createdAt: w.created_at,
    photos: Array.isArray(m.photos) ? m.photos : [],
    approval: m.approvalStatus
      ? {
          status: m.approvalStatus,
          amount: approvalAmount(w),
          requestedAt: m.approvalRequestedAt || "",
          requestedBy: m.approvalRequestedBy || "",
          dueDate: m.approvalDueDate || "",
          decidedAt: m.approvalDecisionAt || "",
          decidedBy: m.approvalDecisionBy || "",
          decisionNotes: m.approvalDecisionNotes || "",
          notes: m.approvalNotes || "",
          history: Array.isArray(m.approvals) ? m.approvals : [],
        }
      : null,
  };
}

export async function ownerWorkOrders(ctx) {
  const owned = await ownedProperties(ctx);
  const ids = owned.map((o) => o.propertyId);
  const [rows, properties] = await Promise.all([
    rowsIn(ctx.admin, "work_orders", "property_id", ids, "owner.work_orders"),
    rowsIn(ctx.admin, "properties", "id", ids, "owner.properties"),
  ]);
  const propName = new Map(properties.map((p) => [p.id, p.name || "Property"]));
  return rows
    .filter((w) => w.status !== "Draft")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((w) => workOrderView(w, propName));
}

// Approve / reject a pending approval — same metadata shape as the staff wo_actions.
export async function decideApproval(ctx, id, { decision, notes }) {
  if (!["Approved", "Rejected"].includes(decision)) return { ok: false, error: "Choose approve or reject." };
  const reason = str(notes, 1000);
  if (decision === "Rejected" && !reason) return { ok: false, error: "Add a reason for rejecting." };
  const owned = await ownedProperties(ctx);
  const w = await rowOf(ctx.admin.from("work_orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle(), "owner.wo");
  if (!w || !owned.some((o) => o.propertyId === w.property_id)) return { ok: false, status: 404, error: "That work order isn't available." };
  const m = meta(w);
  if (m.approvalStatus !== "Pending") return { ok: false, error: "This approval has already been decided." };

  const at = new Date().toISOString();
  const by = `${ctx.party.name || "Owner"} (owner portal)`;
  const metadata = {
    ...m,
    approvalStatus: decision,
    approvalDecisionAt: at,
    approvalDecisionBy: by,
    approvalDecisionNotes: reason,
    approvals: [
      { id: crypto.randomUUID(), action: decision, by, at, amount: approvalAmount(w), notes: reason, source: "owner_portal" },
      ...(Array.isArray(m.approvals) ? m.approvals : []),
    ],
  };
  const patch = { metadata };
  // An approved job that was waiting on approval goes back to Open.
  if (decision === "Approved" && w.status === "On hold" && m.holdReason === "Waiting on approval") {
    patch.status = "Open";
    metadata.statusHistory = [
      { id: crypto.randomUUID(), status: "Open", from: w.status, at, by, note: "Owner approved" },
      ...(Array.isArray(m.statusHistory) ? m.statusHistory : []),
    ].slice(0, 100);
  }
  const { error } = await ctx.admin.from("work_orders").update(patch).eq("id", w.id);
  if (error) {
    console.error("[portal.owner.approve]", error.message);
    return { ok: false, error: "We couldn't record your decision." };
  }
  await logPortalActivity(ctx, `${decision === "Approved" ? "Approved" : "Rejected"} work order: ${w.name}`, {
    ownerType: "workorder",
    ownerId: w.id,
  });
  return { ok: true };
}
