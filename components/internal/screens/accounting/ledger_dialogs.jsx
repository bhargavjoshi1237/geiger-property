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
  deposit_held: { title: "Record deposit received", verb: "Record Deposit", bank: true },
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

const EMPTY = { date: "", amount: "", memo: "", glAccountId: "", bankAccountId: "", method: "ACH", reference: "" };

// Post one ledger event. `dims` = the scope ids stamped on the entry
// ({ leaseId, tenantId, unitId, propertyId, ownerId, vendorId, jobId });
// `defaults` pre-fills the draft (amount, memo, sourceId, billEntryId…).
export function PostEntryDialog({ open, onOpenChange, kind, dims = {}, defaults = {}, onPosted }) {
  const spec = POST_KINDS[kind] || POST_KINDS.charge;
  const accounts = useLedgerAccounts(open);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(null);
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState([]);
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
    }
  }
  const leaseId = dims.leaseId;
  const tenantId = dims.tenantId;
  useEffect(() => {
    if (!open || !spec.allocate) return;
    let alive = true;
    listOpenCharges(leaseId ? { leaseId } : { tenantId }).then((r) => alive && setItems(r || []));
    return () => {
      alive = false;
    };
  }, [open, spec.allocate, leaseId, tenantId]);

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
    setBusy(true);
    const input = {
      ...dims,
      ...defaults,
      date: draft.date || todayISO(),
      amount,
      memo: draft.memo.trim() || defaults.memo || "",
      glAccountId: draft.glAccountId || fallbackAccount || undefined,
      bankAccountId: draft.bankAccountId || undefined,
      method: spec.method ? draft.method : undefined,
      metadata: draft.reference ? { reference: draft.reference } : undefined,
    };
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
          <DialogTitle>{spec.title}</DialogTitle>
          <DialogDescription>Posts a balanced entry to the general ledger. Mistakes are fixed by voiding, never editing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="le-date">
            <Input id="le-date" type="date" value={draft.date} onChange={(e) => set("date")(e.target.value)} />
          </Field>
          <Field label="Amount" htmlFor="le-amount">
            <Input id="le-amount" type="number" step="0.01" placeholder="0.00" value={draft.amount} onChange={(e) => set("amount")(e.target.value)} />
          </Field>
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
                defaultLabel={kind === "deposit_held" ? "Default deposit trust" : "Default trust cash"}
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
