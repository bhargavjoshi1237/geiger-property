"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, CreditCard, Link2, Loader2, Send } from "lucide-react";

import { Field, ListLoading } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPaymentLinkApi, getLeasePaymentOptions, startStaffCheckout } from "@/lib/payments/api";
import { ONLINE_METHODS } from "@/lib/payments/constants";
import { usePermission } from "@/context/rbac-context";
import { RoleGate, RoleNote } from "@/components/internal/shared/role_gate";
import { Notice, money } from "./shared";

// Collecting a payment posts it to the ledger (advisory accounting.post).
export const NO_COLLECT = "Your role can't collect payments.";

// Staff "Collect payment": send an emailable Stripe payment link or take the
// payment now on Stripe Checkout, for one lease. Shows the ledger balance,
// accepted methods and convenience fees, and refuses what the lease's payment
// policies block. Exposed as a dialog, a button, and an editor action factory.

const MODES = [
  { value: "link", label: "Send payment link", icon: Send },
  { value: "checkout", label: "Take payment now", icon: CreditCard },
];
const ANY = "__any__";

export const INITIAL_COLLECT = { mode: "link", amount: "", method: "", payerEmail: "", sendEmail: true, description: "" };

// Balance + methods + fees for the lease, re-quoted as the amount changes.
function usePaymentOptions(leaseId, tenantId, amount) {
  const [opts, setOpts] = useState(null);
  const [fees, setFees] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!leaseId) return undefined;
    getLeasePaymentOptions({ leaseId, tenantId }).then((r) => alive && setOpts(r));
    return () => {
      alive = false;
    };
  }, [leaseId, tenantId]);
  const amt = Number(amount) || 0;
  useEffect(() => {
    if (!leaseId || !(amt > 0)) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      getLeasePaymentOptions({ leaseId, tenantId, amount: amt }).then((r) => alive && r.ok && setFees(r.fees));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [leaseId, tenantId, amt]);
  return { opts, fees: fees || opts?.fees || null };
}

const notConfigured = (opts) => opts && (opts.status === 503 || (opts.ok && opts.stripeConfigured === false));

// The form body; values/set are owned by the caller (dialog or wizard step).
export function CollectPaymentForm({ leaseId, tenantId, defaultEmail = "", values, set }) {
  const { opts, fees } = usePaymentOptions(leaseId, tenantId, values.amount);
  const seeded = useRef(false);

  useEffect(() => {
    if (!opts?.ok || seeded.current) return;
    seeded.current = true;
    const methods = opts.methods || [];
    const distinct = new Set(methods.map((m) => opts.fees?.[m] || 0)).size > 1;
    set({
      amount: values.amount || (opts.balance > 0 ? String(opts.balance) : ""),
      method: values.method || (distinct ? methods.find((m) => m === "ach") || methods[0] || "" : ""),
      payerEmail: values.payerEmail || defaultEmail,
      _allowed: opts.allowed && opts.stripeConfigured,
    });
  }, [opts, values.amount, values.method, values.payerEmail, defaultEmail, set]);

  if (!leaseId) return <Notice tone="warning">Link this record to a lease to collect a payment online.</Notice>;
  if (!opts) return <ListLoading label="Loading balance" className="py-10" />;
  if (notConfigured(opts)) {
    return (
      <Notice tone="warning" title="Stripe isn't connected">
        Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to the environment, then
        review Settings → Payment Processing. Record offline payments from the lease ledger meanwhile.
      </Notice>
    );
  }
  if (!opts.ok) return <Notice tone="danger">{opts.error || "Couldn't load this lease."}</Notice>;

  const methods = opts.methods || [];
  const distinct = new Set(methods.map((m) => fees?.[m] || 0)).size > 1;
  const fee = values.method ? fees?.[values.method] || 0 : fees?.[methods[0]] || 0;
  const amt = Number(values.amount) || 0;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-card p-4 text-sm">
        <div>
          <p className="text-xs text-text-tertiary">Balance owed</p>
          <p className="text-lg font-semibold text-foreground">{money(opts.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary">Open charges</p>
          <p className="text-lg font-semibold text-foreground">{opts.openItems?.length || 0}</p>
        </div>
      </div>

      {!opts.allowed ? <Notice tone="danger" title="Online payment blocked">{opts.reason}</Notice> : null}

      <SegmentedTabs tabs={MODES} value={values.mode} onChange={(mode) => set({ mode })} fullWidth />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" htmlFor="cp-amount" hint={opts.allowPartial ? undefined : "Partial payments aren't accepted for this lease."}>
          <Input
            id="cp-amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={values.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="bg-surface-card"
          />
        </Field>
        <Field label="Method" htmlFor="cp-method">
          <Select value={values.method || ANY} onValueChange={(v) => set({ method: v === ANY ? "" : v })}>
            <SelectTrigger id="cp-method" className="w-full bg-surface-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!distinct && methods.length > 1 ? <SelectItem value={ANY}>Payer chooses</SelectItem> : null}
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {ONLINE_METHODS[m].label}
                  {fees?.[m] ? ` · +${money(fees[m])} fee` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {values.mode === "link" ? (
          <Field label="Payer email" htmlFor="cp-email">
            <Input
              id="cp-email"
              type="email"
              value={values.payerEmail}
              onChange={(e) => set({ payerEmail: e.target.value })}
              placeholder="tenant@example.com"
              className="bg-surface-card"
            />
          </Field>
        ) : null}
        <Field label="Description" htmlFor="cp-desc" className={values.mode === "link" ? "" : "sm:col-span-2"}>
          <Input
            id="cp-desc"
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Rent payment"
            className="bg-surface-card"
          />
        </Field>
      </div>

      {values.mode === "link" ? (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
          <span>
            <span className="font-medium text-foreground">Email the link to the payer</span>
            <span className="block text-xs text-text-secondary">The link stays open for 14 days and re-checks the balance policies on each use.</span>
          </span>
          <Switch checked={values.sendEmail} onCheckedChange={(v) => set({ sendEmail: v })} />
        </label>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
        <span className="text-text-secondary">
          {money(amt)}
          {fee > 0 ? ` + ${money(fee)} convenience fee` : ""}
        </span>
        <span className="font-semibold text-foreground">Total {money(amt + fee)}</span>
      </div>
    </div>
  );
}

// Submit the form values → { ok, url? }; owns the toasts.
export async function submitCollectPayment({ leaseId, tenantId, values }) {
  const amount = Number(values.amount) || 0;
  if (!(amount > 0)) {
    toast.error("Enter an amount greater than zero.");
    return { ok: false };
  }
  if (values._allowed === false) {
    toast.error("Online payment isn't available for this lease.");
    return { ok: false };
  }
  const body = {
    leaseId,
    tenantId: tenantId || undefined,
    amount,
    method: values.method || undefined,
    description: values.description || undefined,
  };
  if (values.mode === "checkout") {
    const res = await startStaffCheckout(body);
    if (!res.ok || !res.url) {
      toast.error(res.error || "Couldn't start checkout.");
      return { ok: false };
    }
    window.location.assign(res.url);
    return { ok: true, redirecting: true };
  }
  const res = await createPaymentLinkApi({ ...body, payerEmail: values.payerEmail || undefined, sendEmail: Boolean(values.sendEmail) });
  if (!res.ok) {
    toast.error(res.error || "Couldn't create the payment link.");
    return { ok: false };
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(res.url);
    copied = true;
  } catch {
    copied = false;
  }
  toast.success(
    res.emailed ? "Payment link emailed to the payer." : copied ? "Payment link created and copied." : "Payment link created.",
    { description: values.sendEmail && !res.emailed ? "Email isn't configured, so share the link yourself." : undefined },
  );
  return { ok: true, url: res.url };
}

// Standalone dialog. Props: open, onOpenChange, leaseId, tenantId?, payerEmail?, onDone?(result)
export function CollectPaymentDialog({ open, onOpenChange, leaseId, tenantId, payerEmail = "", onDone }) {
  const [values, setValues] = useState(INITIAL_COLLECT);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const canPost = usePermission("accounting.post");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(INITIAL_COLLECT);
      setLink("");
    }
  }
  const set = useCallback((patch) => setValues((v) => ({ ...v, ...patch })), []);

  const submit = async () => {
    if (!canPost) {
      toast.error(NO_COLLECT);
      return;
    }
    setBusy(true);
    const res = await submitCollectPayment({ leaseId, tenantId, values });
    setBusy(false);
    if (!res.ok || res.redirecting) return;
    setLink(res.url);
    onDone?.(res);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>Card or ACH through Stripe — posted to the lease ledger automatically when it settles.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="grid gap-3">
            <Notice tone="success" title="Payment link ready">Share it with the payer — it opens a secure Stripe checkout.</Notice>
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="bg-surface-card font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy link"
                onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success("Link copied."))}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <CollectPaymentForm leaseId={leaseId} tenantId={tenantId} defaultEmail={payerEmail} values={values} set={set} />
          </div>
        )}
        {!link && !canPost ? <RoleNote>{NO_COLLECT}</RoleNote> : null}
        <DialogFooter>
          {link ? (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onOpenChange(false)}>
              <Check className="h-4 w-4" /> Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={busy || values._allowed === false || !leaseId || !canPost}
                onClick={submit}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : values.mode === "checkout" ? <CreditCard className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {values.mode === "checkout" ? "Continue to Checkout" : "Create Link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Toast the outcome when Stripe Checkout returns here (?payment=…), then clean the URL.
export function usePaymentReturnNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("payment");
    if (!status) return;
    if (status === "succeeded") toast.success("Payment received and posted to the ledger.");
    else if (status === "processing") toast.success("ACH payment submitted — it posts when it settles.");
    else if (status === "canceled") toast("Checkout canceled — nothing was charged.");
    else toast.error("The payment didn't go through.");
    url.searchParams.delete("payment");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);
}

// Button + dialog in one. Props: leaseId, tenantId?, payerEmail?, label?, variant?, size?, onDone?
export function CollectPaymentButton({ leaseId, tenantId, payerEmail, label = "Collect payment", variant = "outline", size = "sm", onDone }) {
  const [open, setOpen] = useState(false);
  const canPost = usePermission("accounting.post");
  usePaymentReturnNotice();
  return (
    <>
      <RoleGate allowed={canPost} reason={NO_COLLECT}>
        <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={!leaseId || !canPost}>
          <CreditCard className="h-4 w-4" /> {label}
        </Button>
      </RoleGate>
      <CollectPaymentDialog open={open} onOpenChange={setOpen} leaseId={leaseId} tenantId={tenantId} payerEmail={payerEmail} onDone={onDone} />
    </>
  );
}

// Editor action for records linked to a lease. config.actions accepts a
// function of the item, so bind it there:
//   actions: (item) => [...otherActions, collectPaymentAction(item, { leaseIdOf: (i) => i.id })]
export function collectPaymentAction(
  item,
  {
    leaseIdOf = (i) => i.leaseId,
    tenantIdOf = (i) => i.tenantId,
    emailOf = (i) => i.email || i.tenantEmail || "",
    key = "collectPayment",
    label = "Collect payment online",
    separatorBefore = false,
  } = {},
) {
  const leaseId = item ? leaseIdOf(item) : "";
  const tenantId = item ? tenantIdOf(item) : "";
  return {
    key,
    label,
    icon: CreditCard,
    separatorBefore,
    permission: "accounting.post",
    showIf: (i) => Boolean(leaseIdOf(i)),
    wizard: {
      title: "Collect payment",
      description: "Card or ACH through Stripe — posted to the lease ledger automatically when it settles.",
      finishLabel: "Continue",
      logSummary: "Started an online payment",
      initial: () => INITIAL_COLLECT,
      steps: [
        {
          key: "collect",
          title: "Payment",
          render: ({ values, set }) => (
            <CollectPaymentForm leaseId={leaseId} tenantId={tenantId} defaultEmail={item ? emailOf(item) : ""} values={values} set={set} />
          ),
        },
      ],
      finish: async (values) => (await submitCollectPayment({ leaseId, tenantId, values })).ok,
    },
  };
}
