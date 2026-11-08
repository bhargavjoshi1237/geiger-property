"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BanknoteArrowUp, CircleCheck, Loader2, Undo2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { DataTable, Field } from "@/components/internal/shared/screen_kit";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { Callout } from "@/components/internal/screens/leasing/sections/gated";
import { usePermission } from "@/context/rbac-context";
import { recordRecoveryApi, recoveryPreviewApi, writeOffApi, writeOffPreviewApi } from "@/lib/billing/api";
import { NO_WRITE_OFF, WRITE_OFF_PERMISSION, WRITE_OFF_REASONS, reasonOf, writeOffReasonProblem } from "@/lib/billing/write_off_rules";
import { round2 } from "@/lib/ledger/postings";
import { BooksClosedNote } from "./period_lock";
import { SummaryTiles } from "./sections";
import { formatDate, money } from "./shared";

// Write-offs (CORE-15): the lease ledger's "Write off" wizard (pick open charges → reason → review) and a payment's "Record bad-debt recovery" dialog,
// both posting through /api/billing; the direct method — open charges go to 5800 Bad Debt, and a later payment reinstates and pays them.

const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";
const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";

export const useCanWriteOff = () => usePermission(WRITE_OFF_PERMISSION);

// The picked charges and amounts → [{ entryId, amount }] (open items only, in the table's order).
const pickedOf = (data, values) => data.items.filter((i) => values.picked[i.entryId] !== undefined).map((i) => ({ entryId: i.entryId, amount: round2(values.picked[i.entryId]), item: i }));
const pickedTotal = (data, values) => round2(pickedOf(data, values).reduce((s, p) => s + (p.amount || 0), 0));

function chargesError(data, values) {
  const picked = pickedOf(data, values);
  if (!picked.length) return "Pick at least one open charge to write off.";
  const bad = picked.find((p) => !(p.amount > 0) || p.amount - p.item.open > 0.004);
  if (bad) return `Enter an amount between $0.01 and ${money(bad.item.open)} for ${bad.item.label}.`;
  return null;
}

function ChargesStep({ data, values, set }) {
  const picked = values.picked;
  const toggle = (item, on) => {
    const next = { ...picked };
    if (on) next[item.entryId] = String(item.open);
    else delete next[item.entryId];
    set({ picked: next });
  };
  const allOn = data.items.length > 0 && data.items.every((i) => picked[i.entryId] !== undefined);
  const toggleAll = (on) => set({ picked: on ? Object.fromEntries(data.items.map((i) => [i.entryId, String(i.open)])) : {} });
  const columns = [
    {
      key: "pick",
      header: <Checkbox checked={allOn} onCheckedChange={(v) => toggleAll(Boolean(v))} aria-label="Select all open charges" />,
      className: "w-10",
      render: (i) => <Checkbox checked={picked[i.entryId] !== undefined} onCheckedChange={(v) => toggle(i, Boolean(v))} aria-label={`Select ${i.label}`} />,
    },
    {
      key: "charge",
      header: "Charge",
      render: (i) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">{i.label}</span>
          <span className="text-xs text-text-secondary">
            {formatDate(i.date)} · {i.days} day{i.days === 1 ? "" : "s"}
            {i.openBefore > i.open ? ` · ${money(i.openBefore - i.open)} paid from credit first` : ""}
          </span>
        </div>
      ),
    },
    { key: "open", header: "Open", align: "right", className: "text-right tabular-nums text-text-secondary", render: (i) => money(i.open) },
    {
      key: "amount",
      header: "Write off",
      align: "right",
      className: "w-36 text-right",
      render: (i) => (
        <Input
          aria-label={`Amount to write off for ${i.label}`}
          type="number"
          min="0"
          step="0.01"
          disabled={picked[i.entryId] === undefined}
          value={picked[i.entryId] ?? ""}
          onChange={(e) => set({ picked: { ...picked, [i.entryId]: e.target.value } })}
          className="h-8 bg-surface-card text-right tabular-nums"
        />
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Balance owed", value: money(data.balance), className: data.balance > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
          { label: "Open charges", value: money(data.openTotal) },
          { label: "Writing off", value: money(pickedTotal(data, values)) },
        ]}
      />
      {data.credits.applied > 0 ? <Callout tone="info">{money(data.credits.applied)} of unapplied credit pays the oldest charges first; the amounts below are what&apos;s left open after it.</Callout> : null}
      {data.deferred > 0 ? <Callout tone="warning">{money(data.deferred)} is deferred on a payment plan and isn&apos;t open yet — cancel or default the plan from the Payment Plan tab to write it off.</Callout> : null}
      <DataTable columns={columns} data={data.items} getRowKey={(i) => i.entryId} />
    </div>
  );
}

function ReasonStep({ data, values, set }) {
  const reason = reasonOf(values.reason);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reason" htmlFor="wo-reason" hint={reason?.hint}>
          <Select value={values.reason} onValueChange={(v) => set({ reason: v })}>
            <SelectTrigger id="wo-reason" className="bg-surface-card">
              <SelectValue placeholder="Select a reason…" />
            </SelectTrigger>
            <SelectContent>
              {WRITE_OFF_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Write-off date" htmlFor="wo-date" hint="Usually today, or the month-end you're closing.">
          <Input id="wo-date" type="date" max={data.today} value={values.date} onChange={(e) => set({ date: e.target.value })} className="bg-surface-card" />
          <BooksClosedNote lockedThrough={data.lockedThrough} className="mt-1.5" />
        </Field>
      </div>
      <Field label={values.reason === "other" ? "Note (required)" : "Note"} htmlFor="wo-note" hint="Kept on the entry and in the lease's activity.">
        <Textarea id="wo-note" rows={3} maxLength={500} value={values.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Skipped after the notice; no forwarding address; final notice sent Dec 2." className="bg-surface-card" />
      </Field>
      {reason && reason.collections !== "eligible" ? <Callout tone="warning">{reason.hint} The Delinquency report&apos;s Written off view flags it.</Callout> : null}
      {reason?.collections === "eligible" ? <p className="text-xs text-text-secondary">Writing off doesn&apos;t forgive the debt: it stays listed under Delinquency › Written off for a collection agency, and a later payment can be recorded as a recovery.</p> : null}
    </div>
  );
}

function ReviewStep({ data, values }) {
  const picked = pickedOf(data, values);
  const total = pickedTotal(data, values);
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-border rounded-xl border border-border">
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <dt className="text-text-secondary">Dr 5800 · Bad Debt</dt>
          <dd className="tabular-nums text-foreground">{money(total)}</dd>
        </div>
        {picked.map((p) => (
          <div key={p.entryId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <dt className="truncate text-text-secondary">Cr 1200 · Accounts Receivable — {p.item.label}</dt>
            <dd className="tabular-nums text-foreground">{money(p.amount)}</dd>
          </div>
        ))}
      </dl>
      <SummaryTiles
        items={[
          { label: "Written off", value: money(total) },
          { label: "Reason", value: reasonOf(values.reason)?.label || "—" },
          { label: "Balance after", value: money(round2(data.balance - total)) },
        ]}
      />
      <p className="text-xs text-text-secondary">
        Posts on {formatDate(values.date || data.postDate)}
        {data.lockedThrough && (values.date || data.today) <= data.lockedThrough ? " — that period is closed, so it lands on the first open day" : ""}. The bad debt shows on the property&apos;s owner statement; void the entry from the ledger to undo it.
      </p>
    </div>
  );
}

function WriteOffWizardBody({ data, leaseId, onOpenChange, onDone }) {
  const [initial] = useState(() => ({
    writeOffId: crypto.randomUUID(),
    picked: Object.fromEntries(data.items.map((i) => [i.entryId, String(i.open)])),
    reason: "uncollectible",
    note: "",
    date: data.today,
  }));
  const steps = [
    { key: "charges", title: "Charges", description: "Pick the open charges to write off and how much of each.", render: ({ values, set }) => <ChargesStep data={data} values={values} set={set} />, validate: (v) => chargesError(data, v) },
    { key: "reason", title: "Reason", render: ({ values, set }) => <ReasonStep data={data} values={values} set={set} />, validate: (v) => writeOffReasonProblem(v.reason, v.note) || (v.date && v.date > data.today ? "A write-off can't be dated in the future." : null) },
    { key: "review", title: "Review", render: ({ values }) => <ReviewStep data={data} values={values} /> },
  ];
  const finish = async (v) => {
    const items = pickedOf(data, v).map(({ entryId, amount }) => ({ entryId, amount }));
    const res = await writeOffApi(leaseId, { writeOffId: v.writeOffId, items, reason: v.reason, note: v.note.trim(), date: v.date || undefined });
    if (!res.ok) {
      toast.error(res.error || "Couldn't write off the charges.");
      return false;
    }
    toast.success(res.replay ? "That write-off was already posted — nothing new was written off." : `Wrote off ${money(res.amount)} to Bad Debt (${res.reasonLabel}).`);
    if (res.credits?.applied > 0) toast.info(`${money(res.credits.applied)} of unapplied credit was applied to the oldest charges first.`);
    onDone?.(res);
    return true;
  };
  return (
    <WizardDialog
      open
      onOpenChange={onOpenChange}
      title="Write off bad debt"
      description="Moves uncollectible open charges to 5800 Bad Debt. The lease balance drops by the amount and it leaves Delinquency."
      steps={steps}
      initial={initial}
      onFinish={finish}
      finishLabel="Write Off"
      className="sm:max-w-3xl"
    />
  );
}

function NoticeDialog({ onOpenChange, title, children }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Write off bad debt</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="ghost" className={GHOST} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "Write off" from a lease's ledger: loads the open charges (after credits), then runs the wizard.
export function WriteOffWizard({ open, onOpenChange, leaseId, onDone }) {
  const [loaded, setLoaded] = useState({ key: "", res: null });
  const key = open ? leaseId : "";
  useEffect(() => {
    if (!key) return;
    let alive = true;
    writeOffPreviewApi(key).then((res) => alive && setLoaded({ key, res }));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!open) return null;
  const res = loaded.key === key ? loaded.res : null;
  if (!res) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write off bad debt</DialogTitle>
            <DialogDescription>Loading the lease&apos;s open charges…</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <LogoLoading size={40} aria-label="Loading open charges" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!res.ok) {
    return (
      <NoticeDialog onOpenChange={onOpenChange} title="Couldn't load the lease">
        <p className="text-sm text-text-secondary">{res.error || "Try again in a moment."}</p>
      </NoticeDialog>
    );
  }
  if (!res.canWriteOff) {
    return (
      <NoticeDialog onOpenChange={onOpenChange} title="Write-offs need permission">
        <RoleNote>{NO_WRITE_OFF}</RoleNote>
      </NoticeDialog>
    );
  }
  if (!res.items.length) {
    return (
      <NoticeDialog onOpenChange={onOpenChange} title="Nothing to write off">
        <p className="text-sm text-text-secondary">
          This lease has no open charges{res.credits.applied > 0 ? " once its unapplied credit is applied" : ""}.{res.deferred > 0 ? ` ${money(res.deferred)} is deferred on a payment plan; cancel or default the plan to bring it back.` : ""}
        </p>
      </NoticeDialog>
    );
  }
  return <WriteOffWizardBody data={res} leaseId={leaseId} onOpenChange={onOpenChange} onDone={onDone} />;
}

// One line of what a recovery posts.
function Effect({ icon: Icon, title, children }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {children ? <p className="text-xs text-text-secondary">{children}</p> : null}
      </div>
    </li>
  );
}

const paymentLabel = (p) => [money(p.amount), p.method, p.reference ? `#${p.reference}` : "", `received ${formatDate(p.date)}`].filter(Boolean).join(" · ");

// "Record bad-debt recovery…" on a payment: reinstates written-off charges (Dr 1200 / Cr 5800) and applies the payment's unapplied credit to them.
export function RecoveryDialog({ entry, onOpenChange, onRecorded }) {
  const open = Boolean(entry);
  const entryId = entry?.entryId || "";
  const canWriteOff = useCanWriteOff();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const inFlight = useRef(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPreview(null);
      setError("");
      setDone(null);
    }
  }
  useEffect(() => {
    if (!open || !entryId) return;
    let alive = true;
    recoveryPreviewApi(entryId).then((res) => {
      if (!alive) return;
      if (!res.ok) return setError(res.error || "Couldn't load the payment.");
      setPreview(res);
      setAmount(res.recoverable ? String(res.recoverable) : "");
      if (res.recovered) setDone(res.recovered);
    });
    return () => {
      alive = false;
    };
  }, [open, entryId]);

  const value = round2(amount);
  const cap = preview?.recoverable || 0;
  const problem = !preview || done ? "" : preview.blocker || (!(value > 0) ? "Enter an amount above zero." : value - cap > 0.004 ? `At most ${money(cap)} can be recovered from this payment.` : "");

  const submit = async () => {
    if (inFlight.current) return;
    if (!canWriteOff) return toast.error(NO_WRITE_OFF);
    if (problem) return toast.error(problem);
    inFlight.current = true;
    setBusy(true);
    const res = await recordRecoveryApi(entryId, { amount: value });
    inFlight.current = false;
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't record the recovery.");
    setDone(res);
    toast.success(res.replay ? "That recovery was already recorded — nothing new was posted." : `Recovered ${money(res.amount)} of written-off bad debt.`);
    onRecorded?.(res);
  };

  let body;
  if (error) {
    body = <Callout tone="danger">{error}</Callout>;
  } else if (!preview) {
    body = (
      <div className="flex justify-center py-8">
        <LogoLoading size={36} aria-label="Loading the payment" />
      </div>
    );
  } else if (done) {
    body = (
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
        <Effect icon={CircleCheck} title={`${money(done.amount)} recovered on ${formatDate(done.date)}`}>
          {(done.items || []).map((i) => `${i.memo || "Charge"} ${money(i.amount)}`).join(" · ")}
        </Effect>
        <Effect icon={Undo2} title="Void the recovery from the ledger to undo it">Voiding it writes the reinstated charges off again; the payment goes back to unapplied credit once its application is voided too.</Effect>
      </ul>
    );
  } else {
    body = (
      <div className="space-y-4">
        <SummaryTiles
          items={[
            { label: "Unapplied credit", value: money(preview.unapplied) },
            { label: "Written off", value: money(preview.writtenOff) },
            { label: "Recoverable", value: money(cap), className: cap > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground" },
          ]}
        />
        {preview.blocker ? (
          <Callout tone="warning">{preview.blocker}</Callout>
        ) : (
          <>
            <Field label="Amount to recover" htmlFor="rec-amount" hint={`Up to ${money(cap)}; the oldest written-off charges are reinstated first.`}>
              <Input id="rec-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-surface-card text-right tabular-nums" />
            </Field>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
              <Effect icon={BanknoteArrowUp} title={`Reinstate ${money(value)} of written-off charges`}>Dr 1200 Accounts Receivable / Cr 5800 Bad Debt, on {formatDate(preview.postDate)}.</Effect>
              <Effect icon={CircleCheck} title="Apply the payment to them">The payment&apos;s unapplied credit pays the reinstated charges, so the balance stays where it is and bad debt drops by {money(value)}.</Effect>
            </ul>
            <BooksClosedNote lockedThrough={preview.lockedThrough} />
          </>
        )}
        {!canWriteOff ? <RoleNote>{NO_WRITE_OFF}</RoleNote> : null}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record bad-debt recovery</DialogTitle>
          <DialogDescription>{preview ? paymentLabel(preview.payment) : "A payment toward a balance that was written off."}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
            {done || error ? "Close" : "Cancel"}
          </Button>
          {preview && !done && !error ? (
            <Button className={PRIMARY} disabled={busy || !canWriteOff || Boolean(problem)} onClick={submit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BanknoteArrowUp className="h-4 w-4" />} Record Recovery
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
