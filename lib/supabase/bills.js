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
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "workOrderId", col: "work_order_id", type: "uuid" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "jobId", col: "job_id", type: "uuid" },
    { key: "ledgerEntryId", col: "ledger_entry_id", type: "uuid" },
    { key: "approvalStatus", col: "approval_status", type: "text", default: "Not required" },
    { key: "approverName", col: "approver_name", type: "text" },
    { key: "approvedAt", col: "approved_at", type: "date" },
    { key: "status", col: "status", type: "text", default: "Open" },
  ],
});

export const billsData = billsLayer.data;
