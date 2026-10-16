import { makeEntityData } from "./entity_factory";

// Data-access layer for Showings — scheduled tours (in-person, self-guided, virtual) (owns `property.showings`).
// Access codes, interest level and outcome live in metadata.
export const showingsLayer = makeEntityData({
  table: "showings",
  tag: "showings",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "prospectId", col: "prospect_id", type: "uuid" },
    { key: "prospectName", col: "prospect_name", type: "text" },
    { key: "prospectContact", col: "prospect_contact", type: "text" },
    { key: "listingId", col: "listing_id", type: "uuid" },
    { key: "listingName", col: "listing_name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "showingDate", col: "showing_date", type: "date" },
    { key: "showingTime", col: "showing_time", type: "text" },
    { key: "durationMinutes", col: "duration_minutes", type: "number", default: 30 },
    { key: "showingType", col: "showing_type", type: "text", default: "In-person" },
    { key: "agent", col: "agent", type: "text" },
    { key: "feedback", col: "feedback", type: "text" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const showingsData = showingsLayer.data;

export const listShowingsForProspect = (prospectId) =>
  prospectId ? showingsLayer.list({ prospectId }) : Promise.resolve([]);
export const listShowingsForListing = (listingId) =>
  listingId ? showingsLayer.list({ listingId }) : Promise.resolve([]);
