import { makeEntityData } from "./entity_factory";

// Data-access layer for maintenance media (owns `property.maintenance_attachments`).
// Photos, videos, invoices, manuals, and documents; the file is bucket + storage_path (url: legacy). Thin config over the shared entity-data factory.
export const maintenanceAttachmentsLayer = makeEntityData({
  table: "maintenance_attachments",
  tag: "maintenance_attachments",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "category", col: "category", type: "text", default: "Photo" },
    { key: "workOrderLabel", col: "work_order_label", type: "text" },
    { key: "url", col: "url", type: "text" },
    { key: "bucket", col: "bucket", type: "nullable" },
    { key: "storagePath", col: "storage_path", type: "nullable" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const maintenanceAttachmentsData = maintenanceAttachmentsLayer.data;
