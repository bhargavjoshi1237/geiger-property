import { makeEntityData } from "./entity_factory";

// Data-access layer for Moves (owns `property.moves`). Backs both the Move-in
// (kind = "in") and Move-out (kind = "out") lenses.
export const movesLayer = makeEntityData({
  table: "moves",
  tag: "moves",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "kind", col: "kind", type: "text", default: "in" },
    { key: "moveDate", col: "move_date", type: "date" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const movesData = movesLayer.data;
