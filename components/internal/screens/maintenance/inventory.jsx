"use client";

import {
  LayoutDashboard,
  SquarePen,
  Boxes,
  ArrowRightLeft,
  Clock,
  PackageSearch,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { inventoryData, inventoryLayer } from "@/lib/supabase/inventory";
import {
  FieldsForm,
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  STOCK_STATUS_MAP,
  INVENTORY_CATEGORY_OPTIONS,
  stockStatus,
  filterOptions,
  currency,
} from "./shared";

// Inventory & Parts — maintenance stock (owns `property.inventory_items`). Status
// is derived from quantity vs reorder level, never typed.

const valueOf = (r) => (Number(r.quantity) || 0) * (Number(r.unitCost) || 0);

// Re-derive status whenever a stock figure changes.
const withStatus = (item, partial) =>
  "quantity" in partial || "reorderLevel" in partial
    ? { ...partial, status: stockStatus({ ...item, ...partial }) }
    : partial;

const STOCK_FIELDS = [
  { key: "quantity", label: "Quantity on hand", type: "number" },
  { key: "reorderLevel", label: "Reorder level", type: "number", hint: "Marked Low at or below this quantity." },
  { key: "unitCost", label: "Unit cost", type: "number" },
  {
    key: "stockValue",
    label: "Stock value",
    type: "readonly",
    format: (_v, item) => currency(valueOf(item)),
  },
  {
    key: "status",
    label: "Status",
    type: "readonly",
    format: (_v, item) => stockStatus(item),
    hint: "Calculated from quantity and reorder level.",
  },
  { key: "reorderQty", label: "Reorder quantity", type: "number", meta: true },
];

function StockSection({ item, onPatch, onCommit }) {
  return (
    <FieldsForm
      item={item}
      fields={STOCK_FIELDS}
      onPatch={(p) => onPatch(withStatus(item, p))}
      onCommit={(p) => onCommit(withStatus(item, p))}
    />
  );
}

const inventoryConfig = {
  key: "inventory",
  singular: "Item",
  plural: "Items",
  title: "Inventory & Parts",
  description:
    "Parts and supplies on hand for maintenance. Track quantities, reorder levels, and stock value so you restock before you run out.",
  icon: PackageSearch,
  titleField: "name",
  searchFields: ["name", "sku", "category", "location"],
  data: inventoryData,
  // Normalize the stored status to the quantity-derived one.
  rowsLoader: async () =>
    ((await inventoryLayer.list()) ?? []).map((r) => ({ ...r, status: stockStatus(r) })),

  statusMap: STOCK_STATUS_MAP,
  statusFilterOptions: filterOptions(STOCK_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Item",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.sku, r.category].filter(Boolean).join(" · ") || "No SKU"}
          </span>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (r) => <span className="text-sm text-muted-foreground">{r.location || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={stockStatus(r)} map={STOCK_STATUS_MAP} />,
    },
    {
      key: "quantity",
      header: "On hand",
      align: "right",
      className: "text-right tabular-nums",
      render: (r) => (
        <span className="text-sm text-foreground">
          {r.quantity}
          <span className="text-text-tertiary"> / min {r.reorderLevel}</span>
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => currency(valueOf(r)),
    },
  ],

  stats: (rows) => {
    const low = rows.filter((r) => stockStatus(r) === "Low").length;
    const out = rows.filter((r) => stockStatus(r) === "Out of stock").length;
    const value = rows.reduce((s, r) => s + valueOf(r), 0);
    return [
      { label: "Items", value: String(rows.length), footer: "Tracked parts & supplies" },
      { label: "Low stock", value: String(low), footer: "At or below reorder level" },
      { label: "Out of stock", value: String(out), footer: "Reorder now" },
      { label: "Stock value", value: currency(value), footer: "Quantity × unit cost" },
    ];
  },

  createDraft: { name: "", sku: "", category: "", quantity: "", reorderLevel: "", unitCost: "" },
  createFields: [
    { key: "name", label: "Item name", type: "text", placeholder: "e.g. HVAC filter 16x25x1" },
    { key: "sku", label: "SKU", type: "text", placeholder: "Optional" },
    { key: "category", label: "Category", type: "select", options: INVENTORY_CATEGORY_OPTIONS },
    { key: "quantity", label: "Quantity on hand", type: "number", placeholder: "0" },
    { key: "reorderLevel", label: "Reorder level", type: "number", placeholder: "0" },
    { key: "unitCost", label: "Unit cost", type: "number", placeholder: "0" },
  ],
  newRow: (draft) => {
    const row = {
      name: draft.name.trim(),
      sku: draft.sku || "",
      category: draft.category || "",
      quantity: Number(draft.quantity) || 0,
      reorderLevel: Number(draft.reorderLevel) || 0,
      unitCost: Number(draft.unitCost) || 0,
    };
    return { ...row, status: stockStatus(row) };
  },

  headerMeta: (r) =>
    [r.sku, r.location, `${r.quantity} on hand`, currency(valueOf(r))].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Stock level and value at a glance." },
      ],
    },
    {
      group: "Item",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, SKU, category, and storage location." },
        { key: "stock", label: "Stock", icon: Boxes, desc: "Quantity, reorder level, and cost." },
        { key: "movements", label: "Usage & Restocks", icon: ArrowRightLeft, desc: "Log parts used and received — adjust the quantity under Stock." },
      ],
    },
    {
      group: "Records",
      items: [
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "location", label: "Location" },
        { key: "status", label: "Status", format: (_v, item) => stockStatus(item) },
        { key: "quantity", label: "On hand" },
        { key: "reorderLevel", label: "Reorder level" },
        { key: "unitCost", label: "Unit cost", format: (v) => currency(v) },
        { key: "value", label: "Stock value", format: (_v, item) => currency(valueOf(item)) },
        { key: "supplier", label: "Supplier", meta: true },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Item name", type: "text", full: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "category", label: "Category", type: "select", options: INVENTORY_CATEGORY_OPTIONS },
      { key: "location", label: "Storage location", type: "text", placeholder: "e.g. Maple Court · basement" },
      { key: "supplier", label: "Supplier", type: "text", meta: true },
      { key: "supplierPartNo", label: "Supplier part #", type: "text", meta: true },
    ]),
    stock: StockSection,
    movements: makeMetaListSection({
      field: "movements",
      singular: "movement",
      icon: ArrowRightLeft,
      primaryPlaceholder: "e.g. Used on 4B faucet repair",
      secondary: { key: "qty", label: "Qty (+/−)", type: "number", placeholder: "Qty (+/−)" },
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this item…" }),
  },
};

export function InventoryScreen() {
  return <EntityListScreen config={inventoryConfig} />;
}

export default InventoryScreen;
