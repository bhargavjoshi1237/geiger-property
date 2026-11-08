"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Mail, Plus, Printer, Trash2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Switch } from "@geiger/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { usePermission } from "@/context/rbac-context";
import { finalAccountApi, finalAccountDocsApi, reviseFinalAccountApi } from "@/lib/billing/api";
import { FINAL_ACCOUNT_STATUSES, RULE_DISCLAIMER, sodaOf } from "@/lib/billing/move_out_math";
import { WRITE_OFF_PERMISSION, WRITE_OFF_REASONS, reasonLabel, reasonOf, writeOffReasonProblem } from "@/lib/billing/write_off_rules";
import { SummaryTiles } from "@/components/internal/screens/accounting/sections";
import { Callout } from "./sections/gated";
import { DEDUCTION_CATEGORY_OPTIONS, REFUND_METHOD_OPTIONS, formatDate, money2 } from "./shared";

// Move-out final account (CORE-13): the wizard on the lease and the deposit (move-out → charges → credits & deposit → result → documents),
// committing or revising through /api/billing, and the deposit's Final Account tab with the letter and the final statement.

const NO_VOID = "Revising voids and reposts ledger entries, which needs Void ledger entries.";
const REFUND_OPTIONS = REFUND_METHOD_OPTIONS.filter((o) => o.value !== "Applied to balance");
const SETTLEMENT_TABS = [
  { value: "open", label: "Leave it open" },
  { value: "plan", label: "Set up a payment plan" },
];
// Writing the balance off (CORE-15) needs accounting.write_off.
const WRITE_OFF_TAB = { value: "write_off", label: "Write it off" };
const newCharge = () => ({ id: `c-${crypto.randomUUID().slice(0, 8)}`, label: "", category: "Damage repair", amount: "", notes: "" });

// What the server previews from the wizard's values.
const requestOf = (v) => ({
  moveOutDate: v.moveOutDate || undefined,
  charges: Array.isArray(v.charges) ? v.charges.map((c) => ({ ...c, amount: Number(c.amount) || 0 })) : undefined,
  accelerate: v.accelMonths === undefined ? undefined : { months: Number(v.accelMonths) || 0, amount: v.accelAmount === "" || v.accelAmount === undefined ? undefined : Number(v.accelAmount) },
  email: v.email,
  earlyTermFee: v.earlyTermFee !== false,
});

// The inputs a first preview fills in (the deposit's deductions, the forwarding email, the rent for accelerated months).
function seedOf(p) {
  return {
    moveOutDate: p.moveOut || "",
    charges: (p.charges || []).map((c) => ({ id: c.id, label: c.label, category: c.category, amount: c.amount, notes: c.notes || "", invoiceNumber: c.invoiceNumber || "" })),
    accelMonths: p.accelerate?.months || 0,
    accelAmount: p.accelerate?.amount ?? p.lease?.rent ?? 0,
    email: p.email || "",
    earlyTermFee: p.earlyTerm?.include !== false,
    refundMethod: p.soda?.refundMethod || "Check",
    settlement: p.soda?.settlement || "open",
    writeOffReason: p.soda?.writeOff?.reason || "uncollectible",
    writeOffNote: p.soda?.writeOff?.note || "",
    sendEmail: true,
  };
}

// The preview for the current values (debounced); the first one seeds the inputs.
function usePreview(leaseId, values, set) {
  const body = requestOf(values);
  const key = JSON.stringify(body);
  const first = !values.preview;
  useEffect(() => {
    if (values.previewKey === key) return undefined;
    let alive = true;
    const timer = setTimeout(
      async () => {
        const res = await finalAccountApi(leaseId, { ...body, commit: false });
        if (!alive) return;
        if (!res.ok) return set({ previewError: res.error || "Couldn't work out the final account.", previewKey: key });
        const seed = first ? seedOf(res) : {};
        set({ ...seed, preview: res, previewError: "", previewKey: first ? JSON.stringify(requestOf({ ...values, ...seed })) : key });
      },
      first ? 0 : 350,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the request key carries every input the preview reads
  }, [key, leaseId]);
  return { preview: values.preview || null, error: values.previewError || "", stale: values.previewKey !== key };
}

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <LogoLoading size={40} aria-label="Working out the final account" />
    </div>
  );
}

function Warnings({ list }) {
  if (!list?.length) return null;
  return (
    <div className="space-y-2">
      {list.map((w) => (
        <Callout key={w.text} tone={w.tone === "warning" ? "warning" : "info"}>
          {w.text}
        </Callout>
      ))}
    </div>
  );
}

function Rows({ rows }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border">
      {rows.map(([k, v, tone]) => (
        <div key={k} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <dt className="text-text-secondary">{k}</dt>
          <dd className={tone || "tabular-nums text-foreground"}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Step shell: the preview (loading, error, refreshing) around a step body.
function StepFrame({ leaseId, values, set, children }) {
  const { preview, error, stale } = usePreview(leaseId, values, set);
  const canVoid = usePermission("accounting.void");
  useEffect(() => {
    if (values.canVoid !== canVoid) set({ canVoid });
  }, [canVoid, values.canVoid, set]);
  if (!preview) return error ? <Callout tone="danger">{error}</Callout> : <Loading />;
  return (
    <div className="space-y-4">
      {stale ? (
        <p className="flex items-center gap-2 text-xs text-text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating the figures…
        </p>
      ) : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {children(preview)}
    </div>
  );
}

function MoveOutStep({ values, set, p }) {
  const co = p.closeOut;
  const committed = p.committed;
  return (
    <div className="space-y-4">
      {committed ? (
        <Callout tone="info">
          Committed as version {p.version}
          {p.soda?.committedAt ? ` on ${formatDate(String(p.soda.committedAt).slice(0, 10))}` : ""}. Finishing revises it: version {p.version}&apos;s charges, deposit apply and unpaid refund bill are voided and reposted as version {p.version + 1}.
        </Callout>
      ) : null}
      {committed && !values.canVoid ? <RoleNote>{NO_VOID}</RoleNote> : null}
      {!p.canFinalize && !committed ? <Callout tone="warning">The lease is {p.lease.status}. Record the notice to vacate, terminate or end the lease before committing its final account.</Callout> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Move-out date" htmlFor="fa-moveout" hint={committed ? "Fixed once the account is committed." : "Billing stops on this date; the final month is prorated."}>
          <Input id="fa-moveout" type="date" value={values.moveOutDate || ""} disabled={committed} onChange={(e) => set({ moveOutDate: e.target.value })} className="bg-surface-card" />
        </Field>
        <Field label="Return deadline" htmlFor="fa-due" hint={p.rule ? `From your ${p.place?.name || p.rule.jurisdictionCode} deposit rule` : "From your deposit policy"}>
          <p id="fa-due" className="flex h-9 items-center gap-2 text-sm text-foreground">
            {formatDate(p.returnDue)}
            {p.returnDue && p.today > p.returnDue ? <Badge variant="danger">Past due</Badge> : null}
          </p>
        </Field>
      </div>
      {co ? (
        <div className="rounded-xl border border-border bg-surface-subtle p-4 text-sm">
          <p className="font-medium text-foreground">
            {co.billing ? (co.final ? `Final rent ${money2(co.final.amount)} through ${formatDate(co.through)}${co.final.prorated ? " (prorated)" : ""}` : `Billing ends ${formatDate(co.through)}`) : co.message || "This lease isn't billing."}
            {co.credit > 0 ? `; credit ${money2(co.credit)}` : ""}
            {co.charge > 0 ? `; charge ${money2(co.charge)}` : ""}
          </p>
          {co.lines?.length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
              {co.lines.map((l, i) => (
                <li key={`${l.label}-${i}`} className="flex justify-between gap-4">
                  <span className="truncate">{l.label}</span>
                  <span className="tabular-nums">{l.amount < 0 ? `−${money2(-l.amount)}` : money2(l.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {p.plans?.length ? <Callout tone="info">The active payment plan&apos;s {money2(p.plans.reduce((s, x) => s + x.deferred, 0))} still deferred comes due now; the plan is cancelled.</Callout> : null}
      <Warnings list={p.warnings} />
    </div>
  );
}

function ChargesStep({ values, set, p }) {
  const charges = values.charges || [];
  const update = (id, patch) => set({ charges: charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const total = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const accel = p.plan?.accelTotal || 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">Itemize every charge against the deposit. Unpaid rent and unpaid utilities are already open charges, so the deposit pays them without posting them again.</p>
      <div className="space-y-2">
        {charges.map((c) => (
          <div key={c.id} className="grid gap-2 rounded-xl border border-border bg-surface-subtle p-3 sm:grid-cols-[1.4fr_1fr_0.7fr_auto]">
            <Input aria-label="Charge" placeholder="e.g. Carpet cleaning — bedroom 2" value={c.label} onChange={(e) => update(c.id, { label: e.target.value })} className="bg-surface-card" />
            <Select value={c.category || "Other"} onValueChange={(v) => update(c.id, { category: v })}>
              <SelectTrigger aria-label="Category" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEDUCTION_CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input aria-label="Amount" type="number" min="0" step="0.01" placeholder="0.00" value={c.amount} onChange={(e) => update(c.id, { amount: e.target.value })} className="bg-surface-card text-right tabular-nums" />
            <Button variant="ghost" size="icon" aria-label="Remove charge" className="text-muted-foreground hover:text-foreground" onClick={() => set({ charges: charges.filter((x) => x.id !== c.id) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Input aria-label="Notes" placeholder="Notes or invoice # (shown on the letter)" value={c.notes || ""} onChange={(e) => update(c.id, { notes: e.target.value })} className="bg-surface-card sm:col-span-3" />
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => set({ charges: [...charges, newCharge()] })}>
            <Plus className="h-4 w-4" /> Add Charge
          </Button>
          <span className="text-sm tabular-nums text-text-secondary">Charges {money2(total)}</span>
        </div>
      </div>
      <SectionCard title="Accelerated rent" description="Rent for months after the move-out the lease still holds the resident to. Many states only allow actual losses until the unit re-lets.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Months" htmlFor="fa-accel-months">
            <Input id="fa-accel-months" type="number" min="0" max="24" value={values.accelMonths ?? 0} onChange={(e) => set({ accelMonths: e.target.value })} className="bg-surface-card" />
          </Field>
          <Field label="Rent per month" htmlFor="fa-accel-amount" hint={accel > 0 ? `${money2(accel)} in total` : `Current rent ${money2(p.lease?.rent)}`}>
            <Input id="fa-accel-amount" type="number" min="0" step="0.01" value={values.accelAmount ?? ""} onChange={(e) => set({ accelAmount: e.target.value })} className="bg-surface-card" />
          </Field>
        </div>
      </SectionCard>
      {p.earlyTerm?.fee > 0 ? (
        p.earlyTerm.posted ? (
          <p className="text-sm text-text-secondary">The {money2(p.earlyTerm.fee)} early termination fee is already on the lease ledger; the deposit pays it with the other open charges.</p>
        ) : (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <Switch checked={values.earlyTermFee !== false} disabled={p.committed} onCheckedChange={(v) => set({ earlyTermFee: v })} /> Charge the {money2(p.earlyTerm.fee)} early termination fee
          </label>
        )
      ) : null}
      <Warnings list={(p.warnings || []).filter((w) => /accelerated|receipts|term end/.test(w.text))} />
    </div>
  );
}

function CreditsStep({ p }) {
  const plan = p.plan;
  if (p.committed) return <CommittedResult p={p} />;
  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Open after the final rent", value: money2(plan.openAfterCharges - plan.chargesTotal - plan.accelTotal - plan.earlyTermFee) },
          { label: "Move-out charges", value: money2(plan.chargesTotal + plan.accelTotal + plan.earlyTermFee) },
          { label: "Credits applied", value: money2(plan.creditsApplied), className: plan.creditsApplied > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground" },
        ]}
      />
      <Rows
        rows={[
          ...(plan.planDeferred > 0 ? [["Payment plan balance coming due", money2(plan.planDeferred)]] : []),
          ["Credits on the account (prepayments, overpayments, rent credited back)", money2(plan.credits)],
          ...p.deposits.map((d) => [`${d.kind || "Deposit"} held${d.interest > 0 ? ` + ${money2(d.interest)} interest` : ""}`, money2(d.held + d.interest)]),
          ["Deposit applied to charges", money2(plan.applied)],
        ]}
      />
      {!p.deposits.length ? <Callout tone="warning">No deposit on this lease is on the ledger, so nothing is applied or refunded.</Callout> : null}
      <p className="text-xs text-text-secondary">Credits apply first, oldest to the oldest charge; then each deposit (and its interest), the security deposit first.</p>
    </div>
  );
}

function CommittedResult({ p }) {
  const r = p.soda?.result || {};
  const next = p.revise;
  const wo = p.soda?.writeOff;
  return (
    <div className="space-y-4">
      {wo ? <Callout tone="info">{money2(wo.amount)} of the balance owed was written off to Bad Debt ({reasonLabel(wo.reason)}). Revising voids that write-off and writes off what version {p.version + 1} leaves owed.</Callout> : null}
      <SummaryTiles
        items={[
          { label: `Version ${p.version} applied`, value: money2(r.applied) },
          { label: r.balanceOwed > 0 ? "Balance owed" : "Refund", value: money2(r.balanceOwed > 0 ? r.balanceOwed : r.refund) },
          next ? { label: `Version ${p.version + 1} ${next.balanceOwed > 0 ? "owed" : "refund"}`, value: money2(next.balanceOwed > 0 ? next.balanceOwed : next.refund), className: "text-foreground" } : { label: "Charges", value: money2(0) },
        ]}
      />
      {next ? (
        <Rows
          rows={[
            ["Move-out charges", `${money2(next.chargesBefore)} → ${money2(next.chargesAfter)}`],
            ["Deposit applied", `${money2(r.applied)} → ${money2(next.applied)}`],
            [next.balanceOwed > 0 ? "Balance owed" : "Refund", money2(next.balanceOwed > 0 ? next.balanceOwed : next.refund)],
          ]}
        />
      ) : null}
    </div>
  );
}

function ResultStep({ values, set, p }) {
  const canWriteOff = usePermission(WRITE_OFF_PERMISSION);
  if (p.committed) return <CommittedResult p={p} />;
  const plan = p.plan;
  const owed = plan.balanceOwed > 0;
  const tabs = canWriteOff || values.settlement === "write_off" ? [...SETTLEMENT_TABS, WRITE_OFF_TAB] : SETTLEMENT_TABS;
  const reason = reasonOf(values.writeOffReason);
  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Deposit applied", value: money2(plan.applied) },
          owed ? { label: "Balance owed", value: money2(plan.balanceOwed), className: "text-red-600 dark:text-red-400" } : { label: "Refund due", value: money2(plan.refund), className: plan.refund > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground" },
          { label: "Credit refunded", value: money2(plan.creditRefund) },
        ]}
      />
      {plan.refund > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Refund by" htmlFor="fa-method" hint="Raised as a bill payable to the resident in Bills & Payables.">
            <Select value={values.refundMethod || "Check"} onValueChange={(v) => set({ refundMethod: v })}>
              <SelectTrigger id="fa-method" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}
      {owed ? (
        <div className="space-y-2">
          <SegmentedTabs tabs={tabs} value={values.settlement || "open"} onChange={(v) => set({ settlement: v })} />
          <p className="text-sm text-text-secondary">
            {values.settlement === "plan"
              ? "After you finish, set the plan up from the lease's Payment Plan tab; it takes the balance left open."
              : values.settlement === "write_off"
                ? `After the statement and letter are saved, ${money2(plan.balanceOwed)} is written off to 5800 Bad Debt. The documents still show it owed; a later payment can be recorded as a recovery.`
                : "The balance stays on the lease ledger, where payments and collections pick it up."}
          </p>
          {values.settlement === "write_off" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Write-off reason" htmlFor="fa-wo-reason" hint={reason?.hint}>
                <Select value={values.writeOffReason || "uncollectible"} onValueChange={(v) => set({ writeOffReason: v })}>
                  <SelectTrigger id="fa-wo-reason" className="bg-surface-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WRITE_OFF_REASONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={values.writeOffReason === "other" ? "Note (required)" : "Note"} htmlFor="fa-wo-note">
                <Textarea id="fa-wo-note" rows={2} maxLength={500} value={values.writeOffNote || ""} onChange={(e) => set({ writeOffNote: e.target.value })} className="bg-surface-card" />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
      {plan.refund > 0 && plan.balanceOwed === 0 && plan.applied === 0 ? <p className="text-sm text-text-secondary">Nothing was owed, so the whole deposit is refunded.</p> : null}
    </div>
  );
}

// Open a generated page in a new tab.
function openHtml(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function DocumentsStep({ values, set, p }) {
  const mail = !values.email || values.sendEmail === false || p.rule?.params?.mailRequired;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Forwarding email" htmlFor="fa-email" hint={p.forwarding?.email ? "From the move-out details" : "None on file — type one or mail the letter"}>
          <Input id="fa-email" type="email" value={values.email || ""} onChange={(e) => set({ email: e.target.value })} className="bg-surface-card" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-secondary">
          <Switch checked={values.sendEmail !== false} disabled={!values.email} onCheckedChange={(v) => set({ sendEmail: v })} /> Email the statement and letter
        </label>
      </div>
      {mail ? (
        <Callout tone="warning" icon={Mail}>
          Mail required{p.forwarding?.address ? ` to ${p.forwarding.address.replace(/\n/g, ", ")}` : " — no forwarding address on file"}. The letter is flagged on the deposit until you mark it mailed.
        </Callout>
      ) : null}
      {p.letterHtml ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Disposition letter (preview)</p>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => openHtml(p.letterHtml)}>
              <Printer className="h-4 w-4" /> Open
            </Button>
          </div>
          <iframe title="Disposition letter preview" srcDoc={p.letterHtml} sandbox="" className="h-[320px] w-full rounded-lg border border-border bg-white" />
        </div>
      ) : (
        <p className="text-sm text-text-secondary">The revised letter and final statement are built from the ledger when you finish.</p>
      )}
      <p className="text-xs text-text-secondary">The final statement (move-in to move-out, with the deposit accounting) is built from the ledger when you finish; both are saved to the lease&apos;s Documents.</p>
      {p.rule || p.sources?.length ? (
        <div className="space-y-1.5 rounded-xl border border-border bg-surface-subtle p-4 text-sm">
          {p.rule ? (
            <p className="text-foreground">
              {p.rule.name || `${p.rule.jurisdictionCode} deposit rule`}
              {p.rule.citation ? <span className="text-text-secondary"> · {p.rule.citation}</span> : null}
            </p>
          ) : null}
          {(p.sources || []).map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-text-secondary hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" /> {s.title}
              {s.citation ? ` (${s.citation})` : ""}
            </a>
          ))}
          <p className="text-xs text-text-tertiary">{RULE_DISCLAIMER}</p>
        </div>
      ) : null}
    </div>
  );
}

const STEP_BODIES = { moveout: MoveOutStep, charges: ChargesStep, credits: CreditsStep, result: ResultStep, documents: DocumentsStep };

const needPreview = (v) => (!v.preview ? "Still working out the final account…" : null);
function chargesError(v) {
  const bad = (v.charges || []).find((c) => !String(c.label || "").trim() || !(Number(c.amount) > 0));
  if (bad) return "Give every charge a description and an amount, or remove it.";
  return needPreview(v);
}
function resultError(v) {
  if (!v.preview) return needPreview(v);
  if (!v.preview.committed && v.settlement === "write_off" && v.preview.plan?.balanceOwed > 0) return writeOffReasonProblem(v.writeOffReason, v.writeOffNote) || null;
  return null;
}
function commitError(v) {
  if (!v.preview) return needPreview(v);
  if (v.preview.committed && !v.canVoid) return NO_VOID;
  if (!v.preview.committed && !v.preview.canFinalize) return `The lease is ${v.preview.lease.status} — end it first.`;
  return null;
}

// The Final account wizard for an entity action (lease or deposit record) → { title, description, steps, finish, … }.
export function finalAccountWizard({ leaseId, depositId = null }) {
  const step = (key, title, validate, description) => ({
    key,
    title,
    description,
    validate,
    render: ({ values, set }) => {
      const Body = STEP_BODIES[key];
      return (
        <StepFrame leaseId={leaseId} values={values} set={set}>
          {(p) => <Body values={values} set={set} p={p} />}
        </StepFrame>
      );
    },
  });
  return {
    title: "Final account",
    description: "Closes the resident's account: final rent, move-out charges, credits, the deposit, the refund or balance, then the final statement and the deposit letter.",
    finishLabel: "Finish Final Account",
    logSummary: "Ran the final account",
    initial: () => ({}),
    steps: [
      step("moveout", "Move-out", needPreview),
      step("charges", "Charges", chargesError),
      step("credits", "Credits & deposit", needPreview),
      step("result", "Result", resultError),
      step("documents", "Documents & send", commitError),
    ],
    finish: async (v, ctx) => {
      const p = v.preview;
      const settlement = v.settlement || "open";
      const writeOff = settlement === "write_off" ? { writeOffReason: v.writeOffReason || "uncollectible", writeOffNote: (v.writeOffNote || "").trim() } : {};
      const body = { ...requestOf(v), refundMethod: v.refundMethod || "", sendEmail: v.sendEmail !== false && Boolean(v.email), settlement, ...writeOff, version: p.version };
      const res = p.committed ? await reviseFinalAccountApi(p.primaryDepositId || depositId, body) : await finalAccountApi(leaseId, { ...body, commit: true });
      if (!res.ok) {
        toast.error(res.error || "Couldn't finish the final account.");
        return false;
      }
      const r = res.result || {};
      toast.success(`${res.revisedFrom ? `Final account revised (version ${res.version})` : "Final account committed"} — deposit applied ${money2(r.applied)}; ${r.refund > 0 ? `refund ${money2(r.refund)} raised in Bills & Payables` : r.balanceOwed > 0 ? `${money2(r.balanceOwed)} still owed` : "nothing owed"}.`);
      if (res.mailRequired) toast.warning("Mail the final statement and deposit letter — they're flagged on the deposit until marked mailed.");
      else if (res.email?.status === "disabled") toast.info("The email wasn't sent: move-out statement emails are off in Notifications.");
      else if (res.email?.status && !["sent", "duplicate"].includes(res.email.status)) toast.warning(`The email wasn't sent (${res.email.status.replace(/_/g, " ")}).`);
      if (v.settlement === "plan" && r.balanceOwed > 0) toast.info("Set up the payment plan from the lease's Payment Plan tab.");
      if (r.writtenOff > 0) toast.info(`${money2(r.writtenOff)} written off to Bad Debt — it's listed under Delinquency › Written off.`);
      ctx.reload();
      return true;
    },
  };
}

export const canRunFinalAccount = (lease) => FINAL_ACCOUNT_STATUSES.includes(lease?.status);

// The deposit's Final Account tab: what was committed, the mail flag, and the letter and final statement from the ledger.
export function FinalAccountSection({ item, onCommitMeta }) {
  const soda = sodaOf(item);
  const committed = soda?.status === "Committed";
  const [docs, setDocs] = useState(null);
  const leaseId = item.leaseId;
  const version = soda?.version;
  useEffect(() => {
    if (!committed || !leaseId) return undefined;
    let alive = true;
    finalAccountDocsApi(leaseId).then((res) => alive && setDocs(res));
    return () => {
      alive = false;
    };
  }, [committed, leaseId, version]);
  const mailed = item.metadata?.letterMailedOn;
  const result = soda?.result || {};
  if (!committed) {
    return (
      <Callout tone="info">
        {soda?.status === "Draft" ? `Version ${soda.version} isn't finished yet — run Actions → Final account to complete it.` : "No final account yet. When the resident moves out, run Actions → Final account to apply the deposit and send the statement and letter."}
      </Callout>
    );
  }
  return (
    <div className="space-y-5">
      {soda.mailRequired && !mailed ? (
        <Callout
          tone="warning"
          icon={Mail}
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onCommitMeta({ letterMailedOn: new Date().toISOString().slice(0, 10) })}>
              Mark Mailed
            </Button>
          }
        >
          Mail the final statement and this letter{soda.forwarding?.address ? ` to ${soda.forwarding.address.replace(/\n/g, ", ")}` : ""}.
        </Callout>
      ) : null}
      <SummaryTiles
        items={[
          { label: "Deposit applied", value: money2(result.applied) },
          result.balanceOwed > 0
            ? { label: result.writtenOff > 0 ? "Balance owed · written off" : "Balance owed", value: money2(result.balanceOwed), className: result.writtenOff > 0 ? "text-foreground" : "text-red-600 dark:text-red-400" }
            : { label: "Refund", value: money2(result.refund) },
          { label: "Version", value: `${soda.version}${soda.committedAt ? ` · ${formatDate(String(soda.committedAt).slice(0, 10))}` : ""}` },
        ]}
      />
      <SectionCard
        title="Statement of deposit accounting"
        description={[soda.email?.status === "sent" ? `Emailed to ${soda.email.to}` : soda.email?.to ? `Email ${String(soda.email.status || "").replace(/_/g, " ")}` : "Not emailed", mailed ? `mailed ${formatDate(mailed)}` : ""].filter(Boolean).join(" · ")}
        action={
          docs?.ok ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => openHtml(docs.statementHtml)}>
                <Printer className="h-4 w-4" /> Final Statement
              </Button>
              <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => openHtml(docs.letterHtml)}>
                <Printer className="h-4 w-4" /> Letter
              </Button>
            </div>
          ) : null
        }
      >
        {!docs ? <Loading /> : !docs.ok ? <Callout tone="danger">{docs.error || "Couldn't load the letter."}</Callout> : <iframe title="Disposition letter" srcDoc={docs.letterHtml} sandbox="" className="h-[520px] w-full rounded-lg border border-border bg-white" />}
      </SectionCard>
    </div>
  );
}
