import { makeEntityData } from "./entity_factory";

// Data-access layer for community events shown on the Amenities calendar
// (owns `property.resident_events`). startsAt/endsAt are ISO timestamps.
export const residentEventsLayer = makeEntityData({
  table: "resident_events",
  tag: "residentEvents",
  order: { col: "starts_at", ascending: true },
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "amenityId", col: "amenity_id", type: "uuid" },
    { key: "amenityName", col: "amenity_name", type: "text" },
    { key: "startsAt", col: "starts_at", type: "date" },
    { key: "endsAt", col: "ends_at", type: "date" },
    { key: "location", col: "location", type: "text" },
    { key: "description", col: "description", type: "text" },
    { key: "capacity", col: "capacity", type: "number" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const residentEventsData = residentEventsLayer.data;
export const listResidentEvents = () => residentEventsLayer.list();
