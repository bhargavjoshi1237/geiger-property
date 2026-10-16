import { makeEntityData } from "./entity_factory";

// Data-access layer for Bank Accounts — operating, trust and reserve accounts (owns `property.bank_accounts`).
export const bankAccountsLayer = makeEntityData({
  table: "bank_accounts",
  tag: "bankAccounts",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "bankName", col: "bank_name", type: "text" },
    { key: "accountType", col: "account_type", type: "text" },
    { key: "last4", col: "last4", type: "text" },
    { key: "balance", col: "balance", type: "number" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const bankAccountsData = bankAccountsLayer.data;
