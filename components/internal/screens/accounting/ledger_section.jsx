"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, BookOpen, CircleDollarSign, HandCoins, Plus, ReceiptText, Undo2, Wallet } from "lucide-react";

import { DataTable, EmptyState, Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { listLedger, listLedgerAccounts } from "@/lib/supabase/ledger";
import { SOURCE_LABELS, indexAccounts, runningLedger, summarize } from "@/lib/ledger/postings";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { JournalEntryDialog, NO_POST, PostEntryDialog, useCanPost, useCanVoid, VoidEntryDialog } from "./ledger_dialogs";
import { SectionLoading, SummaryTiles } from "./sections";
import { formatDate, money } from "./shared";

// makeLedgerSection({ scope }) → an entity-editor section showing that record's
// sub-ledger: summary tiles, filters, a running-balance table, posting dialogs
// and void-with-confirmation. Scopes: lease | tenant | owner | vendor |
// property | account | job | bank_account. Override `dims(item)` when the
// record isn't the dimension itself (e.g. a rent account → its lease/tenant).

const ENTRY_STATUS_MAP = {
  posted: { label: "Posted", variant: "success" },
  void: { label: "Void", variant: "neutral" },
  reversal: { label: "Reversal", variant: "warning" },
};

// The record's dimension ids for each scope (used for listing + posting).
const DEFAULT_DIMS = {
  lease: (i) => ({ leaseId: i.id, tenantId: i.tenantId, unitId: i.unitId, propertyId: i.propertyId }),
  tenant: (i) => ({ tenantId: i.id, leaseId: i.leaseId, unitId: i.unitId, propertyId: i.propertyId }),
  owner: (i) => ({ ownerId: i.id }),
  vendor: (i) => ({ vendorId: i.id }),
  property: (i) => ({ propertyId: i.id }),
  account: (i) => ({ glAccountId: i.id }),
  job: (i) => ({ jobId: i.id, propertyId: i.propertyId, unitId: i.unitId }),
  bank_account: (i) => ({ bankAccountId: i.id, propertyId: i.propertyId }),
};

// The one dimension a scope's listing filters on.
const FILTER_KEY = {
  lease: "leaseId",
  tenant: "tenantId",
  owner: "ownerId",
  vendor: "vendorId",
  property: "propertyId",
  account: "glAccountId",
  job: "jobId",
  bank_account: "bankAccountId",
};

const COLUMNS = {
  lease: ["Charges", "Payments"],
  tenant: ["Charges", "Payments"],
  vendor: ["Billed", "Paid"],
  owner: ["In", "Out"],
  property: ["In", "Out"],
  bank_account: ["Deposits", "Withdrawals"],
  account: ["Increase", "Decrease"],
  job: ["Cost", "Credit"],
};

const ACTIONS = {
  lease: ["charge", "payment", "credit"],
  tenant: ["charge", "payment", "credit"],
  vendor: ["bill", "bill_payment"],
  owner: ["contribution", "distribution"],
  property: ["bill", "contribution", "distribution"],
  account: ["journal"],
  job: ["bill"],
  bank_account: ["journal"],
};

const ACTION_META = {
  charge: { label: "Charge", icon: ReceiptText },
  payment: { label: "Payment", icon: CircleDollarSign },
  credit: { label: "Credit", icon: Undo2 },
  bill: { label: "Bill", icon: ReceiptText },
  bill_payment: { label: "Pay bill", icon: CircleDollarSign },
  contribution: { label: "Contribution", icon: HandCoins },
  distribution: { label: "Distribution", icon: Wallet },
  journal: { label: "Journal entry", icon: BookOpen },
};

function summaryTiles(scope, s, rows, item) {
  const totalIn = rows.reduce((t, r) => t + r.charge, 0);
  const totalOut = rows.reduce((t, r) => t + r.payment, 0);
  const balance = rows.length ? rows[rows.length - 1].balance : 0;
  const tone = (n) => (n > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400");
  switch (scope) {
    case "lease":
    case "tenant":
      return [
        { label: "Balance owed", value: money(s.receivable), className: s.receivable > 0 ? tone(1) : tone(0) },
        { label: "Charged", value: money(totalIn) },
        { label: "Paid & credited", value: money(totalOut) },
        { label: "Deposits held", value: money(s.depositsHeld) },
      ];
    case "vendor":
      return [
        { label: "Payable", value: money(s.payable), className: s.payable > 0 ? tone(1) : "text-foreground" },
        { label: "Billed", value: money(totalIn) },
        { label: "Paid", value: money(totalOut) },
      ];
    case "owner":
      return [
        { label: "Funds in trust", value: money(s.trustCash), className: s.trustCash < 0 ? tone(1) : "text-foreground" },
        { label: "Income", value: money(s.income) },
        { label: "Expenses", value: money(s.expense) },
        { label: "Distributed", value: money(s.distributions) },
      ];
    case "property":
      return [
        { label: "Cash", value: money(s.cash), className: s.cash < 0 ? tone(1) : "text-foreground" },
        { label: "Income", value: money(s.income) },
        { label: "Expenses", value: money(s.expense) },
        { label: "Net", value: money(s.net), className: s.net < 0 ? tone(1) : tone(0) },
      ];
    case "job": {
      const budget = Number(item?.budget) || 0;
      return [
        { label: "Job cost", value: money(balance) },
        { label: "Budget", value: budget ? money(budget) : "—" },
        { label: "Remaining", value: budget ? money(budget - balance) : "—", className: budget && balance > budget ? tone(1) : "text-foreground" },
      ];
    }
    default:
      return [
        { label: "Balance", value: money(balance) },
        { label: "Increases", value: money(totalIn) },
        { label: "Decreases", value: money(totalOut) },
      ];
  }
}

const RANGE_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Standalone ledger view (used by the section factory and full screens).
export function LedgerView({ scope, dims, item, actions, emptyDescription }) {
  const filterKey = FILTER_KEY[scope];
  const filterValue = dims[filterKey];
  const [lines, setLines] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("all");
  const [showVoid, setShowVoid] = useState(false);
  const [posting, setPosting] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const canPost = useCanPost();
  const canVoid = useCanVoid();

  useEffect(() => {
    if (!filterValue) return;
    let alive = true;
    Promise.all([listLedger({ [filterKey]: filterValue }), listLedgerAccounts()]).then(([l, a]) => {
      if (!alive) return;
      setLines(l || []);
      setAccounts(a || indexAccounts([]));
    });
    return () => {
      alive = false;
    };
  }, [filterKey, filterValue, reloadKey]);

  const summary = useMemo(() => (lines && accounts ? summarize(lines, accounts) : null), [lines, accounts]);

  // Running balance over everything (voids + reversals net out), then filter for display.
  const rows = useMemo(() => {
    if (!lines || !accounts) return [];
    return runningLedger(scope, lines, accounts);
  }, [scope, lines, accounts]);

  const visible = useMemo(() => {
    const start = range === "custom" ? from : range === "all" ? "" : daysAgoISO(Number(range));
    const end = range === "custom" ? to : "";
    const out = rows.filter((r) => {
      if (!showVoid && (r.status === "void" || r.reversalOf)) return false;
      if (type !== "all" && r.sourceType !== type) return false;
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      return true;
    });
    return out.reverse();
  }, [rows, range, from, to, type, showVoid]);

  const typeOptions = useMemo(() => {
    const present = [...new Set(rows.map((r) => r.sourceType))];
    return [{ value: "all", label: "All types" }, ...present.map((t) => ({ value: t, label: SOURCE_LABELS[t] || t }))];
  }, [rows]);

  if (!filterValue) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={BookOpen} title="Not linked yet" description="Link this record first — its ledger is keyed to that link." />
      </div>
    );
  }
  if (!lines || !accounts) return <SectionLoading />;

  const [inLabel, outLabel] = COLUMNS[scope] || COLUMNS.account;
  const actionKeys = actions || ACTIONS[scope] || [];

  const columns = [
    { key: "date", header: "Date", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (r) => formatDate(r.date) },
    {
      key: "memo",
      header: "Description",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{r.memo || SOURCE_LABELS[r.sourceType]}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
            {SOURCE_LABELS[r.sourceType] || r.sourceType}
            {r.accounts ? ` · ${r.accounts}` : ""}
            {r.status === "void" ? <StatusPill status="void" map={ENTRY_STATUS_MAP} /> : null}
            {r.reversalOf ? <StatusPill status="reversal" map={ENTRY_STATUS_MAP} /> : null}
          </span>
        </div>
      ),
    },
    { key: "charge", header: inLabel, align: "right", className: "text-right tabular-nums text-foreground", render: (r) => (r.charge ? money(r.charge) : "—") },
    { key: "payment", header: outLabel, align: "right", className: "text-right tabular-nums text-foreground", render: (r) => (r.payment ? money(r.payment) : "—") },
    { key: "balance", header: "Balance", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (r) => money(r.balance) },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-10 text-right",
      render: (r) =>
        canVoid && r.status === "posted" && !r.reversalOf ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
            onClick={() => setVoiding(r)}
            aria-label="Void entry"
          >
            <Ban className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  const postDims = { ...dims };
  delete postDims.glAccountId;

  return (
    <div className="space-y-4">
      {summary ? <SummaryTiles items={summaryTiles(scope, summary, rows, item)} /> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <FilterDropdown value={range} onValueChange={setRange} options={RANGE_OPTIONS} height="h-9" />
          <FilterDropdown value={type} onValueChange={setType} options={typeOptions} height="h-9" />
          {range === "custom" ? (
            <>
              <Field label="From" htmlFor="lg-from">
                <Input id="lg-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 bg-surface-card" />
              </Field>
              <Field label="To" htmlFor="lg-to">
                <Input id="lg-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 bg-surface-card" />
              </Field>
            </>
          ) : null}
          <label className="flex h-9 items-center gap-2 px-1 text-sm text-text-secondary">
            <Switch checked={showVoid} onCheckedChange={setShowVoid} /> Show voided
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {actionKeys.map((k) => {
            const meta = ACTION_META[k];
            const Icon = meta?.icon || Plus;
            return (
              <RoleGate key={k} allowed={canPost} reason={NO_POST}>
                <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" disabled={!canPost} onClick={() => setPosting(k)}>
                  <Icon className="h-4 w-4" /> {meta?.label || k}
                </Button>
              </RoleGate>
            );
          })}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={visible}
        getRowKey={(r) => r.entryId}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={BookOpen}
              title={rows.length ? "No entries match these filters" : "No ledger activity yet"}
              description={rows.length ? "Try another date range or type." : emptyDescription || "Posted charges, payments and bills appear here with a running balance."}
            />
          </div>
        }
      />

      {posting && posting !== "journal" ? (
        <PostEntryDialog
          open={Boolean(posting)}
          onOpenChange={(o) => !o && setPosting(null)}
          kind={posting}
          dims={postDims}
          onPosted={reload}
        />
      ) : null}
      <JournalEntryDialog open={posting === "journal"} onOpenChange={(o) => !o && setPosting(null)} dims={postDims} onPosted={reload} />
      <VoidEntryDialog entry={voiding} onOpenChange={(o) => !o && setVoiding(null)} onVoided={reload} />
    </div>
  );
}

// Section factory for EntityDetailScreen configs.
export function makeLedgerSection({ scope, dims, actions, emptyDescription } = {}) {
  const toDims = dims || DEFAULT_DIMS[scope] || ((i) => ({ [FILTER_KEY[scope]]: i.id }));
  function LedgerSection({ item }) {
    const d = toDims(item || {});
    return <LedgerView scope={scope} dims={d} item={item} actions={actions} emptyDescription={emptyDescription} />;
  }
  return LedgerSection;
}

export default makeLedgerSection;
