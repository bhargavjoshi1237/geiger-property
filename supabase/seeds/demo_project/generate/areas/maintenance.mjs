// Maintenance area for the demo project: enriches the playground's work orders,
// preventive schedules, unit turns, stock and attachments with the link columns
// and metadata the editors and portals read, adds a year of maintenance history,
// and seeds amenity bookings and community events. Every preventive schedule is
// manual-only (autoGenerate off), paused or ended, so the daily
// preventive-work-orders job never creates anything for this project.
import { lineItemTotals } from "@/components/internal/screens/maintenance/shared";
import { advanceDue, isOccurrenceDue, parseDay, toDay } from "@/lib/maintenance/pm";

// Id groups owned by this area (90–99); sandbox maintenance groups are 40–45.
const G = { workOrder: 90, pmSchedule: 91, assignment: 92, inventory: 93, attachment: 94, reservation: 95, event: 96, unitTurn: 97 };
const SB = { workOrder: 40, pmSchedule: 41, unitTurn: 42, inventory: 43, assignment: 44, attachment: 45, move: 31, inspection: 32 };

let C; // build ctx, set by apply()

// ---- Helpers -----------------------------------------------------------------

const day = (n) => C.daysFromNow(n);

// Timestamp n days from now at a decimal local hour; "today" stamps never land in the future.
function at(n, h = 10) {
  const t = new Date(C.isoDaysFromNow(n, Math.floor(h)));
  t.setMinutes(Math.round((h % 1) * 60));
  if (n <= 0 && t.getTime() > Date.now()) return new Date(Date.now() - (24 - h) * 600000).toISOString();
  return t.toISOString();
}

const unitAt = (label) => C.core.UNITS.find((u) => u.label === label);
const propertyNamed = (name) => C.core.PROPERTIES.find((p) => p.name === name);
const tenantNamed = (name) => C.core.TENANTS.find((t) => t.name === name);
const residentOf = (u) => C.core.TENANTS.find((t) => t.unitId === u.id && ["Current", "Late"].includes(t.status));
const leaseOf = (t) => C.core.LEASES.find((l) => l.tenantId === t.id);
const vendorOf = (n) => C.core.VENDORS[n - 1];
const amenityNamed = (name) => C.core.AMENITIES.find((a) => a.name === name);

const sbWo = (n) => C.sid(SB.workOrder, n);
const wo = (n) => C.sid(G.workOrder, n);
const pmId = (n) => (n <= 10 ? C.sid(SB.pmSchedule, n) : C.sid(G.pmSchedule, n));
const turnId = (n) => (n <= 8 ? C.sid(SB.unitTurn, n) : C.sid(G.unitTurn, n));
const invId = (n) => (n <= 12 ? C.sid(SB.inventory, n) : C.sid(G.inventory, n));
const moveId = (n) => C.sid(SB.move, n);
const inspectionId = (n) => C.sid(SB.inspection, n);

// Staff and outside parties the maintenance story uses.
const MANAGER = { "The Marlowe": "Alex Rivera", "Cascade Lofts": "Alex Rivera" };
const managerOf = (propertyName) => MANAGER[propertyName] || "Jordan Lee";
const IN_HOUSE = "Ben Alvarez (in-house)";
const IN_HOUSE_PHONE = "(253) 555-0106";
const TECH = {
  1: ["Carlos Mendes", "(206) 555-0110"],
  2: ["Ben Adeyemi", "(206) 555-0133"],
  3: ["Jin Park", "(503) 555-0176"],
  4: ["Luis Herrera", "(425) 555-0191"],
  5: ["Nina Brooks", "(206) 555-0158"],
  6: ["Diego Ruiz", "(253) 555-0122"],
};
// Owner-side approver per property: [contact, email, owner record name].
const APPROVER = {
  "The Marlowe": ["Rebecca Lin (Northwind Holdings)", "rebecca.lin@northwind.example", "Northwind Holdings LLC"],
  "Cascade Lofts": ["Rebecca Lin (Northwind Holdings)", "rebecca.lin@northwind.example", "Northwind Holdings LLC"],
  "Pinecrest Commons": ["Anne Walsh (Evergreen Family Trust)", "awalsh@evergreentrust.example", "Evergreen Family Trust"],
  "Alder Court Townhomes": ["Marisol Tran (Alder Court Partners)", "finance@aldercourt.example", "Alder Court Partners LP"],
  "14 Birchwood Lane": ["Jonathan Reyes", "jreyes@mail.example", "Jonathan Reyes"],
};
const CHANNEL_NOTE = {
  Phone: "a phone call",
  Email: "an email",
  Text: "a text message",
  "In person": "an office visit",
  "After-hours line": "the after-hours line",
};

// Metadata list rows ({ id, …fields }) with stable ids.
const list = (prefix, rows) => rows.map((r, i) => ({ id: `${prefix}-${i + 1}`, ...r }));
const photos = (prefix, labels) => list(prefix, labels.map((label) => ({ label, url: "" })));
const labelled = (prefix, labels) => list(prefix, labels.map((label) => ({ label })));

// Work-order location columns from a unit label (resident, a named tenant, or null) or a property name.
function place(label, tenant) {
  const u = unitAt(label);
  if (u) {
    const t = tenant === null ? null : tenant ? tenantNamed(tenant) : residentOf(u);
    return {
      propertyName: u.propertyName,
      tenant: t || null,
      cols: {
        unit_id: u.id,
        property_id: u.propertyId,
        property_label: u.display,
        tenant_id: t?.id ?? null,
        tenant_name: t?.name ?? "",
        lease_id: t ? leaseOf(t)?.id ?? null : null,
      },
    };
  }
  const p = propertyNamed(label);
  return {
    propertyName: p.name,
    tenant: null,
    cols: { unit_id: null, property_id: p.id, property_label: p.name, tenant_id: null, tenant_name: "", lease_id: null },
  };
}

// [type, description, qty, rate, { markup, billable }] → metadata.lineItems + the cost columns.
function costs(prefix, lines = []) {
  const lineItems = lines.map(([type, description, qty, rate, o = {}], i) => ({
    id: `${prefix}-li${i + 1}`,
    type,
    description,
    qty,
    rate,
    markupPct: o.markup || 0,
    billableToTenant: Boolean(o.billable),
  }));
  const t = lineItemTotals(lineItems);
  return {
    total: t.totalCost,
    cols: { labor_cost: t.laborCost, material_cost: t.materialCost, total_cost: t.totalCost },
    meta: lineItems.length ? { lineItems, otherCost: t.otherCost, tenantChargeback: t.tenantChargeback } : {},
    labor: lineItems.filter((li) => li.type === "labor"),
  };
}

// [[status, days, hour, by, note], …] oldest → newest → statusHistory (newest first).
function history(prefix, steps) {
  let from = "";
  const out = steps.map(([status, n, h, by, note = ""], i) => {
    const entry = { id: `${prefix}-h${i + 1}`, status, from, at: at(n, h), by, note };
    from = status;
    return entry;
  });
  return out.reverse();
}

// Inventory parts used on a job: [[inventory n, qty, deducted days | null, costed]].
function parts(prefix, rows) {
  return rows.map(([n, qty, deducted, costed = true], i) => {
    const item = C.byId("inventory_items", invId(n));
    return {
      id: `${prefix}-p${i + 1}`,
      itemId: item.id,
      name: item.name,
      sku: item.sku || "",
      qty,
      unitCost: item.unit_cost,
      deducted: deducted !== null,
      ...(deducted !== null ? { deductedAt: at(deducted, 15.5) } : {}),
      ...(costed ? { costed: true } : {}),
    };
  });
}

// Owner approval metadata (same shape the staff wizard and owner portal write).
function approvalMeta(prefix, a, propertyName, mgr, fallbackAmount) {
  const [person, contact, ownerName] = APPROVER[propertyName];
  const method = a.method || "Owner portal";
  const amount = a.amount ?? fallbackAmount;
  const rows = [{ id: `${prefix}-ap1`, action: "Requested", by: mgr, at: at(a.requested, 11), amount, notes: a.requestNote || "" }];
  const meta = {
    approvalStatus: a.status,
    approvalAmount: amount,
    approver: person,
    approverContact: contact,
    approvalMethod: method,
    approvalDueDate: day(a.dueBy ?? a.requested + 3),
    approvalRequestedAt: rows[0].at,
    approvalRequestedBy: mgr,
    approvalDecisionAt: "",
    approvalDecisionBy: "",
    approvalDecisionNotes: "",
    ...(a.emergency ? { autoApproveEmergency: true } : {}),
  };
  if (a.status !== "Pending") {
    const portal = method === "Owner portal";
    const by = portal ? `${ownerName} (owner portal)` : person;
    rows.push({ id: `${prefix}-ap2`, action: a.status, by, at: at(a.decided, 16), amount, notes: a.notes || "", ...(portal ? { source: "owner_portal" } : {}) });
    Object.assign(meta, { approvalDecisionAt: rows[1].at, approvalDecisionBy: by, approvalDecisionNotes: a.notes || "" });
  }
  meta.approvals = rows.reverse();
  return meta;
}

// Default status history for a spec (explicit `steps` win).
function autoSteps(s, { mgr, reporter, actor, assignee }) {
  const [o, h = 9] = s.opened;
  const portal = s.channel === "Resident portal";
  const intake = portal
    ? [reporter, "Submitted from the resident portal"]
    : [mgr, s.channel ? `Logged from ${CHANNEL_NOTE[s.channel] || s.channel}` : s.openNote || ""];
  if (s.kind === "request") {
    const steps = [["Submitted", o, h, ...intake]];
    const d = s.decided ?? o;
    const dh = d === o ? h + 1 : 10;
    if (s.status === "In review") steps.push(["In review", d, dh, mgr, s.note || ""]);
    else if (s.status === "Cancelled") steps.push(["Cancelled", d, dh, s.cancelBy || mgr, s.note || ""]);
    else if (s.status !== "Submitted") steps.push(["In review", d, dh, mgr, ""], [s.status, d, dh + 1.5, mgr, s.note || ""]);
    return steps;
  }
  if (s.status === "Draft") return [["Draft", o, h, mgr, ""]];
  const steps = portal
    ? [["Submitted", o, h, ...intake], ["Open", o, h + 0.5, mgr, "Converted from request"]]
    : [["Open", o, h, ...intake]];
  const sched = s.scheduled;
  if (assignee && sched != null && ["Scheduled", "In progress", "Completed"].includes(s.status)) {
    steps.push(["Scheduled", o, h + 1, mgr, `Assigned to ${assignee}`]);
  }
  const startDay = sched ?? o;
  const startH = startDay === o ? Math.min(h + 2, 22) : 8.5;
  if (["In progress", "Completed"].includes(s.status)) steps.push(["In progress", startDay, startH, actor, "Work started"]);
  if (s.status === "Completed") steps.push(["Completed", s.done, s.done === startDay ? Math.min(startH + 4, 23) : 15, actor, "Completed"]);
  if (s.status === "On hold") steps.push(["On hold", s.holdAt ?? o, (s.holdAt ?? o) === o ? h + 2 : 10, s.holdBy || mgr, [s.hold[0], s.hold[2]].filter(Boolean).join(" — ")]);
  if (s.status === "Cancelled") steps.push(["Cancelled", s.cancelAt, 11, mgr, [s.cancel, s.note].filter(Boolean).join(" — ")]);
  return steps;
}

// One work-order row from a spec (see the spec lists below).
function workOrder(s) {
  const id = s.id ?? wo(s.n);
  const p = s.prefix ?? `w${s.n}`;
  const kind = s.kind ?? "work_order";
  const loc = place(s.at, s.tenant);
  const v = s.vendor ? vendorOf(s.vendor) : null;
  const tech = v ? TECH[s.vendor] : s.tech ? [s.tech, s.techPhone ?? IN_HOUSE_PHONE] : null;
  const mgr = managerOf(loc.propertyName);
  const [o, h = 9] = s.opened;
  const reporter = s.reportedBy ?? (s.source === "tenant" || !s.source ? loc.tenant?.name : null) ?? mgr;
  const money = costs(p, s.lines);
  const actor = v && (s.dispatch ?? "Vendor portal") === "Vendor portal" ? `${v.name} (vendor portal)` : tech ? tech[0].replace(" (in-house)", "") : mgr;
  const steps = s.steps ?? autoSteps({ ...s, kind }, { mgr, reporter, actor, assignee: v?.name ?? tech?.[0] });
  const statusHistory = history(p, steps);

  const meta = {
    source: s.source ?? "tenant",
    reportedBy: reporter,
    reportedOn: day(o),
    ...(s.channel ? { channel: s.channel } : {}),
    subcategory: s.sub ?? "",
    dueDate: s.due == null ? "" : day(s.due),
    coordinator: mgr,
    ...money.meta,
  };
  if (loc.tenant) {
    Object.assign(meta, {
      contactPhone: loc.tenant.phone,
      contactMethod: s.channel === "Email" ? "Email" : s.channel === "Text" ? "Text" : "Phone call",
      entryPermission: "call_first",
      shareWithTenant: true,
      notifyTenantOnStatus: true,
      showScheduleToTenant: s.scheduled != null,
    });
  }
  if (tech) meta.technicianPhone = tech[1];
  if (s.window) [meta.windowStart, meta.windowEnd] = s.window;
  if (v) {
    const acceptance = s.acceptance ?? "Accepted";
    const dispatch = s.dispatch ?? "Vendor portal";
    // Accepted half an hour after dispatch (the first Scheduled step), else after intake.
    const assigned = statusHistory.filter((x) => x.status === "Scheduled").pop()?.at;
    const accAt = assigned ? new Date(Math.min(Date.parse(assigned) + 1800000, Date.now() - 60000)).toISOString() : at(o, h + 3);
    const by = `${v.name} (vendor portal)`;
    Object.assign(meta, { dispatchMethod: dispatch, dispatchedOn: day(o), vendorAccepted: acceptance === "Accepted", vendorAcceptance: acceptance });
    if (acceptance) meta.vendorAcceptanceAt = accAt;
    const notes = acceptance === "Accepted" && dispatch === "Vendor portal" ? [{ id: `${p}-vn1`, body: "Accepted the job", at: accAt, by }] : [];
    (s.vendorNotes || []).forEach(([n, nh, body], i) => notes.push({ id: `${p}-vn${i + 2}`, body, at: at(n, nh), by }));
    if (notes.length) meta.vendorNotes = notes;
  }
  if (money.total > 500 || s.shareOwner) Object.assign(meta, { shareWithOwner: true, showCostsToOwner: true, notifyOwnerOnComplete: true });
  if (s.approval) Object.assign(meta, approvalMeta(p, s.approval, loc.propertyName, mgr, money.total || s.meta?.estimateAmount || 0));
  if (s.parts) meta.materialsUsed = parts(p, s.parts);
  if (s.checklist) meta.checklist = list(`${p}-c`, s.checklist.map((label) => ({ label, done: s.status === "Completed" })));
  if (money.labor.length && ["In progress", "Completed"].includes(s.status)) {
    meta.labor = list(`${p}-l`, money.labor.map((li) => ({ label: li.description, hours: String(li.qty) })));
  }
  const started = statusHistory.filter((x) => x.status === "In progress").pop();
  if (started) meta.startedAt = started.at;
  if (s.status === "On hold") Object.assign(meta, { holdReason: s.hold[0], holdUntil: s.hold[1] == null ? "" : day(s.hold[1]) });
  if (s.status === "Cancelled") Object.assign(meta, { cancelReason: s.cancel, cancelledOn: day(s.cancelAt ?? s.decided ?? o) });
  if (s.status === "Completed") {
    Object.assign(meta, {
      completedDate: day(s.done),
      resolution: s.resolution || "",
      actualHours: s.hours ?? money.labor.reduce((t, li) => t + Number(li.qty), 0),
      rootCause: s.cause || "Normal wear and tear",
      signedOffBy: mgr,
      workVerified: true,
      tenantPresent: Boolean(loc.tenant) && s.present !== false,
      warrantyDays: s.warranty ?? (v ? 90 : 0),
      followUpNeeded: false,
    });
    if (v && actor.endsWith("(vendor portal)")) Object.assign(meta, { completionNotes: s.resolution || "", vendorCompletedAt: statusHistory[0].at });
  }
  if (s.rating && loc.tenant) {
    const [rating, comment = "", response = ""] = s.rating;
    Object.assign(meta, {
      feedbackRequested: true,
      feedbackRequestedOn: day(s.done),
      tenantRating: String(rating),
      feedbackDate: day(s.done + 1),
      feedbackChannel: "Portal message",
      wouldRecommendVendor: rating >= 4,
      issueResolved: rating >= 3,
      feedbackComment: comment,
      ...(response ? { feedbackResponse: response } : {}),
    });
  }
  meta.statusHistory = statusHistory;
  Object.assign(meta, s.meta || {});

  return {
    id,
    name: s.name,
    kind,
    is_field: Boolean(s.field),
    ...loc.cols,
    category: s.category,
    priority: s.priority ?? "Medium",
    status: s.status,
    vendor_id: v?.id ?? null,
    vendor_name: v?.name ?? "",
    technician: tech?.[0] ?? "",
    scheduled_date: s.scheduled == null ? null : day(s.scheduled),
    ...money.cols,
    pm_schedule_id: s.pm ?? null,
    pm_due_date: s.pmDue ?? null,
    unit_turn_id: s.turn ?? null,
    inspection_id: s.inspection ?? null,
    created_at: at(o, h),
    updated_at: statusHistory[0]?.at ?? at(o, h),
    metadata: meta,
  };
}

// ---- Inventory & parts -----------------------------------------------------------

const SUPPLIER = "Harborline Trade Supply";
const stockStatus = (qty, reorder) => (qty <= 0 ? "Out of stock" : qty <= reorder ? "Low" : "In stock");

// Movement rows: [type, qty, days, label, work order id?, extra].
const moves = (prefix, rows) =>
  rows.map(([type, qty, n, label, workOrderId, extra = {}], i) => ({
    id: `${prefix}-m${i + 1}`,
    type,
    qty,
    date: day(n),
    label,
    ...(workOrderId ? { workOrderId, workOrderName: label } : {}),
    by: type === "restock" ? "Ben Alvarez" : extra.by || "Ben Alvarez",
    ...extra,
  }));

// Stock metadata for the twelve playground items, keyed by item n.
function inventoryPatches() {
  return {
    1: { uom: "Each", reorderQty: 48, maxLevel: 96, binLocation: "Rack A2", lastCountedOn: day(-30), manufacturer: "AirPure", supplierPartNo: "HTS-AF16251-M8", leadTimeDays: 5, lastPrice: 9.5, compatibleWith: "Tower A studio air handlers",
      movements: moves("inv1", [
        ["restock", 48, -30, "Case order received", null, { reference: "PO-2214", unitCost: 9.5 }],
        ["usage", -16, -38, "Replace HVAC filters — Tower A", sbWo(11)],
        ["restock", 24, -100, "Restock", null, { reference: "PO-2160", unitCost: 9.25 }],
        ["usage", -16, -131, "Replace HVAC filters — Tower A", wo(201)],
      ]) },
    2: { uom: "Each", reorderQty: 36, maxLevel: 48, binLocation: "Shelf N-3", lastCountedOn: day(-30), manufacturer: "AirPure", supplierPartNo: "HTS-AF20201-M8", leadTimeDays: 5, lastPrice: 8.75,
      onOrderQty: 36, lastOrderedOn: day(-2), expectedOn: day(3), poNumber: "PO-2231", purchaseNotes: "Covers the Pinecrest quarterly HVAC service in November.",
      movements: moves("inv2", [
        ["usage", -2, -38, "Replace HVAC filters — Tower A", sbWo(11)],
        ["usage", -12, -39, "Quarterly HVAC service — Pinecrest Commons", wo(215)],
        ["restock", 24, -95, "Restock", null, { reference: "PO-2171", unitCost: 8.75 }],
        ["usage", -12, -131, "Quarterly HVAC service — Pinecrest Commons", wo(214)],
        ["usage", -2, -131, "Replace HVAC filters — Tower A", wo(201)],
      ]) },
    3: { uom: "Each", reorderQty: 12, maxLevel: 18, binLocation: "Bin E-4", lastCountedOn: day(-4), manufacturer: "Leviton", supplierPartNo: "HTS-GFNT2-W", leadTimeDays: 7, lastPrice: 21.9,
      onOrderQty: 12, lastOrderedOn: day(-4), expectedOn: day(2), poNumber: "PO-2228",
      purchaseNotes: "Backordered at Harborline — two are earmarked for the L-302 kitchen repair (on hold).",
      movements: moves("inv3", [
        ["usage", -2, -25, "Tower B laundry room outlets"],
        ["usage", -1, -48, "A-301 bathroom GFCI"],
        ["restock", 6, -120, "Restock", null, { reference: "PO-2133", unitCost: 21.5 }],
      ]) },
    4: { uom: "Pack", reorderQty: 24, maxLevel: 48, binLocation: "Bin E-1", lastCountedOn: day(-30), manufacturer: "Cree", leadTimeDays: 3, lastPrice: 7.8,
      movements: moves("inv4", [
        ["usage", -6, -20, "Common-area relamp — Tower A corridors"],
        ["restock", 24, -60, "Restock", null, { reference: "PO-2188", unitCost: 7.8 }],
      ]) },
    5: { uom: "Each", reorderQty: 6, maxLevel: 10, binLocation: "Bin P-2", manufacturer: "Moen", supplierPartNo: "HTS-1225", compatibleWith: "Moen single-handle kitchen & bath faucets", leadTimeDays: 4, lastPrice: 18.4,
      movements: moves("inv5", [
        ["usage", -1, -150, "Replace kitchen faucet cartridge — S-101", wo(40)],
        ["restock", 6, -165, "Restock", null, { reference: "PO-2101", unitCost: 18.4 }],
      ]) },
    6: { uom: "Each", reorderQty: 12, maxLevel: 12, binLocation: "Bin P-5", manufacturer: "Fluidmaster", leadTimeDays: 3, lastPrice: 6.25,
      movements: moves("inv6", [
        ["usage", -1, -43, "TH-4 turn — toilet reset"],
        ["usage", -2, -112, "A-301 turn — toilet resets"],
        ["restock", 6, -140, "Restock", null, { reference: "PO-2120", unitCost: 6.25 }],
      ]) },
    7: { uom: "Each", reorderQty: 4, maxLevel: 4, binLocation: "Shelf B1-6", manufacturer: "Whirlpool", supplierPartNo: "W10872845", compatibleWith: "Whirlpool / KitchenAid dishwashers", leadTimeDays: 6, lastPrice: 16,
      movements: moves("inv7", [
        ["usage", -1, -32, "Dishwasher repair — N-102", wo(29), { by: "Luis Herrera (Summit)" }],
        ["usage", -1, -43, "Dishwasher not draining — A-102", wo(61), { by: "Luis Herrera (Summit)" }],
      ]) },
    8: { uom: "Each", reorderQty: 2, maxLevel: 3, binLocation: "Garage 4 · shelf 2", manufacturer: "InSinkErator", supplierPartNo: "BADGER-5", leadTimeDays: 2, lastPrice: 129,
      movements: moves("inv8", [["restock", 2, -100, "Restock", null, { reference: "PO-2158", unitCost: 129 }]]) },
    9: { uom: "Each", reorderQty: 6, maxLevel: 8, binLocation: "Garage 4 · paint rack", manufacturer: "Sherwin-Williams", supplierPartNo: "SW-HW-EGG-5", leadTimeDays: 2, lastPrice: 165, hazardous: false,
      description: "House colour for every unit turn. 5-gallon buckets.",
      movements: moves("inv9", [
        ["usage", -1, -3, "Interior paint — B-201", wo(44)],
        ["usage", -2, -51, "Garage drywall patch & interior paint — TH-4", wo(45), { by: "Ben Alvarez (supplied to Sound Painting)" }],
        ["restock", 6, -50, "Restock", null, { reference: "PO-2196", unitCost: 165 }],
        ["usage", -1, -112, "Interior paint — A-301", wo(56)],
      ]) },
    10: { uom: "Each", reorderQty: 24, maxLevel: 30, binLocation: "Bin S-1", manufacturer: "Kidde", supplierPartNo: "KID-P4010DCS-W", leadTimeDays: 10, lastPrice: 28.5,
      onOrderQty: 24, lastOrderedOn: day(-6), expectedOn: day(9), poNumber: "PO-2236",
      purchaseNotes: "For the Pinecrest smoke & CO test — that schedule is paused until these arrive.",
      movements: moves("inv10", [
        ["usage", -3, -84, "Replace smoke detectors — L-302", wo(57)],
        ["usage", -4, -180, "Pinecrest spring detector swaps"],
        ["restock", 8, -200, "Restock", null, { reference: "PO-2084", unitCost: 27.9 }],
      ]) },
    11: { uom: "Each", reorderQty: 10, maxLevel: 20, binLocation: "Key cabinet drawer 2", manufacturer: "Schlage", compatibleWith: "Schlage SC1 keyway deadbolts", leadTimeDays: 5, lastPrice: 12.5,
      movements: moves("inv11", [
        ["usage", -2, -9, "B-201 turn — re-key"],
        ["usage", -1, -18, "N-201 turn — re-key"],
        ["usage", -2, -40, "B-101 turn — re-key"],
        ["restock", 10, -90, "Restock", null, { reference: "PO-2165", unitCost: 12.5 }],
      ]) },
    12: { uom: "Gallon", reorderQty: 6, maxLevel: 12, binLocation: "Janitor closet N1", manufacturer: "Simple Green", leadTimeDays: 2, lastPrice: 22, hazardous: true,
      movements: moves("inv12", [
        ["usage", -2, -18, "Common-area deep clean — Pinecrest Commons", wo(210)],
        ["restock", 6, -60, "Restock", null, { reference: "PO-2189", unitCost: 22 }],
      ]) },
  };
}

// New stock items: [n, name, sku, category, location, qty, reorder, unit cost, metadata].
function newInventorySpecs() {
  return [
    [13, "Braided toilet supply line 3/8\" × 12\"", "PLB-SUP12", "Plumbing", "Pinecrest · South Building storage", 9, 6, 8.9, {
      uom: "Each", reorderQty: 12, binLocation: "Bin P-3", manufacturer: "Fluidmaster", leadTimeDays: 3, lastPrice: 8.9,
      movements: moves("inv13", [
        ["usage", -1, -4, "Burst supply line — ceiling water damage", sbWo(5), { by: "Carlos Mendes (Rainier)" }],
        ["restock", 10, -70, "Restock", null, { reference: "PO-2179", unitCost: 8.9 }],
      ]) }],
    [14, "Universal hot-surface furnace igniter", "HVC-IGN-U", "HVAC", "Alder Court · Garage 4 storage", 1, 2, 38, {
      uom: "Each", reorderQty: 4, binLocation: "Garage 4 · shelf 1", manufacturer: "White-Rodgers", compatibleWith: "Carrier / Bryant / Lennox gas furnaces", leadTimeDays: 4, lastPrice: 38,
      movements: moves("inv14", [
        ["usage", -1, -362, "Furnace tune-up before winter", wo(204)],
        ["restock", 2, -380, "Restock", null, { reference: "PO-1987", unitCost: 36 }],
      ]) }],
    [15, "Drywall sheet 1/2\" 4×8", "GEN-DW48", "Other", "Alder Court · Garage 4 storage", 6, 4, 14.5, {
      uom: "Each", reorderQty: 10, binLocation: "Garage 4 · wall rack", leadTimeDays: 2, lastPrice: 14.5,
      movements: moves("inv15", [
        ["usage", -4, -51, "Garage drywall patch & interior paint — TH-4", wo(45), { by: "Ben Alvarez (supplied to Sound Painting)" }],
        ["restock", 10, -60, "Restock", null, { reference: "PO-2186", unitCost: 14.5 }],
      ]) }],
    [16, "Ice melt, pet-safe (50 lb bag)", "SAF-ICE50", "Safety", "Alder Court · Garage 4 storage", 12, 10, 15, {
      uom: "Each", reorderQty: 20, maxLevel: 30, binLocation: "Garage 4 · floor pallet", leadTimeDays: 3, lastPrice: 15,
      description: "Winter stock for Alder Court walks and the Pinecrest stairs.",
      movements: moves("inv16", [
        ["restock", 12, -5, "Winter stock", null, { reference: "PO-2240", unitCost: 15 }],
        ["usage", -8, -298, "Snow & ice removal — Alder Court", wo(34)],
      ]) }],
    [17, "Commercial door closer, grade 1", "HDW-CLS1", "Hardware", "The Marlowe · B1 maintenance room", 1, 1, 96, {
      uom: "Each", reorderQty: 2, binLocation: "Shelf B1-2", manufacturer: "LCN", compatibleWith: "Lobby and stairwell doors", leadTimeDays: 7, lastPrice: 96,
      movements: moves("inv17", [["usage", -1, -66, "Tower A stairwell door closer"]]) }],
    [18, "Range igniter + spark module kit", "APL-RIGN", "Appliance", "The Marlowe · B1 maintenance room", 0, 1, 64, {
      uom: "Each", reorderQty: 2, binLocation: "Shelf B1-6", manufacturer: "GE", compatibleWith: "GE JB645 gas ranges", leadTimeDays: 6, lastPrice: 64,
      movements: moves("inv18", [["usage", -1, -53, "Range igniter replacement — B-101", wo(42), { by: "Luis Herrera (Summit)" }]]) }],
  ];
}

function seedInventory() {
  const rows = C.rows("inventory_items");
  const patches = inventoryPatches();
  for (const row of rows) {
    const n = Number(row.id.slice(-8));
    const extra = patches[n];
    if (!extra) continue;
    const { movements, ...rest } = extra;
    row.metadata = { ...row.metadata, ...rest, supplier: row.metadata?.supplier || SUPPLIER, movements };
    row.status = stockStatus(row.quantity, row.reorder_level);
  }
  for (const [n, name, sku, category, location, quantity, reorder, unitCost, metadata] of newInventorySpecs()) {
    rows.push({
      id: invId(n), name, sku, category, location, quantity, reorder_level: reorder, unit_cost: unitCost,
      status: stockStatus(quantity, reorder), metadata: { supplier: SUPPLIER, ...metadata },
    });
  }
}

// ---- Playground work orders ------------------------------------------------------

// Extend a sandbox work order: columns, metadata, line items (must match its costs) and history.
function patchWorkOrder(n, { cols = {}, meta = {}, lines, steps, parts: used, approval, reprice = false }) {
  const row = C.byId("work_orders", sbWo(n));
  const p = `sw${n}`;
  Object.assign(row, cols);
  const loc = row.unit_id ? C.core.UNITS.find((u) => u.id === row.unit_id) : null;
  const propertyName = loc?.propertyName ?? C.core.PROPERTIES.find((x) => x.id === row.property_id)?.name;
  const mgr = managerOf(propertyName);
  const metadata = { ...row.metadata, coordinator: mgr };
  if (lines) {
    const money = costs(p, lines);
    if (!reprice && money.total !== Number(row.total_cost)) console.warn(`maintenance: line items for "${row.name}" total ${money.total}, row says ${row.total_cost}`);
    Object.assign(row, money.cols);
    Object.assign(metadata, money.meta);
  }
  if (used) metadata.materialsUsed = parts(p, used);
  if (approval) Object.assign(metadata, approvalMeta(p, approval, propertyName, mgr, Number(row.total_cost)));
  if (steps) {
    metadata.statusHistory = history(p, steps);
    row.updated_at = metadata.statusHistory[0].at;
    const ip = metadata.statusHistory.filter((x) => x.status === "In progress").pop();
    if (ip) metadata.startedAt = ip.at;
  }
  if (row.tenant_id) {
    const t = C.core.TENANTS.find((x) => x.id === row.tenant_id);
    row.lease_id = leaseOf(t)?.id ?? null;
    Object.assign(metadata, { contactPhone: t.phone, shareWithTenant: true, notifyTenantOnStatus: true, showScheduleToTenant: Boolean(row.scheduled_date) });
  }
  if (metadata.completedAt && !metadata.completedDate) metadata.completedDate = metadata.completedAt;
  Object.assign(row, { metadata: { ...metadata, ...meta } });
  return row;
}

function patchPlaygroundWorkOrders() {
  const portal = (v) => `${vendorOf(v).name} (vendor portal)`;

  // 1 · TH-2 no heat — urgent tenant request dispatched to Evergreen HVAC today.
  patchWorkOrder(1, {
    cols: { created_at: at(0, 6.5) },
    steps: [
      ["Submitted", 0, 6.5, "Noah Schmidt", "Submitted from the resident portal"],
      ["Open", 0, 7, "Jordan Lee", "Converted from request — no-heat emergency"],
    ],
    parts: [[14, 1, null, false]],
    meta: {
      source: "tenant", channel: "Resident portal", reportedBy: "Noah Schmidt", reportedOn: day(0), subcategory: "No heat",
      area: "Garage", room: "Utility closet", emergency: true, slaHours: 4, tags: ["Emergency"],
      entryPermission: "present", contactMethod: "Phone call", preferredTimes: ["Afternoon"],
      asset: "Gas furnace", assetMake: "Carrier", assetModel: "59SC5A080", assetSerial: "2413A71592", underWarranty: false,
      windowStart: "13:00", windowEnd: "16:00", dispatchMethod: "Vendor portal", dispatchedOn: day(0), vendorAccepted: true,
      vendorAcceptance: "Accepted", vendorAcceptanceAt: at(0, 7.5), notToExceed: 600, estimateAmount: 320,
      vendorNotes: list("sw1-vn", [
        { body: "Accepted the job", at: at(0, 7.5), by: portal(3) },
        { body: "Jin is bringing a universal igniter and a loaner space heater in case the board is bad.", at: at(0, 8), by: portal(3) },
      ]),
      photos: photos("sw1-ph", ["Furnace status light.jpg"]),
      portalComments: list("sw1-pc", [
        { body: "It's 58° in the house this morning and we have a toddler — can someone come today?", at: at(0, 6.6), by: "Noah Schmidt", from: "resident" },
      ]),
      timeline: list("sw1-t", [
        { label: "Reported via tenant portal", date: day(0) },
        { label: "Evergreen HVAC dispatched", date: day(0) },
      ]),
    },
  });

  // 2 · A-102 dishwasher — fresh portal request.
  patchWorkOrder(2, {
    steps: [["Submitted", -1, 19, "Daniel Okafor", "Submitted from the resident portal"]],
    meta: {
      source: "tenant", channel: "Resident portal", reportedBy: "Daniel Okafor", reportedOn: day(-1), subcategory: "Dishwasher", area: "Kitchen",
      entryPermission: "allowed", preferredDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], preferredTimes: ["Morning"],
      requestNotes: "Water sits in the bottom after every cycle and it's starting to smell. I already cleaned the filter.",
      troubleshooting: "Third report in six weeks — Summit replaced the drain hose and came back once under warranty. Resident cleaned the filter; check the pump and air gap.", recurringIssue: true,
      photos: photos("sw2-ph", ["Standing water after cycle.jpg"]),
    },
  });

  // 3 · N-101 exhaust fan — request under review.
  patchWorkOrder(3, {
    steps: [
      ["Submitted", -2, 14, "Jordan Lee", "Logged from an email"],
      ["In review", -1, 10, "Jordan Lee", "Asked Brightline whether to repair or replace the fan motor"],
    ],
    meta: {
      source: "tenant", channel: "Email", reportedBy: "Grace Kim", reportedOn: day(-2), subcategory: "Other", area: "Bathroom",
      entryPermission: "call_first", contactMethod: "Email", reviewedOn: day(-1),
    },
  });

  // 4 · N-102 disposal — vendor missed the first visit, replaced it yesterday and
  // invoiced through the vendor portal (SAR-4431, pending approval in Bills).
  patchWorkOrder(4, {
    cols: { status: "Completed", scheduled_date: day(-1) },
    reprice: true,
    lines: [["labor", "Remove seized disposal, install new unit", 1, 85], ["material", "1/2 HP garbage disposal", 1, 225]],
    steps: [
      ["Open", -3, 11, "Jordan Lee", "Logged from a phone call"],
      ["Scheduled", -3, 13, "Jordan Lee", "Assigned to Summit Appliance Repair"],
      ["Open", -2, 13, "Jordan Lee", "Vendor missed the visit — rescheduling with the resident"],
      ["Scheduled", -2, 15, "Jordan Lee", "Rebooked for the next morning"],
      ["In progress", -1, 9, portal(4), "Work started"],
      ["Completed", -1, 11, portal(4), "Completed by the vendor"],
    ],
    meta: {
      source: "tenant", channel: "Phone", reportedBy: "Marcus Johnson", reportedOn: day(-3), subcategory: "Disposal", area: "Kitchen",
      entryPermission: "allowed", windowStart: "09:00", windowEnd: "12:00", dispatchMethod: "Vendor portal", dispatchedOn: day(-3),
      vendorAccepted: true, vendorAcceptance: "Accepted", vendorAcceptanceAt: at(-3, 14),
      vendorNotes: list("sw4-vn", [
        { body: "Accepted the job", at: at(-3, 14), by: portal(4) },
        { body: "Sorry — truck broke down on I-5. Can do tomorrow morning instead.", at: at(-2, 11), by: portal(4) },
      ]),
      completedDate: day(-1), resolution: "Disposal motor seized — replaced with a 1/2 HP unit.", completionNotes: "Disposal motor seized — replaced with a 1/2 HP unit.",
      vendorCompletedAt: at(-1, 11), actualHours: 1, rootCause: "Age of equipment", signedOffBy: "Jordan Lee", workVerified: false, tenantPresent: true,
      warrantyDays: 90, followUpNeeded: false, feedbackRequested: true, feedbackRequestedOn: day(-1),
      vendorInvoiceNo: "SAR-4431", vendorInvoiceDate: day(-1), vendorInvoiceAmount: 310, paymentTerms: "Net 30",
      afterPhotos: photos("sw4-ap", ["New disposal installed.jpg"]),
    },
  });

  // 5 · S-201 burst supply line — from the failed routine inspection; owner OK'd by phone.
  patchWorkOrder(5, {
    cols: { inspection_id: inspectionId(4) },
    lines: [
      ["labor", "Emergency call-out and shut-off (after hours)", 2, 130],
      ["labor", "Replace supply line and angle stop; extraction and dry-out setup", 4, 95],
      ["material", "Braided supply line + angle stop", 1, 48],
      ["material", "Dehumidifier rental (3 days)", 3, 90],
      ["material", "Plastic sheeting and tape", 1, 62],
    ],
    parts: [[13, 1, -4]],
    approval: { status: "Approved", amount: 2400, requested: -4, decided: -3, method: "Phone", emergency: true, notes: "Approved the emergency repair; go ahead with drywall once readings clear. Claim filed with the carrier." },
    steps: [
      ["Open", -4, 6.5, "Jordan Lee", "Emergency — on-call shut the water off"],
      ["Scheduled", -4, 6.75, "Jordan Lee", "Assigned to Rainier Plumbing Co."],
      ["In progress", -4, 7.5, portal(1), "On site"],
    ],
    meta: {
      source: "inspection", reportedBy: "Casey Nolan", reportedOn: day(-4), subcategory: "Leak", area: "Kitchen", emergency: true,
      tags: ["Emergency", "Insurance claim"], estimateAmount: 2400, entryPermission: "allowed", keyLocation: "Pinecrest office key box #S201",
      lockboxCode: "4471", dispatchMethod: "Phone", dispatchedOn: day(-4), vendorAccepted: true, vendorAcceptance: "Accepted",
      vendorAcceptanceAt: at(-4, 6.75), notToExceed: 2500, shareWithOwner: true, showCostsToOwner: true, notifyOwnerOnComplete: true,
      ownerNote: "Insurance claim opened — adjuster visit booked. Drywall to follow once the unit is dry.",
      vendorInvoiceNo: "RPC-11902", vendorInvoiceDate: day(-3), vendorInvoiceAmount: 1020, paymentTerms: "Net 30",
      description: "The routine inspection two days earlier flagged a weeping kitchen supply line and a soft subfloor by the toilet. The toilet supply line then failed overnight; water came through the ceiling into the S-101 kitchen below. Unit taken offline.",
      vendorNotes: list("sw5-vn", [
        { body: "Line replaced, water back on. Moisture 38% in the ceiling — fans and dehus running.", at: at(-4, 13), by: portal(1) },
        { body: "Re-check: down to 21%. Another 48 hours before drywall.", at: at(-2, 10), by: portal(1) },
      ]),
      photos: photos("sw5-ph", ["Kitchen ceiling — S-101 below.jpg", "Failed compression fitting.jpg"]),
      labor: list("wo5-l", [
        { label: "Emergency call-out and shut-off", hours: "2" },
        { label: "Replace supply line and valve", hours: "1.5" },
        { label: "Water extraction and dry-out setup", hours: "2.5" },
      ]),
      timeline: list("wo5-t", [
        { label: "Routine inspection flagged a weeping supply line", date: day(-6) },
        { label: "S-101 resident reported water through the ceiling", date: day(-4) },
        { label: "Rainier Plumbing on site, water shut off", date: day(-4) },
        { label: "Unit marked down for repairs", date: day(-3) },
        { label: "Insurance adjuster visit", date: day(1) },
      ]),
    },
  });

  // 6 · S-102 ants — approved; pulls the quarterly pest treatment forward.
  patchWorkOrder(6, {
    steps: [
      ["Submitted", -5, 9, "Jordan Lee", "Logged from a text message"],
      ["In review", -5, 11, "Jordan Lee", ""],
      ["Approved", -4, 10, "Jordan Lee", "Approved — booking the quarterly pest treatment early"],
    ],
    meta: {
      source: "tenant", channel: "Text", reportedBy: "Ethan Walker", reportedOn: day(-5), subcategory: "Insects", area: "Kitchen",
      entryPermission: "allowed", contactMethod: "Text", reviewedOn: day(-4), preferredTimes: ["Morning", "Midday"],
      photos: photos("sw6-ph", ["Ant trail under the sink.jpg"]),
    },
  });

  // 7 · L-302 GFCIs — on hold for backordered parts (inventory is out of stock).
  patchWorkOrder(7, {
    parts: [[3, 2, null, false]],
    steps: [
      ["Submitted", -6, 15, "Liam O'Connor", "Submitted from the resident portal"],
      ["Open", -6, 16, "Alex Rivera", "Converted from request"],
      ["Scheduled", -5, 9, "Alex Rivera", "Assigned to Brightline Electric"],
      ["In progress", -4, 8.5, portal(2), "Diagnosing"],
      ["On hold", -4, 10, portal(2), "Waiting on parts — GFCI outlets backordered"],
    ],
    meta: {
      source: "tenant", channel: "Resident portal", reportedBy: "Liam O'Connor", reportedOn: day(-6), subcategory: "Outlet / switch", area: "Kitchen",
      entryPermission: "call_first", holdReason: "Waiting on parts", holdUntil: day(3), windowStart: "08:00", windowEnd: "10:00",
      dispatchMethod: "Vendor portal", dispatchedOn: day(-5), vendorAccepted: true, vendorAcceptance: "Accepted", vendorAcceptanceAt: at(-5, 11),
      estimateAmount: 260,
      vendorNotes: list("sw7-vn", [
        { body: "Accepted the job", at: at(-5, 11), by: portal(2) },
        { body: "Both GFCIs test bad (not just overloaded). Supply house is out of 20A white — ordered, back Thursday.", at: at(-4, 10), by: portal(2) },
      ]),
    },
  });

  // 8 · Cascade façade walk — in-house weekly safety check.
  patchWorkOrder(8, {
    cols: { technician: IN_HOUSE },
    lines: [["labor", "Scaffold, netting and walkway safety walk", 4, 45]],
    steps: [
      ["Open", -9, 10, "Alex Rivera", "Weekly walk for the renovation"],
      ["Scheduled", -9, 11, "Alex Rivera", "Assigned to Ben Alvarez (in-house)"],
      ["In progress", -1, 8, "Ben Alvarez", "Walk started with the GC super"],
    ],
    meta: {
      source: "staff", reportedBy: "Alex Rivera", reportedOn: day(-9), subcategory: "Other", area: "Exterior", commonArea: true,
      tags: ["Capital expense", "Recurring"], technicianPhone: IN_HOUSE_PHONE, dueDate: day(1),
      labor: list("sw8-l", [{ label: "Scaffold walk with the GC super", hours: "2" }, { label: "Write-up and photos", hours: "2" }]),
      photos: photos("sw8-ph", ["Pine St netting.jpg", "Lobby walkway cover.jpg"]),
    },
  });

  // 9 · B-102 water heater — owner approved in the portal; billed as RPC-11872.
  patchWorkOrder(9, {
    lines: [
      ["labor", "Remove failed tank, install and test new water heater", 4, 95],
      ["labor", "Permit inspection walk-through", 1, 140],
      ["material", "50-gal gas water heater", 1, 1120],
      ["material", "Expansion tank + fittings", 1, 145],
      ["material", "Seismic strap kit", 1, 75],
    ],
    approval: { status: "Approved", amount: 1900, requested: -15, decided: -14, method: "Owner portal", notes: "Approved — replace like for like." },
    steps: [
      ["Open", -16, 8, "Alex Rivera", "Logged from a phone call"],
      ["On hold", -15, 11, "Alex Rivera", "Waiting on approval — $1,900 quote over the owner limit"],
      ["Open", -14, 16, "Northwind Holdings LLC (owner portal)", "Owner approved"],
      ["Scheduled", -14, 17, "Alex Rivera", "Assigned to Rainier Plumbing Co."],
      ["In progress", -13, 8.5, portal(1), "Work started"],
      ["Completed", -12, 15, portal(1), "Completed by the vendor"],
    ],
    meta: {
      source: "tenant", channel: "Phone", reportedBy: "Omar Haddad", reportedOn: day(-16), subcategory: "Water heater", area: "Laundry",
      asset: "Water heater", assetMake: "Rheem", assetModel: "XG50T06EC38U1", assetSerial: "Q092612345", underWarranty: true,
      warrantyProvider: "Rheem (manufacturer)", warrantyExpires: day(6 * 365 - 12), entryPermission: "allowed",
      dispatchMethod: "Vendor portal", dispatchedOn: day(-14), vendorAccepted: true, vendorAcceptance: "Accepted", vendorAcceptanceAt: at(-14, 18),
      shareWithOwner: true, showCostsToOwner: true, notifyOwnerOnComplete: true,
      completedDate: day(-12), resolution: "Replaced the failed 40-gal tank with a 50-gal unit, expansion tank and new seismic straps. Relief valve tested, no leaks.",
      completionNotes: "Replaced the failed 40-gal tank with a 50-gal unit, expansion tank and new seismic straps. Relief valve tested, no leaks.",
      vendorCompletedAt: at(-12, 15), actualHours: 5, rootCause: "Age of equipment", signedOffBy: "Alex Rivera", workVerified: true,
      tenantPresent: true, warrantyDays: 365, followUpNeeded: false,
      vendorInvoiceNo: "RPC-11872", vendorInvoiceDate: day(-9), vendorInvoiceAmount: 1860, paymentTerms: "Net 30", poNumber: "PO-W-0412",
      feedbackRequested: true, feedbackRequestedOn: day(-12), tenantRating: "5", feedbackDate: day(-11), feedbackChannel: "Text",
      wouldRecommendVendor: true, issueResolved: true, feedbackComment: "Carlos was great — explained everything and cleaned up.",
      labor: list("wo9-l", [{ label: "Remove and install water heater", hours: "4" }, { label: "Permit inspection walk-through", hours: "1" }]),
      afterPhotos: photos("sw9-ap", ["New 50-gal heater installed.jpg"]),
      tags: ["Warranty"],
    },
  });

  // 10 · Main house fridge — completed by Summit.
  patchWorkOrder(10, {
    lines: [["labor", "Diagnose and replace evaporator fan motor", 2, 85], ["material", "Evaporator fan motor", 1, 245]],
    steps: [
      ["Open", -25, 13, "Jordan Lee", "Logged from a phone call"],
      ["Scheduled", -25, 15, "Jordan Lee", "Assigned to Summit Appliance Repair"],
      ["In progress", -22, 10, portal(4), "Work started"],
      ["Completed", -21, 14, portal(4), "Completed by the vendor"],
    ],
    meta: {
      source: "tenant", channel: "Phone", reportedBy: "Ravi Patel", reportedOn: day(-25), subcategory: "Refrigerator", area: "Kitchen",
      asset: "Refrigerator", assetMake: "Whirlpool", assetModel: "WRF555SDFZ", dispatchMethod: "Vendor portal", dispatchedOn: day(-25),
      vendorAccepted: true, vendorAcceptance: "Accepted", vendorAcceptanceAt: at(-25, 16), entryPermission: "present",
      resolution: "Evaporator fan motor seized. Replaced the motor and cleared the defrost drain.", actualHours: 2, rootCause: "Age of equipment",
      signedOffBy: "Jordan Lee", workVerified: true, tenantPresent: true, warrantyDays: 90, shareWithOwner: true, notifyOwnerOnComplete: true,
      vendorInvoiceNo: "SAR-4409", vendorInvoiceDate: day(-20), vendorInvoiceAmount: 415, paymentTerms: "Net 30",
      feedbackRequested: true, feedbackRequestedOn: day(-21), tenantRating: "4", feedbackDate: day(-20), feedbackChannel: "Email",
      wouldRecommendVendor: true, issueResolved: true, feedbackComment: "Fixed in one visit. A heads-up text before arrival would have been nice.",
    },
  });

  // 11 · Tower A filters — the latest occurrence of the quarterly preventive schedule.
  const filters = C.byId("work_orders", sbWo(11));
  patchWorkOrder(11, {
    cols: { pm_schedule_id: pmId(1), pm_due_date: filters.scheduled_date },
    lines: [["labor", "Swap and date-label 18 air-handler filters", 2, 105], ["material", "HVAC filters from B1 stock (16 × 16x25, 2 × 20x20)", 1, 170]],
    parts: [[1, 16, -38], [2, 2, -38]],
    steps: [
      ["Open", -40, 9, "Alex Rivera", "Generated from preventive schedule"],
      ["Scheduled", -40, 10, "Alex Rivera", "Assigned to Evergreen HVAC Services"],
      ["In progress", -39, 8.5, portal(3), "Work started"],
      ["Completed", -38, 16, portal(3), "Completed by the vendor"],
    ],
    meta: {
      source: "pm", pmScheduleName: "Replace HVAC filters — Tower A", dueDate: filters.scheduled_date, subcategory: "Filter change",
      commonArea: true, area: "Whole unit", estimateAmount: 380, entryPermission: "allowed",
      checklist: list("sw11-c", ["Notify residents 48 hours ahead", "Swap filters and date-label each one", "Note any heavily loaded units"].map((label) => ({ label, done: true }))),
      dispatchMethod: "Vendor portal", dispatchedOn: day(-40), vendorAccepted: true, vendorAcceptance: "Accepted", vendorAcceptanceAt: at(-40, 12),
      resolution: filters.metadata.fieldReport, completionNotes: filters.metadata.fieldReport, actualHours: 2, rootCause: "Normal wear and tear",
      signedOffBy: "Alex Rivera", workVerified: true, warrantyDays: 0, tags: ["Recurring"],
      vendorInvoiceNo: "EHS-7712", vendorInvoiceDate: day(-21), vendorInvoiceAmount: 380, paymentTerms: "Net 30",
    },
  });

  // 12 · TH-4 move-out deep clean — vendor task on the TH-4 turn.
  patchWorkOrder(12, {
    cols: { unit_turn_id: turnId(2) },
    lines: [["labor", "Move-out deep clean (2 cleaners × 4 h)", 8, 55], ["material", "Cleaning supplies", 1, 10]],
    steps: [
      ["Open", -54, 10, "Jordan Lee", "Created from unit turn \"TH-4 turn — garage + carpet\""],
      ["Scheduled", -54, 11, "Jordan Lee", "Assigned to ClearView Cleaning"],
      ["In progress", -52, 8.5, portal(5), "Work started"],
      ["Completed", -51, 15, portal(5), "Completed by the vendor"],
    ],
    meta: {
      source: "turn", subcategory: "Move-out clean", area: "Whole unit", dueDate: day(-48), entryPermission: "allowed",
      dispatchMethod: "Vendor portal", dispatchedOn: day(-54), vendorAccepted: true, vendorAcceptance: "Accepted", vendorAcceptanceAt: at(-54, 13),
      resolution: "Full move-out clean incl. oven, fridge, blinds and garage sweep.", actualHours: 8, rootCause: "Normal wear and tear",
      signedOffBy: "Jordan Lee", workVerified: true, tags: ["Turn"],
      vendorInvoiceNo: "CVC-3247", vendorInvoiceDate: day(-51), vendorInvoiceAmount: 450, paymentTerms: "Net 30",
    },
  });
}

// ---- New work orders ----------------------------------------------------------------

// Spec keys: n, name, kind, field, at (unit label or property), tenant (name | null),
// category, sub, priority, status, vendor (1–6) | tech, opened [days, hour],
// scheduled, due, done, lines, source, channel, reportedBy, approval, hold
// [reason, until, note], cancel, cancelAt, decided, note, rating [stars, comment,
// response], parts, checklist, turn, inspection, pm/pmDue, steps, meta.
function workOrderSpecs() {
  const portal = (v) => `${vendorOf(v).name} (vendor portal)`;
  return [
    // -- Requests ------------------------------------------------------------------
    { n: 1, name: "Kitchen faucet dripping", kind: "request", at: "A-201", category: "Plumbing", sub: "Faucet / fixture", priority: "Low", status: "Submitted",
      opened: [0, 7], channel: "Resident portal",
      meta: { area: "Kitchen", entryPermission: "allowed", preferredDays: ["Tue", "Thu"], preferredTimes: ["Morning", "Midday"],
        description: "Kitchen faucet drips steadily even with the handle fully off — about a cup an hour.", photos: photos("w1-ph", ["Faucet base.jpg"]) } },
    { n: 2, name: "Smoke detector chirping in hallway", kind: "request", at: "A-101", category: "Electrical", sub: "Smoke / CO detector", priority: "Medium", status: "Submitted",
      opened: [-1, 21], channel: "Text",
      meta: { area: "Bedroom", room: "Hallway outside the bedroom", entryPermission: "allowed", petsPresent: true, petsSecured: true, petDetails: "Cat — stays in the bedroom",
        description: "Hallway smoke detector chirps every 40 seconds. The ceiling is too high for me to reach it." } },
    { n: 3, name: "Mold spots on bathroom ceiling", kind: "request", at: "N-102", category: "General", sub: "Walls / ceiling", priority: "High", status: "In review",
      opened: [-3, 18], decided: -2, channel: "Email", note: "Booked a moisture check — may need a bigger exhaust fan",
      meta: { area: "Bathroom", entryPermission: "call_first", reviewedOn: day(-2), approvedBy: "Jordan Lee",
        description: "Black spots spreading on the bathroom ceiling above the shower, about a foot across now.",
        troubleshooting: "Exhaust fan runs but barely moves air — likely undersized or a blocked duct.",
        photos: photos("w3-ph", ["Ceiling above shower.jpg", "Fan grille.jpg"]),
        portalComments: list("w3-pc", [{ body: "It spreads after every shower — I've been leaving the window cracked.", at: at(-1, 20), by: "Marcus Johnson", from: "resident" }]) } },
    { n: 4, name: "Install grab bar in primary shower", kind: "request", at: "Main house", category: "General", sub: "Other", priority: "Low", status: "Approved",
      opened: [-9, 11], decided: -7, channel: "Email", note: "Approved — owner covers accessibility grab bars",
      meta: { area: "Bathroom", entryPermission: "present", reviewedOn: day(-7), approvedBy: "Jordan Lee",
        description: "Requesting a grab bar in the primary shower for my father, who is staying with us through the winter.",
        resolutionNotes: "Approved by Jonathan Reyes. Ben to install a 24\" stainless bar into blocking — waiting on the resident's preferred date." } },
    { n: 5, name: "Paint living room accent wall", kind: "request", at: "A-301", category: "General", sub: "Paint", priority: "Low", status: "Rejected",
      opened: [-14, 19], decided: -13, channel: "Resident portal", note: "Cosmetic change — sent the resident-paint approval form instead",
      meta: { area: "Living room", reviewedOn: day(-13), approvedBy: "Alex Rivera",
        description: "Could maintenance paint one living room wall a dark green (Sherwin-Williams Pewter Green)?",
        resolutionNotes: "Not a maintenance item. Residents may repaint with written approval and restore Harbor White at move-out (lease §14) — approval form sent." } },
    { n: 6, name: "Garage door won't close fully", kind: "request", at: "TH-1", category: "General", sub: "Doors / locks", priority: "Medium", status: "Converted",
      opened: [-4, 8], decided: -3, channel: "Phone", note: "Converted to work order",
      meta: { area: "Garage", entryPermission: "allowed", reviewedOn: day(-3), approvedBy: "Jordan Lee",
        description: "The garage door reverses about a foot before it closes, every time.",
        resolutionNotes: "Converted — see \"Adjust garage door safety sensors — TH-1\"." } },
    { n: 8, name: "Water stain spreading on kitchen ceiling", kind: "request", at: "S-101", category: "Plumbing", sub: "Leak", priority: "High", status: "Converted",
      opened: [-4, 5], decided: -4, channel: "After-hours line", note: "Converted — source traced to S-201",
      meta: { area: "Kitchen", emergency: true, entryPermission: "allowed", reviewedOn: day(-4), approvedBy: "Jordan Lee",
        description: "Water is dripping through the kitchen ceiling light fixture and the stain is spreading.",
        resolutionNotes: "Source was the burst supply line in S-201 above. Converted to the ceiling repair once the area is dry." } },
    { n: 22, name: "Dishwasher not draining", kind: "request", at: "A-102", category: "Appliance", sub: "Dishwasher", priority: "Medium", status: "Cancelled",
      opened: [-1, 20], decided: -1, channel: "Resident portal", note: "Duplicate of the request submitted an hour earlier", cancel: "Duplicate request",
      meta: { area: "Kitchen",
        description: "Dishwasher has standing water after every cycle." } },
    { n: 23, name: "Thermostat screen blank", kind: "request", at: "A-301", category: "HVAC", sub: "Thermostat", priority: "Medium", status: "Cancelled",
      opened: [-9, 7], decided: -9, channel: "Resident portal", cancelBy: "Hannah Brooks", note: "Replaced the batteries — working again.", cancel: "Resolved by tenant",
      meta: { area: "Living room",
        description: "Thermostat display went blank overnight and the heat isn't coming on." } },

    // -- Open, scheduled and in-progress work ------------------------------------------------
    { n: 7, name: "Adjust garage door safety sensors — TH-1", at: "TH-1", category: "General", sub: "Doors / locks", priority: "Medium", status: "Scheduled",
      vendor: 2, opened: [-3, 11], scheduled: 2, due: 4, channel: "Phone", window: ["08:00", "10:00"],
      meta: { area: "Garage", estimateAmount: 180, entryPermission: "allowed", troubleshooting: "Resident cleaned the photo-eye lenses; still reversing.",
        photos: photos("w7-ph", ["Sensor alignment.jpg"]) } },
    { n: 9, name: "Kitchen ceiling drywall repair — S-101", at: "S-101", category: "General", sub: "Walls / ceiling", priority: "High", status: "Scheduled",
      tech: IN_HOUSE, opened: [-4, 9], scheduled: 5, due: 7, channel: "After-hours line", window: ["09:00", "15:00"],
      meta: { area: "Kitchen", tags: ["Insurance claim"], estimateAmount: 850, entryPermission: "present", recurringIssue: false,
        description: "Cut out and replace ~16 sq ft of water-damaged ceiling drywall in the S-101 kitchen once moisture readings clear (damage from the S-201 supply-line failure). Prime and paint to match.",
        checklist: list("w9-c", [{ label: "Confirm moisture under 15%", done: false }, { label: "Protect kitchen and cabinets", done: false }, { label: "Replace drywall, tape and mud", done: false }, { label: "Prime and paint", done: false }]) } },
    { n: 10, name: "Parking garage lights out — level P1", at: "The Marlowe", category: "Electrical", sub: "Lighting", priority: "Medium", status: "Open",
      vendor: 2, acceptance: "", opened: [-2, 9], due: 5, source: "staff", reportedBy: "Alex Rivera",
      meta: { area: "Parking", commonArea: true, notToExceed: 750, assignmentNotes: "Check the ballast run and the P1 photocell before replacing fixtures.",
        description: "Six of the twelve fixtures on P1 are out near the EV chargers." } },
    { n: 11, name: "Fallen tree limb blocking parking", field: true, at: "Pinecrest Commons", category: "Landscaping", sub: "Trees / shrubs", priority: "Urgent", status: "In progress",
      vendor: 6, opened: [-1, 6], scheduled: -1, due: 0, channel: "After-hours line", reportedBy: "Ethan Walker",
      lines: [["labor", "Crew cut, chip and haul limb", 4, 60], ["trip", "After-hours call-out", 1, 95]],
      vendorNotes: [[-1, 9, "Crew on site 7:40am — limb is ~18in diameter, chipping now. Lot reopens by noon."]],
      meta: { area: "Parking", commonArea: true, emergency: true, tags: ["Emergency"], estimateAmount: 420,
        description: "Overnight windstorm brought a large Douglas-fir limb down across stalls 14–17. No vehicles damaged.",
        photos: photos("w11-ph", ["Limb across stalls 14–17.jpg"]) } },
    { n: 12, name: "Rodent activity at trash enclosure", at: "Pinecrest Commons", category: "Pest control", sub: "Rodents", priority: "Medium", status: "Scheduled",
      tech: IN_HOUSE, opened: [-2, 14], scheduled: 3, due: 5, source: "staff", reportedBy: "Jordan Lee",
      meta: { area: "Exterior", commonArea: true,
        description: "Droppings and gnawed bags at the South Building trash enclosure. Set tamper-resistant bait stations and seal the gap under the gate." } },
    { n: 13, name: "Leaf cleanup & storm drain clearing", at: "Alder Court Townhomes", category: "Landscaping", sub: "Lawn care", priority: "Low", status: "Open",
      vendor: 6, acceptance: "", opened: [-1, 10], scheduled: 6, due: 9, source: "staff", reportedBy: "Jordan Lee",
      meta: { area: "Exterior", commonArea: true, description: "Clear leaves from the common areas and both storm drains at the Alder Ct entrance before the November rains." } },
    { n: 14, name: "Roof membrane repair — Loft Building", field: true, at: "Cascade Lofts", category: "General", sub: "Roof", priority: "High", status: "On hold",
      tech: IN_HOUSE, opened: [-6, 10], due: 14, source: "staff", reportedBy: "Ben Alvarez", hold: ["Waiting on approval", null],
      approval: { status: "Pending", amount: 7800, requested: -2, dueBy: 3, method: "Owner portal", requestNote: "Summit Roofing quote attached — recommend doing it before the rainy season." },
      steps: [["Open", -6, 10, "Alex Rivera", "Found during the L-401 renovation walk"], ["On hold", -2, 11, "Alex Rivera", "Waiting on approval — quote sent to Northwind"]],
      meta: { area: "Roof", commonArea: true, tags: ["Capital expense"], estimateAmount: 7800,
        description: "Ponding water and two blistered seams over the L-401 bedroom; matching ceiling stain inside L-401. Summit Roofing quoted cutting out and re-membraning ~400 sq ft.",
        photos: photos("w14-ph", ["Ponding north parapet.jpg", "Blistered seam.jpg"]) } },
    { n: 15, name: "Replace hallway carpet — North Building", at: "Pinecrest Commons", category: "General", sub: "Flooring", priority: "Medium", status: "Open",
      opened: [-10, 15], due: 30, source: "staff", reportedBy: "Jordan Lee",
      approval: { status: "Pending", amount: 3400, requested: -8, dueBy: -1, method: "Email", requestNote: "Two bids attached; recommending the commercial loop pile." },
      meta: { area: "Common area", commonArea: true, estimateAmount: 3400,
        description: "Hallway carpet on floors 1–3 is worn through at the stair landings — flagged as a trip hazard on the last walk." } },
    { n: 16, name: "Replace vanity light fixture — A-202", at: "A-202", category: "Electrical", sub: "Lighting", priority: "Low", status: "On hold",
      vendor: 2, opened: [-12, 20], due: 5, channel: "Resident portal", hold: ["Waiting on tenant access", 2],
      steps: [
        ["Submitted", -12, 20, "Lucas Fernández", "Submitted from the resident portal"],
        ["Open", -11, 9, "Alex Rivera", "Converted from request"],
        ["Scheduled", -11, 10, "Alex Rivera", "Assigned to Brightline Electric"],
        ["On hold", -8, 9, portal(2), "Waiting on tenant access — resident away until Thursday"],
      ],
      meta: { area: "Bathroom", entryPermission: "present", description: "Vanity light flickers and the fixture is hot to the touch.",
        portalComments: list("w16-pc", [{ body: "Traveling for work — back Thursday after 5pm. Any evening that week works.", at: at(-8, 19), by: "Lucas Fernández", from: "resident" }]) } },
    { n: 17, name: "Repaint garage door trim — Alder Court", at: "Alder Court Townhomes", category: "General", sub: "Paint", priority: "Low", status: "On hold",
      tech: IN_HOUSE, opened: [-15, 9], due: 170, source: "staff", reportedBy: "Jordan Lee", hold: ["Weather", 150, "Too wet to paint — resume in spring"], holdAt: -12,
      meta: { area: "Exterior", commonArea: true, description: "Peeling trim on all four garage doors; scrape, prime and repaint." } },
    { n: 18, name: "Re-caulk primary shower", at: "Main house", category: "General", sub: "Other", priority: "Low", status: "Open",
      tech: IN_HOUSE, opened: [-29, 10], due: -9, source: "inspection", reportedBy: "Casey Nolan", inspection: inspectionId(6),
      meta: { area: "Bathroom", entryPermission: "call_first", description: "Annual inspection note: re-caulk the primary shower surround — caulk is cracked along the tub line." } },
    { n: 19, name: "Walkway light timer reset", at: "Alder Court Townhomes", category: "Electrical", sub: "Lighting", priority: "Low", status: "Open",
      tech: IN_HOUSE, opened: [-6, 17], scheduled: -3, due: -2, channel: "Text", reportedBy: "Noah Schmidt",
      meta: { area: "Exterior", commonArea: true, description: "Walkway lights between TH-2 and TH-3 come on at noon and go off at 8pm — the timer lost its setting after the outage." } },
    { n: 20, name: "Lobby lighting retrofit — Cascade Lofts", at: "Cascade Lofts", category: "Electrical", sub: "Lighting", priority: "Medium", status: "In progress",
      vendor: 2, opened: [-41, 10], scheduled: -36, due: 3, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Remove old fixtures, install LED retrofit", 18, 110], ["material", "LED fixtures (14) + drivers", 1, 2270]],
      approval: { status: "Approved", requested: -40, decided: -38, method: "Email", notes: "Approved as part of the lobby renovation budget." },
      vendorNotes: [[-20, 16, "Fixtures installed; waiting on the GC to finish the ceiling before final trim-out."], [-2, 10, "Trim-out done. Ready for the final walkthrough."]],
      meta: { area: "Common area", commonArea: true, tags: ["Capital expense"], vendorInvoiceNo: "BLE-20931", vendorInvoiceDate: day(-34), vendorInvoiceAmount: 4250,
        paymentTerms: "Net 30", poNumber: "PO-C-0388", ownerNote: "Part of the lobby renovation — balance due on final walkthrough sign-off.",
        assignmentNotes: "Deposit paid at start; balance on final walkthrough sign-off." } },
    { n: 21, name: "Lobby flooring upgrade — scope", at: "Cascade Lofts", category: "General", sub: "Flooring", priority: "Low", status: "Draft",
      opened: [-5, 14], source: "owner", channel: "Email", reportedBy: "Rebecca Lin (Northwind Holdings)",
      meta: { area: "Common area", commonArea: true, tags: ["Owner request", "Capital expense"],
        description: "Owner asked for options to replace the cracked lobby tile once the façade work wraps. Draft scope — get two bids." } },
    { n: 24, name: "Upgrade lobby intercom — Pinecrest", at: "Pinecrest Commons", category: "Electrical", sub: "Wiring", priority: "Low", status: "Cancelled",
      opened: [-21, 10], cancelAt: -14, cancel: "Owner declined", source: "staff", reportedBy: "Jordan Lee",
      approval: { status: "Rejected", amount: 6200, requested: -20, decided: -15, method: "Owner portal", notes: "Defer to next year's capital plan." },
      steps: [
        ["Open", -21, 10, "Jordan Lee", ""],
        ["On hold", -20, 11, "Jordan Lee", "Waiting on approval"],
        ["Cancelled", -14, 11, "Jordan Lee", "Owner declined — defer to next year"],
      ],
      meta: { area: "Common area", commonArea: true, estimateAmount: 6200, description: "Replace the 1998 analog intercom with a cloud video entry system at both buildings." } },

    // -- Completed history -----------------------------------------------------------------
    { n: 25, name: "Clogged bathroom sink", at: "A-301", category: "Plumbing", sub: "Clog / drain", priority: "Medium", status: "Completed",
      tech: IN_HOUSE, opened: [-6, 8], scheduled: -5, done: -5, channel: "Resident portal",
      lines: [["labor", "Clear pop-up drain", 1, 45], ["material", "Drain hair catcher", 1, 8]],
      resolution: "Pulled a hair clog from the pop-up drain and installed a hair catcher.", rating: [5, "Ben was quick and tidy."],
      meta: { area: "Bathroom", entryPermission: "allowed" } },
    { n: 26, name: "Boiler tune-up — Cascade Lofts", field: true, at: "Cascade Lofts", category: "HVAC", sub: "Other", priority: "Medium", status: "Completed",
      vendor: 3, opened: [-9, 9], scheduled: -7, done: -7, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Annual boiler service and combustion test", 8, 105], ["material", "Burner nozzle, gaskets, combustion analysis", 1, 740]],
      approval: { status: "Approved", requested: -9, decided: -8, method: "Email", notes: "Approved — annual service." },
      resolution: "Cleaned the burner, replaced the nozzle and gaskets, combustion analysis within spec (CO 18 ppm).", cause: "Normal wear and tear",
      meta: { area: "Basement", commonArea: true, asset: "Steam boiler", assetMake: "Weil-McLain", assetModel: "SGO-6", tags: ["Recurring"],
        vendorInvoiceNo: "EHS-7731", vendorInvoiceDate: day(-5), vendorInvoiceAmount: 1580, paymentTerms: "Net 30" } },
    { n: 28, name: "Main line jetting — South Building", field: true, at: "Pinecrest Commons", category: "Plumbing", sub: "Sewer line", priority: "High", status: "Completed",
      vendor: 1, opened: [-25, 7], scheduled: -24, done: -24, channel: "Phone", reportedBy: "Sofia Rossi",
      lines: [["labor", "Jet 4in main from cleanout to street; camera inspection", 3, 95], ["trip", "Jetter truck", 1, 355]],
      approval: { status: "Approved", requested: -25, decided: -25, method: "Phone", emergency: true, notes: "OK'd by phone — backup risk." },
      resolution: "Jetted the 4in main from the South Building cleanout to the street; heavy grease. Camera showed no breaks.",
      meta: { area: "Basement", commonArea: true, vendorInvoiceNo: "RPC-11788", vendorInvoiceDate: day(-22), vendorInvoiceAmount: 640, paymentTerms: "Net 30",
        description: "Slow drains and gurgling toilets across the South Building ground floor." } },
    { n: 29, name: "Dishwasher repair — N-102", at: "N-102", category: "Appliance", sub: "Dishwasher", priority: "Medium", status: "Completed",
      vendor: 4, opened: [-34, 16], scheduled: -32, done: -32, channel: "Resident portal",
      lines: [["labor", "Diagnose and replace drain pump", 1.5, 85], ["material", "Drain pump assembly", 1, 141.5], ["material", "Drain hose", 1, 16]],
      parts: [[7, 1, -32]], cause: "Age of equipment", resolution: "Drain pump failed — replaced the pump assembly and drain hose.",
      rating: [4, "Works great now."],
      meta: { area: "Kitchen", vendorInvoiceNo: "SAR-4418", vendorInvoiceDate: day(-31), vendorInvoiceAmount: 285, paymentTerms: "Net 30" } },
    { n: 30, name: "EV charger inspection — The Marlowe", field: true, at: "The Marlowe", category: "Electrical", sub: "Other", priority: "Low", status: "Completed",
      vendor: 2, opened: [-70, 10], scheduled: -67, done: -67, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Inspect and load-test four Level 2 chargers", 2.5, 110], ["trip", "Load-test equipment", 1, 100]],
      resolution: "All four chargers passed; tightened lugs on charger #3.", cause: "Normal wear and tear",
      meta: { area: "Parking", commonArea: true, vendorInvoiceNo: "BLE-20714", vendorInvoiceDate: day(-66), vendorInvoiceAmount: 375, paymentTerms: "Net 30" } },
    { n: 31, name: "Toilet running constantly", at: "N-101", category: "Plumbing", sub: "Toilet", priority: "Low", status: "Completed",
      tech: IN_HOUSE, opened: [-200, 18], done: -186, channel: "Resident portal",
      lines: [["labor", "Replace flapper, then fill valve", 1.5, 45], ["material", "Flapper + fill valve", 1, 24]],
      steps: [
        ["Submitted", -200, 18, "Grace Kim", "Submitted from the resident portal"],
        ["Open", -199, 9, "Jordan Lee", "Converted from request"],
        ["Completed", -199, 15, "Ben Alvarez", "Replaced the flapper"],
        ["Open", -192, 10, "Jordan Lee", "Reopened — still running"],
        ["In progress", -187, 9, "Ben Alvarez", "Work started"],
        ["Completed", -186, 11, "Ben Alvarez", "Replaced the fill valve"],
      ],
      resolution: "Flapper replaced first; still ran, so the fill valve was replaced on the second visit.", cause: "Age of equipment",
      rating: [3, "Fixed on the second visit."],
      meta: { area: "Bathroom", recurringIssue: true, reopenedAt: at(-192, 10) } },
    { n: 32, name: "AC not cooling", at: "A-201", category: "HVAC", sub: "No cooling", priority: "High", status: "Completed",
      vendor: 3, opened: [-110, 13], scheduled: -109, done: -109, channel: "Phone",
      lines: [["labor", "Diagnose condenser", 2, 105], ["material", "Run capacitor 45/5 µF", 1, 130]],
      resolution: "Failed run capacitor on the condenser — replaced; cooling restored.", cause: "Age of equipment", rating: [5, "Same-day fix during the heat wave. Thank you!"],
      meta: { area: "Living room", asset: "Mini-split condenser", assetMake: "Mitsubishi" } },
    { n: 33, name: "Breaker keeps tripping — kitchen", at: "TH-2", category: "Electrical", sub: "Breaker / panel", priority: "High", status: "Completed",
      vendor: 2, opened: [-281, 18], scheduled: -280, done: -280, channel: "Phone",
      lines: [["labor", "Split shared kitchen circuit", 2, 110], ["material", "20A breaker + new home run", 1, 40]],
      resolution: "Dishwasher and microwave shared one 15A circuit — added a dedicated 20A circuit.", cause: "Installation defect", rating: [4] },
    { n: 34, name: "Snow & ice removal — Alder Court", field: true, at: "Alder Court Townhomes", category: "Landscaping", sub: "Snow removal", priority: "High", status: "Completed",
      vendor: 6, opened: [-299, 6], scheduled: -299, done: -298, source: "staff", reportedBy: "Jordan Lee",
      lines: [["labor", "Plow and shovel walks", 6, 60], ["material", "Ice melt (8 bags)", 8, 15]],
      resolution: "Cleared drives and walks twice; treated steps with pet-safe ice melt.", cause: "Weather / environment",
      meta: { area: "Exterior", commonArea: true, tags: ["Emergency"] } },
    { n: 35, name: "Washer leaking during spin", at: "Main house", category: "Appliance", sub: "Washer", priority: "Medium", status: "Completed",
      vendor: 4, opened: [-161, 10], scheduled: -160, done: -160, channel: "Email",
      lines: [["labor", "Replace door boot seal", 1.5, 85], ["material", "Door boot seal + drain hose clamp", 1, 95]],
      resolution: "Torn door boot seal — replaced, plus a loose drain hose clamp.", rating: [5, "Quick and friendly."],
      meta: { area: "Laundry" } },
    { n: 36, name: "Cracked bedroom window", at: "B-102", category: "General", sub: "Windows", priority: "Medium", status: "Completed",
      tech: IN_HOUSE, opened: [-63, 9], scheduled: -61, done: -60, channel: "In person",
      lines: [["labor", "Remove and reglaze pane", 2, 45], ["material", "Tempered glass pane (cut to size)", 1, 220, { billable: true }]],
      resolution: "Replaced the cracked pane; resident's guest confirmed the damage.", cause: "Tenant damage",
      meta: { area: "Bedroom", tenantCaused: true, chargeTenant: true, chargebackReason: "Window broken by a resident's guest (resident confirmed)", chargebackPosted: false } },
    { n: 37, name: "Pressure wash entry walkways — The Marlowe", at: "The Marlowe", category: "Cleaning", sub: "Common area", priority: "Low", status: "Completed",
      vendor: 5, opened: [-141, 9], scheduled: -140, done: -140, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Pressure wash entries, courtyard and garage ramp", 8, 55], ["trip", "Pressure washer rental", 1, 160]],
      approval: { status: "Approved", requested: -141, decided: -141, method: "Email", notes: "Approved — annual spring wash." },
      resolution: "All entries, the courtyard and the garage ramp washed.",
      meta: { area: "Common area", commonArea: true } },
    { n: 38, name: "Lost key fob replacement", at: "A-102", category: "General", sub: "Doors / locks", priority: "Low", status: "Completed",
      tech: IN_HOUSE, opened: [-46, 12], done: -45, channel: "In person",
      lines: [["labor", "Program new fob, deactivate lost one", 0.25, 45, { billable: true }], ["material", "Building fob", 1, 75, { billable: true }]],
      resolution: "Deactivated the lost fob and issued a new one.", cause: "Tenant damage",
      meta: { area: "Whole unit", tenantCaused: true, chargeTenant: true, chargebackReason: "Lost building fob", chargebackPosted: true, chargebackDate: day(-45) } },
    { n: 39, name: "Wasp nest under back deck", at: "Main house", category: "Pest control", sub: "Insects", priority: "Medium", status: "Completed",
      tech: IN_HOUSE, opened: [-126, 15], scheduled: -125, done: -125, channel: "Text",
      lines: [["labor", "Remove nest, treat deck framing", 1, 45], ["material", "Wasp foam + bait trap", 1, 14]],
      resolution: "Removed the nest after dusk and hung a bait trap.", cause: "Weather / environment", rating: [5],
      meta: { area: "Exterior" } },
    { n: 40, name: "Replace kitchen faucet cartridge — S-101", at: "S-101", category: "Plumbing", sub: "Faucet / fixture", priority: "Low", status: "Completed",
      tech: IN_HOUSE, opened: [-152, 10], done: -150, channel: "Resident portal",
      lines: [["labor", "Replace cartridge", 1, 45], ["material", "Single-handle faucet cartridge", 1, 18.4]],
      parts: [[5, 1, -150]], resolution: "Worn cartridge replaced; no more drip.", rating: [5],
      meta: { area: "Kitchen" } },
    { n: 41, name: "Ice maker not working", at: "L-302", category: "Appliance", sub: "Refrigerator", priority: "Low", status: "Completed",
      vendor: 4, opened: [-41, 18], scheduled: -38, done: -30, channel: "Resident portal",
      lines: [["labor", "Diagnose and replace water inlet valve (2 visits)", 2, 85], ["material", "Ice maker water inlet valve", 1, 68]],
      steps: [
        ["Submitted", -41, 18, "Liam O'Connor", "Submitted from the resident portal"],
        ["Open", -40, 9, "Alex Rivera", "Converted from request"],
        ["Scheduled", -40, 10, "Alex Rivera", "Assigned to Summit Appliance Repair"],
        ["In progress", -38, 9, portal(4), "Work started"],
        ["On hold", -38, 11, portal(4), "Waiting on parts — wrong valve shipped"],
        ["Scheduled", -33, 9, "Alex Rivera", "Second visit booked"],
        ["In progress", -30, 9, portal(4), "Work started"],
        ["Completed", -30, 11, portal(4), "Completed by the vendor"],
      ],
      resolution: "Water inlet valve failed. First replacement part was wrong; correct valve installed on the second visit.", cause: "Unknown",
      rating: [2, "Took two visits and almost two weeks without ice.", "Sorry about the wait — the first valve was the wrong part. Summit now confirms part numbers before booking."],
      meta: { area: "Kitchen" } },
    { n: 59, name: "Sidewalk trip hazard — SE Division St", at: "Pinecrest Commons", category: "Landscaping", sub: "Hardscape", priority: "High", status: "Completed",
      tech: IN_HOUSE, opened: [-58, 10], done: -51, source: "other", reportedBy: "City of Portland (PBOT notice)",
      lines: [["labor", "Grind and patch raised panel", 3, 45], ["material", "Asphalt patch (4 bags)", 4, 16]],
      resolution: "Ground down the lifted edge and feathered a patch; PBOT closed the notice.", cause: "Unknown",
      meta: { area: "Exterior", commonArea: true, description: "PBOT notice: raised sidewalk panel along the SE Division St frontage must be repaired within 30 days." } },

    { n: 61, name: "Dishwasher not draining — A-102", at: "A-102", category: "Appliance", sub: "Dishwasher", priority: "Medium", status: "Completed",
      vendor: 4, opened: [-45, 18], scheduled: -43, done: -43, channel: "Resident portal",
      lines: [["labor", "Clear air gap, replace drain hose", 1, 85], ["material", "Dishwasher drain hose", 1, 16], ["trip", "Service call", 1, 45]],
      parts: [[7, 1, -43]], resolution: "Kinked, partly clogged drain hose — replaced and cleared the air gap.", warranty: 30, rating: [4],
      meta: { area: "Kitchen", vendorInvoiceNo: "SAR-4402", vendorInvoiceDate: day(-42), vendorInvoiceAmount: 146, paymentTerms: "Net 30" } },
    { n: 62, name: "Dishwasher still not draining — warranty revisit", at: "A-102", category: "Appliance", sub: "Dishwasher", priority: "Medium", status: "Completed",
      vendor: 4, opened: [-16, 19], scheduled: -14, done: -14, channel: "Resident portal",
      resolution: "Re-seated the drain hose at the air gap — covered by the 30-day workmanship guarantee. Summit's $165 second-call invoice (SAR-4424) was rejected.",
      rating: [3, "Working again, but this was the second visit."],
      meta: { area: "Kitchen", recurringIssue: true, tags: ["Warranty"] } },
    { n: 63, name: "Rooftop unit compressor repair — The Marlowe", field: true, at: "The Marlowe", category: "HVAC", sub: "No cooling", priority: "High", status: "Completed",
      vendor: 3, opened: [-100, 8], scheduled: -98, done: -97, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Recover refrigerant, swap compressor, recharge", 6, 105], ["material", "Scroll compressor", 1, 2230]],
      approval: { status: "Approved", requested: -99, decided: -99, method: "Phone", emergency: true, notes: "Approved during the heat wave — warranty claim filed with the manufacturer." },
      resolution: "Compressor on RTU-2 failed — replaced and recharged; Tower B corridors cooling again.", cause: "Age of equipment",
      meta: { area: "Roof", commonArea: true, asset: "Rooftop unit RTU-2", assetMake: "Trane", assetModel: "YSC060", underWarranty: true,
        warrantyProvider: "Trane (5-year compressor)", warrantyExpires: day(400), tags: ["Warranty", "Emergency"],
        vendorInvoiceNo: "EHS-7488", vendorInvoiceDate: day(-95), vendorInvoiceAmount: 2860, paymentTerms: "Net 30",
        ownerNote: "Payment held until Trane's warranty credit for the compressor posts." } },
    { n: 64, name: "EV charger #3 repair — The Marlowe", at: "The Marlowe", category: "Electrical", sub: "Other", priority: "Medium", status: "Completed",
      vendor: 2, opened: [-156, 10], scheduled: -153, done: -152, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Diagnose and replace control board", 3, 110], ["material", "Charger control board", 1, 850]],
      approval: { status: "Approved", requested: -155, decided: -154, method: "Email" },
      resolution: "Replaced the control board on charger #3.", cause: "Installation defect",
      meta: { area: "Parking", commonArea: true, followUpNeeded: true,
        followUpNotes: "Charger #3 still faults intermittently — balance withheld until a second visit (loose lugs found at the August inspection).",
        vendorInvoiceNo: "BLE-20402", vendorInvoiceDate: day(-150), vendorInvoiceAmount: 1180, paymentTerms: "Net 30" } },
    { n: 65, name: "Storm cleanup — Pinecrest Commons", field: true, at: "Pinecrest Commons", category: "Landscaping", sub: "Trees / shrubs", priority: "High", status: "Completed",
      vendor: 6, opened: [-63, 7], scheduled: -63, done: -62, source: "staff", reportedBy: "Jordan Lee",
      lines: [["labor", "Crew cleanup of downed limbs and debris", 15, 60], ["trip", "Chipper & dump fees", 1, 250]],
      resolution: "Cleared downed limbs from both lots and the courtyard; chipped on site.", cause: "Weather / environment",
      meta: { area: "Exterior", commonArea: true, vendorInvoiceNo: "CLS-0871", vendorInvoiceDate: day(-61), vendorInvoiceAmount: 1150, paymentTerms: "Net 30",
        activityNotes: "Crew hours disputed — waiting on Cascade's timesheets before paying the invoice." } },
    { n: 66, name: "Post-construction clean — Cascade lobby", at: "Cascade Lofts", category: "Cleaning", sub: "Common area", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-25, 10], scheduled: -23, done: -23, source: "staff", reportedBy: "Alex Rivera",
      lines: [["labor", "Construction clean — lobby and stair", 10, 55], ["material", "Floor finish and supplies", 1, 130]],
      resolution: "Dust, debris and floor finish after the first phase of the lobby work.",
      meta: { area: "Common area", commonArea: true, tags: ["Capital expense"], vendorInvoiceNo: "CVC-3291", vendorInvoiceDate: day(-22), vendorInvoiceAmount: 680, paymentTerms: "Net 30" } },
    { n: 67, name: "Perimeter fence replacement — Alder Court", at: "Alder Court Townhomes", category: "General", sub: "Other", priority: "Medium", status: "Completed",
      tech: "Tacoma Fence & Gate (sub)", techPhone: "(253) 555-0144", opened: [-235, 10], scheduled: -200, done: -190, source: "staff", reportedBy: "Jordan Lee",
      lines: [["trip", "Replace 420 ft of cedar perimeter fence", 1, 5780]],
      approval: { status: "Approved", requested: -232, decided: -228, method: "Owner portal", notes: "Approved from the capital reserve." },
      resolution: "Old fence removed; new cedar fence and two gates installed.", cause: "Age of equipment", warranty: 365,
      meta: { area: "Exterior", commonArea: true, tags: ["Capital expense"], vendorInvoiceNo: "TFG-2604", vendorInvoiceDate: day(-186), vendorInvoiceAmount: 5780, paymentTerms: "Net 30" } },

    // -- Unit-turn vendor tasks -------------------------------------------------------------
    { n: 27, name: "Post-demo construction clean — L-401", at: "L-401", category: "Cleaning", sub: "Trash / debris", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-6, 10], scheduled: -4, done: -4, source: "turn", turn: turnId(3),
      lines: [["labor", "Construction clean after demo", 6, 55], ["trip", "Debris bags & disposal fee", 1, 135]],
      resolution: "Swept, vacuumed and bagged demo debris; unit ready for the floor refinisher.",
      meta: { area: "Whole unit", tags: ["Turn"], vendorInvoiceNo: "CVC-3302", vendorInvoiceDate: day(-3), vendorInvoiceAmount: 465, paymentTerms: "Net 30" } },
    { n: 60, name: "Final rent-ready clean — L-401", at: "L-401", category: "Cleaning", sub: "Move-out clean", priority: "Medium", status: "Scheduled",
      vendor: 5, opened: [-2, 15], scheduled: 19, due: 20, source: "turn", turn: turnId(3), window: ["09:00", "15:00"],
      meta: { area: "Whole unit", tags: ["Turn"], estimateAmount: 420, entryPermission: "allowed", keyLocation: "Cascade site office lockbox",
        assignmentNotes: "Book after the floor refinish has cured 72 hours. Windows inside and out." } },
    { n: 42, name: "Range igniter replacement — B-101", at: "B-101", tenant: null, category: "Appliance", sub: "Stove / oven", priority: "Medium", status: "Completed",
      vendor: 4, opened: [-57, 10], scheduled: -53, done: -53, source: "turn", turn: turnId(5),
      lines: [["labor", "Replace igniters and spark module", 1.5, 85], ["material", "Range igniter + spark module kit", 1, 387.5]],
      parts: [[18, 1, -53]], resolution: "Two burners wouldn't light — replaced igniters and the spark module.", cause: "Age of equipment",
      meta: { area: "Kitchen", tags: ["Turn"], vendorInvoiceNo: "SAR-4390", vendorInvoiceDate: day(-52), vendorInvoiceAmount: 515, paymentTerms: "Net 30" } },
    { n: 43, name: "Carpet clean — B-201", at: "B-201", category: "Cleaning", sub: "Carpet", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-14, 10], scheduled: -10, done: -10, source: "turn", turn: turnId(1),
      lines: [["labor", "Hot-water extraction", 3, 55], ["material", "Carpet solution & spotter", 1, 120]],
      resolution: "Extracted all carpet; pet stain by the window lifted.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 44, name: "Interior paint — B-201", at: "B-201", category: "General", sub: "Paint", priority: "Medium", status: "In progress",
      tech: IN_HOUSE, opened: [-12, 9], scheduled: -3, due: 2, source: "turn", turn: turnId(1),
      lines: [["labor", "Patch and paint walls and trim", 7, 45], ["material", "Harbor White eggshell (5 gal)", 1, 165]],
      parts: [[9, 1, -3]], meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 45, name: "Garage drywall patch & interior paint — TH-4", at: "TH-4", category: "General", sub: "Walls / ceiling", priority: "Medium", status: "Completed",
      tech: "Sound Painting & Drywall (sub)", techPhone: "(253) 555-0171", opened: [-54, 9], scheduled: -51, done: -48, source: "turn", turn: turnId(2), inspection: inspectionId(7),
      lines: [["labor", "Patch garage hole, repaint interior (paint supplied from stock)", 1, 1410], ["material", "Drywall, mud & tape", 1, 240]],
      resolution: "Patched the 6in garage hole and repainted the whole interior in Harbor White.", cause: "Tenant damage",
      meta: { area: "Whole unit", tags: ["Turn"], tenantCaused: true, chargebackReason: "Garage drywall damage — deducted from the deposit",
        vendorInvoiceNo: "SPD-418", vendorInvoiceDate: day(-47), vendorInvoiceAmount: 1650, paymentTerms: "Net 30" } },
    { n: 46, name: "Upstairs carpet replacement — TH-4", at: "TH-4", category: "General", sub: "Flooring", priority: "Medium", status: "Scheduled",
      tech: "Evergreen Flooring Co. (sub)", techPhone: "(253) 555-0188", opened: [-31, 11], scheduled: 2, due: 3, source: "turn", turn: turnId(2),
      lines: [["material", "Carpet + pad, 62 sq yd", 1, 1480], ["labor", "Install and haul-away", 1, 500]],
      approval: { status: "Approved", requested: -30, decided: -29, method: "Email", notes: "Approved — the turn may run up to $5,000 total." },
      steps: [
        ["Open", -31, 11, "Jordan Lee", "Created from unit turn \"TH-4 turn — garage + carpet\""],
        ["Scheduled", -29, 17, "Jordan Lee", "Install booked; carpet prepaid to lock the order"],
        ["On hold", -12, 10, "Jordan Lee", "Waiting on parts — carpet backordered at the mill"],
        ["Scheduled", -1, 15, "Jordan Lee", "New install date confirmed"],
      ],
      meta: { area: "Bedroom", tags: ["Turn"], vendorInvoiceNo: "EFC-7720", vendorInvoiceDate: day(-29), vendorInvoiceAmount: 1980, paymentTerms: "Due on receipt",
        assignmentNotes: "Paid in full up front to secure the mill order; install slipped a week on the backorder." } },
    { n: 47, name: "Replace garage door opener — TH-4", at: "TH-4", category: "General", sub: "Doors / locks", priority: "Medium", status: "Completed",
      vendor: 2, opened: [-38, 10], scheduled: -31, done: -30, source: "turn", turn: turnId(2),
      lines: [["labor", "Remove old opener, install and program", 2, 110], ["material", "1/2 HP belt-drive opener", 1, 560]],
      approval: { status: "Approved", requested: -37, decided: -36, method: "Email" },
      resolution: "Installed a new belt-drive opener with two remotes and a keypad.", cause: "Age of equipment", warranty: 365,
      meta: { area: "Garage", tags: ["Turn", "Warranty"], asset: "Garage door opener", assetMake: "Chamberlain", assetModel: "B4545T", underWarranty: true,
        warrantyProvider: "Chamberlain", warrantyExpires: day(365 * 5 - 30),
        vendorInvoiceNo: "BLE-20955", vendorInvoiceDate: day(-20), vendorInvoiceAmount: 780, paymentTerms: "Net 30" } },
    { n: 48, name: "Demo & haul-away — L-401", at: "L-401", category: "General", sub: "Other", priority: "Medium", status: "Completed",
      tech: "Cascade Demo & Haul (sub)", techPhone: "(206) 555-0139", opened: [-32, 9], scheduled: -30, done: -27, source: "turn", turn: turnId(3),
      lines: [["labor", "Demo kitchen backsplash and damaged flooring", 1, 720], ["trip", "20-yd dumpster & haul-away", 1, 480]],
      resolution: "Removed the backsplash and damaged hardwood at the entry; dumpster hauled.",
      meta: { area: "Whole unit", tags: ["Turn", "Capital expense"], vendorInvoiceNo: "CDH-0318", vendorInvoiceDate: day(-26), vendorInvoiceAmount: 1200, paymentTerms: "Net 30" } },
    { n: 49, name: "Replace kitchen fixtures — L-401", at: "L-401", category: "Plumbing", sub: "Faucet / fixture", priority: "Medium", status: "In progress",
      tech: IN_HOUSE, opened: [-10, 9], scheduled: -1, due: 14, source: "turn", turn: turnId(3),
      lines: [["material", "Faucet, sink & cabinet pulls", 1, 640]],
      meta: { area: "Kitchen", tags: ["Turn"], estimateAmount: 1100 } },
    { n: 50, name: "Refinish hardwood floors — L-401", at: "L-401", category: "General", sub: "Flooring", priority: "Medium", status: "Scheduled",
      tech: "Northwest Hardwood Floors (sub)", techPhone: "(206) 555-0147", opened: [-20, 13], scheduled: 10, due: 16, source: "turn", turn: turnId(3),
      lines: [["trip", "50% deposit — sand & refinish 780 sq ft", 1, 2400]],
      approval: { status: "Approved", amount: 4800, requested: -19, decided: -17, method: "Owner portal", notes: "Approved with the loft renovation." },
      meta: { area: "Whole unit", tags: ["Turn", "Capital expense"], estimateAmount: 4800,
        vendorInvoiceNo: "NWH-5512", vendorInvoiceDate: day(-19), vendorInvoiceAmount: 2400, paymentTerms: "Due on receipt" } },
    { n: 51, name: "Carpet clean — N-201", at: "N-201", category: "Cleaning", sub: "Carpet", priority: "Low", status: "Completed",
      vendor: 5, opened: [-33, 9], scheduled: -30, done: -30, source: "turn", turn: turnId(4),
      lines: [["labor", "Hot-water extraction", 2, 55], ["material", "Carpet solution & deodorizer", 1, 130]],
      resolution: "Carpets extracted and deodorized.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 52, name: "Deep clean — N-201", at: "N-201", category: "Cleaning", sub: "Move-out clean", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-24, 9], scheduled: -16, done: -16, source: "turn", turn: turnId(4),
      lines: [["labor", "Move-out deep clean", 6, 55], ["material", "Cleaning supplies", 1, 30]],
      resolution: "Rent-ready clean incl. appliances and windows.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 53, name: "Floor refinish — L-201", at: "L-201", category: "General", sub: "Flooring", priority: "Medium", status: "Completed",
      tech: "Northwest Hardwood Floors (sub)", techPhone: "(206) 555-0147", opened: [-62, 10], scheduled: -55, done: -52, source: "turn", turn: turnId(6),
      lines: [["trip", "Screen & recoat 650 sq ft", 1, 1450]],
      approval: { status: "Approved", requested: -61, decided: -60, method: "Owner portal" },
      resolution: "Screened and recoated the hardwood; 72-hour cure.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 54, name: "Deep clean — L-201", at: "L-201", category: "Cleaning", sub: "Move-out clean", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-30, 10], scheduled: -26, done: -26, source: "turn", turn: turnId(6),
      lines: [["labor", "Move-out deep clean", 6, 55], ["material", "Cleaning supplies", 1, 50]],
      resolution: "Final clean after the floor cure.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 55, name: "Move-out clean — S-102", at: "S-102", tenant: null, category: "Cleaning", sub: "Move-out clean", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-68, 10], scheduled: -64, done: -64, source: "turn", turn: turnId(9),
      lines: [["labor", "Move-out deep clean", 6, 55], ["material", "Cleaning supplies", 1, 60]],
      resolution: "Move-out clean before the new resident.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 56, name: "Interior paint — A-301", at: "A-301", tenant: null, category: "General", sub: "Paint", priority: "Medium", status: "Completed",
      tech: IN_HOUSE, opened: [-125, 9], scheduled: -118, done: -112, source: "turn", turn: turnId(10),
      lines: [["labor", "Patch and paint walls and trim", 12, 45], ["material", "Harbor White eggshell (5 gal)", 1, 165], ["material", "Patch & caulk", 1, 15]],
      parts: [[9, 1, -112]], resolution: "Two-bedroom repaint, ceilings touched up.", meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 57, name: "Replace smoke detectors — L-302", at: "L-302", tenant: null, category: "Electrical", sub: "Smoke / CO detector", priority: "Medium", status: "Completed",
      tech: IN_HOUSE, opened: [-85, 9], done: -84, source: "turn", turn: turnId(11),
      lines: [["labor", "Swap and test detectors", 1, 45], ["material", "Smoke detector, 10-year sealed battery", 3, 28.5]],
      parts: [[10, 3, -84]], resolution: "Replaced three expired detectors before move-in; all tested.", cause: "Age of equipment",
      meta: { area: "Whole unit", tags: ["Turn"] } },
    { n: 58, name: "Deep clean — L-302", at: "L-302", tenant: null, category: "Cleaning", sub: "Move-out clean", priority: "Medium", status: "Completed",
      vendor: 5, opened: [-88, 10], scheduled: -83, done: -83, source: "turn", turn: turnId(11),
      lines: [["labor", "Move-out deep clean", 7, 55], ["material", "Cleaning supplies", 1, 25]],
      resolution: "Rent-ready clean before move-in.", meta: { area: "Whole unit", tags: ["Turn"] } },
  ];
}

// ---- Preventive & recurring schedules ----------------------------------------------

// Occurrence dates back from the last one (oldest first) for a frequency rule.
function occurrences(rule, lastDays, count) {
  const out = [day(lastDays)];
  for (let i = 1; i < count; i += 1) {
    const d = parseDay(out[0]);
    if (rule.frequency === "Weekly") d.setDate(d.getDate() - 7);
    else if (rule.frequency === "Biweekly") d.setDate(d.getDate() - 14);
    else if (rule.frequency === "Custom" && rule.intervalUnit === "weeks") d.setDate(d.getDate() - 7 * rule.intervalCount);
    else {
      const months = { Monthly: 1, Bimonthly: 2, Quarterly: 3, "Semi-annually": 6, Annually: 12 }[rule.frequency] || rule.intervalCount || 1;
      d.setMonth(d.getMonth() - months);
    }
    out.unshift(toDay(d));
  }
  return out;
}

const daysUntil = (ymd) => Math.round((parseDay(ymd) - parseDay(day(0))) / 86400000);

// Schedule specs. `n` 1–10 patch the playground rows; 11+ are new. `history` builds
// the completed work orders each past occurrence generated ([last days, count]).
function pmSpecs() {
  return [
    { n: 1, scope: "property", leadDays: 7, skipIfOpen: true, priority: "Low", estimatedHours: 2, technician: "Jin Park", notifyTenant: true,
      contractRef: "EHS-PM-2026-03", history: [-39, 2], existing: sbWo(11), woBase: 201,
      wo: { vendor: 3, sub: "Filter change", lines: [["labor", "Swap and date-label 18 air-handler filters", 2, 105], ["material", "HVAC filters from B1 stock", 1, 170]], parts: [[1, 16, 0], [2, 2, 0]],
        resolution: "All Tower A air handlers done; filters date-labelled." } },
    { n: 2, scope: "property", leadDays: 21, priority: "High", estimatedHours: 4, requireApproval: false, shareWithOwner: true,
      instructions: "Annual alarm panel test plus tagging every extinguisher in both towers. Fire marshal witness required for the panel test.",
      activityNotes: "Overdue — Brightline confirmed Oct 27; waiting on the fire marshal to confirm the witness slot.",
      steps: ["Test the alarm panel and every pull station", "Tag all extinguishers", "Recharge any below the green", "File the report with the fire marshal"],
      history: [-370, 1], woBase: 202,
      wo: { vendor: 2, lines: [["labor", "Panel test, pull stations and extinguisher tags", 4, 110], ["material", "Extinguisher recharge (3) + tags", 1, 210]],
        resolution: "Panel passed; three extinguishers recharged and all tagged." } },
    { n: 3, scope: "all_units", leadDays: 14, priority: "Medium", estimatedHours: 6, activeMonths: ["10"], notifyTenant: true, entryPermission: "call_first",
      instructions: "One visit per townhome before the heating season. Coordinate entry with each resident.",
      history: [-362, 1], woBase: 203, units: ["TH-1", "TH-2", "TH-3", "TH-4"], tenants: { "TH-3": null, "TH-4": "Emily Davis" },
      wo: { vendor: 3, lines: [["labor", "Furnace tune-up", 2, 105], ["material", "Filter, flame-sensor clean, igniter check", 1, 90]],
        resolution: "Burners cleaned, flame sensor polished, filter replaced; heat exchanger checked." } },
    { n: 4, scope: "property", leadDays: 10, priority: "Low", estimatedHours: 6, activeMonths: ["4", "10"],
      instructions: "Clear gutters and downspouts on all four townhomes; flush downspouts and check splash blocks.",
      steps: ["Clear gutters", "Flush downspouts", "Photograph any loose hangers"],
      history: [-175, 1], woBase: 207,
      wo: { vendor: 6, field: true, lines: [["labor", "Clear gutters and flush downspouts", 6, 60], ["trip", "Lift rental", 1, 180]],
        resolution: "Gutters cleared and downspouts flushed; re-hung one loose hanger on TH-3." } },
    { n: 5, scope: "property", leadDays: 0, priority: "Low", estimatedHours: 4, contractRef: "CLS-2026-PC",
      instructions: "Weekly mow, edge, blow and bed care under the annual grounds contract — billed monthly, no work orders.",
      steps: ["Mow and edge", "Blow walks and parking", "Bed care / weeding"] },
    { n: 6, scope: "property", leadDays: 3, priority: "Medium", estimatedHours: 7,
      instructions: "Hallways, stairwells, laundry rooms and the leasing office at both buildings.",
      steps: ["Vacuum and spot-clean hallway carpet", "Mop stairwells", "Wipe down laundry machines", "Clean leasing office"],
      history: [-18, 3], woBase: 208,
      wo: { vendor: 5, sub: "Common area", lines: [["labor", "Common-area deep clean", 7, 55], ["material", "Cleaning supplies", 1, 35]],
        resolution: "Both buildings done; laundry room lint traps cleared." } },
    { n: 7, scope: "all_units", leadDays: 14, priority: "Medium", estimatedHours: 12, notifyTenant: true,
      instructions: "Clean every dryer vent run to the roof jack in both towers.",
      activityNotes: "Overdue — Summit can start in Tower B next week." },
    { n: 8, scope: "assets", leadDays: 7, priority: "Medium", estimatedHours: 1,
      assets: [{ label: "Sump pump #1", location: "South Building crawlspace" }, { label: "Sump pump #2", location: "South Building crawlspace" }],
      steps: ["Lift float and confirm discharge", "Check the check valve", "Test the high-water alarm"],
      history: [-71, 1], woBase: 211,
      wo: { vendor: 1, lines: [["labor", "Test sump pumps and alarm", 1, 95], ["trip", "Trip charge", 1, 55]],
        resolution: "Both pumps cycled; alarm tested OK." } },
    { n: 9, scope: "unit", leadDays: 7, priority: "Low", estimatedHours: 1.5, entryPermission: "call_first", notifyTenant: true,
      steps: ["Flush tank", "Check anode rod", "Test T&P valve"],
      history: [-245, 1], woBase: 212,
      wo: { vendor: 1, sub: "Water heater", lines: [["labor", "Flush water heater", 1.5, 95], ["material", "Flush kit & anode check", 1, 37.5]],
        resolution: "Flushed sediment; anode at ~50%, replace next year." } },
    { n: 10, scope: "property", leadDays: 14, priority: "Medium", estimatedHours: 3, technician: IN_HOUSE,
      steps: ["Walk the roof membrane", "Clear drains and scuppers", "Photograph seams and flashing"],
      history: [-152, 1], woBase: 213,
      wo: { tech: IN_HOUSE, field: true, sub: "Roof", lines: [["labor", "Roof and drain inspection", 3, 45]],
        resolution: "Drains clear. Seams at the north parapet show early wear — monitor." } },
    // New schedules.
    { n: 11, name: "Quarterly HVAC service — Pinecrest Commons", at: "Pinecrest Commons", category: "HVAC", frequency: "Quarterly", vendor: 3, est: 1240, status: "Active",
      scope: "property", leadDays: 7, priority: "Low", estimatedHours: 8, contractRef: "EHS-PM-2026-07", notifyTenant: true,
      instructions: "Filters, coil check and condensate lines for every unit in both buildings.",
      steps: ["Replace filters", "Check coils and condensate lines", "Log refrigerant pressures"],
      history: [-39, 2], woBase: 214,
      wo: { vendor: 3, sub: "Filter change", lines: [["labor", "Quarterly HVAC service, both buildings", 8, 105], ["material", "Filters and condensate tablets", 1, 400]], parts: [[2, 12, 0]],
        resolution: "All units serviced; two condensate lines cleared.", invoice: ["EHS-7604", -38] } },
    { n: 12, name: "Quarterly pest treatment — Pinecrest Commons", at: "Pinecrest Commons", category: "Pest control", frequency: "Quarterly", tech: IN_HOUSE, est: 199, status: "Active",
      scope: "property", leadDays: 7, priority: "Medium", estimatedHours: 3, notifyTenant: true,
      instructions: "Exterior perimeter spray, bait stations at both trash enclosures; interior treatment on request.",
      steps: ["Perimeter treatment", "Refresh bait stations", "Log activity by building"],
      activityNotes: "Pulled forward a few days after the ant report in S-102.",
      history: [-88, 1], woBase: 216,
      wo: { tech: IN_HOUSE, sub: "Insects", lines: [["labor", "Perimeter treatment and bait stations", 3, 45], ["material", "Insecticide and bait", 1, 64]],
        resolution: "Perimeter treated; light activity at the South Building enclosure." } },
    { n: 13, name: "Summer irrigation check — Alder Court", at: "Alder Court Townhomes", category: "Landscaping", frequency: "Biweekly", vendor: 6, est: 120, status: "Ended",
      scope: "property", leadDays: 2, priority: "Low", estimatedHours: 2, activeMonths: ["5", "6", "7", "8", "9"], startDate: -167, endDate: -27,
      instructions: "Run each zone, adjust heads and check for leaks during the dry months.",
      steps: ["Run every zone", "Adjust or replace heads", "Check the controller schedule"],
      history: [-34, 2], woBase: 217,
      wo: { vendor: 6, sub: "Irrigation", lines: [["labor", "Irrigation zone check", 2, 60]], resolution: "All zones run; two heads adjusted." } },
    { n: 14, name: "Garage sweep & oil-stain treatment — The Marlowe", at: "The Marlowe", category: "Cleaning", frequency: "Bimonthly", vendor: 5, est: 360, status: "Active",
      scope: "property", leadDays: 5, priority: "Low", estimatedHours: 4, notifyTenant: true,
      instructions: "Sweep P1–P2, treat oil stains, and post move-your-car notices 48 hours ahead.",
      steps: ["Post move-your-car notices", "Sweep both levels", "Treat oil stains"],
      history: [-36, 1], woBase: 219,
      wo: { vendor: 5, sub: "Common area", lines: [["labor", "Garage sweep and stain treatment", 4, 55], ["material", "Oil-stain degreaser", 1, 140]],
        resolution: "Both levels swept; stains treated in 9 stalls." } },
    { n: 15, name: "Emergency lighting & exit sign test", at: "The Marlowe", category: "Electrical", frequency: "Custom", intervalCount: 6, intervalUnit: "weeks", vendor: 2, est: 220, status: "Active",
      scope: "assets", leadDays: 3, priority: "Medium", estimatedHours: 2,
      assets: [
        { label: "Stairwell A emergency lights", location: "Tower A, floors 1–6" },
        { label: "Stairwell B emergency lights", location: "Tower B, floors 1–4" },
        { label: "Lobby exit signs", location: "Main lobby" },
        { label: "Garage exit signs", location: "P1–P2" },
      ],
      steps: ["30-second battery test", "Replace failed lamps", "Log results"],
      history: [-30, 1], woBase: 220,
      wo: { vendor: 2, sub: "Lighting", lines: [["labor", "Emergency lighting test", 2, 110]], resolution: "All fixtures passed; one exit sign lamp replaced." } },
    { n: 16, name: "Smoke & CO detector test — every unit", at: "Pinecrest Commons", category: "Electrical", frequency: "Semi-annually", tech: IN_HOUSE, est: 180, status: "Paused",
      scope: "all_units", leadDays: 14, priority: "High", estimatedHours: 4, notifyTenant: true, entryPermission: "allowed", nextDue: 9,
      instructions: "Test every smoke and CO detector; swap any past 10 years for sealed-battery units.",
      steps: ["Test smoke detectors", "Test CO detectors", "Replace expired units"],
      activityNotes: "Paused until the 10-year sealed detectors arrive (PO-2236) — swap and test in one visit." },
  ];
}

function seedPmSchedules() {
  const rows = C.rows("pm_schedules");
  const generatedWos = [];
  for (const s of pmSpecs()) {
    let row;
    if (s.n <= 10) {
      // Playground schedules keep their name, location and vendor; only the roof walk is paused.
      row = C.byId("pm_schedules", pmId(s.n));
      row.status = s.n === 10 ? "Paused" : "Active";
    } else {
      const loc = place(s.at, null);
      const v = s.vendor ? vendorOf(s.vendor) : null;
      row = {
        id: pmId(s.n), name: s.name, property_id: loc.cols.property_id, property_name: loc.propertyName,
        unit_id: null, unit: "", category: s.category, frequency: s.frequency, next_due: null,
        vendor_id: v?.id ?? null, vendor_name: v?.name ?? "", estimated_cost: s.est, status: s.status, metadata: {},
      };
      rows.push(row);
    }
    const rule = { frequency: row.frequency, intervalCount: s.intervalCount, intervalUnit: s.intervalUnit };
    const meta = {
      ...row.metadata,
      scope: s.scope,
      // Manual only: the daily preventive job must never generate demo work orders.
      autoGenerate: false,
      leadDays: s.leadDays,
      skipIfOpen: Boolean(s.skipIfOpen),
      priority: s.priority,
      estimatedHours: s.estimatedHours,
      ...(s.intervalCount ? { intervalCount: s.intervalCount, intervalUnit: s.intervalUnit } : {}),
      ...(s.activeMonths ? { activeMonths: s.activeMonths } : {}),
      ...(s.technician || s.tech ? { technician: s.technician || s.tech } : {}),
      ...(s.entryPermission ? { entryPermission: s.entryPermission } : {}),
      notifyTenant: Boolean(s.notifyTenant),
      shareWithOwner: Boolean(s.shareWithOwner),
      requireApproval: Boolean(s.requireApproval),
      ...(s.contractRef ? { contractRef: s.contractRef } : {}),
      ...(s.instructions ? { instructions: s.instructions } : {}),
      ...(s.steps ? { steps: labelled(`pm${s.n}-s`, s.steps) } : {}),
      ...(s.assets ? { assets: list(`pm${s.n}-a`, s.assets) } : {}),
      ...(s.activityNotes ? { activityNotes: s.activityNotes } : {}),
    };

    // Past occurrences → completed work orders, then next due from the last one.
    const dates = s.history ? occurrences(rule, s.history[0], s.history[1]) : [];
    const lead = Math.max(1, Math.min(s.leadDays || 2, 7));
    const generated = [];
    dates.forEach((due, i) => {
      const dueDays = daysUntil(due);
      const isExisting = s.existing && i === dates.length - 1;
      if (isExisting) {
        generated.push({ id: s.existing, label: row.property_name || row.name, date: due });
        return;
      }
      const units = s.units || [null];
      units.forEach((label, k) => {
        const n = s.woBase + i * units.length + k;
        const invoice = i === dates.length - 1 ? s.wo.invoice : null;
        const spec = {
          n,
          name: row.name,
          field: s.wo.field,
          at: label || (row.unit_id ? C.core.UNITS.find((u) => u.id === row.unit_id).label : row.property_name),
          tenant: label && s.tenants && label in s.tenants ? s.tenants[label] : undefined,
          category: row.category,
          sub: s.wo.sub || "Other",
          priority: s.priority,
          status: "Completed",
          vendor: s.wo.vendor,
          tech: s.wo.tech,
          opened: [dueDays - lead, 9],
          scheduled: dueDays,
          due: dueDays,
          done: dueDays + (s.wo.doneLag ?? 0),
          source: "pm",
          openNote: "Generated from preventive schedule",
          lines: s.wo.lines,
          parts: s.wo.parts ? s.wo.parts.map(([inv, qty]) => [inv, qty, dueDays]) : undefined,
          resolution: s.wo.resolution,
          checklist: (meta.steps || []).map((x) => x.label),
          pm: row.id,
          pmDue: due,
          meta: {
            pmScheduleName: row.name,
            estimateAmount: Number(row.estimated_cost) || 0,
            tags: ["Recurring"],
            ...(label || row.unit_id ? {} : { commonArea: true }),
            ...(s.entryPermission ? { entryPermission: s.entryPermission } : {}),
            ...(invoice ? { vendorInvoiceNo: invoice[0], vendorInvoiceDate: day(invoice[1]), vendorInvoiceAmount: Number(row.estimated_cost), paymentTerms: "Net 30" } : {}),
          },
        };
        const w = workOrder(spec);
        generatedWos.push(w);
        generated.push({ id: w.id, label: w.property_label || w.name, date: due });
      });
    });

    if (dates.length) {
      const last = dates[dates.length - 1];
      meta.startDate = dates[0];
      meta.lastGenerated = day(daysUntil(last) - lead);
      meta.generated = generated.reverse();
      const next = advanceDue({ ...rule, ...meta }, last);
      if (s.endDate != null) {
        meta.endDate = day(s.endDate);
        meta.startDate = day(s.startDate);
      }
      row.next_due = row.status === "Ended" ? null : next || null;
    } else if (s.nextDue != null) {
      row.next_due = day(s.nextDue);
    }
    // No history yet: the schedule started about a year before its next occurrence.
    if (!meta.startDate && row.next_due) {
      const perYear = { Weekly: 53, Biweekly: 27, Monthly: 13, Bimonthly: 7, Quarterly: 5, "Semi-annually": 3, Annually: 2 }[row.frequency] || 2;
      meta.startDate = occurrences(rule, daysUntil(row.next_due), perYear)[0];
    }
    row.metadata = meta;
  }
  return generatedWos;
}

// ---- Unit turns -----------------------------------------------------------------------

const TURN_TASKS = [
  ["Move-out inspection", "manager"],
  ["Repairs & punch list", "Ben Alvarez"],
  ["Paint & touch-ups", "Ben Alvarez"],
  ["Flooring / carpet clean", "ClearView Cleaning"],
  ["Deep clean", "ClearView Cleaning"],
  ["Replace locks / re-key", "Ben Alvarez"],
  ["Final walkthrough", "manager"],
];

// Standard checklist with owners and due dates spread from move-out to target.
// `done` is a count (first n tasks) or the labels that are done; `active` is In progress.
function turnChecklist(n, { done, moveOut, target, mgr, extra = [], blocked, active }) {
  const tasks = [...TURN_TASKS, ...extra.map((label) => [label, "Ben Alvarez"])];
  const span = Math.max(1, target - moveOut);
  const doneSet = new Set(Array.isArray(done) ? done : tasks.slice(0, done).map(([label]) => label));
  const current = active ?? (doneSet.size && doneSet.size < tasks.length ? tasks.find(([label]) => !doneSet.has(label) && label !== blocked)?.[0] : null);
  return tasks.map(([label, owner], i) => {
    const isDone = doneSet.has(label);
    const status = isDone ? "Done" : label === blocked ? "Blocked" : label === current ? "In progress" : "To do";
    return {
      id: `turn${n}-c-${i + 1}`,
      label,
      owner: owner === "manager" ? mgr : owner,
      dueDate: day(moveOut + Math.round(((i + 1) * span) / tasks.length)),
      status,
      done: isDone,
    };
  });
}

// Turn specs: n 1–8 patch the playground rows; 9+ add earlier (leased) turns.
function turnSpecs() {
  return [
    { n: 1, label: "B-201", moveOut: -18, target: 3, done: ["Move-out inspection", "Repairs & punch list", "Flooring / carpet clean", "Replace locks / re-key"],
      active: "Paint & touch-ups", turnType: "Standard", keysReturned: -18, inspectionDate: -17, marketedOn: -10,
      costs: [["Re-key (2 cylinders)", 25], ["Blinds — 2 windows", 96]], budgetNotes: "Light turn — previous resident stayed 4 years.",
      scopeNotes: "Studio refresh: carpet clean, full repaint, new blinds and re-key." },
    { n: 2, label: "TH-4", moveOut: -55, target: -6, move: 6,
      done: ["Move-out inspection", "Repairs & punch list", "Paint & touch-ups", "Deep clean", "Replace garage door opener"], active: "Replace locks / re-key", turnType: "Heavy", keysReturned: -55, inspectionDate: -54, extra: ["Replace garage door opener"],
      blocked: "Flooring / carpet clean", costs: [["Toilet reset & wax ring", 45], ["Bulbs and detector batteries", 38]],
      budgetNotes: "Owner approved going over budget (up to $5,000) for the upstairs carpet.",
      scopeNotes: "Carpet stained in bedroom 2, 6\" hole in the garage drywall, opener at end of life. Deposit deductions itemized ($425)." },
    { n: 3, label: "L-401", moveOut: -30, target: 21, done: 2, active: "Replace kitchen fixtures", turnType: "Renovation", keysReturned: -30, inspectionDate: -29,
      extra: ["Refinish hardwood floors", "Replace kitchen fixtures"],
      budgetNotes: "Renovation budget approved by Northwind with the lobby work.",
      scopeNotes: "Loft renovation: demo backsplash and entry flooring, new kitchen fixtures, refinish hardwood throughout." },
    { n: 4, label: "N-201", moveOut: -40, target: -12, done: 7, ready: -13, turnType: "Standard", keysReturned: -40, inspectionDate: -39, marketedOn: -12,
      nextTenant: "Jamal Carter", nextMoveIn: 21, walkthroughBy: "Jordan Lee",
      costs: [["Paint supplies (in-house labor)", 580], ["Blinds and re-key", 460]] },
    { n: 5, label: "B-101", moveOut: -60, target: -35, done: 7, ready: -36, turnType: "Standard", keysReturned: -60, inspectionDate: -59, marketedOn: -34,
      nextTenant: "Zoe Nguyen", nextMoveIn: 14, walkthroughBy: "Alex Rivera",
      costs: [["Paint touch-ups — ClearView CVC-3240", 320], ["Deep clean — ClearView CVC-3244", 340], ["Re-key — CVC-3252", 120]] },
    { n: 6, label: "L-201", moveOut: -70, target: -20, done: 7, ready: -22, turnType: "Standard", keysReturned: -70, inspectionDate: -69, marketedOn: -21, walkthroughBy: "Alex Rivera",
      costs: [["Paint", 920], ["Light fixtures", 300]] },
    { n: 7, label: "A-202", moveOut: 30, target: 40, done: 0, move: 4, turnType: "Standard", inspectionDate: 29,
      scopeNotes: "Pre-move-out walkthrough with Lucas booked the day before move-out. Expect paint and a carpet clean." },
    { n: 8, label: "TH-3", moveOut: 15, target: 25, done: 0, move: 2, turnType: "Standard", inspectionDate: -2,
      scopeNotes: "Pre-move-out walk: minor nail holes in the living room, carpet wear in the primary bedroom. Final walk on move-out day." },
    { n: 9, label: "S-102", name: "S-102 turn", moveOut: -72, target: -48, done: 7, ready: -46, status: "Leased", budget: 1200, turnType: "Light",
      keysReturned: -72, inspectionDate: -71, marketedOn: -46, nextTenant: "Ethan Walker", nextMoveIn: -40, walkthroughBy: "Jordan Lee",
      costs: [["Paint touch-ups", 260]] },
    { n: 10, label: "A-301", name: "A-301 turn", moveOut: -132, target: -105, done: 7, ready: -103, status: "Leased", budget: 1500, turnType: "Standard",
      keysReturned: -132, inspectionDate: -131, marketedOn: -104, nextTenant: "Hannah Brooks", nextMoveIn: -95, walkthroughBy: "Alex Rivera",
      costs: [["Carpet clean (in-house machine)", 140]] },
    { n: 11, label: "L-302", name: "L-302 turn", moveOut: -108, target: -82, done: 7, ready: -80, status: "Leased", budget: 1400, turnType: "Light",
      keysReturned: -108, inspectionDate: -107, marketedOn: -81, nextTenant: "Liam O'Connor", nextMoveIn: -75, walkthroughBy: "Alex Rivera",
      costs: [["Touch-up paint", 180]] },
  ];
}

function seedUnitTurns() {
  const rows = C.rows("unit_turns");
  for (const s of turnSpecs()) {
    const u = unitAt(s.label);
    const mgr = managerOf(u.propertyName);
    let row = s.n <= 8 ? C.byId("unit_turns", turnId(s.n)) : null;
    if (!row) {
      row = { id: turnId(s.n), name: s.name, unit_id: u.id, unit: u.display, property_name: u.propertyName, budget: s.budget, status: s.status, metadata: {} };
      rows.push(row);
    }
    Object.assign(row, {
      property_id: u.propertyId,
      move_out_date: day(s.moveOut),
      target_ready_date: day(s.target),
      ready_date: s.ready == null ? null : day(s.ready),
      move_id: s.move ? moveId(s.move) : null,
    });
    const { activityNotes, assignedTo } = row.metadata || {};
    row.metadata = {
      assignedTo: (assignedTo || `${mgr} (property manager)`).replace("Sam Ortiz", "Ben Alvarez"),
      turnType: s.turnType,
      rush: Boolean(s.rush),
      checklist: turnChecklist(s.n, { done: s.done, moveOut: s.moveOut, target: s.target, mgr, extra: s.extra, blocked: s.blocked, active: s.active }),
      ...(s.costs ? { costs: list(`turn${s.n}-k`, s.costs.map(([label, amount]) => ({ label, amount }))) } : {}),
      ...(s.keysReturned != null ? { keysReturned: day(s.keysReturned) } : {}),
      ...(s.inspectionDate != null ? { inspectionDate: day(s.inspectionDate) } : {}),
      ...(s.marketedOn != null ? { marketedOn: day(s.marketedOn) } : {}),
      ...(s.nextTenant ? { nextTenant: s.nextTenant, nextMoveInDate: day(s.nextMoveIn) } : {}),
      ...(s.walkthroughBy ? { walkthroughBy: s.walkthroughBy } : {}),
      ...(s.budgetNotes ? { budgetNotes: s.budgetNotes } : {}),
      ...(s.scopeNotes ? { scopeNotes: s.scopeNotes } : {}),
      ...(activityNotes ? { activityNotes } : {}),
      photos: s.moveOut < 0 ? photos(`turn${s.n}-ph`, [`${s.label} move-out — living room.jpg`, `${s.label} move-out — kitchen.jpg`]) : [],
    };
  }
}

// ---- Vendor assignments -------------------------------------------------------------

const ASSIGNMENT_NOTES = {
  1: "Bring a loaner space heater if the board is bad.",
  3: "Moisture readings every 48 hours until under 15%.",
  5: "GFCIs backordered — Brightline returns once the parts land.",
};

function seedVendorAssignments(newWorkOrders) {
  const rows = C.rows("vendor_assignments");
  for (const row of rows) {
    const n = Number(row.id.slice(-8));
    const w = C.byId("work_orders", row.work_order_id);
    row.created_at = w?.metadata?.statusHistory?.find((h) => h.status === "Scheduled")?.at || w?.created_at;
    if (ASSIGNMENT_NOTES[n]) row.metadata = { ...row.metadata, notes: ASSIGNMENT_NOTES[n] };
    // The N-102 disposal was finished yesterday on the rebooked visit.
    if (n === 4) Object.assign(row, { status: "Completed", scheduled_date: day(-1) });
  }
  for (const w of newWorkOrders) {
    if (!w.vendor_id) continue;
    const n = Number(w.id.slice(-8));
    const acceptance = w.metadata.vendorAcceptance;
    const status =
      w.status === "Completed" ? "Completed"
        : w.status === "In progress" ? "In progress"
          : acceptance === "Declined" ? "Declined"
            : acceptance === "Accepted" ? "Accepted"
              : "Assigned";
    rows.push({
      id: C.sid(G.assignment, n),
      name: w.name,
      vendor_id: w.vendor_id,
      vendor_name: w.vendor_name,
      work_order_id: w.id,
      work_order_label: w.name,
      scheduled_date: w.scheduled_date,
      status,
      created_at: w.metadata.statusHistory.find((h) => h.status === "Scheduled")?.at || w.created_at,
      metadata: w.metadata.assignmentNotes ? { notes: w.metadata.assignmentNotes } : {},
    });
  }
}

// ---- Maintenance attachments ------------------------------------------------------------

function seedAttachments() {
  const rows = C.rows("maintenance_attachments");
  const sizes = [2_480_000, 1_920_000, 184_000, 2_210_000, 96_000, 3_400_000, 88_000, 142_000];
  const sandboxWo = { 1: 1, 2: 5, 3: 5, 4: 7, 5: 9, 6: 9, 7: 10, 8: 11 };
  rows.forEach((row, i) => {
    const n = Number(row.id.slice(-8));
    row.metadata = { ...row.metadata, workOrderId: sbWo(sandboxWo[n]), sizeBytes: sizes[i % sizes.length] };
  });
  const byN = (n) => C.byId("work_orders", wo(n));
  // [n, file name, category, work order, days, hour, size]
  const specs = [
    [1, "TH-1 garage sensor alignment.jpg", "Photo", byN(7), -3, 12, 1_640_000],
    [2, "Tree limb across stalls 14–17.jpg", "Photo", byN(11), -1, 8, 2_870_000],
    [3, "Loft roof ponding — walkthrough.mp4", "Video", byN(14), -6, 15, 18_400_000],
    [4, "Summit Roofing quote — Loft membrane.pdf", "Document", byN(14), -2, 11, 212_000],
    [5, "Evergreen HVAC invoice EHS-7731 — boiler tune-up.pdf", "Invoice", byN(26), -5, 10, 118_000],
    [6, "Boiler combustion analysis.pdf", "Document", byN(26), -7, 16, 340_000],
    [7, "ClearView invoice CVC-3302 — L-401.pdf", "Invoice", byN(27), -3, 9, 96_000],
    [8, "Rainier invoice RPC-11788 — main line jetting.pdf", "Invoice", byN(28), -22, 10, 104_000],
    [9, "South Building sewer camera run.mp4", "Video", byN(28), -24, 14, 42_000_000],
    [10, "Summit invoice SAR-4418 — N-102 dishwasher.pdf", "Invoice", byN(29), -31, 12, 91_000],
    [11, "Brightline invoice BLE-20931 — lobby lighting.pdf", "Invoice", byN(20), -34, 10, 133_000],
    [12, "LED retrofit fixture spec sheet.pdf", "Manual", byN(20), -40, 15, 1_210_000],
    [13, "Chamberlain B4545T opener manual.pdf", "Manual", byN(47), -30, 16, 4_800_000],
    [14, "N-102 bathroom ceiling mold.jpg", "Photo", byN(3), -3, 18, 2_050_000],
    [15, "B-102 cracked window.jpg", "Photo", byN(36), -63, 9, 1_730_000],
    [16, "TH-4 carpet quote — Northwest Flooring.pdf", "Document", byN(46), -24, 10, 156_000],
  ];
  for (const [n, name, category, w, d, h, size] of specs) {
    rows.push({
      id: C.sid(G.attachment, n), name, category, work_order_label: w.name, url: "", status: "Active",
      created_at: at(d, h), metadata: { workOrderId: w.id, sizeBytes: size },
    });
  }
}

// ---- Amenity reservations & resident events ---------------------------------------------

// Local [start, end] ISO timestamps for a slot n days out ("HH:MM").
function slot(n, from, to) {
  const stamp = (hhmm) => {
    const [hh, mm] = hhmm.split(":").map(Number);
    const t = new Date(C.isoDaysFromNow(n, hh));
    t.setMinutes(mm);
    return t.toISOString();
  };
  return [stamp(from), stamp(to)];
}

function seedReservations() {
  // The bookable shared spaces at The Marlowe: rooftop deck (approval, fee + deposit),
  // pet spa (30-min wash slots) and EV charging (instant, up to four at a time).
  // [n, amenity, resident, days, from, to, guests, status, fee, deposit, notes]
  const specs = [
    [1, "Rooftop deck", "Priya Raman", -55, "17:00", "21:00", 10, "approved", 75, 200, "Summer birthday — deposit refunded after inspection."],
    [2, "Rooftop deck", "Hannah Brooks", -38, "17:00", "21:00", 12, "approved", 75, 200, "Housewarming. Deposit refunded."],
    [3, "Rooftop deck", "Daniel Okafor", -12, "12:00", "16:00", 8, "approved", 75, 200, "Game-day BBQ — grill #2."],
    [4, "Rooftop deck", "Omar Haddad", -10, "18:00", "22:00", 26, "declined", 0, 0, "Declined — over the 20-guest limit; offered a weekday slot instead."],
    [5, "Rooftop deck", "Maya Chen", 4, "16:00", "20:00", 10, "approved", 75, 200, "Birthday dinner."],
    [6, "Rooftop deck", "Lucas Fernández", 9, "17:00", "21:00", 14, "requested", 75, 200, "Farewell party before the move-out."],
    [7, "Rooftop deck", "Priya Raman", 11, "18:00", "21:00", 6, "requested", 75, 200, "Requested from the resident portal."],
    [8, "Rooftop deck", "Hannah Brooks", 18, "10:00", "13:00", 4, "cancelled", 0, 0, "Cancelled by the resident — forecast rain."],
    [9, "EV charging", "Priya Raman", -6, "08:00", "10:00", 0, "approved", 0, 0, "Charger #2."],
    [10, "Pet spa", "Maya Chen", -2, "18:00", "18:30", 0, "approved", 0, 0, "Miso (shiba inu)."],
    [11, "EV charging", "Hannah Brooks", 1, "10:00", "12:00", 0, "approved", 0, 0, "Charger #4."],
    [12, "Rooftop deck", "Daniel Okafor", 3, "19:00", "21:00", 4, "approved", 75, 200, "Small dinner with neighbours."],
    [13, "Pet spa", "Omar Haddad", 5, "09:30", "10:00", 0, "cancelled", 0, 0, "Cancelled by the resident."],
    [14, "Pet spa", "Daniel Okafor", -15, "10:00", "10:30", 0, "approved", 0, 0, "Bella (golden retriever)."],
    [15, "Pet spa", "Hannah Brooks", -4, "15:00", "15:30", 0, "approved", 0, 0, "Two small dogs."],
    [16, "Pet spa", "Maya Chen", 2, "11:00", "11:30", 0, "approved", 0, 0, ""],
    [17, "Pet spa", "Lucas Fernández", 6, "09:00", "09:30", 0, "approved", 0, 0, "Pre-move-out wash for Rocco."],
    [18, "EV charging", "Omar Haddad", -3, "20:00", "22:00", 0, "approved", 0, 0, "Charger #2."],
    [19, "EV charging", "Priya Raman", -1, "18:00", "20:00", 0, "approved", 0, 0, "Charger #1."],
    [20, "EV charging", "Maya Chen", 1, "08:00", "10:00", 0, "approved", 0, 0, "Charger #3."],
    [21, "EV charging", "Hannah Brooks", 2, "19:00", "21:00", 0, "approved", 0, 0, "Charger #1."],
    [22, "EV charging", "Daniel Okafor", 7, "08:00", "10:00", 0, "requested", 0, 0, "Recurring Thursday slot request."],
  ];
  const rows = C.rows("amenity_reservations");
  for (const [n, amenity, resident, d, from, to, guests, status, fee, deposit, notes] of specs) {
    const a = amenityNamed(amenity);
    const t = tenantNamed(resident);
    const [startsAt, endsAt] = slot(d, from, to);
    rows.push({
      id: C.sid(G.reservation, n),
      amenity_id: a.id,
      amenity_name: a.name,
      tenant_id: t.id,
      tenant_name: t.name,
      unit_id: t.unitId,
      unit: t.unit,
      starts_at: startsAt,
      ends_at: endsAt,
      guests,
      status,
      fee,
      deposit,
      created_at: at(Math.min(d, 0) - 3, 20),
      metadata: { notes, requestedVia: n % 3 === 0 ? "Front desk" : "Resident portal" },
    });
  }
}

function seedResidentEvents() {
  // [n, name, property, amenity | null, days, from, to, location, capacity, status, description]
  const specs = [
    [1, "Summer BBQ in the courtyard", "Pinecrest Commons", null, -60, "16:00", "19:00", "Courtyard between North & South", 80, "Completed", "Burgers, veggie dogs and lawn games. 52 residents came."],
    [2, "Fire safety & extinguisher demo", "The Marlowe", null, -30, "18:00", "19:00", "Lobby", 30, "Completed", "Hands-on extinguisher training with Seattle Fire Station 2."],
    [3, "Lobby renovation preview & coffee", "Cascade Lofts", null, -16, "10:00", "12:00", "Temporary leasing office (L-101)", 25, "Completed", "Renderings of the new lobby and façade, plus Q&A with the contractor."],
    [4, "Yoga on the roof", "The Marlowe", "Rooftop deck", -9, "08:00", "09:00", "Rooftop deck", 20, "Completed", "All levels — bring a mat."],
    [5, "HIIT class", "The Marlowe", "Fitness centre", -2, "18:30", "19:15", "Fitness centre", 12, "Cancelled", "Instructor out sick — rescheduled."],
    [6, "Fall potluck", "Pinecrest Commons", null, 4, "17:00", "20:00", "Courtyard between North & South", 60, "Scheduled", "Bring a dish to share; we'll supply drinks and the fire pit."],
    [7, "HIIT class (rescheduled)", "The Marlowe", "Fitness centre", 5, "18:30", "19:15", "Fitness centre", 12, "Scheduled", "45-minute interval class — rescheduled from last week."],
    [8, "Rooftop movie night — The Princess Bride", "The Marlowe", "Rooftop deck", 10, "19:00", "21:30", "Rooftop deck", 40, "Scheduled", "Blankets, popcorn and a classic. Weather backup: lobby lounge."],
    [9, "Halloween trick-or-treat trail", "Alder Court Townhomes", null, 11, "17:30", "19:30", "Alder Ct loop", 0, "Scheduled", "Decorate your porch and hand out treats — map in the resident portal."],
    [10, "Pet meet-up & spa day", "The Marlowe", "Pet spa", 25, "11:00", "13:00", "Pet spa & courtyard", 25, "Scheduled", "Free nail trims and treats from Ballard Pet Co."],
    [11, "Winter prep workshop: frozen pipes", "Alder Court Townhomes", null, 32, "18:00", "19:00", "TH-1 garage (hosted by Aisha)", 15, "Scheduled", "How to drip faucets, find your shut-off and keep the garage warm."],
    [12, "Holiday lights contest kickoff", "Alder Court Townhomes", null, 45, "17:00", "18:30", "Alder Ct loop", 0, "Scheduled", "Judging the week before the holidays — prizes from the owners."],
  ];
  const rows = C.rows("resident_events");
  for (const [n, name, property, amenity, d, from, to, location, capacity, status, description] of specs) {
    const p = propertyNamed(property);
    const a = amenity ? amenityNamed(amenity) : null;
    const [startsAt, endsAt] = slot(d, from, to);
    rows.push({
      id: C.sid(G.event, n),
      name,
      property_id: p.id,
      property_name: p.name,
      amenity_id: a?.id ?? null,
      amenity_name: a?.name ?? "",
      starts_at: startsAt,
      ends_at: endsAt,
      location,
      description,
      capacity,
      status,
      created_at: at(Math.min(d, 0) - 21, 11),
      metadata: { host: managerOf(p.name) },
    });
  }
}

// ---- Checks ----------------------------------------------------------------------

// Warn when a seeded schedule could ever be picked up by the preventive job.
function checkPaused() {
  for (const r of C.rows("pm_schedules")) {
    const view = { ...(r.metadata || {}), status: r.status, nextDue: r.next_due || "" };
    const far = toDay(new Date(Date.now() + 800 * 86400000));
    if (r.status === "Active" && (r.metadata?.autoGenerate !== false || isOccurrenceDue(view, far))) {
      console.warn(`maintenance: preventive schedule "${r.name}" could be generated by the daily job`);
    }
  }
}

// ---- Entry ------------------------------------------------------------------------

export function apply(ctx) {
  C = ctx;
  seedInventory();
  patchPlaygroundWorkOrders();
  const fresh = workOrderSpecs().map(workOrder);
  const pmGenerated = seedPmSchedules();
  C.rows("work_orders").push(...fresh, ...pmGenerated);
  seedUnitTurns();
  seedVendorAssignments([...fresh, ...pmGenerated]);
  seedAttachments();
  seedReservations();
  seedResidentEvents();
  checkPaused();
}
