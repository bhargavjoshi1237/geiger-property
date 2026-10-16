"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  MinusCircle,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import {
  FieldsForm,
  makeMetaListSection,
  makeUploadSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { adjustInventory, inventoryLayer } from "@/lib/supabase/inventory";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { pmSchedulesLayer } from "@/lib/supabase/pm_schedules";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { listWorkOrdersForProperty, listWorkOrdersForUnit } from "@/lib/supabase/work_orders";
import {
  CLOSED_WORK_STATUSES,
  CONTACT_METHOD_OPTIONS,
  MAINTENANCE_STATUS_MAP,
  ROOT_CAUSE_OPTIONS,
  formatDate,
  formatDateTime,
  lineItemsOf,
  money,
} from "../shared";
import { lineItemsPartial } from "./wo_costs";
import { listMeta } from "./wo_shared";

const meta = (field) => ({ ...field, meta: true });

// --- Materials used (inventory-linked) ---------------------------------------

// Deduct every not-yet-deducted material from stock; returns the updated list.
export async function deductMaterials(item, list) {
  const out = [];
  let failed = 0;
  for (const row of list) {
    if (row.deducted || !row.itemId) {
      out.push(row);
      continue;
    }
    const res = await adjustInventory(row.itemId, -(Number(row.qty) || 0), {
      type: "usage",
      label: item.name,
      workOrderId: item.id,
      workOrderName: item.name,
      unitCost: Number(row.unitCost) || 0,
    });
    if (res) out.push({ ...row, deducted: true, deductedAt: new Date().toISOString() });
    else {
      failed += 1;
      out.push(row);
    }
  }
  return { list: out, failed };
}

export function MaterialsSection({ item, onCommit, onCommitMeta }) {
  const [stock, setStock] = useState(null);
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(null);
  const list = listMeta(item, "materialsUsed");

  useEffect(() => {
    let alive = true;
    inventoryLayer.list().then((r) => alive && setStock(r ?? []));
    return () => {
      alive = false;
    };
  }, []);

  const add = () => {
    const part = stock?.find((s) => s.id === pick);
    if (!part) {
      toast.error("Pick a part from inventory.");
      return;
    }
    const row = {
      id: crypto.randomUUID(),
      itemId: part.id,
      name: part.name,
      sku: part.sku || "",
      qty: Number(qty) || 1,
      unitCost: Number(part.unitCost) || 0,
      deducted: false,
    };
    onCommitMeta({ materialsUsed: [...list, row] });
    setPick("");
    setQty("1");
  };

  const deduct = async (row) => {
    setBusy(row.id);
    const res = await deductMaterials(item, [row]);
    setBusy(null);
    if (res.failed) {
      toast.error(`Couldn't update stock for ${row.name}.`);
      return;
    }
    await onCommitMeta({ materialsUsed: list.map((x) => (x.id === row.id ? res.list[0] : x)) });
    setStock((s) => s?.map((x) => (x.id === row.itemId ? { ...x, quantity: (Number(x.quantity) || 0) - row.qty } : x)));
    toast.success(`Deducted ${row.qty} × ${row.name} from stock.`);
  };

  const remove = async (row) => {
    if (row.deducted) {
      const back = await adjustInventory(row.itemId, Number(row.qty) || 0, {
        type: "adjustment",
        label: `Returned from ${item.name}`,
        workOrderId: item.id,
        workOrderName: item.name,
      });
      if (!back) {
        toast.error("Couldn't return the part to stock.");
        return;
      }
      toast.success(`Returned ${row.qty} × ${row.name} to stock.`);
    }
    onCommitMeta({ materialsUsed: list.filter((x) => x.id !== row.id) });
  };

  // Append the part as a material cost line (and remember it was costed).
  const addToCosts = (row) => {
    const line = {
      id: crypto.randomUUID(),
      type: "material",
      description: row.name,
      qty: row.qty,
      rate: row.unitCost,
      markupPct: 0,
      billableToTenant: false,
    };
    const partial = lineItemsPartial(item, [...lineItemsOf(item), line]);
    partial.metadata.materialsUsed = list.map((x) => (x.id === row.id ? { ...x, costed: true } : x));
    onCommit(partial).then((ok) => ok && toast.success(`Added "${row.name}" to costs.`));
  };

  const total = list.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0);

  return (
    <div className="space-y-4">
      <SectionCard title="Add a part" description="Parts are deducted from Inventory & Parts now, or when you complete the job.">
        {stock === null ? (
          <ListLoading label="Loading inventory" className="py-4" />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="bg-surface-card sm:flex-1" aria-label="Part">
                <SelectValue placeholder={stock.length ? "Choose a part…" : "No inventory items yet"} />
              </SelectTrigger>
              <SelectContent>
                {stock.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {Number(s.quantity) || 0} on hand
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label="Quantity"
              className="bg-surface-card sm:w-24"
            />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={add}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Materials used" description={`${list.length} part${list.length === 1 ? "" : "s"} · ${money(total)}`} bodyPadding={false}>
        {list.length === 0 ? (
          <EmptyState icon={Boxes} title="No parts used yet" description="Add parts from inventory to track usage and cost." />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
                    <Badge variant={row.deducted ? "success" : "warning"}>{row.deducted ? "Deducted" : "Not deducted"}</Badge>
                    {row.costed ? <Badge variant="info">In costs</Badge> : null}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {[row.sku, `${row.qty} × ${money(row.unitCost)}`, row.deductedAt && `Deducted ${formatDate(row.deductedAt)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!row.deducted ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border bg-surface-card hover:bg-surface-hover"
                      disabled={busy === row.id}
                      onClick={() => deduct(row)}
                    >
                      {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MinusCircle className="h-3.5 w-3.5" />}
                      Deduct
                    </Button>
                  ) : null}
                  {!row.costed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border bg-surface-card hover:bg-surface-hover"
                      onClick={() => addToCosts(row)}
                    >
                      <Receipt className="h-3.5 w-3.5" /> Add to costs
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => remove(row)}
                    aria-label={`Remove ${row.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// --- Completion ----------------------------------------------------------------

const COMPLETION_FIELDS = [
  meta({ key: "resolution", label: "Resolution", type: "textarea", placeholder: "What was done to fix it…" }),
  meta({ key: "completedDate", label: "Completed on", type: "date" }),
  meta({ key: "actualHours", label: "Actual hours", type: "number", min: 0, step: 0.25 }),
  meta({ key: "rootCause", label: "Root cause", type: "select", options: ROOT_CAUSE_OPTIONS }),
  meta({ key: "signedOffBy", label: "Signed off by", type: "text" }),
  meta({ key: "workVerified", label: "Work verified", type: "switch", hint: "Staff checked the finished work." }),
  meta({ key: "tenantPresent", label: "Tenant present at completion", type: "switch" }),
  meta({ key: "warrantyDays", label: "Workmanship warranty (days)", type: "number", min: 0 }),
  meta({ key: "followUpNeeded", label: "Follow-up needed", type: "switch" }),
  meta({ key: "followUpNotes", label: "Follow-up notes", type: "textarea", showIf: (i) => Boolean(i.metadata?.followUpNeeded) }),
];

export function CompletionSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const closed = CLOSED_WORK_STATUSES.includes(item.status);
  return (
    <div className="space-y-4">
      <SectionCard
        title={closed ? `This work order is ${item.status.toLowerCase()}` : "Close out the job"}
        description={
          closed
            ? "Reopen it if the issue came back or the work needs another visit."
            : "The completion wizard records the resolution, deducts parts from stock and closes the work order."
        }
        action={
          closed ? (
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("reopen")}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          ) : (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("complete")}>
              <CheckCircle2 className="h-4 w-4" /> Complete…
            </Button>
          )
        }
      >
        <p className="text-sm text-text-secondary">
          Status: <StatusPill status={item.status} map={MAINTENANCE_STATUS_MAP} />
        </p>
      </SectionCard>
      <FieldsForm item={item} fields={COMPLETION_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </div>
  );
}

// --- Tenant feedback -----------------------------------------------------------

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${"★".repeat(n)}${"☆".repeat(5 - n)} (${n})` }));

const FEEDBACK_FIELDS = [
  meta({ key: "feedbackRequested", label: "Feedback survey sent", type: "switch" }),
  meta({ key: "feedbackRequestedOn", label: "Sent on", type: "date", showIf: (i) => Boolean(i.metadata?.feedbackRequested) }),
  meta({ key: "tenantRating", label: "Rating", type: "select", options: RATING_OPTIONS }),
  meta({ key: "feedbackDate", label: "Received on", type: "date" }),
  meta({ key: "feedbackChannel", label: "Received via", type: "select", options: CONTACT_METHOD_OPTIONS }),
  meta({ key: "wouldRecommendVendor", label: "Happy with the vendor", type: "switch" }),
  meta({ key: "issueResolved", label: "Tenant confirms it's fixed", type: "switch" }),
  meta({ key: "feedbackComment", label: "Tenant comment", type: "textarea" }),
  meta({ key: "feedbackResponse", label: "Our response", type: "textarea" }),
];

export function FeedbackSection({ item, onPatch, onCommit, onCommitMeta }) {
  return <FieldsForm item={item} fields={FEEDBACK_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />;
}

// --- Timeline --------------------------------------------------------------------

const ManualEvents = makeMetaListSection({
  field: "timeline",
  singular: "event",
  icon: History,
  primaryPlaceholder: "e.g. Parts ordered",
  secondary: { key: "date", label: "Date", type: "date", placeholder: "When" },
});

export function TimelineSection(props) {
  const history = listMeta(props.item, "statusHistory");
  return (
    <div className="space-y-5">
      <SectionCard title="Status history" description="Recorded automatically on every status change." bodyPadding={false}>
        {history.length === 0 ? (
          <EmptyState icon={History} title="No status changes yet" description="Changes from actions and status fields appear here." />
        ) : (
          <ol className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {h.from ? (
                      <>
                        <StatusPill status={h.from} map={MAINTENANCE_STATUS_MAP} />
                        <span className="text-text-tertiary">→</span>
                      </>
                    ) : null}
                    <StatusPill status={h.status} map={MAINTENANCE_STATUS_MAP} />
                  </div>
                  {h.note ? <p className="mt-1 text-xs text-text-secondary">{h.note}</p> : null}
                </div>
                <div className="shrink-0 text-right text-xs text-text-tertiary">
                  <p className="text-text-secondary">{h.by || "—"}</p>
                  <p>{formatDateTime(h.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Other events</p>
        <ManualEvents {...props} />
      </div>
    </div>
  );
}

// --- Photos (before / after) -----------------------------------------------------

const BeforePhotos = makeUploadSection({ field: "photos", ownerType: "work_order", singular: "photo" });
const AfterPhotos = makeUploadSection({ field: "afterPhotos", ownerType: "work_order", singular: "photo" });

export function PhotosSection(props) {
  return (
    <div className="space-y-5">
      <SectionCard title="Before" description="The issue as reported or found on arrival.">
        <BeforePhotos {...props} />
      </SectionCard>
      <SectionCard title="After" description="The finished work.">
        <AfterPhotos {...props} />
      </SectionCard>
    </div>
  );
}

// --- Related records -------------------------------------------------------------

const OtherWorkOrders = makeRelatedSection({
  load: async (item) => {
    const rows = item.unitId
      ? await listWorkOrdersForUnit(item.unitId)
      : item.propertyId
        ? await listWorkOrdersForProperty(item.propertyId)
        : [];
    return (rows ?? []).filter((r) => r.id !== item.id);
  },
  tab: "Work Orders",
  plural: "Other work orders",
  emptyDescription: "Other jobs on this unit (or property) show up here.",
  columns: [
    {
      key: "name",
      header: "Work order",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.category, r.vendorName].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={MAINTENANCE_STATUS_MAP} /> },
    { key: "createdAt", header: "Opened", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</span> },
    { key: "totalCost", header: "Cost", align: "right", className: "text-right tabular-nums", render: (r) => money(r.totalCost) },
  ],
});

const LINKS = [
  { key: "inspectionId", label: "Inspection", tab: "Inspections", get: (id) => inspectionsLayer.get(id) },
  { key: "pmScheduleId", label: "Preventive schedule", tab: "Preventive & Recurring", get: (id) => pmSchedulesLayer.get(id) },
  { key: "unitTurnId", label: "Unit turn", tab: "Unit Turns", get: (id) => unitTurnsLayer.get(id) },
];

function LinkedRecords({ item }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [names, setNames] = useState({});
  const ids = LINKS.map((l) => item[l.key] || "").join("|");
  useEffect(() => {
    let alive = true;
    Promise.all(LINKS.map((l) => (item[l.key] ? l.get(item[l.key]) : null))).then((rows) => {
      if (alive) setNames(Object.fromEntries(LINKS.map((l, i) => [l.key, rows[i]?.name || ""])));
    });
    return () => {
      alive = false;
    };
    // Re-resolve only when a link id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const extra = [
    { key: "unitId", label: "Unit", tab: "Units", name: item.propertyLabel },
    { key: "tenantId", label: "Tenant", tab: "Tenants", name: item.tenantName },
    { key: "vendorId", label: "Vendor", tab: "Vendors", name: item.vendorName },
    { key: "leaseId", label: "Lease", tab: "Leases", name: "" },
  ];
  const rows = [...LINKS.map((l) => ({ ...l, name: names[l.key] })), ...extra].filter((l) => item[l.key]);

  return (
    <SectionCard title="Linked records" bodyPadding={false}>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-text-secondary">No unit, tenant, vendor, inspection, schedule or turn linked yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((l) => (
            <li key={l.key}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
                onClick={() => openItemInTab(item[l.key], l.tab)}
              >
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{l.label}</span>
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <span className="truncate">{l.name || "Open record"}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function RelatedSection(props) {
  return (
    <div className="space-y-5">
      <LinkedRecords item={props.item} />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {props.item.unitId ? "Other work orders on this unit" : "Other work orders at this property"}
        </p>
        <OtherWorkOrders {...props} />
      </div>
    </div>
  );
}
