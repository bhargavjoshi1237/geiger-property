import { makeEntityData } from "./entity_factory";

// Data-access layer for Inventory & Parts — maintenance stock (owns `property.inventory_items`).
export const inventoryLayer = makeEntityData({
  table: "inventory_items",
  tag: "inventory",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "sku", col: "sku", type: "text" },
    { key: "category", col: "category", type: "text" },
    { key: "location", col: "location", type: "text" },
    { key: "quantity", col: "quantity", type: "number" },
    { key: "reorderLevel", col: "reorder_level", type: "number" },
    { key: "unitCost", col: "unit_cost", type: "number" },
    { key: "status", col: "status", type: "text", default: "In stock" },
  ],
});

export const inventoryData = inventoryLayer.data;
