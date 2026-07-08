import { makeEntityData } from "./entity_factory";

// Data-access layer for Leasing (owns `property.leases`). Also backs the Lease
// Builder lens (drafts). Thin config over the shared entity-data factory.
export const leasesLayer = makeEntityData({
  table: "leases",
  tag: "leases",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "rent", col: "rent", type: "number" },
    { key: "deposit", col: "deposit", type: "number" },
    { key: "termStart", col: "term_start", type: "date" },
    { key: "termEnd", col: "term_end", type: "date" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const leasesData = leasesLayer.data;
