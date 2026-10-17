"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { CalendarSync, CreditCard, Loader2, Lock, Receipt, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, ScreenHeader, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { AUTOPAY_STATUS_MAP, PAYMENT_STATUS_MAP } from "@/lib/payments/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { cn } from "@/lib/utils";
import { DataGate, Notice, Panel, PortalEmpty, Row, Rows, Stat, fmtDate, money, usePortalData } from "../portal_kit";

const METHOD_LABELS = { card: "Card", ach: "Bank account (ACH)" };

function PayPanel({ data }) {
  const { ledger, options, permissions, home } = data;
  const suggested = ledger.balance > 0 ? ledger.balance : home.lease?.rent || "";
  const [amount, setAmount] = useState(suggested ? String(Number(suggested).toFixed(2)) : "");
  const [method, setMethod] = useState(options?.methods?.[0] || "");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!permissions.payments) {
    return (
      <Notice icon={Lock}>{permissions.paymentsBlockedReason || "Online payments are turned off for your account. Contact the office to pay."}</Notice>
    );
  }
  if (!home.lease) return <Notice icon={Receipt}>No lease is linked to your account yet, so there&apos;s nothing to pay online.</Notice>;
  if (!options?.stripeConfigured) {
    return <Notice icon={CreditCard}>Online payments aren&apos;t set up yet. Pay the office directly — this will turn on once your property manager connects payments.</Notice>;
  }

  const fee = Number(options.fees?.[method] || 0);
  const pay = async () => {
    const n = Number(amount);
    if (!(n > 0)) return toast.error("Enter an amount to pay.");
    setBusy(true);
    const res = await portalApi("/api/portal/resident/pay", { method: "POST", body: { amount: n, method, savePaymentMethod: save } });
    if (res.ok && res.url) {
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    toast.error(res.error || "Couldn't start the payment.");
  };

  return (
    <Panel title="Make a payment" description="You'll finish on a secure checkout page.">
      {!options.allowed && options.reason ? <Notice className="mb-4">{options.reason}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" htmlFor="pay-amount" hint={options.allowPartial ? "You can pay part of your balance." : "Pay the full balance."}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">$</span>
            <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="pl-6 tabular-nums" />
          </div>
        </Field>
        <Field label="Pay with">
          <div className="grid grid-cols-2 gap-2">
            {(options.methods || []).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  method === m ? "border-border-strong bg-surface-active text-foreground" : "border-border bg-surface-card text-text-secondary hover:bg-surface-hover",
                )}
              >
                <span className="block font-medium">{METHOD_LABELS[m] || m}</span>
                <span className="block text-xs text-text-tertiary">{Number(options.fees?.[m]) ? `+ ${money(options.fees[m])} fee` : "No fee"}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>
      {options.allowSaveMethod ? (
        <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Checkbox checked={save} onCheckedChange={(v) => setSave(Boolean(v))} /> Save this payment method for next time
        </label>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-tertiary">{fee ? `A ${money(fee)} convenience fee applies to ${METHOD_LABELS[method] || method} payments.` : "Payments post to your ledger once they clear."}</p>
        <Button onClick={pay} disabled={busy || !options.allowed || !(options.methods || []).length} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Pay {Number(amount) > 0 ? money(Number(amount) + fee) : ""}
        </Button>
      </div>
    </Panel>
  );
}

function AutopayPanel({ data, onChanged }) {
  const { autopay, autopayAvailable, autopayStatus: status, options, permissions } = data;
  const [busy, setBusy] = useState(false);
  const active = autopay && autopay.status !== "canceled";

  const enroll = async () => {
    setBusy(true);
    const res = await portalApi("/api/portal/resident/autopay", { method: "POST" });
    if (res.ok && res.url) {
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    if (res.ok) {
      toast.success("Autopay is set up.");
      onChanged();
    } else toast.error(res.error);
  };
  const cancel = async () => {
    setBusy(true);
    const res = await portalApi("/api/portal/resident/autopay", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      toast.success("Autopay canceled.");
      onChanged();
    } else toast.error(res.error);
  };

  const canManage = autopayAvailable && permissions.payments && options?.stripeConfigured && status?.enabled !== false;
  const blocked = canManage && !active && status && !status.allowed ? status.reason : "";
  return (
    <Panel
      title="Autopay"
      description="Pay your balance automatically each month."
      action={active ? <StatusPill status={autopay.status} map={AUTOPAY_STATUS_MAP} /> : null}
    >
      {active ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Method">{autopay.method || "—"}</Stat>
          <Stat label="Charge day">{autopay.chargeDay ? `Day ${autopay.chargeDay}` : "Rent due day"}</Stat>
          <Stat label={status?.nextChargeOn ? "Next charge" : "Last run"}>
            {status?.nextChargeOn ? fmtDate(status.nextChargeOn) : autopay.lastRunOn ? `${fmtDate(autopay.lastRunOn)} · ${autopay.lastStatus || ""}` : "Not yet"}
          </Stat>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">You&apos;re not enrolled in autopay.</p>
      )}
      {blocked ? <p className="mt-3 text-xs text-text-tertiary">{blocked}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {canManage ? (
          active ? (
            <Button variant="outline" onClick={cancel} disabled={busy} className="border-border bg-surface-card hover:bg-surface-hover">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Cancel Autopay
            </Button>
          ) : (
            <Button onClick={enroll} disabled={busy || Boolean(blocked)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />} Set Up Autopay
            </Button>
          )
        ) : (
          <p className="text-xs text-text-tertiary">Online autopay enrollment isn&apos;t available yet — contact the office to set it up.</p>
        )}
      </div>
    </Panel>
  );
}

export function ResidentPayments() {
  const state = usePortalData("/api/portal/resident/ledger");
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Payments" description="Your balance, charges and payments, and ways to pay online." />
      <DataGate state={state}>
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface-subtle p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Balance due</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(Math.max(0, data.ledger.balance))}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Credit on account</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(data.ledger.credit)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Monthly rent</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(data.home.lease?.rent || 0)}</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <PayPanel data={data} />
              <AutopayPanel data={data} onChanged={state.reload} />
            </div>

            {data.ledger.openCharges.length ? (
              <Panel title="Open charges" description="Applied oldest first when you pay." flush>
                <Rows>
                  {data.ledger.openCharges.map((c) => (
                    <Row key={c.id} title={c.memo} meta={`${fmtDate(c.date)}${c.paid ? ` · ${money(c.paid)} paid` : ""}`} aside={<span className="text-sm tabular-nums text-foreground">{money(c.open)}</span>} />
                  ))}
                </Rows>
              </Panel>
            ) : null}

            {data.permissions.ledger ? (
              data.ledger.rows.length ? (
                <Panel title="Ledger" description="Every charge and payment, newest first." flush>
                  <Rows>
                    {data.ledger.rows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{r.memo}</p>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {fmtDate(r.date)} · {r.type}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn("text-sm tabular-nums", r.payment > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                            {r.payment > 0 ? `−${money(r.payment)}` : money(r.charge)}
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums text-text-tertiary">Balance {money(r.balance)}</p>
                        </div>
                      </div>
                    ))}
                  </Rows>
                </Panel>
              ) : (
                <PortalEmpty icon={Receipt} title="No ledger activity yet" description="Charges and payments will appear here as they post." />
              )
            ) : (
              <Notice>Your detailed ledger isn&apos;t shared in the portal. Contact the office for a statement.</Notice>
            )}

            {data.payments.length ? (
              <Panel title="Online payments" flush>
                <Rows>
                  {data.payments.map((p) => (
                    <Row
                      key={p.id}
                      title={p.description || "Online payment"}
                      meta={[fmtDate(p.date), p.method].filter(Boolean).join(" · ")}
                      aside={
                        <>
                          <StatusPill status={p.status} map={PAYMENT_STATUS_MAP} />
                          <span className="text-sm tabular-nums text-foreground">{money(p.total)}</span>
                        </>
                      }
                    />
                  ))}
                </Rows>
              </Panel>
            ) : null}
          </>
        )}
      </DataGate>
    </MainScreenWrapper>
  );
}

export default ResidentPayments;
