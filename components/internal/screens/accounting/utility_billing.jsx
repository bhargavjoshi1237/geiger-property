"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, Droplets, Split, Clock, Loader2, Send, Ban, Save } from "lucide-react";

import { DataTable, EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { utilityAllocationsLayer } from "@/lib/supabase/utility_allocations";
import { leasesLayer } from "@/lib/supabase/leases";
import { leasePartiesLayer } from "@/lib/supabase/lease_parties";
import { listUnits } from "@/lib/supabase/units";
import { billsLayer } from "@/lib/supabase/bills";
import { incomeAccountOptions } from "@/lib/supabase/gl_accounts";
import { getLedgerAccounts, ledgerErrorMessage, postCharge, voidEntry } from "@/lib/supabase/ledger";
import { propertyOptions } from "@/lib/supabase/options";
import { round2 } from "@/lib/ledger/postings";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { filterOptions, optionsOf, currency, money, formatDate, todayISO } from "./shared";
import { SectionLoading, SummaryTiles } from "./sections";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { NO_POST, NO_VOID, useCanPost, useCanVoid } from "./ledger_dialogs";

// Utility Billing (RUBS) — split a property's utility bill across its active
// leases by square footage, occupants or equal share over
// `property.utility_allocations`, then post each share as a tenant charge to
// the ledger. Per-lease shares live in metadata.shares.

const RUBS_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
  Posted: { label: "Posted", variant: "success", dotClass: "bg-emerald-400" },
  Void: { label: "Void", variant: "outline", dotClass: "bg-text-tertiary" },
};

const METHODS = [
  { value: "sqft", label: "Square footage" },
  { value: "occupants", label: "Occupants" },
  { value: "equal", label: "Equal share" },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label]));
const UTILITIES = ["Water & sewer", "Trash", "Gas", "Electric", "Other"];
const ACTIVE_LEASE = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
const STATUS_OPTIONS = filterOptions(RUBS_STATUS_MAP).slice(1);

const sharesOf = (item) => (Array.isArray(item?.metadata?.shares) ? item.metadata.shares : []);

// Active leases on a property with their unit sqft and occupant count.
export async function leasesForProperty(propertyId) {
  const [leases, units, parties] = await Promise.all([leasesLayer.list(), listUnits(), leasePartiesLayer.list()]);
  const unitById = new Map((units || []).map((u) => [u.id, u]));
  const occupants = new Map();
  for (const p of parties || []) {
    if (p.role === "tenant" || p.role === "occupant") occupants.set(p.leaseId, (occupants.get(p.leaseId) || 0) + 1);
  }
  return (leases || [])
    .filter((l) => ACTIVE_LEASE.includes(l.status))
    .filter((l) => (l.propertyId || unitById.get(l.unitId)?.propertyId) === propertyId)
    .map((l) => ({
      leaseId: l.id,
      leaseName: l.name || "Lease",
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      unitId: l.unitId || "",
      unit: unitById.get(l.unitId)?.label || l.unit || "",
      sqft: Number(unitById.get(l.unitId)?.sqft) || 0,
      occupants: occupants.get(l.id) || Number(l.metadata?.occupants) || 1,
      leaseType: l.leaseType || "residential",
    }));
}

// Split `total` by weight across included rows; overrides are fixed amounts.
function computeShares(rows, total, method) {
  const included = rows.filter((r) => r.include);
  const fixed = round2(included.reduce((s, r) => s + (r.override !== "" && r.override != null ? Number(r.override) || 0 : 0), 0));
  const flexible = included.filter((r) => r.override === "" || r.override == null);
  const weight = (r) => (method === "sqft" ? Number(r.sqft) || 0 : method === "occupants" ? Number(r.occupants) || 0 : 1);
  const totalWeight = flexible.reduce((s, r) => s + weight(r), 0);
  const pool = Math.max(0, round2(total - fixed));
  let assigned = 0;
  const out = rows.map((r) => ({ ...r, amount: 0, pct: 0 }));
  const flexIdx = out.map((r, i) => (r.include && (r.override === "" || r.override == null) ? i : -1)).filter((i) => i >= 0);
  for (const r of out) {
    if (!r.include) continue;
    if (r.override !== "" && r.override != null) r.amount = round2(r.override);
  }
  flexIdx.forEach((i, n) => {
    const r = out[i];
    if (n === flexIdx.length - 1) r.amount = round2(pool - assigned);
    else {
      r.amount = totalWeight ? round2((pool * weight(r)) / totalWeight) : 0;
      assigned = round2(assigned + r.amount);
    }
  });
  for (const r of out) r.pct = total ? Math.round((r.amount / total) * 1000) / 10 : 0;
  return out;
}

function AllocationSection({ item, onCommit }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const canPost = useCanPost();
  const canVoid = useCanVoid();
  const posted = sharesOf(item).some((s) => s.entryId);

  useEffect(() => {
    if (!item.propertyId) return;
    let alive = true;
    leasesForProperty(item.propertyId).then((leases) => {
      if (!alive) return;
      const saved = new Map(sharesOf(item).map((s) => [s.leaseId, s]));
      setRows(
        leases.map((l) => {
          const s = saved.get(l.leaseId);
          return { ...l, include: s ? s.include !== false : true, occupants: s?.occupants ?? l.occupants, override: s?.override ?? "", entryId: s?.entryId || "" };
        }),
      );
    });
    return () => {
      alive = false;
    };
    // Shares are read once per record; later edits live in local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.propertyId]);

  const total = Number(item.totalAmount) || 0;
  const computed = useMemo(() => (rows ? computeShares(rows, total, item.method || "sqft") : []), [rows, total, item.method]);

  if (!item.propertyId) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={Split} title="Pick a property first" description="Set the property in Details — its active leases are billed." />
      </div>
    );
  }
  if (!rows) return <SectionLoading />;

  const setRow = (leaseId, patch) => setRows((rs) => rs.map((r) => (r.leaseId === leaseId ? { ...r, ...patch } : r)));
  const toShares = (list) =>
    list.map((r) => ({
      leaseId: r.leaseId,
      leaseName: r.leaseName,
      tenantId: r.tenantId,
      tenantName: r.tenantName,
      unitId: r.unitId,
      unit: r.unit,
      include: r.include,
      occupants: r.occupants,
      override: r.override,
      amount: r.amount,
      entryId: r.entryId || "",
    }));
  const allocated = round2(computed.filter((r) => r.include).reduce((s, r) => s + r.amount, 0));

  const save = async () => {
    setBusy("save");
    const ok = await onCommit({ metadata: { ...(item.metadata || {}), shares: toShares(computed) } });
    setBusy("");
    if (ok) toast.success("Allocation saved.");
  };

  const postAll = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    if (!(total > 0)) {
      toast.error("Enter the bill total in Details.");
      return;
    }
    if (Math.abs(allocated - total) > 0.01) {
      toast.error(`Shares add up to ${money(allocated)}, not ${money(total)}.`);
      return;
    }
    setBusy("post");
    const accounts = await getLedgerAccounts();
    const glAccountId = item.glAccountId || accounts?.byKey.get("utility_income")?.id || undefined;
    const next = [...computed];
    let failed = 0;
    for (const r of next) {
      if (!r.include || r.entryId || !(r.amount > 0)) continue;
      const res = await postCharge({
        leaseId: r.leaseId,
        tenantId: r.tenantId,
        unitId: r.unitId,
        propertyId: item.propertyId,
        amount: r.amount,
        date: item.chargeDate || todayISO(),
        glAccountId,
        memo: `${item.utility || "Utility"} · ${item.name}`,
        sourceId: item.id,
        idempotencyKey: `rubs:${item.id}:${r.leaseId}`,
      });
      if (res) r.entryId = res.entryId;
      else failed += 1;
    }
    setRows(next);
    const anyPosted = next.some((r) => r.entryId);
    await onCommit({ ...(anyPosted ? { status: "Posted" } : {}), metadata: { ...(item.metadata || {}), shares: toShares(next) } });
    setBusy("");
    if (failed) toast.error(`${failed} charge${failed === 1 ? "" : "s"} failed: ${ledgerErrorMessage() || "ledger error"}`);
    else toast.success("Utility charges posted to each lease ledger.");
  };

  const voidAll = async () => {
    if (!canVoid) {
      toast.error(NO_VOID);
      return;
    }
    setBusy("void");
    const next = [...computed];
    let failed = 0;
    for (const r of next) {
      if (!r.entryId) continue;
      const res = await voidEntry(r.entryId, { memo: `Void RUBS · ${item.name}` });
      if (res) r.entryId = "";
      else failed += 1;
    }
    setRows(next);
    await onCommit({ status: failed ? item.status : "Void", metadata: { ...(item.metadata || {}), shares: toShares(next) } });
    setBusy("");
    if (failed) toast.error(ledgerErrorMessage() || "Some charges couldn't be voided.");
    else toast.success("Posted charges voided.");
  };

  const columns = [
    {
      key: "include",
      header: "",
      className: "w-10",
      render: (r) => <Checkbox checked={r.include} disabled={Boolean(r.entryId)} onCheckedChange={(v) => setRow(r.leaseId, { include: Boolean(v) })} aria-label="Include lease" />,
    },
    {
      key: "lease",
      header: "Lease",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.tenantName || r.leaseName}</span>
          <span className="text-xs text-text-secondary">{[r.unit, r.entryId ? "Posted" : null].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { key: "sqft", header: "Sq ft", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => (r.sqft ? r.sqft.toLocaleString() : "—") },
    {
      key: "occupants",
      header: "Occupants",
      align: "right",
      className: "p-1 text-right",
      render: (r) => (
        <Input type="number" min={0} value={r.occupants} disabled={Boolean(r.entryId)} onChange={(e) => setRow(r.leaseId, { occupants: Number(e.target.value) || 0 })} className="ml-auto h-8 w-20 bg-surface-card text-right" />
      ),
    },
    { key: "pct", header: "Share", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => (r.include ? `${r.pct}%` : "—") },
    {
      key: "override",
      header: "Override",
      align: "right",
      className: "p-1 text-right",
      render: (r) => (
        <Input type="number" placeholder="Auto" value={r.override} disabled={Boolean(r.entryId) || !r.include} onChange={(e) => setRow(r.leaseId, { override: e.target.value })} className="ml-auto h-8 w-24 bg-surface-card text-right" />
      ),
    },
    { key: "amount", header: "Charge", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (r) => (r.include ? money(r.amount) : "—") },
  ];

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Bill total", value: money(total) },
          { label: "Allocated", value: money(allocated), className: Math.abs(allocated - total) > 0.01 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
          { label: "Method", value: METHOD_LABEL[item.method] || "Square footage" },
        ]}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={save}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save allocation
        </Button>
        {posted && canVoid ? (
          <Button variant="outline" className="border-border bg-surface-card text-red-600 dark:text-red-300 hover:bg-red-500/10" disabled={Boolean(busy)} onClick={voidAll}>
            {busy === "void" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Void posted charges
          </Button>
        ) : null}
        <RoleGate allowed={canPost} reason={NO_POST}>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy) || !rows.length || !canPost} onClick={postAll}>
            {busy === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post charges
          </Button>
        </RoleGate>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Split} title="No active leases" description="This property has no active leases to bill." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={computed} getRowKey={(r) => r.leaseId} />
        </div>
      )}
      <p className="text-sm text-text-secondary">
        Each share posts a charge to the lease ledger (Dr Accounts Receivable / Cr utility income) dated {formatDate(item.chargeDate || todayISO())}. Re-posting is safe — already-posted leases are skipped.
      </p>
    </div>
  );
}

// Utility bills to pick as the source (patches the total).
async function billOptions() {
  const rows = (await billsLayer.list()) ?? [];
  return rows.map((b) => ({
    value: b.id,
    label: [b.name, b.vendorName, money(b.amount)].filter(Boolean).join(" · "),
    patch: { totalAmount: Number(b.amount) || 0 },
  }));
}

const rubsConfig = {
  key: "utilityAllocation",
  singular: "Utility allocation",
  plural: "Utility allocations",
  title: "Utility Billing",
  description:
    "Ratio utility billing (RUBS) — split a property's utility bill across its leases by square footage, occupants or equal share, then post each share as a tenant charge.",
  icon: Droplets,
  titleField: "name",
  searchFields: ["name", "propertyName", "utility"],
  data: utilityAllocationsLayer.data,

  statusMap: RUBS_STATUS_MAP,
  statusFilterOptions: filterOptions(RUBS_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Allocation",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.utility, r.propertyName].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    {
      key: "period",
      header: "Period",
      className: "whitespace-nowrap text-sm tabular-nums text-text-secondary",
      render: (r) => (r.periodStart || r.periodEnd ? `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` : "—"),
    },
    { key: "method", header: "Method", className: "text-sm text-text-secondary", render: (r) => METHOD_LABEL[r.method] || "—" },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RUBS_STATUS_MAP} /> },
    { key: "totalAmount", header: "Total", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (r) => money(r.totalAmount) },
  ],

  stats: (rows) => {
    const posted = rows.filter((r) => r.status === "Posted");
    const drafts = rows.filter((r) => r.status === "Draft");
    const leases = new Set(posted.flatMap((r) => sharesOf(r).filter((s) => s.entryId).map((s) => s.leaseId)));
    return [
      { label: "Billed back", value: currency(posted.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0)), footer: `${posted.length} posted` },
      { label: "Drafts", value: String(drafts.length), footer: currency(drafts.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0)) },
      { label: "Leases billed", value: String(leases.size), footer: "With a posted share" },
      { label: "Allocations", value: String(rows.length), footer: "All time" },
    ];
  },

  createDraft: { name: "", propertyId: "", propertyName: "", utility: "Water & sewer", totalAmount: "", method: "sqft" },
  createFields: [
    { key: "name", label: "Name", type: "text", placeholder: "e.g. Maple Court water · Sep 2026" },
    { key: "propertyId", label: "Property", type: "select", optionsFrom: "properties", placeholder: "Select a property…", emptyLabel: "No properties yet" },
    { key: "utility", label: "Utility", type: "select", options: optionsOf(UTILITIES) },
    { key: "totalAmount", label: "Bill total", type: "number", placeholder: "0.00" },
    { key: "method", label: "Split by", type: "select", options: METHODS },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    utility: draft.utility || "Water & sewer",
    totalAmount: Math.abs(Number(draft.totalAmount) || 0),
    method: draft.method || "sqft",
    chargeDate: todayISO(),
    status: "Draft",
  }),

  headerMeta: (r) => [r.utility, r.propertyName, money(r.totalAmount)].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this allocation." }] },
    {
      group: "Utility billing",
      items: [
        { key: "details", label: "Details", icon: Droplets, desc: "Property, bill, period, and split method." },
        { key: "allocation", label: "Allocation", icon: Split, desc: "Each lease's share — review, adjust and post." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "propertyName", label: "Property" },
        { key: "utility", label: "Utility" },
        { key: "totalAmount", label: "Bill total", format: (v) => money(v) },
        { key: "method", label: "Split by", format: (v) => METHOD_LABEL[v] || "—" },
        { key: "periodStart", label: "Period start", format: (v) => formatDate(v) },
        { key: "periodEnd", label: "Period end", format: (v) => formatDate(v) },
        { key: "chargeDate", label: "Charge date", format: (v) => formatDate(v) },
        { key: "status", label: "Status" },
      ],
      note: "Posting creates one ledger charge per included lease; voiding reverses them.",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Name", type: "text", full: true },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "utility", label: "Utility", type: "select", options: optionsOf(UTILITIES) },
      { key: "billId", label: "Source bill", type: "relation", load: billOptions, hint: "Picking a bill copies its total." },
      { key: "totalAmount", label: "Bill total", type: "currency" },
      { key: "method", label: "Split by", type: "select", options: METHODS },
      { key: "periodStart", label: "Service period start", type: "date" },
      { key: "periodEnd", label: "Service period end", type: "date" },
      { key: "chargeDate", label: "Charge date", type: "date" },
      { key: "glAccountId", label: "Income account", type: "relation", load: incomeAccountOptions, hint: "Defaults to Utility Reimbursements." },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ]),
    allocation: AllocationSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this allocation…" }),
  },
};

export function UtilityBillingScreen() {
  return <EntityListScreen config={rubsConfig} />;
}

export default UtilityBillingScreen;
