import { makeEntityData } from "./entity_factory";

// Data-access layer for Bills & Payables — vendor bills (owns `property.bills`).
export const billsLayer = makeEntityData({
  table: "bills",
  tag: "bills",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "vendorId", col: "vendor_id", type: "uuid" },
    { key: "vendorName", col: "vendor_name", type: "text" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "billDate", col: "bill_date", type: "date" },
    { key: "dueDate", col: "due_date", type: "date" },
    { key: "amount", col: "amount", type: "number" },
    { key: "amountPaid", col: "amount_paid", type: "number" },
    { key: "account", col: "account", type: "text" },
    { key: "status", col: "status", type: "text", default: "Open" },
  ],
});

export const billsData = billsLayer.data;
