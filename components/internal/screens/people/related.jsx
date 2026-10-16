"use client";

import { ClipboardList, Receipt } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { billsLayer } from "@/lib/supabase/bills";
import { currency, formatDate } from "./shared";

// Related-record tables shared by the People editors (read-only; row click
// opens the record in its own tab).

const nameCell = (title, sub) => (
  <div className="flex flex-col gap-1">
    <span className="font-medium text-foreground">{title}</span>
    {sub ? <span className="text-xs text-text-secondary">{sub}</span> : null}
  </div>
);

export const WORK_ORDER_COLUMNS = [
  { key: "name", header: "Work order", render: (r) => nameCell(r.name || "Work order", [r.propertyLabel, r.category].filter(Boolean).join(" · ")) },
  { key: "priority", header: "Priority", render: (r) => <span className="text-sm text-muted-foreground">{r.priority || "—"}</span> },
  { key: "scheduledDate", header: "Scheduled", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.scheduledDate)}</span> },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
  {
    key: "totalCost",
    header: "Cost",
    align: "right",
    className: "text-right tabular-nums text-foreground",
    render: (r) => (Number(r.totalCost) ? currency(r.totalCost) : "—"),
  },
];

const openCount = (rows) => rows.filter((r) => !["Completed", "Closed", "Cancelled"].includes(r.status)).length;

// Work orders linked by id field (tenantId / vendorId), falling back to the
// denormalized name for rows created before the id link existed.
export function makeWorkOrdersSection({ idKey, nameKey, emptyDescription }) {
  return makeRelatedSection({
    load: async (item) => {
      const rows = (await workOrdersLayer.list()) ?? [];
      return rows.filter((w) => w[idKey] === item.id || (!w[idKey] && item.name && w[nameKey] === item.name));
    },
    columns: WORK_ORDER_COLUMNS,
    tab: "Work Orders",
    plural: "Work orders",
    icon: ClipboardList,
    emptyDescription,
    footer: (rows) => (
      <p className="text-sm text-text-secondary">
        {rows.length} total · {openCount(rows)} open · {currency(rows.reduce((s, r) => s + (Number(r.totalCost) || 0), 0))} spent
      </p>
    ),
  });
}

export const BILL_COLUMNS = [
  { key: "name", header: "Bill", render: (r) => nameCell(r.name || "Bill", [r.propertyName, r.account].filter(Boolean).join(" · ")) },
  { key: "billDate", header: "Billed", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.billDate)}</span> },
  { key: "dueDate", header: "Due", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.dueDate)}</span> },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    className: "text-right font-semibold tabular-nums text-foreground",
    render: (r) => currency(r.amount),
  },
];

export const vendorBillsSection = makeRelatedSection({
  load: async (item) => {
    const rows = (await billsLayer.list()) ?? [];
    return rows.filter((b) => b.vendorId === item.id || (!b.vendorId && item.name && b.vendorName === item.name));
  },
  columns: BILL_COLUMNS,
  tab: "Bills & Payables",
  plural: "Bills",
  icon: Receipt,
  emptyDescription: "Bills entered for this vendor in Bills & Payables show up here.",
  footer: (rows) => {
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const paid = rows.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0);
    return (
      <p className="text-sm text-text-secondary">
        {currency(total)} billed · {currency(paid)} paid · {currency(total - paid)} outstanding
      </p>
    );
  },
});
