import { prorateRent } from "@/lib/policies";

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

// Real values from loaded records: { lease, tenant, unit, property, parties, charges, policies, company }.
export function buildMergeValues({ lease = {}, tenant, unit, property, parties = [], charges = [], policies = {}, company = {} } = {}) {
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
    "lease.rent_schedule": list(m.rentSchedule)
      .map((r) => `• From ${longDate(r.effectiveDate)} — ${r.mode === "percent" ? `+${r.percent}%` : `${money(r.amount)}/mo`}`)
      .join("\n"),
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
