import { makeEntityData } from "./entity_factory";

// Data-access layer for Inventory & Parts — maintenance stock (owns `property.inventory_items`).
// Stock movements (usage on work orders, restocks, adjustments) live in metadata.movements.
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

export const getInventoryItem = (id) => inventoryLayer.get(id);

// Stored status mirrors quantity vs reorder level.
export const stockStatusOf = (quantity, reorderLevel) =>
  quantity <= 0 ? "Out of stock" : quantity <= (Number(reorderLevel) || 0) ? "Low" : "In stock";

// Move stock by `delta` (negative = used) and prepend a movement entry
// ({ type: usage|restock|adjustment, qty, label, date, workOrderId?, workOrderName?, unitCost?, by? }).
// Returns the updated item, or null when the read or a write failed.
export async function adjustInventory(itemId, delta, entry = {}) {
  const item = await inventoryLayer.get(itemId);
  if (!item) return null;
  const quantity = Math.round(((Number(item.quantity) || 0) + (Number(delta) || 0)) * 100) / 100;
  const patch = { quantity, status: stockStatusOf(quantity, item.reorderLevel) };
  if (entry.type === "restock" && Number(entry.unitCost) > 0) patch.unitCost = Number(entry.unitCost);
  const updated = await inventoryLayer.update(itemId, patch);
  if (!updated) return null;
  const movements = Array.isArray(item.metadata?.movements) ? item.metadata.movements : [];
  const row = { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), qty: Number(delta) || 0, ...entry };
  const meta = await inventoryLayer.mergeMeta(itemId, { movements: [row, ...movements].slice(0, 200) });
  if (!meta) return null;
  return { ...updated, movements: meta.movements, metadata: meta };
}
