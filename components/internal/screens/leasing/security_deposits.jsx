"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Link2,
  Landmark,
  Scissors,
  Undo2,
  FileText,
  Clock,
  PiggyBank,
  Percent,
  Mail,
  CalendarClock,
  Loader2,
  Wand2,
  ReceiptText,
  ArrowRightLeft,
  BookOpen,
  Inbox,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Field, ListLoading, SectionCard, StatGrid, StatusPill } from "@/components/internal/shared/screen_kit";
import { chargeDepositApi, depositStatusApi, disposeDepositApi, recordDepositReceivedApi, sweepDepositApi } from "@/lib/billing/api";
import { interestRateFor, monthlyInterest } from "@/lib/billing/deposits_math";
import { makeLedgerSection } from "@/components/internal/screens/accounting/ledger_section";
import { BankAccountSelect } from "@/components/internal/screens/accounting/ledger_dialogs";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { usePermission } from "@/context/rbac-context";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { securityDepositsData } from "@/lib/supabase/security_deposits";
import { leasesLayer } from "@/lib/supabase/leases";
import { movesLayer } from "@/lib/supabase/moves";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import { addDays, leasePolicies, storeTextDocument, todayISO } from "@/lib/leasing/workflows";
import { makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { Callout, MetaRecords, makeMetaAwareFieldsSection } from "./sections/gated";
import { tenantJoinedLoader } from "./joins";
import {
  DEDUCTION_CATEGORY_OPTIONS,
  DEPOSIT_KIND_OPTIONS,
  DEPOSIT_OPEN_STATUSES,
  DEPOSIT_STATUS_MAP,
  REFUND_METHOD_OPTIONS,
  daysUntil,
  filterOptions,
  formatDate,
  metaList,
  money2,
  sumBy,
} from "./shared";

// Security Deposits over `property.security_deposits`: each deposit on the ledger (billed or received, moved, interest, disposed through AP; CORE-04), deductions, deadline and letter.

const NO_POST = "Your role can't post to the ledger.";
const deductionsOf = (r) => sumBy(metaList(r, "deductions"));
// Interest: the disposition's ledger figure once disposed, else the legacy recorded accrual.
const interestOf = (r) => Number(r?.metadata?.disposition?.interest ?? r?.metadata?.interestAccrued) || 0;
const onLedger = (r) => Boolean(r?.chargeEntryId);
const refundDue = (r) => Math.max(0, (Number(r.amount) || 0) + interestOf(r) - deductionsOf(r));
const isOpen = (r) => DEPOSIT_OPEN_STATUSES.includes(r.status);
const isOverdue = (r) => isOpen(r) && r.returnDue && daysUntil(r.returnDue) < 0;

function DeadlineBadge({ row }) {
  if (!row.returnDue) return <span className="text-text-tertiary">—</span>;
  if (!isOpen(row)) return <span className="text-sm text-muted-foreground">{formatDate(row.returnDue)}</span>;
  const d = daysUntil(row.returnDue);
  if (d < 0) return <Badge variant="danger">{-d}d overdue</Badge>;
  if (d <= 7) return <Badge variant="warning">Due in {d}d</Badge>;
  return <span className="text-sm text-muted-foreground">{formatDate(row.returnDue)}</span>;
}

// The deposit's ledger position (GET /api/billing/deposits/<id>) → { status, reload }.
function useDepositLedger(item) {
  const [status, setStatus] = useState(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    depositStatusApi(item.id).then((res) => alive && setStatus(res.ok ? res : { error: res.error || "Couldn't read the ledger." }));
    return () => {
      alive = false;
    };
  }, [item.id, item.chargeEntryId, item.applyEntryId, item.status, tick]);
  return { status, reload };
}

// Overview card: what the ledger holds for this deposit, what's unpaid, and deposit money still to move.
function LedgerCard({ item, reloadItem }) {
  const { status, reload } = useDepositLedger(item);
  const canPost = usePermission("accounting.post");
  const [busy, setBusy] = useState(false);
  if (!onLedger(item)) {
    return (
      <Callout tone="warning" icon={BookOpen}>
        Not on the ledger yet — use Actions → Bill deposit, or Record received outside the ledger for money collected before Geiger.
      </Callout>
    );
  }
  if (!status) return <ListLoading label="Loading the deposit ledger" className="py-6" />;
  if (status.error) return <Callout tone="danger">{status.error}</Callout>;
  const pending = (status.sweeps || []).reduce((s, r) => s + r.amount, 0);
  const move = async () => {
    setBusy(true);
    const res = await sweepDepositApi(item.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't move the deposit.");
    toast.success(`Moved ${money2(pending)} to ${status.regime?.depositBank?.name || "the deposit account"}.`);
    reload();
    reloadItem?.();
  };
  return (
    <SectionCard title="On the ledger" description={status.regime?.heldIn === "trust" ? "Held in trust" : "Held in the operating account"}>
      <div className="space-y-4">
        <StatGrid
          stats={[
            { label: "Held", value: money2(status.held), hint: "Security deposits (2100)" },
            { label: "Interest", value: money2(status.interest), hint: "Deposit interest payable (2110)" },
            { label: "Unpaid", value: money2(status.unpaid), hint: "Still owed on the deposit charge" },
            { label: "In deposit account", value: money2(status.cash), hint: status.regime?.depositBank?.name || "No deposit account" },
          ]}
        />
        {pending > 0 ? (
          <Callout
            tone="info"
            icon={ArrowRightLeft}
            action={
              <RoleGate allowed={canPost} reason={NO_POST}>
                <Button size="sm" variant="outline" className="border-border bg-surface-card" disabled={busy || !canPost} onClick={move}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Move {money2(pending)}
                </Button>
              </RoleGate>
            }
          >
            {money2(pending)} was paid into another account — move it to {status.regime?.depositBank?.name || "the deposit account"}.
          </Callout>
        ) : null}
        {status.regime?.warning ? <Callout tone="warning">{status.regime.warning}</Callout> : null}
        {status.refundBill ? (
          <p className="text-sm text-text-secondary">
            Refund bill “{status.refundBill.name}” · {money2(status.refundBill.amount)} · {status.refundBill.status}
            {status.refundBill.approval_status === "Pending" ? " · waiting for approval" : ""} — pay it in Bills & Payables.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

// Effective deposit policies via the linked lease (company → property → lease).
function useDepositPolicies(item) {
  const [policies, setPolicies] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const lease = item.leaseId ? await leasesLayer.get(item.leaseId) : null;
      const p = await leasePolicies(lease || { propertyId: item.propertyId });
      if (alive) setPolicies(p);
    })();
    return () => {
      alive = false;
    };
  }, [item.leaseId, item.propertyId]);
  return policies;
}

function DepositOverviewSection({ item, onReload }) {
  const d = daysUntil(item.returnDue);
  return (
    <div className="space-y-5">
      {isOverdue(item) ? (
        <Callout tone="danger">The return deadline passed {-d} days ago — send the disposition and refund now.</Callout>
      ) : isOpen(item) && item.returnDue ? (
        <Callout tone={d <= 7 ? "warning" : "info"}>Itemized disposition due by {formatDate(item.returnDue)} ({d} days).</Callout>
      ) : null}
      <StatGrid
        stats={[
          { label: "Deposit", value: money2(item.amount), hint: item.kind || "Security deposit" },
          { label: "Interest", value: money2(interestOf(item)), hint: item.metadata?.disposition ? "Paid with the refund" : "See the Interest tab" },
          { label: "Deductions", value: money2(deductionsOf(item)), hint: `${metaList(item, "deductions").length} items` },
          { label: item.returnedOn ? "Refunded" : "Refund due", value: money2(item.returnedOn ? item.refundAmount : refundDue(item)), hint: item.returnedOn ? formatDate(item.returnedOn) : "Deposit + interest − deductions" },
        ]}
      />
      <SectionCard>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          {[
            ["Tenant", item.tenantName],
            ["Unit", item.unit],
            ["Lease", item.leaseName],
            ["Held at", item.heldLocation],
            ["Received", formatDate(item.metadata?.receivedOn)],
            ["Move-out", formatDate(item.moveOutDate)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{k}</dt>
              <dd className="mt-1 truncate text-foreground">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <LedgerCard item={item} reloadItem={onReload} />
    </div>
  );
}

function InterestSection({ item, onPatch, onCommit, onCommitMeta }) {
  const policies = useDepositPolicies(item);
  const { status } = useDepositLedger(item);
  if (!policies) return <ListLoading label="Loading deposit policy" className="py-10" />;
  const override = item.metadata?.interestRateOverride;
  const hasOverride = override !== undefined && override !== null && override !== "";
  const rate = interestRateFor(item, policies);
  const principal = Math.max(0, (Number(status?.held) || 0) - (Number(status?.unpaid) || 0));
  const monthly = item.interestBearing ? monthlyInterest(principal, rate) : 0;
  const payout = policies.depositInterestPayout === "annual_credit" ? "credited to the resident's balance each January" : "paid with the refund at move-out";
  return (
    <div className="space-y-5">
      <SectionCard
        title="Interest on the ledger"
        description={
          item.interestBearing
            ? `${rate}% a year${hasOverride ? " (this deposit's rate)" : " from your deposit policy"} on the money held and paid · accrues on the last day of each month · ${payout}.`
            : "This deposit doesn't earn interest. Turn on Interest-bearing below if your jurisdiction or lease requires it."
        }
      >
        <StatGrid
          columns={3}
          stats={[
            { label: "Accrued (2110)", value: status ? money2(status.interest) : "…", hint: "Posted by the Deposit interest job" },
            { label: "Earning interest", value: status ? money2(principal) : "…", hint: "Held less anything unpaid" },
            { label: "Next month", value: money2(monthly), hint: item.interestBearing ? `${rate}% ÷ 12` : "Not interest-bearing" },
          ]}
        />
      </SectionCard>
      <SectionCard title="Settings">
        <FieldsForm
          item={item}
          fields={[
            { key: "interestBearing", label: "Interest-bearing", type: "switch", hint: "Only interest-bearing deposits accrue." },
            { key: "interestRateOverride", label: "Rate override", type: "percent", meta: true, hint: "Blank to use the policy rate." },
          ]}
          onPatch={onPatch}
          onCommit={onCommit}
          onCommitMeta={onCommitMeta}
        />
      </SectionCard>
    </div>
  );
}

const RETURN_FIELDS = [
  { key: "moveOutDate", label: "Move-out date", type: "date" },
  { key: "returnDue", label: "Return deadline", type: "date" },
  { key: "suggested", label: "Refund due", type: "readonly", format: (_v, r) => money2(refundDue(r)), hint: "Deposit + interest − deductions." },
  { key: "refundAmount", label: "Refund paid", type: "currency" },
  { key: "returnedOn", label: "Returned on", type: "date" },
  { key: "refundMethod", label: "Refund method", type: "select", meta: true, options: REFUND_METHOD_OPTIONS },
  { key: "checkNumber", label: "Check / reference #", type: "text", meta: true },
  { key: "amountOwedByTenant", label: "Balance owed by tenant", type: "readonly", format: (_v, r) => money2(Math.max(0, deductionsOf(r) - (Number(r.amount) || 0) - interestOf(r))) },
  { key: "forwardingAddress", label: "Forwarding address", type: "textarea", meta: true },
];

function ReturnSection(props) {
  const { item, onCommit } = props;
  const policies = useDepositPolicies(item);
  const days = Number(policies?.depositReturnDays) || 30;
  return (
    <div className="space-y-5">
      {item.moveOutDate && !item.returnDue ? (
        <Callout
          tone="info"
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onCommit({ returnDue: addDays(item.moveOutDate, days) })}>
              <CalendarClock className="h-4 w-4" /> Set Deadline
            </Button>
          }
        >
          Your policy gives {days} days after move-out — deadline {formatDate(addDays(item.moveOutDate, days))}.
        </Callout>
      ) : null}
      <SectionCard title="Return">
        <FieldsForm item={item} fields={RETURN_FIELDS} onPatch={props.onPatch} onCommit={props.onCommit} onCommitMeta={props.onCommitMeta} />
      </SectionCard>
    </div>
  );
}

// Disposition preview (POST /dispose, commit:false): deductions, the apply, the refund bill and the release.
function DisposePreview({ item }) {
  const [res, setRes] = useState(null);
  useEffect(() => {
    let alive = true;
    disposeDepositApi(item.id, { commit: false }).then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [item.id]);
  if (!onLedger(item)) return <Callout tone="warning">This deposit isn&apos;t on the ledger — bill it or record it received before disposing it.</Callout>;
  if (!res) return <ListLoading label="Working out the disposition" className="py-6" />;
  if (!res.ok) return <Callout tone="danger">{res.error}</Callout>;
  const p = res.preview;
  const rows = [
    ["Held", money2(p.balance?.held)],
    ["Interest", money2(p.balance?.interest)],
    ...p.deductions.map((d) => [`Deduction · ${d.label}`, money2(d.amount)]),
    ...p.skipped.map((d) => [`${d.label} (already an open charge)`, money2(d.amount)]),
    ["Open charges before the deductions", money2(p.openBefore)],
    ["Applied to charges", money2(p.applied)],
    ["Refund (bill in Accounts Payable)", money2(p.refund)],
    ["Still owed by the resident", money2(p.balanceOwed)],
  ];
  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="tabular-nums text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {p.release ? (
        <p className="text-xs text-text-secondary">
          {p.release > 0 ? `${money2(p.release)} of deposit money goes back from the deposit account to operating trust.` : `${money2(-p.release)} moves from operating trust to the deposit account to fund the refund.`}
        </p>
      ) : null}
      {p.regime?.warning ? <Callout tone="warning">{p.regime.warning}</Callout> : null}
    </div>
  );
}

function dispositionText(r) {
  const deds = metaList(r, "deductions");
  const lines = [
    formatDate(todayISO()),
    "",
    `To: ${r.tenantName || "Tenant"}`,
    r.metadata?.forwardingAddress || "",
    "",
    `RE: Security deposit itemization — ${r.unit || r.leaseName || ""}`,
    "",
    `Move-out date: ${formatDate(r.moveOutDate)}`,
    "",
    `Deposit held:            ${money2(r.amount)}`,
    `Interest accrued:        ${money2(interestOf(r))}`,
    "",
    "Itemized deductions:",
    ...(deds.length ? deds.map((d) => `  • ${d.label}${d.category ? ` (${d.category})` : ""}: ${money2(d.amount)}${d.notes ? ` — ${d.notes}` : ""}`) : ["  None"]),
    `Total deductions:        ${money2(deductionsOf(r))}`,
    "",
    `Amount refunded:         ${money2(r.returnedOn ? r.refundAmount : refundDue(r))}`,
  ];
  const owed = deductionsOf(r) - (Number(r.amount) || 0) - interestOf(r);
  if (owed > 0) lines.push(`Balance you owe:         ${money2(owed)}`);
  lines.push("", r.metadata?.refundMethod ? `Refund sent by ${r.metadata.refundMethod}${r.metadata?.checkNumber ? ` #${r.metadata.checkNumber}` : ""}.` : "", "", "Management");
  return lines.join("\n");
}

function LetterSection({ item, onCommitMeta }) {
  const [busy, setBusy] = useState(false);
  const text = dispositionText(item);
  const save = async () => {
    setBusy(true);
    const doc = await storeTextDocument({ ownerType: "deposit", ownerId: item.id, kind: "deposit_disposition", name: `${item.name || "Deposit"} — disposition`, text });
    setBusy(false);
    if (!doc) {
      toast.error("Couldn't save the letter.");
      return;
    }
    await onCommitMeta({ letterSentOn: todayISO(), letterUrl: doc.url });
    toast.success("Disposition letter saved to Documents.");
  };
  return (
    <SectionCard
      title="Disposition letter"
      description={item.metadata?.letterSentOn ? `Last saved ${formatDate(item.metadata.letterSentOn)}.` : "The itemized statement the tenant receives."}
      action={
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Save as Document
        </Button>
      }
    >
      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground">{text}</pre>
    </SectionCard>
  );
}

const DEDUCTION_FIELDS = [
  { key: "label", label: "Description", type: "text", required: true, placeholder: "e.g. Carpet cleaning — bedroom 2" },
  { key: "category", label: "Category", type: "select", options: DEDUCTION_CATEGORY_OPTIONS },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "invoiceNumber", label: "Invoice / receipt #", type: "text" },
  { key: "notes", label: "Notes", type: "textarea", full: true },
];

function DeductionsSection({ item, config, onCommitMeta }) {
  return (
    <MetaRecords
      item={item}
      config={config}
      onCommitMeta={onCommitMeta}
      field="deductions"
      fields={DEDUCTION_FIELDS}
      singular="Deduction"
      icon={Scissors}
      defaults={() => ({ category: "Cleaning" })}
      emptyDescription="Itemize every charge against the deposit — the move-out inspection comparison can add them for you."
      summary={(d) => ({
        title: d.label,
        meta: [d.category, d.invoiceNumber ? `#${d.invoiceNumber}` : null, d.inspectionId ? "From inspection" : null, d.notes].filter(Boolean).join(" · "),
        aside: money2(d.amount),
      })}
    />
  );
}

async function moveOptions() {
  const rows = (await movesLayer.list({ kind: "out" })) ?? [];
  return rows.map((m) => ({ value: m.id, label: `${m.name || "Move-out"} · ${formatDate(m.moveDate)}`, patch: {} }));
}

// Lease options for the create dialog, carrying the lease's deposit as the amount.
async function depositLeaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: l.deposit ? `${l.name} — ${money2(l.deposit)}` : l.name || "Lease",
    patch: {
      leaseName: l.name || "",
      unitId: l.unitId || "",
      unit: l.unit || "",
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      propertyId: l.propertyId || "",
      amount: Number(l.deposit) || 0,
    },
  }));
}

const depositsConfig = {
  key: "deposit",
  singular: "Deposit",
  plural: "Deposits",
  title: "Security Deposits",
  description:
    "Every deposit you hold — where it's held, interest accrued, itemized deductions, and the return deadline after move-out.",
  icon: PiggyBank,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName", "leaseName"],
  data: securityDepositsData,
  rowsLoader: tenantJoinedLoader(securityDepositsData),
  // A copy isn't on the ledger: the server-written links and the disposition stay with the original.
  prepareDuplicate: (copy) => {
    const { disposition: _d, ...metadata } = copy.metadata || {};
    return { ...copy, status: "Pending", chargeEntryId: "", applyEntryId: "", refundBillId: "", returnedOn: "", refundAmount: 0, metadata };
  },

  statusMap: DEPOSIT_STATUS_MAP,
  statusFilterOptions: filterOptions(DEPOSIT_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "held", label: "Held", filter: (r) => r.status === "Held" || r.status === "Pending" },
    { value: "awaiting", label: "Awaiting disposition", filter: (r) => r.status === "Awaiting disposition" || (isOpen(r) && Boolean(r.moveOutDate)) },
    { value: "overdue", label: "Overdue", filter: isOverdue },
    { value: "closed", label: "Closed", filter: (r) => !isOpen(r) },
  ],

  exportColumns: [
    { header: "Deposit", key: "name" },
    { header: "Tenant", key: "tenantName" },
    { header: "Unit", key: "unit" },
    { header: "Kind", key: "kind" },
    { header: "Status", key: "status" },
    { header: "Return by", key: "returnDue", type: "date" },
    { header: "Deductions", value: (r) => deductionsOf(r), type: "money" },
    { header: "Amount", key: "amount", type: "money" },
    { header: "On the ledger", value: (r) => onLedger(r), type: "bool" },
  ],

  columns: [
    {
      key: "name",
      header: "Deposit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit, r.kind !== "Security deposit" ? r.kind : null, onLedger(r) ? null : "Not on the ledger"].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={DEPOSIT_STATUS_MAP} />,
    },
    { key: "returnDue", header: "Return by", render: (r) => <DeadlineBadge row={r} /> },
    {
      key: "deductions",
      header: "Deductions",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (deductionsOf(r) ? money2(deductionsOf(r)) : "—"),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => money2(r.amount),
    },
  ],

  stats: (rows) => {
    const held = rows.filter(isOpen);
    const total = held.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const overdue = rows.filter(isOverdue).length;
    const awaiting = rows.filter((r) => isOpen(r) && r.moveOutDate).length;
    return [
      { label: "Deposits held", value: String(held.length), footer: `${rows.length} total` },
      { label: "Total held", value: money2(total), footer: "Liability on the books" },
      { label: "Awaiting disposition", value: String(awaiting), footer: "Moved out, not yet returned" },
      { label: "Overdue", value: String(overdue), footer: "Past the return deadline" },
    ];
  },

  createDraft: { name: "", leaseId: "", amount: "" },
  createFields: [
    { key: "name", label: "Deposit label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "amount", label: "Amount", type: "number", placeholder: "0" },
  ],
  loadCreateOptions: async () => ({ leases: await depositLeaseOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    leaseName: draft.leaseName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    propertyId: draft.propertyId || "",
    amount: Number(draft.amount) || 0,
    kind: "Security deposit",
    status: "Pending",
    metadata: { depositKind: "Security deposit" },
  }),

  headerMeta: (r) => [r.tenantName, r.unit, money2(r.amount), r.returnDue && isOpen(r) ? `Return by ${formatDate(r.returnDue)}` : null].filter(Boolean).join(" · "),

  actions: (record) => [
    {
      key: "bill",
      label: "Bill deposit",
      icon: ReceiptText,
      permission: "accounting.post",
      showIf: (i) => isOpen(i) && !onLedger(i) && Boolean(i.leaseId) && Number(i.amount) > 0,
      run: async ({ item, reload }) => {
        const res = await chargeDepositApi(item.id);
        if (!res.ok) return toast.error(res.error || "Couldn't bill the deposit.");
        toast.success(res.linked ? "Linked to the deposit already on the ledger." : `Billed ${money2(item.amount)} to the lease ledger.`);
        reload();
      },
    },
    {
      key: "received",
      label: "Record received outside the ledger",
      icon: Inbox,
      permission: "accounting.post",
      showIf: (i) => isOpen(i) && !onLedger(i) && Boolean(i.leaseId) && Number(i.amount) > 0,
      wizard: {
        title: "Record deposit received",
        description: "For money collected before Geiger (opening balances, takeovers): posts it to the bank it landed in, with no charge to the resident.",
        finishLabel: "Record Deposit",
        logSummary: "Recorded the deposit as received",
        initial: (r) => ({ date: r.metadata?.receivedOn || todayISO(), bankAccountId: "" }),
        steps: [
          {
            key: "where",
            title: "Received",
            fields: [{ key: "date", label: "Received on", type: "date", required: true }],
            render: ({ values, set }) => (
              <Field label="Landed in" htmlFor="dep-recv-bank">
                <BankAccountSelect id="dep-recv-bank" value={values.bankAccountId} onChange={(v) => set({ bankAccountId: v })} defaultLabel="Per your deposit policy" />
              </Field>
            ),
          },
        ],
        finish: async (v, ctx) => {
          const res = await recordDepositReceivedApi(ctx.item.id, { bankAccountId: v.bankAccountId || undefined, date: v.date });
          if (!res.ok) {
            toast.error(res.error || "Couldn't record the deposit.");
            return false;
          }
          if (res.warning) toast.warning(res.warning);
          toast.success(res.linked ? "Linked to the deposit already on the ledger." : `Recorded ${money2(ctx.item.amount)} as received.`);
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "sweep",
      label: "Move to deposit account",
      icon: ArrowRightLeft,
      permission: "accounting.post",
      showIf: (i) => isOpen(i) && onLedger(i),
      run: async ({ item, reload }) => {
        const res = await sweepDepositApi(item.id);
        if (!res.ok) return toast.error(res.error || "Couldn't move the deposit.");
        const moved = (res.entries || []).filter((e) => e.created).reduce((s, e) => s + (Number(e.amount) || 0), 0);
        if (moved > 0) toast.success(`Moved ${money2(moved)} to the deposit account.`);
        else toast.info("Nothing to move — every payment on this deposit is already in the deposit account.");
        reload();
      },
    },
    {
      key: "deadline",
      label: "Set return deadline",
      icon: CalendarClock,
      showIf: isOpen,
      wizard: {
        title: "Set return deadline",
        description: "Counted from the move-out date using your deposit policy.",
        finishLabel: "Save Deadline",
        logSummary: "Set the deposit return deadline",
        initial: (r) => ({ moveOutDate: r.moveOutDate || todayISO() }),
        steps: [{ key: "dates", title: "Dates", fields: [{ key: "moveOutDate", label: "Move-out date", type: "date", required: true }, { key: "days", label: "Return within (days)", type: "number", placeholder: "Your deposit policy" }] }],
        finish: async (v, ctx) => {
          const lease = ctx.item.leaseId ? await leasesLayer.get(ctx.item.leaseId) : null;
          const days = Number(v.days) || Number((await leasePolicies(lease || { propertyId: ctx.item.propertyId })).depositReturnDays) || 30;
          const ok = await ctx.commit({ moveOutDate: v.moveOutDate, returnDue: addDays(v.moveOutDate, days), status: "Awaiting disposition" });
          if (ok) toast.success(`Return deadline set to ${formatDate(addDays(v.moveOutDate, days))}.`);
          return ok;
        },
      },
    },
    {
      key: "return",
      label: "Dispose deposit",
      icon: Undo2,
      permission: "accounting.post",
      showIf: isOpen,
      wizard: {
        title: "Dispose deposit",
        description: "Charges the deductions, applies the deposit (and interest) to open charges oldest first, and raises the refund as a bill payable to the resident.",
        finishLabel: "Dispose",
        logSummary: "Disposed the deposit",
        initial: (r) => ({ refundMethod: r.metadata?.refundMethod || "Check", saveLetter: true }),
        steps: [
          {
            key: "review",
            title: "Review",
            description: "Deductions come from the Deductions tab; unpaid rent is already an open charge, so it isn't charged again.",
            render: () => <DisposePreview item={record} />,
            validate: () => (onLedger(record) ? null : "Put the deposit on the ledger first."),
          },
          {
            key: "refund",
            title: "Refund",
            fields: [
              { key: "refundMethod", label: "Refund by", type: "select", options: REFUND_METHOD_OPTIONS.filter((o) => o.value !== "Applied to balance") },
              { key: "saveLetter", label: "Save the disposition letter to Documents", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const res = await disposeDepositApi(ctx.item.id, { commit: true });
          if (!res.ok) {
            toast.error(res.error || "Couldn't dispose the deposit.");
            return false;
          }
          await ctx.commitMeta({ refundMethod: v.refundMethod || "" });
          const refund = Number(res.disposition?.refund) || 0;
          if (v.saveLetter) {
            const next = { ...ctx.item, status: res.status, refundAmount: refund, returnedOn: res.disposition?.date, metadata: { ...(ctx.item.metadata || {}), refundMethod: v.refundMethod, disposition: res.disposition } };
            await storeTextDocument({ ownerType: "deposit", ownerId: ctx.item.id, kind: "deposit_disposition", name: `${ctx.item.name || "Deposit"} — disposition`, text: dispositionText(next) });
          }
          if (res.postError) toast.error(`Refund bill saved, but not posted to AP: ${res.postError}`);
          else if (res.pendingApproval) toast.info(`Refund bill of ${money2(refund)} is waiting for approval in Bills & Payables.`);
          toast.success(refund > 0 ? `Deposit disposed — refund bill of ${money2(refund)} raised.` : `Deposit applied to charges${res.disposition?.balanceOwed ? ` — ${money2(res.disposition.balanceOwed)} still owed` : ""}.`);
          ctx.reload();
          return true;
        },
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Amount, interest, deductions, refund, and deadline." },
        { key: "links", label: "Links", icon: Link2, desc: "The lease, unit, tenant, and move-out this deposit belongs to." },
      ],
    },
    {
      group: "Deposit",
      items: [
        { key: "holding", label: "Amount & Holding", icon: Landmark, desc: "Amount, kind, and where it's held." },
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Every posting for this deposit, with what's held." },
        { key: "interest", label: "Interest", icon: Percent, desc: "Interest accrued on the ledger at the policy or override rate." },
        { key: "deductions", label: "Deductions", icon: Scissors, desc: "Itemized charges against the deposit." },
        { key: "refund", label: "Return", icon: Undo2, desc: "Deadline, refund, and forwarding address. Dispose from Actions." },
        { key: "letter", label: "Disposition Letter", icon: Mail, desc: "The itemized statement for the tenant." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Receipts, letters, and statements." },
        { key: "notes", label: "Notes", icon: FileText, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this deposit." },
      ],
    },
  ],
  sections: {
    overview: DepositOverviewSection,
    ledger: makeLedgerSection({ scope: "deposit", emptyDescription: "Billing, payments moved to the deposit account, interest, the apply and the refund bill appear here." }),
    links: makeMetaAwareFieldsSection([
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, displayKey: "leaseName", full: true },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "moveId", label: "Move-out", type: "relation", load: moveOptions },
    ]),
    holding: makeMetaAwareFieldsSection([
      { key: "amount", label: "Amount", type: "currency", disabled: onLedger, hint: "Locked once the deposit is on the ledger." },
      { key: "kind", label: "Kind", type: "select", options: DEPOSIT_KIND_OPTIONS },
      { key: "heldLocation", label: "Held at", type: "text", placeholder: "e.g. First National — Trust acct" },
      { key: "receivedOn", label: "Received on", type: "date", meta: true },
      { key: "receiptNumber", label: "Receipt #", type: "text", meta: true },
      { key: "status", label: "Status", type: "select", options: filterOptions(DEPOSIT_STATUS_MAP).slice(1) },
    ]),
    interest: InterestSection,
    deductions: DeductionsSection,
    refund: ReturnSection,
    letter: LetterSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this deposit…" }),
    activity: ActivitySection,
  },
};

export function SecurityDepositsScreen() {
  return <EntityListScreen config={depositsConfig} />;
}

export default SecurityDepositsScreen;
