import { makeEntityData } from "./entity_factory";

// Data-access layer for Security Deposits (owns `property.security_deposits`).
export const securityDepositsLayer = makeEntityData({
  table: "security_deposits",
  tag: "securityDeposits",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "amount", col: "amount", type: "number" },
    { key: "heldLocation", col: "held_location", type: "text" },
    { key: "status", col: "status", type: "text", default: "Held" },
  ],
});

export const securityDepositsData = securityDepositsLayer.data;
