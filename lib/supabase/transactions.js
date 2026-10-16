import { makeEntityData } from "./entity_factory";

// Data-access layer for Transactions — the general ledger of income, expenses and transfers (owns `property.transactions`).
export const transactionsLayer = makeEntityData({
  table: "transactions",
  tag: "transactions",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "txnDate", col: "txn_date", type: "date" },
    { key: "txnType", col: "txn_type", type: "text" },
    { key: "account", col: "account", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "amount", col: "amount", type: "number" },
    { key: "payee", col: "payee", type: "text" },
    { key: "reference", col: "reference", type: "text" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "billId", col: "bill_id", type: "uuid" },
    { key: "vendorId", col: "vendor_id", type: "uuid" },
    { key: "ownerId", col: "owner_id", type: "uuid" },
    { key: "bankAccountId", col: "bank_account_id", type: "uuid" },
    { key: "ledgerEntryId", col: "ledger_entry_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Cleared" },
  ],
});

export const transactionsData = transactionsLayer.data;
