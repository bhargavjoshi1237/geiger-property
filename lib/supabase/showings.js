import { makeEntityData } from "./entity_factory";

// Data-access layer for Showings — scheduled tours (in-person, self-guided, virtual) (owns `property.showings`).
export const showingsLayer = makeEntityData({
  table: "showings",
  tag: "showings",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "prospectId", col: "prospect_id", type: "uuid" },
    { key: "prospectName", col: "prospect_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "showingDate", col: "showing_date", type: "date" },
    { key: "showingTime", col: "showing_time", type: "text" },
    { key: "showingType", col: "showing_type", type: "text" },
    { key: "agent", col: "agent", type: "text" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const showingsData = showingsLayer.data;
