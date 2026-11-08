// Policy cascade: company (settings `fees_policies`) → property → lease.
// Properties and leases store only their overrides in metadata.policyOverrides;
// resolvePolicies() reports each key's effective value and where it came from.
// Plain data + pure helpers — no JSX, no I/O.

const DUE_DAYS = Array.from({ length: 28 }, (_, i) => {
  const d = i + 1;
  const suffix = d === 1 || d === 21 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
  return { value: String(d), label: `${d}${suffix} of the month` };
});

export const POLICY_GROUPS = [
  { key: "rent", label: "Rent & late fees", description: "When rent is due and what happens when it's late." },
  { key: "payments", label: "Payments", description: "How residents can pay and what each method costs." },
  { key: "leasing", label: "Leasing defaults", description: "Starting terms for new applications and leases." },
  { key: "screening", label: "Screening criteria", description: "Who qualifies to rent. Every applicant at a property is held to the same criteria." },
  { key: "deposits", label: "Security deposits", description: "How deposits are held and returned." },
  { key: "maintenance", label: "Maintenance", description: "Approval limits and entry rules for work orders." },
  { key: "management", label: "Management fees", description: "What you charge owners for managing their property." },
];

const ALL = ["company", "property", "lease"];
const NO_LEASE = ["company", "property"];

// Screening packages: manual only until a provider registry (RISK-08) supplies its own.
export const SCREENING_PACKAGE_OPTIONS = [{ value: "manual", label: "Manual (record results by hand)" }];

export const POLICIES = [
  // Rent & late fees
  { key: "rentDueDay", group: "rent", label: "Rent due day", type: "select", options: DUE_DAYS, default: "1", scopes: ALL },
  { key: "graceDays", group: "rent", label: "Grace period (days)", type: "number", default: 5, scopes: ALL, hint: "Days after the due date before a late fee applies." },
  {
    key: "lateFeeType",
    group: "rent",
    label: "Late fee type",
    type: "select",
    options: [
      { value: "flat", label: "Flat amount" },
      { value: "percent", label: "Percent of rent" },
      { value: "daily", label: "Initial + daily" },
      { value: "none", label: "No late fee" },
    ],
    default: "flat",
    scopes: ALL,
  },
  { key: "lateFeeAmount", group: "rent", label: "Late fee", type: "number", default: 50, scopes: ALL, hint: "A dollar amount, or a percent of rent for percent fees.", showIf: (v) => v.lateFeeType !== "none" },
  { key: "dailyLateFee", group: "rent", label: "Daily late fee", type: "currency", default: 10, scopes: ALL, showIf: (v) => v.lateFeeType === "daily" },
  { key: "maxLateFee", group: "rent", label: "Maximum late fee", type: "currency", default: "", scopes: ALL, hint: "Per month's rent. Blank for no cap — check your state's limits in Legal Resources.", showIf: (v) => v.lateFeeType !== "none" },
  // Second late fee (CORE-19): a one-time fee per rent month once it's this late, e.g. a legal or admin fee.
  {
    key: "lateFee2Enabled",
    group: "rent",
    label: "Charge a second late fee",
    type: "switch",
    default: false,
    scopes: ALL,
    hint: "Once per rent month that's still unpaid this many days after the due date, on top of the late fee. Some states allow only one late fee a month — check Legal Resources.",
    showIf: (v) => v.lateFeeType !== "none",
  },
  { key: "lateFee2DaysLate", group: "rent", label: "Second late fee after (days late)", type: "number", default: 15, min: 1, scopes: ALL, hint: "Days after the due date: rent due on the 1st and unpaid on the 16th is 15 days late.", showIf: (v) => v.lateFeeType !== "none" && Boolean(v.lateFee2Enabled) },
  {
    key: "lateFee2Type",
    group: "rent",
    label: "Second late fee type",
    type: "select",
    options: [
      { value: "flat", label: "Flat amount" },
      { value: "percent", label: "Percent of rent" },
    ],
    default: "flat",
    scopes: ALL,
    showIf: (v) => v.lateFeeType !== "none" && Boolean(v.lateFee2Enabled),
  },
  { key: "lateFee2Amount", group: "rent", label: "Second late fee", type: "number", default: 0, min: 0, scopes: ALL, hint: "A dollar amount, or a percent of the month's rent for percent fees.", showIf: (v) => v.lateFeeType !== "none" && Boolean(v.lateFee2Enabled) },
  { key: "lateFee2GlAccountId", group: "rent", label: "Second late fee account", type: "gl_account", accountTypes: ["Income"], default: "", scopes: ALL, hint: "Empty posts to Late Fee Income; pick Other Income for legal or admin fees.", showIf: (v) => v.lateFeeType !== "none" && Boolean(v.lateFee2Enabled) },
  { key: "lateFee2CountsTowardTotal", group: "rent", label: "Second late fee counts toward the late-fee count", type: "switch", default: true, scopes: ALL, hint: "The late-fee count is the rent months with a late fee in the last 12. Applies to fees charged from now on.", showIf: (v) => v.lateFeeType !== "none" && Boolean(v.lateFee2Enabled) },
  { key: "maxLateFeeTotal", group: "rent", label: "Maximum late fees per month (combined)", type: "currency", default: "", scopes: ALL, hint: "Caps the late fee and the second late fee together for one month's rent, where state law limits the total. Blank for no combined cap.", showIf: (v) => v.lateFeeType !== "none" },
  { key: "lateFeeMinBalance", group: "rent", label: "Minimum unpaid rent for a late fee", type: "currency", default: 0, scopes: ALL, hint: "No late fee while a month's unpaid rent is at or under this amount.", showIf: (v) => v.lateFeeType !== "none" },
  { key: "lateFeesDuringEviction", group: "rent", label: "Charge late fees during an eviction", type: "switch", default: false, scopes: ALL, showIf: (v) => v.lateFeeType !== "none" },
  {
    key: "lateFeeOnInstallments",
    group: "rent",
    label: "Charge late fees on payment-plan installments",
    type: "switch",
    default: false,
    scopes: ALL,
    hint: "A plan in good standing suspends late fees on rent; on, a late installment still gets the late fee.",
    showIf: (v) => v.lateFeeType !== "none",
  },
  { key: "planDefaultAfterMissed", group: "rent", label: "Payment plan defaults after (missed installments)", type: "number", default: 1, scopes: ALL, hint: "Missed means unpaid past the plan's grace period. The plan's unpaid balance then comes due at once; 0 never defaults automatically." },
  { key: "nsfFee", group: "rent", label: "NSF / returned payment fee", type: "currency", default: 35, scopes: ALL, hint: "Charged when a check or bank payment comes back. Many states cap it (e.g. CA $25 first / $35 after, NY $20 on rent and only if the lease says so, TX $30, CO $20) — check your state in Legal Resources." },
  { key: "prorateFirstMonth", group: "rent", label: "Prorate the first month", type: "switch", default: true, scopes: ALL },
  { key: "prorateLastMonth", group: "rent", label: "Prorate the move-out month", type: "switch", default: true, scopes: ALL, hint: "Bills the last month by day through the move-out date; off bills the whole month." },
  {
    key: "prorationMethod",
    group: "rent",
    label: "Proration method",
    type: "select",
    options: [
      { value: "actual", label: "Actual days in month" },
      { value: "thirty", label: "30-day month" },
    ],
    default: "actual",
    scopes: ALL,
    showIf: (v) => Boolean(v.prorateFirstMonth || v.prorateLastMonth),
  },

  // Payments
  {
    key: "paymentMethods",
    group: "payments",
    label: "Accepted methods",
    type: "multiselect",
    options: [
      { value: "ach", label: "ACH / bank transfer" },
      { value: "card", label: "Credit & debit card" },
      { value: "check", label: "Check" },
      { value: "cash", label: "Cash" },
      { value: "money_order", label: "Money order" },
    ],
    default: ["ach", "card", "check"],
    scopes: ALL,
  },
  { key: "allowPartialPayments", group: "payments", label: "Accept partial payments", type: "switch", default: true, scopes: ALL },
  { key: "blockAfterEviction", group: "payments", label: "Stop online payments once an eviction is filed", type: "switch", default: true, scopes: ALL },
  { key: "certifiedFundsOnly", group: "payments", label: "Certified funds only", type: "switch", default: false, scopes: ALL, hint: "Turn on for residents with returned payments." },
  { key: "cardFeePct", group: "payments", label: "Card convenience fee", type: "percent", default: 2.9, scopes: NO_LEASE },
  { key: "achFee", group: "payments", label: "ACH fee", type: "currency", default: 0, scopes: NO_LEASE },
  { key: "autopayRequired", group: "payments", label: "Require autopay", type: "switch", default: false, scopes: ALL },

  // Leasing defaults
  { key: "applicationFee", group: "leasing", label: "Application fee", type: "currency", default: 45, scopes: NO_LEASE },
  { key: "defaultLeaseTermMonths", group: "leasing", label: "Default lease term (months)", type: "number", default: 12, scopes: NO_LEASE },
  {
    key: "depositRule",
    group: "leasing",
    label: "Default deposit",
    type: "select",
    options: [
      { value: "one_month", label: "One month's rent" },
      { value: "fixed", label: "Fixed amount" },
    ],
    default: "one_month",
    scopes: NO_LEASE,
  },
  { key: "fixedDeposit", group: "leasing", label: "Fixed deposit amount", type: "currency", default: 500, scopes: NO_LEASE, showIf: (v) => v.depositRule === "fixed" },
  { key: "petsAllowed", group: "leasing", label: "Pets allowed", type: "switch", default: true, scopes: NO_LEASE },
  { key: "petDeposit", group: "leasing", label: "Pet deposit", type: "currency", default: 300, scopes: ALL, showIf: (v) => Boolean(v.petsAllowed) },
  { key: "petRent", group: "leasing", label: "Monthly pet rent", type: "currency", default: 25, scopes: ALL, showIf: (v) => Boolean(v.petsAllowed) },
  { key: "renewalNoticeDays", group: "leasing", label: "Renewal offer lead time (days)", type: "number", default: 90, scopes: ALL },
  { key: "moveOutNoticeDays", group: "leasing", label: "Required move-out notice (days)", type: "number", default: 30, scopes: ALL },
  { key: "autoMonthToMonth", group: "leasing", label: "Roll to month-to-month at term end", type: "switch", default: true, scopes: ALL },
  { key: "mtmPremium", group: "leasing", label: "Month-to-month premium", type: "currency", default: 0, scopes: ALL, showIf: (v) => Boolean(v.autoMonthToMonth) },

  // Screening criteria (RISK-04): `section` titles the sub-headings in Fees & Policies; lib/screening/criteria_policy.js resolves them.
  { key: "screeningPackage", group: "screening", section: "Ordering", label: "Screening package", type: "select", options: SCREENING_PACKAGE_OPTIONS, default: "manual", scopes: NO_LEASE, hint: "A connected screening provider's packages appear here." },
  {
    key: "screeningPayer",
    group: "screening",
    section: "Ordering",
    label: "Who pays for screening",
    type: "select",
    options: [
      { value: "applicant", label: "Applicant" },
      { value: "company", label: "Company" },
    ],
    default: "applicant",
    scopes: NO_LEASE,
  },
  { key: "incomeMultiple", group: "screening", section: "Income", label: "Income multiple (× monthly rent)", type: "number", step: 0.1, min: 0, default: 3, scopes: NO_LEASE, hint: "Gross monthly income must be at least this many times the rent. Some cities cap the ratio — check Legal Resources." },
  { key: "countCoApplicantIncome", group: "screening", section: "Income", label: "Count co-applicants' income", type: "switch", default: true, scopes: NO_LEASE },
  { key: "allowGuarantorToQualify", group: "screening", section: "Income", label: "Let a guarantor or cosigner qualify", type: "switch", default: true, scopes: NO_LEASE, hint: "An applicant below the income multiple qualifies when a guarantor meets the guarantor multiple." },
  { key: "guarantorIncomeMultiple", group: "screening", section: "Income", label: "Guarantor income multiple (× monthly rent)", type: "number", step: 0.1, min: 0, default: "", scopes: NO_LEASE, hint: "Blank uses the income multiple.", showIf: (v) => Boolean(v.allowGuarantorToQualify) },
  {
    key: "voucherIncomeBasis",
    group: "screening",
    section: "Income",
    label: "Income test for voucher holders",
    type: "select",
    options: [
      { value: "tenant_portion", label: "Tenant's share of rent" },
      { value: "full_rent", label: "Full rent" },
    ],
    default: "tenant_portion",
    scopes: NO_LEASE,
    hint: "The tenant's share is the rent minus the voucher. Many states and cities protect vouchers as income and test only that share — check Legal Resources.",
  },
  { key: "minCreditScore", group: "screening", section: "Credit", label: "Minimum credit score", type: "number", min: 300, max: 850, default: "", scopes: NO_LEASE, hint: "Blank for no minimum." },
  {
    key: "noScorePolicy",
    group: "screening",
    section: "Credit",
    label: "Applicants with no credit score",
    type: "select",
    options: [
      { value: "review", label: "Review individually" },
      { value: "conditional", label: "Approve with conditions" },
      { value: "deny", label: "Deny" },
    ],
    default: "review",
    scopes: NO_LEASE,
  },
  { key: "evictionLookbackYears", group: "screening", section: "Eviction history", label: "Eviction look-back (years)", type: "number", min: 0, default: 7, scopes: NO_LEASE },
  { key: "evictionJudgmentsOnly", group: "screening", section: "Eviction history", label: "Count eviction judgments only", type: "switch", default: true, scopes: NO_LEASE, hint: "Filings that were dismissed, settled or sealed don't count." },
  {
    key: "criminalPolicy",
    group: "screening",
    section: "Criminal history",
    label: "Criminal history",
    type: "select",
    options: [
      { value: "none", label: "Not considered" },
      { value: "lookback", label: "Look-back with individual assessment" },
    ],
    default: "lookback",
    scopes: NO_LEASE,
    hint: "Fair-chance laws limit or ban criminal checks in many places — check Legal Resources.",
  },
  { key: "criminalLookbackYears", group: "screening", section: "Criminal history", label: "Criminal look-back (years)", type: "number", min: 0, default: "", scopes: NO_LEASE, hint: "Blank sets no limit. Every record still gets an individual assessment.", showIf: (v) => v.criminalPolicy === "lookback" },
  { key: "requireIdVerification", group: "screening", section: "Verification", label: "Require ID verification", type: "switch", default: false, scopes: NO_LEASE },
  { key: "requireIncomeVerification", group: "screening", section: "Verification", label: "Require income verification", type: "switch", default: true, scopes: NO_LEASE },
  {
    key: "conditionalOptions",
    group: "screening",
    section: "Conditional approvals",
    label: "Conditions you may offer",
    type: "multiselect",
    options: [
      { value: "extra_deposit", label: "Additional deposit" },
      { value: "guarantor", label: "Guarantor or cosigner" },
      { value: "lease_guarantee", label: "Lease guarantee" },
    ],
    default: ["extra_deposit", "guarantor"],
    scopes: NO_LEASE,
    hint: "Worse terms because of a consumer report count as adverse action, so the applicant gets a notice.",
  },
  { key: "publishedCriteriaText", group: "screening", section: "Published criteria", label: "Criteria shown to applicants", type: "textarea", default: "", scopes: NO_LEASE, hint: "Applicants see this before they pay a fee. Several states and cities require written criteria up front — check Legal Resources." },

  // Security deposits
  { key: "depositReturnDays", group: "deposits", label: "Return deadline (days after move-out)", type: "number", default: 30, scopes: NO_LEASE },
  {
    key: "depositInterestRate",
    group: "deposits",
    label: "Deposit interest rate",
    type: "percent",
    default: 0,
    scopes: NO_LEASE,
    hint: "Accrues monthly on deposits marked interest-bearing. Required in some places (e.g. NJ, MA, Chicago, Illinois buildings of 25+ units); a deposit's own rate override wins.",
  },
  {
    key: "depositInterestPayout",
    group: "deposits",
    label: "Pay deposit interest",
    type: "select",
    options: [
      { value: "at_move_out", label: "At move-out, with the refund" },
      { value: "annual_credit", label: "Each year, as a credit on the resident's balance" },
    ],
    default: "at_move_out",
    scopes: NO_LEASE,
    hint: "NJ, MA, Illinois and Chicago require interest every year (cash or a rent credit); New York lets the resident choose. Annual credits post each January for the year before.",
  },
  {
    key: "depositHeldIn",
    group: "deposits",
    label: "Deposits held in",
    type: "select",
    options: [
      { value: "trust", label: "Trust / escrow account" },
      { value: "operating", label: "Operating account" },
    ],
    default: "trust",
    scopes: NO_LEASE,
    hint: "With trust, deposit payments are moved to your Security deposit bank account (Bank Accounts → Deposits to transfer). Several states (NJ, NY 6+ units, MA, Chicago) require a separate account.",
  },

  // Maintenance
  { key: "ownerApprovalLimit", group: "maintenance", label: "Owner approval above", type: "currency", default: 500, scopes: NO_LEASE, hint: "Work orders estimated above this need owner sign-off." },
  {
    key: "entryPermission",
    group: "maintenance",
    label: "Default entry permission",
    type: "select",
    options: [
      { value: "allowed", label: "Entry allowed" },
      { value: "call_first", label: "Call first" },
      { value: "present", label: "Resident must be present" },
    ],
    default: "call_first",
    scopes: ALL,
  },
  { key: "emergencyPhone", group: "maintenance", label: "After-hours emergency line", type: "phone", default: "", scopes: NO_LEASE },

  // Management fees
  { key: "managementFeePct", group: "management", label: "Management fee", type: "percent", default: 8, scopes: NO_LEASE },
  { key: "managementFeeMin", group: "management", label: "Minimum monthly fee", type: "currency", default: 0, scopes: NO_LEASE },
  { key: "leasingFeePct", group: "management", label: "Leasing fee (% of first month)", type: "percent", default: 50, scopes: NO_LEASE },
  { key: "renewalFee", group: "management", label: "Renewal fee", type: "currency", default: 0, scopes: NO_LEASE },
  { key: "ownerReserve", group: "management", label: "Owner reserve", type: "currency", default: 250, scopes: NO_LEASE, hint: "Kept back from each owner distribution." },
  { key: "ownerDistributionDay", group: "management", label: "Owner distribution day", type: "select", options: DUE_DAYS, default: "15", scopes: NO_LEASE },
];

export const POLICY_DEFAULTS = Object.fromEntries(POLICIES.map((p) => [p.key, p.default]));

export const policiesFor = (scope, group) =>
  POLICIES.filter((p) => p.scopes.includes(scope) && (!group || p.group === group));

// Older settings stored paymentMethods as { ach: true, … }.
function normalizeStored(stored) {
  const out = { ...(stored || {}) };
  const pm = out.paymentMethods;
  if (pm && !Array.isArray(pm) && typeof pm === "object") {
    out.paymentMethods = Object.keys(pm).filter((k) => pm[k]);
  }
  return out;
}

// Company layer = defaults overlaid with the saved `fees_policies` setting.
export function companyPolicies(stored) {
  return { ...POLICY_DEFAULTS, ...normalizeStored(stored) };
}

export const overridesOf = (record) => {
  const o = record?.metadata?.policyOverrides ?? record?.policyOverrides;
  return o && typeof o === "object" ? o : {};
};

// { key: { value, source: "company" | "property" | "lease" } } for every policy.
export function resolvePolicies({ company, property, lease } = {}) {
  const base = companyPolicies(company);
  const propO = overridesOf(property);
  const leaseO = overridesOf(lease);
  const out = {};
  for (const p of POLICIES) {
    if (lease && p.scopes.includes("lease") && p.key in leaseO) out[p.key] = { value: leaseO[p.key], source: "lease" };
    else if (property && p.key in propO) out[p.key] = { value: propO[p.key], source: "property" };
    else out[p.key] = { value: base[p.key], source: "company" };
  }
  return out;
}

// Flat { key: value } view of resolvePolicies.
export const effectivePolicies = (layers) =>
  Object.fromEntries(Object.entries(resolvePolicies(layers)).map(([k, v]) => [k, v.value]));

// Late fee owed for `rent` paid `daysLate` days after the due date.
export function computeLateFee(policies, rent, daysLate) {
  const p = policies || {};
  if (p.lateFeeType === "none" || daysLate <= Number(p.graceDays || 0)) return 0;
  let fee = 0;
  if (p.lateFeeType === "percent") fee = (Number(rent) * Number(p.lateFeeAmount || 0)) / 100;
  else fee = Number(p.lateFeeAmount || 0);
  if (p.lateFeeType === "daily") fee += Number(p.dailyLateFee || 0) * Math.max(0, daysLate - Number(p.graceDays || 0) - 1);
  const cap = Number(p.maxLateFee);
  return Math.round((cap > 0 ? Math.min(fee, cap) : fee) * 100) / 100;
}

// Prorated first-month rent for a move-in date (ISO), per the proration policy.
export function prorateRent(policies, rent, moveIn) {
  if (!moveIn || !policies?.prorateFirstMonth) return Number(rent) || 0;
  const d = new Date(`${moveIn}T00:00:00`);
  const daysInMonth = policies.prorationMethod === "thirty" ? 30 : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const remaining = Math.max(0, daysInMonth - d.getDate() + 1);
  return Math.round(((Number(rent) || 0) * remaining * 100) / daysInMonth) / 100;
}
