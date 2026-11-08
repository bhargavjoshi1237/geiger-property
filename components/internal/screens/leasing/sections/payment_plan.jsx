"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarClock, FileSignature, FileText, Loader2, MoreHorizontal, Printer, TriangleAlert } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geiger/ui/dropdown-menu";
import { DataTable, EmptyState, Field, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { usePermission } from "@/context/rbac-context";
import { cancelPaymentPlanApi, defaultPaymentPlanApi, paymentPlansApi, savePlanAgreementApi } from "@/lib/billing/api";
import { PLAN_PERMISSION, financedOf, frequencyNoun } from "@/lib/billing/payment_plan_rules";
import { SummaryTiles } from "@/components/internal/screens/accounting/sections";
import {
  ActivatePlanDialog,
  INSTALLMENT_STATUS_MAP,
  PLAN_STATUS_MAP,
  PaymentPlanWizard,
  installmentStatus,
  openPlanAgreement,
} from "@/components/internal/screens/accounting/payment_plans";
import { formatDate, money2 } from "../shared";

// Lease › Payment Plan (CORE-14): the plan's schedule and standing, its agreement, and activate / cancel / default; set-up runs the wizard.

const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";
const NO_PLANS = "Your role can't manage payment plans.";

const INSTALLMENT_COLUMNS = [
  { key: "seq", header: "#", className: "w-12 tabular-nums text-text-secondary", render: (r) => r.seq },
  { key: "dueDate", header: "Due", className: "whitespace-nowrap text-sm text-foreground", render: (r) => formatDate(r.dueDate) },
  { key: "amount", header: "Amount", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => money2(r.amount) },
  { key: "open", header: "Unpaid", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => (r.status === "Scheduled" ? "—" : money2(r.open)) },
  { key: "status", header: "Status", render: (r) => <StatusPill status={installmentStatus(r)} map={INSTALLMENT_STATUS_MAP} /> },
];

const PAST_COLUMNS = [
  { key: "name", header: "Plan", className: "text-sm text-foreground", render: (r) => r.name },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={PLAN_STATUS_MAP} /> },
  { key: "totalAmount", header: "Total", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => money2(r.totalAmount) },
  { key: "ended", header: "Ended", className: "whitespace-nowrap text-sm text-text-secondary", render: (r) => formatDate(r.metadata?.completedOn || r.metadata?.endedOn) || "—" },
];

// Cancel or default with a reason; both post what's still deferred back to the lease balance.
function EndPlanDialog({ plan, kind, onOpenChange, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = plan.status === "Draft";
  const cancel = kind === "cancel";
  const submit = async () => {
    setBusy(true);
    const res = cancel ? await cancelPaymentPlanApi(plan.id, reason) : await defaultPaymentPlanApi(plan.id, reason);
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't update the plan.");
    const posted = (res.entries || []).find((e) => e.created);
    toast.success(`${cancel ? "Plan cancelled" : "Plan defaulted"}${posted ? ` — ${money2(posted.amount)} is due now on the lease` : ""}.`);
    onDone();
    onOpenChange(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cancel ? (draft ? "Cancel the draft" : "Cancel the plan") : "Default the plan"}</DialogTitle>
          <DialogDescription>
            {draft
              ? "Nothing has posted for a draft, so nothing changes on the ledger."
              : `The ${money2(plan.deferredRemaining)} still deferred posts back to the lease balance now and is due at once.${cancel ? "" : " Late fees on rent resume."}`}
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="pp-end-reason">
          <Input id="pp-end-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={cancel ? "e.g. Tenant asked to pay in full" : "e.g. Two installments missed"} className="bg-surface-card" />
        </Field>
        <DialogFooter>
          <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} {cancel ? "Cancel Plan" : "Default Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Record the date the printed agreement was signed.
function SignedDialog({ plan, today, onOpenChange, onDone }) {
  const [date, setDate] = useState(plan.signedOn || today);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const res = await savePlanAgreementApi(plan.id, { signedOn: date });
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't save the date.");
    toast.success("Signing date saved.");
    onDone();
    onOpenChange(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agreement signed</DialogTitle>
          <DialogDescription>The date the tenant signed the printed agreement.</DialogDescription>
        </DialogHeader>
        <Field label="Signed on" htmlFor="pp-signed-on">
          <Input id="pp-signed-on" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-surface-card" />
        </Field>
        <DialogFooter>
          <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !date} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanMenu({ plan, canManage, onOpen }) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await savePlanAgreementApi(plan.id, { save: true });
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't save the agreement.");
    toast.success("Agreement saved to the lease's Documents.");
    onOpen("reload");
  };
  const open = plan.status === "Draft" || plan.status === "Active";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" className="border-border bg-surface-card hover:bg-surface-hover" disabled={busy} aria-label="Plan actions">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-border bg-surface-subtle">
        <DropdownMenuItem onSelect={() => openPlanAgreement(plan.id)}>
          <Printer className="h-4 w-4" /> Print agreement
        </DropdownMenuItem>
        {canManage && open ? (
          <>
            <DropdownMenuItem onSelect={save}>
              <FileText className="h-4 w-4" /> Save agreement to Documents
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpen("signed")}>
              <FileSignature className="h-4 w-4" /> Record signing date
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="text-red-600 focus:bg-red-500/10 dark:text-red-400" onSelect={() => onOpen("cancel")}>
              <Ban className="h-4 w-4" /> {plan.status === "Draft" ? "Cancel draft" : "Cancel plan"}
            </DropdownMenuItem>
            {plan.status === "Active" ? (
              <DropdownMenuItem variant="destructive" className="text-red-600 focus:bg-red-500/10 dark:text-red-400" onSelect={() => onOpen("default")}>
                <TriangleAlert className="h-4 w-4" /> Default plan
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function standingNote(plan, policies) {
  const s = plan.standing;
  if (plan.status === "Draft") return plan.downPayment > 0 ? `Activate once the ${money2(plan.downPayment)} down payment is received; nothing posts until then.` : "Activate it to move the charges to Deferred Receivable; nothing posts until then.";
  if (plan.status !== "Active") return "";
  const after = policies.planDefaultAfterMissed;
  if (s.missed) return `${s.missed} installment${s.missed === 1 ? " is" : "s are"} past the ${plan.graceDays}-day grace period, so late fees on rent are back on.${after > 0 ? ` The plan defaults at ${after} missed (the billing run does it).` : ""}`;
  return `${plan.suspendLateFees ? "Late fees on rent are paused while the plan is kept. " : ""}An installment is missed ${plan.graceDays} days after its due date${after > 0 ? `; the plan defaults at ${after} missed` : ""}.`;
}

function PlanCard({ plan, data, canManage, onAction }) {
  const s = plan.standing;
  const next = plan.status === "Active" ? s.nextDue : null;
  const note = standingNote(plan, data.policies);
  const ended = plan.status === "Defaulted" || plan.status === "Cancelled";
  return (
    <SectionCard
      title={plan.name}
      description={`${money2(financedOf(plan))} in ${plan.installmentCount} installments (${frequencyNoun(plan.frequency)}) from ${formatDate(plan.firstDue)} · ${plan.signedOn ? `signed ${formatDate(plan.signedOn)}` : "agreement not signed yet"}${plan.agreementDocumentId ? " · agreement in Documents" : ""}`}
      action={
        <div className="flex items-center gap-2">
          <StatusPill status={plan.status} map={PLAN_STATUS_MAP} />
          {plan.status === "Draft" && canManage ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onAction("activate", plan)}>
              <CalendarClock className="h-4 w-4" /> Activate
            </Button>
          ) : null}
          <PlanMenu plan={plan} canManage={canManage} onOpen={(kind) => onAction(kind, plan)} />
        </div>
      }
      bodyPadding={false}
    >
      <div className="space-y-4 p-5">
        <SummaryTiles
          items={[
            { label: "Plan total", value: money2(plan.totalAmount) },
            { label: "Down payment", value: money2(plan.downPayment) },
            { label: ended ? "Still owed" : "Deferred (not yet due)", value: money2(ended ? s.open : plan.deferredRemaining) },
            next
              ? { label: "Next installment", value: `${money2(next.open || next.amount)} · ${formatDate(next.dueDate)}`, className: next.status === "Missed" ? "text-red-600 dark:text-red-400" : "text-foreground" }
              : { label: "Paid", value: `${s.paid} of ${plan.installmentCount}` },
          ]}
        />
        {note ? (
          <p className={s.missed && plan.status === "Active" ? "rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300" : "text-sm text-text-secondary"}>{note}</p>
        ) : null}
      </div>
      <DataTable columns={INSTALLMENT_COLUMNS} data={plan.installments} getRowKey={(r) => r.id || r.seq} empty={null} />
    </SectionCard>
  );
}

export function PaymentPlanSection({ item }) {
  const canManage = usePermission(PLAN_PERMISSION);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ key: "", res: null });
  const [dialog, setDialog] = useState(null);
  const key = `${item.id}:${tick}`;
  useEffect(() => {
    let alive = true;
    paymentPlansApi(item.id).then((res) => alive && setState({ key, res }));
    return () => {
      alive = false;
    };
  }, [item.id, key]);
  const reload = () => setTick((t) => t + 1);

  if (state.key !== key) {
    return (
      <div className="flex justify-center py-16">
        <LogoLoading size={48} />
      </div>
    );
  }
  const res = state.res;
  if (!res?.ok) {
    return (
      <SectionCard title="Payment plan">
        <p className="text-sm text-text-secondary">{res?.error || "Couldn't load the payment plans."}</p>
      </SectionCard>
    );
  }
  const plans = res.plans || [];
  const current = plans.find((p) => p.status === "Active" || p.status === "Draft") || null;
  // With no plan in force, the latest completed or defaulted one stays in view (its schedule and what's still owed).
  const latest = current ? null : plans.find((p) => p.status === "Completed" || p.status === "Defaulted") || null;
  const past = plans.filter((p) => p !== current && p !== latest);
  const onAction = (kind, plan) => (kind === "reload" ? reload() : setDialog({ kind, plan }));
  const setUp = (
    <RoleGate allowed={canManage} reason={NO_PLANS}>
      <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canManage || !(res.openTotal > 0)} onClick={() => setDialog({ kind: "wizard" })}>
        <CalendarClock className="h-4 w-4" /> Set Up Payment Plan
      </Button>
    </RoleGate>
  );

  return (
    <div className="space-y-6">
      {current ? (
        <PlanCard plan={current} data={res} canManage={canManage} onAction={onAction} />
      ) : (
        <SectionCard title="Payment plan" description={`Past due ${money2(res.pastDue)} · balance ${money2(res.balance)}`} action={res.openTotal > 0 ? setUp : null}>
          <EmptyState
            icon={CalendarClock}
            title={plans.length ? "No plan in force" : "No payment plan"}
            description={
              res.openTotal > 0
                ? "Spread what's owed over installments: the deferred part leaves the lease balance (and autopay and late fees) until each installment falls due."
                : "This lease has no open charges, so there's nothing to put on a plan."
            }
          />
        </SectionCard>
      )}
      {latest ? <PlanCard plan={latest} data={res} canManage={canManage} onAction={onAction} /> : null}
      {past.length ? (
        <SectionCard title="Earlier plans" bodyPadding={false}>
          <DataTable columns={PAST_COLUMNS} data={past} getRowKey={(r) => r.id} empty={null} />
        </SectionCard>
      ) : null}

      {dialog?.kind === "wizard" ? <PaymentPlanWizard open onOpenChange={(o) => !o && setDialog(null)} leaseId={item.id} data={res} onSaved={reload} /> : null}
      {dialog?.kind === "activate" ? <ActivatePlanDialog plan={dialog.plan} data={res} onOpenChange={(o) => !o && setDialog(null)} onDone={reload} /> : null}
      {dialog?.kind === "cancel" || dialog?.kind === "default" ? <EndPlanDialog plan={dialog.plan} kind={dialog.kind} onOpenChange={(o) => !o && setDialog(null)} onDone={reload} /> : null}
      {dialog?.kind === "signed" ? <SignedDialog plan={dialog.plan} today={res.today} onOpenChange={(o) => !o && setDialog(null)} onDone={reload} /> : null}
    </div>
  );
}

export default PaymentPlanSection;
