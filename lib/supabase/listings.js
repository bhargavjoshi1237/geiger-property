import { makeEntityData } from "./entity_factory";

// Data-access layer for Listings — vacancy marketing listings (owns `property.listings`).
export const listingsLayer = makeEntityData({
  table: "listings",
  tag: "listings",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "rent", col: "rent", type: "number" },
    { key: "availableDate", col: "available_date", type: "date" },
    { key: "bedrooms", col: "bedrooms", type: "number" },
    { key: "bathrooms", col: "bathrooms", type: "number" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const listingsData = listingsLayer.data;
