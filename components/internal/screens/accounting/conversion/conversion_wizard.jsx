"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Landmark,
  Loader2,
  Plus,
  Receipt,
  Save,
  Send,
  ShieldCheck,
  Undo2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Input } from "@geiger/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Switch } from "@geiger/ui/switch";
import { DataTable, Field, SectionCard, SettingRow, SettingsList, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { cn } from "@/lib/utils";
import {
  ADMIN_KEY,
  BATCH_STATUS_MAP,
  CONVERT_KEY,
  CONVERSION_KINDS,
  isMonthStart,
  nextMonthStart,
  openingDate,
  parseMoney,
  planTrialBalance,
  validateBatch,
} from "@/lib/ledger/conversion";
import { round2 } from "@/lib/ledger/postings";
import { conversionBatchesLayer, listConversionLines, removeConversionLines, saveConversionLines } from "@/lib/supabase/conversion";
import { postConversionBatchApi, voidConversionBatchApi } from "@/lib/accounting/conversion_api";
import { leasesLayer } from "@/lib/supabase/leases";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { listProperties } from "@/lib/supabase/properties";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { getSetting } from "@/lib/supabase/settings";
import { getLedgerAccounts } from "@/lib/supabase/ledger";
import { loadOnboardingSetting } from "@/lib/onboarding/load";
import { ONBOARDING_CHANGED_EVENT } from "@/lib/onboarding/use_onboarding";
import { ConversionGrid } from "./conversion_grid";
import { formatDate, money, todayISO } from "../shared";

// Opening balances wizard (INTL-04): full-screen conversion from another system, from cutover through review (clearing $0.00, book vs statement) to post.

const STEPS = [
  { key: "cutover", title: "Cutover date", icon: CalendarClock, kinds: [] },
  { key: "banks", title: "Bank starting points", icon: Landmark, kinds: ["bank_outstanding"] },
  { key: "tenants", title: "Tenant balances", icon: Users, kinds: ["tenant_balance", "tenant_credit"] },
  { key: "deposits", title: "Deposits", icon: ShieldCheck, kinds: ["deposit"] },
  { key: "owners", title: "Owner balances", icon: UserRound, kinds: ["owner_balance"] },
  { key: "bills", title: "Unpaid bills", icon: Receipt, kinds: ["bill"] },
  { key: "gl", title: "Other GL balances", icon: BookOpen, kinds: ["gl_balance"] },
  { key: "review", title: "Review", icon: ClipboardCheck, kinds: [] },
  { key: "post", title: "Post", icon: Send, kinds: [] },
];
const STEP_OF_KIND = Object.fromEntries(STEPS.flatMap((s, i) => s.kinds.map((k) => [k, i])));
const LIVE_LEASES = new Set(["Active", "Expiring soon", "Month-to-month", "Notice given"]);
const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";

const freshBatch = () => ({ id: null, name: "Opening balances", cutoverDate: nextMonthStart(todayISO()), status: "Draft", totals: {}, metadata: { banks: [], ytd: false } });
const metaOf = (b) => (b?.metadata && typeof b.metadata === "object" ? b.metadata : {});
const blankCopy = (l, batchId) => {
  const { depositId: _d, linked: _l, adopted: _a, ...metadata } = l.metadata || {};
  return { ...l, id: crypto.randomUUID(), batchId, postedEntryId: "", metadata };
};

async function loadLookups() {
  const [leases, owners, vendors, properties, banks, accounts, fees, onboarding] = await Promise.all([
    leasesLayer.list(),
    ownersLayer.list(),
    vendorsLayer.list(),
    listProperties(),
    bankAccountsLayer.list(),
    getLedgerAccounts({ fresh: true }),
    getSetting("fees_policies"),
    loadOnboardingSetting(),
  ]);
  return {
    lookups: {
      leases: (leases || []).map((l) => ({ id: l.id, name: l.name, unit: l.unit, tenantName: l.tenantName, propertyId: l.propertyId, tenantId: l.tenantId, unitId: l.unitId, active: LIVE_LEASES.has(l.status) })),
      owners: owners || [],
      vendors: vendors || [],
      properties: properties || [],
      banks: (banks || []).filter((b) => b.status !== "Closed"),
      accounts: accounts || { byId: new Map(), byKey: new Map(), list: [] },
    },
    depositHeldIn: fees?.depositHeldIn || "trust",
    live: Boolean(onboarding?.goLiveAt),
  };
}

function Callout({ tone = "info", children }) {
  const tones = {
    info: "border-border bg-surface-card text-text-secondary",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    danger: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  };
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

// Statement date + balance per bank, beside the book the batch builds for it.
function BankStarts({ banks, starts, perBank, readOnly, onChange }) {
  const byId = new Map(starts.map((s) => [s.bankAccountId, s]));
  const set = (bankAccountId, patch) => {
    const cur = byId.get(bankAccountId) || { bankAccountId, statementDate: "", statementBalance: "" };
    const next = { ...cur, ...patch };
    onChange([...starts.filter((s) => s.bankAccountId !== bankAccountId), next].filter((s) => s.statementDate || s.statementBalance !== ""));
  };
  if (!banks.length) return <Callout tone="warning">No bank accounts yet — add your operating, trust and deposit accounts in Bank Accounts first.</Callout>;
  return (
    <SectionCard title="Last statement per bank" description="From the last bank reconciliation in your old system. Each bank's first reconciliation in Geiger opens at this balance." bodyPadding={false}>
      <ul className="divide-y divide-border">
        {banks.map((b) => {
          const s = byId.get(b.id) || {};
          const row = perBank[b.id];
          return (
            <li key={b.id} className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{b.name}</p>
                <p className="text-xs text-text-secondary">
                  {b.accountType || "Bank"}
                  {row ? ` · book ${money(row.book)} · less outstanding ${money(row.cleared)}` : ""}
                  {row?.diff ? ` · off by ${money(row.diff)}` : row?.hasStart ? " · agrees" : ""}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:w-96">
                <Input type="date" aria-label={`${b.name} statement date`} value={s.statementDate || ""} disabled={readOnly} onChange={(e) => set(b.id, { statementDate: e.target.value })} className="h-9 bg-surface-card" />
                <Input
                  inputMode="decimal"
                  aria-label={`${b.name} statement balance`}
                  placeholder="Statement balance"
                  defaultValue={s.statementBalance ?? ""}
                  key={`${b.id}-${s.statementBalance ?? ""}`}
                  disabled={readOnly}
                  onBlur={(e) => {
                    const n = e.target.value.trim() === "" ? "" : parseMoney(e.target.value);
                    if (n !== "" && !Number.isFinite(n)) return toast.error("That isn't an amount.");
                    if (n !== (s.statementBalance ?? "")) set(b.id, { statementBalance: n });
                  }}
                  className="h-9 bg-surface-card text-right tabular-nums"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function Review({ v, accounts, opening, onGoTo, kindsWithErrors }) {
  const tb = useMemo(() => planTrialBalance(v.entries, accounts), [v.entries, accounts]);
  const tbTotals = { label: "Totals", debit: round2(tb.reduce((s, r) => s + Math.max(0, r.debit - r.credit), 0)), credit: round2(tb.reduce((s, r) => s + Math.max(0, r.credit - r.debit), 0)) };
  const banks = Object.values(v.perBank);
  const t = v.totals;
  return (
    <div className="space-y-5">
      <StatsBar
        stats={[
          { label: "Conversion clearing", value: money(v.clearingNet), footer: Math.abs(v.clearingNet) < 0.005 ? "Nets to $0.00" : "Must be $0.00 to post" },
          { label: "Tenant balances", value: money(t.tenantBalances), footer: `${money(t.tenantCredits)} in credits` },
          { label: "Deposits held", value: money(t.deposits), footer: t.depositInterest ? `+ ${money(t.depositInterest)} interest` : `${t.byKind.deposit.count} deposits` },
          { label: "Owner balances", value: money(t.ownerBalances), footer: `${money(t.bills)} in unpaid bills` },
        ]}
      />
      {Math.abs(v.clearingNet) < 0.005 ? (
        <Callout tone="success">Conversion clearing nets to $0.00: the subledgers and the GL balances agree.</Callout>
      ) : (
        <Callout tone="danger">
          Conversion clearing is off by <span className="font-semibold">{money(v.clearingNet)}</span>, so Post stays off. Clearing collects the other side of every balance — when the tenant, owner and bill totals match the old trial balance it nets to zero. Check the Other GL balances (owner or company equity is the usual gap).
        </Callout>
      )}
      <SectionCard title="Book vs statement" description="Per bank: the book this batch builds, less what's still outstanding, against the old statement." bodyPadding={false}>
        <DataTable
          columns={[
            { key: "name", header: "Bank", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
            { key: "book", header: "Book", align: "right", className: "text-right tabular-nums", render: (r) => money(r.book) },
            { key: "out", header: "Outstanding checks", align: "right", className: "text-right tabular-nums", render: (r) => money(r.outstandingOut) },
            { key: "in", header: "Deposits in transit", align: "right", className: "text-right tabular-nums", render: (r) => money(r.outstandingIn) },
            { key: "statement", header: "Statement", align: "right", className: "text-right tabular-nums", render: (r) => (r.hasStart ? `${money(r.statement)} · ${formatDate(r.statementDate)}` : "No starting point") },
            {
              key: "diff",
              header: "Difference",
              align: "right",
              className: "text-right",
              render: (r) => (!r.hasStart ? <span className="text-xs text-amber-700 dark:text-amber-400">Opens at $0.00</span> : Math.abs(r.diff) < 0.005 ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Agrees</span> : <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{money(r.diff)}</span>),
            },
          ]}
          data={banks}
          getRowKey={(r) => r.bankAccountId}
          empty={<p className="px-5 py-6 text-sm text-text-secondary">No bank balances in this batch yet.</p>}
          className="rounded-none border-0"
        />
      </SectionCard>
      {v.errors.length || v.warnings.length ? (
        <SectionCard title={v.errors.length ? `${v.errors.length} to fix before posting` : "Worth a look"} description={kindsWithErrors.length ? "Open a step to fix its rows." : undefined}>
          <ul className="space-y-1.5 text-sm">
            {v.errors.map((e, i) => (
              <li key={`e${i}`} className="flex items-start gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">{e.message}</span>
                {e.kind ? (
                  <button type="button" className="shrink-0 text-xs font-medium underline-offset-2 hover:underline" onClick={() => onGoTo(STEP_OF_KIND[e.kind])}>
                    {STEPS[STEP_OF_KIND[e.kind]]?.title}
                  </button>
                ) : null}
              </li>
            ))}
            {v.warnings.map((w, i) => (
              <li key={`w${i}`} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
      <SectionCard title={`Trial balance as of ${formatDate(opening)}`} description="What the Trial Balance will show the day before cutover — compare it with your old system's." bodyPadding={false}>
        <DataTable
          columns={[
            { key: "label", header: "Account", render: (r) => <span className={r.isTotal ? "font-semibold text-foreground" : "text-foreground"}>{r.label}</span> },
            { key: "debit", header: "Debit", align: "right", className: "text-right tabular-nums", render: (r) => (r.isTotal ? money(r.debit) : r.debit - r.credit > 0 ? money(r.debit - r.credit) : "") },
            { key: "credit", header: "Credit", align: "right", className: "text-right tabular-nums", render: (r) => (r.isTotal ? money(r.credit) : r.credit - r.debit > 0 ? money(r.credit - r.debit) : "") },
          ]}
          data={tb.length ? [...tb.map((r) => ({ ...r, id: r.glAccountId })), { ...tbTotals, id: "total", isTotal: true }] : []}
          getRowKey={(r) => r.id}
          empty={<p className="px-5 py-6 text-sm text-text-secondary">Nothing to post yet.</p>}
          className="rounded-none border-0"
        />
      </SectionCard>
    </div>
  );
}

export function ConversionWizard({ open, onOpenChange, onChanged }) {
  const canConvert = usePermission(CONVERT_KEY);
  const isAdmin = usePermission(ADMIN_KEY);
  const canVoid = usePermission("property.accounting.void");
  const [data, setData] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState(freshBatch);
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(() => new Set());
  const [removed, setRemoved] = useState(() => new Set());
  const [batchDirty, setBatchDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [result, setResult] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

  // Reset whenever the wizard reopens (render-phase reset).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setData(null);
      setStep(0);
      setResult(null);
      setLoadKey((k) => k + 1);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    Promise.all([loadLookups(), conversionBatchesLayer.list()]).then(async ([loaded, list]) => {
      const all = list || [];
      const pick = all.find((b) => b.status === "Draft") || all[0] || null;
      const rows = pick ? await listConversionLines(pick.id) : [];
      if (!alive) return;
      setBatches(all);
      setBatch(pick || freshBatch());
      setLines(rows || []);
      setDirty(new Set());
      setRemoved(new Set());
      setBatchDirty(false);
      setData({ ...loaded, failed: list === null || rows === null });
    });
    return () => {
      alive = false;
    };
  }, [open, loadKey]);

  const meta = metaOf(batch);
  const live = Boolean(data?.live);
  const editable = batch.status === "Draft" && canConvert && (!live || isAdmin);
  const unsaved = batchDirty || dirty.size > 0 || removed.size > 0;
  const opening = openingDate(batch.cutoverDate);

  const v = useMemo(
    () => (data ? validateBatch(lines, data.lookups.accounts, { batch: { id: batch.id || "draft", cutoverDate: batch.cutoverDate, metadata: meta }, banks: data.lookups.banks, depositHeldIn: data.depositHeldIn }) : null),
    [data, lines, batch.id, batch.cutoverDate, meta],
  );
  const problems = useMemo(() => {
    const map = new Map();
    const at = (id) => map.get(id) || map.set(id, { errors: [], warnings: [] }).get(id);
    for (const e of v?.errors || []) if (e.lineId) at(e.lineId).errors.push(e.message);
    for (const w of v?.warnings || []) if (w.lineId) at(w.lineId).warnings.push(w.message);
    return map;
  }, [v]);
  const kindsWithErrors = useMemo(() => [...new Set((v?.errors || []).map((e) => e.kind).filter(Boolean))], [v]);
  const byKind = useMemo(() => Object.fromEntries(CONVERSION_KINDS.map((k) => [k, lines.filter((l) => l.kind === k)])), [lines]);

  const patchBatch = (patch) => {
    setBatch((b) => ({ ...b, ...patch, metadata: patch.metadata ? { ...metaOf(b), ...patch.metadata } : metaOf(b) }));
    setBatchDirty(true);
  };
  const touch = (ids) => setDirty((d) => new Set([...d, ...ids]));
  const patchLine = (id, patch) => {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    touch([id]);
  };
  const addLines = (rows) => {
    setLines((ls) => [...ls, ...rows]);
    touch(rows.map((r) => r.id));
  };
  const removeLine = (id) => {
    setLines((ls) => ls.filter((l) => l.id !== id));
    setDirty((d) => new Set([...d].filter((x) => x !== id)));
    setRemoved((r) => new Set([...r, id]));
  };

  // Persist the draft: the batch row first (created on the first save), then edited and removed lines.
  const save = async ({ quiet = false } = {}) => {
    if (!editable || !unsaved) return batch;
    setBusy("save");
    let saved = batch;
    if (!batch.id) saved = await conversionBatchesLayer.create({ id: crypto.randomUUID(), name: batch.name, cutoverDate: batch.cutoverDate, status: "Draft", metadata: meta });
    else if (batchDirty) saved = await conversionBatchesLayer.update(batch.id, { name: batch.name, cutoverDate: batch.cutoverDate, metadata: meta });
    const ok =
      Boolean(saved) &&
      (await saveConversionLines(
        saved.id,
        lines.filter((l) => dirty.has(l.id)),
      )) &&
      (await removeConversionLines([...removed]));
    setBusy("");
    if (!ok) {
      toast.error("Couldn't save the opening balances — check the cutover date and try again.");
      return null;
    }
    setBatch(saved);
    setBatches((list) => [saved, ...list.filter((b) => b.id !== saved.id)]);
    setDirty(new Set());
    setRemoved(new Set());
    setBatchDirty(false);
    if (!quiet) toast.success("Saved.");
    return saved;
  };

  const goTo = async (i) => {
    if (i === step || i < 0 || i >= STEPS.length) return;
    if (unsaved && !(await save({ quiet: true }))) return;
    setStep(i);
  };
  const close = async () => {
    if (unsaved && editable && !(await save({ quiet: true }))) return;
    onOpenChange(false);
  };
  const switchBatch = async (id) => {
    if (unsaved && editable && !(await save({ quiet: true }))) return;
    const next = batches.find((b) => b.id === id);
    if (!next) return;
    setBusy("load");
    const rows = await listConversionLines(id);
    setBusy("");
    setBatch(next);
    setLines(rows || []);
    setResult(null);
  };

  const post = async () => {
    const saved = await save({ quiet: true });
    if (!saved?.id) return;
    setBusy("post");
    const res = await postConversionBatchApi(saved.id);
    setBusy("");
    if (!res.ok) {
      toast.error(res.error || "Couldn't post the opening balances.");
      return;
    }
    toast.success(res.created ? `Posted ${res.created} opening ${res.created === 1 ? "entry" : "entries"}.` : "Already posted — nothing new.");
    setResult(res);
    window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
    onChanged?.();
    const [fresh, rows] = await Promise.all([conversionBatchesLayer.get(saved.id), listConversionLines(saved.id)]);
    if (fresh) setBatch(fresh);
    if (rows) setLines(rows);
    setBatches((list) => list.map((b) => (b.id === saved.id ? fresh || b : b)));
  };

  const voidIt = async () => {
    setBusy("void");
    const res = await voidConversionBatchApi(batch.id);
    setBusy("");
    setConfirmVoid(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't void the opening balances.");
      return;
    }
    toast.success(`Voided ${res.voided} ${res.voided === 1 ? "entry" : "entries"}; every account is back to where it was.`);
    window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
    onChanged?.();
    setResult(null);
    const fresh = await conversionBatchesLayer.get(batch.id);
    if (fresh) {
      setBatch(fresh);
      setBatches((list) => list.map((b) => (b.id === fresh.id ? fresh : b)));
    }
  };

  // A new draft; `copy` brings the lines of a voided batch over with new ids (their keys are spent).
  const newDraft = async (copy = false) => {
    setBusy("new");
    const next = await conversionBatchesLayer.create({ id: crypto.randomUUID(), name: copy ? `${batch.name} (copy)` : "Opening balances", cutoverDate: copy ? batch.cutoverDate : nextMonthStart(todayISO()), status: "Draft", metadata: copy ? { banks: meta.banks || [], ytd: Boolean(meta.ytd), billingStartsOn: meta.billingStartsOn || "" } : { banks: [], ytd: false } });
    const copied = copy && next ? lines.map((l) => blankCopy(l, next.id)) : [];
    const ok = next && (!copied.length || (await saveConversionLines(next.id, copied)));
    setBusy("");
    if (!ok) {
      toast.error("Couldn't start a new batch.");
      return;
    }
    setBatches((list) => [next, ...list]);
    setBatch(next);
    setLines(copied);
    setResult(null);
    setStep(copy ? 7 : 0);
  };

  const gridProps = (kind) => ({
    kind,
    lines: byKind[kind] || [],
    lookups: data.lookups,
    problems,
    readOnly: !editable,
    batchId: batch.id || "",
    ytd: Boolean(meta.ytd),
    depositHeldIn: data.depositHeldIn,
    onPatch: patchLine,
    onAdd: addLines,
    onRemove: removeLine,
  });

  const billingStart = (meta.billingStartsOn || batch.cutoverDate || "").slice(0, 7);
  const body = () => {
    switch (STEPS[step].key) {
      case "cutover":
        return (
          <div className="space-y-5">
            {live ? <Callout tone="warning">This project is live, so only an admin can post another batch, and posted batches can no longer be voided.</Callout> : null}
            <SectionCard title="When Geiger takes over" description={opening ? `Geiger runs the books from ${formatDate(batch.cutoverDate)}; everything below is as of the close of ${formatDate(opening)}.` : "Pick the first day Geiger runs the books."}>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Cutover date" hint={batch.cutoverDate && !isMonthStart(batch.cutoverDate) ? "Cut over on the first day of a month." : "The first day of a month."}>
                  <Input type="date" value={batch.cutoverDate || ""} disabled={!editable} onChange={(e) => patchBatch({ cutoverDate: e.target.value })} className="bg-surface-card" />
                </Field>
                <Field label="First month Geiger bills rent" hint="Keep the cutover month unless your old system already billed it (that rent is in the balances you enter).">
                  <Input type="month" value={billingStart} min={(batch.cutoverDate || "").slice(0, 7)} disabled={!editable} onChange={(e) => patchBatch({ metadata: { billingStartsOn: e.target.value ? `${e.target.value}-01` : "" } })} className="bg-surface-card" />
                </Field>
                <Field label="Batch name">
                  <Input value={batch.name || ""} disabled={!editable} onChange={(e) => patchBatch({ name: e.target.value })} className="bg-surface-card" />
                </Field>
              </div>
              <div className="mt-4">
                <SettingsList>
                  <SettingRow
                    title="Bring in this year's income and expenses"
                    description="For a mid-year cutover, owner statements and 1099s need the year so far. Enter it under Other GL balances, dated by month, with the vendor on 1099 expenses."
                    control={<Switch checked={Boolean(meta.ytd)} disabled={!editable} onCheckedChange={(on) => patchBatch({ metadata: { ytd: Boolean(on) } })} aria-label="Bring in year-to-date income and expenses" />}
                  />
                </SettingsList>
              </div>
            </SectionCard>
            <SectionCard title="Reports to pull from your old system" description={`All as of ${opening ? formatDate(opening) : "the day before cutover"}. Each step has a template matching these reports, or paste the report's rows straight in.`}>
              <ul className="grid gap-2 text-sm text-text-secondary md:grid-cols-2">
                {[
                  ["Bank reconciliation", "statement date and balance, outstanding checks and deposits"],
                  ["Aged receivables", "each tenant's open charges, oldest first"],
                  ["Tenant credits", "prepaid rent and credit balances"],
                  ["Security deposit register", "deposit and interest held per lease"],
                  ["Owner balances", "cash held per owner, excluding tenant prepayments and deposits"],
                  ["Payable aging", "unpaid bills with invoice and due dates"],
                  ["Trial balance", "everything else, and to check the result"],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                    <span>
                      <span className="font-medium text-foreground">{t}</span> — {d}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        );
      case "banks":
        return (
          <div className="space-y-5">
            <BankStarts banks={data.lookups.banks} starts={Array.isArray(meta.banks) ? meta.banks : []} perBank={v.perBank} readOnly={!editable} onChange={(banks) => patchBatch({ metadata: { banks } })} />
            <ConversionGrid {...gridProps("bank_outstanding")} title="Outstanding items" description="Checks written and deposits made that weren't on the last statement. Each stays outstanding for its owner until it clears." />
          </div>
        );
      case "tenants":
        return (
          <div className="space-y-5">
            <ConversionGrid {...gridProps("tenant_balance")} title="Open charges" description="One row per unpaid charge, with its original date so aging and oldest-first payments work. Residents can pay these from the portal." />
            <ConversionGrid {...gridProps("tenant_credit")} title="Credits & prepaid rent" description="Money residents have paid ahead; it's held for them in trust." />
          </div>
        );
      case "deposits":
        return <ConversionGrid {...gridProps("deposit")} title="Deposits held" description="Each becomes a Held deposit record linked to its ledger lines, so it can be disposed at move-out. A lease already holding an unlinked deposit on the ledger is linked, not posted twice." />;
      case "owners":
        return <ConversionGrid {...gridProps("owner_balance")} title="Owner balances" description="Each owner's cash in trust, excluding tenant prepayments and deposits. Leave Owner empty to split a property's balance by ownership." />;
      case "bills":
        return <ConversionGrid {...gridProps("bill")} title="Unpaid bills" description="Each becomes an approved, unpaid bill in Bills & Payables, paid the usual way." />;
      case "gl":
        return <ConversionGrid {...gridProps("gl_balance")} title="Other GL balances" description="From the old trial balance: accounts no other step covers — operating cash, fixed assets, owner or company equity, and this year's income and expenses for a mid-year cutover. Receivables, payables, deposits and prepaid come from the earlier steps." />;
      case "review":
        return <Review v={v} accounts={data.lookups.accounts} opening={opening} onGoTo={goTo} kindsWithErrors={kindsWithErrors} />;
      default:
        return (
          <div className="space-y-5">
            {batch.status === "Posted" ? (
              <SectionCard title="Posted" description={`On ${formatDate(String(batch.postedAt || "").slice(0, 10))}.`}>
                <div className="space-y-3 text-sm text-text-secondary">
                  <p>
                    {batch.totals?.posted ?? "The"} opening entries are on the ledger, dated {formatDate(opening)}. Deposit records, unpaid bills and the banks&apos; starting reconciliations are in place, and rent billing starts {formatDate(`${billingStart}-01`)}.
                  </p>
                  {(result?.warnings || []).map((w) => (
                    <Callout key={w} tone="warning">
                      {w}
                    </Callout>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {!live && canVoid && canConvert ? (
                      <Button variant="outline" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={() => setConfirmVoid(true)}>
                        <Undo2 className="h-4 w-4" /> Void batch
                      </Button>
                    ) : null}
                    {canConvert && (!live || isAdmin) ? (
                      <Button variant="outline" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={() => newDraft(false)}>
                        <Plus className="h-4 w-4" /> Start another batch
                      </Button>
                    ) : null}
                  </div>
                  {live ? <p className="text-xs">The project is live: correct opening balances with a journal entry rather than a void.</p> : null}
                </div>
              </SectionCard>
            ) : batch.status === "Voided" ? (
              <SectionCard title="Voided" description="Every entry in this batch was reversed on its own date.">
                {canConvert && (!live || isAdmin) ? (
                  <Button variant="outline" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={() => newDraft(true)}>
                    <Copy className="h-4 w-4" /> Copy into a new draft
                  </Button>
                ) : (
                  <p className="text-sm text-text-secondary">Nothing to do here.</p>
                )}
              </SectionCard>
            ) : (
              <SectionCard title="Ready to post?" description={`Posting writes ${v.entries.length} entries dated ${opening ? formatDate(opening) : "—"}, creates the deposit records and bills, finalizes ${v.totals.banksWithStart} starting reconciliation${v.totals.banksWithStart === 1 ? "" : "s"}, and starts rent billing on ${billingStart ? formatDate(`${billingStart}-01`) : "the cutover"}. Posting again later never doubles anything.`}>
                <ul className="mb-4 space-y-1.5 text-sm">
                  {[
                    [v.ready, v.ready ? "Every balance checks out and clearing nets to $0.00" : `${v.errors.length} problem${v.errors.length === 1 ? "" : "s"} to fix — see Review`],
                    [canConvert, canConvert ? "Your role can post opening balances" : "Your role can't post opening balances (Post opening balances permission)"],
                    [!live || isAdmin, live ? (isAdmin ? "The project is live — posting as an admin" : "The project is live — only an admin can post") : "The project isn't live yet, so this batch can be voided if it's wrong"],
                  ].map(([ok, label]) => (
                    <li key={label} className={cn("flex items-start gap-2", ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!v.ready || !editable || Boolean(busy)} onClick={post} title={v.ready ? undefined : `Clearing is off by ${money(v.clearingNet)}`}>
                  {busy === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Post opening balances
                </Button>
                {!v.ready && Math.abs(v.clearingNet) >= 0.005 ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">Post is off: conversion clearing is off by {money(v.clearingNet)}.</p> : null}
              </SectionCard>
            )}
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold text-foreground">Opening balances</DialogTitle>
              {data ? <StatusPill status={batch.status} map={BATCH_STATUS_MAP} /> : null}
            </div>
            <DialogDescription className="text-xs text-text-secondary">
              {batch.cutoverDate ? `Cutover ${formatDate(batch.cutoverDate)} · balances as of ${formatDate(opening)}` : "Bring balances over from your old system"}
            </DialogDescription>
          </div>
          {data && batches.length > 1 ? (
            <Select value={batch.id || ""} onValueChange={switchBatch}>
              <SelectTrigger className="h-9 w-56 bg-surface-card text-sm" aria-label="Batch">
                <SelectValue placeholder="Batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name || "Batch"} · {b.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {data && editable ? (
            <Button variant="outline" size="sm" className="border-border bg-surface-card" disabled={!unsaved || Boolean(busy)} onClick={() => save()}>
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {unsaved ? "Save" : "Saved"}
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" className={GHOST} aria-label="Close" disabled={busy === "post" || busy === "void"} onClick={close}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        {!data ? (
          <div className="flex flex-1 items-center justify-center">
            <LogoLoading size={88} aria-label="Loading opening balances" />
          </div>
        ) : data.failed ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Callout tone="danger">The opening balances couldn&apos;t be loaded. Close and try again in a moment.</Callout>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <nav className="hidden w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3 md:flex" aria-label="Steps">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const count = s.kinds.reduce((n, k) => n + (byKind[k]?.length || 0), 0);
                const bad = s.kinds.some((k) => kindsWithErrors.includes(k)) || (s.key === "review" && v.errors.length > 0);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => goTo(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === step ? "bg-surface-card font-medium text-foreground" : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">
                      {i + 1}. {s.title}
                    </span>
                    {bad ? <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Has problems" /> : count ? <span className="text-xs tabular-nums text-text-tertiary">{count}</span> : null}
                  </button>
                );
              })}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Step {step + 1} of {STEPS.length}
                    </p>
                    <h2 className="text-xl font-semibold text-foreground">{STEPS[step].title}</h2>
                  </div>
                  {!editable && batch.status === "Draft" ? (
                    <Callout tone="warning">{!canConvert ? "View only — your role can't post opening balances." : "View only — the project is live, so only an admin can change and post opening balances."}</Callout>
                  ) : null}
                  {body()}
                </div>
              </div>
              <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface-subtle/40 px-4 py-3 md:px-8">
                <Button variant="ghost" className={GHOST} disabled={step === 0 || Boolean(busy)} onClick={() => goTo(step - 1)}>
                  Back
                </Button>
                <span className="hidden text-xs text-text-secondary sm:block">
                  Clearing {money(v.clearingNet)} · {v.errors.length ? `${v.errors.length} to fix` : "no problems"}
                </span>
                {step < STEPS.length - 1 ? (
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={() => goTo(step + 1)}>
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Continue
                  </Button>
                ) : (
                  <span />
                )}
              </footer>
            </div>
          </div>
        )}

        <Dialog open={confirmVoid} onOpenChange={(o) => !o && busy !== "void" && setConfirmVoid(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Void these opening balances?</DialogTitle>
              <DialogDescription>Every entry is reversed on its own date, the deposit records and bills it created are removed, and the starting reconciliations are undone. Copy it into a new draft to fix and post again.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" className={GHOST} disabled={busy === "void"} onClick={() => setConfirmVoid(false)}>
                Cancel
              </Button>
              <Button className="bg-red-600 text-white hover:bg-red-600/90" disabled={busy === "void"} onClick={voidIt}>
                {busy === "void" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Void batch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default ConversionWizard;
