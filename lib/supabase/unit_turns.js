import { makeEntityData } from "./entity_factory";

// Data-access layer for Unit Turns — make-ready between occupants (owns `property.unit_turns`).
export const unitTurnsLayer = makeEntityData({
  table: "unit_turns",
  tag: "unitTurns",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "moveOutDate", col: "move_out_date", type: "date" },
    { key: "targetReadyDate", col: "target_ready_date", type: "date" },
    { key: "budget", col: "budget", type: "number" },
    { key: "status", col: "status", type: "text", default: "Not started" },
  ],
});

export const unitTurnsData = unitTurnsLayer.data;
