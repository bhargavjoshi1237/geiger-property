"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, CircleCheck, Loader2, Plus, Printer, ShieldAlert, Tags, Trash2, Undo2 } from "lucide-react";

import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { chargeDepositApi, receiptHtmlApi, recordDepositReceivedApi, recordPaymentApi, sweepDepositApi } from "@/lib/billing/api";
import { OVERRIDE_PERMISSION, PAPER_METHODS, PAYMENT_METHODS, receiptRequirement } from "@/lib/billing/payment_rules";
import { usesUndepositedFunds } from "@/lib/billing/settings";
import { withPaymentDefaults } from "@/lib/payments/constants";
import { getSetting } from "@/lib/supabase/settings";
import { getTenant } from "@/lib/supabase/tenants";
import { DEPOSIT_KIND_OPTIONS } from "@/components/internal/screens/leasing/shared";
import { listOwnersOfProperty } from "@/lib/supabase/property_owners";
import { listProperties } from "@/lib/supabase/properties";
import { listUnits } from "@/lib/supabase/units";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { leasesLayer } from "@/lib/supabase/leases";
import { reverseEntryApi } from "@/lib/accounting/journal_api";
import { manualJournalInput } from "@/lib/ledger/journal_io";
import { OWNER_SOURCE_TYPES, isLiveOn } from "@/lib/ledger/ownership";
import {
  getLedgerAccounts,
  ledgerErrorMessage,
  listOpenCharges,
  postEntry,
  postCredit,
  voidEntry,
} from "@/lib/supabase/ledger";
import { accountLabel, allocateOldestFirst, round2, SOURCE_LABELS } from "@/lib/ledger/postings";
import { usePermission } from "@/context/rbac-context";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { formatDate, money, todayISO } from "./shared";
import { BooksClosedNote, defaultPostingDate, useLockedThrough } from "./period_lock";

// Ledger posting dialogs shared by the ledger section, General Ledger and the
// accounting screens: GL / bank pickers, the post-entry dialog (charge, payment,
// credit, bill, owner funds…), a manual journal editor with line dimensions, and the void and reverse confirmations.

const NONE = "__none__";

// Advisory RBAC for ledger controls: posting needs accounting.post, voiding accounting.void.
export const NO_POST = "Your role can't post to the ledger.";
export const NO_VOID = "Your role can't void ledger entries.";
export const useCanPost = () => usePermission("accounting.post");
export const useCanVoid = () => usePermission("accounting.void");

const METHODS = ["ACH", "Check", "Card", "Cash", "Money order", "Wire"];

// Who paid a voucher lease's payment (HOUS-01): the housing authority's settles its own receivable, never the tenant's balance.
const PAYERS = [
  { value: "tenant", label: "Tenant" },
  { value: "housing_authority", label: "Housing authority" },
];

// Open a payment's printable receipt in a new tab (CORE-11); the tab opens first so the browser doesn't block it.
export async function openReceipt(entryId) {
  const win = window.open("", "_blank");
  const res = await receiptHtmlApi(entryId);
  if (!res.ok) {
    win?.close();
    toast.error(res.error || "Couldn't load the receipt.");
    return false;
  }
  const url = URL.createObjectURL(new Blob([res.html], { type: "text/html;charset=utf-8" }));
  if (win) win.location.href = url;
  else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

// What happened to a receipt email, in words.
export function receiptStatusText(r) {
  switch (r?.status) {
    case "sent":
      return `Receipt emailed to ${r.to}.`;
    case "sending":
      return `Receipt is on its way to ${r.to}.`;
    case "disabled":
      return "Receipt emails are turned off in Notifications — print the receipt instead.";
    case "not_configured":
      return "Email isn't set up on this server — print the receipt instead.";
    case "no_address":
      return "There's no email on file — print the receipt for the resident.";
    case "not_requested":
      return "";
    default:
      return r?.error ? `The receipt email failed (${r.error}). Print it, or send it again from the ledger.` : "";
  }
}

// Posting kinds → dialog copy + which pickers they need.
export const POST_KINDS = {
  charge: { title: "Post a charge", verb: "Post Charge", account: { label: "Income account", types: ["Income"], fallback: "rent_income" } },
  late_fee: { title: "Post a late fee", verb: "Post Late Fee", account: { label: "Income account", types: ["Income"], fallback: "late_fee_income" } },
  payment: { title: "Record a payment", verb: "Record Payment", bank: true, method: true, allocate: true },
  credit: { title: "Post a credit", verb: "Post Credit", account: { label: "Credit account", types: ["Income", "Expense"], fallback: "concessions" }, allocate: true },
  bill: { title: "Post a bill", verb: "Post Bill", account: { label: "Expense account", types: ["Expense", "Asset"], fallback: "repairs_maintenance" } },
  bill_payment: { title: "Pay a bill", verb: "Record Payment", bank: true, method: true },
  distribution: { title: "Owner distribution", verb: "Post Distribution", bank: true },
  contribution: { title: "Owner contribution", verb: "Post Contribution", bank: true },
  management_fee: { title: "Post a management fee", verb: "Post Fee" },
};

// Loads the account index once (seeding the default chart when it's missing).
export function useLedgerAccounts(open = true) {
  const [accounts, setAccounts] = useState(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getLedgerAccounts().then((idx) => alive && setAccounts(idx || { byId: new Map(), byKey: new Map(), list: [] }));
    return () => {
      alive = false;
    };
  }, [open]);
  return accounts;
}

const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true });

// GL account picker over the loaded chart, narrowed by type / subtype.
export function AccountSelect({ id, accounts, value, onChange, types, subtypes, placeholder = "Select an account…", allowNone = false }) {
  const options = useMemo(
    () =>
      (accounts?.list || [])
        .filter((a) => a.status !== "Inactive")
        .filter((a) => !types || types.includes(a.accountType))
        .filter((a) => !subtypes || subtypes.includes(a.subtype))
        .sort(byNumber),
    [accounts, types, subtypes],
  );
  return (
    <Select value={value || (allowNone ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="bg-surface-card">
        <SelectValue placeholder={accounts ? placeholder : "Loading accounts…"} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>None</SelectItem> : null}
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {accountLabel(a)}
            {a.isTrust ? " · Trust" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Bank account picker; "Default" leaves the system cash account in charge.
export function BankAccountSelect({ id, value, onChange, defaultLabel = "Default trust cash" }) {
  const [banks, setBanks] = useState(null);
  useEffect(() => {
    let alive = true;
    bankAccountsLayer.list().then((rows) => alive && setBanks((rows || []).filter((b) => b.status !== "Closed")));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="bg-surface-card">
        <SelectValue placeholder={banks ? "Select…" : "Loading…"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{defaultLabel}</SelectItem>
        {(banks || []).map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {[b.name, b.accountType].filter(Boolean).join(" · ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Open charges with editable allocation amounts (oldest-first by default).
function AllocationEditor({ items, amount, allocations, onChange, manual, onManual }) {
  if (!items) return <p className="text-xs text-text-tertiary">Loading open charges…</p>;
  if (!items.length) return <p className="text-xs text-text-secondary">No open charges — the full amount is held as a credit.</p>;
  const auto = allocateOldestFirst(items, amount).allocations;
  const current = manual ? allocations : auto;
  const amountFor = (entryId) => current.find((a) => a.entryId === entryId)?.amount ?? 0;
  const applied = round2(current.reduce((s, a) => s + (Number(a.amount) || 0), 0));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Apply to open charges</p>
        <button
          type="button"
          className="text-xs font-medium text-text-secondary hover:text-foreground"
          onClick={() => {
            if (!manual) onChange(auto);
            onManual(!manual);
          }}
        >
          {manual ? "Use oldest first" : "Choose charges"}
        </button>
      </div>
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {items.map((i) => (
          <li key={i.entryId} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{i.memo || SOURCE_LABELS[i.sourceType] || "Charge"}</p>
              <p className="text-xs text-text-secondary">
                {formatDate(i.date)} · {money(i.open)} open
              </p>
            </div>
            {manual ? (
              <Input
                type="number"
                className="h-8 w-28 text-right"
                value={amountFor(i.entryId) || ""}
                placeholder="0.00"
                onChange={(e) => {
                  const v = Math.min(Number(e.target.value) || 0, i.open);
                  const rest = current.filter((a) => a.entryId !== i.entryId);
                  onChange(v > 0 ? [...rest, { entryId: i.entryId, amount: v }] : rest);
                }}
              />
            ) : (
              <span className="text-sm tabular-nums text-text-secondary">{money(amountFor(i.entryId))}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-secondary">
        Applied {money(applied)}
        {amount > applied ? ` · ${money(round2(amount - applied))} held as a credit` : ""}
      </p>
    </div>
  );
}

const EMPTY = { date: "", amount: "", memo: "", glAccountId: "", bankAccountId: "", method: "ACH", reference: "", ownerId: "" };

// Owner picker for a distribution / contribution posted from a property: its owners, live ones first with their share.
function OwnerOfPropertySelect({ id, rows, date, value, onChange }) {
  const options = useMemo(() => {
    const byOwner = new Map();
    for (const r of rows || []) {
      const live = isLiveOn(r, date);
      const cur = byOwner.get(r.ownerId) || { ownerId: r.ownerId, name: r.ownerName || "Owner", pct: 0, live: false };
      if (live) cur.pct += Number(r.ownershipPct) || 0;
      cur.live = cur.live || live;
      byOwner.set(r.ownerId, cur);
    }
    return [...byOwner.values()].sort((a, b) => Number(b.live) - Number(a.live) || b.pct - a.pct);
  }, [rows, date]);
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger id={id} className="bg-surface-card">
        <SelectValue placeholder={rows ? (options.length ? "Select the owner…" : "No owners on this property") : "Loading owners…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.ownerId} value={o.ownerId}>
            {o.name}
            {o.live ? ` · ${o.pct}%` : " · former owner"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Post one ledger event. `dims` = the scope ids stamped on the entry
// ({ leaseId, tenantId, unitId, propertyId, ownerId, vendorId, jobId });
// `defaults` pre-fills the draft (amount, memo, sourceId, billEntryId…).
// `payers` adds "Paid by" to a voucher lease's payment; `defaultPayer` "housing_authority" records the housing authority's.
// Payments go through /api/billing/payments (CORE-11): one requestId per dialog until it posts, restrictions with an override reason, and a receipt.
export function PostEntryDialog({ open, onOpenChange, kind, dims = {}, defaults = {}, onPosted, payers = false, defaultPayer = "tenant" }) {
  const spec = POST_KINDS[kind] || POST_KINDS.charge;
  const isPayment = kind === "payment";
  const accounts = useLedgerAccounts(open);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(null);
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [payer, setPayer] = useState(defaultPayer);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [payerEmail, setPayerEmail] = useState("");
  const [restrictions, setRestrictions] = useState([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [done, setDone] = useState(null);
  const [moving, setMoving] = useState("");
  const [undepositedOn, setUndepositedOn] = useState(true);
  const requestId = useRef("");
  const inFlight = useRef(false);
  const canPost = useCanPost();
  const canOverride = usePermission(OVERRIDE_PERMISSION);
  const lockedThrough = useLockedThrough(open);
  const set = (key) => (value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (["amount", "method", "date"].includes(key)) setRestrictions([]);
  };

  // Reset on open (render-phase), then load the open charges to allocate against.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft({ ...EMPTY, ...(isPayment ? { method: "Check" } : {}), ...defaults });
      setManual(false);
      setAllocations([]);
      setItems(null);
      setPayer(defaultPayer);
      setRestrictions([]);
      setOverrideReason("");
      setDone(null);
      setPayerEmail("");
    }
  }
  const leaseId = dims.leaseId;
  const tenantId = dims.tenantId;
  const byAuthority = isPayment && payer === "housing_authority";
  const choosePayer = (value) => {
    setPayer(value);
    setItems(null);
    setManual(false);
    setAllocations([]);
    setRestrictions([]);
  };
  // Distributions and contributions belong to one owner; from a property, staff pick which (CORE-08).
  const needsOwner = OWNER_SOURCE_TYPES.includes(kind) && !dims.ownerId;
  const propertyId = dims.propertyId;
  const [ownerRows, setOwnerRows] = useState(null);
  useEffect(() => {
    if (!open || !needsOwner || !propertyId) return;
    let alive = true;
    listOwnersOfProperty(propertyId).then((r) => alive && setOwnerRows(r || []));
    return () => {
      alive = false;
    };
  }, [open, needsOwner, propertyId]);
  // Until picked, the date is today or the first open day after a period close (CORE-40).
  const date = draft.date || defaultPostingDate(lockedThrough, todayISO());
  const liveOwners = [...new Set((ownerRows || []).filter((r) => isLiveOn(r, date)).map((r) => r.ownerId))];
  const ownerId = draft.ownerId || (liveOwners.length === 1 ? liveOwners[0] : "");

  useEffect(() => {
    if (!open || !spec.allocate) return;
    let alive = true;
    const subtype = byAuthority ? "subsidy_receivable" : "receivable";
    listOpenCharges(leaseId ? { leaseId, subtype } : { tenantId }).then((r) => alive && setItems(r || []));
    return () => {
      alive = false;
    };
  }, [open, spec.allocate, leaseId, tenantId, byAuthority]);

  // Payment: a fresh request id per dialog, the receipt default from payment settings, and the resident's email.
  useEffect(() => {
    if (!open || !isPayment) return;
    requestId.current = crypto.randomUUID();
    let alive = true;
    getSetting("online_payments", {}).then((v) => alive && setSendReceipt(withPaymentDefaults(v).sendReceipts !== false));
    getSetting("billing_settings", {}).then((v) => alive && setUndepositedOn(usesUndepositedFunds(v)));
    if (tenantId) getTenant(tenantId).then((t) => alive && setPayerEmail(t?.email || ""));
    return () => {
      alive = false;
    };
  }, [open, isPayment, tenantId]);

  const fallbackAccount = spec.account ? accounts?.byKey.get(spec.account.fallback)?.id || "" : "";
  const amount = Number(draft.amount) || 0;
  const mustReceipt = isPayment && receiptRequirement({ method: draft.method }).required;
  const receiptOn = Boolean(payerEmail) && (mustReceipt || sendReceipt);
  const restricted = restrictions.length > 0;
  // Paper payments wait in Undeposited Funds until a bank deposit takes them (CORE-16).
  const toUndeposited = isPayment && undepositedOn && PAPER_METHODS.includes(draft.method);

  const submitPayment = async () => {
    if (inFlight.current) return;
    if (restricted && !overrideReason.trim()) {
      toast.error(canOverride ? "Give a reason for overriding the restriction." : "Your role can't override payment restrictions.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    const res = await recordPaymentApi({
      requestId: requestId.current,
      leaseId: dims.leaseId || undefined,
      tenantId: byAuthority ? undefined : dims.tenantId || undefined,
      payer: byAuthority ? "housing_authority" : "tenant",
      date,
      amount,
      method: draft.method,
      reference: draft.reference.trim(),
      bankAccountId: toUndeposited ? undefined : draft.bankAccountId || undefined,
      undeposited: toUndeposited || undefined,
      memo: draft.memo.trim() || defaults.memo || "",
      allocations: manual ? allocations : undefined,
      sendReceipt: !byAuthority && receiptOn,
      override: restricted ? { reason: overrideReason.trim() } : undefined,
    });
    inFlight.current = false;
    setBusy(false);
    if (!res.ok) {
      if (res.restrictions?.length) setRestrictions(res.restrictions);
      toast.error(res.error || "Couldn't record the payment.");
      return;
    }
    requestId.current = crypto.randomUUID();
    setDone(res);
    toast.success(res.created === false ? `That payment was already recorded (${res.receiptNo}).` : `Payment of ${money(res.amount)} recorded · ${res.receiptNo}.`);
    for (const w of res.warnings || []) toast.warning(w);
    onPosted?.(res, { ...dims, amount });
  };

  const submit = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    if (!(amount > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (spec.allocate && (!dims.leaseId && !dims.tenantId)) {
      toast.error("Link a lease or tenant first.");
      return;
    }
    if (byAuthority && !dims.leaseId) {
      toast.error("A housing authority payment needs the lease it's for.");
      return;
    }
    if (needsOwner && !ownerId) {
      toast.error("Pick the owner this is for.");
      return;
    }
    if (isPayment) return submitPayment();
    setBusy(true);
    const input = {
      ...dims,
      ...(needsOwner ? { ownerId } : {}),
      ...defaults,
      date,
      amount,
      memo: draft.memo.trim() || defaults.memo || "",
      glAccountId: draft.glAccountId || fallbackAccount || undefined,
      bankAccountId: draft.bankAccountId || undefined,
      method: spec.method ? draft.method : undefined,
      metadata: draft.reference ? { reference: draft.reference } : undefined,
    };
    if (spec.allocate && manual) input.allocations = allocations;
    const sourceKind = kind === "late_fee" ? "late_fee" : kind;
    const result = kind === "credit" ? await postCredit(input) : await postEntry(sourceKind, input);
    setBusy(false);
    if (!result) {
      toast.error(ledgerErrorMessage() || "Couldn't post to the ledger.");
      return;
    }
    toast.success(`${SOURCE_LABELS[sourceKind] || "Entry"} of ${money(amount)} posted.`);
    onPosted?.(result, input);
    onOpenChange(false);
  };

  const moveDeposit = async (row) => {
    setMoving(row.depositId);
    const res = await sweepDepositApi(row.depositId, done.entryId);
    setMoving("");
    if (!res.ok) {
      toast.error(res.error || "Couldn't move the deposit.");
      return;
    }
    toast.success(`Moved ${money(row.amount)} to ${row.toBankName || "the deposit account"}.`);
    setDone((d) => ({ ...d, depositSweeps: (d.depositSweeps || []).filter((x) => x.depositId !== row.depositId) }));
    onPosted?.(done, dims);
  };

  if (done) {
    const status = receiptStatusText(done.receipt);
    const emailed = ["sent", "sending"].includes(done.receipt?.status);
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment recorded</DialogTitle>
            <DialogDescription>
              {money(done.amount)} · Receipt {done.receiptNo}
              {done.created === false ? " · already recorded, nothing new was posted" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {status ? (
              <p className="flex items-start gap-2 text-sm text-text-secondary">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {status}
              </p>
            ) : null}
            {done.cash?.undeposited ? (
              <p className="text-sm text-text-secondary">Held in Undeposited Funds until you add it to a bank deposit (Accounting › Bank Deposits).</p>
            ) : null}
            {done.requirement?.required && !emailed ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
                {done.requirement.reason} Print it and hand it to the payer.
              </p>
            ) : null}
            {(done.depositSweeps || []).map((r) => (
              <div key={r.depositId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2">
                <p className="text-sm text-text-secondary">
                  {money(r.amount)} of this paid {r.depositName || "a deposit"}. Move it to {r.toBankName || "the deposit account"}?
                </p>
                <Button size="sm" variant="outline" className="border-border bg-surface-card" disabled={moving === r.depositId || !canPost} onClick={() => moveDeposit(r)}>
                  {moving === r.depositId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Move
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => openReceipt(done.entryId)}>
              <Printer className="h-4 w-4" /> Print receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{byAuthority ? "Record a housing authority payment" : spec.title}</DialogTitle>
          <DialogDescription>Posts a balanced entry to the general ledger. Mistakes are fixed by voiding, never editing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="le-date">
            <Input id="le-date" type="date" value={date} onChange={(e) => set("date")(e.target.value)} />
          </Field>
          <Field label="Amount" htmlFor="le-amount">
            <Input id="le-amount" type="number" step="0.01" placeholder="0.00" value={draft.amount} onChange={(e) => set("amount")(e.target.value)} />
          </Field>
          <BooksClosedNote lockedThrough={lockedThrough} className="sm:col-span-2 -mt-2" />
          {payers && isPayment && leaseId ? (
            <Field label="Paid by" htmlFor="le-payer" className="sm:col-span-2">
              <Select value={payer} onValueChange={choosePayer}>
                <SelectTrigger id="le-payer" className="bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {needsOwner ? (
            <Field label="Owner" htmlFor="le-owner" className="sm:col-span-2">
              <OwnerOfPropertySelect id="le-owner" rows={propertyId ? ownerRows : []} date={date} value={ownerId} onChange={set("ownerId")} />
            </Field>
          ) : null}
          {spec.account ? (
            <Field label={spec.account.label} htmlFor="le-account" className="sm:col-span-2">
              <AccountSelect
                id="le-account"
                accounts={accounts}
                types={spec.account.types}
                value={draft.glAccountId || fallbackAccount}
                onChange={set("glAccountId")}
              />
            </Field>
          ) : null}
          {spec.bank && toUndeposited ? (
            <Field label="Deposit to" htmlFor="le-bank" hint="Add it to a bank deposit later.">
              <Input id="le-bank" value="Undeposited Funds" readOnly disabled />
            </Field>
          ) : spec.bank ? (
            <Field label="Bank account" htmlFor="le-bank">
              <BankAccountSelect
                id="le-bank"
                value={draft.bankAccountId}
                onChange={set("bankAccountId")}
                defaultLabel="Default trust cash"
              />
            </Field>
          ) : null}
          {spec.method ? (
            <Field label="Method" htmlFor="le-method">
              <Select value={draft.method} onValueChange={set("method")}>
                <SelectTrigger id="le-method" className="bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isPayment ? PAYMENT_METHODS : METHODS).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {spec.method ? (
            <Field label="Reference" htmlFor="le-ref">
              <Input id="le-ref" placeholder="Check #, confirmation…" value={draft.reference} onChange={(e) => set("reference")(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Memo" htmlFor="le-memo" className="sm:col-span-2">
            <Input id="le-memo" placeholder={defaults.memo || "What is this for?"} value={draft.memo} onChange={(e) => set("memo")(e.target.value)} />
          </Field>
          {spec.allocate ? (
            <div className="sm:col-span-2">
              <AllocationEditor
                items={items}
                amount={amount}
                allocations={allocations}
                onChange={setAllocations}
                manual={manual}
                onManual={setManual}
              />
            </div>
          ) : null}
          {isPayment && !byAuthority ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2 sm:col-span-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{payerEmail ? `Email receipt to ${payerEmail}` : "Email receipt"}</p>
                <p className="text-xs text-text-secondary">
                  {!payerEmail
                    ? "No email on file — print the receipt once it's recorded."
                    : mustReceipt
                      ? "Cash payments always get a written receipt."
                      : "You can print the receipt either way."}
                </p>
              </div>
              <Switch checked={receiptOn} disabled={!payerEmail || mustReceipt} onCheckedChange={setSendReceipt} aria-label="Email receipt" />
            </div>
          ) : null}
          {restricted ? (
            <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 sm:col-span-2">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" /> This payment breaks the resident&apos;s payment rules
              </p>
              <ul className="space-y-1 text-xs text-text-secondary">
                {restrictions.map((r) => (
                  <li key={r.key}>
                    <span className="font-medium text-foreground">{r.label}.</span> {r.message}
                  </li>
                ))}
              </ul>
              {canOverride ? (
                <Field label="Reason for the override" htmlFor="le-override">
                  <Input id="le-override" placeholder="e.g. Approved by the owner — final check before payment plan" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                </Field>
              ) : (
                <RoleNote>Your role can&apos;t override payment restrictions.</RoleNote>
              )}
            </div>
          ) : null}
        </div>
        {!canPost ? <RoleNote>{NO_POST}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || !canPost || (restricted && (!canOverride || !overrideReason.trim()))}
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {restricted ? "Record Anyway" : spec.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Confirm + void an entry (posts its reversal on the chosen date).
export function VoidEntryDialog({ entry, onOpenChange, onVoided }) {
  const open = Boolean(entry);
  const [picked, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const canVoid = useCanVoid();
  const lockedThrough = useLockedThrough(open);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate("");
      setMemo("");
    }
  }
  // The reversal lands in an open period (CORE-40): today, or the first open day.
  const date = picked || defaultPostingDate(lockedThrough, todayISO());

  const run = async () => {
    if (!canVoid) {
      toast.error(NO_VOID);
      return;
    }
    setBusy(true);
    const result = await voidEntry(entry.entryId || entry.id, { date, memo: memo.trim() || undefined });
    setBusy(false);
    if (!result) {
      toast.error(ledgerErrorMessage() || "Couldn't void this entry.");
      return;
    }
    toast.success("Entry voided — a reversal was posted.");
    onVoided?.(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void entry</DialogTitle>
          <DialogDescription>
            Voiding posts an equal and opposite entry so the books stay auditable.{" "}
            <span className="font-medium text-foreground">{entry?.memo || SOURCE_LABELS[entry?.sourceType] || "This entry"}</span>
            {entry?.amount || entry?.total ? ` · ${money(Math.abs(entry.amount ?? entry.total))}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Void date" htmlFor="void-date">
            <Input id="void-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <BooksClosedNote lockedThrough={lockedThrough} className="mt-1.5" />
          </Field>
          <Field label="Reason" htmlFor="void-memo">
            <Input id="void-memo" placeholder="e.g. Payment returned NSF" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>
        {!canVoid ? <RoleNote>{NO_VOID}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={busy || !canVoid} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Void Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DIM_FIELDS = ["propertyId", "unitId", "leaseId", "tenantId", "ownerId", "vendorId"];
const blankLine = (dims = {}) => ({
  key: crypto.randomUUID(),
  glAccountId: "",
  debit: "",
  credit: "",
  memo: "",
  ...Object.fromEntries(DIM_FIELDS.map((k) => [k, dims[k] || ""])),
  expanded: false,
});
const hasDims = (l) => DIM_FIELDS.some((k) => l[k]);

// Property, unit, owner, vendor and lease options for the journal's dimension pickers, loaded once the dialog opens (CORE-46).
export function useDimensionOptions(open) {
  const [options, setOptions] = useState(null);
  useEffect(() => {
    if (!open || options) return;
    let alive = true;
    Promise.all([listProperties(), listUnits(), ownersLayer.list(), vendorsLayer.list(), leasesLayer.list()]).then(([properties, units, owners, vendors, leases]) => {
      if (!alive) return;
      const byName = (a, b) => String(a.name || a.label || "").localeCompare(String(b.name || b.label || ""), undefined, { numeric: true });
      setOptions({
        properties: [...(properties || [])].sort(byName),
        units: [...(units || [])].sort(byName),
        owners: [...(owners || [])].sort(byName),
        vendors: [...(vendors || [])].sort(byName),
        leases: [...(leases || [])].sort(byName),
      });
    });
    return () => {
      alive = false;
    };
  }, [open, options]);
  return options;
}

// One dimension picker with a "None" choice.
function DimSelect({ id, label, value, onChange, items, labelOf = (x) => x.name, loading }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger id={id} className="h-8 bg-surface-card text-xs">
          <SelectValue placeholder={loading ? "Loading…" : "None"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {(items || []).map((x) => (
            <SelectItem key={x.id} value={x.id}>
              {labelOf(x)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// A line's property / unit / lease / owner / vendor; a lease brings its unit, tenant and property, a unit its property.
function LineDimensions({ line, options, propertyName, onChange, idPrefix }) {
  const o = options || { properties: [], units: [], owners: [], vendors: [], leases: [] };
  const unitOf = (id) => o.units.find((u) => u.id === id);
  const leaseOf = (id) => o.leases.find((l) => l.id === id);
  const units = o.units.filter((u) => !line.propertyId || u.propertyId === line.propertyId);
  const leases = o.leases.filter((l) => (!line.unitId || l.unitId === line.unitId) && (!line.propertyId || l.propertyId === line.propertyId));
  const pickProperty = (propertyId) => {
    const unitOk = !line.unitId || unitOf(line.unitId)?.propertyId === propertyId;
    const leaseOk = !line.leaseId || leaseOf(line.leaseId)?.propertyId === propertyId;
    onChange({ propertyId, ...(propertyId && !unitOk ? { unitId: "" } : {}), ...(propertyId && !leaseOk ? { leaseId: "", tenantId: "" } : {}) });
  };
  const pickUnit = (unitId) => {
    const u = unitOf(unitId);
    const leaseOk = !line.leaseId || leaseOf(line.leaseId)?.unitId === unitId;
    onChange({ unitId, ...(u?.propertyId ? { propertyId: u.propertyId } : {}), ...(unitId && !leaseOk ? { leaseId: "", tenantId: "" } : {}) });
  };
  const pickLease = (leaseId) => {
    const l = leaseOf(leaseId);
    onChange(l ? { leaseId, tenantId: l.tenantId || "", unitId: l.unitId || line.unitId, propertyId: l.propertyId || line.propertyId } : { leaseId: "", tenantId: "" });
  };
  const unitLabel = (u) => (line.propertyId ? u.label : [propertyName(u.propertyId), u.label].filter(Boolean).join(" · "));
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-surface-subtle p-2 sm:grid-cols-5">
      <DimSelect id={`${idPrefix}-property`} label="Property" value={line.propertyId} onChange={pickProperty} items={o.properties} loading={!options} />
      <DimSelect id={`${idPrefix}-unit`} label="Unit" value={line.unitId} onChange={pickUnit} items={units} labelOf={unitLabel} loading={!options} />
      <DimSelect id={`${idPrefix}-lease`} label="Lease" value={line.leaseId} onChange={pickLease} items={leases} loading={!options} />
      <DimSelect id={`${idPrefix}-owner`} label="Owner" value={line.ownerId} onChange={(ownerId) => onChange({ ownerId })} items={o.owners} loading={!options} />
      <DimSelect id={`${idPrefix}-vendor`} label="Vendor" value={line.vendorId} onChange={(vendorId) => onChange({ vendorId })} items={o.vendors} loading={!options} />
    </div>
  );
}

// Manual journal entry with any number of balanced lines, each with optional dimensions (CORE-46); `initial` prefills a copy.
export function JournalEntryDialog({ open, onOpenChange, dims = {}, initial = null, onPosted }) {
  const accounts = useLedgerAccounts(open);
  const lockedThrough = useLockedThrough(open);
  const options = useDimensionOptions(open);
  const [picked, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const canPost = useCanPost();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate("");
      setMemo(initial?.memo || "");
      setPropertyId(initial ? initial.propertyId || "" : dims.propertyId || "");
      const copied = (initial?.lines || []).map((l) => ({ ...blankLine(), ...l, key: crypto.randomUUID(), expanded: hasDims(l) }));
      setLines(copied.length >= 2 ? copied : [...copied, blankLine(dims), blankLine(dims)].slice(0, Math.max(2, copied.length)));
    }
  }
  const date = picked || defaultPostingDate(lockedThrough, todayISO());
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dr = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const cr = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const balanced = dr > 0 && dr === cr;
  const nameOf = (list, id) => (id ? (options?.[list] || []).find((x) => x.id === id) : null);
  const propertyName = (id) => nameOf("properties", id)?.name || "";
  const summary = (l) =>
    [
      l.propertyId ? propertyName(l.propertyId) : propertyId ? `${propertyName(propertyId)} (default)` : "",
      nameOf("units", l.unitId)?.label,
      nameOf("leases", l.leaseId)?.name,
      l.ownerId ? `Owner ${nameOf("owners", l.ownerId)?.name || ""}`.trim() : "",
      l.vendorId ? `Vendor ${nameOf("vendors", l.vendorId)?.name || ""}`.trim() : "",
      l.bankAccountId ? "Bank" : "",
      l.jobId ? "Job" : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const submit = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    setBusy(true);
    const result = await postEntry("adjustment", manualJournalInput({ date, memo, propertyId, lines }));
    setBusy(false);
    if (!result) {
      toast.error(ledgerErrorMessage() || "Couldn't post the journal entry.");
      return;
    }
    toast.success(`Journal entry of ${money(dr)} posted.`);
    onPosted?.(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Copy Journal Entry" : "New Journal Entry"}</DialogTitle>
          <DialogDescription>
            {initial ? "A new entry prefilled from the one you copied — check the date and amounts, then post." : "Debits must equal credits. Each line posts to one GL account."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[170px_220px_1fr]">
          <Field label="Date" htmlFor="je-date">
            <Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Property" htmlFor="je-property" hint="Lines without their own property use it.">
            <Select value={propertyId || NONE} onValueChange={(v) => setPropertyId(v === NONE ? "" : v)}>
              <SelectTrigger id="je-property" className="bg-surface-card">
                <SelectValue placeholder={options ? "None" : "Loading…"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {(options?.properties || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Memo" htmlFor="je-memo">
            <Input id="je-memo" value={memo} placeholder="e.g. Reclassify October utilities" onChange={(e) => setMemo(e.target.value)} />
          </Field>
          <BooksClosedNote lockedThrough={lockedThrough} className="sm:col-span-3 -mt-2" />
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {lines.map((l, i) => (
            <div key={l.key} className="space-y-1.5">
              <div className="grid gap-2 sm:grid-cols-[1fr_110px_110px_1fr_auto_auto] sm:items-center">
                <AccountSelect accounts={accounts} value={l.glAccountId} onChange={(v) => setLine(l.key, { glAccountId: v, bankAccountId: "" })} placeholder={`Line ${i + 1} account…`} />
                <Input type="number" placeholder="Debit" value={l.debit} onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="text-right" />
                <Input type="number" placeholder="Credit" value={l.credit} onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="text-right" />
                <Input placeholder="Line memo" value={l.memo} onChange={(e) => setLine(l.key, { memo: e.target.value })} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={l.expanded || hasDims(l) ? "text-foreground hover:bg-surface-active" : "text-muted-foreground hover:bg-surface-active hover:text-foreground"}
                  onClick={() => setLine(l.key, { expanded: !l.expanded })}
                  aria-expanded={l.expanded}
                  aria-label={`Dimensions for line ${i + 1}`}
                >
                  <Tags className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  disabled={lines.length <= 2}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {l.expanded ? (
                <LineDimensions line={l} options={options} propertyName={propertyName} idPrefix={`je-${i}`} onChange={(patch) => setLine(l.key, patch)} />
              ) : summary(l) ? (
                <button type="button" className="truncate pl-1 text-left text-xs text-text-tertiary hover:text-text-secondary" onClick={() => setLine(l.key, { expanded: true })}>
                  {summary(l)}
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => setLines((ls) => [...ls, blankLine(dims)])}>
              <Plus className="h-4 w-4" /> Add Line
            </Button>
            <p className={`text-sm tabular-nums ${balanced ? "text-emerald-600 dark:text-emerald-400" : "text-text-secondary"}`}>
              Debits {money(dr)} · Credits {money(cr)}
              {!balanced && (dr || cr) ? ` · Off by ${money(Math.abs(dr - cr))}` : ""}
            </p>
          </div>
        </div>
        {!canPost ? <RoleNote>{NO_POST}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !balanced || !canPost} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Post Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The first of the month after `date`: where an accrual usually reverses.
const nextMonthFirst = (date) => {
  const [y, m] = String(date || todayISO()).slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
};

// Reverse a journal entry on a date (CORE-46): a mirror entry posts, the original stays posted (a void marks it void instead).
export function ReverseEntryDialog({ entry, onOpenChange, onReversed }) {
  const open = Boolean(entry);
  const [picked, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const canPost = useCanPost();
  const lockedThrough = useLockedThrough(open);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate("");
      setMemo("");
    }
  }
  const date = picked || defaultPostingDate(lockedThrough, nextMonthFirst(entry?.date));

  const run = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    setBusy(true);
    const res = await reverseEntryApi(entry.id, { date, memo: memo.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't reverse this entry.");
      return;
    }
    if (res.created === false) toast.success(`It was already reversed on ${formatDate(res.date)}.`);
    else toast.success(`Reversal posted on ${formatDate(res.date)}${res.moved ? " — the first open day after the closed period" : ""}.`);
    onReversed?.(res);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse entry</DialogTitle>
          <DialogDescription>
            Posts the mirror image on the date you pick, so the accounts net to zero from then on. The original stays as posted.{" "}
            <span className="font-medium text-foreground">{entry?.memo || SOURCE_LABELS[entry?.sourceType] || "This entry"}</span>
            {entry ? ` · ${formatDate(entry.date)} · ${money(entry.total)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Reverse on" htmlFor="rev-date">
            <Input id="rev-date" type="date" min={entry?.date} value={date} onChange={(e) => setDate(e.target.value)} />
            <BooksClosedNote lockedThrough={lockedThrough} className="mt-1.5" />
          </Field>
          <Field label="Memo" htmlFor="rev-memo">
            <Input id="rev-memo" placeholder={`Reversal: ${entry?.memo || "Journal entry"}`} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>
        {!canPost ? <RoleNote>{NO_POST}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost || !date} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Reverse Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Lease ledger "Deposit" (CORE-04): a deposit record for the lease, billed through AR or recorded as already received (server routes).
export function LeaseDepositDialog({ open, onOpenChange, dims = {}, lease, onPosted }) {
  const [kind, setKind] = useState("Security deposit");
  const [amount, setAmount] = useState("");
  const [how, setHow] = useState("bill");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const canPost = useCanPost();

  const submit = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    const value = round2(amount);
    if (!(value > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (!dims.leaseId) {
      toast.error("Link a lease first.");
      return;
    }
    setBusy(true);
    const label = [lease?.unit || lease?.name, kind.toLowerCase()].filter(Boolean).join(" — ");
    const row = await securityDepositsLayer.create({
      id: crypto.randomUUID(),
      name: label || kind,
      kind,
      amount: value,
      leaseId: dims.leaseId,
      leaseName: lease?.name || "",
      tenantId: dims.tenantId || "",
      tenantName: lease?.tenantName || "",
      unitId: dims.unitId || "",
      unit: lease?.unit || "",
      propertyId: dims.propertyId || "",
      status: "Pending",
      metadata: { depositKind: kind, createdFrom: "lease ledger" },
    });
    if (!row) {
      setBusy(false);
      toast.error("Couldn't create the deposit record.");
      return;
    }
    const res = how === "bill" ? await chargeDepositApi(row.id, { date }) : await recordDepositReceivedApi(row.id, { bankAccountId: bankAccountId || undefined, date });
    setBusy(false);
    if (!res.ok) {
      toast.error(`${res.error || "Couldn't post the deposit."} The deposit record was kept — finish it from Security Deposits.`);
      onPosted?.();
      onOpenChange(false);
      return;
    }
    if (res.warning) toast.warning(res.warning);
    toast.success(how === "bill" ? `Billed the ${money(value)} ${kind.toLowerCase()} to this lease.` : `Recorded the ${money(value)} ${kind.toLowerCase()} as received.`);
    onPosted?.(res);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a deposit</DialogTitle>
          <DialogDescription>Creates the deposit record and puts it on the ledger: billed to the resident, or recorded as already received.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" htmlFor="dep-kind">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="dep-kind" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPOSIT_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount" htmlFor="dep-amount">
            <Input id="dep-amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="How" htmlFor="dep-how">
            <Select value={how} onValueChange={setHow}>
              <SelectTrigger id="dep-how" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bill">Bill to the resident</SelectItem>
                <SelectItem value="received">Already received</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" htmlFor="dep-date">
            <Input id="dep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {how === "received" ? (
            <Field label="Landed in" htmlFor="dep-bank" className="sm:col-span-2">
              <BankAccountSelect id="dep-bank" value={bankAccountId} onChange={setBankAccountId} defaultLabel="Per your deposit policy" />
            </Field>
          ) : null}
        </div>
        {!canPost ? <RoleNote>{NO_POST}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {how === "bill" ? "Bill Deposit" : "Record Deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
