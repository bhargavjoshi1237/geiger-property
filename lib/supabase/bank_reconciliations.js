import { makeEntityData } from "./entity_factory";

// Data-access layer for Bank Reconciliations (owns `property.bank_reconciliations`):
// a statement date + ending balance per bank account; cleared ledger lines point
// back here through ledger_lines.reconciliation_id once finalized.
export const bankReconciliationsLayer = makeEntityData({
  table: "bank_reconciliations",
  tag: "bankReconciliations",
  order: { col: "statement_date", ascending: false },
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "bankAccountId", col: "bank_account_id", type: "uuid" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "statementDate", col: "statement_date", type: "date" },
    { key: "statementBalance", col: "statement_balance", type: "number" },
    { key: "clearedBalance", col: "cleared_balance", type: "number" },
    { key: "difference", col: "difference", type: "number" },
    { key: "finalizedAt", col: "finalized_at", type: "date" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const bankReconciliationsData = bankReconciliationsLayer.data;
