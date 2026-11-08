"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";

import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
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
import { chargeDepositApi, recordDepositReceivedApi } from "@/lib/billing/api";
import { DEPOSIT_KIND_OPTIONS } from "@/components/internal/screens/leasing/shared";
import { listOwnersOfProperty } from "@/lib/supabase/property_owners";
import { OWNER_SOURCE_TYPES, isLiveOn } from "@/lib/ledger/ownership";
import {
  getLedgerAccounts,
  ledgerErrorMessage,
  listOpenCharges,
  postEntry,
  postCredit,
  postPayment,
  voidEntry,
} from "@/lib/supabase/ledger";
import { accountLabel, allocateOldestFirst, round2, SOURCE_LABELS } from "@/lib/ledger/postings";
import { usePermission } from "@/context/rbac-context";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { formatDate, money, todayISO } from "./shared";

// Ledger posting dialogs shared by the ledger section, General Ledger and the
// accounting screens: GL / bank pickers, the post-entry dialog (charge, payment,
// credit, bill, owner funds…), a manual journal editor and the void confirmation.

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
export function PostEntryDialog({ open, onOpenChange, kind, dims = {}, defaults = {}, onPosted, payers = false, defaultPayer = "tenant" }) {
  const spec = POST_KINDS[kind] || POST_KINDS.charge;
  const accounts = useLedgerAccounts(open);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(null);
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [payer, setPayer] = useState(defaultPayer);
  const canPost = useCanPost();
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  // Reset on open (render-phase), then load the open charges to allocate against.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft({ ...EMPTY, date: todayISO(), ...defaults });
      setManual(false);
      setAllocations([]);
      setItems(null);
      setPayer(defaultPayer);
    }
  }
  const leaseId = dims.leaseId;
  const tenantId = dims.tenantId;
  const byAuthority = kind === "payment" && payer === "housing_authority";
  const choosePayer = (value) => {
    setPayer(value);
    setItems(null);
    setManual(false);
    setAllocations([]);
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
  const liveOwners = [...new Set((ownerRows || []).filter((r) => isLiveOn(r, draft.date)).map((r) => r.ownerId))];
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

  const fallbackAccount = spec.account ? accounts?.byKey.get(spec.account.fallback)?.id || "" : "";
  const amount = Number(draft.amount) || 0;

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
    setBusy(true);
    const input = {
      ...dims,
      ...(needsOwner ? { ownerId } : {}),
      ...defaults,
      date: draft.date || todayISO(),
      amount,
      memo: draft.memo.trim() || defaults.memo || "",
      glAccountId: draft.glAccountId || fallbackAccount || undefined,
      bankAccountId: draft.bankAccountId || undefined,
      method: spec.method ? draft.method : undefined,
      metadata: draft.reference ? { reference: draft.reference } : undefined,
    };
    if (byAuthority) {
      delete input.tenantId;
      input.arKey = "subsidy_receivable";
      input.metadata = { ...(input.metadata || {}), payer: "housing_authority" };
    }
    if (spec.allocate && manual) input.allocations = allocations;
    const sourceKind = kind === "late_fee" ? "late_fee" : kind;
    const result =
      kind === "payment" ? await postPayment(input) : kind === "credit" ? await postCredit(input) : await postEntry(sourceKind, input);
    setBusy(false);
    if (!result) {
      toast.error(ledgerErrorMessage() || "Couldn't post to the ledger.");
      return;
    }
    toast.success(`${SOURCE_LABELS[sourceKind] || "Entry"} of ${money(amount)} posted.`);
    onPosted?.(result, input);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{byAuthority ? "Record a housing authority payment" : spec.title}</DialogTitle>
          <DialogDescription>Posts a balanced entry to the general ledger. Mistakes are fixed by voiding, never editing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="le-date">
            <Input id="le-date" type="date" value={draft.date} onChange={(e) => set("date")(e.target.value)} />
          </Field>
          <Field label="Amount" htmlFor="le-amount">
            <Input id="le-amount" type="number" step="0.01" placeholder="0.00" value={draft.amount} onChange={(e) => set("amount")(e.target.value)} />
          </Field>
          {payers && kind === "payment" && leaseId ? (
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
              <OwnerOfPropertySelect id="le-owner" rows={propertyId ? ownerRows : []} date={draft.date} value={ownerId} onChange={set("ownerId")} />
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
          {spec.bank ? (
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
                  {METHODS.map((m) => (
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
        </div>
        {!canPost ? <RoleNote>{NO_POST}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {spec.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Confirm + void an entry (posts its reversal on the chosen date).
export function VoidEntryDialog({ entry, onOpenChange, onVoided }) {
  const open = Boolean(entry);
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const canVoid = useCanVoid();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(todayISO());
      setMemo("");
    }
  }

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

const blankLine = () => ({ key: crypto.randomUUID(), glAccountId: "", debit: "", credit: "", memo: "" });

// Manual journal entry with any number of balanced lines.
export function JournalEntryDialog({ open, onOpenChange, dims = {}, onPosted }) {
  const accounts = useLedgerAccounts(open);
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const canPost = useCanPost();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(todayISO());
      setMemo("");
      setLines([blankLine(), blankLine()]);
    }
  }
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dr = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const cr = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const balanced = dr > 0 && dr === cr;

  const submit = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    setBusy(true);
    const result = await postEntry("adjustment", {
      ...dims,
      date,
      memo: memo.trim() || "Journal entry",
      lines: lines.map((l) => ({ glAccountId: l.glAccountId, debit: l.debit, credit: l.credit, memo: l.memo })),
    });
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
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
          <DialogDescription>Debits must equal credits. Each line posts to one GL account.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Date" htmlFor="je-date">
            <Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Memo" htmlFor="je-memo">
            <Input id="je-memo" value={memo} placeholder="e.g. Reclassify October utilities" onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_110px_110px_1fr_auto] sm:items-center">
              <AccountSelect accounts={accounts} value={l.glAccountId} onChange={(v) => setLine(l.key, { glAccountId: v })} placeholder={`Line ${i + 1} account…`} />
              <Input type="number" placeholder="Debit" value={l.debit} onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="text-right" />
              <Input type="number" placeholder="Credit" value={l.credit} onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="text-right" />
              <Input placeholder="Line memo" value={l.memo} onChange={(e) => setLine(l.key, { memo: e.target.value })} />
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
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => setLines((ls) => [...ls, blankLine()])}>
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
