import { makeEntityData } from "./entity_factory";

// Data-access layer for Prospects — leads in the leasing pipeline (owns `property.prospects`).
// Stage history, preferences, unit hold and lost reason live in metadata.
export const prospectsLayer = makeEntityData({
  table: "prospects",
  tag: "prospects",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "source", col: "source", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "listingId", col: "listing_id", type: "uuid" },
    { key: "listingName", col: "listing_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "budget", col: "budget", type: "number" },
    { key: "status", col: "status", type: "text", default: "New" },
  ],
});

export const prospectsData = prospectsLayer.data;

export const listProspectsForListing = (listingId) =>
  listingId ? prospectsLayer.list({ listingId }) : Promise.resolve([]);
