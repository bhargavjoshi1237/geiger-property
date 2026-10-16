import { makeEntityData } from "./entity_factory";

// Data-access layer for Applications — rental applications, internal screening and
// decisions (owns `property.applications`). Co-applicants, fees, references and
// rental history are record_items rows (owner_type "application").
export const applicationsLayer = makeEntityData({
  table: "applications",
  tag: "applications",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_label", type: "text" },
    { key: "listingId", col: "listing_id", type: "uuid" },
    { key: "listingName", col: "listing_name", type: "text" },
    { key: "prospectId", col: "prospect_id", type: "uuid" },
    { key: "source", col: "source", type: "text" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "monthlyIncome", col: "monthly_income", type: "number" },
    { key: "occupants", col: "occupants", type: "number", default: 1 },
    { key: "applicationFee", col: "application_fee", type: "number" },
    { key: "feePaid", col: "fee_paid", type: "bool" },
    { key: "decision", col: "decision", type: "text" },
    { key: "score", col: "score", type: "number" },
    { key: "appliedOn", col: "applied_on", type: "date" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Submitted" },
  ],
});

export const applicationsData = applicationsLayer.data;

export const listApplicationsForProspect = (prospectId) =>
  prospectId ? applicationsLayer.list({ prospectId }) : Promise.resolve([]);
export const listApplicationsForListing = (listingId) =>
  listingId ? applicationsLayer.list({ listingId }) : Promise.resolve([]);
