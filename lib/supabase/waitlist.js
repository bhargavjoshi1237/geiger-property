import { makeEntityData } from "./entity_factory";

// Data-access layer for Waitlist — people waiting for a unit (owns `property.waitlist_entries`).
export const waitlistLayer = makeEntityData({
  table: "waitlist_entries",
  tag: "waitlist",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitPreference", col: "unit_preference", type: "text" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "position", col: "position", type: "number" },
    { key: "status", col: "status", type: "text", default: "Waiting" },
  ],
});

export const waitlistData = waitlistLayer.data;
