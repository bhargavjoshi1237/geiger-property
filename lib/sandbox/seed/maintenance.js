import { sid, daysFromNow, isoDaysFromNow } from "./ids";
import { PROPERTIES, UNITS, TENANTS, VENDORS } from "./core";

// Maintenance sample data for the playground: work_orders, pm_schedules,
// unit_turns, inventory_items, vendor_assignments and maintenance_attachments.
// Rows are snake_case DB shape and link to the core portfolio (units, tenants,
// vendors); detail-tab content (checklists, costs, notes) lives in `metadata`.

// Id groups owned by this module (40–49).
const G = { workOrder: 40, pmSchedule: 41, unitTurn: 42, inventory: 43, assignment: 44, attachment: 45 };

const [PLUMBING, ELECTRIC, HVAC, APPLIANCE, CLEANING, LANDSCAPING] = VENDORS;

const unitAt = (label) => UNITS.find((u) => u.label === label);
const propertyNamed = (name) => PROPERTIES.find((p) => p.name === name);
const residentOf = (u) => TENANTS.find((t) => t.unitId === u.id && ["Current", "Late"].includes(t.status));

// Metadata list rows ({ id, label, …extra }) with stable ids.
const items = (prefix, rows) => rows.map((r, i) => ({ id: `${prefix}-${i + 1}`, ...r }));

// Work-order location columns from a unit label (with its resident) or a property name.
function at(label, { tenant = true } = {}) {
  const u = unitAt(label);
  if (u) {
    const t = tenant ? residentOf(u) : null;
    return {
      unit_id: u.id,
      property_id: u.propertyId,
      property_label: u.display,
      tenant_id: t?.id ?? null,
      tenant_name: t?.name ?? "",
    };
  }
  const p = propertyNamed(label);
  return { unit_id: null, property_id: p.id, property_label: p.name, tenant_id: null, tenant_name: "" };
}

const by = (v) => ({ vendor_id: v.id, vendor_name: v.name });
const unassigned = { vendor_id: null, vendor_name: "" };

const WO = Array.from({ length: 12 }, (_, i) => sid(G.workOrder, i + 1));
const PM = Array.from({ length: 10 }, (_, i) => sid(G.pmSchedule, i + 1));

// ---- Work orders -------------------------------------------------------------

const WORK_ORDERS = [
  {
    id: WO[0],
    name: "No heat — furnace not igniting",
    kind: "work_order",
    is_field: true,
    ...at("TH-2"),
    category: "HVAC",
    priority: "Urgent",
    status: "Open",
    ...by(HVAC),
    technician: "Jin Park",
    scheduled_date: daysFromNow(0),
    labor_cost: 0,
    material_cost: 0,
    total_cost: 0,
    metadata: {
      description: "Tenant reports the furnace clicks but never lights; house is down to 58°F overnight.",
      dueDate: daysFromNow(1),
      arrivalWindow: "1pm–4pm",
      estimatedHours: 2,
      accessNotes: "Tenant home all afternoon. Furnace is in the garage utility closet.",
      technicianPhone: "(503) 555-0176",
      requestedBy: "Noah Schmidt",
      submittedDate: daysFromNow(0),
      permissionToEnter: true,
      checklist: items("wo1-c", [
        { label: "Check thermostat and breaker", done: false },
        { label: "Inspect igniter and flame sensor", done: false },
        { label: "Leave space heater if repair needs parts", done: false },
      ]),
      timeline: items("wo1-t", [
        { label: "Reported via tenant portal", date: "Earlier today" },
        { label: "Evergreen HVAC dispatched", date: "Earlier today" },
      ]),
    },
  },
  {
    id: WO[1],
    name: "Dishwasher not draining",
    kind: "request",
    is_field: false,
    ...at("A-102"),
    category: "Appliance",
    priority: "Medium",
    status: "Submitted",
    ...unassigned,
    technician: "",
    scheduled_date: null,
    labor_cost: 0,
    material_cost: 0,
    total_cost: 0,
    created_at: isoDaysFromNow(-1, 19),
    metadata: {
      description: "Standing water in the bottom of the dishwasher after every cycle.",
      requestedBy: "Daniel Okafor",
      requesterContact: TENANTS[1].phone,
      submittedDate: daysFromNow(-1),
      preferredTime: "Weekday mornings",
      permissionToEnter: true,
    },
  },
  {
    id: WO[2],
    name: "Bathroom exhaust fan rattling",
    kind: "request",
    is_field: false,
    ...at("N-101"),
    category: "Electrical",
    priority: "Low",
    status: "In review",
    ...unassigned,
    technician: "",
    scheduled_date: null,
    labor_cost: 0,
    material_cost: 0,
    total_cost: 0,
    created_at: isoDaysFromNow(-2, 14),
    metadata: {
      description: "Fan is loud and vibrates when switched on; still pulls air.",
      requestedBy: "Grace Kim",
      requesterContact: TENANTS[6].phone,
      submittedDate: daysFromNow(-2),
      preferredTime: "After 5pm",
      permissionToEnter: false,
      approvedBy: "Jordan Lee",
    },
  },
  {
    id: WO[3],
    name: "Garbage disposal jammed",
    kind: "work_order",
    is_field: false,
    ...at("N-102"),
    category: "Appliance",
    priority: "Medium",
    status: "Open",
    ...by(APPLIANCE),
    technician: "Luis Herrera",
    scheduled_date: daysFromNow(-2),
    labor_cost: 0,
    material_cost: 0,
    total_cost: 0,
    created_at: isoDaysFromNow(-3, 11),
    metadata: {
      description: "Disposal hums but won't turn. Reset button already tried.",
      dueDate: daysFromNow(-1),
      arrivalWindow: "9am–12pm",
      estimatedHours: 1,
      activityNotes: "Vendor missed the first appointment — rescheduling with the tenant.",
    },
  },
  {
    id: WO[4],
    name: "Burst supply line — ceiling water damage",
    kind: "work_order",
    is_field: true,
    ...at("S-201", { tenant: false }),
    category: "Plumbing",
    priority: "Urgent",
    status: "In progress",
    ...by(PLUMBING),
    technician: "Carlos Mendes",
    scheduled_date: daysFromNow(-3),
    labor_cost: 640,
    material_cost: 380,
    total_cost: 1020,
    created_at: isoDaysFromNow(-4, 6),
    metadata: {
      description: "Supply line to the upstairs toilet failed overnight; water through the ceiling into the kitchen. Unit taken offline.",
      dueDate: daysFromNow(4),
      estimatedHours: 14,
      accessNotes: "Unit vacant during repair. Lockbox code with the Pinecrest office.",
      technicianPhone: "(206) 555-0110",
      crew: "Carlos Mendes + 1 apprentice",
      assignmentNotes: "Plumbing repair first, then drywall and paint once moisture readings clear.",
      checklist: items("wo5-c", [
        { label: "Shut off water and photograph damage", done: true },
        { label: "Replace supply line and shut-off valve", done: true },
        { label: "Set dehumidifiers and fans", done: true },
        { label: "Moisture readings under 15%", done: false },
        { label: "Cut out and replace ceiling drywall", done: false },
      ]),
      fieldReport: "Braided supply line split at the compression fitting. Replaced line and angle stop. Ceiling drywall saturated over ~40 sq ft; two dehumidifiers running. Re-check moisture in 48 hours.",
      labor: items("wo5-l", [
        { label: "Emergency call-out and shut-off", hours: "2" },
        { label: "Replace supply line and valve", hours: "1.5" },
        { label: "Water extraction and dry-out setup", hours: "3" },
      ]),
      materials: items("wo5-m", [
        { label: "Braided supply line + angle stop", cost: "48" },
        { label: "Dehumidifier rental (3 days)", cost: "270" },
        { label: "Plastic sheeting and tape", cost: "62" },
      ]),
      timeline: items("wo5-t", [
        { label: "Downstairs tenant reported leak", date: "4 days ago" },
        { label: "Rainier Plumbing on site", date: "4 days ago" },
        { label: "Unit marked down for repairs", date: "3 days ago" },
      ]),
      activityNotes: "Insurance notified — claim pending adjuster visit.",
    },
  },
  {
    id: WO[5],
    name: "Ants in kitchen",
    kind: "request",
    is_field: false,
    ...at("S-102"),
    category: "Pest control",
    priority: "Medium",
    status: "Approved",
    ...unassigned,
    technician: "",
    scheduled_date: daysFromNow(3),
    labor_cost: 0,
    material_cost: 0,
    total_cost: 0,
    created_at: isoDaysFromNow(-5, 9),
    metadata: {
      description: "Trail of ants along the counter and under the sink.",
      requestedBy: "Ethan Walker",
      requesterContact: TENANTS[9].phone,
      submittedDate: daysFromNow(-5),
      preferredTime: "Any weekday",
      permissionToEnter: true,
      approvedBy: "Jordan Lee",
      resolutionNotes: "Approved — book the quarterly pest treatment early for the whole South Building.",
    },
  },
  {
    id: WO[6],
    name: "Replace tripping GFCI outlets — kitchen",
    kind: "work_order",
    is_field: false,
    ...at("L-302"),
    category: "Electrical",
    priority: "High",
    status: "On hold",
    ...by(ELECTRIC),
    technician: "Ben Adeyemi",
    scheduled_date: daysFromNow(4),
    labor_cost: 0,
    material_cost: 0,
    total_cost: 0,
    created_at: isoDaysFromNow(-6, 15),
    metadata: {
      description: "Both counter GFCIs trip whenever the kettle and toaster run together.",
      dueDate: daysFromNow(7),
      arrivalWindow: "8am–10am",
      estimatedHours: 2,
      assignmentNotes: "On hold — GFCI outlets out of stock; order placed with the supply house.",
      activityNotes: "Tenant asked to avoid running both appliances until the repair.",
    },
  },
  {
    id: WO[7],
    name: "Façade scaffolding safety inspection",
    kind: "work_order",
    is_field: true,
    ...at("Cascade Lofts"),
    category: "General",
    priority: "High",
    status: "In progress",
    ...unassigned,
    technician: "Sam Ortiz (in-house)",
    scheduled_date: daysFromNow(-1),
    labor_cost: 180,
    material_cost: 0,
    total_cost: 180,
    created_at: isoDaysFromNow(-9, 10),
    metadata: {
      description: "Weekly walk of the renovation scaffolding, netting and lobby walkway protection.",
      estimatedHours: 3,
      checklist: items("wo8-c", [
        { label: "Check scaffold tags and tie-ins", done: true },
        { label: "Inspect debris netting on Pine St side", done: true },
        { label: "Confirm lobby walkway lighting", done: false },
        { label: "Photograph and log findings", done: false },
      ]),
    },
  },
  {
    id: WO[8],
    name: "Water heater replacement",
    kind: "work_order",
    is_field: false,
    ...at("B-102"),
    category: "Plumbing",
    priority: "High",
    status: "Completed",
    ...by(PLUMBING),
    technician: "Carlos Mendes",
    scheduled_date: daysFromNow(-13),
    labor_cost: 520,
    material_cost: 1340,
    total_cost: 1860,
    created_at: isoDaysFromNow(-16, 8),
    metadata: {
      description: "12-year-old tank leaking at the base; no hot water.",
      completedAt: daysFromNow(-12),
      estimatedHours: 5,
      fieldReport: "Removed failed 40-gal tank, installed new 50-gal unit with expansion tank and new seismic straps. Tested relief valve, no leaks.",
      labor: items("wo9-l", [{ label: "Remove and install water heater", hours: "5.5" }]),
      materials: items("wo9-m", [
        { label: "50-gal gas water heater", cost: "1120" },
        { label: "Expansion tank + fittings", cost: "145" },
        { label: "Seismic strap kit", cost: "75" },
      ]),
      timeline: items("wo9-t", [
        { label: "Tenant reported no hot water", date: "16 days ago" },
        { label: "Replacement approved by owner", date: "14 days ago" },
        { label: "Installed and tested", date: "12 days ago" },
      ]),
    },
  },
  {
    id: WO[9],
    name: "Refrigerator not cooling",
    kind: "work_order",
    is_field: false,
    ...at("Main house"),
    category: "Appliance",
    priority: "Medium",
    status: "Completed",
    ...by(APPLIANCE),
    technician: "Luis Herrera",
    scheduled_date: daysFromNow(-22),
    labor_cost: 170,
    material_cost: 245,
    total_cost: 415,
    created_at: isoDaysFromNow(-25, 13),
    metadata: {
      description: "Fridge section warm, freezer still cold.",
      completedAt: daysFromNow(-21),
      fieldReport: "Evaporator fan motor seized. Replaced the motor and cleared the defrost drain.",
      materials: items("wo10-m", [{ label: "Evaporator fan motor", cost: "245" }]),
    },
  },
  {
    id: WO[10],
    name: "Replace HVAC filters — Tower A",
    kind: "work_order",
    is_field: false,
    ...at("The Marlowe"),
    category: "HVAC",
    priority: "Low",
    status: "Completed",
    ...by(HVAC),
    technician: "Jin Park",
    scheduled_date: daysFromNow(-39),
    labor_cost: 210,
    material_cost: 170,
    total_cost: 380,
    created_at: isoDaysFromNow(-40, 9),
    metadata: {
      pmScheduleId: PM[0],
      completedAt: daysFromNow(-38),
      fieldReport: "All 18 Tower A air handlers done. Two units had heavy pet-hair loading — flagged for monthly checks.",
    },
  },
  {
    id: WO[11],
    name: "Move-out deep clean — TH-4",
    kind: "work_order",
    is_field: false,
    ...at("TH-4", { tenant: false }),
    category: "Cleaning",
    priority: "Medium",
    status: "Completed",
    ...by(CLEANING),
    technician: "Nina Brooks",
    scheduled_date: daysFromNow(-52),
    labor_cost: 450,
    material_cost: 0,
    total_cost: 450,
    created_at: isoDaysFromNow(-54, 10),
    metadata: { completedAt: daysFromNow(-51) },
  },
];

// ---- Vendor assignments --------------------------------------------------------

const assign = (n, wo, vendor, name, status, days, extra = {}) => ({
  id: sid(G.assignment, n),
  name,
  vendor_id: vendor.id,
  vendor_name: vendor.name,
  work_order_id: wo.id,
  work_order_label: wo.name,
  scheduled_date: daysFromNow(days),
  status,
  ...extra,
});

const [W_HEAT, , , W_DISPOSAL, W_LEAK, , W_GFCI, W_FACADE, W_HEATER, W_FRIDGE, W_FILTERS, W_CLEAN] = WORK_ORDERS;

const VENDOR_ASSIGNMENTS = [
  assign(1, W_HEAT, HVAC, "Diagnose furnace ignition failure", "Accepted", 0),
  assign(2, W_LEAK, CLEANING, "Post-repair cleanup and sanitizing", "Assigned", 3),
  assign(3, W_LEAK, PLUMBING, "Replace supply line and dry out unit", "In progress", -3),
  assign(4, W_DISPOSAL, APPLIANCE, "Clear jammed disposal", "Assigned", -2),
  assign(5, W_GFCI, ELECTRIC, "Replace two kitchen GFCI outlets", "Accepted", 4),
  assign(6, W_FACADE, ELECTRIC, "Disconnect façade sign lighting for scaffold", "Declined", -8, {
    metadata: { notes: "Crew booked through month-end; rescheduling with in-house team." },
  }),
  assign(7, W_HEATER, PLUMBING, "Install 50-gal water heater", "Completed", -13),
  assign(8, W_FRIDGE, APPLIANCE, "Repair refrigerator fan motor", "Completed", -22),
  assign(9, W_FILTERS, HVAC, "Quarterly filter change — Tower A", "Completed", -39),
  assign(10, W_CLEAN, CLEANING, "Move-out deep clean", "Completed", -52),
];

// ---- Preventive & recurring schedules -------------------------------------------

// Schedule location columns from a unit label or a property name.
function scheduleAt(label) {
  const u = unitAt(label);
  if (u) return { property_id: u.propertyId, property_name: u.propertyName, unit_id: u.id, unit: u.display };
  const p = propertyNamed(label);
  return { property_id: p.id, property_name: p.name, unit_id: null, unit: "" };
}

const PM_SCHEDULES = [
  {
    id: PM[0],
    name: "Replace HVAC filters — Tower A",
    ...scheduleAt("The Marlowe"),
    category: "HVAC",
    frequency: "Quarterly",
    next_due: daysFromNow(52),
    ...by(HVAC),
    estimated_cost: 380,
    status: "Active",
    metadata: {
      instructions: "MERV 8 filters, 16x25x1 for studios and 20x20x1 for two-bedrooms. Pull stock from the B1 maintenance room.",
      lastGenerated: daysFromNow(-40),
      generated: [{ id: WO[10], label: "Replace HVAC filters — Tower A", date: daysFromNow(-39) }],
      steps: items("pm1-s", [
        { label: "Notify residents 48 hours ahead" },
        { label: "Swap filters and date-label each one" },
        { label: "Note any heavily loaded units" },
      ]),
    },
  },
  {
    id: PM[1],
    name: "Fire alarm & extinguisher inspection",
    ...scheduleAt("The Marlowe"),
    category: "General",
    frequency: "Annually",
    next_due: daysFromNow(-5),
    ...by(ELECTRIC),
    estimated_cost: 650,
    status: "Active",
    metadata: { instructions: "Annual alarm panel test plus tagging every extinguisher in both towers." },
  },
  {
    id: PM[2],
    name: "Furnace tune-up before winter",
    ...scheduleAt("Alder Court Townhomes"),
    category: "HVAC",
    frequency: "Annually",
    next_due: daysFromNow(3),
    ...by(HVAC),
    estimated_cost: 1200,
    status: "Active",
    metadata: {
      season: "Before winter",
      steps: items("pm3-s", [
        { label: "Clean burners and flame sensor" },
        { label: "Test igniter and heat exchanger" },
        { label: "Replace filter" },
      ]),
    },
  },
  {
    id: PM[3],
    name: "Gutter cleaning",
    ...scheduleAt("Alder Court Townhomes"),
    category: "Landscaping",
    frequency: "Semi-annually",
    next_due: daysFromNow(8),
    ...by(LANDSCAPING),
    estimated_cost: 540,
    status: "Active",
    metadata: { season: "Late fall and spring" },
  },
  {
    id: PM[4],
    name: "Grounds & landscaping",
    ...scheduleAt("Pinecrest Commons"),
    category: "Landscaping",
    frequency: "Weekly",
    next_due: daysFromNow(2),
    ...by(LANDSCAPING),
    estimated_cost: 260,
    status: "Active",
  },
  {
    id: PM[5],
    name: "Common-area deep clean",
    ...scheduleAt("Pinecrest Commons"),
    category: "Cleaning",
    frequency: "Monthly",
    next_due: daysFromNow(12),
    ...by(CLEANING),
    estimated_cost: 420,
    status: "Active",
  },
  {
    id: PM[6],
    name: "Dryer vent cleaning",
    ...scheduleAt("The Marlowe"),
    category: "Appliance",
    frequency: "Annually",
    next_due: daysFromNow(-12),
    ...by(APPLIANCE),
    estimated_cost: 900,
    status: "Active",
    metadata: { activityNotes: "Overdue — Summit can start in Tower B next week." },
  },
  {
    id: PM[7],
    name: "Sump pump test — South Building",
    ...scheduleAt("Pinecrest Commons"),
    category: "Plumbing",
    frequency: "Quarterly",
    next_due: daysFromNow(20),
    ...by(PLUMBING),
    estimated_cost: 150,
    status: "Active",
  },
  {
    id: PM[8],
    name: "Water heater flush",
    ...scheduleAt("Main house"),
    category: "Plumbing",
    frequency: "Annually",
    next_due: daysFromNow(120),
    ...by(PLUMBING),
    estimated_cost: 180,
    status: "Active",
  },
  {
    id: PM[9],
    name: "Roof & drain inspection",
    ...scheduleAt("Cascade Lofts"),
    category: "General",
    frequency: "Semi-annually",
    next_due: daysFromNow(30),
    ...unassigned,
    estimated_cost: 750,
    status: "Paused",
    metadata: { activityNotes: "Paused while the façade scaffolding is up — resume after renovation." },
  },
];

// ---- Unit turns -----------------------------------------------------------------

const TURN_TASKS = [
  "Move-out inspection",
  "Repairs & punch list",
  "Paint & touch-ups",
  "Flooring / carpet clean",
  "Deep clean",
  "Replace locks / re-key",
  "Final walkthrough",
];

// The standard checklist with the first `done` tasks ticked, plus any extras.
const checklist = (prefix, done, extra = []) =>
  items(prefix, [...TURN_TASKS, ...extra].map((label, i) => ({ label, done: i < done })));

function turn(n, label, { name, moveOut, target, budget, status, done, extra, costs, notes, lead }) {
  const u = unitAt(label);
  const metadata = { checklist: checklist(`turn${n}-c`, done, extra) };
  if (costs) metadata.costs = items(`turn${n}-k`, costs.map(([l, amount]) => ({ label: l, amount: String(amount) })));
  if (notes) metadata.activityNotes = notes;
  if (lead) metadata.assignedTo = lead;
  return {
    id: sid(G.unitTurn, n),
    name,
    unit_id: u.id,
    unit: u.display,
    property_name: u.propertyName,
    move_out_date: daysFromNow(moveOut),
    target_ready_date: daysFromNow(target),
    budget,
    status,
    metadata,
  };
}

const UNIT_TURNS = [
  turn(1, "B-201", {
    name: "B-201 turn — studio refresh",
    moveOut: -18, target: 3, budget: 2200, status: "In progress", done: 4,
    costs: [["Interior paint", 640], ["Carpet clean", 285], ["Re-key", 120]],
    lead: "Sam Ortiz (maintenance)",
  }),
  turn(2, "TH-4", {
    name: "TH-4 turn — garage + carpet",
    moveOut: -55, target: -6, budget: 4500, status: "In progress", done: 5,
    extra: ["Replace garage door opener"],
    costs: [["Move-out deep clean", 450], ["Drywall patch & paint", 1650], ["Carpet replacement (upstairs)", 1980], ["Garage door opener", 780]],
    notes: "Carpet install slipped a week — supplier backorder. Over budget; owner approved the overage.",
    lead: "Sam Ortiz (maintenance)",
  }),
  turn(3, "L-401", {
    name: "L-401 turn — loft renovation",
    moveOut: -30, target: 21, budget: 9500, status: "In progress", done: 2,
    extra: ["Refinish hardwood floors", "Replace kitchen fixtures"],
    costs: [["Demo and haul-away", 1200], ["Hardwood refinishing (deposit)", 2400]],
    notes: "Coordinated with the building renovation — elevator reserved Tue/Thu for material deliveries.",
  }),
  turn(4, "N-201", {
    name: "N-201 turn",
    moveOut: -40, target: -12, budget: 1800, status: "Ready", done: 7,
    costs: [["Paint", 580], ["Carpet clean", 240], ["Deep clean", 360], ["Blinds and re-key", 460]],
    notes: "Rent-ready. Approved applicant moving in in three weeks.",
  }),
  turn(5, "B-101", {
    name: "B-101 turn",
    moveOut: -60, target: -35, budget: 1600, status: "Leased", done: 7,
    costs: [["Paint touch-ups", 320], ["Deep clean", 340], ["Appliance repair", 515], ["Re-key", 120]],
  }),
  turn(6, "L-201", {
    name: "L-201 turn",
    moveOut: -70, target: -20, budget: 3200, status: "Ready", done: 7,
    costs: [["Paint", 920], ["Floor refinish", 1450], ["Deep clean", 380], ["Light fixtures", 300]],
  }),
  turn(7, "A-202", {
    name: "A-202 turn — pre-move-out",
    moveOut: 30, target: 40, budget: 2000, status: "Not started", done: 0,
    notes: "Notice received. Schedule the pre-move-out walkthrough with the resident.",
  }),
  turn(8, "TH-3", {
    name: "TH-3 turn",
    moveOut: 15, target: 25, budget: 3000, status: "Not started", done: 0,
  }),
];

// ---- Inventory & parts ----------------------------------------------------------

// Status mirrors the screen's quantity-vs-reorder rule.
const stock = (qty, reorder) => (qty <= 0 ? "Out of stock" : qty <= reorder ? "Low" : "In stock");

const SUPPLIER = "Harborline Trade Supply";

const INVENTORY_SPECS = [
  // [n, name, sku, category, location, qty, reorder, unit cost, metadata]
  [1, "HVAC filter 16x25x1 MERV 8", "HVF-16251", "HVAC", "The Marlowe · B1 maintenance room", 48, 24, 9.5, {
    supplier: SUPPLIER, reorderQty: 48,
    movements: items("inv1-m", [{ label: "Tower A quarterly change", qty: "-36" }, { label: "Received case order", qty: "+48" }]),
  }],
  [2, "HVAC filter 20x20x1 MERV 8", "HVF-20201", "HVAC", "Pinecrest · North Building storage", 10, 12, 8.75, { supplier: SUPPLIER, reorderQty: 36 }],
  [3, "GFCI outlet 20A, white", "ELC-GFCI20", "Electrical", "The Marlowe · B1 maintenance room", 0, 6, 21.9, {
    supplier: SUPPLIER, reorderQty: 12,
    activityNotes: "Backordered — needed for the L-302 kitchen repair.",
    movements: items("inv3-m", [{ label: "Used on Tower B laundry room", qty: "-2" }, { label: "Used on A-301 bath", qty: "-1" }]),
  }],
  [4, "LED A19 bulbs, 60W equivalent (4-pack)", "ELC-A19-4", "Electrical", "The Marlowe · B1 maintenance room", 36, 12, 7.8, { supplier: SUPPLIER }],
  [5, "Single-handle faucet cartridge", "PLB-CRT1", "Plumbing", "Pinecrest · South Building storage", 6, 4, 18.4, { supplier: SUPPLIER }],
  [6, "Toilet wax ring with bolts", "PLB-WAX1", "Plumbing", "Pinecrest · South Building storage", 3, 6, 6.25, { supplier: SUPPLIER, reorderQty: 12 }],
  [7, "Dishwasher drain hose", "APL-DWH6", "Appliance", "The Marlowe · B1 maintenance room", 0, 2, 16, { supplier: SUPPLIER, reorderQty: 4 }],
  [8, "Garbage disposal, 1/2 HP", "APL-GD12", "Appliance", "Alder Court · Garage 4 storage", 2, 1, 129, { supplier: SUPPLIER }],
  [9, "Interior paint, eggshell — Harbor White (5 gal)", "PNT-HW5", "Paint", "Alder Court · Garage 4 storage", 4, 2, 165, {
    supplier: SUPPLIER,
    movements: items("inv9-m", [{ label: "Used on TH-4 turn", qty: "-2" }, { label: "Used on B-201 turn", qty: "-1" }]),
  }],
  [10, "Smoke detector, 10-year sealed battery", "SAF-SD10", "Safety", "The Marlowe · B1 maintenance room", 2, 8, 28.5, { supplier: SUPPLIER, reorderQty: 24 }],
  [11, "Deadbolt re-key cylinders", "HDW-RKC", "Hardware", "The Marlowe · leasing office", 14, 6, 12.5, { supplier: SUPPLIER }],
  [12, "All-purpose cleaner concentrate (1 gal)", "CLN-APC1", "Cleaning", "Pinecrest · North Building storage", 9, 4, 22, { supplier: SUPPLIER }],
];

const INVENTORY_ITEMS = INVENTORY_SPECS.map(([n, name, sku, category, location, quantity, reorder, unitCost, metadata]) => ({
  id: sid(G.inventory, n),
  name,
  sku,
  category,
  location,
  quantity,
  reorder_level: reorder,
  unit_cost: unitCost,
  status: stock(quantity, reorder),
  metadata,
}));

// ---- Maintenance attachments ----------------------------------------------------

// No file URLs — the Document Library lists these by name without previews.
const attachment = (n, name, category, wo, days, hour = 12) => ({
  id: sid(G.attachment, n),
  name,
  category,
  work_order_label: wo.name,
  url: "",
  status: "Active",
  created_at: isoDaysFromNow(days, hour),
});

const MAINTENANCE_ATTACHMENTS = [
  attachment(1, "TH-2 furnace error code.mp4", "Video", W_HEAT, 0, 0),
  attachment(2, "S-201 ceiling damage — kitchen.jpg", "Photo", W_LEAK, -4),
  attachment(3, "S-201 moisture readings.pdf", "Document", W_LEAK, -2),
  attachment(4, "L-302 GFCI trip photo.jpg", "Photo", W_GFCI, -6),
  attachment(5, "Rainier Plumbing invoice — B-102 water heater.pdf", "Invoice", W_HEATER, -12),
  attachment(6, "50-gal water heater install manual.pdf", "Manual", W_HEATER, -12),
  attachment(7, "Summit Appliance invoice — fridge repair.pdf", "Invoice", W_FRIDGE, -21),
  attachment(8, "Tower A filter change log.pdf", "Document", W_FILTERS, -38),
];

export function maintenanceTables() {
  return {
    work_orders: WORK_ORDERS,
    vendor_assignments: VENDOR_ASSIGNMENTS,
    pm_schedules: PM_SCHEDULES,
    unit_turns: UNIT_TURNS,
    inventory_items: INVENTORY_ITEMS,
    maintenance_attachments: MAINTENANCE_ATTACHMENTS,
  };
}
