"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Ban, CircleCheck, Landmark, Loader2, ReceiptText, ShieldAlert, Undo2, UserRound } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Field } from "@/components/internal/shared/screen_kit";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { Callout } from "@/components/internal/screens/leasing/sections/gated";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { paymentReturnPreviewApi, returnPaymentApi } from "@/lib/billing/api";
import { RETURN_REASONS, postingDate, returnDateProblem } from "@/lib/billing/returns_rules";
import { round2 } from "@/lib/ledger/postings";
import { NO_VOID, useCanVoid } from "./ledger_dialogs";
import { formatDate, money } from "./shared";

// "Returned (NSF)…" on an office payment (CORE-17): details, then a review of what posts, then the result; the server voids it, corrects a deposited check's bank, charges the NSF fee and flags the tenant.

const STEPS = ["Details", "Review"];
const label = (p) => [p?.method, p?.reference ? `#${p.reference}` : ""].filter(Boolean).join(" ");
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th"}`;

// One line of the review: an icon, what happens, and its detail.
function Effect({ icon: Icon, title, children, tone }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone || "text-text-tertiary"}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {children ? <p className="text-xs text-text-secondary">{children}</p> : null}
      </div>
    </li>
  );
}

// Where the money was, in words.
function moneyText(p) {
  if (p.location === "deposited") return `Deposited in ${p.deposit?.label || "a bank deposit"}${p.deposit?.date ? ` on ${formatDate(p.deposit.date)}` : ""}${p.bankName ? ` into ${p.bankName}` : ""}.`;
  if (p.location === "undeposited") return "Still in Undeposited Funds — not yet in a bank deposit.";
  return `Went straight to ${p.bankName || "the bank"}.`;
}

export function ReturnPaymentDialog({ entry, onOpenChange, onReturned }) {
  const open = Boolean(entry);
  const entryId = entry?.entryId || entry?.id || "";
  const canVoid = useCanVoid();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [returnedOn, setReturnedOn] = useState("");
  const [reason, setReason] = useState("nsf");
  const [chargeFee, setChargeFee] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const inFlight = useRef(false);

  // Reset on open (render-phase), then load what the wizard needs.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPreview(null);
      setError("");
      setStep(0);
      setReason("nsf");
      setDone(null);
    }
  }
  useEffect(() => {
    if (!open || !entryId) return;
    let alive = true;
    paymentReturnPreviewApi(entryId).then((res) => {
      if (!alive) return;
      if (!res.ok) return setError(res.error || "Couldn't load the payment.");
      setPreview(res);
      setReturnedOn(res.today);
      setChargeFee(Boolean(res.fee?.default));
      if (res.returned) setDone(res.returned);
    });
    return () => {
      alive = false;
    };
  }, [open, entryId]);

  const problem = preview ? returnDateProblem({ returnedOn, paymentDate: preview.date, depositDate: preview.location === "deposited" ? preview.deposit?.date : "", today: preview.today }) : "";
  const feeOn = Boolean(preview?.fee?.allowed && preview.fee.amount > 0 && chargeFee);
  const reopened = round2((preview?.reopened || []).reduce((s, r) => s + r.amount, 0));
  const postsOn = preview ? postingDate(returnedOn, preview.lockedThrough) : "";

  const submit = async () => {
    if (inFlight.current) return;
    if (!canVoid) return toast.error(NO_VOID);
    if (problem) return toast.error(problem);
    inFlight.current = true;
    setBusy(true);
    const res = await returnPaymentApi(entryId, { returnedOn, reason, chargeFee: feeOn });
    inFlight.current = false;
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't record the returned payment.");
      return;
    }
    setDone(res);
    toast.success(res.created === false ? "That return was already recorded — nothing new was posted." : `Payment of ${money(res.amount)} marked returned.`);
    for (const w of res.warnings || []) toast.warning(w);
    onReturned?.(res);
  };

  const header = (title, description) => (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  );
  const paid = preview ? [money(preview.amount), label(preview), `received ${formatDate(preview.date)}`, preview.receiptNo].filter(Boolean).join(" · ") : "";

  let body;
  if (error) {
    body = (
      <>
        {header("Returned payment", "This payment can't be loaded.")}
        <Callout tone="danger">{error}</Callout>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  } else if (!preview) {
    body = (
      <>
        {header("Returned payment", "Loading the payment…")}
        <div className="flex justify-center py-8">
          <LogoLoading size={36} aria-label="Loading the payment" />
        </div>
      </>
    );
  } else if (done) {
    const flag = done.tenantFlag;
    body = (
      <>
        {header("Payment returned", `${money(done.amount)} · ${done.reasonLabel} · returned ${formatDate(done.returnedOn)}${done.created === false ? " · already recorded, nothing new was posted" : ""}`)}
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            The payment is voided and the charges it paid are open again.
          </li>
          {done.bankEntryId ? (
            <li className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {money(done.amount)} came back out of {done.bankName || "the bank"} as a returned item; {done.depositLabel || "the deposit"} stays as deposited.
            </li>
          ) : null}
          {done.feeEntryId ? (
            <li className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />A {money(done.feeAmount)} NSF fee was charged.
            </li>
          ) : null}
          {flag ? (
            <li className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {flag.restricted ? `This is their ${ordinal(flag.count)} returned payment — certified funds only from now on.` : `Returned payments on file: ${flag.count}.`}
            </li>
          ) : null}
          {done.postedOn && done.postedOn !== done.returnedOn ? <li className="text-xs">Posted on {formatDate(done.postedOn)}: the books are closed before that.</li> : null}
        </ul>
        <DialogFooter>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  } else if (preview.blocker) {
    body = (
      <>
        {header("Returned payment", paid)}
        <Callout tone="warning">{preview.blocker}</Callout>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  } else if (step === 0) {
    const fee = preview.fee || {};
    body = (
      <>
        {header("Returned payment", paid)}
        <p className="-mt-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Step 1 of {STEPS.length} · {STEPS[0]}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Returned on" htmlFor="rp-date">
            <Input id="rp-date" type="date" value={returnedOn} max={preview.today} onChange={(e) => setReturnedOn(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="rp-reason">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="rp-reason" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2 sm:col-span-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{fee.amount > 0 && fee.allowed ? `Charge NSF fee · ${money(fee.amount)}` : "Charge NSF fee"}</p>
              <p className="text-xs text-text-secondary">
                {!fee.allowed ? "Housing authority payments carry no NSF fee." : fee.amount > 0 ? "From Fees & Policies; posts to Other Income." : "No NSF fee is set in Fees & Policies."}
              </p>
            </div>
            <Switch checked={feeOn} disabled={!fee.allowed || !(fee.amount > 0)} onCheckedChange={setChargeFee} aria-label="Charge NSF fee" />
          </div>
          {problem ? <p className="text-xs text-red-600 dark:text-red-400 sm:col-span-2">{problem}</p> : null}
        </div>
        {!canVoid ? <RoleNote>{NO_VOID}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(problem) || !canVoid} onClick={() => setStep(1)}>
            Review <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </>
    );
  } else {
    const t = preview.tenant;
    body = (
      <>
        {header("Review the return", `${paid} · ${RETURN_REASONS.find((r) => r.value === reason)?.label || ""}`)}
        <p className="-mt-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Step 2 of {STEPS.length} · {STEPS[1]}
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-card">
          <Effect icon={Undo2} title="Void the payment">
            {reopened > 0 ? `Re-opens ${money(reopened)} of charges it paid` : "Takes its credit off the ledger"}
            {round2(preview.amount - reopened) > 0 && reopened > 0 ? ` and removes ${money(preview.amount - reopened)} of unapplied credit` : ""}.
          </Effect>
          <Effect icon={Landmark} title={preview.location === "undeposited" ? "Remove it from Undeposited Funds" : `Take ${money(preview.amount)} back out of ${preview.bankName || "the bank"}`}>
            {moneyText(preview)}
            {preview.location === "deposited" ? " The deposit stays as the bank recorded it; the return is its own line." : ""}
          </Effect>
          <Effect icon={ReceiptText} title={feeOn ? `Charge a ${money(preview.fee.amount)} NSF fee` : "No NSF fee"} />
          {t ? (
            <Effect icon={t.nextRestricts ? ShieldAlert : UserRound} tone={t.nextRestricts ? "text-amber-600 dark:text-amber-400" : undefined} title={`${t.name || "The tenant"}: ${ordinal(t.returnedPayments + 1)} returned payment`}>
              {t.nextRestricts
                ? `That reaches your limit of ${t.threshold} — they switch to certified funds only, so the next personal check is refused.`
                : t.certifiedOnly
                  ? "Already on certified funds only."
                  : t.threshold > 0
                    ? `Certified funds only from the ${ordinal(t.threshold)} return (Payment settings).`
                    : "Counted on the tenant's record."}
            </Effect>
          ) : null}
        </ul>
        {postsOn && postsOn !== returnedOn ? (
          <Callout tone="warning">The books are closed through {formatDate(preview.lockedThrough)}, so the return posts on {formatDate(postsOn)}.</Callout>
        ) : null}
        {!canVoid ? <RoleNote>{NO_VOID}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setStep(0)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={busy || !canVoid || Boolean(problem)} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Record Return
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{body}</DialogContent>
    </Dialog>
  );
}

export default ReturnPaymentDialog;
