import { makeEntityData } from "./entity_factory";

// Data-access layer for generic repeater rows (owns `property.record_items`):
// pets, vehicles, emergency contacts, keys, meters, assets, insurance policies…
// keyed by (ownerType, ownerId, kind); kind-specific fields live in metadata.
export const recordItemsLayer = makeEntityData({
  table: "record_items",
  tag: "recordItems",
  order: { col: "sort", ascending: true },
  fields: [
    { key: "ownerType", col: "owner_type", type: "text" },
    { key: "ownerId", col: "owner_id", type: "uuid" },
    { key: "kind", col: "kind", type: "text" },
    { key: "name", col: "name", type: "text" },
    { key: "status", col: "status", type: "text" },
    { key: "startsOn", col: "starts_on", type: "date" },
    { key: "endsOn", col: "ends_on", type: "date" },
    { key: "amount", col: "amount", type: "number" },
    { key: "sort", col: "sort", type: "number" },
  ],
});

export const listRecordItems = (ownerType, ownerId, kind) =>
  recordItemsLayer.list({ ownerType, ownerId, ...(kind ? { kind } : {}) });

// All rows of one kind across owners (e.g. every expiring insurance policy).
export const listRecordItemsByKind = (kind) => recordItemsLayer.list({ kind });
