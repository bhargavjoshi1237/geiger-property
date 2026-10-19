"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  Boxes,
  ShoppingCart,
  ArrowRightLeft,
  FolderOpen,
  Clock,
  NotebookPen,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  ClipboardList,
  ExternalLink,
  AlertTriangle,
  Truck,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import { EmptyState, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { FieldsForm, makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { adjustInventory, inventoryData, inventoryLayer } from "@/lib/supabase/inventory";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { vendorOptions, workOrderOptions } from "@/lib/supabase/options";
import {
  STOCK_STATUS_MAP,
  MOVEMENT_TYPE_MAP,
  INVENTORY_CATEGORY_OPTIONS,
  UOM_OPTIONS,
  stockStatus,
  filterOptions,
  currency,
  money,
  formatDate,
  parseDate,
  daysUntil,
  todayString,
} from "./shared";

// Inventory & Parts — maintenance stock (owns `property.inventory_items`). Status
// is derived from quantity vs reorder level; every stock change (work-order
// usage, restocks, counts) is a movement in metadata.movements.

const meta = (field) => ({ ...field, meta: true });
const valueOf = (r) => (Number(r.quantity) || 0) * (Number(r.unitCost) || 0);
const movementsOf = (r) => {
  const v = r?.metadata?.movements ?? r?.movements;
  return Array.isArray(v) ? v : [];
};
const needsReorder = (r) => stockStatus(r) !== "In stock";
const onOrderOf = (r) => Number(r?.metadata?.onOrderQty ?? r?.onOrderQty) || 0;
const suggestedQty = (r) => {
  const max = Number(r?.metadata?.maxLevel) || 0;
  const reorder = Number(r?.metadata?.reorderQty) || 0;
  const qty = Number(r.quantity) || 0;
  return Math.max(reorder || (max ? max - qty : Number(r.reorderLevel) * 2 - qty), 1);
};
const usedSince = (r, days) =>
  movementsOf(r)
    .filter((m) => m.type === "usage" && (daysUntil(m.date) ?? -9999) >= -days)
    .reduce((s, m) => s + Math.abs(Number(m.qty) || 0), 0);

// Re-derive status whenever a stock figure changes.
const withStatus = (item, partial) =>
  "quantity" in partial || "reorderLevel" in partial ? { ...partial, status: stockStatus({ ...item, ...partial }) } : partial;

// --- Overview --------------------------------------------------------------------

function InventoryOverview({ item, runAction }) {
  const status = stockStatus(item);
  const used30 = usedSince(item, 30);
  const recent = movementsOf(item).slice(0, 5);
  return (
    <div className="space-y-5">
      <StatsBar
        stats={[
          { label: "On hand", value: String(Number(item.quantity) || 0), footer: `${item.metadata?.uom || "Each"} · min ${Number(item.reorderLevel) || 0}` },
          { label: "Stock value", value: currency(valueOf(item)), footer: `${money(item.unitCost)} each` },
          { label: "Used (30 days)", value: String(used30), footer: "On work orders" },
          { label: "On order", value: String(onOrderOf(item)), footer: item.metadata?.expectedOn ? `Expected ${formatDate(item.metadata.expectedOn)}` : "Nothing pending" },
        ]}
      />
      {status !== "In stock" ? (
        <SectionCard
          title={status === "Out of stock" ? "Out of stock" : "Below reorder level"}
          description={`Suggested order: ${suggestedQty(item)} ${item.metadata?.uom || "units"}${item.metadata?.supplier ? ` from ${item.metadata.supplier}` : ""}.`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("ordered")}>
                <Truck className="h-4 w-4" /> Mark Ordered
              </Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("restock")}>
                <PackagePlus className="h-4 w-4" /> Record Restock
              </Button>
            </div>
          }
        >
          <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> {Number(item.quantity) || 0} on hand, reorder at {Number(item.reorderLevel) || 0}.
          </p>
        </SectionCard>
      ) : null}
      <SectionCard title="Recent movements" bodyPadding={false}>
        {recent.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-secondary">No usage or restocks recorded yet.</p>
        ) : (
          <MovementList rows={recent} />
        )}
      </SectionCard>
    </div>
  );
}

function MovementList({ rows }) {
  const { openItemInTab } = useWorkspaceUrl();
  return (
    <ul className="divide-y divide-border">
      {rows.map((m) => {
        const t = MOVEMENT_TYPE_MAP[m.type] || MOVEMENT_TYPE_MAP.adjustment;
        const qty = Number(m.qty) || 0;
        return (
          <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={t.variant}>{t.label}</Badge>
                {m.workOrderId ? (
                  <button
                    type="button"
                    className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-foreground hover:underline"
                    onClick={() => openItemInTab(m.workOrderId, "Work Orders")}
                  >
                    {m.workOrderName || m.label || "Work order"}
                    <ExternalLink className="h-3 w-3 shrink-0 text-text-secondary" />
                  </button>
                ) : (
                  <span className="truncate text-sm text-foreground">{m.label || "—"}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {[formatDate(m.date), m.by, m.reference].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span
              className={
                qty < 0
                  ? "shrink-0 text-sm font-medium tabular-nums text-red-600 dark:text-red-400"
                  : "shrink-0 text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
              }
            >
              {qty > 0 ? `+${qty}` : qty}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// --- Stock / purchasing / usage ------------------------------------------------------

const STOCK_FIELDS = [
  { key: "quantity", label: "Quantity on hand", type: "number", hint: "Use Adjust count to record a cycle count with history." },
  { key: "reorderLevel", label: "Reorder level", type: "number", hint: "Marked Low at or below this quantity." },
  { key: "unitCost", label: "Unit cost", type: "currency" },
  { key: "stockValue", label: "Stock value", type: "readonly", format: (_v, item) => currency(valueOf(item)) },
  { key: "status", label: "Status", type: "readonly", format: (_v, item) => stockStatus(item), hint: "Calculated from quantity and reorder level." },
  meta({ key: "uom", label: "Unit of measure", type: "select", options: UOM_OPTIONS }),
  meta({ key: "reorderQty", label: "Reorder quantity", type: "number", min: 0 }),
  meta({ key: "maxLevel", label: "Maximum stock", type: "number", min: 0 }),
  meta({ key: "binLocation", label: "Bin / shelf", type: "text" }),
  meta({ key: "lastCountedOn", label: "Last counted", type: "date" }),
];

function StockSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <FieldsForm
      item={item}
      fields={STOCK_FIELDS}
      onPatch={(p) => onPatch(withStatus(item, p))}
      onCommit={(p) => onCommit(withStatus(item, p))}
      onCommitMeta={onCommitMeta}
    />
  );
}

const PURCHASING_FIELDS = [
  { key: "preferredVendorId", label: "Preferred vendor", type: "relation", load: vendorOptions, displayKey: "preferredVendorName" },
  meta({ key: "supplier", label: "Supplier", type: "text", placeholder: "e.g. HD Supply" }),
  meta({ key: "supplierPartNo", label: "Supplier part #", type: "text" }),
  meta({ key: "supplierUrl", label: "Reorder link", type: "url" }),
  meta({ key: "leadTimeDays", label: "Lead time (days)", type: "number", min: 0 }),
  meta({ key: "lastPrice", label: "Last price paid", type: "currency" }),
  { key: "order-h", label: "Open order", type: "heading" },
  meta({ key: "onOrderQty", label: "Quantity on order", type: "number", min: 0 }),
  meta({ key: "lastOrderedOn", label: "Ordered on", type: "date" }),
  meta({ key: "expectedOn", label: "Expected", type: "date" }),
  meta({ key: "poNumber", label: "PO number", type: "text" }),
  meta({ key: "purchaseNotes", label: "Purchase notes", type: "textarea" }),
];

// The preferred-vendor relation lives in metadata, so fold its write into the bag.
function PurchasingSection({ item, onPatch, onCommit, onCommitMeta }) {
  const commit = (partial) => {
    if ("preferredVendorId" in partial) {
      return onCommitMeta({ preferredVendorId: partial.preferredVendorId || "", preferredVendorName: partial.vendorName || "" });
    }
    return onCommit(partial);
  };
  const view = { ...item, preferredVendorId: item.metadata?.preferredVendorId || "", preferredVendorName: item.metadata?.preferredVendorName || "" };
  return <FieldsForm item={view} fields={PURCHASING_FIELDS} onPatch={onPatch} onCommit={commit} onCommitMeta={onCommitMeta} />;
}

function UsageSection({ item, runAction }) {
  const rows = movementsOf(item);
  const byWo = useMemo(() => {
    const map = new Map();
    for (const m of rows) {
      if (m.type !== "usage" || !m.workOrderId) continue;
      const cur = map.get(m.workOrderId) || { id: m.workOrderId, name: m.workOrderName || m.label, qty: 0 };
      cur.qty += Math.abs(Number(m.qty) || 0);
      map.set(m.workOrderId, cur);
    }
    return [...map.values()];
  }, [rows]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {byWo.length} work order{byWo.length === 1 ? "" : "s"} · {usedSince(item, 30)} used in the last 30 days
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("count")}>
            <ClipboardList className="h-4 w-4" /> Adjust Count
          </Button>
          <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("use")}>
            <PackageMinus className="h-4 w-4" /> Record Usage
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("restock")}>
            <PackagePlus className="h-4 w-4" /> Restock
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={ArrowRightLeft} title="No movements yet" description="Parts used on work orders and restocks are logged here." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          <MovementList rows={rows} />
        </div>
      )}
    </div>
  );
}

// --- Actions (all stock changes go through adjustInventory) --------------------------

async function applyMovement(ctx, delta, entry, success) {
  const res = await adjustInventory(ctx.item.id, delta, entry);
  if (!res) {
    toast.error("Couldn't update stock.");
    return false;
  }
  toast.success(success);
  ctx.reload();
  return true;
}

const inventoryActions = [
  {
    key: "restock",
    label: "Record restock",
    icon: PackagePlus,
    wizard: {
      title: "Record restock",
      finishLabel: "Add to Stock",
      logSummary: "Recorded restock",
      initial: (i) => ({
        qty: i.metadata?.onOrderQty || suggestedQty(i),
        unitCost: Number(i.unitCost) || "",
        reference: i.metadata?.poNumber || "",
        note: "",
      }),
      steps: [
        {
          key: "restock",
          title: "Received",
          fields: [
            { key: "qty", label: "Quantity received", type: "number", min: 0, required: true },
            { key: "unitCost", label: "Unit cost", type: "currency", hint: "Updates the item's unit cost." },
            { key: "reference", label: "PO / receipt #", type: "text" },
            { key: "note", label: "Note", type: "textarea" },
          ],
          validate: (v) => (Number(v.qty) > 0 ? null : "Enter a quantity above zero."),
        },
      ],
      finish: async (v, ctx) => {
        const qty = Number(v.qty);
        const ok = await applyMovement(
          ctx,
          qty,
          { type: "restock", label: v.note || "Restock", reference: v.reference || "", unitCost: Number(v.unitCost) || 0 },
          `Added ${qty} to stock.`,
        );
        if (ok) {
          const onOrder = Math.max(0, onOrderOf(ctx.item) - qty);
          await ctx.commitMeta({ onOrderQty: onOrder, lastReceivedOn: todayString(), ...(Number(v.unitCost) ? { lastPrice: Number(v.unitCost) } : {}) });
        }
        return ok;
      },
    },
  },
  {
    key: "use",
    label: "Record usage",
    icon: PackageMinus,
    wizard: {
      title: "Record usage",
      description: "Deducts stock and logs the part on the work order's Materials Used.",
      finishLabel: "Deduct",
      logSummary: "Recorded usage",
      initial: () => ({ qty: 1, workOrderId: "", workOrderLabel: "", note: "" }),
      steps: [
        {
          key: "use",
          title: "Usage",
          fields: [
            { key: "qty", label: "Quantity used", type: "number", min: 0, required: true },
            { key: "workOrderId", label: "Work order", type: "relation", load: workOrderOptions, displayKey: "workOrderLabel" },
            { key: "note", label: "Note", type: "textarea" },
          ],
          validate: (v) => (Number(v.qty) > 0 ? null : "Enter a quantity above zero."),
        },
      ],
      finish: async (v, ctx) => {
        const item = ctx.item;
        const qty = Number(v.qty);
        const ok = await applyMovement(
          ctx,
          -qty,
          {
            type: "usage",
            label: v.note || v.workOrderLabel || "Used",
            workOrderId: v.workOrderId || "",
            workOrderName: v.workOrderLabel || "",
            unitCost: Number(item.unitCost) || 0,
          },
          `Deducted ${qty} from stock.`,
        );
        // Mirror it onto the work order so its Materials Used shows the part.
        if (ok && v.workOrderId) {
          const wo = await workOrdersLayer.get(v.workOrderId);
          if (wo) {
            const list = Array.isArray(wo.metadata?.materialsUsed) ? wo.metadata.materialsUsed : [];
            await workOrdersLayer.mergeMeta(v.workOrderId, {
              materialsUsed: [
                ...list,
                {
                  id: crypto.randomUUID(),
                  itemId: item.id,
                  name: item.name,
                  sku: item.sku || "",
                  qty,
                  unitCost: Number(item.unitCost) || 0,
                  deducted: true,
                  deductedAt: new Date().toISOString(),
                },
              ],
            });
          }
        }
        return ok;
      },
    },
  },
  {
    key: "count",
    label: "Adjust count",
    icon: ClipboardList,
    wizard: {
      title: "Adjust count",
      description: "Enter what's physically on the shelf; the difference is logged as an adjustment.",
      finishLabel: "Save Count",
      logSummary: "Adjusted stock count",
      initial: (i) => ({ counted: Number(i.quantity) || 0, note: "Cycle count" }),
      steps: [
        {
          key: "count",
          title: "Count",
          fields: [
            { key: "counted", label: "Counted quantity", type: "number", min: 0, required: true },
            { key: "note", label: "Note", type: "text" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const delta = (Number(v.counted) || 0) - (Number(ctx.item.quantity) || 0);
        if (!delta) {
          await ctx.commitMeta({ lastCountedOn: todayString() });
          toast.success("Count matches — nothing to adjust.");
          return true;
        }
        const ok = await applyMovement(ctx, delta, { type: "adjustment", label: v.note || "Cycle count" }, `Stock adjusted by ${delta > 0 ? "+" : ""}${delta}.`);
        if (ok) await ctx.commitMeta({ lastCountedOn: todayString() });
        return ok;
      },
    },
  },
  {
    key: "ordered",
    label: "Mark ordered",
    icon: Truck,
    separatorBefore: true,
    wizard: {
      title: "Mark ordered",
      finishLabel: "Save Order",
      logSummary: "Placed reorder",
      initial: (i) => ({
        qty: suggestedQty(i),
        expectedOn: "",
        poNumber: i.metadata?.poNumber || "",
        notes: i.metadata?.purchaseNotes || "",
      }),
      steps: [
        {
          key: "order",
          title: "Order",
          fields: [
            { key: "qty", label: "Quantity ordered", type: "number", min: 0, required: true },
            { key: "expectedOn", label: "Expected", type: "date" },
            { key: "poNumber", label: "PO number", type: "text" },
            { key: "notes", label: "Purchase notes", type: "textarea" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const ok = await ctx.commitMeta({
          onOrderQty: onOrderOf(ctx.item) + (Number(v.qty) || 0),
          lastOrderedOn: todayString(),
          lastOrderQty: Number(v.qty) || 0,
          expectedOn: v.expectedOn || "",
          poNumber: v.poNumber || "",
          purchaseNotes: v.notes || "",
        });
        if (ok) toast.success("Order recorded.");
        return ok;
      },
    },
  },
];

// --- List header: reorder list ----------------------------------------------------------

function ReorderList({ rows }) {
  const [open, setOpen] = useState(false);
  const { openItem } = useWorkspaceUrl();
  const list = rows.filter(needsReorder);
  return (
    <>
      <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => setOpen(true)}>
        <ShoppingCart className="h-4 w-4" /> Reorder List ({list.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reorder list</DialogTitle>
            <DialogDescription>Parts at or below their reorder level, with a suggested order quantity.</DialogDescription>
          </DialogHeader>
          {list.length === 0 ? (
            <p className="text-sm text-text-secondary">Everything is above its reorder level.</p>
          ) : (
            <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface-subtle">
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                    onClick={() => {
                      setOpen(false);
                      openItem(r.id);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                      <p className="text-xs text-text-secondary">
                        {[r.metadata?.supplier, `${Number(r.quantity) || 0} on hand`, onOrderOf(r) ? `${onOrderOf(r)} on order` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium tabular-nums text-foreground">Order {suggestedQty(r)}</p>
                      <p className="text-xs tabular-nums text-text-tertiary">{money(suggestedQty(r) * (Number(r.unitCost) || 0))}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const usedThisMonthValue = (rows) => {
  const now = new Date();
  let total = 0;
  for (const r of rows) {
    for (const m of movementsOf(r)) {
      const d = parseDate(m.date);
      if (m.type !== "usage" || !d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      total += Math.abs(Number(m.qty) || 0) * (Number(m.unitCost ?? r.unitCost) || 0);
    }
  }
  return total;
};

const inventoryConfig = {
  key: "inventory",
  singular: "Item",
  plural: "Items",
  title: "Inventory & Parts",
  description:
    "Parts and supplies on hand for maintenance. Track stock, reorder before you run out, and see which work orders used what.",
  icon: PackageSearch,
  titleField: "name",
  searchFields: ["name", "sku", "category", "location", "supplier"],
  data: inventoryData,
  // Normalize the stored status to the quantity-derived one.
  rowsLoader: async () => {
    const rows = await inventoryLayer.list();
    return rows ? rows.map((r) => ({ ...r, status: stockStatus(r) })) : null;
  },

  statusMap: STOCK_STATUS_MAP,
  statusFilterOptions: filterOptions(STOCK_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    { value: "reorder", label: "Needs reorder", filter: needsReorder },
    { value: "ordered", label: "On order", filter: (r) => onOrderOf(r) > 0 },
  ],

  headerActions: ({ rows }) => <ReorderList rows={rows} />,

  columns: [
    {
      key: "name",
      header: "Item",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.sku, r.category].filter(Boolean).join(" · ") || "No SKU"}</span>
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
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={stockStatus(r)} map={STOCK_STATUS_MAP} />
          {onOrderOf(r) ? <Badge variant="info">{onOrderOf(r)} on order</Badge> : null}
        </div>
      ),
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
      { label: "Needs reorder", value: String(low + out), footer: `${out} out of stock` },
      { label: "Stock value", value: currency(value), footer: "Quantity × unit cost" },
      { label: "Used this month", value: currency(usedThisMonthValue(rows)), footer: "Parts used on work orders" },
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
    return { ...row, status: stockStatus(row), metadata: { uom: "Each" } };
  },

  headerMeta: (r) => [r.sku, r.location, `${r.quantity} on hand`, currency(valueOf(r))].filter(Boolean).join(" · "),

  actions: inventoryActions,

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Stock, value, usage and reorder alerts." }],
    },
    {
      group: "Item",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, SKU, category and storage location." },
        { key: "stock", label: "Stock", icon: Boxes, desc: "Quantity, reorder level and cost." },
        { key: "purchasing", label: "Purchasing", icon: ShoppingCart, desc: "Supplier, lead time and open orders." },
        { key: "usage", label: "Usage History", icon: ArrowRightLeft, desc: "Work-order usage, restocks and counts." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FolderOpen, desc: "Spec sheets, SDS and receipts." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this item." },
        { key: "notes", label: "Notes", icon: NotebookPen, desc: "Internal notes." },
      ],
    },
  ],
  sections: {
    overview: InventoryOverview,
    details: makeFieldsSection([
      { key: "name", label: "Item name", type: "text", full: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "category", label: "Category", type: "select", options: INVENTORY_CATEGORY_OPTIONS },
      { key: "location", label: "Storage location", type: "text", placeholder: "e.g. Maple Court · basement" },
      meta({ key: "barcode", label: "Barcode", type: "text" }),
      meta({ key: "manufacturer", label: "Manufacturer", type: "text" }),
      meta({ key: "compatibleWith", label: "Compatible with", type: "text", placeholder: "e.g. Carrier 58STA furnaces" }),
      meta({ key: "hazardous", label: "Hazardous material", type: "switch" }),
      meta({ key: "description", label: "Description", type: "textarea" }),
    ]),
    stock: StockSection,
    purchasing: PurchasingSection,
    usage: UsageSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this item…" }),
  },
};

export function InventoryScreen() {
  return <EntityListScreen config={inventoryConfig} />;
}

export default InventoryScreen;
