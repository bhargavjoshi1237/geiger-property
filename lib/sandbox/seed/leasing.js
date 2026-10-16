import { sid, daysFromNow, isoDaysFromNow } from "./ids";
import { UNITS, TENANTS, LEASES } from "./core";

// Leasing sample data: renewals, moves, inspections, security_deposits, notices,
// lease_templates, esign_requests and lease_addenda. Rows link to core tenants,
// units and leases by id and carry the matching denormalized display columns.

const G = { renewal: 30, move: 31, inspection: 32, deposit: 33, notice: 34, template: 35, esign: 36, addendum: 37 };

const unit = (label) => UNITS.find((u) => u.label === label);

// Tenant + their lease + unit, looked up by name.
function who(name) {
  const tenant = TENANTS.find((t) => t.name === name);
  const lease = LEASES.find((l) => l.tenantId === tenant.id);
  const u = UNITS.find((x) => x.id === tenant.unitId);
  return { tenant, lease, unit: u };
}

// Shift a "YYYY-MM-DD" date by n days.
function shift(date, n) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Metadata list rows ({ id, label, …extra }) with stable ids.
const items = (prefix, rows) => rows.map((r, i) => ({ id: `${prefix}-${i + 1}`, ...r }));
const tasks = (prefix, rows) => items(prefix, rows.map(([label, done]) => ({ label, done })));

// --- renewals ---------------------------------------------------------------

// [n, tenant, proposed rent, status, metadata?] — Accepted rows have already been applied to the lease.
const RENEWAL_SPECS = [
  [1, "Priya Raman", 1995, "Offer sent", {
    noticeDate: daysFromNow(-5), responseDue: daysFromNow(10),
    increaseNotes: "Comparable one-beds in Tower A list at $1,995–$2,050. Holding the increase under 4% to keep a strong renter.",
    communicationNotes: "Offer emailed with a 12-month and a 15-month option. Priya replied she's leaning toward 12 months and will confirm after checking her new job start date.",
  }],
  [2, "Chloe Martin", 3300, "Moving out", {
    noticeDate: daysFromNow(-70), responseDue: daysFromNow(-40),
    communicationNotes: "Chloe declined the renewal — relocating to Spokane for work. Gave written 30-day notice; move-out walkthrough booked.",
  }],
  [3, "Lucas Fernández", 2650, "Moving out", {
    noticeDate: daysFromNow(-60), responseDue: daysFromNow(-30),
    communicationNotes: "Buying a condo in Ballard. Notice to vacate received; unit pre-listed for the following month.",
  }],
  [4, "Maya Chen", 1575, "Negotiating", {
    noticeDate: daysFromNow(-12), responseDue: daysFromNow(18),
    increaseNotes: "Studios at The Marlowe are leasing at $1,550–$1,595. Countered at $1,545 for a 15-month term.",
    communicationNotes: "Maya asked to stay at $1,525. Countered with $1,545 on a 15-month term; awaiting her reply.",
  }],
  [5, "Marcus Johnson", 2050, "Not started", {
    increaseNotes: "Hold until the balance is cleared — current repayment plan runs another two months.",
  }],
  [6, "Grace Kim", 1995, "Accepted", { noticeDate: daysFromNow(-235), appliedAt: isoDaysFromNow(-160) }],
  [7, "Noah Schmidt", 3275, "Accepted", { noticeDate: daysFromNow(-200), appliedAt: isoDaysFromNow(-130) }],
  [8, "Aisha Bello", 3250, "Accepted", { noticeDate: daysFromNow(-290), appliedAt: isoDaysFromNow(-220) }],
  [9, "Emily Davis", 3450, "Declined", {
    noticeDate: daysFromNow(-140), responseDue: daysFromNow(-110),
    communicationNotes: "Declined — moved closer to family in Olympia.",
  }],
];

// Pre-renewal rent for accepted renewals (the lease now carries the new rent).
const PRIOR_RENT = { "Grace Kim": 1925, "Noah Schmidt": 3175, "Aisha Bello": 3150 };

const renewals = RENEWAL_SPECS.map(([n, name, proposed, status, metadata]) => {
  const { tenant, lease, unit: u } = who(name);
  const accepted = status === "Accepted";
  // Accepted renewals already rolled the lease forward, so the old term ended the day before it started.
  const currentEnd = accepted ? shift(lease.termStart, -1) : lease.termEnd;
  const newStart = accepted ? lease.termStart : shift(currentEnd, 1);
  const newEnd = accepted ? lease.termEnd : shift(currentEnd, 365);
  return {
    id: sid(G.renewal, n),
    name: `${u.display} — ${newStart.slice(0, 4)} renewal`,
    lease_id: lease.id, tenant_id: tenant.id, tenant_name: tenant.name, unit_id: u.id, unit: u.display,
    current_rent: PRIOR_RENT[name] ?? lease.rent, proposed_rent: proposed,
    current_end: currentEnd, new_start: newStart, new_end: newEnd, status,
    metadata: metadata ?? {},
  };
});

// --- moves ------------------------------------------------------------------

// [n, tenant, kind, move date (days), status, metadata]
const MOVE_SPECS = [
  [1, "Zoe Nguyen", "in", 14, "Scheduled", {
    checklist: tasks("mv1-chk", [["Lease signed", false], ["Security deposit received", true], ["Renters insurance on file", false], ["Utilities transferred", false], ["Welcome packet prepared", true]]),
    keys: items("mv1-key", [{ label: "Unit door key", count: 2 }, { label: "Building fob", count: 1 }, { label: "Mailbox key", count: 1 }]),
    inspectionScheduled: daysFromNow(13), inspector: "Alex Rivera",
    electricStatus: "Seattle City Light — transfer requested", internetStatus: "Tenant to set up",
  }],
  [2, "Chloe Martin", "out", 15, "In progress", {
    checklist: tasks("mv2-chk", [["Notice to vacate received", true], ["Pre-move-out walkthrough", true], ["Forwarding address collected", true], ["Keys & garage remotes returned", false], ["Final meter readings", false]]),
    inspectionDate: daysFromNow(-2), inspector: "Jordan Lee", inspectionComplete: false,
    conditionSummary: "Pre-move-out walk: minor nail holes in the living room, carpet wear in the primary bedroom. Final walk on move-out day.",
    depositHeld: 3000, forwardingAddress: "2214 W Riverside Ave, Spokane, WA 99201",
  }],
  [3, "Jamal Carter", "in", 21, "Scheduled", {
    checklist: tasks("mv3-chk", [["Application approved", true], ["Lease signed", false], ["Security deposit received", false], ["Renters insurance on file", false]]),
    inspectionScheduled: daysFromNow(20), inspector: "Jordan Lee",
  }],
  [4, "Lucas Fernández", "out", 30, "Scheduled", {
    checklist: tasks("mv4-chk", [["Notice to vacate received", true], ["Pre-move-out walkthrough", false], ["Forwarding address collected", false], ["Keys & fobs returned", false]]),
    depositHeld: 2000,
  }],
  [5, "Ethan Walker", "in", -40, "Complete", {
    checklist: tasks("mv5-chk", [["Lease signed", true], ["Security deposit received", true], ["Renters insurance on file", true], ["Utilities transferred", true], ["Move-in inspection signed", true]]),
    keys: items("mv5-key", [{ label: "Unit door key", count: 2 }, { label: "Building fob", count: 2 }]),
    inspectionScheduled: daysFromNow(-40), inspector: "Jordan Lee", inspectionComplete: true,
    conditionSummary: "Unit in good condition. Small chip on the kitchen counter edge noted and photographed.",
    electricStatus: "Transferred", waterStatus: "Included in rent", gasStatus: "Transferred", internetStatus: "Active",
  }],
  [6, "Emily Davis", "out", -55, "Complete", {
    checklist: tasks("mv6-chk", [["Notice to vacate received", true], ["Final walkthrough", true], ["Keys & garage remotes returned", true], ["Deposit disposition sent", true]]),
    inspectionDate: daysFromNow(-54), inspector: "Jordan Lee", inspectionComplete: true,
    conditionSummary: "Carpet staining in the second bedroom and a patched hole in the garage drywall. Otherwise normal wear.",
    depositHeld: 3000, deductionsTotal: 425, forwardingAddress: "907 Capitol Way S, Olympia, WA 98501",
  }],
  [7, "Liam O'Connor", "in", -75, "Complete", {
    checklist: tasks("mv7-chk", [["Lease signed", true], ["Security deposit received", true], ["Lead-paint disclosure signed", true], ["Utilities transferred", true]]),
    keys: items("mv7-key", [{ label: "Loft door key", count: 2 }, { label: "Freight elevator fob", count: 1 }]),
    inspectionScheduled: daysFromNow(-76), inspector: "Alex Rivera", inspectionComplete: true,
    electricStatus: "Transferred", internetStatus: "Active",
  }],
  [8, "Hannah Brooks", "in", -95, "Complete", {
    checklist: tasks("mv8-chk", [["Lease signed", true], ["Parking remote issued", true], ["Security deposit received", true], ["Utilities transferred", true]]),
    keys: items("mv8-key", [{ label: "Unit door key", count: 2 }, { label: "Building fob", count: 2 }, { label: "Parking remote", count: 1 }]),
    inspectionComplete: true, electricStatus: "Transferred",
  }],
];

const moves = MOVE_SPECS.map(([n, name, kind, days, status, metadata]) => {
  const { tenant, lease, unit: u } = who(name);
  return {
    id: sid(G.move, n),
    name: `${u.display} — ${tenant.name}`,
    unit: u.display, kind, move_date: daysFromNow(days),
    unit_id: u.id, tenant_id: tenant.id, lease_id: lease.id, status, metadata,
  };
});

// --- inspections ------------------------------------------------------------

const ROOMS_TH = ["Living room", "Kitchen", "Primary bedroom", "Bedroom 2", "Bedroom 3", "Bathrooms", "Garage"];

// [n, unit label, tenant | null, type, inspector, date (days), status, metadata?]
const INSPECTION_SPECS = [
  [1, "B-102", "Omar Haddad", "Annual", "Casey Nolan", 5, "Scheduled", {}],
  [2, "B-101", "Zoe Nguyen", "Move-in", "Alex Rivera", 13, "Scheduled", {}],
  [3, "TH-3", "Chloe Martin", "Move-out", "Jordan Lee", -2, "In progress", {
    rooms: items("in3-room", ROOMS_TH.slice(0, 4).map((label, i) => ({ label, condition: ["Good", "Good", "Carpet wear", "Nail holes"][i] }))),
    conditionNotes: "Pre-move-out walk. Final inspection on move-out day once furniture is out.",
    tenantPresent: true,
  }],
  [4, "S-201", null, "Routine", "Casey Nolan", -6, "Failed", {
    rooms: items("in4-room", [{ label: "Kitchen", condition: "Water damage under sink" }, { label: "Bathroom", condition: "Subfloor soft by toilet" }, { label: "Living room", condition: "Good" }]),
    conditionNotes: "Slow leak from the kitchen supply line has damaged the cabinet base and subfloor. Unit taken offline; plumbing and flooring repair ordered.",
  }],
  [5, "TH-1", "Aisha Bello", "Drive-by", "Jordan Lee", -12, "Complete", {
    conditionNotes: "Exterior and yard well kept. Gutters need clearing before winter.",
  }],
  [6, "Main house", "Ravi Patel", "Annual", "Casey Nolan", -30, "Complete", {
    rooms: items("in6-room", [{ label: "Kitchen", condition: "Good" }, { label: "Living & dining", condition: "Good" }, { label: "Bedrooms (4)", condition: "Good" }, { label: "Bathrooms (3)", condition: "Re-caulk primary shower" }, { label: "Furnace", condition: "Filter replaced" }]),
    conditionNotes: "Home is well maintained. Smoke and CO detectors tested OK.", tenantPresent: true, signedOn: daysFromNow(-30),
  }],
  [7, "TH-4", "Emily Davis", "Move-out", "Jordan Lee", -54, "Complete", {
    rooms: items("in7-room", ROOMS_TH.map((label) => ({ label, condition: label === "Bedroom 2" ? "Carpet stained" : label === "Garage" ? "Drywall hole" : "Normal wear" }))),
    conditionNotes: "Carpet in bedroom 2 needs professional cleaning; 6\" hole in garage drywall. Deductions itemized on the deposit.",
    tenantPresent: false, signedOn: daysFromNow(-54),
  }],
  [8, "L-302", "Liam O'Connor", "Move-in", "Alex Rivera", -76, "Complete", {
    rooms: items("in8-room", [{ label: "Living area", condition: "Good" }, { label: "Kitchen", condition: "Good" }, { label: "Bedroom 1", condition: "Good" }, { label: "Bedroom 2", condition: "Scuff on wall" }, { label: "Bathrooms", condition: "Good" }]),
    tenantPresent: true, signedOn: daysFromNow(-76),
  }],
  [9, "N-201", "Jamal Carter", "Move-in", "Jordan Lee", 20, "Scheduled", {}],
  [10, "A-202", "Lucas Fernández", "Move-out", "Alex Rivera", 29, "Scheduled", {}],
];

const inspections = INSPECTION_SPECS.map(([n, label, name, type, inspector, days, status, metadata]) => {
  const u = unit(label);
  const link = name ? who(name) : null;
  return {
    id: sid(G.inspection, n),
    name: `${u.display} — ${type}`,
    unit: u.display, inspector, inspection_date: daysFromNow(days),
    unit_id: u.id, tenant_id: link?.tenant.id ?? null, lease_id: link?.lease.id ?? null,
    status, metadata: { inspectionType: type, ...metadata },
  };
});

// --- security_deposits ------------------------------------------------------

const TRUST = { WA: "Security deposit trust · WA", OR: "Security deposit trust · OR" };

// [n, tenant, status, metadata?]
const DEPOSIT_SPECS = [
  [1, "Zoe Nguyen", "Held", { receivedOn: daysFromNow(-3) }],
  [2, "Emily Davis", "Partially returned", {
    receivedOn: daysFromNow(-421),
    deductions: items("dp2-ded", [{ label: "Carpet cleaning — bedroom 2", amount: 275 }, { label: "Garage drywall patch & paint", amount: 150 }]),
    refundAmount: 2575, returnedAmount: 2575, refundDate: daysFromNow(-40), refundMethod: "ACH",
    documents: items("dp2-doc", [{ label: "Deposit disposition letter.pdf" }, { label: "Move-out inspection photos.zip" }]),
  }],
  [3, "Chloe Martin", "Held", { receivedOn: daysFromNow(-351) }],
  [4, "Lucas Fernández", "Held", { receivedOn: daysFromNow(-336) }],
  [5, "Liam O'Connor", "Held", { receivedOn: daysFromNow(-77) }],
  [6, "Hannah Brooks", "Held", { receivedOn: daysFromNow(-97) }],
  [7, "Omar Haddad", "Held", { receivedOn: daysFromNow(-402) }],
  [8, "Grace Kim", "Held", { receivedOn: daysFromNow(-515) }],
  [9, "Ravi Patel", "Held", { receivedOn: daysFromNow(-502), interestBearing: true }],
  [10, "Maya Chen", "Held", { receivedOn: daysFromNow(-262) }],
];

const deposits = DEPOSIT_SPECS.map(([n, name, status, metadata]) => {
  const { tenant, lease, unit: u } = who(name);
  const state = u.propertyName === "Pinecrest Commons" ? "OR" : "WA";
  return {
    id: sid(G.deposit, n),
    name: `${u.display} — ${tenant.name}`,
    unit: u.display, amount: lease.deposit, held_location: TRUST[state],
    unit_id: u.id, tenant_id: tenant.id, lease_id: lease.id, status, metadata,
  };
});

// Former residents of make-ready units (no core tenant row; name lives in metadata).
deposits.push(
  {
    id: sid(G.deposit, 11), name: `${unit("L-401").display} — Ben Alvarez`, unit: unit("L-401").display,
    amount: unit("L-401").deposit, held_location: TRUST.WA, unit_id: unit("L-401").id, tenant_id: null, lease_id: null,
    status: "Returned",
    metadata: { tenantName: "Ben Alvarez", receivedOn: daysFromNow(-760), refundAmount: 2000, returnedAmount: 2000, refundDate: daysFromNow(-20), refundMethod: "Check" },
  },
  {
    id: sid(G.deposit, 12), name: `${unit("B-201").display} — Kira Matsuda`, unit: unit("B-201").display,
    amount: unit("B-201").deposit, held_location: TRUST.WA, unit_id: unit("B-201").id, tenant_id: null, lease_id: null,
    status: "Forfeited",
    metadata: {
      tenantName: "Kira Matsuda", receivedOn: daysFromNow(-400),
      deductions: items("dp12-ded", [{ label: "Unpaid rent — final month", amount: 1525 }, { label: "Junk removal", amount: 180 }]),
      activityNotes: "Unit abandoned with a month's rent unpaid. Deductions exceed the deposit; balance sent to collections.",
    },
  },
);

// --- notices ----------------------------------------------------------------

// [n, title, type, tenant, served (days | null), cure by (days | null), delivery, status, metadata?]
const NOTICE_SPECS = [
  [1, "14-day notice to pay or vacate", "Late rent", "Omar Haddad", -4, 10, "Posted", "Served", {
    amountDue: 1450,
    noticeText: "FOURTEEN (14) DAY NOTICE TO PAY RENT OR VACATE THE PREMISES\n\nTo: Omar Haddad, The Marlowe · B-102\n\nYou are in default of rent in the amount of $1,450.00 for the current month. Payment must be received within fourteen (14) days of service of this notice or you must vacate the premises.\n\nPay online in the resident portal or at the leasing office.\n\nHarbor & Pine Residential",
    serviceLog: items("nt1-svc", [{ label: "Posted on unit door, photo taken", date: daysFromNow(-4) }, { label: "Copy mailed first-class", date: daysFromNow(-4) }]),
  }],
  [2, "Entry notice — pre-move-out walkthrough", "Entry notice", "Lucas Fernández", -1, 2, "Email", "Served", {
    noticeText: "Notice of intent to enter: we will enter A-202 between 10am and 12pm for a pre-move-out walkthrough. You're welcome to be present.",
  }],
  [3, "Rent increase notice — renewal offer", "Rent increase", "Priya Raman", -5, 40, "Portal", "Served", {
    noticeText: "Your monthly rent will change from $1,925 to $1,995 effective with your renewal term. See the renewal offer in the resident portal for term options.",
  }],
  [4, "Notice to pay — past-due balance", "Late rent", "Liam O'Connor", -12, -2, "Email", "Served", {
    amountDue: 650,
    serviceLog: items("nt4-svc", [{ label: "Emailed and posted to portal", date: daysFromNow(-12) }]),
  }],
  [5, "Notice of nonpayment — N-102", "Late rent", "Marcus Johnson", -25, -15, "Certified mail", "Escalated", {
    amountDue: 2150,
    serviceLog: items("nt5-svc", [{ label: "Certified mail sent", date: daysFromNow(-25) }, { label: "Delivery confirmed", date: daysFromNow(-22) }]),
    activityNotes: "No payment received by the cure date. Repayment plan offered; referred to the owner for next steps.",
  }],
  [6, "Lease violation — unauthorized pet", "Lease violation", "Hannah Brooks", -20, -10, "Hand delivered", "Cured", {
    activityNotes: "Hannah signed the pet addendum and paid the pet fee. Violation cured.",
  }],
  [7, "Lease violation — parking in fire lane", "Lease violation", "Grace Kim", -45, -35, "Posted", "Cured"],
  [8, "Lease violation — trash bins left out", "Lease violation", "Noah Schmidt", -60, -53, "Email", "Closed"],
  [9, "Lease violation — smoking on balcony", "Lease violation", "Ethan Walker", null, null, "Hand delivered", "Draft", {
    noticeText: "Smoking is not permitted on balconies or within 25 feet of building entrances per your lease. Please cease immediately.",
  }],
];

const notices = NOTICE_SPECS.map(([n, title, type, name, served, cure, delivery, status, metadata]) => {
  const { tenant, unit: u } = who(name);
  return {
    id: sid(G.notice, n),
    name: title, notice_type: type, tenant_id: tenant.id, tenant_name: tenant.name, unit_id: u.id, unit: u.display,
    served_date: served == null ? null : daysFromNow(served), cure_by: cure == null ? null : daysFromNow(cure),
    delivery_method: delivery, status, metadata: metadata ?? {},
  };
});

// --- lease_templates --------------------------------------------------------

const STANDARD_BODY = `RESIDENTIAL LEASE AGREEMENT

This Lease is made on {{today}} between {{landlord_name}} ("Landlord") and {{tenant_name}} ("Tenant").

1. PREMISES. Landlord leases to Tenant the premises at {{address}} ({{unit}}).

2. TERM. The term begins on {{lease_start}} and ends on {{lease_end}}.

3. RENT. Tenant shall pay {{rent}} per month, due on the {{due_day}} of each month. Rent received more than {{grace_days}} days late incurs a late fee of {{late_fee}}.

4. SECURITY DEPOSIT. Tenant shall pay a security deposit of {{deposit}}, held in trust and returned less lawful, itemized deductions.

5. PARKING. Tenant is assigned space {{parking_space}}.

6. UTILITIES. Tenant is responsible for electricity, internet and renters insurance.

7. ENTRY. Landlord may enter with at least 24 hours' notice except in an emergency.

SIGNATURES
Landlord: ____________________   Tenant: ____________________`;

const stateBody = (state, extra) => `${STANDARD_BODY.split("\n\nSIGNATURES")[0]}

8. STATE DISCLOSURES ({{state}}). ${extra}

SIGNATURES
Landlord: ____________________   Tenant: ____________________`;

// [n, name, scope, state, status, body, metadata?]
const TEMPLATE_SPECS = [
  [1, "Standard 12-month residential lease", "generic", "", "Published", STANDARD_BODY],
  [2, "Washington residential lease", "state", "WA", "Published",
    stateBody("WA", "Tenant acknowledges receipt of the mold information pamphlet, fire safety and protection information, and the written move-in condition checklist. Deposits are held at {{deposit_bank}}."), {
      mergeFields: items("tp2-mf", [{ label: "{{parking_space}}", sample: "P-14" }, { label: "{{deposit_bank}}", sample: "Security deposit trust · WA" }]),
      requirements: items("tp2-req", [{ label: "Written move-in condition checklist before collecting a deposit" }, { label: "Deposit held in a trust account; depository named in the lease" }, { label: "Advance written notice for rent increases" }, { label: "Itemized deposit statement after move-out" }]),
      disclosures: items("tp2-dis", [{ label: "Mold information", done: true }, { label: "Fire safety & protection", done: true }, { label: "Lead-based paint (pre-1978 buildings)", done: true }, { label: "Smoking policy", done: false }]),
    }],
  [3, "Oregon residential lease", "state", "OR", "Published",
    stateBody("OR", "Tenant acknowledges the smoking policy, flood-zone disclosure, and recycling information for the premises."), {
      requirements: items("tp3-req", [{ label: "Advance written notice for rent increases" }, { label: "Smoking policy stated in the agreement" }, { label: "Itemized deposit accounting after move-out" }]),
      disclosures: items("tp3-dis", [{ label: "Smoking policy", done: true }, { label: "Flood plain disclosure", done: true }, { label: "Recycling service", done: true }, { label: "Lead-based paint (pre-1978 buildings)", done: false }]),
    }],
  [4, "Single-family home lease", "generic", "", "Published", `${STANDARD_BODY}\n\nYARD & SYSTEMS. Tenant maintains the lawn and replaces furnace filters quarterly.`],
  [5, "Month-to-month rental agreement", "generic", "", "Draft",
    STANDARD_BODY.replace("2. TERM. The term begins on {{lease_start}} and ends on {{lease_end}}.", "2. TERM. Month-to-month beginning {{lease_start}}; either party may end it with written notice.")],
  [6, "California residential lease", "state", "CA", "Draft",
    stateBody("CA", "Tenant acknowledges the required state disclosures listed in the attached addendum."), {
      requirements: items("tp6-req", [{ label: "Confirm deposit limit for the jurisdiction" }, { label: "Local rent-control ordinance review" }]),
      disclosures: items("tp6-dis", [{ label: "Bed bug information", done: false }, { label: "Flood hazard", done: false }, { label: "Lead-based paint (pre-1978 buildings)", done: false }]),
      activityNotes: "Drafting ahead of a possible Sacramento acquisition — needs legal review before publishing.",
    }],
  [7, "6-month furnished lease (2024)", "generic", "", "Archived", STANDARD_BODY.replace("RESIDENTIAL LEASE AGREEMENT", "FURNISHED SHORT-TERM LEASE")],
];

const templates = TEMPLATE_SPECS.map(([n, name, scope, state, status, body, metadata]) => ({
  id: sid(G.template, n),
  name, scope, state, body, status,
  // Every body uses {{parking_space}}, so each template declares it unless it overrides the list.
  metadata: { mergeFields: items(`tp${n}-mf`, [{ label: "{{parking_space}}", sample: "P-14" }]), ...metadata },
  created_at: isoDaysFromNow(-20 * n),
}));

// --- esign_requests ---------------------------------------------------------

// [n, document, tenant, status, created (days), metadata?]
const ESIGN_SPECS = [
  [1, "Lease agreement — B-101", "Zoe Nguyen", "Sent", -2, {
    signers: items("es1-sg", [{ label: "Zoe Nguyen", email: who("Zoe Nguyen").tenant.email, done: false }, { label: "Alex Rivera", email: "alex.rivera@harborpine.example", done: false }]),
    audit: items("es1-au", [{ label: "Request created" }, { label: "Sent to Zoe Nguyen" }]),
    message: "Welcome to The Marlowe! Please review and sign your lease before move-in.", reminderCadence: "Every 3 days",
  }],
  [2, "Lease agreement — N-201", "Jamal Carter", "Draft", -1],
  [3, "Repayment plan agreement — B-102", "Omar Haddad", "Sent", -3, {
    signers: items("es3-sg", [{ label: "Omar Haddad", email: who("Omar Haddad").tenant.email, done: false }]),
    audit: items("es3-au", [{ label: "Request created" }, { label: "Sent to Omar Haddad" }]),
    reminderCadence: "Daily", lastReminder: daysFromNow(-1),
  }],
  [4, "Renewal offer — A-201", "Priya Raman", "Viewed", -5, {
    signers: items("es4-sg", [{ label: "Priya Raman", email: who("Priya Raman").tenant.email, done: false }]),
    audit: items("es4-au", [{ label: "Sent to Priya Raman" }, { label: "Viewed by Priya Raman" }]),
    reminderCadence: "Weekly",
  }],
  [5, "Lease agreement — S-102", "Ethan Walker", "Signed", -45, {
    signers: items("es5-sg", [{ label: "Ethan Walker", email: who("Ethan Walker").tenant.email, done: true }, { label: "Jordan Lee", email: "jordan.lee@harborpine.example", done: true }]),
    audit: items("es5-au", [{ label: "Sent to Ethan Walker" }, { label: "Signed by Ethan Walker" }, { label: "Countersigned by Jordan Lee" }]),
  }],
  [6, "Pet addendum — A-301", "Hannah Brooks", "Signed", -18],
  [7, "Renewal offer — TH-4", "Emily Davis", "Declined", -135, {
    audit: items("es7-au", [{ label: "Sent to Emily Davis" }, { label: "Declined — not renewing" }]),
  }],
  [8, "Renewal agreement — TH-2", "Noah Schmidt", "Signed", -150],
  [9, "Renewal agreement — N-101", "Grace Kim", "Signed", -180],
];

const esignRequests = ESIGN_SPECS.map(([n, doc, name, status, days, metadata]) => {
  const { tenant, lease } = who(name);
  return {
    id: sid(G.esign, n),
    name: doc, signer: tenant.name, lease_id: lease.id, status, metadata: metadata ?? {},
    created_at: isoDaysFromNow(days), updated_at: isoDaysFromNow(days),
  };
});

// --- lease_addenda ----------------------------------------------------------

// [n, name, tenant, status, body]
const ADDENDUM_SPECS = [
  [1, "Repayment plan addendum", "Omar Haddad", "Draft", "Past-due $1,450 repaid in three installments alongside monthly rent."],
  [2, "Smoking policy disclosure", "Jamal Carter", "Draft", "Pinecrest Commons is smoke-free indoors and on balconies."],
  [3, "Renters insurance addendum", "Zoe Nguyen", "Attached", "Minimum $100,000 liability coverage; proof due before key release."],
  [4, "Mold disclosure", "Zoe Nguyen", "Attached", "Mold information pamphlet provided at signing."],
  [5, "EV charging addendum", "Daniel Okafor", "Attached", "Level 2 charger access, $45/mo billed with rent."],
  [6, "Notice to vacate acknowledgement", "Lucas Fernández", "Signed", "Tenant vacates at lease end; deposit returned per itemized statement."],
  [7, "Lead-based paint disclosure", "Liam O'Connor", "Signed", "Building constructed in 1924; disclosure form and pamphlet provided."],
  [8, "Pet addendum", "Hannah Brooks", "Signed", "One cat. $350 one-time pet fee; tenant liable for pet damage."],
  [9, "Parking addendum", "Maya Chen", "Signed", "Covered stall P-14 in the secured garage, $150/mo."],
];

const addenda = ADDENDUM_SPECS.map(([n, name, tenantName, status, body]) => ({
  id: sid(G.addendum, n),
  name, body, lease_id: who(tenantName).lease.id, status,
}));

export function leasingTables() {
  return {
    renewals,
    moves,
    inspections,
    security_deposits: deposits,
    notices,
    lease_templates: templates,
    esign_requests: esignRequests,
    lease_addenda: addenda,
  };
}
