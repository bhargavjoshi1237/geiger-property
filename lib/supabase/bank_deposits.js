import { makeEntityData } from "./entity_factory";

// Data-access layer for Bank Deposits (reads `property.bank_deposits`, CORE-16); the server writes them through /api/billing/bank-deposits.
export const bankDepositsLayer = makeEntityData({
  table: "bank_deposits",
  tag: "bankDeposits",
  order: { col: "deposit_date", ascending: false },
  fields: [
    { key: "bankAccountId", col: "bank_account_id", type: "uuid" },
    { key: "depositDate", col: "deposit_date", type: "date" },
    { key: "total", col: "total", type: "number" },
    { key: "itemCount", col: "item_count", type: "number" },
    { key: "status", col: "status", type: "text", default: "Draft" },
    { key: "ledgerEntryId", col: "ledger_entry_id", type: "uuid" },
    { key: "slipNumber", col: "slip_number", type: "text" },
    { key: "source", col: "source", type: "text", default: "manual" },
    { key: "externalId", col: "external_id", type: "text" },
  ],
});
