// Accounting area: the double-entry ledger is the source of truth. A day-by-day
// simulation from the Oct 2025 conversion to today posts every charge, payment,
// deposit, bill, fee and transfer through the app's own posting builders
// (converted the way toRpcArgs + property.ledger_post would), replays the
// financial jobs (late fees, management fees, deposit interest, scheduler-posted
// recurring charges) with their idempotency keys, then derives the sub-ledger
// tables (rent accounts, bills, transactions, online payments, reconciliations…)
// and tenants.balance from the posted lines. Leases, tenants, owners, deposits
// and work orders are read from the rows the people and maintenance areas emit.
//
// Paused for the crons: Active recurring charges have metadata.autoPost false,
// no rent account opts into autoPostRent, autopay plans carry no saved Stripe
// method, deposit interest is 0%, the delinquent leases override lateFeeType to
// "none" (every other lease has no open charge), and the current month's
// management fees are already booked under the job's own mgmt: keys.
import {
  allocateOldestFirst,
  buildBill,
  buildBillPayment,
  buildCashTransaction,
  buildCharge,
  buildContribution,
  buildCredit,
  buildDepositHeld,
  buildDepositInterest,
  buildDepositReturn,
  buildDistribution,
  buildJournal,
  buildManagementFee,
  buildPayment,
  indexAccounts,
  normalizeEntry,
  normalizeGlAccount,
  normalizeLine,
  openItems,
  round2,
  toRpcArgs,
} from "@/lib/ledger/postings";
import { computeLateFee, effectivePolicies, prorateRent } from "@/lib/policies";
import { PAYMENT_SETTINGS_DEFAULTS } from "@/lib/payments/constants";

// Id groups owned by this area (100–119).
const G = {
  gl: 100, bank: 101, entry: 102, line: 103, bill: 104, item: 105, txn: 106, recurring: 107, rent: 108,
  budget: 109, budgetLine: 110, recon: 111, job: 112, rubs: 113, cam: 114, payment: 115, plan: 116,
  setting: 117, misc: 118,
};

// --- Dates (pure "YYYY-MM-DD" math in UTC) ------------------------------------------

const DAY = 86400000;
const toD = (s) => new Date(`${s}T00:00:00Z`);
const isoOf = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => isoOf(new Date(toD(s).getTime() + n * DAY));
const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / DAY);
const ymOf = (s) => s.slice(0, 7);
const addMonths = (k, n) => {
  const [y, m] = k.split("-").map(Number);
  return isoOf(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};
const monthsBetween = (a, b) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};
const firstOf = (k) => `${k}-01`;
const lastOf = (k) => {
  const [y, m] = k.split("-").map(Number);
  return isoOf(new Date(Date.UTC(y, m, 0)));
};
const daysIn = (k) => Number(lastOf(k).slice(8));
const dayIn = (k, d) => `${k}-${String(Math.min(d, daysIn(k))).padStart(2, "0")}`;
const longMonth = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shortMonth = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const shortDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// Pacific business hours expressed in UTC so the UTC date is the local date.
const stamp = (s, hhmm, sec = 0) => `${s}T${hhmm}:${String(sec % 60).padStart(2, "0")}.000Z`;
const maxDate = (a, b) => (a > b ? a : b);

// Deterministic pseudo-random helpers (stable across runs).
function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const jitter = (key, lo, hi) => lo + ((hash(key) % 1000) / 1000) * (hi - lo);
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const tokenOf = (key) => Array.from({ length: 32 }, (_, i) => B64[hash(`${key}:${i}`) % 64]).join("");

// --- Chart of accounts ------------------------------------------------------------------

// The exact default chart of property.ledger_ensure_default_chart:
// [system_key, number, name, type, subtype, is_trust, parent_key, description]
const DEFAULT_CHART = [
  ["operating_cash", "1000", "Operating Cash", "Asset", "cash", false, null, "Harbor & Pine's own operating account — management fees in, company costs out."],
  ["trust_cash", "1010", "Trust Cash", "Asset", "cash", true, null, "Owner funds held in the tenant rent trust account."],
  ["deposit_cash", "1020", "Security Deposit Trust Cash", "Asset", "cash", true, null, "Resident security deposits held in trust at Puget Sound Savings."],
  ["accounts_receivable", "1200", "Accounts Receivable", "Asset", "receivable", false, null, "Rent and fees billed to residents but not yet collected."],
  ["capital_improvements", "1500", "Capital Improvements", "Asset", "fixed_asset", false, null, "Capitalized renovation and replacement costs."],
  ["accounts_payable", "2000", "Accounts Payable", "Liability", "payable", false, null, "Approved vendor bills not yet paid."],
  ["security_deposits", "2100", "Security Deposits Held", "Liability", "deposits", true, null, "Refundable deposits owed back to residents."],
  ["deposit_interest_payable", "2110", "Deposit Interest Payable", "Liability", "deposits", true, "security_deposits", "Interest accrued on interest-bearing deposits, paid at the lease anniversary."],
  ["prepaid_rent", "2200", "Prepaid Rent & Tenant Credits", "Liability", "prepaid", false, null, "Rent received ahead of its due date."],
  ["owner_equity", "3000", "Owner Equity", "Equity", "equity", false, null, "Owner capital, including balances brought over at conversion."],
  ["owner_contributions", "3100", "Owner Contributions", "Equity", "contribution", false, "owner_equity", "Cash owners put in — renovation draws and working capital."],
  ["owner_distributions", "3200", "Owner Distributions", "Equity", "distribution", false, "owner_equity", "Monthly cash paid out to owners."],
  ["rent_income", "4000", "Rental Income", "Income", "income", false, null, "Base rent charged to residents and commercial tenants."],
  ["late_fee_income", "4010", "Late Fee Income", "Income", "income", false, null, "Late fees assessed after the grace period."],
  ["application_fee_income", "4020", "Application Fee Income", "Income", "income", false, null, "Non-refundable rental application fees."],
  ["utility_income", "4030", "Utility Reimbursements", "Income", "income", false, null, "RUBS utility bill-backs to residents."],
  ["cam_income", "4040", "CAM Recoveries", "Income", "income", false, null, "Common-area maintenance estimates and true-ups."],
  ["concessions", "4050", "Concessions & Credits", "Income", "contra_income", false, null, "Move-in specials, courtesy credits and waived fees."],
  ["other_income", "4100", "Other Income", "Income", "income", false, null, "Laundry, interest, damages, NSF and convenience fees."],
  ["management_fee_income", "4500", "Management Fee Income", "Income", "income", false, null, "Harbor & Pine's management fee, earned from each owner's collections."],
  ["repairs_maintenance", "5000", "Repairs & Maintenance", "Expense", "expense", false, null, "Plumbing, electrical, HVAC, janitorial and appliance repairs."],
  ["utilities", "5100", "Utilities", "Expense", "expense", false, null, "Common-area power, water, sewer, gas and trash."],
  ["insurance", "5200", "Insurance", "Expense", "expense", false, null, "Property and liability premiums."],
  ["property_taxes", "5300", "Property Taxes", "Expense", "expense", false, null, "County property taxes, paid in halves."],
  ["management_fees", "5400", "Management Fees", "Expense", "expense", false, null, "Management fee charged to each owner's property."],
  ["payroll", "5500", "Payroll", "Expense", "expense", false, null, "On-site staff wages and benefits."],
  ["deposit_interest", "5600", "Deposit Interest Expense", "Expense", "expense", false, null, "Interest owed on interest-bearing deposits."],
  ["turnover", "5700", "Turnover & Make-ready", "Expense", "expense", false, null, "Cleaning, paint, flooring and prep between residents."],
  ["bad_debt", "5800", "Bad Debt", "Expense", "expense", false, null, "Balances written off to collections."],
];

// Non-system accounts beside the default chart: [n, number, name, type, subtype, is_trust, parent_key, status, description]
const EXTRA_CHART = [
  [1, "1030", "Replacement Reserve Cash", "Asset", "cash", true, null, "Active", "Owner capital reserve held in trust at Puget Sound Savings."],
  [2, "4060", "Parking & Storage Income", "Income", "income", false, "other_income", "Active", "Parking stalls, EV charging and storage cages."],
  [3, "4070", "Pet Rent & Fees", "Income", "income", false, "other_income", "Active", "Monthly pet rent and one-time pet fees."],
  [4, "4080", "Amenity & Event Fees", "Income", "income", false, "other_income", "Draft", "Rooftop and clubroom reservation fees — set up for the 2027 amenity program."],
  [5, "4110", "Vending Income", "Income", "income", false, "other_income", "Inactive", "Lobby vending machines — removed during the Cascade Lofts renovation."],
  [6, "5150", "Landscaping & Grounds", "Expense", "expense", false, null, "Active", "Grounds crews, storm cleanup and seasonal plantings."],
  [7, "5650", "Legal & Professional Fees", "Expense", "expense", false, null, "Active", "Attorney reviews, notices and professional services."],
];

// --- Policies -----------------------------------------------------------------------------

// Company fees_policies (Settings → Fees & Policies), every key the cascade defines.
const COMPANY_POLICIES = {
  rentDueDay: "1", graceDays: 5, lateFeeType: "flat", lateFeeAmount: 75, dailyLateFee: 10, maxLateFee: 200, nsfFee: 35,
  prorateFirstMonth: true, prorationMethod: "actual",
  paymentMethods: ["ach", "card", "check", "money_order"], allowPartialPayments: true, blockAfterEviction: true,
  certifiedFundsOnly: false, cardFeePct: 2.9, achFee: 0, autopayRequired: false,
  applicationFee: 50, defaultLeaseTermMonths: 12, depositRule: "one_month", fixedDeposit: 500, petsAllowed: true,
  petDeposit: 300, petRent: 35, renewalNoticeDays: 90, moveOutNoticeDays: 30, autoMonthToMonth: true, mtmPremium: 100,
  depositReturnDays: 30, depositInterestRate: 0, depositHeldIn: "trust",
  ownerApprovalLimit: 500, entryPermission: "call_first", emergencyPhone: "(206) 555-0199",
  managementFeePct: 8, managementFeeMin: 0, leasingFeePct: 50, renewalFee: 150, ownerReserve: 250, ownerDistributionDay: "15",
};

// Property overrides (metadata.policyOverrides) by sandbox property index; the management
// fee follows the primary owner's agreed % (owners.management_fee_pct) when it differs.
const PROPERTY_OVERRIDES = [
  { ownerReserve: 7500 }, // The Marlowe
  { graceDays: 4, depositReturnDays: 31, ownerReserve: 3000 }, // Pinecrest Commons (Oregon)
  { ownerReserve: 3000, ownerDistributionDay: "20" }, // Alder Court
  { managementFeeMin: 150, lateFeeType: "percent", lateFeeAmount: 5, petRent: 50 }, // 14 Birchwood Lane
  { ownerReserve: 10000 }, // Cascade Lofts — held through the renovation
];

// Payment Processing settings (online_payments key).
const PAYMENT_SETTINGS = (trustBankId) => ({
  ...PAYMENT_SETTINGS_DEFAULTS,
  enabled: true,
  passFees: true,
  depositBankAccountId: trustBankId,
  statementDescriptor: "HARBOR PINE RENT",
  achCreditOnSubmit: false,
  allowSaveMethod: true,
  maxPaymentAmount: 10000,
  autopayEnabled: true,
  autopayDayOffset: 1,
  autopayMaxFailures: 2,
  certifiedAfterReturns: 2,
  sendReceipts: true,
});

const BILL_APPROVAL_LIMIT = 2500;
const ACTIVE_LEASE = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction", "active", "current"];
const CLOSED_LEASE = ["Ended", "Terminated", "Renewed"];

export function apply(ctx) {
  const { sid, core } = ctx;
  const TODAY = ctx.daysFromNow(0);
  const YESTERDAY = addDays(TODAY, -1);
  const NOW_YM = ymOf(TODAY);
  const START_YM = addMonths(NOW_YM, -12);
  const START = firstOf(START_YM);
  const YEAR = Number(TODAY.slice(0, 4));
  // Design dates (written against 2026-10) keep their day of the month, re-anchored on today.
  const relYm = (designYm) => addMonths(designYm, monthsBetween("2026-10", NOW_YM));
  const rel = (designDate) => dayIn(relYm(designDate.slice(0, 7)), Number(designDate.slice(8)));

  // --- Rows from the people + maintenance areas -----------------------------------------
  const live = (r) => r && !r.deleted_at;
  const tenantRows = ctx.rows("tenants");
  const leaseRows = ctx.rows("leases");
  const unitRows = ctx.rows("units");
  const propRows = ctx.rows("properties");
  const ownerRows = ctx.rows("owners");
  const poRows = ctx.rows("property_owners");
  const depositRows = ctx.rows("security_deposits");
  const woRows = ctx.rows("work_orders");

  const [MARLOWE, PINECREST, ALDER, BIRCHWOOD, CASCADE] = core.PROPERTIES;
  const propRow = (pid) => propRows.find((p) => p.id === pid);
  const propName = (pid) => propRow(pid)?.name || core.PROPERTIES.find((p) => p.id === pid)?.name || "";
  const unitOf = (id) => {
    const u = unitRows.find((x) => x.id === id);
    if (!u) return null;
    return { id: u.id, label: u.label, propertyId: u.property_id, sqft: Number(u.sqft) || 0, deposit: Number(u.deposit) || 0, display: `${propName(u.property_id)} · ${u.label}` };
  };
  const unitByLabel = (label) => {
    const c = core.UNITS.find((u) => u.label === label);
    return c ? unitOf(c.id) : null;
  };
  const vendorN = (n) => core.VENDORS[n - 1];
  const ownerRow = (id) => ownerRows.find((o) => o.id === id);

  // Ownership on a date from property_owners (primary first), core owners as the fallback.
  const holdingsOf = (pid, date = TODAY) => {
    const rows = poRows
      .filter((r) => live(r) && r.property_id === pid && (!r.starts_on || r.starts_on <= date) && (!r.ends_on || r.ends_on >= date))
      .filter((r) => Number(r.ownership_pct ?? 100) > 0)
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
    if (rows.length) return rows.map((r) => ({ ownerId: r.owner_id, pct: Number(r.ownership_pct ?? 100), primary: Boolean(r.is_primary) }));
    const o = core.OWNERS.find((x) => x.propertyIds.includes(pid));
    return o ? [{ ownerId: o.id, pct: 100, primary: true }] : [];
  };
  const ownerId = (pid) => holdingsOf(pid)[0]?.ownerId;

  // --- Chart rows + account index ----------------------------------------------------
  const glRows = [];
  DEFAULT_CHART.forEach(([key, number, name, type, subtype, trust, , description], i) => {
    glRows.push({
      id: sid(G.gl, i + 1), name, number, account_type: type, subtype, is_trust: trust, is_system: true,
      system_key: key, parent_id: null, description, status: "Active",
    });
  });
  for (const [n, number, name, type, subtype, trust, , status, description] of EXTRA_CHART) {
    glRows.push({
      id: sid(G.gl, 100 + n), name, number, account_type: type, subtype, is_trust: trust, is_system: false,
      system_key: null, parent_id: null, description, status,
    });
  }
  const glByKey = (k) => glRows.find((a) => a.system_key === k);
  const glByNumber = (n) => glRows.find((a) => a.number === n);
  for (const [key, , , , , , parent] of DEFAULT_CHART) if (parent) glByKey(key).parent_id = glByKey(parent).id;
  for (const [, number, , , , , parent] of EXTRA_CHART) if (parent) glByNumber(number).parent_id = glByKey(parent).id;
  const ACCT = indexAccounts(glRows.map(normalizeGlAccount));
  const GL = (k) => ACCT.byKey.get(k).id;
  const GLN = (n) => glByNumber(n).id;
  const labelOf = (id) => {
    const a = glRows.find((r) => r.id === id);
    return `${a.number} · ${a.name}`;
  };

  // --- Bank accounts (patch the sandbox rows) --------------------------------------
  const banks = ctx.rows("bank_accounts");
  const bankAt = (n) => banks.find((b) => b.id === sid(56, n));
  const BANK = { operating: bankAt(1).id, trust: bankAt(2).id, deposit: bankAt(3).id, reserve: bankAt(4).id };
  const BANK_GL = {
    [BANK.operating]: GL("operating_cash"), [BANK.trust]: GL("trust_cash"),
    [BANK.deposit]: GL("deposit_cash"), [BANK.reserve]: GLN("1030"),
  };

  // --- Ledger engine ------------------------------------------------------------------
  const entries = [];
  const lines = [];
  const entryById = new Map();
  const linesByEntry = new Map();
  const arByLease = new Map();
  const arByTenant = new Map();
  const keys = new Set();
  let entrySeq = 0;
  let lineSeq = 0;
  let clock = 0;

  const entryView = (id) => normalizeEntry(entryById.get(id));
  const withEntry = (l) => ({ ...l, entry: entryView(l.entryId) });

  // Built posting → rows exactly as toRpcArgs + property.ledger_post would write them.
  function commit(built, { at, createdBy = null } = {}) {
    if (built.error) throw new Error(`accounting: ${built.error}`);
    const id = sid(G.entry, ++entrySeq);
    built.entry.id = id;
    const { p_entry: e, p_lines: pl } = toRpcArgs(built, { projectId: ctx.projectId, createdBy });
    if (e.idempotency_key) {
      if (keys.has(e.idempotency_key)) throw new Error(`accounting: duplicate idempotency key ${e.idempotency_key}`);
      keys.add(e.idempotency_key);
    }
    const created = at || stamp(e.entry_date, "18:00", ++clock);
    const total = round2(pl.reduce((s, l) => s + round2(l.debit), 0));
    const row = {
      id, project_id: ctx.projectId, entry_date: e.entry_date, memo: e.memo, source_type: e.source_type,
      source_id: e.source_id, status: "posted", reversal_of: null, voided_at: null,
      idempotency_key: e.idempotency_key, total,
      property_id: e.property_id, unit_id: e.unit_id, lease_id: e.lease_id, tenant_id: e.tenant_id,
      owner_id: e.owner_id, vendor_id: e.vendor_id, metadata: e.metadata || {}, created_by: e.created_by,
      created_at: created, updated_at: created,
    };
    entries.push(row);
    entryById.set(id, row);
    const mine = [];
    // A dimension key present on the line (even null) overrides the entry's (ledger_post).
    const pick = (l, col) => (col in l ? l[col] : e[col]);
    pl.forEach((l, i) => {
      const debit = round2(l.debit);
      const credit = round2(l.credit);
      if (!(debit > 0 || credit > 0)) return;
      const line = {
        id: sid(G.line, ++lineSeq), project_id: ctx.projectId, entry_id: id, entry_date: e.entry_date, line_no: i + 1,
        gl_account_id: l.gl_account_id, debit, credit, memo: l.memo || e.memo || null,
        property_id: pick(l, "property_id"), unit_id: pick(l, "unit_id"), lease_id: pick(l, "lease_id"),
        tenant_id: pick(l, "tenant_id"), owner_id: pick(l, "owner_id"), vendor_id: pick(l, "vendor_id"),
        bank_account_id: l.bank_account_id || null, job_id: l.job_id || null,
        applies_to_entry_id: l.applies_to_entry_id || null, cleared: false, cleared_on: null, reconciliation_id: null,
        metadata: l.metadata || {}, created_by: e.created_by, created_at: created, updated_at: created,
      };
      lines.push(line);
      mine.push(line);
      track(line);
    });
    linesByEntry.set(id, mine);
    return row;
  }

  function track(line) {
    if (ACCT.byId.get(line.gl_account_id)?.subtype !== "receivable") return;
    const view = normalizeLine(line);
    if (line.lease_id) arByLease.set(line.lease_id, [...(arByLease.get(line.lease_id) || []), view]);
    if (line.tenant_id) arByTenant.set(line.tenant_id, [...(arByTenant.get(line.tenant_id) || []), view]);
  }

  // property.ledger_void: mirror-image reversal, original marked void.
  function voidEntry(entryId, { date, memo, at }) {
    const orig = entryById.get(entryId);
    const id = sid(G.entry, ++entrySeq);
    const d = maxDate(date, orig.entry_date);
    const created = at || stamp(d, "19:00", ++clock);
    const row = {
      ...orig, id, entry_date: d, memo: memo || `Void: ${orig.memo || orig.source_type}`, status: "posted", reversal_of: orig.id,
      voided_at: null, idempotency_key: null, metadata: { voidOf: orig.id }, created_at: created, updated_at: created,
    };
    entries.push(row);
    entryById.set(id, row);
    const mine = [];
    for (const l of linesByEntry.get(entryId)) {
      const line = {
        ...l, id: sid(G.line, ++lineSeq), entry_id: id, entry_date: d, debit: l.credit, credit: l.debit,
        memo: memo || `Void: ${l.memo || ""}`, applies_to_entry_id: l.applies_to_entry_id || orig.id,
        metadata: {}, created_at: created, updated_at: created, cleared: false, cleared_on: null, reconciliation_id: null,
      };
      lines.push(line);
      mine.push(line);
      track(line);
    }
    linesByEntry.set(id, mine);
    Object.assign(orig, { status: "void", voided_at: created, updated_at: created, metadata: { ...(orig.metadata || {}), voidEntryId: id } });
    return row;
  }

  const openFor = (leaseId) => openItems((arByLease.get(leaseId) || []).map(withEntry), ACCT, "receivable");
  const balanceOfLease = (leaseId) => round2((arByLease.get(leaseId) || []).reduce((s, l) => s + l.debit - l.credit, 0));
  const openTotal = (leaseId) => round2(openFor(leaseId).reduce((s, i) => s + i.open, 0));

  // --- Billed leases (people's rows), renewal chains ------------------------------------
  const LEASES = new Map();
  for (const r of leaseRows) {
    if (!live(r) || ![...ACTIVE_LEASE, ...CLOSED_LEASE].includes(r.status)) continue;
    const t = tenantRows.find((x) => x.id === r.tenant_id);
    const u = unitOf(r.unit_id);
    const start = r.move_in_date || r.term_start;
    if (!t || !u || !start || start > TODAY) continue;
    const closed = CLOSED_LEASE.includes(r.status);
    const end = closed ? r.move_out_date || r.term_end : null;
    if (end && end < START) continue;
    LEASES.set(r.id, {
      id: r.id, name: r.name || `${u.label} — ${t.name}`, unitId: u.id, unitLabel: u.label, unitDisplay: u.display,
      tenantId: t.id, tenantName: t.name, tenantEmail: t.email || null, propertyId: r.property_id || u.propertyId,
      rent: Number(r.rent) || 0, deposit: Number(r.deposit) || u.deposit, start, end, status: r.status, closed,
      renewalOf: r.renewal_of_id && leaseRows.some((x) => x.id === r.renewal_of_id) ? r.renewal_of_id : null,
      commercial: r.lease_type === "commercial",
    });
  }
  const successorOf = (L) => [...LEASES.values()].find((x) => x.renewalOf === L.id) || null;
  const chainOf = (L) => {
    const out = [L];
    for (let p = LEASES.get(L.renewalOf); p; p = LEASES.get(p.renewalOf)) out.unshift(p);
    return out;
  };
  const isRenewal = (L) => Boolean(L.renewalOf && LEASES.has(L.renewalOf));
  const firstBillYm = (L) => (isRenewal(L) || L.start < START ? maxDate(addMonths(ymOf(L.start), isRenewal(L) ? 1 : 0), START_YM) : addMonths(ymOf(L.start), 1));
  const lastBillYm = (L) => (L.closed ? ymOf(L.end) : NOW_YM);
  const activeOn = (L, date) => L.start <= date && (!L.closed || date <= L.end);
  const tenantByName = (name) => tenantRows.find((t) => live(t) && t.name === name);
  const currentOf = (tenantId) =>
    [...LEASES.values()].filter((L) => L.tenantId === tenantId).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
  const CUR = (n) => LEASES.get(core.TENANTS[n - 1].leaseId) || currentOf(core.TENANTS[n - 1].id);
  const inEffect = (tenantId, ym) =>
    [...LEASES.values()].find((L) => L.tenantId === tenantId && ym >= firstBillYm(L) && ym <= lastBillYm(L)) || currentOf(tenantId);

  const leaseOfRow = (id) => {
    const r = leaseRows.find((x) => x.id === id);
    if (!r) return null;
    const u = unitOf(r.unit_id);
    return { id: r.id, name: r.name, unitId: r.unit_id, tenantId: r.tenant_id, propertyId: r.property_id || u?.propertyId, rent: Number(r.rent) || 0, deposit: Number(r.deposit) || 0, start: r.move_in_date || r.term_start, end: r.term_end, status: r.status, unitDisplay: u?.display || r.unit, tenantName: r.tenant_name };
  };
  const ZOE = leaseOfRow(core.TENANTS[15].leaseId);
  const JAMAL = leaseOfRow(core.TENANTS[16].leaseId);

  const dimsOf = (L) => ({ leaseId: L.id, tenantId: L.tenantId, unitId: L.unitId, propertyId: L.propertyId, ownerId: ownerId(L.propertyId) });

  // Payment habits by tenant: [channel, pay day, method label]. Channels: autopay (ACH plan),
  // card / ach (resident portal), check / wire (recorded by staff).
  const PROFILE = new Map();
  const CORE_PROFILES = {
    1: ["autopay", 2, "Bank ••4417"], 2: ["autopay", 2, "Bank ••0932"], 3: ["card", 3, "Visa ••5521"],
    4: ["check", 4, "Check"], 5: ["autopay", 2, "Bank ••7740"], 6: ["check", 5, "Check"],
    7: ["autopay", 2, "Bank ••2268"], 8: ["card", 3, "Mastercard ••8104"], 9: ["ach", 2, "Bank ••6153"],
    10: ["ach", 1, "Bank ••3389"], 11: ["autopay", 2, "Bank ••9011"], 12: ["card", 2, "Visa ••4476"],
    13: ["check", 3, "Check"], 14: ["autopay", 2, "Bank ••1250"], 15: ["card", 4, "Visa ••6608"],
    18: ["autopay", 2, "Bank ••5530"],
  };
  for (const [n, p] of Object.entries(CORE_PROFILES)) PROFILE.set(core.TENANTS[n - 1].id, p);
  const NAMED_PROFILES = { "Cobalt Design Studio LLC": ["wire", 2, "Wire"], "Owen Pryce": ["card", 3, "Visa ••2290"], "Kira Matsuda": ["check", 5, "Check"] };
  for (const [name, p] of Object.entries(NAMED_PROFILES)) if (tenantByName(name)) PROFILE.set(tenantByName(name).id, p);
  const profileOf = (L) => PROFILE.get(L.tenantId) || ["check", 3, "Check"];

  // Delinquent leases' payment arrangements (late fees off from the day they were agreed).
  const LEASE_OVERRIDES = new Map();
  const overrideLease = (L, from, overrides) => L && LEASE_OVERRIDES.set(L.id, { from, overrides });
  overrideLease(CUR(6), rel("2026-10-09"), { lateFeeType: "none" }); // Omar Haddad
  overrideLease(CUR(8), rel("2026-10-02"), { lateFeeType: "none" }); // Marcus Johnson
  overrideLease(CUR(15), rel("2026-10-10"), { lateFeeType: "none" }); // Liam O'Connor
  overrideLease(CUR(14), START, { allowPartialPayments: false }); // Ravi Patel — owner requires full payments

  // Property overrides: the sandbox set + the primary owner's agreed fee.
  const PROP_OVERRIDES = new Map();
  for (const p of propRows) {
    const idx = core.PROPERTIES.findIndex((x) => x.id === p.id);
    const base = idx >= 0 ? { ...PROPERTY_OVERRIDES[idx] } : {};
    const pct = Number(ownerRow(ownerId(p.id))?.management_fee_pct);
    if (pct && pct !== COMPANY_POLICIES.managementFeePct && (idx >= 0 || [...LEASES.values()].some((L) => L.propertyId === p.id))) base.managementFeePct = pct;
    if (p.name === "Pioneer Square Office Suites") base.ownerReserve = 10000; // keeps the takeover working capital
    if (Object.keys(base).length) PROP_OVERRIDES.set(p.id, base);
  }
  const propertyPolicies = (pid) => effectivePolicies({ company: COMPANY_POLICIES, property: { metadata: { policyOverrides: PROP_OVERRIDES.get(pid) || {} } } });
  const policiesAt = (L, date) => {
    const o = LEASE_OVERRIDES.get(L.id);
    return effectivePolicies({
      company: COMPANY_POLICIES,
      property: { metadata: { policyOverrides: PROP_OVERRIDES.get(L.propertyId) || {} } },
      lease: { metadata: { policyOverrides: o && o.from <= date ? o.overrides : {} } },
    });
  };

  // --- Action queue (kind "rc" / "autopay" = the 12:00 UTC job runs) ---------------------
  const actions = [];
  let actionSeq = 0;
  const at = (date, time, fn, kind = "") => {
    if (date > TODAY) return;
    actions.push({ date, time, seq: ++actionSeq, fn, kind });
  };
  const trustOutflows = []; // { date, propertyId, amount } for distribution look-ahead
  const legacyByPropMonth = new Map(); // "pid|ym" → legacy cash rent receipts (management fee base)

  // --- Online payments ------------------------------------------------------------------
  const payments = [];
  let paymentSeq = 0;
  const plans = new Map(); // tenant id → plan row
  const payoutOf = (date) => ({ payout_id: `HP-PAYOUT-${addDays(date, 2).replaceAll("-", "")}`, payout_arrival_date: addDays(date, 2) });
  const cardFee = (amount) => round2((amount * COMPANY_POLICIES.cardFeePct) / 100);
  const stripeFee = (method, total) => (method === "card" ? round2(total * 0.029 + 0.3) : Math.min(5, round2(total * 0.008)));

  function onlinePayment(L, fields) {
    const row = {
      id: sid(G.payment, ++paymentSeq), project_id: ctx.projectId, lease_id: L.id, tenant_id: L.tenantId,
      property_id: L.propertyId, unit_id: L.unitId, autopay_plan_id: null, description: `Payment · ${L.name}`,
      payer_name: L.tenantName, payer_email: L.tenantEmail, source: "portal", method: "card", method_label: null, status: "pending",
      currency: "usd", amount: 0, convenience_fee: 0, processor_fee: 0, total: 0, refunded_amount: 0,
      link_token: null, link_expires_at: null, stripe_session_id: null, stripe_payment_intent_id: null,
      stripe_charge_id: null, stripe_customer_id: null, stripe_payment_method_id: null,
      ledger_entry_id: null, fee_entry_id: null, nsf_entry_id: null, idempotency_key: null,
      paid_at: null, failed_at: null, returned_at: null, return_reason: null, payout_id: null, payout_arrival_date: null,
      metadata: {}, created_by: null, ...fields,
    };
    row.total = round2(row.total || row.amount + row.convenience_fee);
    row.updated_at = row.updated_at || row.created_at;
    payments.push(row);
    return row;
  }

  // Post a settled online payment like postPaymentToLedger (stripe:/stripe-fee: keys).
  function settleOnline(row, paidAt) {
    const date = paidAt.slice(0, 10);
    const L = LEASES.get(row.lease_id);
    const label = row.method === "ach" ? "ACH" : "Card";
    const { allocations } = allocateOldestFirst(openFor(row.lease_id), row.amount);
    const entry = commit(
      buildPayment(
        {
          ...dimsOf(L), cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust, date, amount: row.amount, allocations,
          method: label, memo: `Online payment · ${label}${row.method_label ? ` · ${row.method_label}` : ""}`,
          sourceId: row.id, idempotencyKey: `stripe:${row.id}`,
          metadata: { onlinePaymentId: row.id, stripePaymentIntentId: null, source: row.source },
        },
        ACCT,
      ),
      { at: paidAt },
    );
    row.ledger_entry_id = entry.id;
    if (row.convenience_fee > 0) {
      const fee = commit(
        buildCashTransaction(
          {
            direction: "in", amount: row.convenience_fee, cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust,
            glAccountId: GL("other_income"), date, memo: `Convenience fee · ${label} payment`,
            leaseId: row.lease_id, tenantId: row.tenant_id, propertyId: row.property_id, sourceId: row.id,
            idempotencyKey: `stripe-fee:${row.id}`, metadata: { onlinePaymentId: row.id, convenienceFee: true },
          },
          ACCT,
        ),
        { at: paidAt },
      );
      row.fee_entry_id = fee.id;
    }
    Object.assign(row, { status: "succeeded", paid_at: paidAt, processor_fee: stripeFee(row.method, row.total), updated_at: paidAt });
    if (addDays(date, 2) <= TODAY) Object.assign(row, payoutOf(date));
    return entry;
  }

  // Card / ACH portal payment of `amount` (default: everything open) on `date`.
  function portalPay(L, date, { amount, time = "17:30", channel, source = "portal", description, label: labelAs } = {}) {
    const [kind, , profileLabel] = profileOf(L);
    const method = (channel || kind) === "ach" || (!channel && kind === "autopay") ? "ach" : "card";
    const label = labelAs || profileLabel;
    at(date, time, () => {
      const amt = round2(amount ?? openTotal(L.id));
      if (!(amt > 0)) return;
      const row = onlinePayment(L, {
        source, method, method_label: label, amount: amt, convenience_fee: method === "card" ? cardFee(amt) : 0, created_at: stamp(date, time),
        description: description || `Payment · ${L.name}`, created_by: source === "staff_checkout" ? ctx.createdBy : null,
      });
      if (method === "card") settleOnline(row, stamp(date, time, 30));
      else {
        row.status = "processing";
        const settle = addDays(date, 3);
        if (settle <= TODAY) at(settle, "16:00", () => settleOnline(row, stamp(settle, "16:00")));
      }
    });
  }

  // Manual payment through the ledger dialog (no idempotency key, like the app).
  function manualPay(L, date, { amount, method = "Check", reference, allocations, time = "18:30" } = {}) {
    at(date, time, () => {
      const amt = round2(amount ?? openTotal(L.id));
      if (!(amt > 0)) return;
      const allocs = allocations ? allocations() : allocateOldestFirst(openFor(L.id), amt).allocations;
      commit(
        buildPayment(
          { ...dimsOf(L), cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust, date, amount: amt, method, allocations: allocs, metadata: reference ? { reference } : {} },
          ACCT,
        ),
        { at: stamp(date, time), createdBy: ctx.createdBy },
      );
    });
  }

  // --- Charges --------------------------------------------------------------------------
  const rentEntries = new Map(); // "leaseId|ym" → entry id
  function postRent(L, ym, accountId) {
    const date = firstOf(ym);
    at(date, "15:00", () => {
      const e = commit(
        buildCharge({ ...dimsOf(L), date, amount: L.rent, memo: `Rent · ${longMonth(ym)}`, sourceId: accountId, idempotencyKey: `rent:${accountId}:${ym}` }, ACCT),
        { at: stamp(date, "15:00"), createdBy: ctx.createdBy },
      );
      rentEntries.set(`${L.id}|${ym}`, e.id);
    });
  }
  function charge(L, date, { amount, memo, incomeKey, glAccountId, key, sourceId, metadata, time = "15:20", createdBy = ctx.createdBy, onPosted }) {
    at(date, time, () => {
      const e = commit(buildCharge({ ...dimsOf(L), date, amount, memo, incomeKey, glAccountId, idempotencyKey: key, sourceId, metadata }, ACCT), {
        at: stamp(date, time), createdBy,
      });
      onPosted?.(e);
    });
  }
  const monthsFrom = (ym) => {
    const out = [];
    for (let k = ym; k <= NOW_YM; k = addMonths(k, 1)) out.push(k);
    return out;
  };

  // --- Rent accounts: one per tenant (shared across renewal terms) -------------------------
  const rentRows = ctx.rows("rent_accounts");
  let rentSeq = 0;
  const accountOf = new Map(); // tenant id → rent account row
  function ensureAccount(L, extra = {}) {
    let row = accountOf.get(L.tenantId) || rentRows.find((r) => r.tenant_id === L.tenantId);
    if (!row) {
      const p = propRow(L.propertyId) || {};
      row = {
        id: sid(G.rent, ++rentSeq), name: `${L.unitDisplay} — ${L.tenantName}`, unit: L.unitDisplay, tenant_name: L.tenantName,
        due_day: 1, frequency: "Monthly", autopay: false, payment_method: "ACH", status: "Current",
        metadata: { propertyName: p.name || propName(L.propertyId), address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") },
      };
      rentRows.push(row);
    }
    accountOf.set(L.tenantId, row);
    Object.assign(row, { unit_id: L.unitId, tenant_id: L.tenantId, property_id: L.propertyId, lease_id: L.id, rent: L.rent, ...extra });
    return row;
  }
  for (const L of [...LEASES.values()].sort((a, b) => a.start.localeCompare(b.start))) ensureAccount(L);

  // --- Lease stories: months handled explicitly (no default payment) ------------------------
  const story = (n, ...yms) => yms.map((ym) => `${CUR(n)?.id}|${relYm(ym)}`);
  const SKIP_DEFAULT = new Set([
    ...story(6, "2026-07", "2026-10"), ...story(8, "2026-08", "2026-09", "2026-10"), ...story(15, "2026-10"),
    ...story(3, "2026-06", "2026-10"), ...story(14, "2026-08", "2026-09", "2026-10"), ...story(4, "2026-03"),
  ]);
  const KIRA = tenantByName("Kira Matsuda") ? currentOf(tenantByName("Kira Matsuda").id) : null;
  if (KIRA) SKIP_DEFAULT.add(`${KIRA.id}|${ymOf(KIRA.end)}`); // abandoned with the final month unpaid
  const RENT_ONLY_AFTER = new Map([[CUR(6)?.id, relYm("2026-07")]]); // Omar keeps the disputed July fee open
  const checkNo = new Map();
  const nextCheck = (L) => {
    const v = (checkNo.get(L.tenantId) || 1100 + (hash(L.tenantId) % 80) * 100) + 1;
    checkNo.set(L.tenantId, v);
    return `Check #${v}`;
  };

  // --- Deposits (security_deposits rows; lease.deposit when a lease has none) ---------------
  const depositsOfChain = (L) => {
    const ids = new Set(chainOf(L).map((x) => x.id));
    return depositRows.filter((d) => live(d) && ids.has(d.lease_id) && d.status !== "Pending" && Number(d.amount) > 0);
  };
  const openingDeposits = []; // [{ L, amount, memo }]
  const depositPlans = [];
  for (const L of LEASES.values()) {
    if (isRenewal(L)) continue; // the chain root carries the deposits
    const chain = [L];
    for (let s = successorOf(L); s; s = successorOf(s)) chain.push(s);
    const records = depositsOfChain(chain.at(-1));
    const list = records.map((d) => ({ record: d, amount: Number(d.amount), received: d.metadata?.receivedOn || L.start, kind: d.metadata?.depositKind || "Security deposit" }));
    // No security-deposit record for the lease → the lease's own deposit, received at move-in.
    if (!list.some((x) => x.kind === "Security deposit")) list.push({ record: null, amount: L.deposit, received: L.start, kind: "Security deposit" });
    for (const dp of list) depositPlans.push({ ...dp, root: L, chain });
  }
  for (const dp of depositPlans) {
    const holder = dp.received < START ? dp.chain.find((x) => activeOn(x, START)) || dp.root : dp.chain.find((x) => activeOn(x, dp.received)) || dp.root;
    dp.holder = holder;
    if (dp.received < START) openingDeposits.push({ L: holder, amount: dp.amount, memo: `${dp.kind} held · ${holder.name}` });
    else {
      at(dp.received, "16:05", () =>
        commit(
          buildDepositHeld(
            { ...dimsOf(holder), date: dp.received, amount: dp.amount, memo: dp.kind === "Security deposit" ? "" : `${dp.kind === "Other" ? "Other deposit" : dp.kind} received`, cashGlAccountId: GL("deposit_cash"), bankAccountId: BANK.deposit, metadata: { reference: dp.record?.metadata?.receiptNumber || "Cashier's check" } },
            ACCT,
          ),
          { at: stamp(dp.received, "16:05"), createdBy: ctx.createdBy },
        ),
      );
    }
  }
  // Deposits already received on leases that haven't started yet (Future / Pending tenants).
  for (const d of depositRows) {
    if (!live(d) || d.status !== "Held" || LEASES.has(d.lease_id) || depositPlans.some((x) => x.record === d)) continue;
    const lr = leaseOfRow(d.lease_id);
    const received = d.metadata?.receivedOn;
    if (!lr || !received || received < START || received > TODAY) continue;
    at(received, "16:05", () =>
      commit(
        buildDepositHeld({ ...dimsOf(lr), date: received, amount: Number(d.amount), cashGlAccountId: GL("deposit_cash"), bankAccountId: BANK.deposit, metadata: { reference: d.metadata?.receiptNumber || "Cashier's check" } }, ACCT),
        { at: stamp(received, "16:05"), createdBy: ctx.createdBy },
      ),
    );
  }
  // Renewals: the deposit liability moves to the new term.
  for (const L of LEASES.values()) {
    if (!isRenewal(L)) continue;
    const prior = LEASES.get(L.renewalOf);
    at(L.start, "15:45", () => {
      const held = round2(lines.filter((l) => l.gl_account_id === GL("security_deposits") && l.lease_id === prior.id).reduce((s, l) => s + l.credit - l.debit, 0));
      if (!(held > 0)) return;
      commit(
        buildJournal({
          date: L.start, memo: `Deposit carried to the renewal lease · ${L.name}`,
          lines: [
            { glAccountId: GL("security_deposits"), debit: held, ...dimsOf(prior) },
            { glAccountId: GL("security_deposits"), credit: held, ...dimsOf(L) },
          ],
        }),
        { at: stamp(L.start, "15:45"), createdBy: ctx.createdBy },
      );
    });
  }

  // --- Leases: move-ins, rent, default payments ---------------------------------------------
  const HANNAH = CUR(5);
  for (const L of LEASES.values()) {
    const account = accountOf.get(L.tenantId);
    if (!isRenewal(L) && L.start >= START) {
      const prorated = prorateRent(policiesAt(L, L.start), L.rent, L.start);
      charge(L, L.start, { amount: prorated, memo: "First month's rent", key: `movein:${L.id}:rent`, time: "16:00" });
      if (L === HANNAH) {
        at(L.start, "16:08", () => {
          const items = openFor(L.id);
          commit(buildCredit({ ...dimsOf(L), date: L.start, amount: 500, memo: "Move-in special — $500 off the first month", allocations: [{ entryId: items[0].entryId, amount: 500 }] }, ACCT), {
            at: stamp(L.start, "16:08"), createdBy: ctx.createdBy,
          });
        });
      }
      manualPay(L, L.start, { method: L.commercial ? "Wire" : "Money order", reference: "Move-in funds", time: "16:10" });
    }
    const [channel, day] = profileOf(L);
    for (const ym of monthsFrom(firstBillYm(L))) {
      if (ym > lastBillYm(L)) break;
      postRent(L, ym, account.id);
      const date = dayIn(ym, day);
      if (SKIP_DEFAULT.has(`${L.id}|${ym}`) || date > TODAY || channel === "autopay") continue;
      if (channel === "check" || channel === "wire") {
        const rentOnly = RENT_ONLY_AFTER.has(L.id) && ym > RENT_ONLY_AFTER.get(L.id);
        manualPay(L, date, {
          method: channel === "wire" ? "Wire" : "Check",
          reference: channel === "wire" ? `Wire · ${L.tenantName}` : nextCheck(L),
          ...(rentOnly ? { amount: L.rent, allocations: () => [{ entryId: rentEntries.get(`${L.id}|${ym}`), amount: L.rent }] } : {}),
        });
      } else portalPay(L, date);
    }
  }

  // --- Autopay plans + their monthly charges ------------------------------------------------
  let planSeq = 0;
  function makePlan(L, fields) {
    const row = {
      id: sid(G.plan, ++planSeq), project_id: ctx.projectId, lease_id: L.id, tenant_id: L.tenantId, property_id: L.propertyId,
      unit_id: L.unitId, name: `Autopay · ${L.name}`, payer_email: L.tenantEmail, status: "pending_setup", amount_mode: "balance",
      fixed_amount: null, max_amount: null, charge_day: null, method: "ach", method_label: profileOf(L)[2] || null,
      stripe_customer_id: null, stripe_payment_method_id: null, setup_session_id: null, link_token: null,
      last_run_on: null, last_run_period: null, last_status: null, last_error: null, failure_count: 0,
      activated_at: null, canceled_at: null, metadata: {}, created_by: null, ...fields,
    };
    plans.set(L.tenantId, row);
    return row;
  }
  const AUTOPAY = { 1: { status: "active" }, 2: { status: "active" }, 5: { status: "active" }, 7: { status: "active" }, 11: { status: "active", maxAmount: 4000 }, 14: { status: "paused" }, 18: { status: "canceled" } };
  for (const [nKey, spec] of Object.entries(AUTOPAY)) {
    const cur = CUR(Number(nKey));
    if (!cur) continue;
    const chain = chainOf(cur);
    const enrolled = maxDate(chain[0].start, START);
    const plan = makePlan(cur, {
      status: spec.status, max_amount: spec.maxAmount || null, activated_at: stamp(enrolled, "20:00"), created_at: stamp(enrolled, "19:40"),
      canceled_at: spec.status === "canceled" && cur.closed ? stamp(cur.end, "21:00") : null,
    });
    for (const L of chain) {
      for (const ym of monthsFrom(firstBillYm(L))) {
        if (ym > lastBillYm(L) || SKIP_DEFAULT.has(`${L.id}|${ym}`)) continue;
        const runOn = dayIn(ym, 1 + PAYMENT_SETTINGS("").autopayDayOffset);
        at(runOn, "12:00", () => {
          const amount = round2(Math.min(balanceOfLease(L.id), plan.max_amount || Infinity));
          Object.assign(plan, { last_run_on: runOn, last_run_period: ym });
          if (!(amount > 0)) {
            plan.last_status = "nothing_due";
            return;
          }
          const row = onlinePayment(L, {
            autopay_plan_id: plan.id, description: `Autopay · ${ym}`, source: "autopay", method: "ach", method_label: plan.method_label,
            amount, status: "processing", idempotency_key: `autopay:${plan.id}:${ym}`, created_at: stamp(runOn, "12:00", 5),
          });
          plan.last_status = "charging";
          const settle = addDays(runOn, 3);
          if (settle <= TODAY) {
            at(settle, "16:00", () => {
              settleOnline(row, stamp(settle, "16:00"));
              Object.assign(plan, { last_status: "succeeded", failure_count: 0, last_error: null });
            });
          }
        }, "autopay");
      }
    }
  }
  // Ethan enrolled but never finished bank verification; Noah turned autopay off before the first run.
  if (CUR(10)) makePlan(CUR(10), { status: "pending_setup", created_at: stamp(addDays(CUR(10).start, 2), "20:10") });
  if (CUR(12)) {
    makePlan(CUR(12), {
      status: "canceled", method: "card", method_label: "Visa ••4476", created_at: stamp(addDays(CUR(12).start, 3), "18:00"),
      activated_at: stamp(addDays(CUR(12).start, 3), "18:05"), canceled_at: stamp(addDays(CUR(12).start, 10), "17:00"),
      metadata: { cancelReason: "Prefers paying by card for the rewards points." },
    });
  }

  // --- Delinquency stories and payment exceptions -----------------------------------------
  const OMAR = CUR(6);
  const MARCUS = CUR(8);
  const LIAM = CUR(15);
  const PRIYA = CUR(3);
  const NOAH = CUR(12);
  const RAVI = CUR(14);
  const LUCAS = CUR(4);
  const SOFIA = CUR(9);
  const CHLOE = CUR(13);
  const EMILY = CUR(18);
  const rentOf = (L, ym) => rentEntries.get(`${L.id}|${relYm(ym)}`);

  // Omar Haddad: July check returned (NSF), replaced by money order; October paid short.
  {
    const jul = relYm("2026-07");
    let checkEntry = null;
    at(dayIn(jul, 3), "18:30", () => {
      checkEntry = commit(
        buildPayment(
          { ...dimsOf(OMAR), cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust, date: dayIn(jul, 3), amount: OMAR.rent, method: "Check",
            allocations: [{ entryId: rentOf(OMAR, "2026-07"), amount: OMAR.rent }], metadata: { reference: nextCheck(OMAR) } },
          ACCT,
        ),
        { at: stamp(dayIn(jul, 3), "18:30"), createdBy: ctx.createdBy },
      );
    });
    at(dayIn(jul, 10), "17:00", () => voidEntry(checkEntry.id, { date: dayIn(jul, 10), memo: "Returned check — NSF (insufficient funds)", at: stamp(dayIn(jul, 10), "17:00") }));
    let nsf = null;
    charge(OMAR, dayIn(jul, 10), { amount: COMPANY_POLICIES.nsfFee, memo: "Returned check fee (NSF)", incomeKey: "other_income", time: "17:05", onPosted: (e) => (nsf = e) });
    manualPay(OMAR, dayIn(jul, 14), {
      amount: OMAR.rent + COMPANY_POLICIES.nsfFee, method: "Money order", reference: "Money order — replaces returned check",
      allocations: () => [{ entryId: rentOf(OMAR, "2026-07"), amount: OMAR.rent }, { entryId: nsf.id, amount: COMPANY_POLICIES.nsfFee }],
    });
    manualPay(OMAR, rel("2026-10-05"), {
      amount: OMAR.rent - 1300, reference: nextCheck(OMAR),
      allocations: () => [{ entryId: rentOf(OMAR, "2026-10"), amount: OMAR.rent - 1300 }],
    });
    at(rel("2026-10-12"), "20:00", () =>
      onlinePayment(OMAR, {
        source: "staff_link", method: "ach", amount: 1450, status: "link_sent", created_by: ctx.createdBy, description: "Balance due · October rent + July fee",
        link_token: tokenOf("omar-oct"), link_expires_at: stamp(rel("2026-10-26"), "20:00"), created_at: stamp(rel("2026-10-12"), "20:00"),
      }),
    );
  }

  // Marcus Johnson: August paid late (fee left open), September short by money order, October unpaid.
  {
    portalPay(MARCUS, rel("2026-08-12"), { amount: MARCUS.rent });
    manualPay(MARCUS, rel("2026-09-18"), {
      amount: MARCUS.rent - 5, method: "Money order", reference: "Money order — September rent",
      allocations: () => [{ entryId: rentOf(MARCUS, "2026-09"), amount: MARCUS.rent - 5 }],
    });
    at(rel("2026-10-03"), "17:40", () =>
      onlinePayment(MARCUS, {
        method: "card", method_label: "Mastercard ••8104", amount: MARCUS.rent, convenience_fee: cardFee(MARCUS.rent), status: "failed",
        created_at: stamp(rel("2026-10-03"), "17:40"), failed_at: stamp(rel("2026-10-03"), "17:41"), return_reason: "card_declined — insufficient funds",
      }),
    );
    at(rel("2026-10-09"), "21:15", () =>
      onlinePayment(MARCUS, {
        source: "staff_link", method: null, amount: 2150, status: "canceled", created_by: ctx.createdBy, description: "Balance due · October",
        created_at: stamp(rel("2026-10-09"), "21:15"), updated_at: stamp(rel("2026-10-12"), "17:00"),
        metadata: { canceledReason: "Online payments are blocked while the eviction is open — certified funds only." },
      }),
    );
  }

  // Liam O'Connor: October paid short by card, then an abandoned checkout for the rest.
  portalPay(LIAM, rel("2026-10-04"), { amount: LIAM.rent - 575 });
  at(rel("2026-10-18"), "02:30", () =>
    onlinePayment(LIAM, { method: "card", amount: 650, convenience_fee: cardFee(650), status: "pending", created_at: stamp(rel("2026-10-18"), "02:30") }),
  );

  // Priya Raman: June card payment disputed (a fee followed once it re-opened), paid again by ACH;
  // October overpaid by $100 and partly refunded.
  {
    const jun = relYm("2026-06");
    let disputed = null;
    at(dayIn(jun, 3), "17:30", () => {
      const amount = openTotal(PRIYA.id);
      disputed = onlinePayment(PRIYA, { method: "card", method_label: "Visa ••5521", amount, convenience_fee: cardFee(amount), created_at: stamp(dayIn(jun, 3), "17:30") });
      settleOnline(disputed, stamp(dayIn(jun, 3), "17:31"));
    });
    at(dayIn(jun, 20), "16:30", () => {
      voidEntry(disputed.ledger_entry_id, { date: dayIn(jun, 20), memo: "Returned payment: fraudulent", at: stamp(dayIn(jun, 20), "16:30") });
      voidEntry(disputed.fee_entry_id, { date: dayIn(jun, 20), memo: "Returned payment: fraudulent", at: stamp(dayIn(jun, 20), "16:30", 5) });
      Object.assign(disputed, { status: "disputed", returned_at: stamp(dayIn(jun, 20), "16:30"), return_reason: "fraudulent — cardholder didn't recognise the charge", updated_at: stamp(dayIn(jun, 20), "16:30") });
    });
    portalPay(PRIYA, dayIn(jun, 24), { channel: "ach", label: "Bank ••7702" });
    const oct = relYm("2026-10");
    let over = null;
    at(dayIn(oct, 3), "17:30", () => {
      const amount = round2(openTotal(PRIYA.id) + 100);
      over = onlinePayment(PRIYA, { method: "card", method_label: "Visa ••5521", amount, convenience_fee: cardFee(amount), created_at: stamp(dayIn(oct, 3), "17:30") });
      settleOnline(over, stamp(dayIn(oct, 3), "17:31"));
    });
    at(dayIn(oct, 6), "18:00", () => {
      const refundId = sid(G.misc, 1);
      const e = commit(
        {
          entry: {
            date: dayIn(oct, 6), memo: "Refund · online payment · Overpayment", sourceType: "adjustment", sourceId: over.id,
            idempotencyKey: `stripe-refund:${refundId}`, metadata: { onlinePaymentId: over.id, stripeRefundId: refundId },
            leaseId: PRIYA.id, tenantId: PRIYA.tenantId, unitId: PRIYA.unitId, propertyId: PRIYA.propertyId, ownerId: ownerId(PRIYA.propertyId),
          },
          lines: [
            { glAccountId: GL("accounts_receivable"), debit: 100, memo: "Refunded payment" },
            { glAccountId: GL("trust_cash"), credit: 100, bankAccountId: BANK.trust },
          ],
        },
        { at: stamp(dayIn(oct, 6), "18:00") },
      );
      Object.assign(over, {
        refunded_amount: 100, status: "partially_refunded", updated_at: stamp(dayIn(oct, 6), "18:00"),
        metadata: { refunds: [{ id: refundId, amount: 100, reason: "Overpayment — paid $100 more than the balance", at: stamp(dayIn(oct, 6), "18:00"), entryId: e.id }] },
      });
    });
  }

  // Noah Schmidt: August card payment went through twice — the duplicate was refunded in full;
  // October courtesy credit for the furnace outage (unapplied, sits on the account).
  {
    const aug = relYm("2026-08");
    let dup = null;
    at(dayIn(aug, 2), "17:45", () => {
      const first = payments.filter((p) => p.lease_id === NOAH.id).at(-1);
      dup = onlinePayment(NOAH, { method: "card", method_label: "Visa ••4476", amount: first.amount, convenience_fee: first.convenience_fee, created_at: stamp(dayIn(aug, 2), "17:45") });
      settleOnline(dup, stamp(dayIn(aug, 2), "17:46"));
    });
    at(dayIn(aug, 4), "16:00", () => {
      voidEntry(dup.ledger_entry_id, { date: dayIn(aug, 4), memo: "Refunded online payment", at: stamp(dayIn(aug, 4), "16:00") });
      voidEntry(dup.fee_entry_id, { date: dayIn(aug, 4), memo: "Refunded online payment", at: stamp(dayIn(aug, 4), "16:00", 5) });
      Object.assign(dup, {
        status: "refunded", refunded_amount: dup.total, updated_at: stamp(dayIn(aug, 4), "16:00"),
        metadata: { refunds: [{ id: sid(G.misc, 2), amount: dup.total, reason: "Duplicate payment", at: stamp(dayIn(aug, 4), "16:00"), entryId: null }] },
      });
    });
    at(rel("2026-10-16"), "20:00", () =>
      commit(buildCredit({ ...dimsOf(NOAH), date: rel("2026-10-16"), amount: 75, memo: "Courtesy credit — furnace outage", allocations: [] }, ACCT), {
        at: stamp(rel("2026-10-16"), "20:00"), createdBy: ctx.createdBy,
      }),
    );
  }

  // Ravi Patel: August autopay returned (NSF), September autopay failed → plan paused; portal ACH since.
  {
    const plan = plans.get(RAVI.tenantId);
    const aug = relYm("2026-08");
    let ret = null;
    at(dayIn(aug, 2), "12:00", () => {
      ret = onlinePayment(RAVI, {
        autopay_plan_id: plan.id, description: `Autopay · ${aug}`, source: "autopay", method: "ach", method_label: plan.method_label,
        amount: balanceOfLease(RAVI.id), status: "processing", idempotency_key: `autopay:${plan.id}:${aug}`, created_at: stamp(dayIn(aug, 2), "12:00", 5),
      });
      Object.assign(plan, { last_run_on: dayIn(aug, 2), last_run_period: aug, last_status: "charging" });
    }, "autopay");
    at(dayIn(aug, 5), "16:00", () => {
      settleOnline(ret, stamp(dayIn(aug, 5), "16:00"));
      plan.last_status = "succeeded";
    });
    at(dayIn(aug, 10), "15:30", () => {
      const reason = "R01 — Insufficient funds";
      voidEntry(ret.ledger_entry_id, { date: dayIn(aug, 10), memo: `Returned payment: ${reason}`, at: stamp(dayIn(aug, 10), "15:30") });
      const nsf = commit(
        buildCharge(
          { ...dimsOf(RAVI), amount: COMPANY_POLICIES.nsfFee, incomeKey: "other_income", date: dayIn(aug, 10), memo: "Returned payment (NSF) fee", sourceId: ret.id, idempotencyKey: `nsf:${ret.id}`, metadata: { onlinePaymentId: ret.id, nsf: true } },
          ACCT,
        ),
        { at: stamp(dayIn(aug, 10), "15:30", 10) },
      );
      Object.assign(ret, { status: "returned", returned_at: stamp(dayIn(aug, 10), "15:30"), return_reason: reason, nsf_entry_id: nsf.id, payout_id: null, payout_arrival_date: null, updated_at: stamp(dayIn(aug, 10), "15:30") });
      Object.assign(plan, { failure_count: 1, last_status: "failed", last_error: reason });
    });
    portalPay(RAVI, dayIn(aug, 14), { channel: "ach", label: "Bank ••1250" });
    const sep = relYm("2026-09");
    at(dayIn(sep, 2), "12:00", () => {
      onlinePayment(RAVI, {
        autopay_plan_id: plan.id, description: `Autopay · ${sep}`, source: "autopay", method: "ach", method_label: plan.method_label,
        amount: balanceOfLease(RAVI.id), status: "failed", idempotency_key: `autopay:${plan.id}:${sep}`,
        created_at: stamp(dayIn(sep, 2), "12:00", 5), failed_at: stamp(dayIn(sep, 2), "12:01"), return_reason: "R16 — Account frozen",
      });
      Object.assign(plan, { status: "paused", failure_count: 2, last_run_on: dayIn(sep, 2), last_run_period: sep, last_status: "failed", last_error: "R16 — Account frozen" });
    }, "autopay");
    portalPay(RAVI, dayIn(sep, 3), { channel: "ach", label: "Bank ••1250" });
    portalPay(RAVI, rel("2026-10-01"), { channel: "ach", label: "Bank ••1250" });
  }

  // Lucas prepaid his final (prorated) month ahead of the Nov 19 move-out; March was taken by phone.
  manualPay(LUCAS, rel("2026-10-15"), { amount: round2((LUCAS.rent * 19) / 30), reference: `${nextCheck(LUCAS)} · final month (Nov 1–19)`, allocations: () => [] });
  portalPay(LUCAS, rel("2026-03-04"), { channel: "card", source: "staff_checkout", label: "Visa ••3390" });
  // Sofia's November rent, submitted by ACH yesterday — still settling.
  at(rel("2026-10-19"), "23:10", () =>
    onlinePayment(SOFIA, { method: "ach", method_label: "Bank ••6153", amount: SOFIA.rent + 40, status: "processing", created_at: stamp(rel("2026-10-19"), "23:10"), description: "Payment · November rent (early)" }),
  );
  // Chloe's June payment link expired — she paid by check instead.
  at(rel("2026-06-01"), "21:00", () =>
    onlinePayment(CHLOE, {
      source: "staff_link", method: "ach", amount: CHLOE.rent, status: "expired", created_by: ctx.createdBy, link_token: tokenOf("chloe-jun"),
      link_expires_at: stamp(rel("2026-06-15"), "21:00"), created_at: stamp(rel("2026-06-01"), "21:00"), updated_at: stamp(rel("2026-06-15"), "21:00"), description: "June rent",
    }),
  );

  // --- Recurring charges ------------------------------------------------------------------
  // Sandbox rows by id, new rows by tenant: { id, tenant, from/to design months, gl number, auto (scheduler-posted) }.
  const RECURRING = [
    { id: sid(53, 1), tenant: 1, from: "2026-03", gl: "4060", category: "Parking" },
    { id: sid(53, 2), tenant: 2, from: "2026-05", gl: "4060", category: "Parking" },
    { id: sid(53, 3), tenant: 5, from: "2026-08", gl: "4060", category: "Parking" },
    { id: sid(53, 4), tenant: 7, from: "2026-06", gl: "4070", category: "Pets" },
    { id: sid(53, 5), tenant: 9, from: "2026-01", gl: "4060", category: "Storage" },
    { id: sid(53, 6), tenant: 10, from: "2026-10", gl: "4060", category: "Parking" },
    { id: sid(53, 7), tenant: 12, from: "2026-07", gl: "4100", category: "Insurance" },
    { id: sid(53, 8), tenant: 14, from: "start", to: "2026-08", gl: "4070", category: "Pets", auto: true },
    { id: sid(53, 9), tenant: 13, from: "2025-12", to: "2026-09", gl: "4060", category: "Storage", auto: true },
    { id: sid(53, 10), tenant: 4, gl: "4100", category: "Turnover" },
    { id: sid(G.recurring, 1), tenant: 13, name: "CAM estimate — grounds & common areas", amount: 120, frequency: "Monthly", status: "Active", from: "2025-12", gl: "4040", category: "CAM" },
    { id: sid(G.recurring, 2), tenant: 11, name: "CAM estimate — grounds & common areas", amount: 120, frequency: "Monthly", status: "Active", from: "start", gl: "4040", category: "CAM" },
    { id: sid(G.recurring, 3), tenant: 12, name: "CAM estimate — grounds & common areas", amount: 120, frequency: "Monthly", status: "Active", from: "start", gl: "4040", category: "CAM" },
    { id: sid(G.recurring, 4), tenant: 18, name: "CAM estimate — grounds & common areas", amount: 120, frequency: "Monthly", status: "Ended", from: "start", to: "2026-08", gl: "4040", category: "CAM", auto: true },
    { id: sid(G.recurring, 5), tenant: 14, name: "Annual pest-control program", amount: 180, frequency: "Annually", status: "Active", from: "2026-06", gl: "4100", category: "Services" },
    { id: sid(G.recurring, 6), tenant: "Cobalt Design Studio LLC", name: "CAM estimate — common areas & janitorial", amount: 600, frequency: "Monthly", status: "Active", from: "2026-01", gl: "4040", category: "CAM" },
    { id: sid(G.recurring, 7), tenant: "Cobalt Design Studio LLC", name: "Property tax & insurance estimate (NNN)", amount: 780, frequency: "Monthly", status: "Active", from: "2026-01", gl: "4100", category: "NNN" },
  ];
  const rcRows = ctx.rows("recurring_charges");
  const rcPostings = new Map();
  const rcAuto = new Map();
  for (const spec of RECURRING) {
    const tenantId = typeof spec.tenant === "number" ? core.TENANTS[spec.tenant - 1].id : tenantByName(spec.tenant)?.id;
    const cur = tenantId && currentOf(tenantId);
    if (!cur) continue;
    let row = rcRows.find((r) => r.id === spec.id);
    if (!row) {
      row = { id: spec.id, name: spec.name, amount: spec.amount, frequency: spec.frequency, status: spec.status, metadata: {} };
      rcRows.push(row);
    }
    const chain = chainOf(cur);
    const earliest = firstBillYm(chain[0]);
    const from = !spec.from ? null : spec.from === "start" ? earliest : maxDate(relYm(spec.from), earliest);
    const to = spec.to ? relYm(spec.to) : row.status === "Active" ? NOW_YM : null;
    const step = row.frequency === "Quarterly" ? 3 : row.frequency === "Annually" ? 12 : 1;
    const postings = [];
    rcPostings.set(row.id, postings);
    rcAuto.set(row.id, Boolean(spec.auto));
    let lastPosted = null;
    if (row.status !== "Draft" && from && to) {
      for (let ym = from; ym <= to; ym = addMonths(ym, step)) {
        const date = firstOf(ym);
        const L = inEffect(tenantId, ym);
        if (date > TODAY || date < START || !L) continue;
        lastPosted = ym;
        if (spec.auto) {
          at(date, "12:00", () => {
            const e = commit(
              buildCharge(
                { ...dimsOf(L), date, amount: row.amount, glAccountId: GLN(spec.gl), memo: `${row.name} · ${date}`, sourceId: row.id, idempotencyKey: `rc:${row.id}:${date}`, metadata: { recurringChargeId: row.id, auto: true } },
                ACCT,
              ),
              { at: stamp(date, "12:00", 1) },
            );
            postings.unshift({ id: e.id, entryId: e.id, date, amount: Number(row.amount), postedAt: date, auto: true });
          }, "rc");
        } else {
          charge(L, date, {
            amount: row.amount, glAccountId: GLN(spec.gl), memo: `${row.name} · ${shortDate(date)}`, key: `rc:${row.id}:${date}`, sourceId: row.id,
            metadata: { recurringChargeId: row.id }, time: "15:10",
            onPosted: (e) => postings.unshift({ id: e.id, entryId: e.id, date, amount: Number(row.amount), postedAt: date }),
          });
        }
      }
    }
    Object.assign(row, {
      tenant_id: cur.tenantId, tenant_name: cur.tenantName, unit_id: cur.unitId, unit: cur.unitDisplay, lease_id: cur.id, property_id: cur.propertyId,
      gl_account_id: GLN(spec.gl), account: labelOf(GLN(spec.gl)), category: spec.category, description: row.description ?? null,
      next_date: row.frequency === "One-time" ? cur.end || leaseRows.find((r) => r.id === cur.id)?.term_end || null : firstOf(lastPosted ? addMonths(lastPosted, step) : addMonths(NOW_YM, 1)),
      metadata: { ...(row.metadata || {}), leaseName: cur.name },
    });
  }

  // --- RUBS utility billing (Alder Court trash) ------------------------------------------------
  const alderLeases = [...LEASES.values()].filter((L) => L.propertyId === ALDER.id);
  const rubsRows = [];
  const RUBS = [
    { n: 1, svc: "2026-06", method: "sqft", status: "Posted" },
    { n: 2, svc: "2026-07", method: "equal", status: "Posted" },
    { n: 3, svc: "2026-07", method: "equal", status: "Void", duplicate: true },
    { n: 4, svc: "2026-08", method: "occupants", status: "Posted" },
    { n: 5, svc: "2026-09", method: "equal", status: "Posted" },
    { n: 6, svc: "2026-10", method: "sqft", status: "Draft" },
  ];
  const trashAmount = (ym) => round2(318 + (hash(`trash${ym}`) % 2) * 8.5);
  const trashBills = new Map(); // service month → bill id
  for (const spec of RUBS) {
    const svc = relYm(spec.svc);
    const chargeDate = firstOf(addMonths(svc, 1));
    const total = trashAmount(svc);
    const active = alderLeases.filter((L) => activeOn(L, chargeDate));
    const weight = (L) => (spec.method === "sqft" ? unitOf(L.unitId)?.sqft || 1 : 1);
    const totalW = active.reduce((s, L) => s + weight(L), 0);
    let assigned = 0;
    const shares = active.map((L, i) => {
      const amount = i === active.length - 1 ? round2(total - assigned) : round2((total * weight(L)) / totalW);
      assigned = round2(assigned + amount);
      return { leaseId: L.id, leaseName: L.name, tenantId: L.tenantId, tenantName: L.tenantName, unitId: L.unitId, unit: L.unitLabel, include: true, occupants: 2, override: amount, amount, entryId: "" };
    });
    const row = {
      id: sid(G.rubs, spec.n), name: `Alder Court trash · ${shortMonth(svc)}${spec.duplicate ? " (duplicate)" : ""}`,
      property_id: ALDER.id, property_name: ALDER.name, bill_id: null, gl_account_id: GL("utility_income"), utility: "Trash",
      period_start: firstOf(svc), period_end: lastOf(svc), charge_date: chargeDate, total_amount: total, method: spec.method,
      status: spec.status, metadata: { shares },
    };
    rubsRows.push(row);
    if (spec.status === "Draft" || chargeDate > TODAY) {
      row.status = "Draft";
      continue;
    }
    for (const s of shares) {
      charge(LEASES.get(s.leaseId), chargeDate, {
        amount: s.amount, glAccountId: GL("utility_income"), memo: `Trash · ${row.name}`, key: `rubs:${row.id}:${s.leaseId}`, sourceId: row.id, time: "15:30",
        onPosted: (e) => (s.entryId = e.id),
      });
    }
    if (spec.duplicate) {
      at(chargeDate, "19:00", () => {
        for (const s of shares) {
          voidEntry(s.entryId, { date: chargeDate, memo: `Void RUBS · ${row.name}`, at: stamp(chargeDate, "19:00") });
          s.entryId = "";
        }
        row.metadata.activityNotes = "Posted twice from the same Sound Waste invoice — voided the duplicate run the same afternoon.";
      });
    }
  }

  // --- Opening balances (conversion) -------------------------------------------------------
  const PIONEER = propRows.find((p) => p.name === "Pioneer Square Office Suites") || null;
  const COBALT = tenantByName("Cobalt Design Studio LLC") ? currentOf(tenantByName("Cobalt Design Studio LLC").id) : null;
  const OPENING_TRUST = [[MARLOWE, 18500], [PINECREST, 9000], [ALDER, 7500], [BIRCHWOOD, 3000], [CASCADE, 6000]];
  at(START, "07:00", () => {
    const jl = [];
    for (const d of openingDeposits) {
      jl.push({ glAccountId: GL("deposit_cash"), debit: d.amount, memo: d.memo, bankAccountId: BANK.deposit, ...dimsOf(d.L) });
      jl.push({ glAccountId: GL("security_deposits"), credit: d.amount, memo: d.memo, ...dimsOf(d.L) });
    }
    for (const [p, amount] of OPENING_TRUST) {
      const dims = { propertyId: p.id, ownerId: ownerId(p.id) };
      jl.push({ glAccountId: GL("trust_cash"), debit: amount, memo: `Owner funds in trust · ${p.name}`, bankAccountId: BANK.trust, ...dims });
      jl.push({ glAccountId: GL("owner_equity"), credit: amount, memo: `Owner funds in trust · ${p.name}`, ...dims });
    }
    const reserve = { propertyId: MARLOWE.id, ownerId: ownerId(MARLOWE.id) };
    jl.push({ glAccountId: GLN("1030"), debit: 118000, memo: "Replacement reserve · The Marlowe", bankAccountId: BANK.reserve, ...reserve });
    jl.push({ glAccountId: GL("owner_equity"), credit: 118000, memo: "Replacement reserve · The Marlowe", ...reserve });
    jl.push({ glAccountId: GL("operating_cash"), debit: 25000, memo: "Harbor & Pine operating balance", bankAccountId: BANK.operating });
    jl.push({ glAccountId: GL("owner_equity"), credit: 25000, memo: "Harbor & Pine operating balance" });
    commit(buildJournal({ date: START, memo: "Opening balances — books converted to Geiger", lines: jl, metadata: { conversion: true } }), {
      at: stamp(START, "07:00"), createdBy: ctx.createdBy,
    });
  });

  // --- Transactions ----------------------------------------------------------------------------
  const txnRows = [];
  let txnSeq = 0;
  const TXN = (fields) => {
    const row = {
      id: sid(G.txn, ++txnSeq), name: "", txn_date: null, txn_type: "Expense", account: "", gl_account_id: null,
      property_id: null, property_name: "", unit_id: null, amount: 0, payee: "", reference: "", status: "Cleared",
      tenant_id: null, lease_id: null, bill_id: null, vendor_id: null, owner_id: null, bank_account_id: BANK.trust,
      ledger_entry_id: null, metadata: {}, ...fields,
    };
    txnRows.push(row);
    return row;
  };
  // Post a Transactions row through buildCashTransaction (key txn:<id>) unless it's a draft.
  function postTxn(row, { time = "19:30", toBank, voidOn } = {}) {
    if (row.status === "Draft") return;
    at(row.txn_date, time, () => {
      const dir = row.txn_type === "Income" ? "in" : row.txn_type === "Expense" ? "out" : "transfer";
      const e = commit(
        buildCashTransaction(
          {
            direction: dir, amount: row.amount, date: row.txn_date, memo: row.name, glAccountId: row.gl_account_id,
            cashGlAccountId: BANK_GL[row.bank_account_id], bankAccountId: row.bank_account_id,
            toCashGlAccountId: toBank ? BANK_GL[toBank] : undefined, toBankAccountId: toBank,
            propertyId: row.property_id || undefined, unitId: row.unit_id || undefined, vendorId: row.vendor_id || undefined,
            leaseId: row.lease_id || undefined, tenantId: row.tenant_id || undefined,
            ownerId: row.owner_id || (row.property_id ? ownerId(row.property_id) : undefined), sourceId: row.id, idempotencyKey: `txn:${row.id}`,
          },
          ACCT,
        ),
        { at: stamp(row.txn_date, time), createdBy: ctx.createdBy },
      );
      row.ledger_entry_id = e.id;
      if (voidOn) at(voidOn, "18:00", () => voidEntry(e.id, { date: voidOn, memo: `Void: ${row.name}`, at: stamp(voidOn, "18:00") }));
    });
    if (row.txn_type !== "Income" && row.property_id && row.bank_account_id === BANK.trust) trustOutflows.push({ date: row.txn_date, propertyId: row.property_id, amount: row.amount });
  }
  const txnDefaults = (pid, gl) => ({ property_id: pid || null, property_name: pid ? propName(pid) : "", gl_account_id: gl, account: labelOf(gl), owner_id: pid ? ownerId(pid) : null });

  // Legacy rent roll: units still on pre-conversion leases (no lease row) until the first Geiger
  // lease on the unit started ("lease"), a unit turn's move-out (days from today) or a design date.
  const LEGACY = [
    ["A-101", 1450, "lease"], ["A-102", 1825, "lease"], ["A-201", 1875, "lease"], ["A-202", 2500, "lease"],
    ["A-301", 2575, "lease"], ["B-101", 1795, -60], ["N-102", 1950, "lease"], ["N-201", 1525, -40],
    ["S-102", 1975, "lease"], ["S-201", 1950, "2026-09-30"], ["TH-3", 3125, "lease"], ["L-201", 2050, -70], ["L-302", 2795, "lease"],
  ];
  const legacyUntil = (label, spec) => {
    if (typeof spec === "number") return ctx.daysFromNow(spec);
    if (spec !== "lease") return rel(spec);
    const u = unitByLabel(label);
    const first = [...LEASES.values()].filter((L) => L.unitId === u.id).sort((a, b) => a.start.localeCompare(b.start))[0];
    return first ? addDays(first.start, -1) : TODAY;
  };
  for (const ym of monthsFrom(START_YM)) {
    const byProp = new Map();
    for (const [label, rent, untilSpec] of LEGACY) {
      const u = unitByLabel(label);
      const until = legacyUntil(label, untilSpec);
      if (!u || firstOf(ym) > until) continue;
      const occupied = ymOf(until) === ym ? Number(until.slice(8)) : daysIn(ym);
      const amount = round2((rent * occupied) / daysIn(ym));
      if (!(amount > 0)) continue;
      byProp.set(u.propertyId, [...(byProp.get(u.propertyId) || []), { unit: label, amount }]);
    }
    for (const [pid, units] of byProp) {
      const date = dayIn(ym, 5);
      if (date > TODAY) continue;
      const amount = round2(units.reduce((s, x) => s + x.amount, 0));
      const row = TXN({
        name: `Legacy rent roll — ${propName(pid)} · ${shortMonth(ym)}`, txn_date: date, txn_type: "Income", amount, ...txnDefaults(pid, GL("rent_income")),
        payee: "Residents on pre-conversion leases", reference: `LEGACY-${ym}`,
        metadata: { memo: "Units still billed from the previous system until each resident moved out or signed a Geiger lease.", units },
      });
      postTxn(row, { time: "17:00" });
      legacyByPropMonth.set(`${pid}|${ym}`, round2((legacyByPropMonth.get(`${pid}|${ym}`) || 0) + amount));
    }
  }

  // Recurring property cash flows: [name, type, gl, property id, day, base amount, swing, payee, reference, bank, from ym]
  const MONTHLY_TXNS = [
    ["Common-area electric — The Marlowe", "Expense", GL("utilities"), MARLOWE.id, 8, 1120, 140, "Metro Power & Light", "ACCT-77120"],
    ["Water & sewer — Pinecrest Commons", "Expense", GL("utilities"), PINECREST.id, 12, 2210, 160, "Municipal Water Utility", "ACCT-40562"],
    ["Gas & heat — Cascade Lofts", "Expense", GL("utilities"), CASCADE.id, 15, 760, 220, "Northwest Gas Service", "ACCT-90311"],
    ["On-site staff payroll — The Marlowe", "Expense", GL("payroll"), MARLOWE.id, 25, 4200, 0, "Harbor & Pine Payroll", "PR"],
    ["Laundry room revenue — Pinecrest Commons", "Income", GL("other_income"), PINECREST.id, 20, 410, 40, "Pinecrest laundry room", "Collection"],
    ["Reserve account interest", "Income", GL("other_income"), MARLOWE.id, 28, 61, 4, "Puget Sound Savings", "INT", BANK.reserve],
    ...(PIONEER ? [["Common-area electric — Pioneer Square Office Suites", "Expense", GL("utilities"), PIONEER.id, 10, 380, 60, "Seattle City Light", "ACCT-61804", null, "2025-12"]] : []),
  ];
  for (const [name, type, gl, pid, day, base, swing, payee, reference, bank, fromYm] of MONTHLY_TXNS) {
    for (const ym of monthsFrom(fromYm ? relYm(fromYm) : START_YM)) {
      const date = dayIn(ym, day);
      if (date > TODAY) continue;
      postTxn(TXN({ name: `${name} · ${shortMonth(ym)}`, txn_date: date, txn_type: type, amount: round2(base + jitter(`${name}${ym}`, -swing, swing)), ...txnDefaults(pid, gl), payee, reference, bank_account_id: bank || BANK.trust }));
    }
  }

  // One-off and periodic property cash: [name, type, gl, property id, design date, amount, payee, reference, status, opts]
  const ONE_OFFS = [
    ["Q4 property insurance premium — The Marlowe", "Expense", GL("insurance"), MARLOWE.id, "2026-10-11", 6840, "Sound Mutual Insurance", "POL-55120"],
    ["Q3 property insurance premium — The Marlowe", "Expense", GL("insurance"), MARLOWE.id, "2026-07-11", 6840, "Sound Mutual Insurance", "POL-55120"],
    ["Q2 property insurance premium — The Marlowe", "Expense", GL("insurance"), MARLOWE.id, "2026-04-11", 6840, "Sound Mutual Insurance", "POL-55120"],
    ["Q1 property insurance premium — The Marlowe", "Expense", GL("insurance"), MARLOWE.id, "2026-01-11", 6650, "Sound Mutual Insurance", "POL-55120"],
    ["Liability insurance renewal — Pinecrest Commons", "Expense", GL("insurance"), PINECREST.id, "2026-09-06", 3125, "Sound Mutual Insurance", "POL-55087"],
    ["Property insurance renewal — Alder Court Townhomes", "Expense", GL("insurance"), ALDER.id, "2026-03-15", 7400, "Sound Mutual Insurance", "POL-55162"],
    ["Property insurance renewal — Cascade Lofts", "Expense", GL("insurance"), CASCADE.id, "2026-02-15", 5900, "Sound Mutual Insurance", "POL-55139"],
    ["Landlord policy renewal — 14 Birchwood Lane", "Expense", GL("insurance"), BIRCHWOOD.id, "2026-05-20", 2100, "Evergreen Home & Auto", "HO-88214"],
    ["Property taxes (full year) — Pinecrest Commons", "Expense", GL("property_taxes"), PINECREST.id, "2025-11-14", 15900, "Multnomah County Tax Collector", "R-332910"],
    ["First-half property taxes — The Marlowe", "Expense", GL("property_taxes"), MARLOWE.id, "2026-04-28", 12450, "King County Treasurer", "Parcel 0660-0012"],
    ["First-half property taxes — Alder Court Townhomes", "Expense", GL("property_taxes"), ALDER.id, "2026-04-28", 9620, "Pierce County Treasurer", "Parcel 7731-0088"],
    ["First-half property taxes — Cascade Lofts", "Expense", GL("property_taxes"), CASCADE.id, "2026-04-28", 5600, "King County Treasurer", "Parcel 0939-0441"],
    ["First-half property taxes — 14 Birchwood Lane", "Expense", GL("property_taxes"), BIRCHWOOD.id, "2026-04-28", 4870, "King County Treasurer", "Parcel 2925-0410"],
    ["Second-half property taxes — 14 Birchwood Lane", "Expense", GL("property_taxes"), BIRCHWOOD.id, "2026-10-17", 4870, "King County Treasurer", "Parcel 2925-0410", "Pending"],
    ["Second-half property taxes — Alder Court Townhomes", "Expense", GL("property_taxes"), ALDER.id, "2026-10-17", 9620, "Pierce County Treasurer", "Parcel 7731-0088", "Pending"],
    ["Second-half property taxes — The Marlowe", "Expense", GL("property_taxes"), MARLOWE.id, "2026-10-19", 12450, "King County Treasurer", "Parcel 0660-0012", "Pending"],
    ["Second-half property taxes — Cascade Lofts", "Expense", GL("property_taxes"), CASCADE.id, "2026-10-20", 5600, "King County Treasurer", "Parcel 0939-0441", "Draft", { memo: "Due Oct 31 — scheduled once the renovation draw clears." }],
    ["Elevator maintenance contract — The Marlowe", "Expense", GL("repairs_maintenance"), MARLOWE.id, "2026-10-20", 1450, "Vertical Lift Services", "Q4 contract", "Draft", { memo: "Awaiting signed renewal before posting." }],
    ["Elevator maintenance contract — The Marlowe · Q3", "Expense", GL("repairs_maintenance"), MARLOWE.id, "2026-07-03", 1450, "Vertical Lift Services", "Q3 contract"],
    ["Elevator maintenance contract — The Marlowe · Q2", "Expense", GL("repairs_maintenance"), MARLOWE.id, "2026-04-03", 1450, "Vertical Lift Services", "Q2 contract"],
    ["Elevator maintenance contract — The Marlowe · Q1", "Expense", GL("repairs_maintenance"), MARLOWE.id, "2026-01-05", 1395, "Vertical Lift Services", "Q1 contract"],
    ["Elevator maintenance contract — The Marlowe · Q4 2025", "Expense", GL("repairs_maintenance"), MARLOWE.id, "2025-10-03", 1395, "Vertical Lift Services", "Q4 2025 contract"],
    ["Water & sewer — Pinecrest Commons (duplicate)", "Expense", GL("utilities"), PINECREST.id, "2026-09-24", 2311.45, "Municipal Water Utility", "ACCT-40562", "Void", { memo: "Posted twice from the same statement — voided.", voidOn: "2026-09-25" }],
    ["Application fee — Zoe Nguyen", "Income", GL("application_fee_income"), MARLOWE.id, "2026-10-08", 50, "Zoe Nguyen", "APP-1182"],
    ["Application fee — Jamal Carter", "Income", GL("application_fee_income"), PINECREST.id, "2026-10-14", 50, "Jamal Carter", "APP-1188", "Pending"],
    ["Application fee — Ethan Walker", "Income", GL("application_fee_income"), PINECREST.id, "2026-08-27", 50, "Ethan Walker", "APP-1166"],
    ["Application fee — Liam O'Connor", "Income", GL("application_fee_income"), CASCADE.id, "2026-07-22", 50, "Liam O'Connor", "APP-1159"],
    ["Pet fee — Ethan Walker", "Income", GLN("4070"), PINECREST.id, "2026-09-10", 350, "Ethan Walker", "Move-in"],
    ["Reserve contribution — The Marlowe · Q1", "Transfer", GLN("1030"), MARLOWE.id, "2026-01-20", 2500, "Harbor & Pine Residential", "XFER", null, { toBank: BANK.reserve }],
    ["Reserve contribution — The Marlowe · Q2", "Transfer", GLN("1030"), MARLOWE.id, "2026-04-20", 2500, "Harbor & Pine Residential", "XFER", null, { toBank: BANK.reserve }],
    ["Reserve contribution — The Marlowe · Q3", "Transfer", GLN("1030"), MARLOWE.id, "2026-07-20", 2500, "Harbor & Pine Residential", "XFER", null, { toBank: BANK.reserve }],
    ["Reserve contribution — The Marlowe", "Transfer", GLN("1030"), MARLOWE.id, "2026-08-26", 2500, "Harbor & Pine Residential", "XFER", null, { toBank: BANK.reserve }],
    ...(PIONEER
      ? [
        ["Property insurance — Pioneer Square Office Suites", "Expense", GL("insurance"), PIONEER.id, "2026-01-15", 4200, "Sound Mutual Insurance", "POL-56011"],
        ["First-half property taxes — Pioneer Square Office Suites", "Expense", GL("property_taxes"), PIONEER.id, "2026-04-28", 6200, "King County Treasurer", "Parcel 5247-8000"],
        ["Second-half property taxes — Pioneer Square Office Suites", "Expense", GL("property_taxes"), PIONEER.id, "2026-10-19", 6200, "King County Treasurer", "Parcel 5247-8000", "Pending"],
      ]
      : []),
  ];
  for (const [name, type, gl, pid, design, amount, payee, reference, status, opts = {}] of ONE_OFFS) {
    const date = rel(design);
    if (date < START || date > TODAY) continue;
    const row = TXN({
      name, txn_date: date, txn_type: type, amount, ...txnDefaults(pid, gl), payee, reference, status: status || "Cleared",
      metadata: { ...(opts.toBank ? { toBankAccountId: opts.toBank } : {}), ...(opts.memo ? { memo: opts.memo } : {}) },
    });
    postTxn(row, { toBank: opts.toBank, voidOn: opts.voidOn ? rel(opts.voidOn) : undefined });
  }
  // Deposit amounts kept by the owner move from deposit trust to the owner's trust funds.
  function depositToOwnerTrust(L, date, amount, name) {
    postTxn(
      TXN({
        name, txn_date: date, txn_type: "Transfer", amount, ...txnDefaults(L.propertyId, GL("trust_cash")), unit_id: L.unitId, lease_id: L.id, tenant_id: L.tenantId,
        payee: ownerRow(ownerId(L.propertyId))?.name || "", reference: "XFER", bank_account_id: BANK.deposit,
        metadata: { toBankAccountId: BANK.trust, memo: "Deductions withheld from the deposit belong to the owner — moved out of deposit trust." },
      }),
      { toBank: BANK.trust, time: "18:40" },
    );
  }

  // --- Deposit dispositions (security_deposits rows) ----------------------------------------
  for (const dp of depositPlans) {
    const d = dp.record;
    if (!d || !["Returned", "Partially returned", "Forfeited"].includes(d.status)) continue;
    const L = dp.chain.find((x) => activeOn(x, d.returned_on || TODAY)) || dp.chain.at(-1);
    const on = d.returned_on || (d.metadata?.letterSentOn ?? TODAY);
    const refund = Number(d.refund_amount) || 0;
    const deductions = Array.isArray(d.metadata?.deductions) ? d.metadata.deductions : [];
    const charges = deductions.filter((x) => x.category !== "Unpaid rent" && Number(x.amount) > 0);
    const posted = [];
    charges.forEach((x, i) =>
      charge(L, addDays(on, -2), { amount: Number(x.amount), memo: x.label, incomeKey: "other_income", time: `18:0${i}`, onPosted: (e) => posted.push(e) }),
    );
    const applied = round2(Math.max(0, dp.amount - refund));
    if (d.status === "Forfeited") {
      // Waive any late fee the job assessed on the final month — the balance goes to collections.
      at(on, "18:20", () => {
        const fee = openFor(L.id).find((x) => x.sourceType === "late_fee");
        if (fee) commit(buildCredit({ ...dimsOf(L), date: on, amount: fee.open, memo: "Late fee waived — balance referred to collections", allocations: [{ entryId: fee.entryId, amount: fee.open }] }, ACCT), { at: stamp(on, "18:20"), createdBy: ctx.createdBy });
      });
    }
    at(on, "18:30", () => {
      const allocations = allocateOldestFirst(openFor(L.id), applied).allocations;
      commit(
        buildDepositReturn(
          { ...dimsOf(L), date: on, refundAmount: refund, appliedToCharges: applied, allocations, memo: d.status === "Forfeited" ? `Deposit applied to unpaid charges · ${L.name}` : "", cashGlAccountId: GL("deposit_cash"), bankAccountId: BANK.deposit, metadata: d.metadata?.checkNumber ? { checkNumber: d.metadata.checkNumber } : { reference: d.metadata?.refundMethod || "Deposit statement" } },
          ACCT,
        ),
        { at: stamp(on, "18:30"), createdBy: ctx.createdBy },
      );
    });
    if (applied > 0) depositToOwnerTrust(L, on, applied, `Deposit deductions to owner trust — ${L.unitLabel} (${L.tenantName})`);
  }

  // --- Bills, job costing, work orders ---------------------------------------------------------
  const billRows = ctx.rows("bills");
  const sandboxBills = new Map(billRows.map((b) => [b.id, b]));
  billRows.length = 0;
  let billSeq = 0;
  const jobs = [];
  const JOB = {};
  // [key, name, kind, property, unit label | null, unit turn n | null, budget, starts, ends, status, scope]
  const JOB_SPECS = [
    ["cascade", "Cascade Lofts lobby & façade renovation", "Capital project", CASCADE, null, null, 38000, "2026-05-15", "2026-11-30", "In progress", "Repoint the brick façade, new lobby lighting and finishes, post-construction clean."],
    ["th4", "TH-4 turn — garage + carpet", "Unit turn", ALDER, "TH-4", 2, 4500, "2026-08-27", "2026-10-14", "In progress", "Move-out clean, drywall and paint, upstairs carpet and a new garage door opener."],
    ["l401", "L-401 turn — loft renovation", "Unit turn", CASCADE, "L-401", 3, 9500, "2026-09-26", "2026-11-10", "In progress", "Demo, hardwood refinishing and new kitchen fixtures, sequenced with the lobby work."],
    ["b101", "B-101 turn", "Unit turn", MARLOWE, "B-101", 5, 1600, "2026-08-22", "2026-09-15", "Closed", "Paint touch-ups, deep clean, range igniter and re-key before Zoe Nguyen's move-in."],
    ["b201", "B-201 turn — studio refresh", "Unit turn", MARLOWE, "B-201", 1, 2200, "2026-10-03", "2026-10-23", "In progress", "Junk removal after the abandonment, carpet clean, paint and re-key."],
    ["n201", "N-201 turn", "Unit turn", PINECREST, "N-201", 4, 1800, "2026-09-11", "2026-10-08", "Closed", "Carpet clean and deep clean ahead of Jamal Carter's move-in."],
    ["s201", "S-201 water damage repair", "Repair project", PINECREST, "S-201", null, 3500, "2026-10-16", "2026-11-15", "In progress", "Emergency shut-off and extraction, then supply-line repair and ceiling drywall."],
    ["fence", "Alder Court perimeter fence replacement", "Capital project", ALDER, null, null, 6000, "2026-03-02", "2026-04-17", "Closed", "Replace 240 ft of failing cedar fence along the north and east lot lines."],
    ["elevator", "The Marlowe elevator modernisation study", "Other", MARLOWE, null, null, 4000, "2026-11-01", "2027-01-31", "Open", "Consultant survey and two bids ahead of the 2027 modernisation budget."],
  ];
  JOB_SPECS.forEach(([key, name, kind, p, unitLabel, turnN, budget, starts, ends, status, scope], i) => {
    const u = unitLabel ? unitByLabel(unitLabel) : null;
    jobs.push({
      id: sid(G.job, i + 1), name, kind, property_id: p.id, property_name: p.name, unit_id: u?.id || null, unit: u ? u.display : null,
      unit_turn_id: turnN ? sid(42, turnN) : null, budget, starts_on: rel(starts), ends_on: rel(ends), status, metadata: { scope },
    });
    JOB[key] = jobs.at(-1).id;
  });
  const jobForTurn = (turnId) => jobs.find((j) => j.unit_turn_id && j.unit_turn_id === turnId)?.id || null;

  // Work orders (maintenance area) by vendor invoice number, and their completion dates.
  const woMeta = (w) => (w?.metadata && typeof w.metadata === "object" ? w.metadata : {});
  const woByInvoice = new Map(woRows.filter((w) => live(w) && woMeta(w).vendorInvoiceNo).map((w) => [woMeta(w).vendorInvoiceNo, w]));
  const woDone = (w) => String(woMeta(w).completedDate || "").slice(0, 10);

  const v = (n) => ({ vendorId: vendorN(n).id, vendorName: vendorN(n).name });
  const noVendor = (name) => ({ vendorId: null, vendorName: name });
  // Bill specs: dates are design dates (re-anchored) unless `absolute`; a work order invoice
  // date wins over the spec's. payments: [[date, amount | null, method]].
  const BILLS = [];
  const bill = (spec) => BILLS.push(spec);

  bill({ id: sid(54, 1), name: "Lobby lighting retrofit — Cascade Lofts", ...v(2), p: CASCADE, gl: GL("capital_improvements"), billDate: "2026-09-16", due: "2026-10-16", amount: 4250, invoice: "BLE-20931", approval: "Approved", job: "cascade", payments: [["2026-09-30", 2000, "ACH"]], notes: "Deposit paid at start; balance due on final walkthrough sign-off." });
  bill({ id: sid(54, 2), name: "Dishwasher repair — N-102", ...v(4), p: PINECREST, unit: "N-102", gl: GL("repairs_maintenance"), billDate: "2026-09-19", due: "2026-10-14", amount: 285, invoice: "SAR-4418" });
  bill({ id: sid(54, 3), name: "Water heater replacement — B-102", ...v(1), p: MARLOWE, unit: "B-102", gl: GL("repairs_maintenance"), billDate: "2026-10-11", due: "2026-11-10", amount: 1860, invoice: "RPC-11872" });
  bill({ id: sid(54, 4), name: "Boiler tune-up — Cascade Lofts", ...v(3), p: CASCADE, gl: GL("repairs_maintenance"), billDate: "2026-10-15", due: "2026-11-14", amount: 1580, invoice: "EHS-7731" });
  bill({ id: sid(54, 5), name: "Post-demo construction clean — L-401", ...v(5), p: CASCADE, unit: "L-401", gl: GL("turnover"), billDate: "2026-10-17", due: "2026-11-16", amount: 465, invoice: "CVC-3302", job: "l401" });
  bill({ id: sid(54, 6), name: "October grounds maintenance — Pinecrest Commons", ...v(6), p: PINECREST, gl: GLN("5150"), billDate: "2026-10-19", due: "2026-11-18", amount: 950, invoice: "CLS-0910", status: "Draft" });
  bill({ id: sid(54, 7), name: "Quarterly HVAC service — Pinecrest Commons", ...v(3), p: PINECREST, gl: GL("repairs_maintenance"), billDate: "2026-09-12", due: "2026-10-12", amount: 1240, invoice: "EHS-7604", payments: [["2026-10-05", 1240, "ACH"]] });
  bill({ id: sid(54, 8), name: "Move-out deep clean — TH-4", ...v(5), p: ALDER, unit: "TH-4", gl: GL("turnover"), billDate: "2026-08-30", due: "2026-09-29", amount: 450, invoice: "CVC-3247", job: "th4", payments: [["2026-09-14", 450, "Card"]] });
  bill({ id: sid(54, 10), name: "EV charger inspection — The Marlowe", ...v(2), p: MARLOWE, gl: GL("repairs_maintenance"), billDate: "2026-08-15", due: "2026-09-14", amount: 375, invoice: "BLE-20714", payments: [["2026-09-09", 375, "ACH"]] });
  bill({ name: "Main line jetting — Pinecrest South", ...v(1), p: PINECREST, gl: GL("repairs_maintenance"), billDate: "2026-09-28", due: "2026-10-28", amount: 640, invoice: "RPC-11788", payments: [["2026-10-12", 640, "ACH"]] });
  bill({ id: sid(54, 11), name: "Main line jetting — Pinecrest South (duplicate)", ...v(1), p: PINECREST, gl: GL("repairs_maintenance"), billDate: "2026-09-28", due: "2026-10-28", amount: 640, invoice: "RPC-11790", woInvoice: "RPC-11788", status: "Void", voidOn: "2026-10-02", notes: "Duplicate of invoice RPC-11788 — voided at the vendor's request." });
  // Aged open payables for A/P aging.
  bill({ name: "Storm cleanup — Pinecrest Commons", ...v(6), p: PINECREST, gl: GLN("5150"), billDate: "2026-08-20", due: "2026-09-19", amount: 1150, invoice: "CLS-0871", notes: "Crew hours disputed — waiting on Cascade's timesheets before paying." });
  bill({ name: "Rooftop unit compressor repair — The Marlowe", ...v(3), p: MARLOWE, gl: GL("repairs_maintenance"), billDate: "2026-07-17", due: "2026-08-16", amount: 2860, invoice: "EHS-7488", approval: "Approved", notes: "Holding payment until the manufacturer's warranty credit posts." });
  bill({ name: "EV charger #3 repair — The Marlowe", ...v(2), p: MARLOWE, gl: GL("repairs_maintenance"), billDate: "2026-05-23", due: "2026-06-22", amount: 1180, invoice: "BLE-20402", payments: [["2026-06-30", 500, "Check"]], notes: "Charger 3 still faulting — balance withheld pending a second visit." });
  bill({ name: "October grounds maintenance — Alder Court", ...v(6), p: ALDER, gl: GLN("5150"), billDate: "2026-10-18", due: "2026-11-17", amount: 780, invoice: "CLS-0912" });
  // Vendor portal invoices and approvals.
  bill({ name: "Invoice RPC-11902 · Burst supply line — ceiling water damage", ...v(1), p: PINECREST, unit: "S-201", gl: GL("repairs_maintenance"), billDate: "2026-10-17", due: "2026-11-16", amount: 1020, invoice: "RPC-11902", approval: "Pending", job: "s201", source: "vendor_portal", description: "Replaced the failed braided supply line and dried out the ceiling cavity." });
  bill({ name: "Invoice SAR-4431 · Garbage disposal replacement — N-102", ...v(4), p: PINECREST, unit: "N-102", gl: GL("repairs_maintenance"), billDate: "2026-10-19", due: "2026-11-18", amount: 310, invoice: "SAR-4431", approval: "Pending", source: "vendor_portal", description: "Disposal seized — replaced with a 1/2 HP unit." });
  bill({ name: "Second service call fee — A-102 dishwasher", ...v(4), p: MARLOWE, unit: "A-102", gl: GL("repairs_maintenance"), billDate: "2026-10-06", due: "2026-11-05", amount: 165, invoice: "SAR-4424", woName: "warranty revisit", approval: "Rejected", approver: "Alex Rivera", notes: "Rejected — covered by the first visit's 30-day workmanship guarantee." });
  bill({ name: "Dishwasher not draining — A-102", ...v(4), p: MARLOWE, unit: "A-102", gl: GL("repairs_maintenance"), billDate: "2026-09-08", due: "2026-10-08", amount: 146, invoice: "SAR-4402", payments: [["2026-09-22", 146, "ACH"]] });
  bill({ name: "Refrigerator repair — 14 Birchwood Lane", ...v(4), p: BIRCHWOOD, unit: "Main house", gl: GL("repairs_maintenance"), billDate: "2026-09-30", due: "2026-10-30", amount: 415, invoice: "SAR-4409", payments: [["2026-10-09", 415, "ACH"]] });
  bill({ name: "HVAC filter change — Tower A", ...v(3), p: MARLOWE, gl: GL("repairs_maintenance"), billDate: "2026-09-29", due: "2026-10-29", amount: 380, invoice: "EHS-7712", payments: [["2026-10-09", 380, "ACH"]] });
  // Capital project + job-costed turns.
  bill({ name: "Scaffold rental — Cascade Lofts façade", ...noVendor("Puget Scaffold Co."), p: CASCADE, gl: GL("repairs_maintenance"), billDate: "2026-06-05", due: "2026-07-05", amount: 2150, invoice: "PSC-2291", job: "cascade", payments: [["2026-06-30", 2150, "ACH"]] });
  bill({ name: "Façade repointing — phase 1", ...noVendor("Ironside Masonry & Restoration"), p: CASCADE, gl: GL("repairs_maintenance"), billDate: "2026-06-20", due: "2026-07-20", amount: 12800, invoice: "IMR-1047", approval: "Approved", job: "cascade", payments: [["2026-07-15", 12800, "Wire"]] });
  bill({ name: "Façade repointing — phase 2", ...noVendor("Ironside Masonry & Restoration"), p: CASCADE, gl: GL("repairs_maintenance"), billDate: "2026-08-25", due: "2026-09-24", amount: 9600, invoice: "IMR-1063", approval: "Approved", job: "cascade", payments: [["2026-09-18", 9600, "Wire"]] });
  bill({ name: "Post-construction clean — Cascade lobby", ...v(5), p: CASCADE, gl: GL("repairs_maintenance"), billDate: "2026-09-28", due: "2026-10-28", amount: 680, invoice: "CVC-3291", job: "cascade", payments: [["2026-10-09", 680, "Card"]] });
  bill({ name: "Garage drywall patch & interior paint — TH-4", ...noVendor("Sound Painting & Drywall"), p: ALDER, unit: "TH-4", gl: GL("turnover"), billDate: "2026-09-03", due: "2026-10-03", amount: 1650, invoice: "SPD-418", job: "th4", payments: [["2026-09-24", 1650, "Check"]] });
  bill({ name: "Upstairs carpet replacement — TH-4", ...noVendor("Evergreen Flooring Co."), p: ALDER, unit: "TH-4", gl: GL("turnover"), billDate: "2026-09-21", due: "2026-10-21", amount: 1980, invoice: "EFC-7720", job: "th4", notes: "Install slipped a week on a supplier backorder — paying on completion." });
  bill({ name: "Replace garage door opener — TH-4", ...v(2), p: ALDER, unit: "TH-4", gl: GL("repairs_maintenance"), billDate: "2026-09-30", due: "2026-10-30", amount: 780, invoice: "BLE-20955", job: "th4", payments: [["2026-10-13", 780, "ACH"]] });
  bill({ name: "Demo & haul-away — L-401", ...noVendor("Cascade Demo & Haul"), p: CASCADE, unit: "L-401", gl: GL("turnover"), billDate: "2026-09-24", due: "2026-10-24", amount: 1200, invoice: "CDH-0318", job: "l401", payments: [["2026-10-06", 1200, "Check"]] });
  bill({ name: "Hardwood refinishing deposit — L-401", ...noVendor("Northwest Hardwood Floors"), p: CASCADE, unit: "L-401", gl: GL("turnover"), billDate: "2026-10-01", due: "2026-10-15", amount: 2400, invoice: "NWH-5512", job: "l401", payments: [["2026-10-02", 2400, "Check"]] });
  bill({ name: "Paint touch-ups — B-101", ...v(5), p: MARLOWE, unit: "B-101", gl: GL("turnover"), billDate: "2026-08-25", due: "2026-09-24", amount: 320, invoice: "CVC-3240", job: "b101", payments: [["2026-09-08", 320, "Card"]] });
  bill({ name: "Deep clean — B-101", ...v(5), p: MARLOWE, unit: "B-101", gl: GL("turnover"), billDate: "2026-08-27", due: "2026-09-26", amount: 340, invoice: "CVC-3244", job: "b101", payments: [["2026-09-08", 340, "Card"]] });
  bill({ name: "Range igniter replacement — B-101", ...v(4), p: MARLOWE, unit: "B-101", gl: GL("repairs_maintenance"), billDate: "2026-08-29", due: "2026-09-28", amount: 515, invoice: "SAR-4390", job: "b101", payments: [["2026-09-15", 515, "ACH"]] });
  bill({ name: "Re-key — B-101", ...v(5), p: MARLOWE, unit: "B-101", gl: GL("turnover"), billDate: "2026-09-02", due: "2026-10-02", amount: 120, invoice: "CVC-3252", job: "b101", payments: [["2026-09-15", 120, "Card"]] });
  bill({ name: "Emergency shut-off & extraction — S-201", ...v(1), p: PINECREST, unit: "S-201", gl: GL("repairs_maintenance"), billDate: ctx.daysFromNow(-4), due: ctx.daysFromNow(11), amount: 485, invoice: "RPC-11801", job: "s201", absolute: true, notes: "After-hours call-out the night the supply line burst." });
  bill({ name: "Perimeter fence replacement — Alder Court", ...noVendor("Tacoma Fence & Gate"), p: ALDER, gl: GL("capital_improvements"), billDate: "2026-04-17", due: "2026-05-17", amount: 5780, invoice: "TFG-2604", approval: "Approved", job: "fence", payments: [["2026-05-08", 5780, "Check"]] });
  bill({ name: "Tenant notice review — N-102", ...noVendor("Cascadia Tenant Law PLLC"), p: PINECREST, gl: GLN("5650"), billDate: "2026-10-07", due: "2026-10-21", amount: 450, invoice: "CTL-2026-311", payments: [["2026-10-14", 450, "ACH"]] });

  // Service contracts across the year (paid ~2–3 weeks after the bill date).
  for (const ym of monthsFrom(START_YM)) {
    const m = Number(ym.slice(5));
    const prevYm = addMonths(ym, -1);
    if (prevYm >= START_YM) {
      const billDate = dayIn(prevYm, 28);
      const pay = dayIn(ym, 12);
      const pm = Number(prevYm.slice(5));
      const summer = pm >= 4 && pm <= 9;
      const idx = monthsBetween(START_YM, prevYm);
      if (billDate <= TODAY) {
        bill({ name: `${longMonth(prevYm).split(" ")[0]} grounds maintenance — Pinecrest Commons`, ...v(6), p: PINECREST, gl: GLN("5150"), billDate, due: addDays(billDate, 30), amount: summer ? 950 : 640, invoice: `CLS-0${700 + idx * 2}`, payments: pay <= TODAY ? [[pay, null, pm % 2 ? "Check" : "ACH"]] : [], absolute: true });
        bill({ name: `${longMonth(prevYm).split(" ")[0]} grounds maintenance — Alder Court`, ...v(6), p: ALDER, gl: GLN("5150"), billDate, due: addDays(billDate, 30), amount: summer ? 780 : 520, invoice: `CLS-0${701 + idx * 2}`, payments: pay <= TODAY ? [[pay, null, "Check"]] : [], absolute: true });
        bill({ name: `Trash & recycling — Alder Court · ${shortMonth(prevYm)}`, ...noVendor("Sound Waste & Recycling"), p: ALDER, gl: GL("utilities"), billDate, due: addDays(billDate, 20), amount: trashAmount(prevYm), invoice: `SWR-${prevYm.replace("-", "")}`, payments: pay <= TODAY ? [[pay, null, "ACH"]] : [], absolute: true, trashYm: prevYm });
      }
    }
    const cleanDate = dayIn(ym, 2);
    if (cleanDate <= TODAY) {
      bill({ name: `Common-area cleaning — The Marlowe · ${shortMonth(ym)}`, ...v(5), p: MARLOWE, gl: GL("repairs_maintenance"), billDate: cleanDate, due: addDays(cleanDate, 30), amount: 640, invoice: `CVC-${3000 + monthsBetween(START_YM, ym) * 10}`, payments: dayIn(ym, 16) <= TODAY ? [[dayIn(ym, 16), null, "Card"]] : [], absolute: true });
      if (PIONEER && ym >= relYm("2026-01")) {
        bill({ name: `Janitorial — Pioneer Square Office Suites · ${shortMonth(ym)}`, ...v(5), p: PIONEER, gl: GL("repairs_maintenance"), billDate: cleanDate, due: addDays(cleanDate, 30), amount: 480, invoice: `CVC-${3005 + monthsBetween(START_YM, ym) * 10}`, payments: dayIn(ym, 16) <= TODAY ? [[dayIn(ym, 16), null, "Card"]] : [], absolute: true });
      }
    }
    if ([1, 4, 7, 10].includes(m) && dayIn(ym, 9) <= TODAY && ym !== NOW_YM) {
      bill({ name: `Quarterly HVAC service — The Marlowe · ${shortMonth(ym)}`, ...v(3), p: MARLOWE, gl: GL("repairs_maintenance"), billDate: dayIn(ym, 9), due: addDays(dayIn(ym, 9), 30), amount: 1180, invoice: `EHS-${7300 + m * 7}`, payments: [[dayIn(ym, 24), null, "ACH"]], absolute: true });
      if (PIONEER && ym >= relYm("2026-01")) {
        bill({ name: `Elevator service — Pioneer Square Office Suites · ${shortMonth(ym)}`, ...noVendor("Vertical Lift Services"), p: PIONEER, gl: GL("repairs_maintenance"), billDate: dayIn(ym, 9), due: addDays(dayIn(ym, 9), 30), amount: 900, invoice: `VLS-${4400 + m}`, payments: [[dayIn(ym, 24), null, "ACH"]], absolute: true });
      }
    }
  }

  // Completed vendor work orders with no invoice yet billed (the maintenance history).
  const PREFIX = { [vendorN(1).id]: "RPC", [vendorN(2).id]: "BLE", [vendorN(3).id]: "EHS", [vendorN(4).id]: "SAR", [vendorN(5).id]: "CVC", [vendorN(6).id]: "CLS" };
  const PAYS_BY = { [vendorN(5).id]: "Card", [vendorN(6).id]: "Check" };
  const linkedInvoices = new Set(BILLS.map((b) => b.woInvoice || b.invoice));
  for (const w of woRows) {
    const done = woDone(w);
    if (!live(w) || w.status !== "Completed" || !w.vendor_id || !PREFIX[w.vendor_id] || !(Number(w.total_cost) > 0) || !done || done < START) continue;
    if (woMeta(w).vendorInvoiceNo && linkedInvoices.has(woMeta(w).vendorInvoiceNo)) continue;
    const billDate = addDays(done, 1);
    if (billDate > TODAY || !w.property_id) continue;
    const vend = core.VENDORS.find((x) => x.id === w.vendor_id);
    const job = jobForTurn(w.unit_turn_id);
    bill({
      name: w.name, vendorId: vend.id, vendorName: vend.name, p: { id: w.property_id, name: propName(w.property_id) }, unitId: w.unit_id,
      gl: w.unit_turn_id ? GL("turnover") : w.vendor_id === vendorN(6).id ? GLN("5150") : GL("repairs_maintenance"),
      billDate, due: addDays(billDate, 30), amount: Number(w.total_cost), invoice: woMeta(w).vendorInvoiceNo || `${PREFIX[w.vendor_id]}-${9000 + (hash(w.id) % 900)}`,
      woId: w.id, jobId: job, payments: [[addDays(billDate, 14), null, PAYS_BY[w.vendor_id] || "ACH"]], absolute: true,
    });
  }

  // Bill specs → rows + ledger actions (bill:/billpay: keys like the Bills screen).
  let billPaySeq = 0;
  for (const spec of BILLS) {
    const D = (d) => (spec.absolute ? d : rel(d));
    const wo = spec.woId ? woRows.find((w) => w.id === spec.woId) : spec.woName ? woRows.find((w) => live(w) && w.name.includes(spec.woName)) : woByInvoice.get(spec.woInvoice || spec.invoice) || null;
    const billDate = wo && woMeta(wo).vendorInvoiceDate && !spec.absolute ? woMeta(wo).vendorInvoiceDate : D(spec.billDate);
    if (billDate > TODAY) continue;
    const due = maxDate(D(spec.due), billDate);
    const id = spec.id || sid(G.bill, ++billSeq);
    const unitId = spec.unitId || (spec.unit ? unitByLabel(spec.unit)?.id : null) || wo?.unit_id || null;
    const amount = Number(woMeta(wo).vendorInvoiceAmount) || spec.amount;
    const approval = spec.approval || (amount > BILL_APPROVAL_LIMIT ? "Approved" : "Not required");
    const status = spec.status || "Open";
    const jobId = spec.jobId || (spec.job ? JOB[spec.job] : null) || jobForTurn(wo?.unit_turn_id);
    const pays = (spec.payments || [])
      .map(([d, amt, method]) => ({ date: maxDate(D(d), addDays(billDate, 3)), amount: amt ?? amount, method }))
      .filter((p) => p.date <= TODAY)
      .map((p) => ({ id: sid(G.item, ++billPaySeq), ...p, bankAccountId: BANK.trust }));
    const paid = round2(pays.reduce((s, p) => s + p.amount, 0));
    const finalStatus = status === "Void" || status === "Draft" ? status : paid <= 0 ? "Open" : paid >= amount ? "Paid" : "Partially paid";
    const unit = unitId ? unitOf(unitId) : null;
    const row = {
      ...(spec.id ? sandboxBills.get(spec.id) || {} : {}), id, name: spec.name, vendor_id: spec.vendorId, vendor_name: spec.vendorName,
      property_id: spec.p.id, property_name: spec.p.name, property_label: spec.p.name, unit_id: unitId, bill_date: billDate, due_date: due,
      amount, amount_paid: paid, account: labelOf(spec.gl), gl_account_id: spec.gl, work_order_id: wo?.id || null, job_id: jobId,
      approval_status: approval, approver_name: approval === "Approved" || approval === "Rejected" ? spec.approver || "Alex Rivera" : null,
      approved_at: approval === "Approved" ? stamp(addDays(billDate, 1), "17:00") : null,
      status: finalStatus, category: ACCT.byId.get(spec.gl)?.name || null, reference: spec.invoice,
      paid_on: pays.at(-1)?.date || null, method: pays.at(-1)?.method || null, ledger_entry_id: null,
      metadata: {
        propertyId: spec.p.id, invoiceNumber: spec.invoice, payments: [],
        ...(unit ? { unit: unit.display } : {}),
        ...(jobId ? { jobName: jobs.find((j) => j.id === jobId)?.name } : {}),
        ...(wo ? { workOrderLabel: wo.name } : {}),
        ...(spec.notes ? { activityNotes: spec.notes } : {}),
        ...(spec.source === "vendor_portal"
          ? { source: "vendor_portal", description: spec.description, submittedAt: stamp(billDate, "20:00"), submittedBy: spec.vendorName, attachmentUrl: "", attachmentName: "" }
          : {}),
      },
      created_at: stamp(billDate, "16:00"),
    };
    billRows.push(row);
    if (spec.trashYm) trashBills.set(spec.trashYm, id);
    if (status === "Draft" || !(approval === "Not required" || approval === "Approved")) continue;
    at(billDate, "21:00", () => {
      const e = commit(
        buildBill(
          {
            date: billDate, amount, glAccountId: spec.gl, vendorId: spec.vendorId || undefined, propertyId: spec.p.id, ownerId: ownerId(spec.p.id),
            unitId: unitId || undefined, jobId: jobId || undefined, memo: `Bill: ${spec.name}${spec.vendorName ? ` · ${spec.vendorName}` : ""}`,
            sourceId: id, idempotencyKey: `bill:${id}`, metadata: { dueDate: due },
          },
          ACCT,
        ),
        { at: stamp(billDate, "21:00"), createdBy: ctx.createdBy },
      );
      row.ledger_entry_id = e.id;
    });
    if (status === "Void") {
      const vd = maxDate(D(spec.voidOn), billDate);
      at(vd, "17:30", () => voidEntry(row.ledger_entry_id, { date: vd, memo: `Void bill: ${spec.name}`, at: stamp(vd, "17:30") }));
      continue;
    }
    for (const p of pays) {
      trustOutflows.push({ date: p.date, propertyId: spec.p.id, amount: p.amount });
      at(p.date, "22:00", () => {
        const e = commit(
          buildBillPayment(
            {
              date: p.date, amount: p.amount, billEntryId: row.ledger_entry_id, vendorId: spec.vendorId || undefined, propertyId: spec.p.id, ownerId: ownerId(spec.p.id),
              bankAccountId: BANK.trust, cashGlAccountId: GL("trust_cash"), method: p.method, memo: `Payment: ${spec.name}`, sourceId: id, idempotencyKey: `billpay:${p.id}`,
              metadata: p.method === "Check" ? { checkNumber: String(5000 + (hash(p.id) % 900)) } : { method: p.method },
            },
            ACCT,
          ),
          { at: stamp(p.date, "22:00"), createdBy: ctx.createdBy },
        );
        p.ledgerEntryId = e.id;
        const txn = TXN({
          name: `Bill: ${spec.name}`, txn_type: "Expense", amount: p.amount, gl_account_id: spec.gl, account: labelOf(spec.gl), payee: spec.vendorName,
          vendor_id: spec.vendorId, bill_id: id, bank_account_id: BANK.trust, property_name: spec.p.name, property_id: spec.p.id, owner_id: ownerId(spec.p.id),
          unit_id: unitId, txn_date: p.date, reference: p.method, status: "Cleared", ledger_entry_id: e.id, metadata: { billId: id, paymentId: p.id },
        });
        p.transactionId = txn.id;
        row.metadata.payments.push(p);
      });
    }
  }
  for (const r of rubsRows) if (trashBills.get(r.period_start.slice(0, 7))) r.bill_id = trashBills.get(r.period_start.slice(0, 7));

  // --- Owner contributions + distributions (property_owners splits) ------------------------
  const trustBalance = (pid, oid) =>
    round2(lines.filter((l) => l.gl_account_id === GL("trust_cash") && l.property_id === pid && l.owner_id === oid).reduce((s, l) => s + l.debit - l.credit, 0));
  const CONTRIBUTIONS = [[CASCADE.id, "2026-06-10", 12000, "Renovation draw — façade phase 1 & scaffold", "Wire from Northwind Holdings"]];
  if (PIONEER && COBALT) CONTRIBUTIONS.push([PIONEER.id, "2025-11-20", 12000, "Working capital at management takeover", "Wire from Mercantile Street Partners"]);
  for (const [pid, design, amount, memo, reference] of CONTRIBUTIONS) {
    const date = rel(design);
    if (date < START) continue;
    at(date, "18:00", () =>
      commit(buildContribution({ propertyId: pid, ownerId: ownerId(pid), date, amount, memo: `Owner contribution · ${memo}`, cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust, metadata: { reference } }, ACCT), {
        at: stamp(date, "18:00"), createdBy: ctx.createdBy,
      }),
    );
  }
  const distributing = [...core.PROPERTIES.map((p) => p.id), ...(PIONEER && COBALT ? [PIONEER.id] : [])];
  for (const pid of distributing) {
    const pol = propertyPolicies(pid);
    const day = Number(pol.ownerDistributionDay) || 15;
    const floor = Number(pol.ownerReserve) || 0;
    for (const ym of monthsFrom(START_YM)) {
      const date = dayIn(ym, day);
      if (date > TODAY) continue;
      if (pid === CASCADE.id && ym >= relYm("2026-06") && ym <= relYm("2026-08")) continue; // held through the façade work
      if (pid === BIRCHWOOD.id && ym >= relYm("2026-09")) continue; // held while the owner finishes onboarding
      if (PIONEER && pid === PIONEER.id && ym < relYm("2026-02")) continue; // first quarter rebuilds working capital
      at(date, "20:30", () => {
        const holdings = holdingsOf(pid, date);
        const primary = holdings[0];
        if (!primary) return;
        // Keep the reserve + a $1,000 cushion, every known payment before next month's rent lands,
        // and the bigger items of the next 45 days net of ~80% of a month's receipts (plus the fee).
        const prevYm = addMonths(ym, -1);
        const received = round2(lines.filter((l) => l.gl_account_id === GL("trust_cash") && l.property_id === pid && l.debit > 0 && ymOf(l.entry_date) === prevYm && entryById.get(l.entry_id).source_type !== "contribution").reduce((s, l) => s + l.debit, 0));
        const out = (to) => trustOutflows.filter((o) => o.propertyId === pid && o.date > date && o.date <= to).reduce((s, o) => s + o.amount, 0);
        const fee = (received * (Number(pol.managementFeePct) || 0)) / 100;
        const need = Math.max(out(dayIn(addMonths(ym, 1), 5)), out(addDays(date, 45)) - 0.8 * received) + fee;
        const amount = Math.floor((trustBalance(pid, primary.ownerId) - floor - 1000 - need) / 100) * 100;
        if (amount < 500) return;
        const total = holdings.reduce((s, h) => s + h.pct, 0) || 100;
        let rest = amount;
        for (const h of holdings.slice(1)) {
          const share = Math.floor((amount * h.pct) / total / 100) * 100;
          if (share <= 0) continue;
          rest -= share;
          const owner = ownerRow(h.ownerId);
          // Co-owner's share moves to their position in trust, then pays out.
          commit(
            buildJournal({
              date, memo: `Owner share allocation · ${owner?.name || "Co-owner"} (${h.pct}%) · ${shortMonth(ym)}`,
              lines: [
                { glAccountId: GL("trust_cash"), debit: share, propertyId: pid, ownerId: h.ownerId, bankAccountId: BANK.trust },
                { glAccountId: GL("trust_cash"), credit: share, propertyId: pid, ownerId: primary.ownerId, bankAccountId: BANK.trust },
              ],
            }),
            { at: stamp(date, "20:25"), createdBy: ctx.createdBy },
          );
          commit(
            buildDistribution({ propertyId: pid, ownerId: h.ownerId, date, amount: share, memo: `Owner distribution · ${owner?.name || ""} · ${shortMonth(ym)}`, cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust, metadata: { reference: owner?.payout_method || "ACH" } }, ACCT),
            { at: stamp(date, "20:30"), createdBy: ctx.createdBy },
          );
        }
        const owner = ownerRow(primary.ownerId);
        commit(
          buildDistribution({ propertyId: pid, ownerId: primary.ownerId, date, amount: rest, memo: `Owner distribution · ${owner?.name || ""} · ${shortMonth(ym)}`, cashGlAccountId: GL("trust_cash"), bankAccountId: BANK.trust, metadata: { reference: owner?.payout_method || "ACH" } }, ACCT),
          { at: stamp(date, "20:31"), createdBy: ctx.createdBy },
        );
      });
    }
  }

  // Journal correction + Ravi's interest-bearing deposit (annual payout at the lease anniversary).
  at(rel("2026-02-03"), "18:00", () =>
    commit(
      buildJournal({
        date: rel("2026-02-03"), memo: "Reclass: Cascade Lofts lobby fixtures expensed to repairs → capital improvements",
        lines: [
          { glAccountId: GL("capital_improvements"), debit: 860, propertyId: CASCADE.id, ownerId: ownerId(CASCADE.id) },
          { glAccountId: GL("repairs_maintenance"), credit: 860, propertyId: CASCADE.id, ownerId: ownerId(CASCADE.id) },
        ],
      }),
      { at: stamp(rel("2026-02-03"), "18:00"), createdBy: ctx.createdBy },
    ),
  );
  const raviDeposit = RAVI && depositRows.find((d) => live(d) && d.lease_id === RAVI.id && d.metadata?.interestBearing);
  const INTEREST = RAVI ? { lease: RAVI, rate: Number(raviDeposit?.metadata?.interestRateOverride) || 1.5, through: relYm("2026-06") } : null;
  if (INTEREST) {
    // Interest is paid at the June anniversary — credited against that month's rent before autopay runs.
    const anniversary = firstOf(relYm("2026-06"));
    at(anniversary, "15:30", () => {
      const payable = round2(lines.filter((l) => l.gl_account_id === GL("deposit_interest_payable") && l.lease_id === RAVI.id).reduce((s, l) => s + l.credit - l.debit, 0));
      const rent = openFor(RAVI.id).find((i) => i.sourceType === "charge");
      if (!(payable > 0) || !rent) return;
      commit(
        buildJournal({
          date: anniversary, memo: "Annual deposit interest credited to rent (lease anniversary)",
          lines: [
            { glAccountId: GL("deposit_interest_payable"), debit: payable, ...dimsOf(RAVI) },
            { glAccountId: GL("accounts_receivable"), credit: payable, appliesToEntryId: rent.entryId, ...dimsOf(RAVI) },
          ],
        }),
        { at: stamp(anniversary, "15:30"), createdBy: ctx.createdBy },
      );
    });
  }

  // --- CAM reconciliations -----------------------------------------------------------------
  const camRows = [];
  const camTrueUps = [];
  const CAM_2025 = sid(G.cam, 1);
  const camEstimateMonths = (L, year) => lines.filter((l) => l.gl_account_id === GL("cam_income") && l.lease_id === L.id && l.entry_date.startsWith(String(year)) && !camTrueUps.includes(l.entry_id)).length;
  {
    const yr = Number(START_YM.slice(0, 4));
    const postOn = `${yr + 1}-01-15`;
    const histMonths = 13 - Number(START_YM.slice(5));
    camRows.push({
      id: CAM_2025, name: `Alder Court Townhomes CAM ${yr}`, property_id: ALDER.id, property_name: ALDER.name, year: yr,
      budget_amount: 1700, actual_amount: 0, gl_account_id: GL("cam_income"), status: "Billed",
      metadata: { poolAccountIds: [GLN("5150")], shares: [], activityNotes: "Short year — books converted in October. Each townhome carries a quarter of the pool for its months on a Geiger lease." },
    });
    at(postOn, "18:00", () => {
      const pool = GLN("5150");
      const actual = round2(lines.filter((l) => l.gl_account_id === pool && l.property_id === ALDER.id && l.entry_date.startsWith(String(yr))).reduce((s, l) => s + l.debit - l.credit, 0));
      const cam = camRows.find((r) => r.id === CAM_2025);
      cam.actual_amount = actual;
      for (const L of alderLeases.filter((x) => x.start <= `${yr}-12-31` && activeOn(x, postOn))) {
        const months = camEstimateMonths(L, yr);
        if (!months) continue;
        const billed = round2(lines.filter((l) => l.gl_account_id === GL("cam_income") && l.lease_id === L.id && l.entry_date.startsWith(String(yr))).reduce((t, l) => t + l.credit - l.debit, 0));
        const pct = round2((25 * months) / histMonths);
        const trueUp = round2((actual * pct) / 100 - billed);
        const share = { leaseId: L.id, tenantName: L.tenantName, unit: L.unitLabel, include: true, sharePct: pct, estimate: billed, pct, trueUp, entryId: "" };
        cam.metadata.shares.push(share);
        if (trueUp < 0.01) continue;
        const e = commit(
          buildCharge({ ...dimsOf(L), date: postOn, amount: trueUp, glAccountId: GL("cam_income"), memo: `CAM true-up ${yr}`, sourceId: CAM_2025, idempotencyKey: `cam:${CAM_2025}:${L.id}` }, ACCT),
          { at: stamp(postOn, "18:00"), createdBy: ctx.createdBy },
        );
        share.entryId = e.id;
        camTrueUps.push(e.id);
      }
    });
  }

  // --- Jobs: late fees, management fees, deposit interest ------------------------------------
  function lateFeeRun(date) {
    for (const L of LEASES.values()) {
      if (!activeOn(L, date)) continue;
      const pol = policiesAt(L, date);
      const due = dayIn(ymOf(date), Number(pol.rentDueDay) || 1);
      const daysLate = diffDays(due, date);
      if (daysLate <= 0) continue;
      const key = `late:${L.id}:${ymOf(due)}`;
      if (keys.has(key)) continue;
      const overdue = openFor(L.id).filter((i) => i.sourceType === "charge" && i.date <= due);
      const fee = overdue.length ? computeLateFee(pol, L.rent, daysLate) : 0;
      if (fee <= 0) continue;
      commit(
        buildCharge({ sourceType: "late_fee", date, amount: fee, ...dimsOf(L), memo: `Late fee · ${ymOf(due)} rent`, sourceId: L.id, idempotencyKey: key, metadata: { auto: true, daysLate } }, ACCT),
        { at: stamp(date, "12:00", 20) },
      );
    }
  }
  // Collected cash per property for a month (payment entries' cash lines) + legacy receipts.
  function collectedFor(ym) {
    const out = new Map();
    const ids = new Set(entries.filter((e) => e.source_type === "payment" && ymOf(e.entry_date) === ym).map((e) => e.id));
    for (const l of lines) {
      if (!ids.has(l.entry_id) || !l.property_id || ACCT.byId.get(l.gl_account_id)?.subtype !== "cash") continue;
      out.set(l.property_id, round2((out.get(l.property_id) || 0) + l.debit - l.credit));
    }
    for (const [k, amount] of legacyByPropMonth) {
      const [pid, m] = k.split("|");
      if (m === ym) out.set(pid, round2((out.get(pid) || 0) + amount));
    }
    return out;
  }
  function managementFeeRun(period, atStamp) {
    for (const [propertyId, amount] of collectedFor(period)) {
      const pol = propertyPolicies(propertyId);
      const pct = Number(pol.managementFeePct) || 0;
      const fee = amount > 0 ? round2(Math.max((amount * pct) / 100, Number(pol.managementFeeMin) || 0)) : 0;
      const idem = `mgmt:${propertyId}:${period}`;
      if (fee <= 0 || keys.has(idem)) continue;
      commit(
        buildManagementFee(
          { date: lastOf(period), amount: fee, propertyId, ownerId: ownerId(propertyId), memo: `Management fee · ${period} · ${propName(propertyId)}`, sourceId: propertyId, idempotencyKey: idem, metadata: { auto: true, collected: round2(amount), pct } },
          ACCT,
        ),
        { at: atStamp },
      );
    }
  }
  function depositInterestRun(period, atStamp) {
    if (!INTEREST || period > INTEREST.through) return;
    const L = INTEREST.lease;
    const held = round2(lines.filter((l) => l.gl_account_id === GL("security_deposits") && l.lease_id === L.id && l.entry_date <= lastOf(period)).reduce((s, l) => s + l.credit - l.debit, 0));
    const interest = round2((held * INTEREST.rate) / 100 / 12);
    if (held <= 0 || interest <= 0) return;
    commit(
      buildDepositInterest(
        { date: lastOf(period), amount: interest, leaseId: L.id, tenantId: L.tenantId, unitId: L.unitId, propertyId: L.propertyId, memo: `Deposit interest · ${period}`, sourceId: L.id, idempotencyKey: `depint:${L.id}:${period}`, metadata: { auto: true, balance: held, rate: INTEREST.rate } },
        ACCT,
      ),
      { at: atStamp },
    );
  }

  // --- Run the simulation day by day ------------------------------------------------------
  // Staff/tenant actions before 12:00 UTC, then the run-due jobs in registry order (recurring
  // charges → late fees → management fees → deposit interest → autopay), then the rest of the day.
  // Actions queued while running (ACH settlements) land on later days and are picked up then.
  const byTime = (x, y) => x.time.localeCompare(y.time) || x.seq - y.seq;
  const runAll = (list) => list.sort(byTime).forEach((x) => x.fn());
  for (let d = START; d <= TODAY; d = addDays(d, 1)) {
    const take = (pred) => {
      const out = [];
      for (let i = actions.length - 1; i >= 0; i -= 1) if (actions[i].date === d && pred(actions[i])) out.push(actions.splice(i, 1)[0]);
      return out;
    };
    runAll(take((x) => !x.kind && x.time < "12:00"));
    runAll(take((x) => x.kind === "rc"));
    lateFeeRun(d);
    if (d.endsWith("-01")) {
      const period = addMonths(ymOf(d), -1);
      if (period >= START_YM) {
        managementFeeRun(period, stamp(d, "12:00", 40));
        depositInterestRun(period, stamp(d, "12:00", 50));
      }
    }
    runAll(take((x) => x.kind === "autopay"));
    for (let guard = 0; guard < 5; guard += 1) {
      const rest = take(() => true);
      if (!rest.length) break;
      runAll(rest);
    }
  }
  const stray = actions.filter((a) => a.date >= START);
  if (stray.length) throw new Error(`accounting: ${stray.length} actions never ran (first on ${stray[0].date})`);
  // This month's management fees, booked ahead under the job's keys so the next run dedupes.
  managementFeeRun(NOW_YM, stamp(TODAY, "12:00", 45));

  return finish();

  // --- Derived tables --------------------------------------------------------------------------
  function finish() {
    const recById = new Map();
    const recRows = [];
    let recSeq = 0;
    const isCheck = (l) => {
      const e = entryById.get(l.entry_id);
      return /Check/.test(e.memo || "") || e.metadata?.checkNumber || /Check/.test(e.metadata?.reference || "");
    };
    const glLines = (gl) => lines.filter((l) => l.gl_account_id === gl).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
    // Finalized statements stamp cleared lines; checks written in the last week stay outstanding.
    function finalize(bankId, statementDate) {
      const gl = BANK_GL[bankId];
      const prior = recRows.filter((r) => r.bank_account_id === bankId && r.status === "Finalized").at(-1);
      const cands = glLines(gl).filter((l) => !l.reconciliation_id && l.entry_date <= statementDate);
      const cleared = cands.filter((l) => !(l.credit > 0 && isCheck(l) && diffDays(l.entry_date, statementDate) < 6));
      const id = sid(G.recon, ++recSeq);
      const bal = round2((prior ? prior.statement_balance : 0) + cleared.reduce((s, l) => s + l.debit - l.credit, 0));
      for (const l of cleared) Object.assign(l, { cleared: true, cleared_on: statementDate, reconciliation_id: id });
      const row = {
        id, name: `${banks.find((b) => b.id === bankId).name} · ${shortDate(statementDate)}`, bank_account_id: bankId, gl_account_id: gl, statement_date: statementDate,
        statement_balance: bal, cleared_balance: bal, difference: 0, status: "Finalized", finalized_at: stamp(addDays(statementDate, 4), "18:00"),
        metadata: { clearedLineIds: cleared.map((l) => l.id) }, created_at: stamp(addDays(statementDate, 3), "17:00"),
      };
      recRows.push(row);
      recById.set(id, row);
      return row;
    }
    const lastMonthEnd = lastOf(addMonths(NOW_YM, -1));
    const twoMonthsEnd = lastOf(addMonths(NOW_YM, -2));
    finalize(BANK.trust, twoMonthsEnd);
    finalize(BANK.trust, lastMonthEnd);
    const undone = {
      id: sid(G.recon, ++recSeq), name: `${bankAt(1).name} · ${shortDate(twoMonthsEnd)}`, bank_account_id: BANK.operating, gl_account_id: GL("operating_cash"),
      statement_date: twoMonthsEnd, statement_balance: 0, cleared_balance: 0, difference: 0, status: "Undone", finalized_at: stamp(addDays(twoMonthsEnd, 3), "18:00"),
      metadata: { clearedLineIds: [], activityNotes: "Undone — the ending balance was keyed from the wrong statement. Re-done with the next month." },
      created_at: stamp(addDays(twoMonthsEnd, 2), "17:00"),
    };
    undone.cleared_balance = round2(glLines(GL("operating_cash")).filter((l) => l.entry_date <= twoMonthsEnd).reduce((s, l) => s + l.debit - l.credit, 0));
    undone.statement_balance = round2(undone.cleared_balance + 1000);
    recRows.push(undone);
    finalize(BANK.operating, lastMonthEnd);
    finalize(BANK.deposit, lastMonthEnd);
    finalize(BANK.reserve, lastMonthEnd);
    // Mid-month draft on the trust account: most lines picked, a $25 wire fee not booked yet.
    {
      const draftDate = dayIn(NOW_YM, 15) <= TODAY ? dayIn(NOW_YM, 15) : YESTERDAY;
      const prior = recRows.filter((r) => r.bank_account_id === BANK.trust && r.status === "Finalized").at(-1);
      const picked = glLines(GL("trust_cash")).filter((l) => !l.reconciliation_id && l.entry_date <= draftDate && !(l.credit > 0 && isCheck(l) && diffDays(l.entry_date, draftDate) < 5));
      const clearedBal = round2(prior.statement_balance + picked.reduce((s, l) => s + l.debit - l.credit, 0));
      recRows.push({
        id: sid(G.recon, ++recSeq), name: `${bankAt(2).name} · ${shortDate(draftDate)}`, bank_account_id: BANK.trust, gl_account_id: GL("trust_cash"),
        statement_date: draftDate, statement_balance: round2(clearedBal - 25), cleared_balance: clearedBal, difference: -25, status: "Draft", finalized_at: null,
        metadata: { clearedLineIds: picked.map((l) => l.id), activityNotes: "Mid-month check — the $25 wire fee on the statement isn't booked yet." },
        created_at: stamp(addDays(draftDate, 2), "17:00"),
      });
    }

    // Bank accounts: GL links, bank-side balance (book + outstanding checks), last statement.
    const book = (gl, asOf) => round2(lines.filter((l) => l.gl_account_id === gl && l.entry_date <= asOf).reduce((s, l) => s + l.debit - l.credit, 0));
    const outstanding = (gl) => round2(lines.filter((l) => l.gl_account_id === gl && !l.cleared && l.credit > 0 && isCheck(l) && l.entry_date <= YESTERDAY && diffDays(l.entry_date, YESTERDAY) < 7).reduce((s, l) => s + l.credit, 0));
    for (const [bankId, gl] of Object.entries(BANK_GL)) {
      const b = banks.find((x) => x.id === bankId);
      const last = recRows.filter((r) => r.bank_account_id === bankId && r.status === "Finalized").at(-1);
      Object.assign(b, {
        gl_account_id: gl, balance: round2(book(gl, YESTERDAY) + outstanding(gl) - (bankId === BANK.trust ? 25 : 0)), is_operating: bankId === BANK.operating,
        bank: b.bank_name, apy: bankId === BANK.reserve ? 0.6 : bankId === BANK.deposit ? 0.25 : 0,
        metadata: { ...(b.metadata || {}), account: labelOf(gl), balanceAsOf: YESTERDAY, lastReconciled: last?.statement_date || null, statementBalance: last?.statement_balance ?? null },
      });
    }
    bankAt(3).metadata.activityNotes = "Includes Ravi Patel's interest-bearing deposit — interest is credited to his rent at each lease anniversary.";
    Object.assign(bankAt(5), { property_id: BIRCHWOOD.id, property_label: BIRCHWOOD.name, gl_account_id: null, metadata: { ...(bankAt(5).metadata || {}), propertyName: BIRCHWOOD.name } });
    Object.assign(bankAt(6), { property_id: CASCADE.id, property_label: CASCADE.name, gl_account_id: null, metadata: { ...(bankAt(6).metadata || {}), propertyName: CASCADE.name } });

    // Tenant payments as Income transactions (linked to their ledger entries, not re-posted),
    // so "payment received" reads on the Transactions list and its automations.
    for (const e of entries) {
      if (e.source_type !== "payment" || e.reversal_of || !e.lease_id) continue;
      const L = LEASES.get(e.lease_id);
      const cash = linesByEntry.get(e.id).find((l) => ACCT.byId.get(l.gl_account_id)?.subtype === "cash");
      TXN({
        name: `Payment — ${L.tenantName} · ${L.unitLabel}`, txn_date: e.entry_date, txn_type: "Income", amount: Number(e.total),
        ...txnDefaults(L.propertyId, GL("accounts_receivable")), unit_id: L.unitId, lease_id: L.id, tenant_id: L.tenantId,
        payee: L.tenantName, reference: e.metadata?.reference || (e.metadata?.onlinePaymentId ? "Online" : (e.memo || "").replace("Payment · ", "")),
        bank_account_id: cash?.bank_account_id || BANK.trust, status: e.status === "void" ? "Void" : "Cleared", ledger_entry_id: e.id,
        metadata: { memo: e.memo, ...(e.metadata?.onlinePaymentId ? { onlinePaymentId: e.metadata.onlinePaymentId } : {}) },
      });
    }
    // Transaction status from the bank side of each posted entry.
    const draftIds = new Set(recRows.filter((r) => r.status === "Draft").flatMap((r) => r.metadata.clearedLineIds));
    for (const t of txnRows) {
      if (["Draft", "Void"].includes(t.status)) continue;
      const cash = (linesByEntry.get(t.ledger_entry_id) || []).find((l) => ACCT.byId.get(l.gl_account_id)?.subtype === "cash" && (!t.bank_account_id || l.bank_account_id === t.bank_account_id || l.bank_account_id == null));
      if (!cash) continue;
      if (cash.reconciliation_id && recById.get(cash.reconciliation_id)?.status === "Finalized") t.status = "Reconciled";
      else if (t.status !== "Pending" && (draftIds.has(cash.id) || diffDays(t.txn_date, TODAY) > 3)) t.status = "Cleared";
      else t.status = "Pending";
    }
    txnRows.sort((a, b) => b.txn_date.localeCompare(a.txn_date) || a.name.localeCompare(b.name));
    for (const t of txnRows) t.created_at = stamp(t.txn_date, "20:00");

    // Recurring charges: postings (newest first) and the scheduler switch.
    for (const row of rcRows) {
      if (!rcPostings.has(row.id)) continue;
      const auto = rcAuto.get(row.id);
      row.metadata = { ...(row.metadata || {}), postings: rcPostings.get(row.id), ...(auto ? { autoPost: true } : row.status === "Active" ? { autoPost: false } : {}) };
    }

    // Rent accounts mirror the ledger's AR postings into metadata charges/payments (the Tenants list
    // and Property Overview read those lists); balance = billed − collected = the AR balance.
    const NOTES = {
      6: "July check came back NSF — replaced by money order; he disputes the July late fee (bank error). October paid short; repayment plan signed Oct 9 — late fees suspended while it's honoured.",
      8: "Lease in eviction — online payments are blocked, certified funds only. Card declined Oct 3; promised a money order by the 20th. Late fees on hold since Oct 2.",
      15: "Paid $575 short in October. Arrangement agreed Oct 10: $325 on the 24th and the rest on the 31st — late fees paused.",
      4: "Moving out Nov 19 — final (prorated) month prepaid by check on Oct 15.",
      12: "$75 courtesy credit for the Oct furnace outage — applies to November.",
      14: "Autopay paused after an NSF return in August and a frozen account in September. Paying by portal ACH meanwhile.",
      18: "Moved out Aug 26. Deposit disposition sent Sep 10 — account closed at zero.",
    };
    const noteFor = (tenantId) => {
      const n = core.TENANTS.findIndex((t) => t.id === tenantId) + 1;
      return NOTES[n] || null;
    };
    for (const [tenantId, acct] of accountOf) {
      const chainIds = new Set([...LEASES.values()].filter((L) => L.tenantId === tenantId).map((L) => L.id));
      const perEntry = new Map();
      for (const l of lines) {
        if (!chainIds.has(l.lease_id) || ACCT.byId.get(l.gl_account_id)?.subtype !== "receivable") continue;
        perEntry.set(l.entry_id, round2((perEntry.get(l.entry_id) || 0) + l.debit - l.credit));
      }
      const charges = [];
      const pays = [];
      for (const [entryId, net] of perEntry) {
        if (!net) continue;
        const e = entryById.get(entryId);
        const item = { id: entryId, label: e.memo || "Entry", date: e.entry_date, entryId };
        if (["payment", "credit", "deposit_return"].includes(e.source_type) || (e.source_type === "adjustment" && net < 0)) {
          pays.push({ ...item, amount: -net, method: (e.memo || "").replace(/^(Online payment|Payment) · /, "") || e.source_type });
        } else {
          charges.push({ ...item, amount: net, ...(e.metadata?.recurringChargeId ? { source: "recurring", recurringChargeId: e.metadata.recurringChargeId } : {}) });
        }
      }
      charges.sort((a, b) => a.date.localeCompare(b.date));
      pays.sort((a, b) => a.date.localeCompare(b.date));
      const balance = round2((arByTenant.get(tenantId) || []).filter((l) => chainIds.has(l.leaseId)).reduce((s, l) => s + l.debit - l.credit, 0));
      const cur = currentOf(tenantId);
      const [channel, , label] = profileOf(cur);
      const items = openFor(cur.id);
      const paidThisMonth = pays.some((p) => p.date.startsWith(NOW_YM));
      const oldest = items[0] ? diffDays(items[0].date, TODAY) : 0;
      const m = { ...(acct.metadata || {}) };
      for (const k of ["lateFeeType", "lateFeeAmount", "graceDays"]) delete m[k];
      const kira = cur.tenantName === "Kira Matsuda";
      acct.metadata = {
        ...m, charges, payments: pays, autoPostRent: false, paymentReference: label,
        ...(noteFor(tenantId) ? { activityNotes: noteFor(tenantId) } : {}),
        ...(kira ? { activityNotes: "Abandoned B-201 with September unpaid. Deposit applied Oct 8 and the late fee waived; the rest went to Cascade Recovery Services on Oct 9." } : {}),
      };
      acct.status = kira && balance > 0 ? "In collections" : balance > 0.004 ? (oldest > 30 || !paidThisMonth ? "Overdue" : "Partial") : "Current";
      acct.autopay = plans.get(tenantId)?.status === "active";
      acct.payment_method = channel === "check" ? "Check" : channel === "card" ? "Card" : channel === "wire" ? "Wire" : "ACH";
    }
    const extraAccount = (L, fields) => {
      if (!L) return;
      const p = propRow(L.propertyId) || {};
      rentRows.push({
        // Not billing yet: rent stays 0 until move-in so list-based balances (Tenants, Overview) read 0.
        id: sid(G.rent, ++rentSeq), name: `${L.unitDisplay} — ${L.tenantName}`, unit: L.unitDisplay, tenant_name: L.tenantName, rent: 0,
        unit_id: L.unitId, tenant_id: L.tenantId, property_id: L.propertyId, lease_id: L.id, due_day: 1, frequency: "Monthly", autopay: false, payment_method: "ACH",
        metadata: { autoPostRent: false, propertyName: p.name, address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "), ...fields.metadata },
        status: fields.status, ...(fields.payment_method ? { payment_method: fields.payment_method } : {}),
      });
    };
    extraAccount(ZOE, { status: "Due", payment_method: "Card", metadata: { activityNotes: `Moves in Nov 3. Deposit received; the prorated first month (rent ${ZOE?.rent}) is due at move-in.` } });
    extraAccount(JAMAL, { status: "Draft", metadata: { activityNotes: `Conditional approval — account set up ahead of the Nov 10 move-in (rent ${JAMAL?.rent}).` } });

    // Online payments + autopay plans.
    payments.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const planRows = [...plans.values()].map((p) => ({ ...p, updated_at: p.canceled_at || p.activated_at || p.created_at }));

    // Budgets + monthly budget lines from the sandbox annual lines.
    const budgetLines = [];
    const MAP = [
      [/^Rental income/, GL("rent_income")], [/Parking|Storage|garage/i, GLN("4060")], [/Pet/, GLN("4070")],
      [/Late/, GL("late_fee_income")], [/Laundry|Other income/, GL("other_income")],
      [/Repairs|renovation|Elevator/i, GL("repairs_maintenance")], [/Turnover/, GL("turnover")], [/Utilities|Trash/, GL("utilities")],
      [/Landscaping/, GLN("5150")], [/Insurance/, GL("insurance")], [/Property taxes/, GL("property_taxes")], [/Payroll/, GL("payroll")],
      [/Management fees/, GL("management_fees")],
    ];
    const glFor = (label) => (MAP.find(([re]) => re.test(label)) || [null, GL("other_income")])[1];
    let blSeq = 0;
    for (const b of ctx.rows("budgets")) {
      const m = b.metadata || {};
      const income = m.incomeLines || [];
      const expense = m.expenseLines || [];
      const per = new Map();
      for (const l of [...income, ...expense]) per.set(glFor(l.label), round2((per.get(glFor(l.label)) || 0) + Number(l.amount)));
      for (const [gl, annual] of per) {
        const cents = Math.round(annual * 100);
        const base = Math.floor(cents / 12);
        for (let month = 1; month <= 12; month += 1) {
          budgetLines.push({ id: sid(G.budgetLine, ++blSeq), budget_id: b.id, property_id: b.property_id, gl_account_id: gl, account_label: labelOf(gl), year: Number(b.year), month, amount: (month === 12 ? cents - base * 11 : base) / 100 });
        }
      }
      const inc = round2(income.reduce((s, l) => s + Number(l.amount), 0));
      const exp = round2(expense.reduce((s, l) => s + Number(l.amount), 0));
      const { incomeLines, expenseLines, ...rest } = m;
      void incomeLines;
      void expenseLines;
      Object.assign(b, { total_income: inc, total_expense: exp, period: String(b.year), budgeted_amount: round2(inc - exp), metadata: rest });
    }

    // CAM: Alder 2026 running review, Pioneer 2026 (commercial NNN), Pinecrest evaluation.
    {
      const pool = GLN("5150");
      const ytd = round2(lines.filter((l) => l.gl_account_id === pool && l.property_id === ALDER.id && l.entry_date.startsWith(String(YEAR))).reduce((s, l) => s + l.debit - l.credit, 0));
      const months = Number(TODAY.slice(5, 7));
      camRows.push({
        id: sid(G.cam, 2), name: `Alder Court Townhomes CAM ${YEAR}`, property_id: ALDER.id, property_name: ALDER.name, year: YEAR,
        budget_amount: 9360, actual_amount: ytd, gl_account_id: GL("cam_income"), status: "Reconciled",
        metadata: {
          poolAccountIds: [pool],
          shares: alderLeases.filter((L) => activeOn(L, TODAY)).map((L) => {
            const billedMonths = camEstimateMonths(L, YEAR);
            const billed = round2(billedMonths * 120);
            const pct = round2((25 * billedMonths) / months);
            return { leaseId: L.id, tenantName: L.tenantName, unit: L.unitLabel, include: true, sharePct: pct, estimate: "", pct, trueUp: round2((ytd * pct) / 100 - billed), entryId: "" };
          }),
          activityNotes: "Running review — a quarter of the pool per townhome, prorated for its months on the current lease; true-ups bill in January.",
        },
      });
      if (PIONEER && COBALT) {
        const pPool = [GL("repairs_maintenance"), GL("utilities")];
        const actual = round2(lines.filter((l) => pPool.includes(l.gl_account_id) && l.property_id === PIONEER.id && l.entry_date.startsWith(String(YEAR))).reduce((s, l) => s + l.debit - l.credit, 0));
        const billed = round2(lines.filter((l) => l.gl_account_id === GL("cam_income") && l.lease_id === COBALT.id && l.entry_date.startsWith(String(YEAR))).reduce((s, l) => s + l.credit - l.debit, 0));
        camRows.push({
          id: sid(G.cam, 4), name: `Pioneer Square Office Suites CAM ${YEAR}`, property_id: PIONEER.id, property_name: PIONEER.name, year: YEAR,
          budget_amount: 14400, actual_amount: actual, gl_account_id: GL("cam_income"), status: "Reconciled",
          metadata: {
            poolAccountIds: pPool,
            shares: [{ leaseId: COBALT.id, tenantName: COBALT.tenantName, unit: COBALT.unitLabel, include: true, sharePct: 50, estimate: "", pct: 50, trueUp: round2((actual * 50) / 100 - billed), entryId: "" }],
            activityNotes: "Triple-net: Suite 200 carries half the common-area pool (Suite 300 is vacant — the owner absorbs its half). Estimates run $600/mo.",
          },
        });
      }
      const pinePool = [GLN("5150"), GL("utilities")];
      camRows.push({
        id: sid(G.cam, 3), name: `Pinecrest Commons CAM ${YEAR} (evaluation)`, property_id: PINECREST.id, property_name: PINECREST.name, year: YEAR,
        budget_amount: 0, actual_amount: round2(lines.filter((l) => pinePool.includes(l.gl_account_id) && l.property_id === PINECREST.id && l.entry_date.startsWith(String(YEAR))).reduce((s, l) => s + l.debit - l.credit, 0)),
        gl_account_id: GL("cam_income"), status: "Draft",
        metadata: { poolAccountIds: pinePool, activityNotes: "Exploring CAM recovery for courtyard and parking-lot costs at the 2027 renewals." },
      });
    }

    // Tenants' balance = their AR on the ledger.
    for (const t of tenantRows) t.balance = round2((arByTenant.get(t.id) || []).reduce((s, l) => s + l.debit - l.credit, 0)) || 0;
    // Policy overrides on properties + leases (merged into the people area's metadata).
    for (const p of propRows) if (PROP_OVERRIDES.has(p.id)) p.metadata = { ...(p.metadata || {}), policyOverrides: PROP_OVERRIDES.get(p.id) };
    for (const l of leaseRows) if (LEASE_OVERRIDES.has(l.id)) l.metadata = { ...(l.metadata || {}), policyOverrides: LEASE_OVERRIDES.get(l.id).overrides };

    // Settings: Fees & Policies, Payment Processing, bill approvals.
    const settings = ctx.rows("settings");
    const upsertSetting = (key, value, n) => {
      const row = settings.find((s) => s.key === key);
      if (row) row.value = value;
      else settings.push({ id: sid(G.setting, n), key, value });
    };
    upsertSetting("fees_policies", COMPANY_POLICIES, 1);
    upsertSetting("online_payments", PAYMENT_SETTINGS(BANK.trust), 2);
    upsertSetting("accounting_settings", { billApprovalLimit: BILL_APPROVAL_LIMIT }, 3);

    // Write the tables.
    const set = (table, rows) => {
      const list = ctx.rows(table);
      if (list === rows) return;
      list.length = 0;
      list.push(...rows);
    };
    entries.sort((a, b) => a.created_at.localeCompare(b.created_at));
    set("gl_accounts", glRows);
    set("ledger_entries", entries);
    set("ledger_lines", lines);
    set("transactions", txnRows);
    billRows.sort((a, b) => b.bill_date.localeCompare(a.bill_date));
    set("budget_lines", budgetLines);
    set("bank_reconciliations", recRows);
    set("cost_jobs", jobs);
    set("utility_allocations", rubsRows);
    set("cam_reconciliations", camRows);
    set("online_payments", payments);
    set("autopay_plans", planRows);
  }
}
