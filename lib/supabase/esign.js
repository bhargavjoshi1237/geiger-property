import { makeEntityData } from "./entity_factory";

// Data-access layer for E-signature (owns `property.esign_requests`).
export const esignLayer = makeEntityData({
  table: "esign_requests",
  tag: "esign",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "signer", col: "signer", type: "text" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const esignData = esignLayer.data;
