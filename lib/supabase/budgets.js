import { makeEntityData } from "./entity_factory";

// Data-access layer for Budgets — annual budgets per property (owns `property.budgets`).
export const budgetsLayer = makeEntityData({
  table: "budgets",
  tag: "budgets",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "year", col: "year", type: "number" },
    { key: "totalIncome", col: "total_income", type: "number" },
    { key: "totalExpense", col: "total_expense", type: "number" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const budgetsData = budgetsLayer.data;
