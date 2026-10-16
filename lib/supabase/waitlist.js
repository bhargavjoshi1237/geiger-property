import { makeEntityData } from "./entity_factory";

// Data-access layer for Waitlist — people waiting for a unit (owns `property.waitlist_entries`).
// Offers and notification history live in metadata.
export const waitlistLayer = makeEntityData({
  table: "waitlist_entries",
  tag: "waitlist",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "prospectId", col: "prospect_id", type: "uuid" },
    { key: "applicationId", col: "application_id", type: "uuid" },
    { key: "unitPreference", col: "unit_preference", type: "text" },
    { key: "desiredBedrooms", col: "desired_bedrooms", type: "number" },
    { key: "budget", col: "budget", type: "number" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "joinedOn", col: "joined_on", type: "date" },
    { key: "position", col: "position", type: "number" },
    { key: "status", col: "status", type: "text", default: "Waiting" },
  ],
});

export const waitlistData = waitlistLayer.data;
