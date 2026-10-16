import { makeEntityData } from "./entity_factory";

// Data-access layer for monthly budget amounts (owns `property.budget_lines`):
// one row per budget × GL account × month.
export const budgetLinesLayer = makeEntityData({
  table: "budget_lines",
  tag: "budgetLines",
  order: { col: "month", ascending: true },
  fields: [
    { key: "budgetId", col: "budget_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "accountLabel", col: "account_label", type: "text" },
    { key: "year", col: "year", type: "number" },
    { key: "month", col: "month", type: "number", default: 1 },
    { key: "amount", col: "amount", type: "number" },
  ],
});

export const listBudgetLines = (budgetId) => budgetLinesLayer.list({ budgetId });
