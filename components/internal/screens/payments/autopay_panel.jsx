"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Power, Repeat, Send } from "lucide-react";

import { Field, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { autopayAction } from "@/lib/payments/api";
import { usePermission } from "@/context/rbac-context";
import { AUTOPAY_STATUS_MAP } from "@/lib/payments/constants";
import { Notice, formatDate, money } from "./shared";

// Autopay for one lease: status, saved method, next charge, and staff actions
// (send / start setup, turn off). Setup runs on Stripe Checkout in setup mode;
// the `autopay` scheduled job charges the open balance on the charge day.

const EMPTY = { payerEmail: "", amountMode: "balance", fixedAmount: "", maxAmount: "", chargeDay: "", sendEmail: true };

function SetupDialog({ open, onOpenChange, leaseId, tenantId, payerEmail, onDone }) {
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setV({ ...EMPTY, payerEmail: payerEmail || "" });
      setLink("");
    }
  }
  const set = (k) => (val) => setV((p) => ({ ...p, [k]: val }));
  const body = {
    leaseId,
    tenantId: tenantId || undefined,
    payerEmail: v.payerEmail || undefined,
    amountMode: v.amountMode,
    fixedAmount: v.amountMode === "fixed" ? Number(v.fixedAmount) || 0 : undefined,
    maxAmount: Number(v.maxAmount) || undefined,
    chargeDay: Number(v.chargeDay) || undefined,
  };

  const run = async (action) => {
    if (v.amountMode === "fixed" && !(Number(v.fixedAmount) > 0)) {
      toast.error("Enter the fixed amount.");
      return;
    }
    setBusy(action);
    const res = await autopayAction(action, { ...body, sendEmail: action === "link" ? v.sendEmail : undefined });
    setBusy("");
    if (!res.ok) {
      toast.error(res.error || "Couldn't start autopay setup.");
      return;
    }
    if (action === "enroll") {
      window.location.assign(res.url);
      return;
    }
    setLink(res.url);
    toast.success(res.emailed ? "Autopay setup link emailed." : "Autopay setup link created.");
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up autopay</DialogTitle>
          <DialogDescription>The resident saves a card or bank account; it&apos;s charged automatically each month.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="grid gap-3">
            <Notice tone="success" title="Setup link ready">Share it with the resident to save their payment method.</Notice>
            <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Resident email" htmlFor="ap-email" className="sm:col-span-2">
              <Input id="ap-email" type="email" value={v.payerEmail} onChange={(e) => set("payerEmail")(e.target.value)} />
            </Field>
            <Field label="Charge" htmlFor="ap-mode">
              <Select value={v.amountMode} onValueChange={set("amountMode")}>
                <SelectTrigger id="ap-mode" className="w-full bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance">Full open balance</SelectItem>
                  <SelectItem value="fixed">A fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {v.amountMode === "fixed" ? (
              <Field label="Fixed amount" htmlFor="ap-fixed">
                <Input id="ap-fixed" type="number" min="0" step="0.01" value={v.fixedAmount} onChange={(e) => set("fixedAmount")(e.target.value)} />
              </Field>
            ) : (
              <Field label="Maximum per charge" htmlFor="ap-max" hint="Blank for no cap.">
                <Input id="ap-max" type="number" min="0" step="0.01" value={v.maxAmount} onChange={(e) => set("maxAmount")(e.target.value)} />
              </Field>
            )}
            <Field label="Charge day" htmlFor="ap-day" hint="1–28; blank uses the rent due day.">
              <Input id="ap-day" type="number" min="1" max="28" value={v.chargeDay} onChange={(e) => set("chargeDay")(e.target.value)} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm sm:col-span-2">
              <span className="font-medium text-foreground">Email the setup link</span>
              <Switch checked={v.sendEmail} onCheckedChange={set("sendEmail")} />
            </label>
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={Boolean(busy)} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => run("enroll")}>
                {busy === "enroll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                Set Up Now
              </Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={() => run("link")}>
                {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Create Link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Props: leaseId, tenantId?, payerEmail?
export function AutopayPanel({ leaseId, tenantId, payerEmail }) {
  const [state, setState] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Advisory RBAC: enrolling collects payments (accounting.post); turning off is cancel-like (accounting.void).
  const canPost = usePermission("accounting.post");
  const canVoid = usePermission("accounting.void");

  const load = useCallback(() => {
    if (!leaseId) return Promise.resolve(setState({ ok: false, error: "No lease linked." }));
    return autopayAction("status", { leaseId, tenantId: tenantId || undefined }).then(setState);
  }, [leaseId, tenantId]);

  useEffect(() => {
    let alive = true;
    if (!leaseId) return undefined;
    autopayAction("status", { leaseId, tenantId: tenantId || undefined }).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [leaseId, tenantId]);

  const turnOff = async () => {
    setBusy(true);
    const res = await autopayAction("cancel", { leaseId, planId: state?.plan?.id });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't turn off autopay.");
      return;
    }
    toast.success("Autopay turned off.");
    load();
  };

  const plan = state?.plan;
  let body;
  if (!leaseId) body = <Notice tone="warning">Link this record to a lease to manage autopay.</Notice>;
  else if (!state) body = <ListLoading label="Loading autopay" className="border-0 py-8" />;
  else if (state.status === 503 || state.stripeConfigured === false) {
    body = <Notice tone="warning" title="Stripe isn't connected">Autopay needs the Stripe keys — see Settings → Payment Processing.</Notice>;
  } else if (!state.ok) body = <Notice tone="danger">{state.error || "Couldn't load autopay."}</Notice>;
  else {
    body = (
      <div className="grid gap-4">
        {!state.allowed ? <Notice tone="danger" title="Online payments blocked">{state.reason}</Notice> : null}
        {state.enabled === false ? <Notice tone="warning">Autopay is turned off in Settings → Payment Processing.</Notice> : null}
        {state.required && !state.enrolled ? <Notice tone="info">This lease&apos;s policy requires autopay.</Notice> : null}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-text-tertiary">Status</p>
            <div className="mt-1">{plan ? <StatusPill status={plan.status} map={AUTOPAY_STATUS_MAP} /> : <span className="text-text-secondary">Not enrolled</span>}</div>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Payment method</p>
            <p className="mt-1 text-foreground">{plan?.methodLabel || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Charges</p>
            <p className="mt-1 text-foreground">
              {plan ? (plan.amountMode === "fixed" ? money(plan.fixedAmount) : "Full open balance") : "—"}
              {plan?.maxAmount ? ` · max ${money(plan.maxAmount)}` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Next charge</p>
            <p className="mt-1 text-foreground">{plan?.nextChargeOn ? formatDate(plan.nextChargeOn) : "—"}</p>
          </div>
        </div>
        {plan?.lastError ? <Notice tone="danger" title={`Last attempt ${plan.lastRunOn ? formatDate(plan.lastRunOn) : ""}`}>{plan.lastError}</Notice> : null}
      </div>
    );
  }

  const canSetup = canPost && state?.ok && state.allowed && state.enabled !== false && plan?.status !== "active";
  return (
    <SectionCard
      title="Autopay"
      description="Charge a saved card or bank account automatically each month."
      action={
        <div className="flex flex-wrap gap-2">
          {canSetup ? (
            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
              <Link2 className="h-4 w-4" /> {plan ? "New Setup Link" : "Set Up Autopay"}
            </Button>
          ) : null}
          {plan && canVoid ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={turnOff} className="text-red-600 dark:text-red-400">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Turn Off
            </Button>
          ) : null}
        </div>
      }
    >
      {body}
      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} leaseId={leaseId} tenantId={tenantId} payerEmail={payerEmail} onDone={load} />
    </SectionCard>
  );
}
