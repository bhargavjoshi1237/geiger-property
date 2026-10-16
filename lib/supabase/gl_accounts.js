import { makeEntityData } from "./entity_factory";

// Data-access layer for Chart of Accounts — general-ledger accounts (owns `property.gl_accounts`).
export const glAccountsLayer = makeEntityData({
  table: "gl_accounts",
  tag: "glAccounts",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "number", col: "number", type: "text" },
    { key: "accountType", col: "account_type", type: "text" },
    { key: "description", col: "description", type: "text" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const glAccountsData = glAccountsLayer.data;
