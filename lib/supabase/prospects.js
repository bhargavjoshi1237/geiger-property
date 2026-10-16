import { makeEntityData } from "./entity_factory";

// Data-access layer for Prospects — leads in the leasing pipeline (owns `property.prospects`).
export const prospectsLayer = makeEntityData({
  table: "prospects",
  tag: "prospects",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "source", col: "source", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "budget", col: "budget", type: "number" },
    { key: "status", col: "status", type: "text", default: "New" },
  ],
});

export const prospectsData = prospectsLayer.data;
