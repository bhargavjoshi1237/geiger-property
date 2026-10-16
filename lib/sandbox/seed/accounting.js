import { sid, daysFromNow, monthFromNow } from "./ids";
import { PROPERTIES, UNITS, TENANTS, LEASES, VENDORS } from "./core";

// Accounting seed for the playground: gl_accounts, rent_accounts, transactions,
// recurring_charges, bills, budgets and bank_accounts. Rent income lives in the
// rent accounts' metadata payments (reports add it to Income transactions), so
// the ledger carries other income, expenses and transfers — never rent itself.

// Id groups owned by this module (50–59).
const G = { gl: 50, rent: 51, txn: 52, recurring: 53, bill: 54, budget: 55, bank: 56, item: 59 };

const [MARLOWE, PINECREST, ALDER, BIRCHWOOD, CASCADE] = PROPERTIES;
const TODAY = daysFromNow(0);
const pad = (n) => String(n).padStart(2, "0");

// Ids for charge/payment/line items nested in metadata lists.
let itemSeq = 0;
const itemId = () => sid(G.item, ++itemSeq);

// "YYYY-MM-DD" for a day in the month k months back, clamped to today.
const dateIn = (k, day) => {
  const d = `${monthFromNow(-k)}-${pad(day)}`;
  return d > TODAY ? TODAY : d;
};
// Same, but null when that day hasn't happened yet (skips future ledger rows).
const pastDate = (k, day) => {
  const d = `${monthFromNow(-k)}-${pad(day)}`;
  return d > TODAY ? null : d;
};
const asDate = (iso) => new Date(`${iso}T00:00:00`);
const monthName = (k) => asDate(`${monthFromNow(-k)}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shortDate = (iso) => asDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const longDate = (iso) => asDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const tenant = (n) => TENANTS[n - 1];
const leaseOf = (t) => LEASES.find((l) => l.id === t.leaseId);
const unitOf = (t) => UNITS.find((u) => u.id === t.unitId);
const propertyOf = (id) => PROPERTIES.find((p) => p.id === id);

// --- Chart of accounts -----------------------------------------------------------

// [number, name, type, description, status]
const GL_SPECS = [
  ["1000", "Operating Cash", "Asset", "Day-to-day operating account at Harbor Community Bank.", "Active"],
  ["1010", "Trust / Security Deposit Cash", "Asset", "Tenant trust and security-deposit funds held for owners.", "Active"],
  ["1020", "Replacement Reserve", "Asset", "Capital reserve for roofs, boilers and other big-ticket items.", "Active"],
  ["1200", "Accounts Receivable", "Asset", "Rent and fees billed but not yet collected.", "Active"],
  ["2000", "Accounts Payable", "Liability", "Vendor bills owed.", "Active"],
  ["2100", "Security Deposits Held", "Liability", "Refundable deposits owed back to tenants.", "Active"],
  ["3000", "Owner Equity", "Equity", "Owner contributions and retained earnings.", "Active"],
  ["3100", "Owner Distributions", "Equity", "Monthly cash distributions paid to owners.", "Active"],
  ["4000", "Rental Income", "Income", "Base rent collected from residents.", "Active"],
  ["4010", "Late Fee Income", "Income", "Late fees charged after the grace period.", "Active"],
  ["4020", "Application Fee Income", "Income", "Non-refundable rental application fees.", "Active"],
  ["4030", "Parking & Storage Income", "Income", "Parking stalls, EV charging and storage cages.", "Active"],
  ["4040", "Pet Rent & Fees", "Income", "Monthly pet rent and one-time pet fees.", "Active"],
  ["4100", "Other Income", "Income", "Laundry, interest and deposit deductions.", "Active"],
  ["4110", "Vending Income", "Income", "Lobby vending machines — removed during the Cascade Lofts renovation.", "Inactive"],
  ["5000", "Repairs & Maintenance", "Expense", "Plumbing, electrical, HVAC and appliance repairs.", "Active"],
  ["5050", "Turnover & Make-ready", "Expense", "Cleaning, paint and prep between residents.", "Active"],
  ["5100", "Utilities", "Expense", "Common-area power, water, sewer, gas and trash.", "Active"],
  ["5150", "Landscaping & Grounds", "Expense", "Grounds crews, snow removal and seasonal plantings.", "Active"],
  ["5200", "Insurance", "Expense", "Property and liability premiums.", "Active"],
  ["5300", "Property Taxes", "Expense", "County property taxes, paid in two halves.", "Active"],
  ["5400", "Management Fees", "Expense", "Harbor & Pine management fee, charged as a percent of income.", "Active"],
  ["5500", "Payroll", "Expense", "On-site staff wages and benefits.", "Active"],
];

// "number · name" — how transactions, bills and charges reference an account.
const acct = (number) => {
  const spec = GL_SPECS.find((a) => a[0] === number);
  return `${spec[0]} · ${spec[1]}`;
};

// --- Recurring charges ---------------------------------------------------------------

// Charges beyond base rent. `months` = which of the last three months (2, 1, 0) were posted.
const RECURRING_SPECS = [
  { n: 1, name: "Covered parking — Stall P-12", tenantN: 1, amount: 150, frequency: "Monthly", gl: "4030", status: "Active", months: [2, 1, 0] },
  { n: 2, name: "EV charging", tenantN: 2, amount: 45, frequency: "Monthly", gl: "4030", status: "Active", months: [2, 1, 0] },
  { n: 3, name: "Covered parking — Stall P-27", tenantN: 5, amount: 150, frequency: "Monthly", gl: "4030", status: "Active", months: [2, 1, 0] },
  { n: 4, name: "Pet rent — one cat", tenantN: 7, amount: 35, frequency: "Monthly", gl: "4040", status: "Active", months: [2, 1, 0] },
  { n: 5, name: "Storage cage S-4", tenantN: 9, amount: 40, frequency: "Monthly", gl: "4030", status: "Active", months: [2, 1, 0] },
  { n: 6, name: "Reserved parking — Space 9", tenantN: 10, amount: 75, frequency: "Monthly", gl: "4030", status: "Active", months: [1, 0] },
  { n: 7, name: "Renters insurance program", tenantN: 12, amount: 42, frequency: "Quarterly", gl: "4100", status: "Active", months: [1] },
  { n: 8, name: "Pet rent — dog", tenantN: 14, amount: 50, frequency: "Monthly", gl: "4040", status: "Paused", months: [2] },
  { n: 9, name: "Garage storage bay", tenantN: 13, amount: 60, frequency: "Monthly", gl: "4030", status: "Ended", months: [2, 1] },
  { n: 10, name: "Move-out carpet cleaning", tenantN: 4, amount: 225, frequency: "One-time", gl: "4100", status: "Draft", months: [] },
];

// --- Rent accounts ---------------------------------------------------------------------

// Payment habits per tenant n: [autopay, method, pay day, method reference].
const PAY_PROFILES = {
  1: [true, "ACH", 1, "Bank ••4417"], 2: [true, "ACH", 1, "Bank ••0932"], 3: [false, "Card", 3, "Visa ••5521"],
  4: [false, "Check", 4, "Check"], 5: [true, "ACH", 1, "Bank ••7740"], 6: [false, "Check", 5, "Check"],
  7: [true, "ACH", 1, "Bank ••2268"], 8: [false, "Card", 3, "Mastercard ••8104"], 9: [false, "ACH", 2, "Bank ••6153"],
  10: [true, "ACH", 1, "Bank ••3389"], 11: [true, "ACH", 1, "Bank ••9011"], 12: [false, "Card", 2, "Visa ••4476"],
  13: [false, "Check", 3, "Check"], 14: [true, "ACH", 1, "Bank ••1250"], 15: [false, "Card", 4, "Visa ••6608"],
};

// Late tenants' deviations, sized to their core balances. pay: null = unpaid month.
const LATE_ADJUST = {
  6: { 0: { pay: 1075 } }, // Omar Haddad — short $1,450 on this month's rent
  8: { 1: { pay: 1915, lateFee: 75, payDay: 18 }, 0: { pay: null } }, // Marcus Johnson — $155 short + this month unpaid
  15: { 0: { pay: 2200 } }, // Liam O'Connor — $650 short this month
};

const RENT_STATUS = { 6: "Overdue", 8: "Overdue", 15: "Partial" };

function buildRentAccounts() {
  const renters = TENANTS.map((t, i) => ({ t, n: i + 1 })).filter(({ t }) => t.status === "Current" || t.status === "Late");
  return renters.map(({ t, n }, i) => {
    const lease = leaseOf(t);
    const unit = unitOf(t);
    const property = propertyOf(t.propertyId);
    const [autopay, method, payDay, reference] = PAY_PROFILES[n];
    const name = `${t.unit} — ${t.name}`;
    const extras = RECURRING_SPECS.filter((r) => r.tenantN === n);
    const charges = [];
    const payments = [];

    for (const k of [2, 1, 0]) {
      if (`${monthFromNow(-k)}-01` < t.leaseStart) continue;
      const adjust = LATE_ADJUST[n]?.[k] || {};
      let due = lease.rent;
      charges.push({ id: itemId(), label: `${monthName(k)} rent`, amount: lease.rent, date: dateIn(k, 1) });
      for (const r of extras.filter((x) => x.months.includes(k))) {
        const date = dateIn(k, 1);
        charges.push({ id: sid(G.item, 1000 + r.n * 10 + k), label: `${r.name} · ${longDate(date)}`, amount: r.amount, date, source: "recurring", recurringChargeId: sid(G.recurring, r.n) });
        due += r.amount;
      }
      if (adjust.lateFee) {
        charges.push({ id: itemId(), label: `Late fee · ${monthName(k)}`, amount: adjust.lateFee, date: dateIn(k, 6) });
      }
      const amount = "pay" in adjust ? adjust.pay : due;
      if (amount) {
        const date = dateIn(k, adjust.payDay || payDay);
        payments.push({ id: itemId(), label: `Payment · ${shortDate(date)} (${method})`, amount, date, method });
      }
    }

    return {
      id: sid(G.rent, i + 1),
      name,
      unit: t.unit,
      tenant_name: t.name,
      rent: lease.rent,
      due_day: 1,
      frequency: "Monthly",
      autopay,
      payment_method: method,
      unit_id: unit.id,
      tenant_id: t.id,
      property_id: property.id,
      lease_id: lease.id,
      status: RENT_STATUS[n] || "Current",
      metadata: {
        propertyName: property.name,
        address: `${property.address}, ${property.city}, ${property.state} ${property.zip}`,
        charges,
        payments,
        lateFeeType: "Flat",
        lateFeeAmount: 75,
        graceDays: 5,
        paymentReference: reference,
        ...(n === 8 ? { activityNotes: "Called Marcus on the 8th — promised the balance by the 20th. Second notice sent." } : {}),
        ...(n === 6 ? { activityNotes: "Partial check received; remainder expected with next payroll." } : {}),
      },
    };
  });
}

// Rent accounts with a balance first, then by property order.
function sortRentAccounts(rows) {
  const owed = (r) => r.metadata.charges.reduce((s, c) => s + c.amount, 0) - r.metadata.payments.reduce((s, p) => s + p.amount, 0);
  return [...rows].sort((a, b) => owed(b) - owed(a));
}

function buildRecurringCharges(rentAccounts) {
  return RECURRING_SPECS.map((r) => {
    const t = tenant(r.tenantN);
    const account = rentAccounts.find((a) => a.tenant_id === t.id);
    const postings = r.months
      .filter((k) => `${monthFromNow(-k)}-01` >= t.leaseStart)
      .map((k) => {
        const date = dateIn(k, 1);
        return { id: sid(G.item, 1000 + r.n * 10 + k), date, amount: r.amount, account: account?.name || "", postedAt: date };
      })
      .reverse(); // newest posting first, as the Posting tab prepends
    const nextDate =
      r.frequency === "One-time" ? leaseOf(t).termEnd
        : r.frequency === "Quarterly" ? `${monthFromNow(2)}-01`
          : `${monthFromNow(1)}-01`;
    return {
      id: sid(G.recurring, r.n),
      name: r.name,
      tenant_id: t.id,
      tenant_name: t.name,
      unit_id: t.unitId,
      unit: t.unit,
      amount: r.amount,
      frequency: r.frequency,
      next_date: nextDate,
      account: acct(r.gl),
      status: r.status,
      metadata: {
        postings,
        ...(r.status === "Paused" ? { activityNotes: "Paused while the resident's dog is staying with family over the winter." } : {}),
        ...(r.status === "Ended" ? { activityNotes: "Bay cleared out ahead of move-out; charge ended." } : {}),
        ...(r.status === "Draft" ? { activityNotes: "Post at move-out inspection if carpets need professional cleaning." } : {}),
      },
    };
  });
}

// --- Bills ------------------------------------------------------------------------------------

const vendor = (n) => VENDORS[n - 1];

// [n, name, vendor n, property, gl, bill date (days), due (days), amount, status, invoice #, payments [[days, amount, method]]]
const BILL_SPECS = [
  [1, "Lobby lighting retrofit — Cascade Lofts", 2, CASCADE, "5000", -34, -4, 4250, "Partially paid", "BLE-20931", [[-20, 2000, "ACH"]]],
  [2, "Dishwasher repair — N-102", 4, PINECREST, "5000", -31, -6, 285, "Open", "SAR-4418", []],
  [3, "Water heater replacement — A-202", 1, MARLOWE, "5000", -9, 21, 1860, "Open", "RPC-11872", []],
  [4, "Boiler tune-up — Cascade Lofts", 3, CASCADE, "5000", -5, 25, 1580, "Open", "EHS-7731", []],
  [5, "Make-ready clean — L-401", 5, CASCADE, "5050", -3, 27, 465, "Open", "CVC-3302", []],
  [6, "October grounds maintenance — Pinecrest Commons", 6, PINECREST, "5150", -1, 29, 950, "Draft", "CLS-0910", []],
  [7, "Quarterly HVAC service — Pinecrest Commons", 3, PINECREST, "5000", -38, -8, 1240, "Paid", "EHS-7604", [[-15, 1240, "ACH"]]],
  [8, "Make-ready clean — TH-4", 5, ALDER, "5050", -44, -14, 420, "Paid", "CVC-3247", [[-27, 420, "Card"]]],
  [9, "September grounds maintenance — Alder Court", 6, ALDER, "5150", -40, -10, 780, "Paid", "CLS-0884", [[-12, 780, "Check"]]],
  [10, "EV charger inspection — The Marlowe", 2, MARLOWE, "5000", -66, -36, 375, "Paid", "BLE-20714", [[-41, 375, "ACH"]]],
  [11, "Main line jetting — Pinecrest South", 1, PINECREST, "5000", -22, 8, 640, "Void", "RPC-11790", []],
];

// Bills plus the Expense transactions their payments posted (linked both ways).
function buildBills() {
  const bills = [];
  const txns = [];
  let txnN = 200;
  for (const [n, name, vn, property, gl, billDays, dueDays, amount, status, invoice, pays] of BILL_SPECS) {
    const v = vendor(vn);
    const billId = sid(G.bill, n);
    const payments = pays.map(([days, amt, method]) => {
      const paymentId = itemId();
      const transactionId = sid(G.txn, ++txnN);
      const date = daysFromNow(days);
      txns.push({
        id: transactionId, name: `Bill: ${name}`, txn_date: date, txn_type: "Expense", account: acct(gl),
        property_id: property.id, property_name: property.name, amount: amt, payee: v.name, reference: method,
        status: days < -30 ? "Reconciled" : "Cleared", metadata: { billId, paymentId },
      });
      return { id: paymentId, date, amount: amt, method, transactionId };
    });
    bills.push({
      id: billId,
      name,
      vendor_id: v.id,
      vendor_name: v.name,
      property_name: property.name,
      bill_date: daysFromNow(billDays),
      due_date: daysFromNow(dueDays),
      amount,
      amount_paid: payments.reduce((s, p) => s + p.amount, 0),
      account: acct(gl),
      status,
      metadata: {
        propertyId: property.id,
        invoiceNumber: invoice,
        payments,
        ...(status === "Void" ? { activityNotes: "Duplicate of invoice RPC-11788 — voided at the vendor's request." } : {}),
        ...(n === 1 ? { activityNotes: "Deposit paid at start; balance due on final walkthrough sign-off." } : {}),
      },
    });
  }
  return { bills, billTxns: txns };
}

// --- Transactions ---------------------------------------------------------------------------

// Monthly ledger lines: [name, type, gl, property | null, day, [amounts 2/1/0 months back], payee, reference]
const MONTHLY_SPECS = [
  ["Common-area electric — The Marlowe", "Expense", "5100", MARLOWE, 8, [1184.32, 1092.75, 1046.18], "Metro Power & Light", "ACCT-77120"],
  ["Rent receipts sweep — trust to operating", "Transfer", "1000", null, 9, [30215.0, 31480.0, 26350.0], "Harbor & Pine Residential", "XFER"],
  ["Water & sewer — Pinecrest Commons", "Expense", "5100", PINECREST, 12, [2146.9, 2311.45, 2208.6], "Municipal Water Utility", "ACCT-40562"],
  ["Gas & heat — Cascade Lofts", "Expense", "5100", CASCADE, 15, [612.4, 688.15, 941.3], "Northwest Gas Service", "ACCT-90311"],
  ["Owner distribution — Northwind Holdings", "Transfer", "3100", MARLOWE, 15, [9850.0, 10240.0, 9975.0], "Northwind Holdings LLC", "ACH"],
  ["Trash & recycling — Alder Court", "Expense", "5100", ALDER, 18, [318.0, 318.0, 326.5], "Sound Waste & Recycling", "ACCT-2219"],
  ["Laundry room revenue — Pinecrest Commons", "Income", "4100", PINECREST, 20, [412.5, 386.75, 431.25], "Pinecrest laundry room", "Collection"],
  ["On-site staff payroll — The Marlowe", "Expense", "5500", MARLOWE, 25, [4200.0, 4200.0, 4200.0], "Harbor & Pine Payroll", "PR"],
  ["Reserve account interest", "Income", "4100", MARLOWE, 28, [61.84, 63.12, 64.05], "Puget Sound Savings", "INT"],
];

// One-off entries: [n, name, type, gl, property | null, days, amount, payee, reference, status, memo]
const ONE_OFF_SPECS = [
  [101, "Elevator maintenance contract — The Marlowe", "Expense", "5000", MARLOWE, 0, 1450, "Vertical Lift Services", "Q4 contract", "Draft", "Awaiting signed renewal before posting."],
  [102, "Application fee — Jamal Carter", "Income", "4020", PINECREST, -6, 50, "Jamal Carter", "APP-1188", "Pending", ""],
  [103, "Second-half property taxes — 14 Birchwood Lane", "Expense", "5300", BIRCHWOOD, -3, 4870, "County Treasurer", "Parcel 2925-0410", "Pending", ""],
  [104, "Second-half property taxes — Alder Court Townhomes", "Expense", "5300", ALDER, -3, 9620, "County Treasurer", "Parcel 7731-0088", "Pending", ""],
  [105, "Q4 property insurance premium — The Marlowe", "Expense", "5200", MARLOWE, -9, 6840, "Sound Mutual Insurance", "POL-55120", "Cleared", ""],
  [106, "Application fee — Zoe Nguyen", "Income", "4020", MARLOWE, -12, 50, "Zoe Nguyen", "APP-1182", "Cleared", ""],
  [107, "Water & sewer — Pinecrest Commons (duplicate)", "Expense", "5100", PINECREST, -26, 2311.45, "Municipal Water Utility", "ACCT-40562", "Void", "Posted twice from the same statement — voided."],
  [108, "Pet fee — Ethan Walker", "Income", "4040", PINECREST, -40, 350, "Ethan Walker", "Move-in", "Reconciled", ""],
  [109, "Security deposit to trust — Ethan Walker", "Transfer", "1010", PINECREST, -40, 2000, "Ethan Walker", "Move-in", "Reconciled", ""],
  [110, "Liability insurance renewal — Pinecrest Commons", "Expense", "5200", PINECREST, -44, 3125, "Sound Mutual Insurance", "POL-55087", "Reconciled", ""],
  [111, "Deposit deduction — Emily Davis (TH-4 damages)", "Income", "4100", ALDER, -48, 380, "Emily Davis", "Move-out", "Cleared", "Wall repair and blind replacement, itemised on the deposit statement."],
  [112, "Reserve contribution — The Marlowe", "Transfer", "1020", MARLOWE, -55, 2500, "Harbor & Pine Residential", "XFER", "Reconciled", ""],
];

function buildTransactions(billTxns) {
  const rows = [];
  MONTHLY_SPECS.forEach(([name, type, gl, property, day, amounts, payee, reference], s) => {
    [2, 1, 0].forEach((k, j) => {
      const date = pastDate(k, day);
      if (!date) return;
      rows.push({
        id: sid(G.txn, (s + 1) * 10 + j), name: `${name} · ${monthName(k)}`, txn_date: date, txn_type: type,
        account: acct(gl), property_id: property?.id ?? null, property_name: property?.name ?? "", amount: amounts[j],
        payee, reference, status: k === 2 ? "Reconciled" : k === 1 ? "Cleared" : "Pending",
      });
    });
  });
  for (const [n, name, type, gl, property, days, amount, payee, reference, status, memo] of ONE_OFF_SPECS) {
    rows.push({
      id: sid(G.txn, n), name, txn_date: daysFromNow(days), txn_type: type, account: acct(gl),
      property_id: property?.id ?? null, property_name: property?.name ?? "", amount, payee, reference, status,
      ...(memo ? { metadata: { memo } } : {}),
    });
  }
  // Newest first so the default created_at-desc list reads as a ledger.
  return [...rows, ...billTxns].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
}

// --- Budgets ------------------------------------------------------------------------------------

const YEAR = new Date().getFullYear();
const roundTo = (n, step = 100) => Math.round(n / step) * step;
const annualRent = (p, occupancy) => roundTo(UNITS.filter((u) => u.propertyId === p.id).reduce((s, u) => s + u.rent, 0) * 12 * occupancy);
const lines = (pairs) => pairs.map(([label, amount]) => ({ id: itemId(), label, amount }));

// [n, name, property, year, status, occupancy, other income lines, expense lines]
const BUDGET_SPECS = [
  [1, `The Marlowe ${YEAR} operating budget`, MARLOWE, YEAR, "Approved", 0.94,
    [["Parking & EV charging", 14400], ["Pet rent & fees", 3600], ["Late & application fees", 2400]],
    [["Repairs & maintenance", 21000], ["Utilities", 15600], ["Insurance", 13700], ["Property taxes", 24800], ["Payroll", 50400], ["Management fees", 15800]]],
  [2, `Pinecrest Commons ${YEAR} operating budget`, PINECREST, YEAR, "Approved", 0.93,
    [["Laundry income", 4900], ["Parking & storage", 3300], ["Late & application fees", 1800]],
    [["Repairs & maintenance", 16500], ["Utilities", 28200], ["Landscaping", 11400], ["Insurance", 6250], ["Property taxes", 15900], ["Management fees", 9100]]],
  [3, `Alder Court ${YEAR} operating budget`, ALDER, YEAR, "Approved", 0.95,
    [["Storage & garage fees", 1400], ["Late fees", 900]],
    [["Repairs & maintenance", 9800], ["Turnover & make-ready", 4200], ["Landscaping", 9360], ["Trash & recycling", 3900], ["Insurance", 7400], ["Property taxes", 19240], ["Management fees", 12700]]],
  [4, `Cascade Lofts ${YEAR} operating budget`, CASCADE, YEAR, "Approved", 0.8,
    [["Other income", 600]],
    [["Repairs & maintenance", 12500], ["Lobby & façade renovation", 38000], ["Utilities", 9800], ["Insurance", 5900], ["Property taxes", 11200], ["Management fees", 6000]]],
  [5, `14 Birchwood Lane ${YEAR} budget`, BIRCHWOOD, YEAR, "Draft", 0.97,
    [["Pet rent", 600]],
    [["Repairs & maintenance", 4200], ["Insurance", 2100], ["Property taxes", 9740], ["Management fees", 4900]]],
  [6, `The Marlowe ${YEAR + 1} operating budget`, MARLOWE, YEAR + 1, "Draft", 0.95,
    [["Parking & EV charging", 15600], ["Pet rent & fees", 3900], ["Late & application fees", 2400]],
    [["Repairs & maintenance", 22500], ["Elevator modernisation reserve", 18000], ["Utilities", 16400], ["Insurance", 14600], ["Property taxes", 25900], ["Payroll", 52800], ["Management fees", 16300]]],
  [7, `The Marlowe ${YEAR - 1} operating budget`, MARLOWE, YEAR - 1, "Archived", 0.92,
    [["Parking & EV charging", 13200], ["Pet rent & fees", 3300], ["Late & application fees", 2100]],
    [["Repairs & maintenance", 19400], ["Utilities", 14900], ["Insurance", 12800], ["Property taxes", 23600], ["Payroll", 48000], ["Management fees", 15100]]],
];

function buildBudgets() {
  return BUDGET_SPECS.map(([n, name, property, year, status, occupancy, otherIncome, expenses]) => {
    const incomeLines = lines([["Rental income", annualRent(property, occupancy)], ...otherIncome]);
    const expenseLines = lines(expenses);
    return {
      id: sid(G.budget, n),
      name,
      property_id: property.id,
      property_name: property.name,
      year,
      total_income: incomeLines.reduce((s, l) => s + l.amount, 0),
      total_expense: expenseLines.reduce((s, l) => s + l.amount, 0),
      status,
      metadata: {
        incomeLines,
        expenseLines,
        ...(status === "Draft" && n === 6 ? { activityNotes: "Owner review scheduled for next month; elevator line pending a second bid." } : {}),
      },
    };
  });
}

// --- Bank accounts ---------------------------------------------------------------------------

// Deposits held on every active lease — the security-deposit account's balance.
const DEPOSITS_HELD = LEASES.filter((l) => l.status === "Active" || l.status === "Expiring soon").reduce((s, l) => s + l.deposit, 0);

function buildBankAccounts() {
  const asOf = daysFromNow(-1);
  const reconciled = `${monthFromNow(-1)}-28`;
  return [
    { id: sid(G.bank, 1), name: "Operating — Harbor Community Bank", bank_name: "Harbor Community Bank", account_type: "Operating", last4: "4821", balance: 84630.55, status: "Active", metadata: { balanceAsOf: asOf, lastReconciled: reconciled, statementBalance: 79112.4 } },
    { id: sid(G.bank, 2), name: "Tenant rent trust", bank_name: "Harbor Community Bank", account_type: "Trust", last4: "4839", balance: 41275.1, status: "Active", metadata: { balanceAsOf: asOf, lastReconciled: reconciled, statementBalance: 38904.65 } },
    { id: sid(G.bank, 3), name: "Security deposits held", bank_name: "Puget Sound Savings", account_type: "Security deposit", last4: "1176", balance: DEPOSITS_HELD + 214.37, status: "Active", metadata: { balanceAsOf: asOf, lastReconciled: reconciled, statementBalance: DEPOSITS_HELD + 212.9, activityNotes: "Includes accrued interest owed to residents at move-out." } },
    { id: sid(G.bank, 4), name: "Replacement reserve", bank_name: "Puget Sound Savings", account_type: "Reserve", last4: "1192", balance: 128463.18, status: "Active", metadata: { balanceAsOf: asOf, lastReconciled: reconciled, statementBalance: 125899.13 } },
    { id: sid(G.bank, 5), name: "Birchwood owner operating", bank_name: "Harbor Community Bank", account_type: "Operating", last4: "5307", balance: 0, status: "Draft", metadata: { balanceAsOf: asOf, activityNotes: "Opening once Jonathan Reyes finishes owner onboarding." } },
    { id: sid(G.bank, 6), name: "Legacy operating — Cascade Lofts", bank_name: "Cascadia Credit Union", account_type: "Operating", last4: "0458", balance: 0, status: "Closed", metadata: { balanceAsOf: daysFromNow(-120), lastReconciled: daysFromNow(-120), activityNotes: "Closed after consolidating into the Harbor Community operating account." } },
  ];
}

export function accountingTables() {
  itemSeq = 0;
  const rentAccounts = buildRentAccounts();
  const { bills, billTxns } = buildBills();
  return {
    gl_accounts: GL_SPECS.map(([number, name, accountType, description, status], i) => ({
      id: sid(G.gl, i + 1), name, number, account_type: accountType, description, status,
    })),
    rent_accounts: sortRentAccounts(rentAccounts),
    recurring_charges: buildRecurringCharges(rentAccounts),
    transactions: buildTransactions(billTxns),
    bills, // spec order: overdue and open first, settled and void after
    budgets: buildBudgets(),
    bank_accounts: buildBankAccounts(),
  };
}
