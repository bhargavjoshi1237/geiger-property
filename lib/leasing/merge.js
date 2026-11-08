import { prorateRent } from "@/lib/policies";
import { activeSteps } from "@/lib/billing/rent";

// Lease document merge engine — pure data + helpers, no I/O. Templates use
// {{group.field}} placeholders (legacy {{snake_case}} keys still resolve). The
// catalog below is the documented list of merge fields every template, notice
// and letter can use; buildMergeValues() fills it from loaded records.

export const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

const money = (n) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);
};

const longDate = (v) =>
  v
    ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

const ordinal = (d) => {
  const n = Number(d) || 0;
  if (!n) return "";
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${s}`;
};

const monthsBetween = (start, end) => {
  if (!start || !end) return "";
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() - 1 ? 1 : 0);
  return m > 0 ? `${m} month${m === 1 ? "" : "s"}` : "";
};

const list = (v) => (Array.isArray(v) ? v : []);

// Escalations for {{lease.rent_schedule}}: the lease's active rent steps after the first (CORE-01), else the legacy metadata.rentSchedule.
function rentScheduleLines(rentSteps, legacy) {
  if (!Array.isArray(rentSteps)) {
    return list(legacy).map((r) => `• From ${longDate(r.effectiveDate)} — ${r.mode === "percent" ? `+${r.percent}%` : `${money(r.amount)}/mo`}`);
  }
  return activeSteps(rentSteps)
    .filter((s) => s.source !== "initial")
    .map((s) => {
      const pct = s.changeMode === "percent" ? `${Number(s.changeValue) >= 0 ? "+" : ""}${Number(s.changeValue) || 0}% → ` : "";
      return `• From ${longDate(s.effectiveDate)} — ${pct}${money(s.amount)}/mo${s.source === "mtm_premium" ? " (month-to-month)" : ""}`;
    });
}

// The documented merge-field catalog: { key, label, group, sample, legacy? }.
export const MERGE_FIELDS = [
  { group: "Lease", key: "lease.name", label: "Lease name", sample: "Maple Court · 4B — Jordan Blake" },
  { group: "Lease", key: "lease.type", label: "Lease type (Residential / Commercial)", sample: "Residential" },
  { group: "Lease", key: "lease.term_type", label: "Term type (Fixed / Month-to-month)", sample: "Fixed term" },
  { group: "Lease", key: "lease.start", label: "Term start date", sample: "January 1, 2027", legacy: "lease_start" },
  { group: "Lease", key: "lease.end", label: "Term end date", sample: "December 31, 2027", legacy: "lease_end" },
  { group: "Lease", key: "lease.term", label: "Term length", sample: "12 months" },
  { group: "Lease", key: "lease.move_in", label: "Move-in date", sample: "January 1, 2027" },
  { group: "Lease", key: "lease.signed_date", label: "Signed date", sample: "December 12, 2026" },
  { group: "Rent", key: "lease.rent", label: "Monthly rent", sample: "$1,850", legacy: "rent" },
  { group: "Rent", key: "lease.prorated_rent", label: "Prorated first month", sample: "$1,193.55" },
  { group: "Rent", key: "lease.due_day", label: "Rent due day", sample: "1st", legacy: "due_day" },
  { group: "Rent", key: "lease.grace_days", label: "Grace period (days)", sample: "5", legacy: "grace_days" },
  { group: "Rent", key: "lease.late_fee", label: "Late fee", sample: "$75", legacy: "late_fee" },
  { group: "Rent", key: "lease.nsf_fee", label: "Returned payment fee", sample: "$35" },
  { group: "Rent", key: "lease.mtm_premium", label: "Month-to-month premium", sample: "$100" },
  { group: "Rent", key: "lease.recurring_charges", label: "Recurring charges (list)", sample: "• Parking — $75/mo\n• Pet rent — $35/mo" },
  { group: "Rent", key: "lease.rent_schedule", label: "Rent schedule / escalations (list)", sample: "• From January 1, 2028 — $1,925/mo" },
  { group: "Deposits", key: "lease.deposit", label: "Security deposit", sample: "$1,850", legacy: "deposit" },
  { group: "Deposits", key: "lease.pet_deposit", label: "Pet deposit", sample: "$300" },
  { group: "People", key: "tenant.name", label: "Primary tenant", sample: "Jordan Blake", legacy: "tenant_name" },
  { group: "People", key: "tenant.email", label: "Primary tenant email", sample: "jordan@example.com" },
  { group: "People", key: "tenant.phone", label: "Primary tenant phone", sample: "(512) 555-0142" },
  { group: "People", key: "lease.tenants", label: "All tenants", sample: "Jordan Blake and Sam Rivera" },
  { group: "People", key: "lease.cosigners", label: "Co-signers / guarantors", sample: "Pat Blake" },
  { group: "People", key: "lease.occupants", label: "Other occupants", sample: "Riley Blake" },
  { group: "People", key: "landlord.name", label: "Landlord / manager", sample: "Harbor Property Management", legacy: "landlord_name" },
  { group: "People", key: "landlord.address", label: "Landlord address", sample: "500 Harbor Way, Austin, TX 78701" },
  { group: "People", key: "landlord.phone", label: "Landlord phone", sample: "(512) 555-0100" },
  { group: "Premises", key: "unit.name", label: "Unit", sample: "Maple Court · 4B", legacy: "unit" },
  { group: "Premises", key: "unit.bedrooms", label: "Bedrooms", sample: "2" },
  { group: "Premises", key: "unit.bathrooms", label: "Bathrooms", sample: "1" },
  { group: "Premises", key: "property.name", label: "Property", sample: "Maple Court", legacy: "property_name" },
  { group: "Premises", key: "property.address", label: "Full address", sample: "120 Maple Ct, Apt 4B, Austin, TX 78701", legacy: "address" },
  { group: "Premises", key: "property.state", label: "State", sample: "TX", legacy: "state" },
  { group: "Terms", key: "lease.utilities", label: "Utility responsibilities (list)", sample: "• Electric — Tenant\n• Water — Landlord" },
  { group: "Terms", key: "lease.clauses", label: "Additional clauses (list)", sample: "1. No smoking — Smoking is prohibited on the premises." },
  { group: "Terms", key: "lease.insurance_minimum", label: "Required renters liability coverage", sample: "$100,000" },
  { group: "Terms", key: "lease.notice_days", label: "Move-out notice (days)", sample: "30" },
  { group: "Other", key: "today", label: "Today's date", sample: "October 16, 2026", legacy: "today" },
];

export const MERGE_GROUPS = [...new Set(MERGE_FIELDS.map((f) => f.group))];

// { key: sample } for previewing a template with no record chosen.
export const SAMPLE_MERGE_VALUES = withLegacy(Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample])));

function withLegacy(values) {
  const out = { ...values };
  for (const f of MERGE_FIELDS) if (f.legacy && f.key in values) out[f.legacy] = values[f.key];
  return out;
}

const UTILITY_LABEL = { tenant: "Tenant", landlord: "Landlord", split: "Shared", na: "Not provided" };

// Real values from loaded records: { lease, tenant, unit, property, parties, charges, rentSteps, policies, company }.
export function buildMergeValues({ lease = {}, tenant, unit, property, parties = [], charges = [], rentSteps = null, policies = {}, company = {} } = {}) {
  const m = lease.metadata || {};
  const named = (role) => parties.filter((p) => p.role === role).map((p) => p.name).filter(Boolean);
  const tenants = named("tenant");
  const primary = parties.find((p) => p.role === "tenant" && p.isPrimary) || null;
  const tenantName = tenant?.name || primary?.name || lease.tenantName || tenants[0] || "";
  const address = [property?.address, unit?.label ? `Unit ${unit.label}` : "", property?.city, [property?.state, property?.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const lateFee =
    policies.lateFeeType === "none"
      ? "No late fee"
      : policies.lateFeeType === "percent"
        ? `${policies.lateFeeAmount}% of rent`
        : money(policies.lateFeeAmount);
  const utilities = Object.entries(m.utilities || {})
    .filter(([, u]) => u?.responsibility)
    .map(([k, u]) => `• ${u.label || k} — ${UTILITY_LABEL[u.responsibility] || u.responsibility}`);

  return withLegacy({
    "lease.name": lease.name || "",
    "lease.type": lease.leaseType === "commercial" ? "Commercial" : "Residential",
    "lease.term_type": lease.termType === "mtm" ? "Month-to-month" : "Fixed term",
    "lease.start": longDate(lease.termStart),
    "lease.end": lease.termType === "mtm" ? "month-to-month" : longDate(lease.termEnd),
    "lease.term": lease.termType === "mtm" ? "Month-to-month" : monthsBetween(lease.termStart, lease.termEnd),
    "lease.move_in": longDate(lease.moveInDate || lease.termStart),
    "lease.signed_date": longDate(lease.signedDate),
    "lease.rent": Number(lease.rent) > 0 ? money(lease.rent) : "",
    "lease.prorated_rent": Number(lease.rent) > 0 ? money(prorateRent(policies, lease.rent, lease.moveInDate || lease.termStart)) : "",
    "lease.due_day": ordinal(policies.rentDueDay),
    "lease.grace_days": policies.graceDays !== undefined ? String(policies.graceDays) : "",
    "lease.late_fee": lateFee,
    "lease.nsf_fee": policies.nsfFee !== undefined ? money(policies.nsfFee) : "",
    "lease.mtm_premium": m.mtmPremium ? money(m.mtmPremium) : money(policies.mtmPremium),
    "lease.recurring_charges": charges
      .filter((c) => c.status !== "Inactive")
      .map((c) => `• ${c.name} — ${money(c.amount)}${c.frequency && c.frequency !== "Monthly" ? ` (${c.frequency})` : "/mo"}`)
      .join("\n"),
    "lease.rent_schedule": rentScheduleLines(rentSteps, m.rentSchedule).join("\n"),
    "lease.deposit": money(lease.deposit),
    "lease.pet_deposit": m.petDeposit ? money(m.petDeposit) : "",
    "tenant.name": tenantName,
    "tenant.email": tenant?.email || primary?.email || "",
    "tenant.phone": tenant?.phone || primary?.phone || "",
    "lease.tenants": (tenants.length ? tenants : [tenantName].filter(Boolean)).join(" and "),
    "lease.cosigners": [...named("cosigner"), ...named("guarantor")].join(", "),
    "lease.occupants": named("occupant").join(", "),
    "landlord.name": m.landlord || company.dba || company.legalName || "",
    "landlord.address": [company.address, company.city, [company.state, company.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    "landlord.phone": company.phone || "",
    "unit.name": lease.unit || unit?.label || "",
    "unit.bedrooms": unit?.bedrooms ? String(unit.bedrooms) : "",
    "unit.bathrooms": unit?.bathrooms ? String(unit.bathrooms) : "",
    "property.name": property?.name || "",
    "property.address": m.address || address,
    "property.state": property?.state || "",
    "lease.utilities": utilities.join("\n"),
    "lease.clauses": list(m.clauses)
      .map((c, i) => `${i + 1}. ${c.label}${c.detail ? ` — ${c.detail}` : ""}`)
      .join("\n"),
    "lease.insurance_minimum": m.insuranceMinLiability ? money(m.insuranceMinLiability) : "",
    "lease.notice_days": policies.moveOutNoticeDays !== undefined ? String(policies.moveOutNoticeDays) : "",
    today: longDate(new Date().toISOString().slice(0, 10)),
  });
}

// Merge a body: { text, parts: [{ text, token?, known?, empty? }], used: Set, unknown: [], empty: [] }.
export function mergeTemplate(body, values) {
  const src = String(body || "");
  const parts = [];
  const used = new Set();
  const unknown = new Set();
  const empty = new Set();
  let last = 0;
  for (const m of src.matchAll(TOKEN_RE)) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) });
    const key = m[1];
    used.add(key);
    const known = Object.hasOwn(values, key);
    const value = known ? values[key] : "";
    if (!known) unknown.add(key);
    else if (!value) empty.add(key);
    parts.push({ token: key, known, empty: known && !value, text: known && value ? value : `[${key}]` });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last) });
  return {
    text: parts.map((p) => p.text).join(""),
    parts,
    used,
    unknown: [...unknown],
    empty: [...empty],
  };
}

export const tokensIn = (body) => new Set([...String(body || "").matchAll(TOKEN_RE)].map((m) => m[1]));

// A starter lease body built from the catalog, used when no template is linked.
export const DEFAULT_LEASE_BODY = `LEASE AGREEMENT ({{lease.type}})

1. PARTIES
This Lease Agreement is made on {{today}} between {{landlord.name}} ("Landlord") and {{lease.tenants}} ("Tenant").

2. PREMISES
Landlord leases to Tenant the premises known as {{unit.name}}, located at {{property.address}}.

3. TERM
{{lease.term_type}}: the term begins on {{lease.start}} and ends on {{lease.end}} ({{lease.term}}).

4. RENT
Tenant shall pay {{lease.rent}} per month, due on the {{lease.due_day}} of each month. Rent not received within {{lease.grace_days}} days of the due date incurs a late fee of {{lease.late_fee}}. Returned payments incur a fee of {{lease.nsf_fee}}.

5. ADDITIONAL CHARGES
{{lease.recurring_charges}}

6. RENT SCHEDULE
{{lease.rent_schedule}}

7. SECURITY DEPOSIT
Tenant shall pay a security deposit of {{lease.deposit}}, held for the term and returned less lawful deductions.

8. UTILITIES
{{lease.utilities}}

9. RENTERS INSURANCE
Tenant shall carry renters insurance with at least {{lease.insurance_minimum}} in liability coverage.

10. NOTICE
Either party must give {{lease.notice_days}} days' written notice before moving out at the end of the term.

11. ADDITIONAL TERMS
{{lease.clauses}}

SIGNATURES

Landlord: ______________________   Date: __________
Tenant ({{tenant.name}}): ______________________   Date: __________
`;

// --- Payment plan agreement (CORE-14) ----------------------------------------------
// Plan fields merge with the lease fields above; they aren't in MERGE_FIELDS, so lease templates don't offer them.

export const PLAN_MERGE_FIELDS = [
  { group: "Payment plan", key: "plan.name", label: "Plan name", sample: "Fall 2026 catch-up plan" },
  { group: "Payment plan", key: "plan.total", label: "Plan total", sample: "$1,800" },
  { group: "Payment plan", key: "plan.down_payment", label: "Down payment", sample: "$300" },
  { group: "Payment plan", key: "plan.financed", label: "Paid in installments", sample: "$1,500" },
  { group: "Payment plan", key: "plan.installment_count", label: "Number of installments", sample: "5" },
  { group: "Payment plan", key: "plan.frequency", label: "Frequency", sample: "monthly" },
  { group: "Payment plan", key: "plan.first_due", label: "First installment due", sample: "December 1, 2026" },
  { group: "Payment plan", key: "plan.last_due", label: "Last installment due", sample: "April 1, 2027" },
  { group: "Payment plan", key: "plan.schedule", label: "Installment schedule (list)", sample: "1. December 1, 2026 — $300\n2. January 1, 2027 — $300" },
  { group: "Payment plan", key: "plan.grace_days", label: "Grace period (days)", sample: "5" },
  { group: "Payment plan", key: "plan.late_fees", label: "Late fees while on the plan", sample: "While the plan is kept, no late fees are charged on rent or on the installments." },
  { group: "Payment plan", key: "plan.default_terms", label: "Default terms", sample: "If an installment is still unpaid 5 days after its due date, the plan ends and the whole unpaid balance is due at once." },
  { group: "Payment plan", key: "plan.signed_on", label: "Signed on", sample: "November 8, 2026" },
];

// Plan values for the agreement: { plan, installments: [{ seq, dueDate, amount }], policies: { lateFeeOnInstallments, planDefaultAfterMissed }, lateFee }.
export function buildPlanMergeValues({ plan = {}, installments = [], policies = {}, lateFee = "" } = {}) {
  const total = Number(plan.totalAmount) || 0;
  const down = Number(plan.downPayment) || 0;
  const rows = [...installments].sort((a, b) => a.seq - b.seq);
  const grace = Number(plan.graceDays ?? 5) || 0;
  const after = Number(policies.planDefaultAfterMissed ?? 1);
  const onInstallments = policies.lateFeeOnInstallments === true || policies.lateFeeOnInstallments === "true";
  const noun = { Weekly: "weekly", Biweekly: "every-two-weeks", Monthly: "monthly" }[plan.frequency] || "monthly";
  const lateFees =
    plan.suspendLateFees === false
      ? `Late fees under the lease still apply to rent while the plan is in place${onInstallments ? `, and a late installment is charged ${lateFee || "the lease's late fee"}` : ""}.`
      : onInstallments
        ? `While the plan is kept, no late fees are charged on rent; a late installment is charged ${lateFee || "the lease's late fee"}.`
        : "While the plan is kept, no late fees are charged on rent or on the installments.";
  const missed = after > 1 ? `${after} installments are` : "an installment is";
  const defaultTerms =
    after > 0
      ? `If ${missed} still unpaid ${grace} days after the due date, the plan ends and the whole unpaid balance of the plan is due at once.`
      : `If an installment is still unpaid ${grace} days after its due date, Landlord may end the plan, and the whole unpaid balance of the plan is then due at once.`;
  return {
    "plan.name": plan.name || "Payment plan",
    "plan.total": money(total),
    "plan.down_payment": money(down),
    "plan.financed": money(total - down),
    "plan.installment_count": String(rows.length || plan.installmentCount || ""),
    "plan.frequency": noun,
    "plan.first_due": longDate(rows[0]?.dueDate || plan.firstDue),
    "plan.last_due": longDate(rows[rows.length - 1]?.dueDate),
    "plan.schedule": rows.map((r) => `${r.seq}. ${longDate(r.dueDate)} — ${money(r.amount)}`).join("\n"),
    "plan.grace_days": String(grace),
    "plan.late_fees": lateFees,
    "plan.default_terms": defaultTerms,
    "plan.signed_on": longDate(plan.signedOn),
  };
}

// The printed agreement (v1; e-signature through the LEAS adapter later).
export const DEFAULT_PAYMENT_PLAN_BODY = `PAYMENT PLAN AGREEMENT

This Payment Plan Agreement is made on {{today}} between {{landlord.name}} ("Landlord") and {{lease.tenants}} ("Tenant") for the premises known as {{unit.name}}, located at {{property.address}}, under the lease "{{lease.name}}".

1. AMOUNT COVERED
Tenant owes past-due charges under the lease. Landlord agrees to accept {{plan.total}} of them on the schedule below instead of all at once.

2. DOWN PAYMENT
Tenant pays a down payment of {{plan.down_payment}} before this plan starts.

3. INSTALLMENTS
The remaining {{plan.financed}} is paid in {{plan.installment_count}} {{plan.frequency}} installments, the first due on {{plan.first_due}} and the last on {{plan.last_due}}:
{{plan.schedule}}

Rent and other charges that fall due during the plan are still due on time, in addition to the installments.

4. GRACE PERIOD AND LATE FEES
An installment is paid on time when it is paid within {{plan.grace_days}} days of its due date. {{plan.late_fees}}

5. DEFAULT
{{plan.default_terms}} Landlord keeps every right and remedy under the lease and the law, and accepting installments doesn't waive them.

6. ENTIRE AGREEMENT
This agreement changes only how the amount above is paid. Every other term of the lease stays in force.

SIGNATURES

Landlord: ______________________   Date: __________
Tenant ({{tenant.name}}): ______________________   Date: __________
`;
