"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Receipt, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/sections/factories";
import { billsLayer } from "@/lib/supabase/bills";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { LINE_ITEM_TYPES, formatDate, lineAmount, lineItemTotals, lineItemsOf, money } from "../shared";
import { metaOf } from "./wo_shared";

// Costs (line items rolled up into the cost columns) and Billing (tenant
// chargeback, owner billing, vendor invoice and the linked vendor bills).

const meta = (field) => ({ ...field, meta: true });

// Commit partial for a new line-item list: cost columns + metadata in one write.
export function lineItemsPartial(item, list) {
  const t = lineItemTotals(list);
  return {
    laborCost: t.laborCost,
    materialCost: t.materialCost,
    totalCost: t.totalCost,
    metadata: { ...(item.metadata || {}), lineItems: list, otherCost: t.otherCost, tenantChargeback: t.tenantChargeback },
  };
}

const blankLine = (type = "labor") => ({
  id: crypto.randomUUID(),
  type,
  description: "",
  qty: 1,
  rate: 0,
  markupPct: 0,
  billableToTenant: false,
});

export function CostsSection({ item, onCommit }) {
  const [rows, setRows] = useState(() => lineItemsOf(item));
  const [seed, setSeed] = useState(item.id);
  if (seed !== item.id) {
    setSeed(item.id);
    setRows(lineItemsOf(item));
  }

  const persist = (next) => onCommit(lineItemsPartial(item, next));
  const edit = (id, patch) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  // Commit immediately for discrete controls; text/number inputs commit on blur.
  const editNow = (id, patch) => {
    const next = rows.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setRows(next);
    persist(next);
  };
  const add = (type) => {
    const next = [...rows, blankLine(type)];
    setRows(next);
    persist(next);
  };
  const remove = (id) => {
    const next = rows.filter((x) => x.id !== id);
    setRows(next);
    persist(next);
  };

  const totals = lineItemTotals(rows);
  const nte = Number(metaOf(item, "notToExceed")) || 0;

  return (
    <div className="space-y-4">
      <SectionCard>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Labor", value: totals.laborCost },
            { label: "Materials", value: totals.materialCost },
            { label: "Trip & other", value: totals.otherCost },
            { label: "Total cost", value: totals.totalCost },
            { label: "Tenant chargeback", value: totals.tenantChargeback },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{s.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{money(s.value)}</dd>
            </div>
          ))}
        </dl>
        {nte > 0 && totals.totalCost > nte ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> Over the {money(nte)} not-to-exceed set under Assignment.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Line items"
        description="Quantity × rate plus markup. Totals update the work order's labor, material and total cost."
        action={
          <div className="flex flex-wrap gap-2">
            {LINE_ITEM_TYPES.map((t) => (
              <Button
                key={t.value}
                variant="outline"
                size="sm"
                className="border-border bg-surface-card hover:bg-surface-hover"
                onClick={() => add(t.value)}
              >
                <Plus className="h-3.5 w-3.5" /> {t.label}
              </Button>
            ))}
          </div>
        }
        bodyPadding={false}
      >
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No line items yet" description="Add labor, materials, trip charges or other costs." />
        ) : (
          <div className="divide-y divide-border">
            <div className="hidden gap-2 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary lg:grid lg:grid-cols-[130px_1fr_70px_100px_80px_80px_100px_32px]">
              <span>Type</span>
              <span>Description</span>
              <span>Qty</span>
              <span>Rate</span>
              <span>Markup %</span>
              <span>Tenant</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {rows.map((li) => (
              <div
                key={li.id}
                className="grid grid-cols-2 items-center gap-2 px-5 py-3 lg:grid-cols-[130px_1fr_70px_100px_80px_80px_100px_32px]"
              >
                <Select value={li.type} onValueChange={(v) => editNow(li.id, { type: v })}>
                  <SelectTrigger className="bg-surface-card" aria-label="Line type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINE_ITEM_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={li.description}
                  placeholder="Description"
                  aria-label="Description"
                  className="bg-surface-card"
                  onChange={(e) => edit(li.id, { description: e.target.value })}
                  onBlur={() => persist(rows)}
                />
                <Input
                  type="number"
                  value={li.qty}
                  min={0}
                  step="0.25"
                  aria-label="Quantity"
                  className="bg-surface-card"
                  onChange={(e) => edit(li.id, { qty: e.target.value })}
                  onBlur={() => persist(rows)}
                />
                <Input
                  type="number"
                  value={li.rate}
                  min={0}
                  step="0.01"
                  aria-label="Rate"
                  className="bg-surface-card"
                  onChange={(e) => edit(li.id, { rate: e.target.value })}
                  onBlur={() => persist(rows)}
                />
                <Input
                  type="number"
                  value={li.markupPct}
                  min={0}
                  step="1"
                  aria-label="Markup percent"
                  className="bg-surface-card"
                  onChange={(e) => edit(li.id, { markupPct: e.target.value })}
                  onBlur={() => persist(rows)}
                />
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <Checkbox
                    checked={Boolean(li.billableToTenant)}
                    onCheckedChange={(v) => editNow(li.id, { billableToTenant: Boolean(v) })}
                  />
                  Billable
                </label>
                <span className="text-right text-sm font-medium tabular-nums text-foreground">{money(lineAmount(li))}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(li.id)}
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Billing -----------------------------------------------------------------

const BILLING_FIELDS = [
  { key: "tenant-h", label: "Tenant chargeback", type: "heading", hint: "Line items marked billable roll up here." },
  meta({ key: "chargeTenant", label: "Charge the tenant", type: "switch" }),
  {
    key: "tenantChargeback",
    label: "Billable line items",
    type: "readonly",
    format: (_v, i) => money(i.metadata?.tenantChargeback),
    showIf: (i) => Boolean(i.metadata?.chargeTenant),
  },
  meta({ key: "chargebackOverride", label: "Charge amount (override)", type: "currency", showIf: (i) => Boolean(i.metadata?.chargeTenant) }),
  meta({ key: "chargebackReason", label: "Reason", type: "text", showIf: (i) => Boolean(i.metadata?.chargeTenant) }),
  meta({ key: "chargebackPosted", label: "Posted to tenant ledger", type: "switch", showIf: (i) => Boolean(i.metadata?.chargeTenant) }),
  meta({ key: "chargebackDate", label: "Charge date", type: "date", showIf: (i) => Boolean(i.metadata?.chargeTenant) }),
  { key: "owner-h", label: "Owner billing", type: "heading" },
  meta({ key: "billOwner", label: "Bill to owner", type: "switch" }),
  meta({ key: "ownerMarkupPct", label: "Owner markup", type: "percent", showIf: (i) => Boolean(i.metadata?.billOwner) }),
  meta({ key: "ownerInvoiceNo", label: "Owner invoice #", type: "text", showIf: (i) => Boolean(i.metadata?.billOwner) }),
  { key: "vendor-h", label: "Vendor invoice", type: "heading" },
  meta({ key: "vendorInvoiceNo", label: "Vendor invoice #", type: "text" }),
  meta({ key: "vendorInvoiceDate", label: "Invoice date", type: "date" }),
  meta({ key: "vendorInvoiceAmount", label: "Invoice amount", type: "currency" }),
  meta({
    key: "paymentTerms",
    label: "Payment terms",
    type: "select",
    options: ["Due on receipt", "Net 15", "Net 30", "Net 45"].map((v) => ({ value: v, label: v })),
  }),
];

export function BillingSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const [bills, setBills] = useState(null);
  const { openItemInTab } = useWorkspaceUrl();
  const billCount = (item.metadata?.billIds || []).length;
  useEffect(() => {
    let alive = true;
    billsLayer.list({ workOrderId: item.id }).then((r) => alive && setBills(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id, billCount]);

  return (
    <div className="space-y-4">
      <FieldsForm item={item} fields={BILLING_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      <SectionCard
        title="Vendor bills"
        description="Payables raised from this work order."
        action={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("createBill")}>
            <Plus className="h-4 w-4" /> Create vendor bill
          </Button>
        }
        bodyPadding={false}
      >
        {bills === null ? (
          <ListLoading label="Loading bills" className="py-8" />
        ) : bills.length === 0 ? (
          <EmptyState icon={Receipt} title="No vendor bills yet" description="Create a bill once the vendor invoices this job." />
        ) : (
          <ul className="divide-y divide-border">
            {bills.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
                  onClick={() => openItemInTab(b.id, "Bills & Payables")}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{b.name || "Bill"}</p>
                    <p className="text-xs text-text-secondary">
                      {[b.vendorName, b.dueDate && `Due ${formatDate(b.dueDate)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={b.status === "Paid" ? "success" : "neutral"}>{b.status}</Badge>
                    <span className="text-sm tabular-nums text-foreground">{money(b.amount)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
