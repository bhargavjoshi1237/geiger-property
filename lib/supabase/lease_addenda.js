import { makeEntityData } from "./entity_factory";

// Data-access layer for Addenda & Documents (owns `property.lease_addenda`).
export const leaseAddendaLayer = makeEntityData({
  table: "lease_addenda",
  tag: "leaseAddenda",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "body", col: "body", type: "text" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const leaseAddendaData = leaseAddendaLayer.data;

export const listLeaseAddenda = (leaseId) => leaseAddendaLayer.list({ leaseId });
