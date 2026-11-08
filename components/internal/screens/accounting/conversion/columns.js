import { DEPOSIT_KINDS } from "@/lib/ledger/conversion";

// Grid columns per balance type for the opening-balances wizard (INTL-04): { key, label, type, width, options?, placeholder? }; conversion_grid.jsx renders each type.

const memo = { key: "memo", label: "Memo", type: "text", width: "min-w-40" };
const amount = (label = "Amount") => ({ key: "amount", label, type: "money", width: "w-32" });

export const ITEM_TYPES = [
  { value: "check", label: "Check" },
  { value: "deposit", label: "Deposit" },
];

export function gridColumns(kind, { ytd = false } = {}) {
  switch (kind) {
    case "tenant_balance":
      return [
        { key: "leaseId", label: "Lease", type: "lease", width: "min-w-56" },
        { key: "itemDate", label: "Charge date", type: "date", width: "w-36" },
        { key: "glAccountId", label: "Charge type", type: "account", accounts: "income", placeholder: "Rental Income", width: "min-w-44" },
        amount(),
        memo,
      ];
    case "tenant_credit":
      return [
        { key: "leaseId", label: "Lease", type: "lease", width: "min-w-56" },
        { key: "bankAccountId", label: "Held in", type: "bank", width: "min-w-40" },
        amount("Credit"),
        memo,
      ];
    case "deposit":
      return [
        { key: "leaseId", label: "Lease", type: "lease", width: "min-w-56" },
        { key: "kind", label: "Type", type: "select", meta: true, options: DEPOSIT_KINDS.map((k) => ({ value: k, label: k })), width: "min-w-36" },
        amount("Held"),
        { key: "interest", label: "Interest held", type: "meta-money", width: "w-28" },
        { key: "interestBearing", label: "Earns interest", type: "bool", width: "w-24" },
        { key: "bankAccountId", label: "Held in", type: "bank", width: "min-w-40" },
        memo,
      ];
    case "owner_balance":
      return [
        { key: "ownerId", label: "Owner", type: "owner", width: "min-w-44" },
        { key: "propertyId", label: "Property", type: "property", width: "min-w-40" },
        { key: "bankAccountId", label: "Held in", type: "bank", width: "min-w-40" },
        { key: "amount", label: "Balance", type: "signed", width: "w-32" },
        memo,
      ];
    case "bill":
      return [
        { key: "vendorId", label: "Vendor", type: "vendor", width: "min-w-44" },
        { key: "propertyId", label: "Property", type: "property", width: "min-w-40" },
        { key: "ref", label: "Invoice #", type: "text", width: "w-28" },
        { key: "itemDate", label: "Bill date", type: "date", width: "w-36" },
        { key: "dueDate", label: "Due date", type: "meta-date", width: "w-36" },
        amount("Amount due"),
        memo,
      ];
    case "gl_balance":
      return [
        { key: "glAccountId", label: "Account", type: "account", accounts: "gl", width: "min-w-52" },
        { key: "propertyId", label: "Property", type: "property", width: "min-w-36" },
        { key: "bankAccountId", label: "Bank (cash only)", type: "bank", optional: true, width: "min-w-36" },
        ...(ytd
          ? [
              { key: "itemDate", label: "Date (year to date)", type: "date", width: "w-36" },
              { key: "vendorId", label: "Vendor (1099)", type: "vendor", width: "min-w-36" },
            ]
          : []),
        { key: "debit", label: "Debit", type: "debit", width: "w-32" },
        { key: "credit", label: "Credit", type: "credit", width: "w-32" },
        memo,
      ];
    case "bank_outstanding":
      return [
        { key: "bankAccountId", label: "Bank", type: "bank", required: true, width: "min-w-40" },
        { key: "itemType", label: "Type", type: "select", meta: true, options: ITEM_TYPES, width: "w-28" },
        { key: "itemDate", label: "Date", type: "date", width: "w-36" },
        { key: "ref", label: "Check #", type: "text", width: "w-24" },
        { key: "memo", label: "Payee / memo", type: "text", width: "min-w-40" },
        { key: "ownerId", label: "Owner", type: "owner", width: "min-w-40" },
        amount(),
      ];
    default:
      return [];
  }
}

// A blank line of one balance type, with its per-type defaults.
export function blankLine(kind, batchId = "") {
  const metadata = kind === "deposit" ? { kind: DEPOSIT_KINDS[0], interest: 0, interestBearing: false } : kind === "bank_outstanding" ? { itemType: "check" } : {};
  return {
    id: crypto.randomUUID(),
    batchId,
    kind,
    propertyId: "",
    unitId: "",
    leaseId: "",
    tenantId: "",
    ownerId: "",
    vendorId: "",
    bankAccountId: "",
    glAccountId: "",
    itemDate: "",
    amount: "",
    memo: "",
    ref: "",
    postedEntryId: "",
    metadata,
  };
}
