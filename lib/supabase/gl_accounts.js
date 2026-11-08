import { makeEntityData } from "./entity_factory";
import { isBillGlAccount } from "@/lib/accounting/bills";

// Data-access layer for Chart of Accounts — general-ledger accounts (owns `property.gl_accounts`).
// subtype drives the sub-ledgers (cash, receivable, payable, deposits…), isTrust
// separates trust funds from operating, systemKey marks the default-chart accounts.
export const glAccountsLayer = makeEntityData({
  table: "gl_accounts",
  tag: "glAccounts",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "number", col: "number", type: "text" },
    { key: "accountType", col: "account_type", type: "text" },
    { key: "subtype", col: "subtype", type: "text" },
    { key: "isTrust", col: "is_trust", type: "bool" },
    { key: "isSystem", col: "is_system", type: "bool" },
    { key: "systemKey", col: "system_key", type: "text" },
    { key: "parentId", col: "parent_id", type: "uuid" },
    { key: "description", col: "description", type: "text" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const glAccountsData = glAccountsLayer.data;

const labelOf = (a) => (a.number ? `${a.number} · ${a.name}` : a.name);
const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true });

// Relation-picker options keyed by GL account id; the patch keeps the legacy
// `account` label column in sync. Narrow with { types: ["Income"], subtypes: ["cash"] }.
export async function glAccountIdOptions({ types, subtypes, accept } = {}) {
  const rows = (await glAccountsLayer.list()) ?? [];
  return rows
    .filter((a) => a.status !== "Inactive")
    .filter((a) => !types || types.includes(a.accountType))
    .filter((a) => !subtypes || subtypes.includes(a.subtype))
    .filter((a) => !accept || accept(a))
    .sort(byNumber)
    .map((a) => ({ value: a.id, label: labelOf(a), patch: { account: labelOf(a) } }));
}

export const incomeAccountOptions = () => glAccountIdOptions({ types: ["Income"] });
// Accounts a recurring charge may credit: income, or a liability / expense for pass-throughs (CORE-03).
export const chargeAccountOptions = () => glAccountIdOptions({ types: ["Income", "Liability", "Expense"] });
export const expenseAccountOptions = () => glAccountIdOptions({ accept: isBillGlAccount });
export const cashAccountOptions = () => glAccountIdOptions({ subtypes: ["cash"] });
