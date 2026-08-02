import { makeEntityData } from "./entity_factory";

// Data-access layer for Rent Collection (owns `property.rent_accounts`). Each
// row is a rent-roll obligation; per-period charges and payments live in the
// metadata bag (charges[]/payments[]), so the balance is derived in the screen.
export const rentAccountsLayer = makeEntityData({
  table: "rent_accounts",
  tag: "rentAccounts",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "rent", col: "rent", type: "number" },
    { key: "dueDay", col: "due_day", type: "number", default: 1 },
    { key: "frequency", col: "frequency", type: "text", default: "Monthly" },
    { key: "autopay", col: "autopay", type: "bool" },
    { key: "paymentMethod", col: "payment_method", type: "text" },
    { key: "status", col: "status", type: "text", default: "Due" },
  ],
});

export const rentAccountsData = rentAccountsLayer.data;
