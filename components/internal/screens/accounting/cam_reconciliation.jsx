"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, Building, Layers, Scale, Clock, Loader2, Send, Ban, Save } from "lucide-react";

import { DataTable, EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { camReconciliationsLayer } from "@/lib/supabase/cam_reconciliations";
import { incomeAccountOptions } from "@/lib/supabase/gl_accounts";
import { getLedgerAccounts, ledgerErrorMessage, listLedger, postCharge, postCredit, voidEntry } from "@/lib/supabase/ledger";
import { propertyOptions } from "@/lib/supabase/options";
import { accountLabel, round2 } from "@/lib/ledger/postings";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { filterOptions, currency, money } from "./shared";
import { SectionLoading, SummaryTiles } from "./sections";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { NO_POST, NO_VOID, useCanPost, useCanVoid } from "./ledger_dialogs";
import { leasesForProperty } from "./utility_billing";

// CAM Reconciliation — a commercial property's year of common-area costs vs the
// estimates billed to each lease, over `property.cam_reconciliations`. Pool
// accounts (metadata.poolAccountIds) pick which ledger expenses count; per-lease
// shares + true-up entries live in metadata.shares.

const CAM_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Reconciled: { label: "Reconciled", variant: "info" },
  Billed: { label: "Billed", variant: "success" },
};
const STATUS_OPTIONS = filterOptions(CAM_STATUS_MAP).slice(1);
const thisYear = () => new Date().getFullYear();
const yearRange = (y) => ({ from: `${y}-01-01`, to: `${y}-12-31` });
const poolIdsOf = (item) => (Array.isArray(item?.metadata?.poolAccountIds) ? item.metadata.poolAccountIds : []);
const sharesOf = (item) => (Array.isArray(item?.metadata?.shares) ? item.metadata.shares : []);

// Expense totals per GL account for the property + year.
function useExpenseByAccount(item) {
  const [state, setState] = useState(null);
  const year = Number(item.year) || thisYear();
  useEffect(() => {
    if (!item.propertyId) return;
    let alive = true;
    listLedger({ propertyId: item.propertyId, ...yearRange(year) }).then((lines) => {
      if (!alive) return;
      const per = new Map();
      for (const l of lines || []) {
        if (l.account?.accountType !== "Expense") continue;
        const cur = per.get(l.glAccountId) || { id: l.glAccountId, label: accountLabel(l.account), amount: 0 };
        cur.amount = round2(cur.amount + (Number(l.debit) || 0) - (Number(l.credit) || 0));
        per.set(l.glAccountId, cur);
      }
      setState({ accounts: [...per.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), lines: lines || [] });
    });
    return () => {
      alive = false;
    };
  }, [item.propertyId, year]);
  return state;
}

function NeedsProperty() {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState icon={Building} title="Pick a property first" description="Set the property in Details — its ledger expenses and leases drive the reconciliation." />
    </div>
  );
}

// Choose which expense accounts form the CAM pool; actual = their sum.
function PoolsSection({ item, onCommit }) {
  const data = useExpenseByAccount(item);
  if (!item.propertyId) return <NeedsProperty />;
  if (!data) return <SectionLoading />;
  const selected = poolIdsOf(item);
  const actual = round2(data.accounts.filter((a) => selected.includes(a.id)).reduce((s, a) => s + a.amount, 0));

  const toggle = (id, on) => {
    const next = on ? [...selected, id] : selected.filter((x) => x !== id);
    const nextActual = round2(data.accounts.filter((a) => next.includes(a.id)).reduce((s, a) => s + a.amount, 0));
    onCommit({ actualAmount: nextActual, metadata: { ...(item.metadata || {}), poolAccountIds: next } });
  };

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Pool accounts", value: String(selected.length) },
          { label: "Actual CAM costs", value: currency(actual) },
          { label: "Budgeted", value: currency(item.budgetAmount) },
        ]}
      />
      {data.accounts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Layers} title="No expenses posted" description={`No ledger expenses for this property in ${item.year || thisYear()} yet.`} />
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: "pick",
              header: "",
              className: "w-10",
              render: (a) => <Checkbox checked={selected.includes(a.id)} onCheckedChange={(v) => toggle(a.id, Boolean(v))} aria-label="Include in CAM pool" />,
            },
            { key: "label", header: "Expense account", render: (a) => <span className="font-medium text-foreground">{a.label}</span> },
            { key: "amount", header: `${item.year || thisYear()} actual`, align: "right", className: "text-right tabular-nums text-foreground", render: (a) => money(a.amount) },
          ]}
          data={data.accounts}
          getRowKey={(a) => a.id}
        />
      )}
    </div>
  );
}

// Per-lease pro-rata share, estimates billed, and the true-up to post.
function TrueUpSection({ item, onCommit }) {
  const [rows, setRows] = useState(null);
  const [camAccount, setCamAccount] = useState("");
  const [commercialOnly, setCommercialOnly] = useState(true);
  const [busy, setBusy] = useState("");
  const canPost = useCanPost();
  const canVoid = useCanVoid();
  const year = Number(item.year) || thisYear();
  const actual = Number(item.actualAmount) || 0;

  useEffect(() => {
    if (!item.propertyId) return;
    let alive = true;
    Promise.all([leasesForProperty(item.propertyId), listLedger({ propertyId: item.propertyId, ...yearRange(year) }), getLedgerAccounts()]).then(
      ([leases, lines, accounts]) => {
        if (!alive) return;
        const camId = item.glAccountId || accounts?.byKey.get("cam_income")?.id || "";
        // Estimates already billed = CAM income credited per lease this year.
        const billed = new Map();
        for (const l of lines || []) {
          if (l.glAccountId !== camId || !l.leaseId) continue;
          if (l.entry?.sourceId === item.id) continue;
          billed.set(l.leaseId, round2((billed.get(l.leaseId) || 0) + (Number(l.credit) || 0) - (Number(l.debit) || 0)));
        }
        const saved = new Map(sharesOf(item).map((s) => [s.leaseId, s]));
        setCamAccount(camId);
        setRows(
          leases.map((l) => {
            const s = saved.get(l.leaseId);
            return {
              ...l,
              include: s ? s.include !== false : true,
              sharePct: s?.sharePct ?? "",
              estimate: s?.estimate ?? "",
              billed: billed.get(l.leaseId) || 0,
              entryId: s?.entryId || "",
            };
          }),
        );
      },
    );
    return () => {
      alive = false;
    };
    // Shares are read once per record; later edits live in local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.propertyId, year]);

  const hasCommercial = (rows || []).some((r) => r.leaseType === "commercial");
  const computed = useMemo(() => {
    if (!rows) return [];
    const scoped = rows.filter((r) => !commercialOnly || !hasCommercial || r.leaseType === "commercial");
    const sqftTotal = scoped.filter((r) => r.include).reduce((s, r) => s + (Number(r.sqft) || 0), 0);
    return scoped.map((r) => {
      const autoPct = sqftTotal ? Math.round(((Number(r.sqft) || 0) / sqftTotal) * 10000) / 100 : 0;
      const pct = r.include ? (r.sharePct !== "" && r.sharePct != null ? Number(r.sharePct) || 0 : autoPct) : 0;
      const owed = round2((actual * pct) / 100);
      const estimates = r.estimate !== "" && r.estimate != null ? round2(r.estimate) : r.billed;
      return { ...r, autoPct, pct, owed, estimates, trueUp: round2(owed - estimates) };
    });
  }, [rows, actual, commercialOnly, hasCommercial]);

  if (!item.propertyId) return <NeedsProperty />;
  if (!rows) return <SectionLoading />;

  const setRow = (leaseId, patch) => setRows((rs) => rs.map((r) => (r.leaseId === leaseId ? { ...r, ...patch } : r)));
  const toShares = (list) =>
    list.map((r) => ({
      leaseId: r.leaseId,
      tenantName: r.tenantName,
      unit: r.unit,
      include: r.include,
      sharePct: r.sharePct,
      estimate: r.estimate,
      pct: r.pct,
      trueUp: r.trueUp,
      entryId: r.entryId || "",
    }));
  const totalPct = Math.round(computed.reduce((s, r) => s + r.pct, 0) * 100) / 100;
  const net = round2(computed.reduce((s, r) => s + (r.include ? r.trueUp : 0), 0));
  const posted = computed.some((r) => r.entryId);

  const save = async () => {
    setBusy("save");
    const ok = await onCommit({ status: item.status === "Draft" ? "Reconciled" : item.status, metadata: { ...(item.metadata || {}), shares: toShares(computed) } });
    setBusy("");
    if (ok) toast.success("Reconciliation saved.");
  };

  const postAll = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    if (!(actual > 0)) {
      toast.error("Pick the CAM pool accounts first.");
      return;
    }
    setBusy("post");
    const next = computed.map((r) => ({ ...r }));
    let failed = 0;
    for (const r of next) {
      if (!r.include || r.entryId || Math.abs(r.trueUp) < 0.01) continue;
      const base = {
        leaseId: r.leaseId,
        tenantId: r.tenantId,
        unitId: r.unitId,
        propertyId: item.propertyId,
        amount: Math.abs(r.trueUp),
        glAccountId: camAccount || undefined,
        memo: `CAM true-up ${year}`,
        sourceId: item.id,
        idempotencyKey: `cam:${item.id}:${r.leaseId}`,
      };
      // Under-billed → charge the difference; over-billed → credit it back.
      const res = r.trueUp > 0 ? await postCharge(base) : await postCredit({ ...base, allocations: [] });
      if (res) r.entryId = res.entryId;
      else failed += 1;
    }
    setRows((rs) => rs.map((r) => ({ ...r, entryId: next.find((n) => n.leaseId === r.leaseId)?.entryId ?? r.entryId })));
    await onCommit({ ...(next.some((r) => r.entryId) ? { status: "Billed" } : {}), metadata: { ...(item.metadata || {}), shares: toShares(next) } });
    setBusy("");
    if (failed) toast.error(`${failed} true-up${failed === 1 ? "" : "s"} failed: ${ledgerErrorMessage() || "ledger error"}`);
    else toast.success("CAM true-ups posted to each lease ledger.");
  };

  const voidAll = async () => {
    if (!canVoid) {
      toast.error(NO_VOID);
      return;
    }
    setBusy("void");
    const next = computed.map((r) => ({ ...r }));
    let failed = 0;
    for (const r of next) {
      if (!r.entryId) continue;
      if (await voidEntry(r.entryId, { memo: `Void CAM true-up ${year}` })) r.entryId = "";
      else failed += 1;
    }
    setRows((rs) => rs.map((r) => ({ ...r, entryId: next.find((n) => n.leaseId === r.leaseId)?.entryId ?? r.entryId })));
    await onCommit({ status: failed ? item.status : "Reconciled", metadata: { ...(item.metadata || {}), shares: toShares(next) } });
    setBusy("");
    if (failed) toast.error(ledgerErrorMessage() || "Some true-ups couldn't be voided.");
    else toast.success("True-ups voided.");
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
          <span className="text-xs text-text-secondary">{[r.unit, r.sqft ? `${r.sqft.toLocaleString()} sq ft` : null, r.entryId ? "Posted" : null].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    {
      key: "pct",
      header: "Share %",
      align: "right",
      className: "p-1 text-right",
      render: (r) => (
        <Input type="number" placeholder={String(r.autoPct)} value={r.sharePct} disabled={Boolean(r.entryId) || !r.include} onChange={(e) => setRow(r.leaseId, { sharePct: e.target.value })} className="ml-auto h-8 w-20 bg-surface-card text-right" />
      ),
    },
    { key: "owed", header: "Share of actual", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => money(r.owed) },
    {
      key: "estimate",
      header: "Estimates billed",
      align: "right",
      className: "p-1 text-right",
      render: (r) => (
        <Input type="number" placeholder={String(r.billed)} value={r.estimate} disabled={Boolean(r.entryId) || !r.include} onChange={(e) => setRow(r.leaseId, { estimate: e.target.value })} className="ml-auto h-8 w-28 bg-surface-card text-right" />
      ),
    },
    {
      key: "trueUp",
      header: "True-up",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) =>
        r.include ? (
          <span className={r.trueUp > 0 ? "text-red-600 dark:text-red-400" : r.trueUp < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-text-secondary"}>
            {r.trueUp > 0 ? "+" : ""}
            {money(r.trueUp)}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Actual CAM", value: currency(actual) },
          { label: "Shares total", value: `${totalPct}%`, className: Math.abs(totalPct - 100) > 0.5 ? "text-amber-600 dark:text-amber-400" : "text-foreground" },
          { label: "Net true-up", value: money(net), className: net > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {hasCommercial ? (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <Switch checked={commercialOnly} onCheckedChange={setCommercialOnly} /> Commercial leases only
          </label>
        ) : (
          <p className="text-sm text-text-secondary">No leases are marked commercial — showing every active lease.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={save}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          {posted && canVoid ? (
            <Button variant="outline" className="border-border bg-surface-card text-red-600 dark:text-red-300 hover:bg-red-500/10" disabled={Boolean(busy)} onClick={voidAll}>
              {busy === "void" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Void True-Ups
            </Button>
          ) : null}
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy) || !computed.length || !canPost} onClick={postAll}>
              {busy === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post True-Ups
            </Button>
          </RoleGate>
        </div>
      </div>
      {computed.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Scale} title="No leases to reconcile" description="This property has no active leases." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={computed} getRowKey={(r) => r.leaseId} />
        </div>
      )}
      <p className="text-sm text-text-secondary">
        Share defaults to each unit&apos;s square footage over the included leases. Estimates default to CAM income already billed to the lease in {year}. Positive true-ups are charged; negative ones are credited.
      </p>
    </div>
  );
}

const camConfig = {
  key: "camReconciliation",
  singular: "CAM reconciliation",
  plural: "CAM reconciliations",
  title: "CAM Reconciliation",
  description:
    "Year-end common-area maintenance true-ups for commercial leases — actual pool costs from the ledger, each tenant's pro-rata share, and the charge or credit to settle.",
  icon: Layers,
  titleField: "name",
  searchFields: ["name", "propertyName"],
  data: camReconciliationsLayer.data,

  statusMap: CAM_STATUS_MAP,
  statusFilterOptions: filterOptions(CAM_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Reconciliation",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.propertyName || "—"}</span>
        </div>
      ),
    },
    { key: "year", header: "Year", className: "text-sm tabular-nums text-text-secondary", render: (r) => r.year || "—" },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={CAM_STATUS_MAP} /> },
    { key: "budgetAmount", header: "Budget", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => currency(r.budgetAmount) },
    { key: "actualAmount", header: "Actual", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => currency(r.actualAmount) },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) => {
        const v = (Number(r.budgetAmount) || 0) - (Number(r.actualAmount) || 0);
        return <span className={v < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>{currency(v)}</span>;
      },
    },
  ],

  stats: (rows) => {
    const year = thisYear() - 1;
    const pending = rows.filter((r) => r.status !== "Billed");
    const budget = rows.reduce((s, r) => s + (Number(r.budgetAmount) || 0), 0);
    const actual = rows.reduce((s, r) => s + (Number(r.actualAmount) || 0), 0);
    return [
      { label: "Reconciliations", value: String(rows.length), footer: `${rows.filter((r) => Number(r.year) === year).length} for ${year}` },
      { label: "Awaiting billing", value: String(pending.length), footer: "Draft or reconciled" },
      { label: "Budgeted CAM", value: currency(budget), footer: "All reconciliations" },
      { label: "Actual CAM", value: currency(actual), footer: `${currency(actual - budget)} vs budget` },
    ];
  },

  createDraft: { name: "", propertyId: "", propertyName: "", year: String(thisYear() - 1), budgetAmount: "" },
  createFields: [
    { key: "name", label: "Name", type: "text", placeholder: "e.g. Harbor Plaza CAM 2025" },
    { key: "propertyId", label: "Property", type: "select", optionsFrom: "properties", placeholder: "Select a property…", emptyLabel: "No properties yet" },
    { key: "year", label: "Year", type: "number", placeholder: String(thisYear() - 1) },
    { key: "budgetAmount", label: "Budgeted CAM", type: "number", placeholder: "0.00" },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    year: Number(draft.year) || thisYear() - 1,
    budgetAmount: Math.abs(Number(draft.budgetAmount) || 0),
    actualAmount: 0,
    status: "Draft",
  }),

  headerMeta: (r) => [r.propertyName, r.year].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this reconciliation." }] },
    {
      group: "Reconciliation",
      items: [
        { key: "details", label: "Details", icon: Building, desc: "Property, year, budget, and income account." },
        { key: "pools", label: "CAM Pools", icon: Layers, desc: "Expense accounts that make up common-area costs." },
        { key: "trueUp", label: "Tenant True-ups", icon: Scale, desc: "Each lease's share, estimates billed, and the difference." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "propertyName", label: "Property" },
        { key: "year", label: "Year" },
        { key: "budgetAmount", label: "Budgeted CAM", format: (v) => currency(v) },
        { key: "actualAmount", label: "Actual CAM", format: (v) => currency(v) },
        { key: "variance", label: "Variance", format: (_v, r) => currency((Number(r.budgetAmount) || 0) - (Number(r.actualAmount) || 0)) },
        { key: "status", label: "Status" },
      ],
      note: "Actual CAM is the sum of the pool accounts' ledger expenses for the year.",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Name", type: "text", full: true },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "year", label: "Year", type: "number" },
      { key: "budgetAmount", label: "Budgeted CAM", type: "currency" },
      { key: "actualAmount", label: "Actual CAM", type: "currency", hint: "Set automatically from the CAM pools." },
      { key: "glAccountId", label: "CAM income account", type: "relation", load: incomeAccountOptions, hint: "Defaults to CAM Recoveries." },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ]),
    pools: PoolsSection,
    trueUp: TrueUpSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this reconciliation…" }),
  },
};

export function CamReconciliationScreen() {
  return <EntityListScreen config={camConfig} />;
}

export default CamReconciliationScreen;
