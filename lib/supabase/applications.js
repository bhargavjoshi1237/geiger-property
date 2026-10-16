import { makeEntityData } from "./entity_factory";

// Data-access layer for Applications — rental applications and screening results (owns `property.applications`).
export const applicationsLayer = makeEntityData({
  table: "applications",
  tag: "applications",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "monthlyIncome", col: "monthly_income", type: "number" },
    { key: "applicationFee", col: "application_fee", type: "number" },
    { key: "feePaid", col: "fee_paid", type: "bool" },
    { key: "prospectId", col: "prospect_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Submitted" },
  ],
});

export const applicationsData = applicationsLayer.data;
