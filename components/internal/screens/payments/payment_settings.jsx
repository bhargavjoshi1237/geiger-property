"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, CreditCard, Landmark, Mail, Repeat, ShieldAlert, Timer, Webhook, XCircle } from "lucide-react";

import { Field, SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { SettingsPage, useSetting } from "@/components/internal/screens/settings/settings_kit";
import { BankAccountSelect } from "@/components/internal/screens/accounting/ledger_dialogs";
import { getPaymentsStatus } from "@/lib/payments/api";
import { PAYMENT_SETTINGS_DEFAULTS, PAYMENT_SETTINGS_KEY } from "@/lib/payments/constants";
import { Notice } from "./shared";

// Settings → Payment Processing: Stripe connection health (env-driven, no
// secrets shown) and the per-project online-payment settings (key
// `online_payments`). Accepted methods and fee amounts live in Fees & Policies.

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "charge.failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "setup_intent.succeeded",
  "payout.paid",
  "payout.failed",
];

function Check({ ok, label, hint }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="text-xs text-text-secondary">{hint}</p> : null}
      </div>
    </div>
  );
}

function ConnectionCard() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    getPaymentsStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  const s = status?.stripe || {};
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success("Copied."));

  return (
    <SectionCard
      title="Stripe connection"
      description="Keys are read from the server environment — they're never stored here."
      action={s.mode ? <Badge variant={s.mode === "live" ? "success" : "warning"}>{s.mode === "live" ? "Live mode" : "Test mode"}</Badge> : null}
    >
      {!status ? (
        <p className="text-sm text-text-secondary">Checking…</p>
      ) : status.ok === false ? (
        <Notice tone="warning">{status.error || "Couldn't check the connection."}</Notice>
      ) : (
        <div className="grid gap-5">
          {!s.configured ? (
            <Notice tone="warning" title="Stripe isn't connected">
              Add the keys below to the environment (.env / your host) and restart. Until then residents can&apos;t pay online and autopay is skipped.
            </Notice>
          ) : null}
          <div className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <Check ok={s.configured} label="STRIPE_SECRET_KEY" hint="Creates checkouts, charges autopay and issues refunds." />
              <Check ok={s.webhookConfigured} label="STRIPE_WEBHOOK_SECRET" hint="Verifies webhook events (ACH settlement, returns, disputes)." />
              <Check ok={s.publishableKey} label="NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" hint="For embedded payment forms in the resident portal." />
            </div>
            <div>
              <Check ok={status.serviceRole} label="SUPABASE_SERVICE_ROLE_KEY" hint="Lets the webhook and autopay job post to the ledger." />
              <Check ok={status.scheduler} label="CRON_SECRET" hint="Runs the daily autopay job." />
              <Check ok={status.email} label="Email delivery" hint="Receipts and payment links (GEIGER_EMAIL_API_KEY)." />
            </div>
          </div>
          <div className="grid gap-2">
            <Field label="Webhook endpoint" htmlFor="pp-webhook" hint="Add this URL in Stripe → Developers → Webhooks and subscribe to the events below.">
              <div className="flex items-center gap-2">
                <Input id="pp-webhook" readOnly value={status.webhookUrl || ""} className="bg-surface-card font-mono text-xs" />
                <Button variant="outline" size="icon" aria-label="Copy webhook URL" onClick={() => copy(status.webhookUrl || "")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {WEBHOOK_EVENTS.map((e) => (
                <code key={e} className="rounded border border-border bg-surface-card px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                  {e}
                </code>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => copy(WEBHOOK_EVENTS.join("\n"))}>
              <Copy className="h-4 w-4" /> Copy Event List
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

const num = (v) => (v === "" ? "" : Number(v));

export function PaymentSettingsScreen() {
  const setting = useSetting(PAYMENT_SETTINGS_KEY, PAYMENT_SETTINGS_DEFAULTS, { label: "Payment settings" });
  const { value: v, set } = setting;
  const { setTab } = useWorkspaceUrl();

  return (
    <SettingsPage
      title="Payment Processing"
      description="Collect rent by card and ACH through Stripe, with autopay and automatic ledger posting."
      setting={setting}
      actions={
        <Button variant="outline" onClick={() => setTab("Fees & Policies")}>
          Fees & Policies
        </Button>
      }
    >
      <ConnectionCard />

      <SectionCard title="Collection" description="Which methods are accepted, and the card / ACH fee amounts, come from Fees & Policies.">
        <SettingsList>
          <SettingRow icon={CreditCard} title="Accept online payments" description="Residents and staff can pay by card or ACH through Stripe." checked={v.enabled} onCheckedChange={set("enabled")} />
          <SettingRow icon={CreditCard} title="Pass convenience fees to the payer" description="Adds the card fee % or ACH fee as a separate line at checkout." checked={v.passFees} onCheckedChange={set("passFees")} />
          <SettingRow icon={Repeat} title="Offer to save the payment method" description="Payers can keep their card or bank on file for next time and autopay." checked={v.allowSaveMethod} onCheckedChange={set("allowSaveMethod")} />
          <SettingRow icon={Mail} title="Email receipts" description="Sends the Payment receipt notification when a payment settles." checked={v.sendReceipts} onCheckedChange={set("sendReceipts")} />
        </SettingsList>
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <Field label="Deposit to" htmlFor="pp-bank" hint="The bank account (and its cash GL) online payments post to.">
            <BankAccountSelect id="pp-bank" value={v.depositBankAccountId} onChange={set("depositBankAccountId")} />
          </Field>
          <Field label="Statement descriptor" htmlFor="pp-desc" hint="Up to 22 letters / numbers on card statements.">
            <Input
              id="pp-desc"
              maxLength={22}
              value={v.statementDescriptor}
              onChange={(e) => set("statementDescriptor")(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ""))}
              placeholder="MAPLE COURT RENT"
              className="bg-surface-card"
            />
          </Field>
          <Field label="Largest online payment" htmlFor="pp-max" hint="0 for no limit.">
            <Input id="pp-max" type="number" min="0" value={v.maxPaymentAmount} onChange={(e) => set("maxPaymentAmount")(num(e.target.value))} className="bg-surface-card" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="ACH" description="Bank payments settle in 3–5 business days and can be returned for up to 60 days.">
        <SettingsList>
          <SettingRow
            icon={Landmark}
            title="Credit ACH payments when submitted"
            description="Off: the ledger is credited when the payment settles. On: credited immediately and reversed if it's returned."
            checked={v.achCreditOnSubmit}
            onCheckedChange={set("achCreditOnSubmit")}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard title="Autopay" description="The daily autopay job charges each active plan for the open lease balance.">
        <SettingsList>
          <SettingRow icon={Repeat} title="Allow autopay" description="Residents can enroll a saved card or bank account." checked={v.autopayEnabled} onCheckedChange={set("autopayEnabled")} />
        </SettingsList>
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <Field label="Charge offset (days after due day)" htmlFor="pp-offset" hint="0 charges on the rent due day.">
            <Input id="pp-offset" type="number" min="0" max="27" value={v.autopayDayOffset} onChange={(e) => set("autopayDayOffset")(num(e.target.value))} className="bg-surface-card" />
          </Field>
          <Field label="Pause after failed attempts" htmlFor="pp-fails" hint="0 never pauses.">
            <Input id="pp-fails" type="number" min="0" value={v.autopayMaxFailures} onChange={(e) => set("autopayMaxFailures")(num(e.target.value))} className="bg-surface-card" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Returned payments" description="Returns void the ledger entry, charge the NSF fee from Fees & Policies, and flag the resident.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Require certified funds after" htmlFor="pp-returns" hint="Returned payments before online payments stop for the resident (0 = never).">
            <Input id="pp-returns" type="number" min="0" value={v.certifiedAfterReturns} onChange={(e) => set("certifiedAfterReturns")(num(e.target.value))} className="bg-surface-card" />
          </Field>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-card p-4 text-sm text-text-secondary">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Evictions, a resident&apos;s &ldquo;No online payments&rdquo; / &ldquo;Certified funds only&rdquo; restrictions, and partial-payment rules are enforced on every checkout and autopay charge.
          </div>
        </div>
      </SectionCard>

      <p className="flex items-center gap-2 text-xs text-text-tertiary">
        <Timer className="h-3.5 w-3.5" /> Autopay runs as the &ldquo;Autopay charges&rdquo; scheduled job.
        <Webhook className="ml-2 h-3.5 w-3.5" /> Every verified webhook is logged under Online Payments → Webhook log.
      </p>
    </SettingsPage>
  );
}

export default PaymentSettingsScreen;
