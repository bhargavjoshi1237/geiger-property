import { makeEntityData } from "./entity_factory";

// Data-access layer for Lease Templates (owns `property.lease_templates`). Also
// backs the State-specific Leases lens (scope = "state").
export const leaseTemplatesLayer = makeEntityData({
  table: "lease_templates",
  tag: "leaseTemplates",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "scope", col: "scope", type: "text", default: "generic" },
    { key: "state", col: "state", type: "text" },
    { key: "body", col: "body", type: "text" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const leaseTemplatesData = leaseTemplatesLayer.data;
