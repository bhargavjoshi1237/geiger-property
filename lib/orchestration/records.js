// Record references shared by runs, review items and signals (isomorphic, pure):
// record type → the workspace tab that opens it, the property.activity owner
// type its timeline uses, and a readable label. Links are { type, id, label }.

export const RECORD_LINKS = {
  lease: { tab: "Leases", ownerType: "lease", label: "Lease" },
  tenant: { tab: "Tenants", ownerType: "tenant", label: "Tenant" },
  work_order: { tab: "Work Orders", ownerType: "workorder", label: "Work order" },
  application: { tab: "Applications", ownerType: "application", label: "Application" },
  transaction: { tab: "Transactions", ownerType: "transaction", label: "Payment" },
  online_payment: { tab: "Online Payments", ownerType: "online_payment", label: "Online payment" },
  move: { tab: "Move-ins & Move-outs", ownerType: "move", label: "Move" },
  vendor: { tab: "Vendors", ownerType: "vendor", label: "Vendor" },
  owner: { tab: "Owners", ownerType: "owner", label: "Owner" },
  bill: { tab: "Bills & Payables", ownerType: "bill", label: "Bill" },
  unit: { tab: "Units", ownerType: "unit", label: "Unit" },
  property: { tab: "Properties", ownerType: "property", label: "Property" },
  renewal: { tab: "Renewals", ownerType: "renewal", label: "Renewal" },
  deposit: { tab: "Security Deposits", ownerType: "deposit", label: "Security deposit" },
  unit_turn: { tab: "Unit Turns", ownerType: "unit_turn", label: "Unit turn" },
  bank_account: { tab: "Bank Accounts", ownerType: "bank_account", label: "Bank account" },
  budget: { tab: "Budgets", ownerType: "budget", label: "Budget" },
  prospect: { tab: "Prospects", ownerType: "prospect", label: "Prospect" },
  ledger_entry: { tab: "General Ledger", ownerType: null, label: "Ledger entry" },
  automation: { tab: "All Workflows", ownerType: "automation", label: "Workflow" },
  automation_run: { tab: "Run History", ownerType: null, label: "Workflow run" },
};

export const recordTab = (type) => RECORD_LINKS[type]?.tab || null;
export const recordOwnerType = (type) => RECORD_LINKS[type]?.ownerType || null;
export const recordTypeLabel = (type) => RECORD_LINKS[type]?.label || "Record";

export const link = (type, id, label) => (id ? { type, id, label: label || recordTypeLabel(type) } : null);
