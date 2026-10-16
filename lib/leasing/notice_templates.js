// Starter wording for notices, by notice type. Uses the lease merge catalog
// plus the notice fields below ({{notice.*}}). Plain data — no I/O.

export const NOTICE_MERGE_FIELDS = [
  { group: "Notice", key: "notice.type", label: "Notice type", sample: "Pay or quit" },
  { group: "Notice", key: "notice.served_date", label: "Served date", sample: "October 16, 2026" },
  { group: "Notice", key: "notice.cure_by", label: "Cure-by date", sample: "October 19, 2026" },
  { group: "Notice", key: "notice.amount_due", label: "Amount due", sample: "$1,925" },
  { group: "Notice", key: "notice.reason", label: "Violation / reason", sample: "Unauthorized pet in the unit" },
  { group: "Notice", key: "notice.delivery", label: "Delivery method", sample: "Posted" },
];

const longDate = (v) =>
  v
    ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(n) || 0);

// { "notice.*": value } for a notice draft.
export function noticeMergeValues(n = {}) {
  return {
    "notice.type": n.noticeType || "",
    "notice.served_date": longDate(n.servedDate),
    "notice.cure_by": longDate(n.cureBy),
    "notice.amount_due": Number(n.amountDue) ? money(n.amountDue) : "",
    "notice.reason": n.reason || "",
    "notice.delivery": n.deliveryMethod || "",
  };
}

const HEADER = `{{today}}

To: {{lease.tenants}}
Premises: {{unit.name}}, {{property.address}}
`;

const FOOTER = `
{{landlord.name}}
{{landlord.address}} · {{landlord.phone}}

Served on {{notice.served_date}} by {{notice.delivery}}.`;

export const NOTICE_TEMPLATES = {
  "Late rent": `${HEADER}
RENT REMINDER — PAYMENT PAST DUE

Our records show rent of {{notice.amount_due}} for the premises above is past due. Rent is due on the {{lease.due_day}} of each month; a late fee of {{lease.late_fee}} applies after {{lease.grace_days}} days. Please pay the balance by {{notice.cure_by}}.
${FOOTER}`,
  "Pay or quit": `${HEADER}
NOTICE TO PAY RENT OR QUIT

You are in default of rent in the amount of {{notice.amount_due}}. You must pay this amount in full, or vacate and deliver possession of the premises, on or before {{notice.cure_by}}. If you fail to do either, legal proceedings may begin to recover possession, rent, and costs.
${FOOTER}`,
  "Cure or quit": `${HEADER}
NOTICE TO CURE OR QUIT

You are in violation of your lease: {{notice.reason}}. You must correct this violation on or before {{notice.cure_by}}, or vacate the premises by that date. Failure to do so may result in termination of your tenancy.
${FOOTER}`,
  "Unconditional quit": `${HEADER}
NOTICE TO QUIT

Your tenancy is terminated because of: {{notice.reason}}. You must vacate and deliver possession of the premises on or before {{notice.cure_by}}.
${FOOTER}`,
  "Lease violation": `${HEADER}
NOTICE OF LEASE VIOLATION

This notice is to inform you of the following lease violation: {{notice.reason}}. Please correct it by {{notice.cure_by}}. Continued violations may lead to further action under your lease.
${FOOTER}`,
  "Entry notice": `${HEADER}
NOTICE OF INTENT TO ENTER

Management will enter the premises on {{notice.cure_by}} for the following purpose: {{notice.reason}}. You do not need to be present.
${FOOTER}`,
  "Non-renewal": `${HEADER}
NOTICE OF NON-RENEWAL

Your lease ending {{lease.end}} will not be renewed. Please vacate and return all keys by {{lease.end}}. Move-out instructions will follow.
${FOOTER}`,
  "Rent increase": `${HEADER}
NOTICE OF RENT INCREASE

Effective {{notice.cure_by}}, your monthly rent will change from {{lease.rent}} to {{notice.amount_due}}. All other terms of your lease remain the same.
${FOOTER}`,
  "Eviction notice": `${HEADER}
NOTICE OF EVICTION PROCEEDINGS

Because of {{notice.reason}}, eviction proceedings will be filed if possession of the premises is not delivered by {{notice.cure_by}}. Amount owed: {{notice.amount_due}}.
${FOOTER}`,
  "Notice to vacate": `${HEADER}
ACKNOWLEDGEMENT OF NOTICE TO VACATE

We received your notice to vacate on {{notice.served_date}}. Your move-out date is {{notice.cure_by}}. We'll contact you to schedule the move-out inspection.
${FOOTER}`,
  Other: `${HEADER}
NOTICE

{{notice.reason}}
${FOOTER}`,
};

export const noticeTemplateFor = (type) => NOTICE_TEMPLATES[type] || NOTICE_TEMPLATES.Other;
