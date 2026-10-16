import { makeEntityData } from "./entity_factory";

// Data-access layer for owner ↔ property ownership (owns `property.property_owners`).
export const propertyOwnersLayer = makeEntityData({
  table: "property_owners",
  tag: "propertyOwners",
  order: { col: "created_at", ascending: true },
  fields: [
    { key: "ownerId", col: "owner_id", type: "uuid" },
    { key: "ownerName", col: "owner_name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "ownershipPct", col: "ownership_pct", type: "number", default: 100 },
    { key: "startsOn", col: "starts_on", type: "date" },
    { key: "endsOn", col: "ends_on", type: "date" },
    { key: "isPrimary", col: "is_primary", type: "bool" },
  ],
});

export const listOwnersOfProperty = (propertyId) => propertyOwnersLayer.list({ propertyId });
export const listPropertiesOfOwner = (ownerId) => propertyOwnersLayer.list({ ownerId });
