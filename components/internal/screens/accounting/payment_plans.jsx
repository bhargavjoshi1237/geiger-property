"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Banknote, CalendarClock, History, Loader2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { DataTable, Field } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { paymentPlansApi, planAgreementApi, savePaymentPlanApi, savePlanAgreementApi } from "@/lib/billing/api";
import { PAYMENT_METHODS } from "@/lib/billing/payment_rules";
import { DEFAULT_GRACE_DAYS, OPEN_PLAN_STATUSES, PLAN_FREQUENCIES, buildSchedule, deferAllocations, financedOf, frequencyNoun, validatePlan } from "@/lib/billing/payment_plan_rules";
import { addPeriods, periodLabel, periodOf, round2 } from "@/lib/billing/periods";
import { BankAccountSelect, useCanPost } from "./ledger_dialogs";
import { SummaryTiles } from "./sections";
import { formatDate, money } from "./shared";

// Payment plans (CORE-14): the set-up wizard (amount → schedule → activate or save a draft), activating a draft with its down payment, and the printed agreement.

const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";
const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";

export const PLAN_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Active: { label: "Active", variant: "info" },
  Completed: { label: "Completed", variant: "success" },
  Defaulted: { label: "Defaulted", variant: "danger" },
  Cancelled: { label: "Cancelled", variant: "neutral" },
};

export const INSTALLMENT_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "neutral" },
  Billed: { label: "Billed", variant: "info" },
  Paid: { label: "Paid", variant: "success" },
  Missed: { label: "Missed", variant: "danger" },
  Accelerated: { label: "Due now", variant: "warning" },
};

// An installment's pill: an accelerated one still owed reads "Due now".
export const installmentStatus = (i) => (i.accelerated && i.status !== "Paid" ? "Accelerated" : i.status);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Open the merged agreement as a printable page in a new tab (the tab opens first so the browser doesn't block it).
export async function openPlanAgreement(planId) {
  const win = window.open("", "_blank");
  const res = await planAgreementApi(planId);
  if (!res.ok) {
    win?.close();
    toast.error(res.error || "Couldn't build the agreement.");
    return false;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(res.name)}</title><style>body{font:15px/1.6 Georgia,serif;color:#111;margin:48px auto;max-width:720px;padding:0 24px}pre{white-space:pre-wrap;font:inherit}button{font:13px system-ui;padding:6px 14px;margin-bottom:24px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><pre>${esc(res.text)}</pre></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  if (win) win.location.href = url;
  else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

const DOWN_TABS = [
  { value: "record", label: "Record it now", icon: Banknote },
  { value: "existing", label: "Already recorded", icon: History },
];

// The down payment: record it as an office payment now (CORE-11's path), or pick one already on the lease.
export function DownPaymentFields({ values, set, amount, payments = [] }) {
  const canPost = useCanPost();
  const eligible = payments.filter((p) => p.amount + 0.004 >= amount);
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Down payment · {money(amount)}</p>
        <SegmentedTabs tabs={DOWN_TABS} value={values.downMode} onChange={(v) => set({ downMode: v })} />
      </div>
      {values.downMode === "existing" ? (
        eligible.length ? (
          <Field label="Payment" htmlFor="pp-down-entry" hint="A payment on this lease in the last 60 days that isn't another plan's down payment.">
            <Select value={values.downEntryId || ""} onValueChange={(v) => set({ downEntryId: v })}>
              <SelectTrigger id="pp-down-entry" className="bg-surface-card">
                <SelectValue placeholder="Select a payment…" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((p) => (
                  <SelectItem key={p.entryId} value={p.entryId}>
                    {[formatDate(p.date), money(p.amount), p.method, p.reference ? `#${p.reference}` : ""].filter(Boolean).join(" · ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-text-secondary">No payment of at least {money(amount)} on this lease in the last 60 days. Record the down payment now instead.</p>
        )
      ) : canPost ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Method" htmlFor="pp-down-method">
            <Select value={values.downMethod || ""} onValueChange={(v) => set({ downMethod: v })}>
              <SelectTrigger id="pp-down-method" className="bg-surface-card">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reference" htmlFor="pp-down-ref">
            <Input id="pp-down-ref" value={values.downReference || ""} onChange={(e) => set({ downReference: e.target.value })} placeholder="Check # or confirmation" className="bg-surface-card" />
          </Field>
          <Field label="Deposit to" htmlFor="pp-down-bank">
            <BankAccountSelect id="pp-down-bank" value={values.downBankAccountId || ""} onChange={(v) => set({ downBankAccountId: v })} />
          </Field>
          <Field label="Received on" htmlFor="pp-down-date">
            <Input id="pp-down-date" type="date" value={values.downDate || ""} onChange={(e) => set({ downDate: e.target.value })} className="bg-surface-card" />
          </Field>
        </div>
      ) : (
        <RoleNote>Your role can&apos;t record payments. Record the down payment from the lease&apos;s Ledger, then pick it under Already recorded.</RoleNote>
      )}
    </div>
  );
}

// Down payment fields → the API's downPayment ({ entryId } or { record }), or a reason it isn't ready.
export function downPaymentOf(values, amount) {
  if (!(amount > 0)) return { body: undefined };
  if (values.downMode === "existing") return values.downEntryId ? { body: { entryId: values.downEntryId } } : { error: "Pick the payment that covers the down payment." };
  if (!values.downMethod) return { error: "Pick how the down payment was paid." };
  return {
    body: {
      record: {
        requestId: values.requestId,
        method: values.downMethod,
        reference: values.downReference || "",
        bankAccountId: values.downBankAccountId || undefined,
        date: values.downDate || undefined,
      },
    },
  };
}

const downDefaults = (today) => ({ requestId: crypto.randomUUID(), downMode: "record", downMethod: "Check", downReference: "", downBankAccountId: "", downDate: today, downEntryId: "" });

// What happened after a plan was saved, in a toast.
function announce(res, activate) {
  const plan = res.plan;
  const financed = financedOf(plan);
  const down = res.downPayment?.created ? ` Down payment recorded${res.downPayment.receiptNo ? ` (${res.downPayment.receiptNo})` : ""}.` : "";
  if (activate) toast.success(`Payment plan active — ${money(financed)} deferred over ${plan.installmentCount} installments.${down}`);
  else toast.success("Payment plan saved as a draft. Activate it from the lease's Payment Plan tab once the agreement is signed.");
}

const SCHEDULE_COLUMNS = [
  { key: "seq", header: "#", className: "w-12 tabular-nums text-text-secondary", render: (r) => r.seq },
  { key: "dueDate", header: "Due", className: "whitespace-nowrap text-sm text-foreground", render: (r) => formatDate(r.dueDate) },
  { key: "amount", header: "Amount", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => money(r.amount) },
];

// The charges the plan defers once the down payment is applied (both oldest first), as the server will.
function deferredPreview(items, total, down) {
  let left = round2(down);
  const after = (items || []).map((i) => {
    const take = Math.min(left, i.open);
    left = round2(left - take);
    return { ...i, open: round2(i.open - take) };
  });
  const { allocations } = deferAllocations(after.filter((i) => i.open > 0), round2(total - down));
  const byId = new Map(items.map((i) => [i.entryId, i]));
  return allocations.map((a) => ({ ...byId.get(a.entryId), deferred: a.amount }));
}

const itemLabel = (i) => (i.kind === "rent" && i.period ? `Rent · ${periodLabel(i.period)}` : i.memo || "Charge");

function AmountSummary({ data, values }) {
  const total = round2(values.totalAmount);
  const down = round2(values.downPayment);
  const rows = total > 0 && down < total ? deferredPreview(data.items, total, down) : [];
  return (
    <div className="space-y-3">
      <SummaryTiles
        items={[
          { label: "Balance owed", value: money(data.balance) },
          { label: "Past due", value: money(data.pastDue), className: data.pastDue > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
          { label: "Open charges", value: money(data.openTotal) },
        ]}
      />
      {rows.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle p-4 text-sm">
          <p className="font-medium text-foreground">
            {money(total - down)} moves to Deferred Receivable on activation{down > 0 ? `, after the ${money(down)} down payment` : ""}
          </p>
          <ul className="mt-2 space-y-1 text-text-secondary">
            {rows.map((r) => (
              <li key={r.entryId} className="flex justify-between gap-3">
                <span className="truncate">
                  {itemLabel(r)} · {formatDate(r.date)}
                </span>
                <span className="tabular-nums">{money(r.deferred)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleStep({ data, values }) {
  const schedule = buildSchedule(values);
  const after = data.policies.planDefaultAfterMissed;
  return (
    <div className="space-y-3">
      {schedule.length ? (
        <DataTable
          columns={SCHEDULE_COLUMNS}
          data={schedule}
          getRowKey={(r) => r.seq}
          empty={null}
        />
      ) : null}
      <p className="text-xs text-text-secondary">
        {schedule.length ? `${money(financedOf(values))} in ${schedule.length} installments (${frequencyNoun(values.frequency)}). ` : ""}
        Each installment bills to the lease ledger on its due date and is missed if it&apos;s still unpaid {values.graceDays || 0} days later.{" "}
        {after > 0 ? `The plan defaults after ${after} missed installment${after === 1 ? "" : "s"} (Fees & Policies), and its unpaid balance comes due at once.` : "Plans don't default automatically (Fees & Policies)."}
        {data.policies.lateFeeOnInstallments ? " A late installment is charged the late fee." : ""}
      </p>
    </div>
  );
}

const MODE_TABS = [
  { value: "activate", label: "Activate now", icon: CalendarClock },
  { value: "draft", label: "Save as draft", icon: History },
];

function ActivateStep({ data, values, set }) {
  const down = round2(values.downPayment);
  const activate = values.mode === "activate";
  return (
    <div className="space-y-4">
      <SegmentedTabs tabs={MODE_TABS} value={values.mode} onChange={(v) => set({ mode: v })} />
      <p className="text-sm text-text-secondary">
        {activate
          ? `Activating moves ${money(financedOf(values))} of open charges to Deferred Receivable, so the lease balance, autopay and late fees see only what's due now.${values.suspendLateFees ? " Late fees on rent pause while the plan is kept." : ""}`
          : "A draft changes nothing on the ledger. Print the agreement for signatures, then activate it from the lease's Payment Plan tab with the down payment."}
      </p>
      {activate && down > 0 ? <DownPaymentFields values={values} set={set} amount={down} payments={data.payments} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {activate ? (
          <Field label="Agreement signed on" htmlFor="pp-signed" hint="Optional — record it later if it isn't signed yet.">
            <Input id="pp-signed" type="date" value={values.signedOn || ""} onChange={(e) => set({ signedOn: e.target.value })} className="bg-surface-card" />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-secondary">
          <Switch checked={Boolean(values.saveAgreement)} onCheckedChange={(v) => set({ saveAgreement: v })} /> Save the agreement to the lease&apos;s Documents
        </label>
      </div>
    </div>
  );
}

const AMOUNT_FIELDS = [
  { key: "name", label: "Plan name", type: "text", full: true, placeholder: "e.g. Fall catch-up plan" },
  { key: "totalAmount", label: "Plan total", type: "currency", required: true, hint: "Defaults to the past-due balance." },
  { key: "downPayment", label: "Down payment", type: "currency", hint: "Paid before the plan starts; 0 for none." },
];

const SCHEDULE_FIELDS = [
  { key: "installmentCount", label: "Installments", type: "number", required: true, min: 1 },
  { key: "frequency", label: "Frequency", type: "select", options: PLAN_FREQUENCIES.map((f) => ({ value: f, label: f === "Biweekly" ? "Every two weeks" : f })) },
  { key: "firstDue", label: "First installment due", type: "date", required: true },
  { key: "graceDays", label: "Grace period (days)", type: "number", min: 0, hint: "Days after a due date before an installment counts as missed." },
  { key: "suspendLateFees", label: "Pause late fees on rent while the plan is kept", type: "switch", full: true },
];

// The wizard once the lease's balances have loaded.
function PlanWizardBody({ data, leaseId, onOpenChange, onSaved }) {
  const [initial] = useState(() => ({
    name: "Payment plan",
    totalAmount: data.pastDue > 0 ? data.pastDue : data.openTotal,
    downPayment: 0,
    installmentCount: 3,
    frequency: "Monthly",
    firstDue: `${addPeriods(periodOf(data.today), 1)}-01`,
    graceDays: DEFAULT_GRACE_DAYS,
    suspendLateFees: true,
    mode: "activate",
    signedOn: data.today,
    saveAgreement: true,
    ...downDefaults(data.today),
  }));
  const steps = [
    {
      key: "amount",
      title: "Amount",
      description: "What the plan covers. It takes the lease's open charges oldest first.",
      fields: AMOUNT_FIELDS,
      render: ({ values }) => <AmountSummary data={data} values={values} />,
      validate: (v) => validatePlan({ ...v, installmentCount: 1, firstDue: data.today }, { openTotal: data.openTotal }),
    },
    {
      key: "schedule",
      title: "Schedule",
      fields: SCHEDULE_FIELDS,
      render: ({ values }) => <ScheduleStep data={data} values={values} />,
      validate: (v) => validatePlan({ ...v, graceDays: v.graceDays === "" ? DEFAULT_GRACE_DAYS : Number(v.graceDays) }, { today: data.today, openTotal: data.openTotal }),
    },
    {
      key: "activate",
      title: "Activate",
      render: ({ values, set }) => <ActivateStep data={data} values={values} set={set} />,
      validate: (v) => (v.mode === "activate" ? downPaymentOf(v, round2(v.downPayment)).error : null),
    },
  ];
  const finish = async (v) => {
    const activate = v.mode === "activate";
    const plan = {
      name: v.name,
      totalAmount: round2(v.totalAmount),
      downPayment: round2(v.downPayment),
      installmentCount: Number(v.installmentCount),
      frequency: v.frequency,
      firstDue: v.firstDue,
      graceDays: v.graceDays === "" ? DEFAULT_GRACE_DAYS : Number(v.graceDays),
      suspendLateFees: v.suspendLateFees !== false,
    };
    const res = await savePaymentPlanApi({ leaseId, plan, activate, downPayment: activate ? downPaymentOf(v, plan.downPayment).body : undefined, signedOn: activate ? v.signedOn || undefined : undefined });
    if (!res.ok) {
      if (!res.plan) {
        toast.error(res.error || "Couldn't set up the payment plan.");
        return false;
      }
      // The draft saved; activation didn't (a refused down payment, say), so it stays a draft to activate later.
      toast.warning(`Saved as a draft — it wasn't activated: ${res.error}${res.downPayment?.created ? " The down payment was recorded." : ""}`);
      onSaved?.(res.plan);
      return true;
    }
    if (v.saveAgreement) {
      const doc = await savePlanAgreementApi(res.plan.id, { save: true });
      if (!doc.ok) toast.warning(`The plan is saved, but the agreement wasn't: ${doc.error}`);
    }
    announce(res, activate);
    onSaved?.(res.plan);
    return true;
  };
  return (
    <WizardDialog
      open
      onOpenChange={onOpenChange}
      title="Set up a payment plan"
      description="Spread what's owed over installments. The deferred part leaves the lease balance until each installment falls due."
      steps={steps}
      initial={initial}
      onFinish={finish}
      finishLabel="Set Up Plan"
    />
  );
}

function NoticeDialog({ onOpenChange, title, children }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Payment plan</DialogDescription>
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

// "Set up payment plan" from a lease (its ledger or Payment Plan tab): loads balances and open charges, then runs the wizard.
export function PaymentPlanWizard({ open, onOpenChange, leaseId, data: preloaded = null, onSaved }) {
  const [loaded, setLoaded] = useState({ key: "", res: null });
  const key = open && !preloaded ? leaseId : "";
  useEffect(() => {
    if (!key) return;
    let alive = true;
    paymentPlansApi(key).then((res) => alive && setLoaded({ key, res }));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!open) return null;
  const res = preloaded || (loaded.key === key ? loaded.res : null);
  if (!res) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up a payment plan</DialogTitle>
            <DialogDescription>Loading the lease&apos;s balance and open charges…</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <LogoLoading size={40} />
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
  const current = (res.plans || []).find((p) => OPEN_PLAN_STATUSES.includes(p.status));
  if (current) {
    return (
      <NoticeDialog onOpenChange={onOpenChange} title={current.status === "Draft" ? "A draft plan is waiting" : "This lease is on a plan"}>
        <p className="text-sm text-text-secondary">
          {current.status === "Draft"
            ? `“${current.name}” is saved as a draft. Activate or cancel it on the lease's Payment Plan tab before setting up another.`
            : `“${current.name}” is active, with ${money(current.deferredRemaining)} still deferred. A lease has one plan at a time; cancel it on the Payment Plan tab to start over.`}
        </p>
      </NoticeDialog>
    );
  }
  if (!(res.openTotal > 0)) {
    return (
      <NoticeDialog onOpenChange={onOpenChange} title="Nothing to put on a plan">
        <p className="text-sm text-text-secondary">This lease has no open charges, so there&apos;s nothing to spread over installments.</p>
      </NoticeDialog>
    );
  }
  return <PlanWizardBody data={res} leaseId={leaseId} onOpenChange={onOpenChange} onSaved={onSaved} />;
}

// Activate a draft: its down payment (recorded now or picked) and the signing date.
export function ActivatePlanDialog({ plan, data, onOpenChange, onDone }) {
  const [values, setValues] = useState(() => ({ signedOn: plan.signedOn || data.today, ...downDefaults(data.today) }));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setValues((v) => ({ ...v, ...patch }));
  const financed = useMemo(() => financedOf(plan), [plan]);
  const submit = async () => {
    const down = downPaymentOf(values, plan.downPayment);
    if (down.error) return toast.error(down.error);
    setBusy(true);
    const res = await savePaymentPlanApi({ planId: plan.id, activate: true, downPayment: down.body, signedOn: values.signedOn || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(`${res.error || "Couldn't activate the plan."}${res.downPayment?.created ? " The down payment was recorded." : ""}`);
      if (res.downPayment?.created) onDone?.();
      return;
    }
    announce(res, true);
    onDone?.();
    onOpenChange(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-background sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Activate “{plan.name}”</DialogTitle>
          <DialogDescription>
            {money(financed)} of open charges moves to Deferred Receivable; {plan.installmentCount} installments ({frequencyNoun(plan.frequency)}) bill from {formatDate(plan.firstDue)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {plan.downPayment > 0 ? <DownPaymentFields values={values} set={set} amount={plan.downPayment} payments={data.payments} /> : null}
          <Field label="Agreement signed on" htmlFor="pp-act-signed">
            <Input id="pp-act-signed" type="date" value={values.signedOn || ""} onChange={(e) => set({ signedOn: e.target.value })} className="bg-surface-card" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className={PRIMARY} disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Activate Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
