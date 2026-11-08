"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, Banknote, Landmark, Loader2, Plus, Printer } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ListLoading,
  ScreenHeader,
  SearchInput,
  SectionCard,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { EditorHeader } from "@/components/internal/shared/editor_shell";
import { ExportButton } from "@/components/internal/shared/export_button";
import { RoleGate, RoleNote } from "@/components/internal/shared/role_gate";
import { Callout } from "@/components/internal/screens/leasing/sections/gated";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { bankDepositsLayer } from "@/lib/supabase/bank_deposits";
import { createBankDepositApi, depositSlipApi, undepositedItemsApi, voidBankDepositApi } from "@/lib/billing/api";
import { depositDateProblem, depositLabel, slipTotals } from "@/lib/billing/bank_deposits_math";
import { round2 } from "@/lib/ledger/postings";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { NO_POST, NO_VOID, useCanPost, useCanVoid } from "./ledger_dialogs";
import { BANK_DEPOSIT_STATUS_MAP, currency, formatDate, isThisMonth, money, todayISO } from "./shared";

// Bank Deposits (CORE-16): checks, cash and money orders wait in 1050 Undeposited Funds until staff group them into a deposit, so the bank statement shows one line; deposits print a slip and can be voided.

const TABS = [
  { value: "undeposited", label: "Undeposited" },
  { value: "deposits", label: "Deposits" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "Posted", label: "Deposited" },
  { value: "Void", label: "Void" },
];

const sum = (rows) => round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
const premises = (i) => [i.propertyName, i.unitLabel ? `Unit ${i.unitLabel}` : ""].filter(Boolean).join(" · ");
const methodText = (i) => [i.method, i.reference ? `#${i.reference}` : ""].filter(Boolean).join(" ");
const daysSince = (iso) => (iso ? Math.max(0, Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000)) : 0);

// Open a deposit's printable slip in a new tab; the tab opens first so the browser doesn't block it.
async function openDepositSlip(id) {
  const win = window.open("", "_blank");
  const res = await depositSlipApi(id);
  if (!res.ok) {
    win?.close();
    toast.error(res.error || "Couldn't load the deposit slip.");
    return;
  }
  const url = URL.createObjectURL(new Blob([res.html], { type: "text/html;charset=utf-8" }));
  if (win) win.location.href = url;
  else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Active banks a deposit can go into, trust accounts first.
function useBanks() {
  const [banks, setBanks] = useState(null);
  useEffect(() => {
    let alive = true;
    bankAccountsLayer.list().then((rows) => alive && setBanks(rows || []));
    return () => {
      alive = false;
    };
  }, []);
  return banks;
}

// Date, bank and slip number for the selected payments; one deposit id per dialog so a retry never posts twice.
function CreateDepositDialog({ open, onOpenChange, items, banks, onCreated }) {
  const canPost = useCanPost();
  const choices = useMemo(() => (banks || []).filter((b) => b.status !== "Closed").sort((a, b) => Number(b.accountType === "Trust") - Number(a.accountType === "Trust")), [banks]);
  const [date, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState("");
  const [slip, setSlip] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const depositId = useRef("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(todayISO());
      setSlip("");
      setMemo("");
    }
  }
  useEffect(() => {
    if (open) depositId.current = crypto.randomUUID();
  }, [open]);
  const chosen = bankId || choices[0]?.id || "";
  const totals = slipTotals(items);
  const problem = depositDateProblem(date, items);

  const submit = async () => {
    if (!canPost) return toast.error(NO_POST);
    if (!chosen) return toast.error("Pick the bank account this deposit went into.");
    if (problem) return toast.error(problem);
    setBusy(true);
    const res = await createBankDepositApi({ depositId: depositId.current, itemLineIds: items.map((i) => i.lineId), bankAccountId: chosen, date, slipNumber: slip.trim(), memo: memo.trim() });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't make the bank deposit.");
      return;
    }
    toast.success(res.created === false ? `That deposit was already made (${res.label}).` : `Deposited ${money(res.total)} into ${res.bankName || "the bank"} · ${res.itemCount} item${res.itemCount === 1 ? "" : "s"}.`);
    const moved = sum(res.depositSweeps || []);
    if (moved > 0) toast.info(`${money(moved)} of it paid security deposits — move it in Bank Accounts → Deposits to transfer.`);
    for (const w of res.warnings || []) toast.warning(w);
    onOpenChange(false);
    onCreated?.(res);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a bank deposit</DialogTitle>
          <DialogDescription>
            {items.length} payment{items.length === 1 ? "" : "s"} · {money(totals.total)} move from Undeposited Funds into the bank as one deposit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deposit date" htmlFor="bd-date">
            <Input id="bd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Slip number" htmlFor="bd-slip">
            <Input id="bd-slip" placeholder="Optional" value={slip} onChange={(e) => setSlip(e.target.value)} />
          </Field>
          <Field label="Bank account" htmlFor="bd-bank" className="sm:col-span-2">
            <Select value={chosen} onValueChange={setBankId}>
              <SelectTrigger id="bd-bank" className="bg-surface-card">
                <SelectValue placeholder={banks ? "Select a bank account…" : "Loading…"} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {[b.name, b.accountType].filter(Boolean).join(" · ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Memo" htmlFor="bd-memo" className="sm:col-span-2">
            <Input id="bd-memo" placeholder="e.g. Branch deposit, Friday" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface-card sm:col-span-2">
            {[
              ["Checks & money orders", totals.checks],
              ["Cash", totals.cash],
              ["Total", totals.total],
            ].map(([label, value]) => (
              <div key={label} className="px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{money(value)}</p>
              </div>
            ))}
          </div>
          {problem ? <p className="text-xs text-red-600 dark:text-red-400 sm:col-span-2">{problem}</p> : null}
        </div>
        {!canPost ? <RoleNote>{NO_POST}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost || !chosen || Boolean(problem) || !items.length} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Deposit {money(totals.total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Void a deposit: the reversal posts on the chosen date and its payments return to Undeposited Funds.
function VoidDepositDialog({ deposit, onOpenChange, onVoided }) {
  const open = Boolean(deposit);
  const canVoid = useCanVoid();
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(todayISO());
      setReason("");
    }
  }
  const run = async () => {
    if (!canVoid) return toast.error(NO_VOID);
    setBusy(true);
    const res = await voidBankDepositApi(deposit.depositId, { date, reason: reason.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't void the deposit.");
      return;
    }
    toast.success("Deposit voided — its payments are back in Undeposited Funds.");
    onOpenChange(false);
    onVoided?.(res);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void deposit</DialogTitle>
          <DialogDescription>
            Posts the reversal and puts its {deposit?.itemCount || 0} payment{deposit?.itemCount === 1 ? "" : "s"} ({money(deposit?.total)}) back in Undeposited Funds, ready for another deposit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Void date" htmlFor="bdv-date">
            <Input id="bdv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="bdv-reason">
            <Input id="bdv-reason" placeholder="e.g. Deposited into the wrong account" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        {!canVoid ? <RoleNote>{NO_VOID}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={busy || !canVoid} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Void Deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const itemColumns = [
  { key: "date", header: "Received", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (i) => formatDate(i.date) },
  {
    key: "payer",
    header: "From",
    render: (i) => (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium text-foreground">{i.payerName || "—"}</span>
        <span className="truncate text-xs text-text-secondary">{premises(i) || i.memo || "—"}</span>
      </div>
    ),
  },
  { key: "method", header: "Method", className: "text-sm text-text-secondary", render: (i) => methodText(i) || "—" },
  { key: "receipt", header: "Receipt", className: "whitespace-nowrap text-sm tabular-nums text-text-tertiary", render: (i) => i.receiptNo || "—" },
  { key: "amount", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (i) => money(i.amount) },
];

// One deposit: its items, slip and void.
function BankDepositDetail({ depositId, onBack, onChanged }) {
  const canVoid = useCanVoid();
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState("");
  const [voiding, setVoiding] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    depositSlipApi(depositId).then((res) => {
      if (!alive) return;
      if (res.ok) setSlip(res.slip);
      else setError(res.error || "Couldn't load the deposit.");
    });
    return () => {
      alive = false;
    };
  }, [depositId, tick]);

  const back = { label: "Bank Deposits", onClick: onBack };
  if (error) {
    return (
      <MainScreenWrapper>
        <EditorHeader back={back} title="Bank deposit" />
        <Callout tone="danger">{error}</Callout>
      </MainScreenWrapper>
    );
  }
  if (!slip) {
    return (
      <MainScreenWrapper>
        <EditorHeader back={back} title="Bank deposit" />
        <ListLoading label="Loading deposit" />
      </MainScreenWrapper>
    );
  }

  const stats = [
    { label: "Deposit total", value: currency(slip.totals.total), footer: formatDate(slip.date) },
    { label: "Checks & money orders", value: currency(slip.totals.checks), footer: `${slip.items.filter((i) => i.method !== "Cash").length} items` },
    { label: "Cash", value: currency(slip.totals.cash), footer: `${slip.items.filter((i) => i.method === "Cash").length} items` },
    { label: "Items", value: String(slip.totals.count), footer: slip.postedBy ? `By ${slip.postedBy}` : "In this deposit" },
  ];

  return (
    <MainScreenWrapper>
      <EditorHeader
        back={back}
        title={slip.label}
        status={slip.status}
        statusMap={BANK_DEPOSIT_STATUS_MAP}
        meta={[slip.bank?.name, formatDate(slip.date), slip.memo].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="outline" className="border-border bg-surface-card" onClick={() => openDepositSlip(slip.depositId)}>
              <Printer className="h-4 w-4" /> Print Slip
            </Button>
            {slip.status === "Posted" ? (
              <RoleGate allowed={canVoid} reason={NO_VOID}>
                <Button variant="outline" className="border-border bg-surface-card text-red-600 hover:bg-red-500/10 dark:text-red-400" disabled={!canVoid} onClick={() => setVoiding(slip)}>
                  <Ban className="h-4 w-4" /> Void Deposit
                </Button>
              </RoleGate>
            ) : null}
          </>
        }
      />

      {slip.status === "Void" ? (
        <Callout tone="warning">
          Voided{slip.voidedAt ? ` ${formatDate(String(slip.voidedAt).slice(0, 10))}` : ""}
          {slip.voidedBy ? ` by ${slip.voidedBy}` : ""}
          {slip.voidReason ? ` · ${slip.voidReason}` : ""}. The reversal is posted and these payments went back to Undeposited Funds.
        </Callout>
      ) : null}

      <StatsBar stats={stats} />

      <SectionCard title="Items" description="The payments this deposit moved out of Undeposited Funds." bodyPadding={false}>
        <DataTable
          className="rounded-none border-0"
          columns={itemColumns}
          data={slip.items}
          getRowKey={(i) => i.lineId}
          empty={<EmptyState className="py-10" icon={Banknote} title="No items" description="This deposit holds no payments." />}
        />
      </SectionCard>

      <VoidDepositDialog
        deposit={voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        onVoided={() => {
          setTick((t) => t + 1);
          onChanged?.();
        }}
      />
    </MainScreenWrapper>
  );
}

export function BankDepositsScreen() {
  const { itemId, openItem, closeItem } = useWorkspaceUrl();
  const canPost = useCanPost();
  const banks = useBanks();
  const [tab, setTab] = useState("undeposited");
  const [undeposited, setUndeposited] = useState(null);
  const [deposits, setDeposits] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [property, setProperty] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([undepositedItemsApi(), bankDepositsLayer.list()]).then(([u, d]) => {
      if (!alive) return;
      setUndeposited(u.ok ? { items: u.items || [], error: "" } : { items: [], error: u.error || "Couldn't load the undeposited payments." });
      setDeposits(d || []);
      // Keep only selections that are still waiting.
      const live = new Set((u.items || []).map((i) => i.lineId));
      setSelected((prev) => new Set([...prev].filter((id) => live.has(id))));
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const items = useMemo(() => undeposited?.items || [], [undeposited]);
  const bankName = useMemo(() => new Map((banks || []).map((b) => [b.id, b.name])), [banks]);
  const propertyOptions = useMemo(() => {
    const seen = new Map();
    for (const i of items) if (i.propertyId && !seen.has(i.propertyId)) seen.set(i.propertyId, i.propertyName || "Property");
    return [{ value: "all", label: "All properties" }, ...[...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))];
  }, [items]);
  const methodOptions = useMemo(() => [{ value: "all", label: "All methods" }, ...[...new Set(items.map((i) => i.method).filter(Boolean))].sort().map((m) => ({ value: m, label: m }))], [items]);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(
    () =>
      items.filter(
        (i) =>
          (property === "all" || i.propertyId === property) &&
          (method === "all" || i.method === method) &&
          (!q || [i.payerName, premises(i), i.method, i.reference, i.receiptNo, i.memo].filter(Boolean).join(" ").toLowerCase().includes(q)),
      ),
    [items, property, method, q],
  );
  const filteredDeposits = useMemo(
    () =>
      (deposits || []).filter(
        (d) =>
          (status === "all" || d.status === status) &&
          (!q || [depositLabel(d), bankName.get(d.bankAccountId), d.memo].filter(Boolean).join(" ").toLowerCase().includes(q)),
      ),
    [deposits, status, q, bankName],
  );

  const chosen = useMemo(() => items.filter((i) => selected.has(i.lineId)), [items, selected]);
  const stats = useMemo(() => {
    const posted = (deposits || []).filter((d) => d.status === "Posted");
    const month = posted.filter((d) => isThisMonth(d.depositDate));
    const oldest = items[0]?.date || "";
    return [
      { label: "Undeposited", value: currency(sum(items)), footer: `${items.length} payment${items.length === 1 ? "" : "s"} waiting` },
      { label: "Oldest waiting", value: oldest ? `${daysSince(oldest)} days` : "—", footer: oldest ? `Received ${formatDate(oldest)}` : "Nothing waiting" },
      { label: "Deposited this month", value: currency(month.reduce((s, d) => s + (Number(d.total) || 0), 0)), footer: `${month.length} deposit${month.length === 1 ? "" : "s"}` },
      { label: "Selected", value: currency(sum(chosen)), footer: `${chosen.length} of ${items.length}` },
    ];
  }, [items, deposits, chosen]);

  if (itemId) return <BankDepositDetail depositId={itemId} onBack={closeItem} onChanged={reload} />;

  const toggle = (id, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allOn = filteredItems.length > 0 && filteredItems.every((i) => selected.has(i.lineId));
  const toggleAll = (on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of filteredItems) {
        if (on) next.add(i.lineId);
        else next.delete(i.lineId);
      }
      return next;
    });

  const undepositedColumns = [
    {
      key: "pick",
      header: <Checkbox checked={allOn} disabled={!filteredItems.length || !canPost} onCheckedChange={(v) => toggleAll(Boolean(v))} aria-label="Select all payments" />,
      className: "w-10",
      render: (i) => <Checkbox checked={selected.has(i.lineId)} disabled={!canPost} onCheckedChange={(v) => toggle(i.lineId, Boolean(v))} aria-label={`Select ${i.payerName || "payment"}`} />,
    },
    ...itemColumns,
  ];
  const depositColumns = [
    { key: "date", header: "Date", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (d) => formatDate(d.depositDate) },
    {
      key: "deposit",
      header: "Deposit",
      render: (d) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{depositLabel(d)}</span>
          <span className="truncate text-xs text-text-secondary">{bankName.get(d.bankAccountId) || d.bankName || "Bank account"}</span>
        </div>
      ),
    },
    { key: "items", header: "Items", align: "right", className: "text-right tabular-nums text-text-secondary", render: (d) => d.itemCount },
    { key: "status", header: "Status", render: (d) => <StatusPill status={d.status} map={BANK_DEPOSIT_STATUS_MAP} /> },
    { key: "total", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (d) => money(d.total) },
  ];

  const filtersOn = tab === "undeposited" ? property !== "all" || method !== "all" || Boolean(q) : status !== "all" || Boolean(q);
  const clearFilters = () => {
    setProperty("all");
    setMethod("all");
    setStatus("all");
    setSearch("");
  };
  const clearButton = (
    <Button variant="outline" className="border-border bg-surface-card" onClick={clearFilters}>
      Clear Filters
    </Button>
  );
  const exportCols =
    tab === "undeposited"
      ? [
          { header: "Received", key: "date", type: "date" },
          { header: "From", key: "payerName" },
          { header: "Premises", value: premises },
          { header: "Method", key: "method" },
          { header: "Reference", key: "reference" },
          { header: "Receipt", key: "receiptNo" },
          { header: "Amount", key: "amount", type: "money" },
        ]
      : [
          { header: "Date", key: "depositDate", type: "date" },
          { header: "Deposit", value: (d) => depositLabel(d) },
          { header: "Bank account", value: (d) => bankName.get(d.bankAccountId) || "" },
          { header: "Items", key: "itemCount", type: "number" },
          { header: "Status", key: "status" },
          { header: "Amount", key: "total", type: "money" },
        ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Bank Deposits"
        description="Checks, cash and money orders wait in Undeposited Funds until you take them to the bank. Group them into one deposit so the statement shows one line to reconcile."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton name={tab === "undeposited" ? "Undeposited funds" : "Bank deposits"} columns={exportCols} rows={tab === "undeposited" ? filteredItems : filteredDeposits} />
            <RoleGate allowed={canPost} reason={NO_POST}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canPost || !chosen.length} onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Create Deposit{chosen.length ? ` · ${money(sum(chosen))}` : ""}
              </Button>
            </RoleGate>
          </div>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={TABS} height="h-9" />
          {tab === "undeposited" ? (
            <>
              <FilterDropdown value={property} onValueChange={setProperty} options={propertyOptions} height="h-9" />
              <FilterDropdown value={method} onValueChange={setMethod} options={methodOptions} height="h-9" />
            </>
          ) : (
            <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_OPTIONS} height="h-9" />
          )}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder={tab === "undeposited" ? "Search payer, check # or receipt…" : "Search slip or bank…"} className="w-full sm:max-w-xs" />
      </Toolbar>

      {tab === "undeposited" ? (
        undeposited === null ? (
          <ListLoading label="Loading undeposited payments" />
        ) : undeposited.error ? (
          <Callout tone="danger">{undeposited.error}</Callout>
        ) : (
          <DataTable
            columns={undepositedColumns}
            data={filteredItems}
            getRowKey={(i) => i.lineId}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Banknote}
                  title={items.length ? "No payments match your filters" : "Nothing waiting to deposit"}
                  description={items.length ? "Try another property, method or search." : "Checks, cash and money orders recorded in the office land here until you deposit them."}
                  action={items.length ? clearButton : null}
                />
              </div>
            }
          />
        )
      ) : deposits === null ? (
        <ListLoading label="Loading deposits" />
      ) : (
        <DataTable
          columns={depositColumns}
          data={filteredDeposits}
          getRowKey={(d) => d.id}
          onRowClick={(d) => openItem(d.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Landmark}
                title={deposits.length ? "No deposits match your filters" : "No deposits yet"}
                description={deposits.length ? "Try another status or search." : "Select payments on the Undeposited tab and create a deposit."}
                action={filtersOn ? clearButton : null}
              />
            </div>
          }
        />
      )}

      <CreateDepositDialog
        open={creating}
        onOpenChange={setCreating}
        items={chosen}
        banks={banks}
        onCreated={(res) => {
          setSelected(new Set());
          reload();
          if (res?.depositId) openItem(res.depositId);
        }}
      />
    </MainScreenWrapper>
  );
}

export default BankDepositsScreen;
