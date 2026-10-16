import { makeEntityData } from "./entity_factory";

// Data-access layer for Owners — property owners and their payout terms (owns `property.owners`).
export const ownersLayer = makeEntityData({
  table: "owners",
  tag: "owners",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "company", col: "company", type: "text" },
    { key: "managementFeePct", col: "management_fee_pct", type: "number" },
    { key: "payoutMethod", col: "payout_method", type: "text" },
    { key: "taxIdLast4", col: "tax_id_last4", type: "text" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const ownersData = ownersLayer.data;
