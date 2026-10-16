import { makeEntityData } from "./entity_factory";

// Data-access layer for Rent Comparables — nearby market rents (owns `property.rent_comps`).
// Rent observations over time are record_items rows (owner_type "comp", kind "observation").
export const rentCompsLayer = makeEntityData({
  table: "rent_comps",
  tag: "rentComps",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "address", col: "address", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "distanceMi", col: "distance_mi", type: "number" },
    { key: "bedrooms", col: "bedrooms", type: "number" },
    { key: "bathrooms", col: "bathrooms", type: "number" },
    { key: "sqft", col: "sqft", type: "number" },
    { key: "rent", col: "rent", type: "number" },
    { key: "source", col: "source", type: "text" },
    { key: "observedDate", col: "observed_date", type: "date" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const rentCompsData = rentCompsLayer.data;
