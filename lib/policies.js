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
  { key: "deposits", label: "Security deposits", description: "How deposits are held and returned." },
  { key: "maintenance", label: "Maintenance", description: "Approval limits and entry rules for work orders." },
  { key: "management", label: "Management fees", description: "What you charge owners for managing their property." },
];

const ALL = ["company", "property", "lease"];
const NO_LEASE = ["company", "property"];

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
  { key: "maxLateFee", group: "rent", label: "Maximum late fee", type: "currency", default: "", scopes: ALL, hint: "Blank for no cap. Check your local limits.", showIf: (v) => v.lateFeeType !== "none" },
  { key: "nsfFee", group: "rent", label: "NSF / returned payment fee", type: "currency", default: 35, scopes: ALL },
  { key: "prorateFirstMonth", group: "rent", label: "Prorate the first month", type: "switch", default: true, scopes: ALL },
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
    showIf: (v) => Boolean(v.prorateFirstMonth),
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

  // Security deposits
  { key: "depositReturnDays", group: "deposits", label: "Return deadline (days after move-out)", type: "number", default: 30, scopes: NO_LEASE },
  { key: "depositInterestRate", group: "deposits", label: "Deposit interest rate", type: "percent", default: 0, scopes: NO_LEASE, hint: "Required in some jurisdictions." },
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
