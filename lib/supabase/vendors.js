import { makeEntityData } from "./entity_factory";

// Data-access layer for the vendor directory (owns `property.vendors`). Thin
// config over the shared entity-data factory.
export const vendorsLayer = makeEntityData({
  table: "vendors",
  tag: "vendors",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "contactName", col: "contact_name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "specialty", col: "specialty", type: "text" },
    { key: "rating", col: "rating", type: "number" },
    { key: "hourlyRate", col: "hourly_rate", type: "number" },
    { key: "insuranceExpiry", col: "insurance_expiry", type: "date" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const vendorsData = vendorsLayer.data;
